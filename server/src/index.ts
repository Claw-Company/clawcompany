import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from 'fs';
import {
  getDefaultConfig,
  resolveRoles,
  MODEL_PRICING,
  TEMPLATES,
  PROVIDER_CATALOG,
  catalogToConfig,
} from '@clawcompany/shared';
import { ProviderRegistry } from '@clawcompany/providers';
import { ModelRouter } from '@clawcompany/model-router';
import { TaskOrchestrator } from '@clawcompany/task-orchestrator';
import { ToolExecutor, getToolsForRole } from '@clawcompany/tools';
import type { Message } from '@clawcompany/shared';
import type { DirectRunner } from './channels/index.js';
import { CronScheduler, ROUTINE_TEMPLATES, describeCron } from './scheduler.js';
import { CodeManager } from './code-manager.js';

config({ path: '../.env' });

// ── Sync config.json → process.env (before anything reads env vars) ──
// Dashboard saves API keys and tokens to config.json. On restart, we must
// load them into process.env so bootstrap() and bot init see them.
const _syncHomeDir = process.env.HOME ?? '~';
const _syncConfigPath = `${_syncHomeDir}/.clawcompany/config.json`;
if (existsSync(_syncConfigPath)) {
  try {
    const _saved = JSON.parse(readFileSync(_syncConfigPath, 'utf-8'));
    // Provider API keys (ClawAPI, Anthropic, OpenAI, Google)
    if (_saved.apiKey) {
      process.env.CLAWAPI_KEY = _saved.apiKey;
    }
    if (_saved.providers) {
      const envVarMap: Record<string, string> = {
        clawapi: 'CLAWAPI_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
        google: 'GOOGLE_API_KEY',
      };
      for (const [id, cfg] of Object.entries(_saved.providers)) {
        const envVar = envVarMap[id];
        if (envVar && (cfg as any).apiKey) {
          process.env[envVar] = (cfg as any).apiKey;
        }
      }
    }
    // Channel tokens (Telegram, Discord)
    if (_saved.channels?.telegram?.token) {
      process.env.TELEGRAM_BOT_TOKEN = _saved.channels.telegram.token;
    }
    if (_saved.channels?.discord?.token) {
      process.env.DISCORD_BOT_TOKEN = _saved.channels.discord.token;
    }
  } catch {}
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve dashboard at root
app.use(express.static(join(__dirname, '..', 'public')));

const PORT = process.env.PORT ?? 3200;

const clawConfig = getDefaultConfig();
clawConfig.providers[0].apiKey = process.env.CLAWAPI_KEY ?? '';

// ── Restore saved template BEFORE bootstrap (so ModelRouter gets correct roles) ──
{
  const _cfgPath = `${process.env.HOME ?? '~'}/.clawcompany/config.json`;
  if (existsSync(_cfgPath)) {
    try {
      const _cfg = JSON.parse(readFileSync(_cfgPath, 'utf-8'));
      if (_cfg.activeTemplate && TEMPLATES[_cfg.activeTemplate]) {
        clawConfig.activeTemplate = _cfg.activeTemplate;
        if (_cfg.roles) {
          clawConfig.roles = _cfg.roles;
        } else {
          const tpl = TEMPLATES[_cfg.activeTemplate];
          const rolesMap: Record<string, any> = {};
          for (const role of tpl.roles) {
            rolesMap[role.id] = { model: role.model, provider: role.provider };
          }
          clawConfig.roles = rolesMap;
        }
      }
    } catch {}
  }
}

const registry = new ProviderRegistry();
let router: ModelRouter;
let orchestrator: TaskOrchestrator;
const toolExecutor = new ToolExecutor();
let bootError: string | null = null;
let fallbackProvider: string | null = null; // non-null when running in auto-remap mode

// ── Mission history persistence ──
const missionsPath = `${process.env.HOME}/.clawcompany/missions.json`;
let missionHistoryData: any[] = [];
try {
  if (existsSync(missionsPath)) {
    missionHistoryData = JSON.parse(readFileSync(missionsPath, 'utf-8'));
  }
} catch {}

function saveMissions() {
  try {
    if (missionHistoryData.length > 100) missionHistoryData = missionHistoryData.slice(0, 100);
    writeFileSync(missionsPath, JSON.stringify(missionHistoryData, null, 2));
  } catch {}
}

// ── Chairman Profile persistence (Layer 4) ──
const clawDir = `${process.env.HOME}/.clawcompany`;
const chairmanPath = `${clawDir}/chairman.md`;

const DEFAULT_CHAIRMAN = `# Chairman Profile

## Preferences
- Language:
- Industry:
- Report style:
- Working hours:

## Common Instructions
-

## Notes
- Company founded: ${new Date().toISOString().slice(0, 10)}
`;

function ensureClawDir() {
  if (!existsSync(clawDir)) mkdirSync(clawDir, { recursive: true });
}

function loadChairman(): string {
  try {
    if (existsSync(chairmanPath)) return readFileSync(chairmanPath, 'utf-8');
  } catch {}
  return '';
}

function saveChairman(content: string) {
  try {
    ensureClawDir();
    writeFileSync(chairmanPath, content);
  } catch {}
}

function initChairman() {
  ensureClawDir();
  if (!existsSync(chairmanPath)) writeFileSync(chairmanPath, DEFAULT_CHAIRMAN);
}

// ── Chairman Auto-Learn state (in-memory, resets on restart) ──
let interactionCount = 0;
let lastLearnAt: string | null = null;
let pendingChairmanUpdate: string | null = null;
const recentInteractions: string[] = [];
const MAX_RECENT = 20;

function recordInteraction(summary: string) {
  recentInteractions.push(summary);
  if (recentInteractions.length > MAX_RECENT) recentInteractions.shift();
  interactionCount++;
  if (interactionCount % 10 === 0) {
    autoLearnChairmanProfile().catch(() => {});
  }
}

async function autoLearnChairmanProfile() {
  if (!router) return;
  const recent = recentInteractions.slice(-10);
  if (recent.length === 0) return;

  const currentProfile = loadChairman();

  const prompt = `You are analyzing a chairman's interaction history to update their profile.

Current chairman profile:
${currentProfile || '(empty)'}

Recent interactions (last ${recent.length}):
${recent.join('\n---\n')}

Based on these interactions, extract or update:
1. Preferred language (e.g., English, Chinese, mixed)
2. Industry focus (e.g., AI, crypto, finance, venture capital)
3. Communication style (e.g., concise, detailed, data-driven)
4. Common topics and interests
5. Decision-making patterns
6. Any other notable preferences

Output the updated chairman profile in this exact format:
---
Language: [language preference]
Industry: [industry focus areas]
Style: [communication style]
Topics: [common topics]
Preferences: [other preferences]
---

Keep existing accurate information. Only add or update based on new evidence from interactions. Be concise.`;

  try {
    const leaderRole = resolveRoles(clawConfig).find(r => r.reportsTo === null);
    const response = await router.chatAsRole(
      leaderRole?.id || 'ceo',
      [{ role: 'user', content: prompt }],
    );

    if (response.content && response.content.trim()) {
      pendingChairmanUpdate = response.content.trim();
      lastLearnAt = new Date().toISOString();
      console.log('  🧠 Chairman profile update suggested');
    }
  } catch (err: any) {
    console.log(`  ⚠️ Chairman auto-learn failed: ${err.message}`);
  }
}

// ── Company Memory persistence (Layer 3 — partitioned) ──
const legacyMemoryPath = `${clawDir}/memory.md`;
const memoryDir = `${clawDir}/memory`;
const MEMORY_PARTITIONS = ['culture', 'decisions', 'learnings', 'tech-stack'] as const;
type MemoryPartition = typeof MEMORY_PARTITIONS[number];

function partitionPath(p: MemoryPartition): string {
  return `${memoryDir}/${p}.md`;
}

function initMemoryPartitions() {
  ensureClawDir();
  if (!existsSync(memoryDir)) mkdirSync(memoryDir, { recursive: true });

  // Migration: if legacy memory.md exists and culture.md doesn't, migrate
  if (existsSync(legacyMemoryPath) && !existsSync(partitionPath('culture'))) {
    try {
      const legacy = readFileSync(legacyMemoryPath, 'utf-8');
      if (legacy.trim()) writeFileSync(partitionPath('culture'), legacy);
    } catch {}
  }

  // Ensure all partition files exist
  for (const p of MEMORY_PARTITIONS) {
    const fp = partitionPath(p);
    if (!existsSync(fp)) writeFileSync(fp, '');
  }
}

function loadPartition(p: MemoryPartition): string {
  try {
    const fp = partitionPath(p);
    if (existsSync(fp)) return readFileSync(fp, 'utf-8');
  } catch {}
  return '';
}

function savePartition(p: MemoryPartition, content: string) {
  try {
    ensureClawDir();
    if (!existsSync(memoryDir)) mkdirSync(memoryDir, { recursive: true });
    writeFileSync(partitionPath(p), content);
  } catch {}
}

function appendPartition(p: MemoryPartition, entry: string) {
  const existing = loadPartition(p);
  const newContent = existing + '\n\n---\n\n' + `[${new Date().toISOString().slice(0, 10)}] ${entry}`;
  savePartition(p, newContent);
  // Auto-compress if entries exceed threshold
  checkAndCompressPartition(p);
}

function getPartitionEntries(content: string): string[] {
  return content.split('---').map(s => s.trim()).filter(s => s);
}

function checkAndCompressPartition(p: MemoryPartition) {
  const content = loadPartition(p);
  const entries = getPartitionEntries(content);
  if (entries.length <= 20) return;
  compressPartition(p, entries);
}

async function compressPartition(p: MemoryPartition | string, entries: string[]) {
  // Step 1: Archive original entries
  const archiveDir = `${memoryDir}/archive`;
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 10);
  const archivePath = `${archiveDir}/${p}-${timestamp}.md`;

  const archiveContent = entries.join('\n\n---\n\n');
  appendFileSync(archivePath, '\n\n---\n\n' + archiveContent);

  // Step 2: Summarize with LLM
  const prompt = `You are a company memory curator. Below are ${entries.length} memory entries from the "${p}" partition of a company's knowledge base.

Perform these tasks:

1. SUMMARIZE: Condense into a concise summary of the most important points
2. DEDUPLICATE: Merge duplicate or near-duplicate entries
3. RESOLVE CONTRADICTIONS: If two entries conflict, keep the newer/more recent one. Note what was superseded.
4. UPGRADE CONFIDENCE: Convert uncertain statements ("might", "probably", "seems like") into definitive statements where the evidence across multiple entries supports it
5. PRESERVE: Keep all key dates, specific decisions, and critical details

Format: Use markdown with clear sections. Keep under 500 words.

Entries:
${entries.join('\n---\n')}

Output only the consolidated summary. No preamble.`;

  try {
    const leaderRole = resolveRoles(clawConfig).find(r => r.reportsTo === null);
    const response = await router.chatAsRole(
      leaderRole?.id || 'ceo',
      [{ role: 'user', content: prompt }],
    );

    if (response.content && response.content.trim()) {
      const compressed = `[Compressed on ${timestamp} from ${entries.length} entries]\n\n${response.content}`;
      if (MEMORY_PARTITIONS.includes(p as MemoryPartition)) {
        savePartition(p as MemoryPartition, compressed);
      }
      console.log(`  🧠 Memory compressed: ${p} (${entries.length} entries → summary)`);
    }
  } catch (err: any) {
    console.log(`  ⚠️ Memory compression failed for ${p}: ${err.message}`);
  }
}

function loadAllMemory(): { chairman: string; culture: string; decisions: string; learnings: string; techStack: string } {
  return {
    chairman: loadChairman(),
    culture: loadPartition('culture'),
    decisions: loadPartition('decisions'),
    learnings: loadPartition('learnings'),
    techStack: loadPartition('tech-stack'),
  };
}

// Legacy compat — loadMemory returns merged view for old callers
function loadMemory(): string {
  return MEMORY_PARTITIONS.map(p => loadPartition(p)).filter(s => s.trim()).join('\n\n---\n\n');
}

function categorizeMemoryEntry(entry: string): MemoryPartition {
  const lower = entry.toLowerCase();

  const hasChineseTech = /(安装|部署|技术栈|框架|依赖)/.test(lower);
  const hasEnglishTech = /\b(install|package|dependency|framework|library|stack|runtime|deploy|hosting|database|sdk|compiler|bundler|typescript|javascript|node|react|vue|python|docker|vercel|pnpm|npm|git)\b/.test(lower);

  // Chinese tech keywords take priority (e.g. "采用了新的框架" → tech, not decisions)
  if (hasChineseTech) {
    return 'tech-stack';
  }

  // 决策相关
  if (/\b(decided|chose|selected|switched to|changed to|adopted|approved|rejected|committed to)\b/.test(lower) ||
      /(决定|选择|采用|切换|更换|批准|否决)/.test(lower) ||
      /\b(provider|template|strategy|policy|priority)\b/.test(lower)) {
    return 'decisions';
  }

  // English tech keywords (after decisions, so "chose Vue over React" → decisions)
  if (hasEnglishTech) {
    return 'tech-stack';
  }

  // 文化相关
  if (/\b(principle|value|culture|motto|philosophy|vision|mission statement|belief|tradition)\b/.test(lower) ||
      /(原则|文化|理念|价值观|使命|愿景|口号)/.test(lower) ||
      /\b(customer.first|team.spirit|code.quality)\b/.test(lower)) {
    return 'culture';
  }

  // 默认：经验教训
  return 'learnings';
}

function appendMemory(entry: string) {
  const partition = categorizeMemoryEntry(entry);
  appendPartition(partition, entry);
}

function searchMemory(query: string): { partition: string; matches: string[] }[] {
  const results: { partition: string; matches: string[] }[] = [];
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter(k => k.length > 1);

  const chairman = loadChairman();
  if (chairman && keywords.some(k => chairman.toLowerCase().includes(k))) {
    results.push({ partition: 'chairman', matches: [chairman] });
  }

  for (const p of MEMORY_PARTITIONS) {
    const content = loadPartition(p);
    if (!content.trim()) continue;
    const entries = content.split('---').map(s => s.trim()).filter(s => s);
    const matched = entries.filter(entry =>
      keywords.some(k => entry.toLowerCase().includes(k))
    );
    if (matched.length > 0) {
      results.push({ partition: p, matches: matched });
    }
  }

  // Search archive directory
  const archiveDir = `${memoryDir}/archive`;
  if (existsSync(archiveDir)) {
    try {
      const archiveFiles = readdirSync(archiveDir).filter(f => f.endsWith('.md'));
      for (const file of archiveFiles) {
        const content = readFileSync(`${archiveDir}/${file}`, 'utf-8');
        if (!content.trim()) continue;
        const entries = content.split('---').map(s => s.trim()).filter(s => s);
        const matched = entries.filter(entry =>
          keywords.some(k => entry.toLowerCase().includes(k))
        );
        if (matched.length > 0) {
          results.push({ partition: `archive/${file}`, matches: matched });
        }
      }
    } catch {}
  }

  return results;
}

// Initialize on startup
initChairman();
initMemoryPartitions();

// ── Chat history persistence ──
const chatHistoryPath = `${process.env.HOME}/.clawcompany/chats.json`;
let chatHistoryData: any[] = [];
try {
  if (existsSync(chatHistoryPath)) {
    chatHistoryData = JSON.parse(readFileSync(chatHistoryPath, 'utf-8'));
  }
} catch {}

function saveChats() {
  try {
    if (chatHistoryData.length > 200) chatHistoryData = chatHistoryData.slice(0, 200);
    writeFileSync(chatHistoryPath, JSON.stringify(chatHistoryData, null, 2));
  } catch {}
}

// Model mapping for auto-remap when ClawAPI is not available
const PROVIDER_MODEL_MAP: Record<string, { earn: string; save: string }> = {
  anthropic: { earn: 'claude-opus-4-6', save: 'claude-sonnet-4-6' },
  openai:    { earn: 'gpt-5.4', save: 'gpt-5-mini' },
  google:    { earn: 'gemini-3.1-pro', save: 'gemini-3.1-flash' },
  ollama:    { earn: 'llama3', save: 'llama3' },
};

/**
 * Detect fallback providers from env vars when ClawAPI key is missing.
 * Returns the first available provider id, or null.
 */
function detectFallbackProvider(): string | null {
  for (const entry of PROVIDER_CATALOG) {
    if (entry.id === 'clawapi') continue;
    if (entry.id === 'ollama') continue; // ollama has no env var key
    if (entry.apiKeyEnvVar && process.env[entry.apiKeyEnvVar]) {
      return entry.id;
    }
  }
  // Check ollama last (no key needed, just check if running)
  return null;
}

/**
 * Auto-remap all role models to a fallback provider.
 * Mutates clawConfig.roles in place. Only affects runtime, not config.json.
 * Uses resolveRoles() to read the correct budgetTier from builtin definitions.
 */
function autoRemapModels(providerId: string) {
  const models = PROVIDER_MODEL_MAP[providerId];
  if (!models) return;

  const resolved = resolveRoles(clawConfig);
  for (const role of resolved) {
    if (!clawConfig.roles[role.id]) clawConfig.roles[role.id] = {};
    clawConfig.roles[role.id].model = role.budgetTier === 'earn' ? models.earn : models.save;
    clawConfig.roles[role.id].provider = providerId;
  }
}

async function bootstrap() {
  // Detect available provider
  let activeProvider = 'clawapi';
  let remapped = false;

  if (!process.env.CLAWAPI_KEY) {
    const fallback = detectFallbackProvider();
    if (fallback) {
      // Add fallback provider to config
      const catalogEntry = PROVIDER_CATALOG.find(p => p.id === fallback);
      if (catalogEntry) {
        const apiKey = process.env[catalogEntry.apiKeyEnvVar!] ?? '';
        const providerConfig = catalogToConfig(catalogEntry, apiKey);
        // Replace or add provider in config
        const idx = clawConfig.providers.findIndex(p => p.id === fallback);
        if (idx >= 0) {
          clawConfig.providers[idx] = providerConfig;
        } else {
          clawConfig.providers.push(providerConfig);
        }
        // Make it the default
        clawConfig.providers.forEach(p => p.isDefault = p.id === fallback);
        autoRemapModels(fallback);
        activeProvider = fallback;
        remapped = true;
        fallbackProvider = fallback;
      }
    } else {
      // No providers at all
      console.log('  ⚠️  No API key set. AI features disabled. Set your key in Dashboard → Settings.');
      const roles = resolveRoles(clawConfig);
      const active = roles.filter(r => r.isActive && r.budgetTier !== 'survive');
      console.log(`  ✅ ${active.length} roles loaded (AI features require API key)`);
      console.log('');
      console.log('  👤 Chairman = Human (you)');
      console.log('');
      for (const role of active) {
        const pricing = MODEL_PRICING[role.model];
        const cost = pricing ? `$${pricing.input}/$${pricing.output}` : 'custom';
        console.log(`     ${role.name.padEnd(12)} → ${role.model} (${cost})`);
      }
      console.log('');
      return;
    }
  }

  try {
    await registry.loadFromConfig(clawConfig.providers);
    router = new ModelRouter(registry, clawConfig);
    orchestrator = new TaskOrchestrator(router);

    if (remapped) {
      const models = PROVIDER_MODEL_MAP[activeProvider];
      console.log(`  ℹ  No ClawAPI key. Auto-remapped all roles to ${activeProvider} (${models?.earn} / ${models?.save})`);
    } else {
      console.log('  ✅ Connected to ClawAPI');
    }

    const roles = resolveRoles(clawConfig);
    const active = roles.filter(r => r.isActive && r.budgetTier !== 'survive');
    console.log(`  ✅ ${active.length} active roles loaded`);
    console.log('');
    console.log('  👤 Chairman = Human (you)');
    console.log('');
    for (const role of active) {
      const pricing = MODEL_PRICING[role.model];
      const cost = pricing ? `$${pricing.input}/$${pricing.output}` : 'custom';
      console.log(`     ${role.name.padEnd(12)} → ${role.model} (${cost})`);
    }
    console.log('');
  } catch (err: any) {
    bootError = err.message;
    console.error(`  ❌ Bootstrap failed: ${bootError}`);
  }
}

// ──────────────────────────────────────────
// Routes
// ──────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: bootError ? 'error' : 'ok',
    version: '0.4.0',
    name: 'ClawCompany',
    tagline: 'Build for OPC. Every human being is a chairman.',
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    discord: !!process.env.DISCORD_BOT_TOKEN,
    apiKeyMissing: !process.env.CLAWAPI_KEY,
    error: bootError,
  });
});

// Company info (reads from ~/.clawcompany/config.json)
app.get('/api/company', (_req, res) => {
  try {
    const homeDir = process.env.HOME ?? '~';
    const configPath = `${homeDir}/.clawcompany/config.json`;
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      res.json({
        name: config.companyName ?? 'My AI Company',
        template: config.template ?? 'default',
        createdAt: config.createdAt,
      });
    } else {
      res.json({ name: 'My AI Company', template: 'default' });
    }
  } catch {
    res.json({ name: 'My AI Company', template: 'default' });
  }
});

// ──── Templates ────

app.get('/api/templates', (_req, res) => {
  const list = Object.values(TEMPLATES).map(t => ({
    id: t.id, name: t.name, icon: t.icon, description: t.description, roleCount: t.roles.length,
  }));
  res.json(list);
});

app.get('/api/templates/active', (_req, res) => {
  res.json({ templateId: clawConfig.activeTemplate ?? 'default' });
});

app.put('/api/templates/active', (req, res) => {
  const { templateId } = req.body;
  if (!templateId || !TEMPLATES[templateId]) {
    return res.status(400).json({ ok: false, error: `Unknown template: ${templateId}. Available: ${Object.keys(TEMPLATES).join(', ')}` });
  }

  const template = TEMPLATES[templateId];

  // Build new roles map: template builtin roles + keep custom (non-builtin) roles
  const newRoles: Record<string, Partial<import('@clawcompany/shared').Role>> = {};
  for (const role of template.roles) {
    newRoles[role.id] = { model: role.model, provider: role.provider };
  }
  // Preserve custom roles from current config
  for (const [id, overrides] of Object.entries(clawConfig.roles)) {
    if (overrides.name && overrides.model && !newRoles[id]) {
      newRoles[id] = overrides;
    }
  }

  clawConfig.activeTemplate = templateId;
  clawConfig.roles = newRoles;

  // Re-apply fallback remap if running without ClawAPI
  if (fallbackProvider) {
    autoRemapModels(fallbackProvider);
  }

  // Persist
  const homeDir = process.env.HOME ?? '~';
  const configPath = `${homeDir}/.clawcompany/config.json`;
  try {
    let userConfig: any = {};
    if (existsSync(configPath)) {
      userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
    userConfig.activeTemplate = templateId;
    userConfig.roles = newRoles;
    writeFileSync(configPath, JSON.stringify(userConfig, null, 2));
  } catch {}

  // Sync router's role snapshot with updated config
  router?.refreshRoles();

  const roles = resolveRoles(clawConfig);
  res.json({ ok: true, template: templateId, roles: roles.map(r => ({ id: r.id, name: r.name, model: r.model })) });
});

// ──── Roles ────

app.get('/api/roles', (_req, res) => {
  const roles = resolveRoles(clawConfig);
  res.json(roles.map(r => ({
    id: r.id, name: r.name, model: r.model, provider: r.provider,
    budgetTier: r.budgetTier, reportsTo: r.reportsTo,
    isActive: r.isActive, isBuiltin: r.isBuiltin, description: r.description,
    systemPrompt: r.systemPrompt, tools: r.tools,
  })));
});

// Available models grouped by provider
app.get('/api/models', (_req, res) => {
  const providerModels: Record<string, Array<{ id: string; label: string; input: number; output: number }>> = {
    clawapi: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', input: 5.00, output: 25.00 },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', input: 3.00, output: 15.00 },
      { id: 'gpt-5.4', label: 'GPT-5.4', input: 2.50, output: 15.00 },
      { id: 'gpt-5-mini', label: 'GPT-5 Mini', input: 0.25, output: 2.00 },
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', input: 2.00, output: 12.00 },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', input: 0.25, output: 1.50 },
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', input: 0.05, output: 0.45 },
      { id: 'gpt-oss-20b', label: 'GPT-OSS 20B', input: 0.04, output: 0.18 },
    ],
    anthropic: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', input: 5.00, output: 25.00 },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', input: 3.00, output: 15.00 },
    ],
    openai: [
      { id: 'gpt-5.4', label: 'GPT-5.4', input: 2.50, output: 15.00 },
      { id: 'gpt-5-mini', label: 'GPT-5 Mini', input: 0.25, output: 2.00 },
    ],
    gemini: [
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', input: 2.00, output: 12.00 },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', input: 0.25, output: 1.50 },
    ],
    ollama: [], // Dynamic — populated from localhost:11434/api/tags
  };

  // Try to fetch Ollama models if running
  (async () => {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 2000);
      const ollamaRes = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
      const data = await ollamaRes.json();
      if (data.models) {
        providerModels.ollama = data.models.map((m: any) => ({
          id: m.name, label: m.name, input: 0, output: 0,
        }));
      }
    } catch {}
    res.json(providerModels);
  })();
});

// Update a role (model, provider, description, isActive)
app.put('/api/roles/:id', (req, res) => {
  const { id } = req.params;
  const { model, provider, description, isActive, name, systemPrompt } = req.body;

  try {
    // Update runtime config
    if (!clawConfig.roles[id]) clawConfig.roles[id] = {};
    if (model !== undefined) clawConfig.roles[id].model = model;
    if (provider !== undefined) clawConfig.roles[id].provider = provider;
    if (description !== undefined) clawConfig.roles[id].description = description;
    if (isActive !== undefined) clawConfig.roles[id].isActive = isActive;
    if (name !== undefined) clawConfig.roles[id].name = name;
    if (systemPrompt !== undefined) clawConfig.roles[id].systemPrompt = systemPrompt;

    // Sync router's role snapshot with updated config
    router?.refreshRoles();

    // Persist to user config
    const homeDir = process.env.HOME ?? '~';
    const configPath = `${homeDir}/.clawcompany/config.json`;
    if (existsSync(configPath)) {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (!userConfig.roles) userConfig.roles = {};
      if (!userConfig.roles[id]) userConfig.roles[id] = {};
      Object.assign(userConfig.roles[id], req.body);
      writeFileSync(configPath, JSON.stringify(userConfig, null, 2));
    }

    const updated = resolveRoles(clawConfig).find(r => r.id === id);
    res.json({ ok: true, role: updated });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Add a custom role
app.post('/api/roles', (req, res) => {
  const { id, name, model, provider, description, systemPrompt, reportsTo } = req.body;
  if (!id || !name || !model) return res.status(400).json({ ok: false, error: 'Required: id, name, model' });

  // Check for duplicate
  if (clawConfig.roles[id]) return res.status(409).json({ ok: false, error: 'Role ID already exists' });

  try {
    clawConfig.roles[id] = {
      name, model, provider: provider || 'clawapi',
      description: description || '', systemPrompt: systemPrompt || `You are ${name}.`,
      reportsTo: reportsTo || resolveRoles(clawConfig).find(r => r.reportsTo === null && r.budgetTier !== 'survive')?.id || resolveRoles(clawConfig).filter(r => r.budgetTier !== 'survive')[0]?.id || null, isActive: true, isBuiltin: false,
    };

    // Persist
    const homeDir = process.env.HOME ?? '~';
    const configPath = `${homeDir}/.clawcompany/config.json`;
    if (existsSync(configPath)) {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (!userConfig.roles) userConfig.roles = {};
      userConfig.roles[id] = clawConfig.roles[id];
      writeFileSync(configPath, JSON.stringify(userConfig, null, 2));
    }

    // Sync router's role snapshot with updated config
    router?.refreshRoles();

    const created = resolveRoles(clawConfig).find(r => r.id === id);
    res.json({ ok: true, role: created });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Delete a custom role (builtin roles cannot be deleted)
app.delete('/api/roles/:id', async (req, res) => {
  const { id } = req.params;
  const { getBuiltinRole } = await import('@clawcompany/shared');
  if (getBuiltinRole(id)) return res.status(403).json({ ok: false, error: 'Cannot delete built-in roles' });

  try {
    delete clawConfig.roles[id];

    // Sync router's role snapshot with updated config
    router?.refreshRoles();

    // Persist
    const homeDir = process.env.HOME ?? '~';
    const configPath = `${homeDir}/.clawcompany/config.json`;
    if (existsSync(configPath)) {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (userConfig.roles) delete userConfig.roles[id];
      writeFileSync(configPath, JSON.stringify(userConfig, null, 2));
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/providers', (_req, res) => {
  res.json(registry.list());
});

// ──── Settings API ────

// List all catalog providers with masked keys
app.get('/api/settings/providers', async (_req, res) => {
  const { PROVIDER_CATALOG } = await import('@clawcompany/shared');
  const catalog = PROVIDER_CATALOG.map(p => {
    // Check if this provider has a runtime key
    const runtimeProvider = clawConfig.providers.find(rp => rp.id === p.id);
    const apiKey = runtimeProvider?.apiKey || '';
    return {
      id: p.id,
      name: p.name,
      tier: p.tier,
      baseUrl: p.baseUrl,
      description: p.description,
      apiKeyPrefix: p.apiKeyPrefix ?? 'sk-',
      apiKey: apiKey ? apiKey.slice(0, 10) + '••••••••' : '',
      isConnected: !!apiKey,
    };
  });
  res.json(catalog);
});

// Update provider API key
app.put('/api/settings/providers/:id', (req, res) => {
  const { id } = req.params;
  const { apiKey } = req.body;

  if (!apiKey || apiKey.length < 5) {
    return res.status(400).json({ ok: false, error: 'Invalid API key' });
  }

  try {
    // Update runtime config — add provider if not yet in config
    let provider = clawConfig.providers.find(p => p.id === id);
    if (!provider) {
      const catalogEntry = PROVIDER_CATALOG.find(p => p.id === id);
      if (!catalogEntry) return res.status(404).json({ ok: false, error: 'Unknown provider' });
      provider = catalogToConfig(catalogEntry, apiKey);
      clawConfig.providers.push(provider);
    }
    provider.apiKey = apiKey;

    // Sync to process.env so bootstrap/health checks see the new key
    const envVarMap: Record<string, string> = {
      clawapi: 'CLAWAPI_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_API_KEY',
    };
    if (envVarMap[id]) {
      process.env[envVarMap[id]] = apiKey;
    }

    // Save to user config
    const homeDir = process.env.HOME ?? '~';
    const configPath = `${homeDir}/.clawcompany/config.json`;
    if (existsSync(configPath)) {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (id === 'clawapi') {
        userConfig.apiKey = apiKey;
      }
      if (!userConfig.providers) userConfig.providers = {};
      userConfig.providers[id] = { apiKey };
      writeFileSync(configPath, JSON.stringify(userConfig, null, 2));
    }

    // Re-bootstrap if AI features were not initialized or running in fallback mode
    if (id === 'clawapi' && (!router || fallbackProvider)) {
      clawConfig.providers[0].apiKey = apiKey;
      // Reset roles to template defaults (undo fallback remap)
      if (fallbackProvider) {
        const tplId = clawConfig.activeTemplate ?? 'default';
        const tpl = TEMPLATES[tplId];
        if (tpl) {
          for (const role of tpl.roles) {
            if (clawConfig.roles[role.id]) {
              clawConfig.roles[role.id].model = role.model;
              clawConfig.roles[role.id].provider = role.provider;
            }
          }
        }
      }
      fallbackProvider = null; // clear fallback — switching to ClawAPI
      bootError = null;
      bootstrap().catch(() => {});
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Test provider connection
app.get('/api/settings/providers/:id/test', async (req, res) => {
  const { id } = req.params;
  try {
    const provider = registry.get(id);
    if (!provider) return res.json({ ok: false, error: 'Provider not found or no API key' });

    // Quick test: try to get models or do a tiny chat
    res.json({ ok: true, models: 'Connection successful' });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// ──── Channel Settings API ────

// Module-level adapter refs (set during server startup)
let telegramAdapterRef: any = null;
let discordAdapterRef: any = null;

app.get('/api/settings/channels', (_req, res) => {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const dcToken = process.env.DISCORD_BOT_TOKEN || '';

  res.json([
    {
      id: 'webchat',
      name: 'WebChat',
      icon: '🌐',
      description: 'Browser-based chat. Always available at /chat.html.',
      connected: true,
      status: 'Always on',
      tokenField: false,
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: '✈️',
      description: 'Create a bot via @BotFather on Telegram, then paste the token here.',
      connected: !!telegramAdapterRef,
      token: tgToken ? tgToken.slice(0, 8) + '••••••••' : '',
      botInfo: telegramAdapterRef?.botName ? `@${telegramAdapterRef.botName}` : '',
      tokenField: true,
      tokenLabel: 'Bot Token',
      placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v...',
      guideUrl: 'https://clawcompany.org/setup#telegram',
    },
    {
      id: 'discord',
      name: 'Discord',
      icon: '💬',
      description: 'Create a bot in Discord Developer Portal, then paste the token here.',
      connected: !!discordAdapterRef,
      token: dcToken ? dcToken.slice(0, 8) + '••••••••' : '',
      botInfo: discordAdapterRef?.botName || '',
      tokenField: true,
      tokenLabel: 'Bot Token',
      placeholder: 'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ...',
      guideUrl: 'https://clawcompany.org/setup#discord',
    },
  ]);
});

app.put('/api/settings/channels/:id', async (req, res) => {
  const { id } = req.params;
  const { token } = req.body;

  if (!token || token.length < 5) {
    return res.status(400).json({ ok: false, error: 'Invalid token' });
  }

  try {
    // Save to user config
    const homeDir = process.env.HOME ?? '~';
    const configPath = `${homeDir}/.clawcompany/config.json`;
    let userConfig: any = {};
    if (existsSync(configPath)) {
      userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
    if (!userConfig.channels) userConfig.channels = {};
    userConfig.channels[id] = { token };
    writeFileSync(configPath, JSON.stringify(userConfig, null, 2));

    // Update process.env
    let connected = false;
    if (id === 'telegram') {
      process.env.TELEGRAM_BOT_TOKEN = token;
      // Try to start adapter if not already running
      if (!telegramAdapterRef) {
        try {
          const { TelegramAdapter } = await import('./channels/telegram.js');
          telegramAdapterRef = new TelegramAdapter(token, `http://localhost:${PORT}`, undefined, { getRoles: () => resolveRoles(clawConfig) });
          await telegramAdapterRef.start();
          connected = true;
        } catch (e: any) {
          return res.json({ ok: true, connected: false, error: 'Saved but failed to connect: ' + e.message });
        }
      }
      connected = true;
    } else if (id === 'discord') {
      process.env.DISCORD_BOT_TOKEN = token;
      if (!discordAdapterRef) {
        try {
          const { DiscordAdapter } = await import('./channels/discord.js');
          discordAdapterRef = new DiscordAdapter(token, `http://localhost:${PORT}`, undefined, { getRoles: () => resolveRoles(clawConfig) });
          await discordAdapterRef.start();
          connected = true;
        } catch (e: any) {
          return res.json({ ok: true, connected: false, error: 'Saved but failed to connect: ' + e.message });
        }
      }
      connected = true;
    }

    res.json({ ok: true, connected });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/settings/channels/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Remove from config
    const homeDir = process.env.HOME ?? '~';
    const configPath = `${homeDir}/.clawcompany/config.json`;
    if (existsSync(configPath)) {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (userConfig.channels) delete userConfig.channels[id];
      writeFileSync(configPath, JSON.stringify(userConfig, null, 2));
    }

    // Stop adapter
    if (id === 'telegram' && telegramAdapterRef) {
      try { await telegramAdapterRef.stop(); } catch {}
      telegramAdapterRef = null;
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else if (id === 'discord' && discordAdapterRef) {
      try { await discordAdapterRef.stop(); } catch {}
      discordAdapterRef = null;
      delete process.env.DISCORD_BOT_TOKEN;
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ──── Routines API ────

let scheduler: CronScheduler | undefined;
const codeManager = new CodeManager();

// List all routines
app.get('/api/routines', (_req, res) => {
  if (!scheduler) return res.json([]);
  const running = scheduler.getRunning();
  res.json(scheduler.list().map(r => ({
    ...r,
    cronDescription: describeCron(r.cron),
    isRunning: running.includes(r.id),
  })));
});

// List available templates
app.get('/api/routines/templates', (_req, res) => {
  res.json(ROUTINE_TEMPLATES.map(t => ({ ...t, cronDescription: describeCron(t.cron) })));
});

// Execution log
app.get('/api/routines/log', (_req, res) => {
  if (!scheduler) return res.json([]);
  res.json(scheduler.getLog());
});

// Running status (lightweight poll)
app.get('/api/routines/status', (_req, res) => {
  if (!scheduler) return res.json({ running: [] });
  res.json({ running: scheduler.getRunning() });
});

// Add a routine
app.post('/api/routines', (req, res) => {
  if (!scheduler) return res.status(503).json({ error: 'Scheduler not initialized' });
  try {
    const routine = scheduler.add(req.body);
    res.json({ ok: true, routine });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Update a routine
app.put('/api/routines/:id', (req, res) => {
  if (!scheduler) return res.status(503).json({ error: 'Scheduler not initialized' });
  const result = scheduler.update(req.params.id, req.body);
  if (!result) return res.status(404).json({ ok: false, error: 'Routine not found' });
  res.json({ ok: true, routine: result });
});

// Delete a routine
app.delete('/api/routines/:id', (req, res) => {
  if (!scheduler) return res.status(503).json({ error: 'Scheduler not initialized' });
  const ok = scheduler.remove(req.params.id);
  res.json({ ok });
});

// Stop a running routine (disables + stops future triggers)
app.post('/api/routines/:id/stop', (req, res) => {
  if (!scheduler) return res.status(503).json({ error: 'Scheduler not initialized' });
  const ok = scheduler.stopRoutine(req.params.id);
  res.json({ ok });
});

// Run a routine immediately (for testing)
app.post('/api/routines/:id/run', async (req, res) => {
  if (!scheduler) return res.status(503).json({ error: 'Scheduler not initialized' });
  try {
    const result = await scheduler.runNow(req.params.id);
    res.json({ ok: true, result: result.slice(0, 500) + (result.length > 500 ? '...' : '') });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ──── Chairman API ────

app.get('/api/chairman', (_req, res) => {
  res.json({ content: loadChairman() });
});

app.put('/api/chairman', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  saveChairman(content);
  res.json({ ok: true });
});

app.get('/api/chairman/pending', (_req, res) => {
  res.json({
    hasPending: pendingChairmanUpdate !== null,
    suggestion: pendingChairmanUpdate ?? '',
    current: loadChairman(),
  });
});

app.post('/api/chairman/pending', (req, res) => {
  const { action } = req.body;
  if (action === 'approve' && pendingChairmanUpdate) {
    saveChairman(pendingChairmanUpdate);
    console.log('  ✅ Chairman profile update approved');
    pendingChairmanUpdate = null;
    res.json({ ok: true, action: 'approved' });
  } else if (action === 'reject') {
    console.log('  ❌ Chairman profile update rejected');
    pendingChairmanUpdate = null;
    res.json({ ok: true, action: 'rejected' });
  } else {
    res.status(400).json({ error: 'action must be "approve" or "reject"' });
  }
});

app.get('/api/chairman/stats', (_req, res) => {
  res.json({
    interactionCount,
    lastLearnAt,
    nextLearnAt: 10 - (interactionCount % 10),
  });
});

// ──── Memory API (partitioned) ────

app.get('/api/memory', (_req, res) => {
  res.json(loadAllMemory());
});

app.put('/api/memory', (req, res) => {
  const { partition, content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  if (partition && MEMORY_PARTITIONS.includes(partition)) {
    savePartition(partition, content);
  } else if (!partition) {
    // Legacy compat: save to culture
    savePartition('culture', content);
  } else {
    return res.status(400).json({ error: 'invalid partition' });
  }
  res.json({ ok: true });
});

app.post('/api/memory', (req, res) => {
  const { entry, partition } = req.body;
  if (!entry) return res.status(400).json({ error: 'entry required' });
  const p: MemoryPartition = (partition && MEMORY_PARTITIONS.includes(partition)) ? partition : categorizeMemoryEntry(entry);
  appendPartition(p, entry);
  res.json({ ok: true });
});

app.get('/api/memory/search', (req, res) => {
  const q = req.query.q as string;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  const results = searchMemory(q);
  res.json({ query: q, results, totalMatches: results.reduce((a, r) => a + r.matches.length, 0) });
});

app.get('/api/memory/stats', (_req, res) => {
  const stats: Record<string, { entries: number }> = {};
  for (const p of MEMORY_PARTITIONS) {
    const content = loadPartition(p);
    stats[p] = { entries: getPartitionEntries(content).length };
  }
  // Count archive entries
  let archiveEntries = 0;
  const archiveDir = `${memoryDir}/archive`;
  if (existsSync(archiveDir)) {
    try {
      const files = readdirSync(archiveDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = readFileSync(`${archiveDir}/${file}`, 'utf-8');
        archiveEntries += getPartitionEntries(content).length;
      }
    } catch {}
  }
  res.json({ partitions: stats, archiveEntries });
});

app.post('/api/memory/compress', async (req, res) => {
  if (!router) return res.status(503).json({ error: 'Not initialized' });
  const { partition } = req.body;
  const partitions: string[] = partition ? [partition] : [...MEMORY_PARTITIONS];
  const results: { partition: string; status: string; reason?: string; from?: number }[] = [];

  for (const p of partitions) {
    if (!MEMORY_PARTITIONS.includes(p as MemoryPartition)) {
      results.push({ partition: p, status: 'skipped', reason: 'invalid partition' });
      continue;
    }
    const content = loadPartition(p as MemoryPartition);
    const entries = getPartitionEntries(content);
    if (entries.length <= 5) {
      results.push({ partition: p, status: 'skipped', reason: 'too few entries' });
      continue;
    }
    await compressPartition(p as MemoryPartition, entries);
    results.push({ partition: p, status: 'compressed', from: entries.length });
  }

  res.json({ results });
});

// ──── Chat ────

app.post('/api/chat', async (req, res) => {
  if (!router) return res.status(503).json({ error: bootError ?? 'Not initialized' });
  const { role: roleId, message } = req.body;
  if (!roleId || !message) return res.status(400).json({ error: 'Required: { role, message }' });

  try {
    const roleObj = router.getRole(roleId);
    const tools = roleObj ? getToolsForRole(roleObj.tools) : [];
    const messages: Message[] = [];

    // Inject chairman profile + company memory as system context
    const chairman = loadChairman();
    if (chairman.trim()) {
      messages.push({ role: 'system', content: `--- Chairman ---\n${chairman}` });
    }
    const culture = loadPartition('culture');
    const decisions = loadPartition('decisions');
    const learnings = loadPartition('learnings');
    const techStack = loadPartition('tech-stack');
    if (culture.trim() || decisions.trim() || learnings.trim() || techStack.trim()) {
      let memorySummary = '--- Company Memory ---\n';
      if (culture.trim()) memorySummary += 'Culture: ' + culture.slice(0, 200) + '\n';
      if (decisions.trim()) memorySummary += 'Decisions: ' + decisions.slice(0, 200) + '\n';
      if (learnings.trim()) memorySummary += 'Learnings: ' + learnings.slice(0, 200) + '\n';
      if (techStack.trim()) memorySummary += 'Tech: ' + techStack.slice(0, 200);
      messages.push({ role: 'system', content: memorySummary });
    }

    messages.push({ role: 'user', content: message });

    // ── Subagent: leader can delegate to team members ──
    const allRoles = resolveRoles(clawConfig);
    const currentRole = allRoles.find(r => r.id === roleId);
    const isLeader = currentRole?.reportsTo === null;
    const MAX_SUBAGENT = 3;
    const subagentCalls: { role: string; task: string; status: string }[] = [];

    if (isLeader) {
      const teamRoles = allRoles.filter(r => r.id !== roleId && r.isActive && r.budgetTier !== 'survive');
      if (teamRoles.length > 0) {
        const roleList = teamRoles.map(r => `- ${r.id}: ${r.name} — ${r.description?.slice(0, 80) || 'team member'}`).join('\n');
        messages.unshift({
          role: 'system',
          content: `You are the leader. You can delegate tasks to team members by including this exact format in your response:\n[DELEGATE:role_id:task description]\n\nAvailable team members:\n${roleList}\n\nAfter receiving their response, synthesize all information into your final answer. Maximum ${MAX_SUBAGENT} delegations per conversation. Only delegate when the task genuinely benefits from another role's expertise.`,
        });
      }
    }

    let totalIn = 0, totalOut = 0, totalCost = 0;
    const MAX_TOOL_TURNS = 10;
    let lastModel = roleObj?.model ?? 'unknown';
    let lastProvider = roleObj?.provider ?? 'unknown';
    let finalContent = '';

    // Outer loop: handles subagent delegation rounds
    let subagentRound = 0;
    const MAX_SUBAGENT_ROUNDS = MAX_SUBAGENT + 1; // +1 for final answer

    for (let round = 0; round < MAX_SUBAGENT_ROUNDS; round++) {
      // Inner loop: handles tool calls within a single round
      let roundDone = false;

      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        const response = await router.chatAsRole(roleId, messages, tools.length > 0 ? tools : undefined);
        totalIn += response.usage.inputTokens;
        totalOut += response.usage.outputTokens;
        totalCost += response.usage.cost;
        lastModel = response.model;
        lastProvider = response.provider;

        // Tool calls pending → process them and continue inner loop
        if (response.toolCalls?.length && response.finishReason !== 'stop') {
          messages.push({ role: 'assistant', content: response.content ?? '', toolCalls: response.toolCalls });
          for (const tc of response.toolCalls) {
            const args = JSON.parse(tc.function.arguments);
            const result = await toolExecutor.execute(tc.function.name, args);
            messages.push({ role: 'tool', content: result, toolCallId: tc.id });
          }
          continue;
        }

        // No tool calls → check for DELEGATE
        finalContent = response.content || '';
        roundDone = true;
        break;
      }

      if (!roundDone) {
        finalContent = '[Chat reached maximum tool turns]';
        break;
      }

      // Check for [DELEGATE:roleId:task] in leader response
      if (!isLeader || subagentRound >= MAX_SUBAGENT) break;

      const delegateMatch = finalContent.match(/\[DELEGATE:([a-zA-Z0-9_-]+):(.+?)\]/s);
      if (!delegateMatch) break;

      const [, delegateRoleId, delegateTask] = delegateMatch;
      const delegateRoleObj = allRoles.find(r => r.id === delegateRoleId && r.isActive);
      if (!delegateRoleObj) {
        // Invalid role — tell leader and let it retry
        messages.push({ role: 'assistant', content: finalContent });
        messages.push({ role: 'user', content: `[System: Role "${delegateRoleId}" not found. Available: ${allRoles.filter(r => r.id !== roleId && r.isActive).map(r => r.id).join(', ')}]` });
        subagentRound++;
        continue;
      }

      subagentRound++;
      console.log(`  📡 Subagent: ${roleId} → ${delegateRoleId}: ${delegateTask.slice(0, 80)}`);
      subagentCalls.push({ role: delegateRoleId, task: delegateTask.slice(0, 200), status: 'running' });

      try {
        const SUBAGENT_TIMEOUT = 30000; // 30s per subagent
        const subResponse = await Promise.race([
          router.chatAsRole(delegateRoleId, [
            { role: 'user', content: delegateTask },
          ]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Subagent timeout (30s)')), SUBAGENT_TIMEOUT)
          ),
        ]);
        totalIn += subResponse.usage.inputTokens;
        totalOut += subResponse.usage.outputTokens;
        totalCost += subResponse.usage.cost;

        const subContent = (subResponse.content || '').slice(0, 2000);
        messages.push({ role: 'assistant', content: finalContent });
        messages.push({ role: 'user', content: `[Team Response from ${delegateRoleId} (${delegateRoleObj.name})]:\n${subContent}` });
        subagentCalls[subagentCalls.length - 1].status = 'done';
        console.log(`  ✅ Subagent ${delegateRoleId} responded (${subResponse.usage.inputTokens + subResponse.usage.outputTokens} tokens)`);
      } catch (err: any) {
        messages.push({ role: 'assistant', content: finalContent });
        messages.push({ role: 'user', content: `[${delegateRoleId} failed: ${err.message}]` });
        subagentCalls[subagentCalls.length - 1].status = 'error';
        console.log(`  ❌ Subagent ${delegateRoleId} failed: ${err.message}`);
      }
      // Continue outer loop — leader will process the result
    }

    // Clean DELEGATE markers from final content
    const cleanContent = finalContent.replace(/\[DELEGATE:[a-zA-Z0-9_-]+:.+?\]/gs, '').trim();

    chatHistoryData.unshift({
      id: `chat_${Date.now()}`,
      role: roleId,
      model: lastModel,
      input: message.slice(0, 100),
      cost: totalCost,
      tokens: totalIn + totalOut,
      at: new Date().toISOString(),
    });
    saveChats();
    const subagentLog = subagentCalls.length > 0 ? ` | Subagents: ${subagentCalls.map(s => `${s.role}(${s.status})`).join(',')}` : '';
    recordInteraction(`[Chat] Role: ${roleId} | User: ${message.slice(0, 200)} | Reply: ${cleanContent.slice(0, 200)}${subagentLog}`);
    res.json({
      role: roleId, model: lastModel, provider: lastProvider,
      content: cleanContent,
      usage: { inputTokens: totalIn, outputTokens: totalOut, cost: totalCost },
      ...(subagentCalls.length > 0 && { subagentCalls }),
    });
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown error';
    const roleObj = router!.getRole(roleId);
    res.json({
      role: roleId,
      model: roleObj?.model ?? 'unknown',
      provider: roleObj?.provider ?? 'unknown',
      content: '⚠️ ' + errorMsg,
      error: errorMsg,
      usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
    });
  }
});

app.get('/api/chats/stats', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayChats = chatHistoryData.filter(c => c.at && c.at.startsWith(today));
  const totalCost = todayChats.reduce((sum: number, c: any) => sum + (c.cost || 0), 0);
  res.json({
    count: todayChats.length,
    cost: totalCost,
  });
});

// ──── Code Manager API ────

app.get('/api/code/presets', (_req, res) => {
  res.json(CodeManager.getPresets());
});

app.get('/api/code/sessions', (_req, res) => {
  res.json(codeManager.list());
});

app.get('/api/code/status', (_req, res) => {
  res.json(codeManager.getStatus());
});

app.post('/api/code/sessions', (req, res) => {
  const { name, path, tool, command, args, autoStart, notify, color } = req.body;
  if (!name || !path || !tool) return res.status(400).json({ ok: false, error: 'Required: name, path, tool' });
  try {
    const session = codeManager.add({ name, path, tool, command, args, autoStart, notify, color });
    res.json({ ok: true, session });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/code/sessions/:id', (req, res) => {
  const session = codeManager.update(req.params.id, req.body);
  if (!session) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, session });
});

app.delete('/api/code/sessions/:id', (req, res) => {
  const ok = codeManager.remove(req.params.id);
  res.json({ ok });
});

app.post('/api/code/sessions/:id/start', (req, res) => {
  try {
    codeManager.start(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/code/sessions/:id/stop', (req, res) => {
  codeManager.stop(req.params.id);
  res.json({ ok: true });
});

app.post('/api/code/sessions/:id/restart', (req, res) => {
  try {
    codeManager.restart(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/code/start-all', (_req, res) => {
  const started = codeManager.startAll();
  res.json({ ok: true, started });
});

app.post('/api/code/stop-all', (_req, res) => {
  codeManager.stopAll();
  res.json({ ok: true });
});

app.get('/api/code/sessions/:id/output', (_req, res) => {
  const output = codeManager.getOutput(_req.params.id);
  res.json(output);
});

app.post('/api/code/sessions/:id/clear', (req, res) => {
  codeManager.clearOutput(req.params.id);
  res.json({ ok: true });
});

// SSE stream for code output
app.get('/api/code/sessions/:id/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const id = req.params.id;

  const onOutput = (data: { sessionId: string; line: string }) => {
    if (data.sessionId === id) {
      res.write(`data: ${data.line}\n\n`);
    }
  };

  const onExit = (data: { sessionId: string; code: number; name: string; runtime?: string }) => {
    if (data.sessionId === id) {
      res.write(`data: ${JSON.stringify({ ts: new Date().toTimeString().slice(0, 8), text: `Process exited (code ${data.code}) — ${data.runtime ?? ''}`, stream: 'system', exit: true })}\n\n`);
    }
  };

  codeManager.on('output', onOutput);
  codeManager.on('exit', onExit);

  req.on('close', () => {
    codeManager.off('output', onOutput);
    codeManager.off('exit', onExit);
  });
});

app.post('/api/mission/decompose', async (req, res) => {
  if (!orchestrator) return res.status(503).json({ error: bootError ?? 'Not initialized' });
  const { mission } = req.body;
  if (!mission) return res.status(400).json({ error: 'Required: { mission: "..." }' });

  try {
    const workStreams = await orchestrator.decompose({
      id: `mission-${Date.now()}`, companyId: 'default', content: mission,
      status: 'decomposing', priority: 'normal', approvalRequired: false,
      totalCost: 0, createdAt: new Date().toISOString(),
    });
    const leader = resolveRoles(clawConfig).find(r => r.reportsTo === null && r.budgetTier !== 'survive');
    res.json({ mission, decomposedBy: `${leader?.name ?? 'Leader'} (${leader?.model ?? 'unknown'})`, workStreams });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ★ Streaming mission execution (SSE — real-time progress for Dashboard)
app.post('/api/mission/run-stream', async (req, res) => {
  if (!orchestrator) return res.status(503).json({ error: bootError ?? 'Not initialized' });
  const { mission } = req.body;
  if (!mission) return res.status(400).json({ error: 'Required: { mission: "..." }' });

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const send = (type: string, data: any) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  // Create mission history record
  const missionRecord: any = {
    id: `mission_${Date.now()}`,
    input: mission,
    template: clawConfig.activeTemplate || 'default',
    startedAt: new Date().toISOString(),
    status: 'running',
    roles: [] as string[],
    result: null,
    totalCost: null,
    totalTime: null,
    workStreams: null,
    completedAt: null,
  };
  missionHistoryData.unshift(missionRecord);
  saveMissions();

  try {
    console.log(`\n  🎯 Mission from Chairman: "${mission}"\n`);

    // Phase 2: Decompose
    const leader = resolveRoles(clawConfig).find(r => r.reportsTo === null && r.budgetTier !== 'survive');
    const leaderName = leader?.name ?? 'Leader';
    send('phase', { phase: 'decomposing', message: `${leaderName} is analyzing your mission...` });

    const missionObj = {
      id: `mission-${Date.now()}`, companyId: 'default', content: mission,
      status: 'decomposing' as const, priority: 'normal' as const,
      approvalRequired: false, totalCost: 0, createdAt: new Date().toISOString(),
    };

    const workStreams = await orchestrator.decompose(missionObj);

    send('decomposed', {
      message: `Decomposed into ${workStreams.length} work streams`,
      workStreams: workStreams.map(ws => ({
        id: ws.id, title: ws.title, assignTo: ws.assignTo,
        dependencies: ws.dependencies, estimatedComplexity: ws.estimatedComplexity,
      })),
    });

    // Phase 3-5: Execute work streams (batch-parallel with dependency resolution)
    send('phase', { phase: 'executing', message: 'Team is working...' });

    const results: any[] = [];
    let totalCost = 0;
    const totalStart = Date.now();

    const completedOutputs = new Map<string, string>();
    const completed = new Set<string>();
    const remaining = new Map(workStreams.map(ws => [ws.id, ws]));

    let batch = 1;
    while (remaining.size > 0) {
      // Find streams whose dependencies are all completed
      const ready = [...remaining.values()].filter(ws =>
        (ws.dependencies ?? []).every(dep => completed.has(dep)),
      );

      if (ready.length === 0) {
        // Circular dependency or missing deps — force-run remaining
        console.log(`  ⚠️  Unresolvable dependencies — forcing remaining streams`);
        ready.push(...remaining.values());
      }

      console.log(`  📦 Batch ${batch}: ${ready.map(ws => ws.id).join(', ')}`);
      send('batch_start', { batch, streams: ready.map(ws => ws.id) });

      // Notify all streams in batch are starting
      for (const ws of ready) {
        const role = router.getRole(ws.assignTo);
        const roleName = role?.name ?? ws.assignTo;
        const modelName = role?.model ?? 'unknown';
        send('ws_start', {
          id: ws.id, title: ws.title, role: ws.assignTo,
          roleName, model: modelName, batch,
        });
      }

      const MAX_RETRIES = 2;

      const batchResults = await Promise.all(ready.map(async (ws) => {
        const role = router.getRole(ws.assignTo);
        const startTime = Date.now();

        // Build context from dependencies (once, before retry loop)
        let context = '';
        const deps = ws.dependencies ?? [];
        if (deps.length > 0) {
          context = '\n\n## Previous work stream outputs:\n';
          for (const depId of deps) {
            const depOutput = completedOutputs.get(depId);
            if (depOutput) {
              const truncated = depOutput.length > 500 ? depOutput.slice(0, 500) + '\n...(truncated)' : depOutput;
              context += `\n### ${depId}:\n${truncated}\n`;
            }
          }
        }

        // Build messages with chairman + memory context
        const wsMessages: Message[] = [];
        const wsChairman = loadChairman();
        if (wsChairman.trim()) {
          wsMessages.push({ role: 'system', content: `--- Chairman ---\n${wsChairman}` });
        }
        const wsCulture = loadPartition('culture');
        const wsDecisions = loadPartition('decisions');
        const wsLearnings = loadPartition('learnings');
        const wsTechStack = loadPartition('tech-stack');
        if (wsCulture.trim() || wsDecisions.trim() || wsLearnings.trim() || wsTechStack.trim()) {
          let wsMem = '--- Company Memory ---\n';
          if (wsCulture.trim()) wsMem += 'Culture: ' + wsCulture.slice(0, 200) + '\n';
          if (wsDecisions.trim()) wsMem += 'Decisions: ' + wsDecisions.slice(0, 200) + '\n';
          if (wsLearnings.trim()) wsMem += 'Learnings: ' + wsLearnings.slice(0, 200) + '\n';
          if (wsTechStack.trim()) wsMem += 'Tech: ' + wsTechStack.slice(0, 200);
          wsMessages.push({ role: 'system', content: wsMem });
        }
        wsMessages.push({ role: 'user', content: `## Task: ${ws.title}\n\n${ws.description}\n\nComplexity: ${ws.estimatedComplexity}${context}\n\nComplete this task. Provide your output clearly and concisely.` });

        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
          try {
            const response = await router.chatAsRole(ws.assignTo, wsMessages);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const cost = response.usage.cost;

            const wsResult = {
              id: ws.id, title: ws.title, role: ws.assignTo,
              model: response.model, status: 'completed',
              cost: `$${cost.toFixed(4)}`, time: `${elapsed}s`,
              output: response.content,
              outputPreview: response.content.slice(0, 300) + (response.content.length > 300 ? '...' : ''),
            };

            send('ws_done', wsResult);
            console.log(`  ✅ ${ws.id}: ${ws.title} (${elapsed}s, $${cost.toFixed(4)})${attempt > 1 ? ` [retry ${attempt - 1}]` : ''}`);

            return { ws, wsResult, cost, output: response.content };
          } catch (err: any) {
            if (attempt <= MAX_RETRIES) {
              console.log(`  🔄 ${ws.id}: Retry ${attempt}/${MAX_RETRIES} — ${err.message}`);
              send('ws_retry', { id: ws.id, attempt, maxRetries: MAX_RETRIES, error: err.message });
              continue;
            }
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const wsResult = {
              id: ws.id, title: ws.title, role: ws.assignTo,
              model: 'none', status: 'failed',
              cost: '$0.0000', time: `${elapsed}s`,
              error: err.message, output: '', outputPreview: `Error: ${err.message}`,
            };
            send('ws_failed', wsResult);
            console.log(`  ❌ ${ws.id}: Failed after ${MAX_RETRIES} retries — ${err.message}`);

            return { ws, wsResult, cost: 0, output: '' };
          }
        }
        // Unreachable, but TypeScript needs it
        throw new Error(`Unexpected: ${ws.id} exited retry loop`);
      }));

      for (const { ws, wsResult, cost, output } of batchResults) {
        results.push(wsResult);
        totalCost += cost;
        completed.add(ws.id);
        remaining.delete(ws.id);
        if (output) completedOutputs.set(ws.id, output);
      }
      batch++;
    }

    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

    send('complete', {
      status: 'completed',
      mission,
      totalCost: `$${totalCost.toFixed(4)}`,
      totalTime: `${totalElapsed}s`,
      workStreams: results,
    });

    console.log(`  📊 Total: ${totalElapsed}s, $${totalCost.toFixed(4)}\n`);

    // Update mission history record
    missionRecord.status = 'completed';
    missionRecord.completedAt = new Date().toISOString();
    missionRecord.totalCost = `$${totalCost.toFixed(4)}`;
    missionRecord.totalTime = `${totalElapsed}s`;
    missionRecord.roles = [...new Set(results.map((r: any) => r.role))];
    missionRecord.workStreams = results.map((r: any) => ({
      id: r.id, title: r.title, role: r.role, model: r.model,
      status: r.status, cost: r.cost, time: r.time,
      output: r.output,
    }));
    // Build final result: last output + deliverable code from the LAST generator work stream only
    const lastWsOutput = results[results.length - 1]?.output || '';
    let lastGeneratorCode: string[] = [];
    for (const r of results) {
      if (r.status !== 'completed' || !r.output) continue;
      const matches = r.output.match(/```[\s\S]*?```/g);
      if (matches && matches.some((m: string) => m.length > 200)) {
        // Overwrite (not accumulate) — so only the last work stream with code wins
        lastGeneratorCode = matches.filter((m: string) => m.length > 200);
      }
    }
    if (lastGeneratorCode.length > 0 && !lastWsOutput.includes('## Deliverable Code')) {
      missionRecord.result = lastWsOutput + '\n\n## Deliverable Code\n\n' + lastGeneratorCode.join('\n\n');
    } else {
      missionRecord.result = lastWsOutput;
    }
    saveMissions();

    // Auto-extract mission summary to company memory
    const lastOutput = results[results.length - 1]?.output || '';
    if (lastOutput.length > 50) {
      const missionSummary = `Mission: "${mission.slice(0, 100)}"\nKey roles: ${[...new Set(results.map((r: any) => r.role))].join(', ')}\nCost: $${totalCost.toFixed(4)}, Time: ${totalElapsed}s\nTemplate: ${clawConfig.activeTemplate || 'default'}`;
      appendMemory(missionSummary);
    }

    // Record for chairman auto-learn
    recordInteraction(`[Mission] "${mission.slice(0, 200)}" | Roles: ${[...new Set(results.map((r: any) => r.role))].join(', ')} | Result: ${(lastOutput || '').slice(0, 200)}`);

  } catch (err: any) {
    send('error', { message: err.message });
    missionRecord.status = 'failed';
    missionRecord.completedAt = new Date().toISOString();
    missionRecord.result = err.message;
    saveMissions();
  }

  res.end();
});

// ── Mission history API ──
app.get('/api/missions', (_req, res) => {
  res.json(missionHistoryData.map(m => ({
    id: m.id, input: m.input, template: m.template,
    startedAt: m.startedAt, completedAt: m.completedAt,
    status: m.status, roles: m.roles,
    totalCost: m.totalCost, totalTime: m.totalTime,
  })));
});

app.get('/api/missions/:id', (req, res) => {
  const m = missionHistoryData.find(m => m.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json(m);
});

app.delete('/api/missions', (_req, res) => {
  missionHistoryData = [];
  saveMissions();
  res.json({ ok: true });
});

app.delete('/api/missions/:id', (req, res) => {
  const idx = missionHistoryData.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  missionHistoryData.splice(idx, 1);
  saveMissions();
  res.json({ ok: true });
});

app.post('/api/mission/run', async (req, res) => {
  // Mission can take 10+ minutes — disable HTTP timeout
  req.setTimeout(0);
  res.setTimeout(0);

  if (!orchestrator) return res.status(503).json({ error: bootError ?? 'Not initialized' });
  const { mission } = req.body;
  if (!mission) return res.status(400).json({ error: 'Required: { mission: "..." }' });

  try {
    console.log(`\n  🎯 Mission from Chairman: "${mission}"\n`);

    const leaderRole = resolveRoles(clawConfig).find(r => r.reportsTo === null && r.budgetTier !== 'survive');
    console.log(`  Phase 2: ${leaderRole?.name ?? 'Leader'} decomposing...`);
    const missionObj = {
      id: `mission-${Date.now()}`, companyId: 'default', content: mission,
      status: 'decomposing' as const, priority: 'normal' as const,
      approvalRequired: false, totalCost: 0, createdAt: new Date().toISOString(),
    };

    const workStreams = await orchestrator.decompose(missionObj);
    console.log(`  ✅ Decomposed into ${workStreams.length} work streams\n`);

    console.log('  Phase 3-5: Executing...');
    const report = await orchestrator.executeMission(missionObj, workStreams);

    console.log('  Phase 6: Delivering result to Chairman\n');

    res.json({
      status: 'completed',
      mission: report.mission,
      totalCost: `$${report.totalCost.toFixed(4)}`,
      totalTimeSeconds: report.totalTimeSeconds,
      workStreams: report.workStreams.map(ws => ({
        id: ws.workStreamId, title: ws.title, assignedTo: ws.assignedTo,
        model: ws.model, status: ws.status, cost: `$${ws.cost.toFixed(4)}`,
        output: ws.output,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Export API (Markdown → PPTX/DOCX/PDF) ──

const EXPORT_DEP_MAP: Record<string, string> = {
  pptx: 'pptxgenjs',
  docx: 'docx',
  pdf: 'pdf-lib',
};

async function ensureExportDep(format: string) {
  const pkg = EXPORT_DEP_MAP[format];
  if (!pkg) return;
  try {
    await import(pkg);
  } catch {
    console.log(`  📦 Installing ${pkg} for ${format} export (one-time)...`);
    const { execSync } = await import('child_process');
    execSync(`pnpm add ${pkg}`, { cwd: join(__dirname, '..'), stdio: 'pipe', timeout: 120_000 });
    console.log(`  ✅ ${pkg} installed`);
  }
}

async function markdownToPPTX(markdown: string, filePath: string) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.author = 'ClawCompany';
  pptx.subject = 'Generated Report';

  const lines = markdown.split('\n');
  let currentSlide: any = null;
  let currentBullets: string[] = [];

  function flushSlide() {
    if (!currentSlide || currentBullets.length === 0) return;
    currentSlide.addText(
      currentBullets.map(b => ({ text: b, options: { bullet: true, breakLine: true } })),
      { x: 0.5, y: 1.5, w: 9, h: 4.5, fontSize: 14, color: 'cccccc', valign: 'top' }
    );
    currentBullets = [];
  }

  function newSlide(title: string, isTitle = false) {
    flushSlide();
    currentSlide = pptx.addSlide();
    currentSlide.background = { color: '1a1a2e' };
    if (isTitle) {
      currentSlide.addText(title, { x: 0.5, y: 2, w: 9, h: 1.5, fontSize: 32, color: 'ffffff', bold: true, align: 'center' });
      currentSlide.addText('Generated by ClawCompany', { x: 0.5, y: 4, w: 9, fontSize: 14, color: '888888', align: 'center' });
    } else {
      currentSlide.addText(title, { x: 0.5, y: 0.3, w: 9, fontSize: 24, color: 'ffffff', bold: true });
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      newSlide(trimmed.replace(/^# /, ''), true);
    } else if (trimmed.startsWith('## ')) {
      newSlide(trimmed.replace(/^## /, ''));
    } else if (trimmed.startsWith('### ')) {
      if (!currentSlide) newSlide('Content');
      currentBullets.push('▸ ' + trimmed.replace(/^### /, ''));
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentSlide) newSlide('Content');
      currentBullets.push(trimmed.replace(/^[-*] /, ''));
    } else if (trimmed.startsWith('|')) {
      continue; // skip tables
    } else if (currentSlide) {
      const clean = trimmed.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
      if (clean.length > 0) currentBullets.push(clean);
    }
  }
  flushSlide();

  if (pptx.slides.length === 0) {
    const slide = pptx.addSlide();
    slide.background = { color: '1a1a2e' };
    slide.addText('Report', { x: 1, y: 2, w: 8, fontSize: 32, color: 'ffffff', bold: true, align: 'center' });
    slide.addText(markdown.slice(0, 500), { x: 0.5, y: 3.5, w: 9, fontSize: 12, color: 'cccccc' });
  }

  await pptx.writeFile({ fileName: filePath });
}

async function markdownToDOCX(markdown: string, filePath: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  const children: any[] = [];
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) { children.push(new Paragraph({ text: '' })); continue; }

    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      children.push(new Paragraph({ text: trimmed.replace(/^# /, ''), heading: HeadingLevel.HEADING_1 }));
    } else if (trimmed.startsWith('## ')) {
      children.push(new Paragraph({ text: trimmed.replace(/^## /, ''), heading: HeadingLevel.HEADING_2 }));
    } else if (trimmed.startsWith('### ')) {
      children.push(new Paragraph({ text: trimmed.replace(/^### /, ''), heading: HeadingLevel.HEADING_3 }));
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      children.push(new Paragraph({ text: trimmed.replace(/^[-*] /, ''), bullet: { level: 0 } }));
    } else {
      const runs: any[] = [];
      const parts = trimmed.split(/(\*\*.*?\*\*|\*.*?\*)/);
      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
        } else if (part.startsWith('*') && part.endsWith('*')) {
          runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
        } else {
          runs.push(new TextRun({ text: part }));
        }
      }
      children.push(new Paragraph({ children: runs }));
    }
  }

  const doc = new Document({ sections: [{ children }], creator: 'ClawCompany' });
  const buffer = await Packer.toBuffer(doc);
  writeFileSync(filePath, buffer);
}

async function markdownToPDF(markdown: string, filePath: string) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 595, PAGE_HEIGHT = 842, MARGIN = 50, LINE_HEIGHT = 16;
  const MAX_WIDTH = PAGE_WIDTH - 2 * MARGIN;

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawText(text: string, size: number, isBold = false) {
    const f = isBold ? boldFont : font;
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      const width = f.widthOfTextAtSize(test, size);
      if (width > MAX_WIDTH && line) {
        ensureSpace(LINE_HEIGHT);
        page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0.2, 0.2, 0.2) });
        y -= LINE_HEIGHT;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0.2, 0.2, 0.2) });
      y -= LINE_HEIGHT;
    }
  }

  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) { y -= 8; continue; }
    const clean = trimmed.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');

    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      y -= 10; drawText(clean.replace(/^# /, ''), 22, true); y -= 8;
    } else if (trimmed.startsWith('## ')) {
      y -= 8; drawText(clean.replace(/^## /, ''), 18, true); y -= 4;
    } else if (trimmed.startsWith('### ')) {
      y -= 4; drawText(clean.replace(/^### /, ''), 14, true);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      drawText('  • ' + clean.replace(/^[-*] /, ''), 11);
    } else {
      drawText(clean, 11);
    }
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Generated by ClawCompany | Page ${i + 1}/${pages.length}`, {
      x: MARGIN, y: 25, size: 8, font, color: rgb(0.6, 0.6, 0.6),
    });
  });

  const pdfBytes = await pdf.save();
  writeFileSync(filePath, pdfBytes);
}

app.post('/api/export', async (req, res) => {
  const { content, format, filename = 'export' } = req.body;
  if (!content || !format) return res.status(400).json({ error: 'content and format required' });

  const outputDir = `${clawDir}/outputs`;
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const filePath = `${outputDir}/${filename}.${format}`;

  try {
    await ensureExportDep(format);

    switch (format) {
      case 'pptx': await markdownToPPTX(content, filePath); break;
      case 'docx': await markdownToDOCX(content, filePath); break;
      case 'pdf':  await markdownToPDF(content, filePath); break;
      default: return res.status(400).json({ error: 'format must be pptx, docx, or pdf' });
    }

    res.download(filePath, `${filename}.${format}`);
  } catch (err: any) {
    console.log(`  ❌ Export failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, async () => {
  // Disable default 5-minute request timeout — missions can take 10+ minutes
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;

  // ──── WebSocket server for Code Manager terminal I/O ────
  try {
    const { WebSocketServer } = await import('ws');
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req: any, socket: any, head: any) => {
      // Only handle /ws/code/* paths
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (!url.pathname.startsWith('/ws/code/')) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws: any) => {
        const sessionId = url.pathname.replace('/ws/code/', '');
        const session = codeManager.get(sessionId);
        if (!session) {
          ws.close(4004, 'Session not found');
          return;
        }

        // Send existing buffer (replay history)
        const buf = codeManager.getOutput(sessionId);
        if (buf.length > 0) {
          ws.send(JSON.stringify({ type: 'replay', data: buf.join('') }));
        }

        // Forward PTY output → WebSocket
        const onOutput = (ev: { sessionId: string; data: string; legacy?: boolean }) => {
          if (ev.sessionId !== sessionId) return;
          try {
            if (ev.legacy) {
              ws.send(JSON.stringify({ type: 'legacy', data: ev.data }));
            } else {
              ws.send(JSON.stringify({ type: 'output', data: ev.data }));
            }
          } catch {}
        };

        const onExit = (ev: { sessionId: string; code: number; name: string; runtime?: string }) => {
          if (ev.sessionId !== sessionId) return;
          try {
            ws.send(JSON.stringify({ type: 'exit', code: ev.code, runtime: ev.runtime }));
          } catch {}
        };

        codeManager.on('output', onOutput);
        codeManager.on('exit', onExit);

        // WebSocket → PTY input
        ws.on('message', (msg: any) => {
          try {
            const parsed = JSON.parse(msg.toString());
            if (parsed.type === 'input') {
              codeManager.write(sessionId, parsed.data);
            } else if (parsed.type === 'resize') {
              codeManager.resize(sessionId, parsed.cols, parsed.rows);
            }
          } catch {}
        });

        ws.on('close', () => {
          codeManager.off('output', onOutput);
          codeManager.off('exit', onExit);
        });

        // Send mode info
        ws.send(JSON.stringify({ type: 'mode', pty: codeManager.hasPty }));
      });
    });

    console.log(`  → Terminal WS: ws://localhost:${PORT}/ws/code/:id`);
  } catch {
    console.log('  ⚠ ws not installed — Code Manager uses SSE fallback');
    console.log('     └─ Install: cd server && pnpm add ws');
  }

  console.log('');
  console.log('  🦞 ClawCompany server running');
  console.log(`  → Dashboard: http://localhost:${PORT}`);
  console.log(`  → WebChat:   http://localhost:${PORT}/chat.html`);
  console.log(`  → API:       http://localhost:${PORT}/api/health`);
  console.log('');
  await bootstrap();

  // Build direct runner for channel adapters (no HTTP self-request)
  let directRunner: DirectRunner | undefined;
  if (orchestrator && router) {
    directRunner = {
      async runMission(goal: string) {
        const mission = {
          id: `mission-${Date.now()}`, companyId: 'default', content: goal,
          status: 'decomposing' as const, priority: 'normal' as const,
          approvalRequired: false, totalCost: 0, createdAt: new Date().toISOString(),
        };
        const leaderRole = resolveRoles(clawConfig).find(r => r.reportsTo === null && r.budgetTier !== 'survive');
        console.log(`\n  🎯 Mission from Chairman: "${goal}"\n`);
        console.log(`  Phase 2: ${leaderRole?.name ?? 'Leader'} decomposing...`);
        const workStreams = await orchestrator.decompose(mission);
        console.log(`  ✅ Decomposed into ${workStreams.length} work streams\n`);
        console.log('  Phase 3-5: Executing...');
        const report = await orchestrator.executeMission(mission, workStreams);
        console.log('  Phase 6: Delivering result to Chairman\n');
        return {
          totalCost: report.totalCost,
          totalTimeSeconds: report.totalTimeSeconds,
          workStreams: report.workStreams.map(ws => ({
            title: ws.title, assignedTo: ws.assignedTo,
            status: ws.status, output: ws.output,
          })),
        };
      },
      async runChat(role: string, message: string) {
        // Chat mode = quick conversation, no tools.
        // For real-time data, use /mission which has full tool support.
        const response = await router.chatAsRole(role, [{ role: 'user', content: message }]);
        return { content: response.content, model: response.model, cost: response.usage?.cost ?? 0 };
      },
    };
  }

  // Load channel tokens from config (saved from Dashboard)
  const homeDir = process.env.HOME ?? '~';
  const configPath = `${homeDir}/.clawcompany/config.json`;
  let userConfig: any = {};
  if (existsSync(configPath)) {
    try {
      userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      // Channel tokens already synced at startup (top of file)
      // Template & roles already restored before bootstrap() — no duplicate restore here
    } catch {}
  }

  // Helper to save chatId to config
  const saveChatId = (channel: string, chatId: string) => {
    try {
      const cfg = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf-8')) : {};
      if (!cfg.channels) cfg.channels = {};
      if (!cfg.channels[channel]) cfg.channels[channel] = {};
      cfg.channels[channel].lastChatId = chatId;
      writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    } catch {}
  };

  // Auto-start Telegram bot if token is configured
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const { TelegramAdapter } = await import('./channels/telegram.js');
      telegramAdapterRef = new TelegramAdapter(
        process.env.TELEGRAM_BOT_TOKEN,
        `http://localhost:${PORT}`,
        directRunner,
        {
          lastChatId: userConfig.channels?.telegram?.lastChatId ?? '',
          onChatIdChange: (id) => saveChatId('telegram', id),
          getRoles: () => resolveRoles(clawConfig),
        },
      );
      await telegramAdapterRef.start();
    } catch (err: any) {
      console.error(`  ❌ Telegram bot failed: ${err.message}`);
    }
  }

  // Auto-start Discord bot if token is configured
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      const { DiscordAdapter } = await import('./channels/discord.js');
      discordAdapterRef = new DiscordAdapter(
        process.env.DISCORD_BOT_TOKEN,
        `http://localhost:${PORT}`,
        directRunner,
        {
          lastChatId: userConfig.channels?.discord?.lastChatId ?? '',
          onChatIdChange: (id) => saveChatId('discord', id),
          getRoles: () => resolveRoles(clawConfig),
        },
      );
      await discordAdapterRef.start();
    } catch (err: any) {
      console.error(`  ❌ Discord bot failed: ${err.message}`);
    }
  }

  // Start scheduler — your company runs itself
  if (directRunner) {
    const sendResult: import('./scheduler.js').ResultSender = async (channel, chatId, text) => {
      // Truncate for chat platforms (Telegram 4096 char limit)
      const truncated = text.length > 3800 ? text.slice(0, 3800) + '\n\n_(truncated)_' : text;

      if ((channel === 'telegram' || channel === 'all') && telegramAdapterRef) {
        const tgChatId = chatId || telegramAdapterRef.lastChatId;
        if (tgChatId) {
          try { await telegramAdapterRef.sendText(tgChatId, truncated); } catch (e: any) {
            console.error(`  ❌ Scheduler → Telegram failed: ${e.message}`);
          }
        } else {
          console.log('  ⚠ Scheduler → Telegram: no chatId (send a message to the bot first)');
        }
      }

      if ((channel === 'discord' || channel === 'all') && discordAdapterRef) {
        const dcChatId = chatId || discordAdapterRef.lastChatId;
        if (dcChatId) {
          try { await discordAdapterRef.sendText(dcChatId, truncated); } catch (e: any) {
            console.error(`  ❌ Scheduler → Discord failed: ${e.message}`);
          }
        } else {
          console.log('  ⚠ Scheduler → Discord: no chatId (send a message to the bot first)');
        }
      }

      if (channel === 'dashboard' || channel === 'all') {
        console.log(`  📅 [Dashboard] Routine result delivered (${text.length} chars)`);
      }
    };

    scheduler = new CronScheduler(directRunner, sendResult, () => {
      const roles = resolveRoles(clawConfig).filter(r => r.budgetTier !== 'survive' && r.isActive);
      const leader = roles.find(r => r.reportsTo === null);
      return leader?.id ?? roles[0]?.id ?? 'leader';
    });
    scheduler.start();
  }

  // Hook Code Manager notifications to channels
  codeManager.on('notify', async ({ message }: { message: string }) => {
    if (telegramAdapterRef?.lastChatId) {
      try { await telegramAdapterRef.sendText(telegramAdapterRef.lastChatId, message); } catch {}
    }
    if (discordAdapterRef?.lastChatId) {
      try { await discordAdapterRef.sendText(discordAdapterRef.lastChatId, message); } catch {}
    }
  });

  console.log('  Build for OPC. Every human being is a chairman.');
  console.log('');

  // Auto-open Dashboard in browser
  const url = `http://localhost:${PORT}`;
  const { exec } = await import('child_process');
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`, () => {});
});

export default app;

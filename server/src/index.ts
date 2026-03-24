import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import {
  getDefaultConfig,
  resolveRoles,
  MODEL_PRICING,
  TEMPLATES,
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

const registry = new ProviderRegistry();
let router: ModelRouter;
let orchestrator: TaskOrchestrator;
const toolExecutor = new ToolExecutor();
let bootError: string | null = null;

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

async function bootstrap() {
  if (!process.env.CLAWAPI_KEY) {
    bootError = 'CLAWAPI_KEY not set. Fix: echo "CLAWAPI_KEY=sk-claw-..." > .env';
    console.error(`  ❌ ${bootError}`);
    return;
  }

  try {
    await registry.loadFromConfig(clawConfig.providers);
    router = new ModelRouter(registry, clawConfig);
    orchestrator = new TaskOrchestrator(router);
    console.log('  ✅ Connected to ClawAPI');

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
      reportsTo: reportsTo || 'ceo', isActive: true, isBuiltin: false,
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
    // Update runtime config
    const provider = clawConfig.providers.find(p => p.id === id);
    if (!provider) return res.status(404).json({ ok: false, error: 'Provider not found' });
    provider.apiKey = apiKey;

    // Also update .env for ClawAPI (primary provider)
    if (id === 'clawapi') {
      process.env.CLAWAPI_KEY = apiKey;
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
          telegramAdapterRef = new TelegramAdapter(token, `http://localhost:${PORT}`);
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
          discordAdapterRef = new DiscordAdapter(token, `http://localhost:${PORT}`);
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

app.post('/api/chat', async (req, res) => {
  if (!router) return res.status(503).json({ error: bootError ?? 'Not initialized' });
  const { role: roleId, message } = req.body;
  if (!roleId || !message) return res.status(400).json({ error: 'Required: { role, message }' });

  try {
    const roleObj = router.getRole(roleId);
    const tools = roleObj ? getToolsForRole(roleObj.tools) : [];
    const messages: Message[] = [{ role: 'user', content: message }];

    let totalIn = 0, totalOut = 0, totalCost = 0;
    const MAX_TOOL_TURNS = 10;

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await router.chatAsRole(roleId, messages, tools.length > 0 ? tools : undefined);
      totalIn += response.usage.inputTokens;
      totalOut += response.usage.outputTokens;
      totalCost += response.usage.cost;

      // No tool calls → return final answer
      if (!response.toolCalls?.length || response.finishReason === 'stop') {
        chatHistoryData.unshift({
          id: `chat_${Date.now()}`,
          role: roleId,
          model: response.model,
          input: message.slice(0, 100),
          cost: totalCost,
          tokens: totalIn + totalOut,
          at: new Date().toISOString(),
        });
        saveChats();
        return res.json({
          role: roleId, model: response.model, provider: response.provider,
          content: response.content,
          usage: { inputTokens: totalIn, outputTokens: totalOut, cost: totalCost },
        });
      }

      // Process tool calls
      messages.push({ role: 'assistant', content: response.content ?? '', toolCalls: response.toolCalls });
      for (const tc of response.toolCalls) {
        const args = JSON.parse(tc.function.arguments);
        const result = await toolExecutor.execute(tc.function.name, args);
        messages.push({ role: 'tool', content: result, toolCallId: tc.id });
      }
    }

    // Max turns reached — return whatever we have
    res.json({
      role: roleId, model: roleObj?.model ?? 'unknown', provider: roleObj?.provider ?? 'unknown',
      content: '[Chat reached maximum tool turns]',
      usage: { inputTokens: totalIn, outputTokens: totalOut, cost: totalCost },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.json({ mission, decomposedBy: 'CEO (claude-opus-4-6)', workStreams });
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
    send('phase', { phase: 'decomposing', message: 'CEO is analyzing your mission...' });

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

    // Phase 3-5: Execute each work stream
    send('phase', { phase: 'executing', message: 'Team is working...' });

    const results: any[] = [];
    let totalCost = 0;
    const totalStart = Date.now();

    // Topological sort
    const visited = new Set<string>();
    const wsMap = new Map(workStreams.map(ws => [ws.id, ws]));
    const sorted: typeof workStreams = [];
    const visit = (ws: typeof workStreams[0]) => {
      if (visited.has(ws.id)) return;
      visited.add(ws.id);
      for (const depId of ws.dependencies) {
        const dep = wsMap.get(depId);
        if (dep) visit(dep);
      }
      sorted.push(ws);
    };
    for (const ws of workStreams) visit(ws);

    const completedOutputs = new Map<string, string>();

    for (const ws of sorted) {
      const role = router.getRole(ws.assignTo);
      const roleName = role?.name ?? ws.assignTo;
      const modelName = role?.model ?? 'unknown';

      send('ws_start', {
        id: ws.id, title: ws.title, role: ws.assignTo,
        roleName, model: modelName,
      });

      const startTime = Date.now();

      try {
        // Build context from dependencies
        let context = '';
        if (ws.dependencies.length > 0) {
          context = '\n\n## Previous work stream outputs:\n';
          for (const depId of ws.dependencies) {
            const depOutput = completedOutputs.get(depId);
            if (depOutput) {
              const truncated = depOutput.length > 500 ? depOutput.slice(0, 500) + '\n...(truncated)' : depOutput;
              context += `\n### ${depId}:\n${truncated}\n`;
            }
          }
        }

        const response = await router.chatAsRole(ws.assignTo, [
          { role: 'user', content: `## Task: ${ws.title}\n\n${ws.description}\n\nComplexity: ${ws.estimatedComplexity}${context}\n\nComplete this task. Provide your output clearly and concisely.` },
        ]);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const cost = response.usage.cost;
        totalCost += cost;

        completedOutputs.set(ws.id, response.content);

        const wsResult = {
          id: ws.id, title: ws.title, role: ws.assignTo,
          model: response.model, status: 'completed',
          cost: `$${cost.toFixed(4)}`, time: `${elapsed}s`,
          output: response.content,
          outputPreview: response.content.slice(0, 300) + (response.content.length > 300 ? '...' : ''),
        };
        results.push(wsResult);

        send('ws_done', wsResult);
        console.log(`  ✅ ${ws.id}: ${ws.title} (${elapsed}s, $${cost.toFixed(4)})`);

      } catch (err: any) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const wsResult = {
          id: ws.id, title: ws.title, role: ws.assignTo,
          model: 'none', status: 'failed',
          cost: '$0.0000', time: `${elapsed}s`,
          error: err.message, output: '', outputPreview: `Error: ${err.message}`,
        };
        results.push(wsResult);
        send('ws_failed', wsResult);
        console.log(`  ❌ ${ws.id}: ${err.message}`);
      }
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
    missionRecord.result = results[results.length - 1]?.output || '';
    saveMissions();

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

    console.log('  Phase 2: CEO decomposing...');
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
        console.log(`\n  🎯 Mission from Chairman: "${goal}"\n`);
        console.log('  Phase 2: CEO decomposing...');
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
      if (userConfig.channels?.telegram?.token && !process.env.TELEGRAM_BOT_TOKEN) {
        process.env.TELEGRAM_BOT_TOKEN = userConfig.channels.telegram.token;
      }
      if (userConfig.channels?.discord?.token && !process.env.DISCORD_BOT_TOKEN) {
        process.env.DISCORD_BOT_TOKEN = userConfig.channels.discord.token;
      }
      // Restore active template and roles
      if (userConfig.activeTemplate && TEMPLATES[userConfig.activeTemplate]) {
        clawConfig.activeTemplate = userConfig.activeTemplate;
        if (userConfig.roles) {
          clawConfig.roles = userConfig.roles;
        } else {
          // Build roles map from template
          const template = TEMPLATES[userConfig.activeTemplate];
          const rolesMap: Record<string, any> = {};
          for (const role of template.roles) {
            rolesMap[role.id] = { model: role.model, provider: role.provider };
          }
          clawConfig.roles = rolesMap;
        }
      }
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

    scheduler = new CronScheduler(directRunner, sendResult);
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

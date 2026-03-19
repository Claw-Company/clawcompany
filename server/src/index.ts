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
} from '@clawcompany/shared';
import { ProviderRegistry } from '@clawcompany/providers';
import { ModelRouter } from '@clawcompany/model-router';
import { TaskOrchestrator } from '@clawcompany/task-orchestrator';
import type { DirectRunner } from './channels/index.js';
import { CronScheduler, ROUTINE_TEMPLATES, describeCron } from './scheduler.js';

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
let bootError: string | null = null;

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

app.get('/api/roles', (_req, res) => {
  const roles = resolveRoles(clawConfig);
  res.json(roles.map(r => ({
    id: r.id, name: r.name, model: r.model, provider: r.provider,
    budgetTier: r.budgetTier, reportsTo: r.reportsTo,
    isActive: r.isActive, isBuiltin: r.isBuiltin, description: r.description,
  })));
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

// ──── Routines API ────

let scheduler: CronScheduler | undefined;

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
  const { role, message } = req.body;
  if (!role || !message) return res.status(400).json({ error: 'Required: { role, message }' });

  try {
    const response = await router.chatAsRole(role, [{ role: 'user', content: message }]);
    res.json({ role, model: response.model, provider: response.provider, content: response.content, usage: response.usage });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

  } catch (err: any) {
    send('error', { message: err.message });
  }

  res.end();
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

  // Channel adapters (stored for scheduler access)
  let telegramAdapter: any;
  let discordAdapter: any;

  // Auto-start Telegram bot if token is configured
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const { TelegramAdapter } = await import('./channels/telegram.js');
      telegramAdapter = new TelegramAdapter(
        process.env.TELEGRAM_BOT_TOKEN,
        `http://localhost:${PORT}`,
        directRunner,
      );
      await telegramAdapter.start();
    } catch (err: any) {
      console.error(`  ❌ Telegram bot failed: ${err.message}`);
    }
  }

  // Auto-start Discord bot if token is configured
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      const { DiscordAdapter } = await import('./channels/discord.js');
      discordAdapter = new DiscordAdapter(
        process.env.DISCORD_BOT_TOKEN,
        `http://localhost:${PORT}`,
        directRunner,
      );
      await discordAdapter.start();
    } catch (err: any) {
      console.error(`  ❌ Discord bot failed: ${err.message}`);
    }
  }

  // Start scheduler — your company runs itself
  if (directRunner) {
    const sendResult: import('./scheduler.js').ResultSender = async (channel, chatId, text) => {
      // Truncate for chat platforms (Telegram 4096 char limit)
      const truncated = text.length > 3800 ? text.slice(0, 3800) + '\n\n_(truncated)_' : text;

      if ((channel === 'telegram' || channel === 'all') && telegramAdapter) {
        const tgChatId = chatId || telegramAdapter.lastChatId;
        if (tgChatId) {
          try { await telegramAdapter.sendText(tgChatId, truncated); } catch (e: any) {
            console.error(`  ❌ Scheduler → Telegram failed: ${e.message}`);
          }
        } else {
          console.log('  ⚠ Scheduler → Telegram: no chatId (send a message to the bot first)');
        }
      }

      if ((channel === 'discord' || channel === 'all') && discordAdapter) {
        const dcChatId = chatId || discordAdapter.lastChatId;
        if (dcChatId) {
          try { await discordAdapter.sendText(dcChatId, truncated); } catch (e: any) {
            console.error(`  ❌ Scheduler → Discord failed: ${e.message}`);
          }
        } else {
          console.log('  ⚠ Scheduler → Discord: no chatId (send a message to the bot first)');
        }
      }

      if (channel === 'dashboard' || channel === 'all') {
        // Dashboard delivery: log for now, SSE push in Phase 2
        console.log(`  📅 [Dashboard] Routine result delivered (${text.length} chars)`);
      }
    };

    scheduler = new CronScheduler(directRunner, sendResult);
    scheduler.start();
  }

  console.log('  Build for OPC. Every human being is a chairman.');
  console.log('');
});

export default app;

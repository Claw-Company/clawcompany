import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import {
  getDefaultConfig,
  resolveRoles,
  MODEL_PRICING,
} from '@clawcompany/shared';
import { ProviderRegistry } from '@clawcompany/providers';
import { ModelRouter } from '@clawcompany/model-router';
import { TaskOrchestrator } from '@clawcompany/task-orchestrator';

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
    version: '0.1.0',
    name: 'ClawCompany',
    tagline: 'Build for OPC. Every human being is a chairman.',
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

app.post('/api/mission/run', async (req, res) => {
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
      totalTime: `${report.totalTimeSeconds}s`,
      workStreams: report.workStreams.map(ws => ({
        id: ws.workStreamId, title: ws.title, role: ws.assignedTo,
        model: ws.model, status: ws.status, cost: `$${ws.cost.toFixed(4)}`,
        outputPreview: ws.output.slice(0, 300) + (ws.output.length > 300 ? '...' : ''),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log('');
  console.log('  🦞 ClawCompany server running');
  console.log(`  → Dashboard: http://localhost:${PORT}`);
  console.log(`  → API: http://localhost:${PORT}/api/health`);
  console.log('');
  await bootstrap();
  console.log('  Build for OPC. Every human being is a chairman.');
  console.log('');
});

export default app;

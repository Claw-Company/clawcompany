import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import {
  getDefaultConfig,
  resolveRoles,
  MODEL_PRICING,
} from '@clawcompany/shared';
import { ProviderRegistry } from '@clawcompany/providers';
import { ModelRouter } from '@clawcompany/model-router';
import { TaskOrchestrator } from '@clawcompany/task-orchestrator';

config({ path: '../.env' });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ?? 3200;

// ──────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────

const clawConfig = getDefaultConfig();
clawConfig.providers[0].apiKey = process.env.CLAWAPI_KEY ?? '';

const registry = new ProviderRegistry();
let router: ModelRouter;
let orchestrator: TaskOrchestrator;
let bootError: string | null = null;

async function bootstrap() {
  if (!process.env.CLAWAPI_KEY) {
    bootError = 'CLAWAPI_KEY not set. Run: echo "CLAWAPI_KEY=sk-claw-..." > .env';
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
    tagline: 'Build for WEB4.0, Claws Autonomous.',
    error: bootError,
  });
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

// Chat as a specific role
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

// Decompose a mission (Phase 2 only)
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
    res.json({ mission, workStreams });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ★ Full mission execution (Phase 2-6: decompose → execute → report)
app.post('/api/mission/run', async (req, res) => {
  if (!orchestrator) return res.status(503).json({ error: bootError ?? 'Not initialized' });
  const { mission } = req.body;
  if (!mission) return res.status(400).json({ error: 'Required: { mission: "..." }' });

  try {
    console.log(`\n  🎯 New mission: "${mission}"\n`);

    // Phase 2: Decompose
    console.log('  Phase 2: Decomposing...');
    const missionObj = {
      id: `mission-${Date.now()}`, companyId: 'default', content: mission,
      status: 'decomposing' as const, priority: 'normal' as const,
      approvalRequired: false, totalCost: 0, createdAt: new Date().toISOString(),
    };

    const workStreams = await orchestrator.decompose(missionObj);
    console.log(`  ✅ Decomposed into ${workStreams.length} work streams\n`);

    // Phase 3-5: Execute all work streams
    console.log('  Phase 3-5: Executing...');
    const report = await orchestrator.executeMission(missionObj, workStreams);

    // Phase 6: Deliver
    console.log('  Phase 6: Delivering result to Board\n');

    res.json({
      status: 'completed',
      mission: report.mission,
      totalCost: `$${report.totalCost.toFixed(4)}`,
      totalTime: `${report.totalTimeSeconds}s`,
      workStreams: report.workStreams.map(ws => ({
        id: ws.workStreamId,
        title: ws.title,
        role: ws.assignedTo,
        model: ws.model,
        status: ws.status,
        cost: `$${ws.cost.toFixed(4)}`,
        outputPreview: ws.output.slice(0, 300) + (ws.output.length > 300 ? '...' : ''),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────
// Start
// ──────────────────────────────────────────

app.listen(PORT, async () => {
  console.log('');
  console.log('  🦞 ClawCompany server running');
  console.log(`  → http://localhost:${PORT}`);
  console.log('');
  await bootstrap();
  console.log('  Build for WEB4.0, Claws Autonomous.');
  console.log('');
});

export default app;

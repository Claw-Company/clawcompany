import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import {
  getDefaultConfig,
  resolveRoles,
  BUILTIN_ROLES,
  MODEL_PRICING,
} from '@clawcompany/shared';
import { ProviderRegistry } from '@clawcompany/providers';
import { ModelRouter } from '@clawcompany/model-router';

config({ path: '../.env' }); // Load .env

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ?? 3200;

// ──────────────────────────────────────────
// Bootstrap: connect to ClawAPI
// ──────────────────────────────────────────

const clawConfig = getDefaultConfig();

// Resolve the API key from env
clawConfig.providers[0].apiKey = process.env.CLAWAPI_KEY ?? '';

const registry = new ProviderRegistry();
let router: ModelRouter;
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
    console.log('  ✅ Connected to ClawAPI');

    const models = await registry.getDefault().listModels();
    console.log(`  ✅ ${models.length} models available`);

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

// List all roles and their model bindings
app.get('/api/roles', (_req, res) => {
  const roles = resolveRoles(clawConfig);
  res.json(roles.map(r => ({
    id: r.id,
    name: r.name,
    model: r.model,
    provider: r.provider,
    budgetTier: r.budgetTier,
    reportsTo: r.reportsTo,
    isActive: r.isActive,
    isBuiltin: r.isBuiltin,
    description: r.description,
  })));
});

// List providers
app.get('/api/providers', (_req, res) => {
  res.json(registry.list());
});

// List available models from all providers
app.get('/api/models', async (_req, res) => {
  try {
    const provider = registry.getDefault();
    const models = await provider.listModels();
    res.json(models);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ★ Test: chat as a specific role
app.post('/api/chat', async (req, res) => {
  if (!router) {
    return res.status(503).json({ error: bootError ?? 'Not initialized' });
  }

  const { role, message } = req.body;

  if (!role || !message) {
    return res.status(400).json({ error: 'Required: { role: "chairman", message: "..." }' });
  }

  try {
    const response = await router.chatAsRole(role, [
      { role: 'user', content: message },
    ]);

    res.json({
      role,
      model: response.model,
      provider: response.provider,
      content: response.content,
      usage: response.usage,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ★ Test: Chairman decomposes a mission
app.post('/api/mission/test', async (req, res) => {
  if (!router) {
    return res.status(503).json({ error: bootError ?? 'Not initialized' });
  }

  const { mission } = req.body;
  if (!mission) {
    return res.status(400).json({ error: 'Required: { mission: "..." }' });
  }

  try {
    // Import TaskOrchestrator
    const { TaskOrchestrator } = await import('@clawcompany/task-orchestrator');
    const orchestrator = new TaskOrchestrator(router);

    const workStreams = await orchestrator.decompose({
      id: 'test-mission-1',
      companyId: 'test',
      content: mission,
      status: 'decomposing',
      priority: 'normal',
      approvalRequired: false,
      totalCost: 0,
      createdAt: new Date().toISOString(),
    });

    res.json({
      mission,
      decomposedBy: 'Chairman (claude-opus-4-6)',
      workStreams,
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

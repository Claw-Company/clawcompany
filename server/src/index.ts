import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

config(); // Load .env

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ?? 3200;

// ──────────────────────────────────────────
// Health
// ──────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    name: 'ClawCompany',
    tagline: 'Build for WEB4.0, Claws Autonomous.',
  });
});

// ──────────────────────────────────────────
// Status
// ──────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  res.json({
    company: 'Not initialized. Run `clawcompany init` first.',
    agents: [],
    activeMissions: 0,
  });
});

// ──────────────────────────────────────────
// Placeholder routes (Step 5 of execution plan)
// ──────────────────────────────────────────

app.get('/api/companies', (_req, res) => res.json([]));
app.get('/api/roles', (_req, res) => res.json([]));
app.get('/api/providers', (_req, res) => res.json([]));
app.get('/api/missions', (_req, res) => res.json([]));
app.get('/api/tasks', (_req, res) => res.json([]));
app.get('/api/audit', (_req, res) => res.json([]));

// ──────────────────────────────────────────
// Start
// ──────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('  🦞 ClawCompany server running');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Health: http://localhost:${PORT}/api/health`);
  console.log('');
  console.log('  Build for WEB4.0, Claws Autonomous.');
  console.log('');
});

export default app;

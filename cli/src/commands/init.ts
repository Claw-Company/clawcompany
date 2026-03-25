import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { input, select, confirm } from '@inquirer/prompts';
import {
  banner,
  configExists,
  readConfig,
  writeConfig,
  getConfigDir,
} from '../utils.js';
import { BUILTIN_ROLES, MODEL_PRICING } from '@clawcompany/shared';

export async function initCommand() {
  banner();

  // ──────────────────────────────────────
  // Check if already set up
  // ──────────────────────────────────────

  if (configExists()) {
    const config = readConfig();
    if (config) {
      console.log(`  ✓ Company "${config.companyName}" already exists.`);
      console.log(`  ✓ Config: ${getConfigDir()}/config.json`);
      console.log('');

      const reset = await confirm({
        message: 'Reset and start over?',
        default: false,
      });

      if (!reset) {
        console.log('');
        showNextSteps(config.companyName);
        return;
      }
      console.log('');
    }
  }

  console.log('  Welcome! Let\'s set up your AI company.\n');

  // ──────────────────────────────────────
  // Step 1: Company name
  // ──────────────────────────────────────

  console.log('  Step 1/2: Name your company\n');

  const companyName = await input({
    message: 'Company name:',
    default: 'My AI Company',
  });

  console.log('');

  // ──────────────────────────────────────
  // Step 2: Template
  // ──────────────────────────────────────

  console.log('  Step 2/2: Choose a template\n');

  const template = await select({
    message: 'Template:',
    choices: [
      {
        name: '🦞 Default — 9 roles, general purpose',
        value: 'default',
      },
      {
        name: '🚀 YC Startup — 7 roles, ship fast',
        value: 'yc_startup',
      },
      {
        name: '📈 Trading Desk — 7 roles, Bull vs Bear',
        value: 'trading',
      },
      {
        name: '🔬 AutoResearch Lab — 5 roles, Karpathy Loop',
        value: 'research_lab',
      },
    ],
  });

  console.log('');

  // ──────────────────────────────────────
  // Check for existing API key
  // ──────────────────────────────────────

  let apiKey = '';

  // Check .env file
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(/CLAWAPI_KEY=(.+)/);
    if (match && match[1].trim()) {
      apiKey = match[1].trim();
      console.log('  ✓ Found ClawAPI key in .env\n');
    }
  }

  if (!apiKey) {
    console.log('  ℹ  API key not set. You can add it later in Dashboard → Settings.');
    console.log('     Code Manager, Roles, and Studio work without an API key.');
    console.log('     To run Missions and Chat, add your key at http://localhost:3200 → Settings.\n');
  }

  // ──────────────────────────────────────
  // Create company
  // ──────────────────────────────────────

  console.log('  Creating company...\n');

  const config = {
    apiKey,
    companyName,
    template,
    serverPort: 3200,
    createdAt: new Date().toISOString(),
  };

  writeConfig(config);

  // Show the team
  const roles = BUILTIN_ROLES.filter(r => r.isActive && r.budgetTier !== 'survive');
  console.log(`  ✓ Company "${companyName}" created`);
  console.log(`  ✓ ${roles.length} agents hired:\n`);

  const maxName = Math.max(...roles.map(r => r.name.length));
  for (const role of roles) {
    const pricing = MODEL_PRICING[role.model];
    const cost = pricing ? `$${pricing.input}/$${pricing.output}` : '';
    console.log(`     ${role.name.padEnd(maxName + 2)}→ ${role.model} (${cost})`);
  }

  console.log('');
  console.log(`  ✓ Config saved to ${getConfigDir()}/config.json`);
  console.log('');

  // ──────────────────────────────────────
  // Next steps
  // ──────────────────────────────────────

  showNextSteps(companyName);
}

function showNextSteps(companyName: string) {
  console.log('  ─────────────────────────────────────────\n');
  console.log(`  "${companyName}" is ready! You are the Chairman.\n`);
  console.log('  Try:\n');
  console.log('    clawcompany mission "Write a competitive analysis of OpenAI vs Anthropic"');
  console.log('    clawcompany status');
  console.log('    clawcompany role list');
  console.log('');
  console.log('  Build for OPC. Every human being is a chairman.');
  console.log('');
}

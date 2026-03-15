import { input, select, confirm } from '@inquirer/prompts';
import {
  banner,
  configExists,
  readConfig,
  writeConfig,
  validateClawApiKey,
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
  // Step 1: ClawAPI key
  // ──────────────────────────────────────

  console.log('  Step 1/3: Connect to ClawAPI\n');

  let apiKey = '';
  let keyValid = false;

  while (!keyValid) {
    apiKey = await input({
      message: 'Enter your ClawAPI key:',
      validate: (v) => {
        if (!v.trim()) return 'Key is required.';
        if (!v.startsWith('sk-claw-')) return 'Key should start with sk-claw-';
        return true;
      },
    });

    console.log('');
    console.log('  Verifying key...');

    const result = await validateClawApiKey(apiKey.trim());

    if (result.valid) {
      console.log('  ✓ Key verified\n');
      keyValid = true;
    } else {
      console.log(`  ✗ ${result.error}`);
      console.log('    Get a key at https://clawapi.org\n');
    }
  }

  // ──────────────────────────────────────
  // Step 2: Company name
  // ──────────────────────────────────────

  console.log('  Step 2/3: Name your company\n');

  const companyName = await input({
    message: 'Company name:',
    default: 'My AI Company',
  });

  console.log('');

  // ──────────────────────────────────────
  // Step 3: Template
  // ──────────────────────────────────────

  console.log('  Step 3/3: Choose a template\n');

  const template = await select({
    message: 'Template:',
    choices: [
      {
        name: 'Default (CEO + CTO + CFO + CMO + Researcher + Analyst + Engineer + Secretary + Worker)',
        value: 'default',
      },
      {
        name: 'Trading Desk (+ Trader + Data Collector)',
        value: 'trading-desk',
      },
      {
        name: 'Content Agency (+ Writer + Editor + SEO)',
        value: 'content-agency',
      },
      {
        name: 'Dev Shop (+ QA + DevOps)',
        value: 'dev-shop',
      },
      {
        name: 'Solo Founder (CEO + Worker only — cheapest)',
        value: 'solo-founder',
      },
    ],
  });

  console.log('');

  // ──────────────────────────────────────
  // Create company
  // ──────────────────────────────────────

  console.log('  Creating company...\n');

  const config = {
    apiKey: apiKey.trim(),
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

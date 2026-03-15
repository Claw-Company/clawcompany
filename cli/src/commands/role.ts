import { banner, readConfig, apiGet, isServerRunning } from '../utils.js';
import { BUILTIN_ROLES, MODEL_PRICING } from '@clawcompany/shared';

export async function roleCommand() {
  // Default: show list
  await roleListCommand();
}

export async function roleListCommand() {
  banner();

  console.log('  👤 Chairman = Human (you)\n');

  const config = readConfig();
  const running = config ? await isServerRunning(config.serverPort) : false;

  // Try live data from server, fallback to builtin defaults
  let roles: any[];
  if (running && config) {
    try {
      roles = await apiGet('/api/roles', config.serverPort);
    } catch {
      roles = BUILTIN_ROLES;
    }
  } else {
    roles = BUILTIN_ROLES;
  }

  const active = roles.filter((r: any) => r.isActive && r.budgetTier !== 'survive');
  const inactive = roles.filter((r: any) => !r.isActive || r.budgetTier === 'survive');

  // Print active roles
  const maxName = Math.max(...active.map((r: any) => r.name.length));
  const maxModel = Math.max(...active.map((r: any) => r.model.length));

  for (const role of active) {
    const pricing = MODEL_PRICING[role.model];
    const cost = pricing ? `$${pricing.input}/$${pricing.output}` : '';
    const reports = role.reportsTo ? `→ ${role.reportsTo}` : '→ Human';
    console.log(
      `  ${role.name.padEnd(maxName + 2)} ${role.model.padEnd(maxModel + 2)} ${cost.padEnd(12)} reports ${reports}`
    );
  }

  if (inactive.length > 0) {
    console.log(`\n  + ${inactive.length} fallback/disabled roles`);
  }

  console.log('');
  console.log('  Customize:');
  console.log('    clawcompany role set cto --model deepseek-coder --provider deepseek');
  console.log('');
}

export async function roleSetCommand(roleId: string, opts: any) {
  banner();

  // For now, show what would change (full implementation needs server API)
  const role = BUILTIN_ROLES.find(r => r.id === roleId);
  if (!role) {
    console.log(`  ✗ Role "${roleId}" not found.`);
    console.log(`  Available: ${BUILTIN_ROLES.filter(r => r.budgetTier !== 'survive').map(r => r.id).join(', ')}\n`);
    return;
  }

  console.log(`  Role: ${role.name} (${roleId})`);
  console.log(`  Current model: ${role.model}`);
  if (opts.model) console.log(`  → New model: ${opts.model}`);
  if (opts.provider) console.log(`  → New provider: ${opts.provider}`);
  if (opts.name) console.log(`  → New name: ${opts.name}`);
  console.log('');
  console.log('  ⚠ Hot-reload coming soon. For now, edit config and restart server.\n');
}

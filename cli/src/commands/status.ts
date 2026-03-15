import { banner, readConfig, apiGet, isServerRunning } from '../utils.js';

export async function statusCommand() {
  banner();

  const config = readConfig();
  if (!config) {
    console.log('  ✗ No company set up yet.');
    console.log('  Fix: Run `npx clawcompany` to get started.\n');
    return;
  }

  console.log(`  Company: ${config.companyName}`);
  console.log(`  Template: ${config.template}`);
  console.log(`  Created: ${new Date(config.createdAt).toLocaleDateString()}`);
  console.log('');

  const running = await isServerRunning(config.serverPort);
  if (running) {
    console.log(`  ✓ Server running at http://localhost:${config.serverPort}`);

    try {
      const roles = await apiGet('/api/roles', config.serverPort);
      const active = roles.filter((r: any) => r.isActive && r.budgetTier !== 'survive');
      console.log(`  ✓ ${active.length} active roles\n`);

      const maxName = Math.max(...active.map((r: any) => r.name.length));
      for (const role of active) {
        console.log(`     ${role.name.padEnd(maxName + 2)}→ ${role.model}`);
      }
      console.log('');
    } catch {
      console.log('  ⚠ Could not fetch roles.\n');
    }
  } else {
    console.log(`  ✗ Server not running.`);
    console.log(`  Fix: Run \`clawcompany\` to start.\n`);
  }
}

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { missionCommand } from './commands/mission.js';
import { statusCommand } from './commands/status.js';
import { roleCommand } from './commands/role.js';
import { banner } from './utils.js';

const program = new Command();

program
  .name('clawcompany')
  .description('Build for OPC. Every human being is a chairman.')
  .version('0.1.0');

// `npx clawcompany` with no args → run onboarding
program
  .command('init', { isDefault: true })
  .description('Set up your AI company (runs automatically on first use)')
  .action(initCommand);

// `clawcompany mission "..."`
program
  .command('mission <goal>')
  .description('Give your company a mission')
  .option('-t, --template <name>', 'Override decomposition template')
  .action(missionCommand);

// `clawcompany status`
program
  .command('status')
  .description('Check company status and active missions')
  .action(statusCommand);

// `clawcompany role`
const role = program.command('role').description('Manage roles');

role
  .command('list')
  .description('List all roles and their model bindings')
  .action(async () => {
    const { roleListCommand } = await import('./commands/role.js');
    await roleListCommand();
  });

role
  .command('set <roleId>')
  .description('Modify a role')
  .option('-m, --model <model>', 'Set model')
  .option('-p, --provider <provider>', 'Set provider')
  .option('-n, --name <name>', 'Set display name')
  .action(async (roleId, opts) => {
    const { roleSetCommand } = await import('./commands/role.js');
    await roleSetCommand(roleId, opts);
  });

// Parse
program.parse();

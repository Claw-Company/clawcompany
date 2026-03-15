import {
  banner,
  readConfig,
  apiPost,
  isServerRunning,
} from '../utils.js';

export async function missionCommand(goal: string) {
  banner();

  // Check config
  const config = readConfig();
  if (!config) {
    console.log('  ✗ No company set up yet.');
    console.log('  Fix: Run `npx clawcompany` to get started.\n');
    return;
  }

  // Check server
  if (!(await isServerRunning(config.serverPort))) {
    console.log('  ✗ Server is not running.');
    console.log(`  Fix: Run \`clawcompany\` in another terminal first.\n`);
    return;
  }

  console.log(`  🎯 Mission: "${goal}"\n`);
  console.log('  Sending to CEO for decomposition...\n');

  try {
    const result = await apiPost('/api/mission/run', { mission: goal }, config.serverPort);

    if (result.status !== 'completed') {
      console.log(`  ✗ Mission failed: ${result.error ?? 'Unknown error'}`);
      console.log('  Fix: Check server logs or retry.\n');
      return;
    }

    // Show results
    console.log('  ─────────────────────────────────────────\n');
    console.log('  📋 Mission complete!\n');

    for (const ws of result.workStreams) {
      const icon = ws.status === 'completed' ? '✅' : '❌';
      console.log(`  ${icon} ${ws.title}`);
      console.log(`     Role: ${ws.role} (${ws.model})`);
      console.log(`     Cost: ${ws.cost}`);
      if (ws.outputPreview) {
        const preview = ws.outputPreview.slice(0, 120).replace(/\n/g, ' ');
        console.log(`     Preview: ${preview}...`);
      }
      console.log('');
    }

    console.log('  ─────────────────────────────────────────\n');
    console.log(`  Total cost: ${result.totalCost}`);
    console.log(`  Total time: ${result.totalTime}`);
    console.log(`  Work streams: ${result.workStreams.length}`);
    console.log('');
    console.log('  You are the Chairman. Approve, revise, or override.');
    console.log('');
  } catch (err: any) {
    console.log(`  ✗ ${err.message}`);
    console.log('  Fix: Check if the server is running.\n');
  }
}

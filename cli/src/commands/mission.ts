import {
  banner,
  readConfig,
  apiPost,
  isServerRunning,
  readMemory,
  writeMemory,
  type ClawConfig,
} from '../utils.js';
import {
  getDefaultConfig,
  buildMemoryContext,
  updateMemoryFromMission,
} from '@clawcompany/shared';
import { ProviderRegistry } from '@clawcompany/providers';
import { ModelRouter } from '@clawcompany/model-router';
import { TaskOrchestrator } from '@clawcompany/task-orchestrator';

export async function missionCommand(goal: string) {
  banner();

  const config = readConfig();
  if (!config) {
    console.log('  ✗ No company set up yet.');
    console.log('  Fix: Run `npx clawcompany` to get started.\n');
    return;
  }

  console.log(`  🎯 Mission: "${goal}"\n`);

  // Server running → use API. Otherwise → run in-process.
  if (await isServerRunning(config.serverPort)) {
    await runViaServer(goal, config.serverPort);
  } else {
    await runInProcess(goal, config);
  }
}

/**
 * Route 1: Server is running → use HTTP API
 */
async function runViaServer(goal: string, port: number) {
  console.log('  Sending to CEO...\n');

  try {
    const result = await apiPost('/api/mission/run', { mission: goal }, port);

    if (result.status !== 'completed') {
      console.log(`  ✗ Mission failed: ${result.error ?? 'Unknown error'}`);
      console.log('  Fix: Check server logs or retry.\n');
      return;
    }

    printResults(result);
  } catch (err: any) {
    console.log(`  ✗ ${err.message}\n`);
  }
}

/**
 * Route 2: No server → run everything in-process.
 * User never needs to start a server separately.
 */
async function runInProcess(goal: string, userConfig: ClawConfig) {
  console.log('  Running in-process (no server needed)...\n');

  try {
    // Bootstrap with template roles if available
    const clawConfig = getDefaultConfig();
    clawConfig.providers[0].apiKey = userConfig.apiKey;

    // Apply template roles from config (set by market install)
    if (userConfig.roles) {
      clawConfig.roles = userConfig.roles;
    }

    const registry = new ProviderRegistry();
    await registry.loadFromConfig(clawConfig.providers);

    const router = new ModelRouter(registry, clawConfig);
    const orchestrator = new TaskOrchestrator(router);

    // Load company memory and inject into orchestrator
    const memory = readMemory();
    const memoryCtx = buildMemoryContext(memory);
    if (memoryCtx) {
      orchestrator.setMemoryContext(memoryCtx);
      console.log('  🧠 Company memory loaded\n');
    }

    // Phase 2: CEO decomposes
    console.log('  Phase 2: CEO decomposing...');
    const mission = {
      id: `mission-${Date.now()}`,
      companyId: 'default',
      content: goal,
      status: 'decomposing' as const,
      priority: 'normal' as const,
      approvalRequired: false,
      totalCost: 0,
      createdAt: new Date().toISOString(),
    };

    const workStreams = await orchestrator.decompose(mission);
    console.log(`  ✅ Decomposed into ${workStreams.length} work streams\n`);

    // Phase 3-5: Execute
    console.log('  Phase 3-5: Executing...');
    const report = await orchestrator.executeMission(mission, workStreams);

    console.log('  Phase 6: Delivering to Chairman\n');

    // Update company memory with mission insights
    const updatedMemory = updateMemoryFromMission(memory, {
      goal,
      cost: report.totalCost,
      duration: report.totalTimeSeconds,
      workStreams: report.workStreams.map(ws => ({
        title: ws.title,
        assignedTo: ws.assignedTo,
        status: ws.status,
        output: ws.output,
      })),
    }, goal);
    writeMemory(updatedMemory);
    console.log('  🧠 Memory updated\n');

    const result = {
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
    };

    printResults(result);
  } catch (err: any) {
    console.log(`  ✗ ${err.message}`);
    console.log('  Fix: Check your ClawAPI key or internet connection.\n');
  }
}

function printResults(result: any) {
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
}

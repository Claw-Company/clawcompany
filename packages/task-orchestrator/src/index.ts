import type {
  Mission,
  WorkStream,
  Task,
  Role,
  Report,
  ChatResponse,
} from '@clawcompany/shared';
import { ModelRouter } from '@clawcompany/model-router';
import { AgentExecutor } from '@clawcompany/agent-runtime';
import { ToolExecutor } from '@clawcompany/tools';

export { MissionLifecycle } from './lifecycle.js';

/**
 * Orchestrates the full mission lifecycle:
 * decompose → delegate → execute → report → deliver
 */
export class TaskOrchestrator {
  private executor: AgentExecutor;

  constructor(private router: ModelRouter) {
    this.executor = new AgentExecutor(router, new ToolExecutor());
  }

  /**
   * Phase 2: Decompose mission into work streams.
   * Uses CEO (Sonnet) — fast and reliable.
   * Will switch to Chairman (Opus) when ClawAPI supports longer timeouts.
   */
  async decompose(mission: Mission): Promise<WorkStream[]> {
    const decomposer = this.router.getRole('ceo');
    if (!decomposer) throw new Error('CEO role not configured');

    const roles = this.router.getRoles().filter((r) => r.isActive && r.budgetTier !== 'survive');
    const roleList = roles
      .map((r) => `- ${r.id}: ${r.name} (${r.model}) — ${r.description}`)
      .join('\n');

    const response = await this.router.chatAsRole('ceo', [
      {
        role: 'user',
        content: `You are decomposing a mission for the Chairman.

Mission from the Board of Directors:
"${mission.content}"

Priority: ${mission.priority}
${mission.deadline ? `Deadline: ${mission.deadline}` : ''}
${mission.budgetLimit ? `Budget limit: $${mission.budgetLimit}` : ''}

Available team:
${roleList}

Decompose into work streams. For each, specify:
- id (ws_1, ws_2, ...)
- title
- description (specific deliverable)
- assignTo (role id from list)
- dependencies (array of ws IDs this depends on)
- estimatedComplexity (low/medium/high)
- requiredTools (array)

IMPORTANT: Assign grunt work to worker (cheap). Technical work to cto. Keep it cost-efficient.

Respond ONLY with JSON:
{
  "workStreams": [ { "id": "ws_1", "title": "...", "description": "...", "assignTo": "worker", "dependencies": [], "estimatedComplexity": "low", "requiredTools": ["http"] } ]
}`,
      },
    ]);

    try {
      const cleaned = response.content.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return (parsed.workStreams ?? []).map((ws: any) => ({
        ...ws,
        missionId: mission.id,
        status: 'pending' as const,
      }));
    } catch {
      return [{
        id: 'ws_1',
        missionId: mission.id,
        title: mission.content.slice(0, 100),
        description: mission.content,
        assignTo: 'ceo',
        dependencies: [],
        estimatedComplexity: 'medium' as const,
        requiredTools: [],
        status: 'pending' as const,
      }];
    }
  }

  /**
   * Phase 3-5: Execute all work streams in dependency order,
   * collect results, and produce final output.
   */
  async executeMission(mission: Mission, workStreams: WorkStream[]): Promise<MissionReport> {
    const results = new Map<string, WorkStreamResult>();
    const totalStart = Date.now();
    let totalCost = 0;

    // Topological sort: execute in dependency order
    const order = this.topologicalSort(workStreams);

    console.log(`\n  📋 Executing ${order.length} work streams...\n`);

    for (const ws of order) {
      // Wait for dependencies
      const depOutputs: Record<string, string> = {};
      for (const depId of ws.dependencies) {
        const dep = results.get(depId);
        if (dep && dep.status === "completed") depOutputs[depId] = dep.output;
      }

      const role = this.router.getRole(ws.assignTo);
      const roleName = role?.name ?? ws.assignTo;
      const modelName = role?.model ?? 'unknown';

      console.log(`  ⚡ ${ws.id}: ${ws.title}`);
      console.log(`     → ${roleName} (${modelName})`);

      const startTime = Date.now();

      try {
        const output = await this.executeWorkStream(ws, depOutputs);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        results.set(ws.id, {
          workStreamId: ws.id,
          title: ws.title,
          assignedTo: ws.assignTo,
          output: output.content,
          cost: output.cost,
          tokensIn: output.tokensIn,
          tokensOut: output.tokensOut,
          model: output.model,
          status: 'completed',
        });

        totalCost += output.cost;
        console.log(`     ✅ Done (${elapsed}s, $${output.cost.toFixed(4)})\n`);
      } catch (err: any) {
        console.log(`     ❌ Failed: ${err.message}\n`);
        results.set(ws.id, {
          workStreamId: ws.id,
          title: ws.title,
          assignedTo: ws.assignTo,
          output: `Error: ${err.message}`,
          cost: 0,
          tokensIn: 0,
          tokensOut: 0,
          model: 'none',
          status: 'failed',
        });
      }
    }

    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
    console.log(`  📊 All work streams complete: ${totalElapsed}s, $${totalCost.toFixed(4)} total\n`);

    return {
      missionId: mission.id,
      mission: mission.content,
      workStreams: Array.from(results.values()),
      totalCost,
      totalTimeSeconds: parseFloat(totalElapsed),
    };
  }

  /**
   * Execute a single work stream with the assigned agent.
   */
  private async executeWorkStream(
    ws: WorkStream,
    dependencyOutputs: Record<string, string>,
  ): Promise<{ content: string; cost: number; tokensIn: number; tokensOut: number; model: string }> {
    // Build context from dependency outputs
    let context = '';
    if (Object.keys(dependencyOutputs).length > 0) {
      context = '\n\n## Previous work stream outputs:\n';
      for (const [id, output] of Object.entries(dependencyOutputs)) {
        // Truncate long outputs to avoid token explosion
        const truncated = output.length > 500 ? output.slice(0, 500) + '\n...(truncated)' : output;
        context += `\n### ${id}:\n${truncated}\n`;
      }
    }

    const response = await this.router.chatAsRole(ws.assignTo, [
      {
        role: 'user',
        content: `## Task: ${ws.title}

${ws.description}

Complexity: ${ws.estimatedComplexity}
${context}

Complete this task. Provide your output clearly and concisely.
If you reference data, be specific. If you make assumptions, state them.`,
      },
    ]);

    return {
      content: response.content,
      cost: response.usage.cost,
      tokensIn: response.usage.inputTokens,
      tokensOut: response.usage.outputTokens,
      model: response.model,
    };
  }

  /**
   * Topological sort: ensures work streams execute in dependency order.
   */
  private topologicalSort(workStreams: WorkStream[]): WorkStream[] {
    const sorted: WorkStream[] = [];
    const visited = new Set<string>();
    const wsMap = new Map(workStreams.map((ws) => [ws.id, ws]));

    const visit = (ws: WorkStream) => {
      if (visited.has(ws.id)) return;
      visited.add(ws.id);
      for (const depId of ws.dependencies) {
        const dep = wsMap.get(depId);
        if (dep) visit(dep);
      }
      sorted.push(ws);
    };

    for (const ws of workStreams) visit(ws);
    return sorted;
  }
}

export interface WorkStreamResult {
  workStreamId: string;
  title: string;
  assignedTo: string;
  output: string;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  model: string;
  status: 'completed' | 'failed';
}

export interface MissionReport {
  missionId: string;
  mission: string;
  workStreams: WorkStreamResult[];
  totalCost: number;
  totalTimeSeconds: number;
}

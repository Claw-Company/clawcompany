import type {
  Mission,
  WorkStream,
  Task,
  Role,
  ChatResponse,
} from '@clawcompany/shared';
import { ModelRouter } from '@clawcompany/model-router';
import { AgentExecutor } from '@clawcompany/agent-runtime';
import { ToolExecutor } from '@clawcompany/tools';

export { MissionLifecycle } from './lifecycle.js';

export class TaskOrchestrator {
  private executor: AgentExecutor;
  private memoryContext: string = '';

  constructor(private router: ModelRouter) {
    this.executor = new AgentExecutor(router, new ToolExecutor());
  }

  /** Set company memory context to inject into all agent prompts */
  setMemoryContext(ctx: string): void {
    this.memoryContext = ctx;
  }

  /** Get the leader role ID (reportsTo === null) */
  private getLeaderId(): string {
    const leader = this.router.getRoles().find((r) => r.reportsTo === null && r.budgetTier !== 'survive');
    return leader?.id ?? 'ceo';
  }

  /**
   * Phase 2: Leader decomposes mission into work streams.
   * Human (Chairman) gives the mission → leader breaks it down.
   */
  async decompose(mission: Mission): Promise<WorkStream[]> {
    const leader = this.router.getRoles().find((r) => r.reportsTo === null && r.budgetTier !== 'survive');
    if (!leader) throw new Error('No leader role configured');

    const roles = this.router.getRoles().filter((r) => r.isActive && r.id !== leader.id && r.budgetTier !== 'survive');
    const roleList = roles
      .map((r) => `- ${r.id}: ${r.name} (${r.model}) — ${r.description}`)
      .join('\n');

    const response = await this.router.chatAsRole(leader.id, [
      {
        role: 'user',
        content: `Mission from the Chairman (human):
"${mission.content}"

Priority: ${mission.priority}
${mission.deadline ? `Deadline: ${mission.deadline}` : ''}
${mission.budgetLimit ? `Budget limit: $${mission.budgetLimit}` : ''}
${this.memoryContext ? `${this.memoryContext}\n` : ''}
Your team:
${roleList}

Decompose into work streams. For each, specify:
- id (ws_1, ws_2, ...)
- title
- description (specific deliverable)
- assignTo (role id from list)
- dependencies (array of ws IDs this depends on)
- estimatedComplexity (low/medium/high)
- requiredTools (array)

IMPORTANT RULES:
1. You MUST create at least 3 different work streams using at least 3 different roles
2. NEVER assign the entire mission to one person — that is lazy and unacceptable
3. Break it down: data collection (worker), deep research (researcher), analysis (analyst/cfo), writing/positioning (cmo), formatting (secretary)
4. Assign grunt work to worker (cheap). Technical to cto/engineer. Financial to cfo/analyst. Marketing to cmo. Research to researcher. Format to secretary.
5. A mission with only 1 work stream will be REJECTED automatically

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
        assignTo: 'researcher',
        dependencies: [],
        estimatedComplexity: 'medium' as const,
        requiredTools: [],
        status: 'pending' as const,
      }];
    }
  }

  async executeMission(mission: Mission, workStreams: WorkStream[]): Promise<MissionReport> {
    const results = new Map<string, WorkStreamResult>();
    const totalStart = Date.now();
    let totalCost = 0;

    const order = this.topologicalSort(workStreams);

    console.log(`\n  📋 Executing ${order.length} work streams...\n`);

    for (const ws of order) {
      const depOutputs: Record<string, string> = {};
      for (const depId of ws.dependencies) {
        const dep = results.get(depId);
        if (dep && dep.status === 'completed') depOutputs[depId] = dep.output;
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

  private async executeWorkStream(
    ws: WorkStream,
    dependencyOutputs: Record<string, string>,
  ): Promise<{ content: string; cost: number; tokensIn: number; tokensOut: number; model: string; toolCallCount: number }> {
    let context = '';
    if (Object.keys(dependencyOutputs).length > 0) {
      context = '\n\n## Previous work stream outputs:\n';
      for (const [id, output] of Object.entries(dependencyOutputs)) {
        const truncated = output.length > 500 ? output.slice(0, 500) + '\n...(truncated)' : output;
        context += `\n### ${id}:\n${truncated}\n`;
      }
    }

    const role = this.router.getRole(ws.assignTo);
    if (!role) throw new Error(`Role "${ws.assignTo}" not found`);

    // Use AgentExecutor with full tool support (think → act → observe loop)
    const result = await this.executor.execute(role, {
      id: ws.id,
      companyId: 'default',
      missionId: ws.missionId,
      workStreamId: ws.id,
      title: ws.title,
      description: `${ws.description}\n\nComplexity: ${ws.estimatedComplexity}${context}${this.memoryContext ? `\n${this.memoryContext}` : ''}\n\nToday's date is ${new Date().toISOString().split('T')[0]}.`,
      assignedTo: ws.assignTo,
      createdBy: this.getLeaderId(),
      reportTo: this.getLeaderId(),
      status: 'in_progress' as any,
      priority: 1,
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      modelUsed: role.model,
      createdAt: new Date().toISOString(),
    });

    if (result.toolCallCount > 0) {
      console.log(`     🔧 ${result.toolCallCount} tool calls executed`);
    }

    return {
      content: result.output,
      cost: result.cost,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      model: result.modelUsed,
      toolCallCount: result.toolCallCount,
    };
  }

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

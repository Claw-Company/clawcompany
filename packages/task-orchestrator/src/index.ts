import type {
  Mission,
  MissionStatus,
  WorkStream,
  Task,
  Role,
} from '@clawcompany/shared';
import { ModelRouter } from '@clawcompany/model-router';
import { AgentExecutor } from '@clawcompany/agent-runtime';
import { ToolExecutor } from '@clawcompany/tools';

export { MissionLifecycle } from './lifecycle.js';

/**
 * Orchestrates the full flow: mission → decompose → delegate → execute → report → deliver.
 */
export class TaskOrchestrator {
  private executor: AgentExecutor;

  constructor(private router: ModelRouter) {
    this.executor = new AgentExecutor(router, new ToolExecutor());
  }

  /**
   * Phase 2: Chairman decomposes mission into work streams.
   */
  async decompose(mission: Mission): Promise<WorkStream[]> {
    const chairman = this.router.getRole('ceo');
    if (!chairman) throw new Error('Chairman role not configured');

    const roles = this.router.getRoles().filter((r) => r.isActive && r.id !== 'ceo');
    const roleList = roles
      .map((r) => `- ${r.id}: ${r.name} (${r.model}) — ${r.description}`)
      .join('\n');

    const response = await this.router.chatAsRole('ceo', [
      { role: 'system', content: chairman.systemPrompt },
      {
        role: 'user',
        content: `New mission from the Board of Directors:
"${mission.content}"

Priority: ${mission.priority}
${mission.deadline ? `Deadline: ${mission.deadline}` : ''}
${mission.budgetLimit ? `Budget limit: $${mission.budgetLimit}` : ''}

Your available team:
${roleList}

Decompose this mission into work streams. For each work stream, specify:
1. title — short name
2. description — what needs to be done
3. assignTo — role ID from the list above
4. dependencies — IDs of work streams this depends on (empty array if none)
5. estimatedComplexity — low, medium, or high

Respond in JSON format:
{
  "strategy": "your strategic analysis",
  "workStreams": [
    {
      "id": "ws_1",
      "title": "...",
      "description": "...",
      "assignTo": "worker",
      "dependencies": [],
      "estimatedComplexity": "low",
      "requiredTools": ["http"]
    }
  ]
}

Think about cost efficiency: delegate grunt work to cheap roles.`,
      },
    ]);

    try {
      const parsed = JSON.parse(
        response.content.replace(/```json\n?/g, '').replace(/```/g, '').trim(),
      );
      return (parsed.workStreams ?? []).map((ws: any) => ({
        ...ws,
        missionId: mission.id,
        status: 'pending' as const,
      }));
    } catch {
      // If Chairman didn't return valid JSON, create a single work stream
      return [
        {
          id: 'ws_1',
          missionId: mission.id,
          title: mission.content.slice(0, 100),
          description: mission.content,
          assignTo: 'ceo',
          dependencies: [],
          estimatedComplexity: 'medium' as const,
          requiredTools: [],
          status: 'pending' as const,
        },
      ];
    }
  }

  /**
   * Phase 4: Execute a single task with the assigned agent.
   */
  async executeTask(task: Task): Promise<{
    output: string;
    cost: number;
    tokensIn: number;
    tokensOut: number;
  }> {
    const role = this.router.getRole(task.assignedTo);
    if (!role) throw new Error(`Role "${task.assignedTo}" not found`);

    const result = await this.executor.execute(role, task);

    return {
      output: result.output,
      cost: result.cost,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  }
}

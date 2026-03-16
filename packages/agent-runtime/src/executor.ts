import type { Role, Message, Task, ChatResponse, ToolCall } from '@clawcompany/shared';
import { ModelRouter } from '@clawcompany/model-router';
import { ToolExecutor, getToolsForRole } from '@clawcompany/tools';

export interface ExecutionResult {
  output: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  modelUsed: string;
  toolCallCount: number;
}

/**
 * Executes a task by running the agent's think → act → observe loop.
 * Supports tool use with automatic re-prompting.
 */
export class AgentExecutor {
  constructor(
    private router: ModelRouter,
    private toolExecutor: ToolExecutor,
  ) {}

  async execute(role: Role, task: Task): Promise<ExecutionResult> {
    const tools = getToolsForRole(role.tools);
    let totalIn = 0;
    let totalOut = 0;
    let totalCost = 0;
    let toolCallCount = 0;

    // Build initial messages
    const messages: Message[] = [
      { role: 'system', content: role.systemPrompt },
      {
        role: 'user',
        content: this.buildTaskPrompt(task),
      },
    ];

    const MAX_TURNS = 15;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Think + Act
      const response = await this.router.chatAsRole(
        role.id,
        messages,
        tools.length > 0 ? tools : undefined,
      );

      totalIn += response.usage.inputTokens;
      totalOut += response.usage.outputTokens;
      totalCost += response.usage.cost;

      // If no tool calls, we're done
      if (!response.toolCalls?.length || response.finishReason === 'stop') {
        return {
          output: response.content,
          tokensIn: totalIn,
          tokensOut: totalOut,
          cost: totalCost,
          modelUsed: response.model,
          toolCallCount,
        };
      }

      // Process tool calls
      messages.push({
        role: 'assistant',
        content: response.content ?? '',
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        toolCallCount++;
        const args = JSON.parse(toolCall.function.arguments);
        const result = await this.toolExecutor.execute(
          toolCall.function.name,
          args,
        );

        messages.push({
          role: 'tool',
          content: result,
          toolCallId: toolCall.id,
        });
      }
      // Loop: the model will see the tool results and decide next action
    }

    // Hit max turns
    return {
      output: '[Agent reached maximum turns without completing]',
      tokensIn: totalIn,
      tokensOut: totalOut,
      cost: totalCost,
      modelUsed: role.model,
      toolCallCount,
    };
  }

  private buildTaskPrompt(task: Task): string {
    let prompt = `## Task: ${task.title}\n\n${task.description}`;

    if (task.context) {
      prompt += `\n\n## Context\n${JSON.stringify(task.context, null, 2)}`;
    }

    prompt += `\n\n## Instructions
Complete this task. If you need to use tools, use them.
When done, provide your final output clearly.
Report any issues or blockers you encountered.`;

    return prompt;
  }
}

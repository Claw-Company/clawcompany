import type { Role, Message, Task, Report, ChatResponse } from '@clawcompany/shared';
import { ModelRouter } from '@clawcompany/model-router';
import { ToolExecutor, getToolsForRole } from '@clawcompany/tools';

export { AgentExecutor } from './executor.js';

/**
 * Represents a running agent instance bound to a role.
 */
export interface AgentInstance {
  role: Role;
  router: ModelRouter;
  toolExecutor: ToolExecutor;
}

/**
 * Create an agent instance for a role.
 */
export function createAgent(role: Role, router: ModelRouter): AgentInstance {
  return {
    role,
    router,
    toolExecutor: new ToolExecutor(),
  };
}

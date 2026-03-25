import type {
  Role,
  ChatParams,
  ChatResponse,
  ClawCompanyConfig,
  Message,
  ToolDefinition,
} from '@clawcompany/shared';
import { resolveRoles, DEFAULT_FALLBACK_CHAIN } from '@clawcompany/shared';
import { ProviderRegistry } from '@clawcompany/providers';

export type StrategyMode = 'earn' | 'save' | 'survive';

export class ModelRouter {
  private roles: Role[];
  private fallbackChain: string[];

  constructor(
    private registry: ProviderRegistry,
    private config: ClawCompanyConfig,
  ) {
    this.roles = resolveRoles(config);
    this.fallbackChain = config.fallbackChain ?? DEFAULT_FALLBACK_CHAIN;
  }

  /**
   * Send a chat request as a specific role.
   * Automatically prepends the role's system prompt.
   */
  async chatAsRole(
    roleId: string,
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<ChatResponse> {
    const role = this.roles.find((r) => r.id === roleId);
    if (!role) throw new Error(`Role "${roleId}" not found`);
    if (!role.isActive) throw new Error(`Role "${roleId}" is disabled`);

    // ★ Auto-inject system prompt if not already present
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const hasSystem = messages.some((m) => m.role === 'system');
    const fullMessages: Message[] = hasSystem
      ? messages.map((m) => m.role === 'system' ? { ...m, content: m.content + `\n\nToday's date: ${dateStr}.` } : m)
      : [{ role: 'system', content: role.systemPrompt + `\n\nToday's date: ${dateStr}.` }, ...messages];

    const provider = this.registry.get(role.provider);

    try {
      return await provider.chat({
        model: role.model,
        messages: fullMessages,
        tools,
      });
    } catch (err) {
      if (err && typeof err === "object" && "status" in err) {
        if (err.status === 402) {
          console.warn(`[ModelRouter] ${role.name}: balance empty, falling back`);
          return this.fallback(fullMessages, tools);
        }
        if (err.status === 429) {
          console.warn(`[ModelRouter] ${role.name}: rate limited, retrying in 2s`);
          await sleep(2000);
          return provider.chat({ model: role.model, messages: fullMessages, tools });
        }
        if (err.status === 502 || err.status === 503) {
          console.warn(`[ModelRouter] ${role.name}: upstream down, retrying in 3s`);
          await sleep(3000);
          return provider.chat({ model: role.model, messages: fullMessages, tools });
        }
      }
      throw err;
    }
  }

  private async fallback(
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<ChatResponse> {
    for (const modelId of this.fallbackChain) {
      const provider = this.registry.findProviderForModel(modelId);
      if (!provider) continue;

      try {
        const result = await provider.chat({ model: modelId, messages, tools });
        console.log(`[ModelRouter] Fell back to ${modelId} via ${provider.name}`);
        return result;
      } catch {
        continue;
      }
    }

    throw new Error(
      'All models in the fallback chain failed. Please check your balance at clawapi.org or add another provider.',
    );
  }

  getStrategyMode(balance: number): StrategyMode {
    if (balance > 5) return 'earn';
    if (balance > 1) return 'save';
    return 'survive';
  }

  setRoleModel(roleId: string, model: string, provider?: string): void {
    const role = this.roles.find((r) => r.id === roleId);
    if (!role) throw new Error(`Role "${roleId}" not found`);
    role.model = model;
    if (provider) role.provider = provider;
    role.updatedAt = new Date().toISOString();
  }

  /** Re-resolve roles from the live config. Call after template switch or role CRUD. */
  refreshRoles(): void {
    this.roles = resolveRoles(this.config);
  }

  getRoles(): readonly Role[] {
    return this.roles;
  }

  getRole(id: string): Role | undefined {
    return this.roles.find((r) => r.id === id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

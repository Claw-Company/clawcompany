import type {
  Role,
  ChatParams,
  ChatResponse,
  ClawCompanyConfig,
  Message,
  ToolDefinition,
} from '@clawcompany/shared';
import { resolveRoles, DEFAULT_FALLBACK_CHAIN } from '@clawcompany/shared';
import { ProviderRegistry, ProviderError } from '@clawcompany/providers';

export type StrategyMode = 'earn' | 'save' | 'survive';

/**
 * Core differentiator: maps roles to models and handles automatic fallback.
 *
 * Instead of "which model do I use?", ClawCompany asks "which role is doing this?" —
 * the ModelRouter selects the right model automatically.
 */
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
   * The router selects the model and provider based on role config.
   */
  async chatAsRole(
    roleId: string,
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<ChatResponse> {
    const role = this.roles.find((r) => r.id === roleId);
    if (!role) throw new Error(`Role "${roleId}" not found`);
    if (!role.isActive) throw new Error(`Role "${roleId}" is disabled`);

    const provider = this.registry.get(role.provider);

    try {
      return await provider.chat({
        model: role.model,
        messages,
        tools,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        // 402 = no balance → cascade down fallback chain
        if (err.status === 402) {
          console.warn(`[ModelRouter] ${role.name}: balance empty, falling back`);
          return this.fallback(messages, tools);
        }
        // 429 = rate limit → retry once after delay
        if (err.status === 429) {
          console.warn(`[ModelRouter] ${role.name}: rate limited, retrying in 2s`);
          await sleep(2000);
          return provider.chat({ model: role.model, messages, tools });
        }
        // 502/503 = upstream down → retry once
        if (err.status === 502 || err.status === 503) {
          console.warn(`[ModelRouter] ${role.name}: upstream down, retrying in 3s`);
          await sleep(3000);
          return provider.chat({ model: role.model, messages, tools });
        }
      }
      throw err;
    }
  }

  /**
   * Walk the fallback chain until one model works.
   */
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

  /**
   * Determine which strategy mode the company is in based on balance.
   */
  getStrategyMode(balance: number): StrategyMode {
    if (balance > 5) return 'earn';
    if (balance > 1) return 'save';
    return 'survive';
  }

  /**
   * Hot-swap a role's model binding without restart.
   */
  setRoleModel(roleId: string, model: string, provider?: string): void {
    const role = this.roles.find((r) => r.id === roleId);
    if (!role) throw new Error(`Role "${roleId}" not found`);

    role.model = model;
    if (provider) role.provider = provider;
    role.updatedAt = new Date().toISOString();
  }

  /**
   * Get all active roles.
   */
  getRoles(): readonly Role[] {
    return this.roles;
  }

  /**
   * Get a role by ID.
   */
  getRole(id: string): Role | undefined {
    return this.roles.find((r) => r.id === id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

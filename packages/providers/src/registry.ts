import type { ProviderConfig, ModelInfo } from '@clawcompany/shared';
import { OpenAICompatibleProvider, type LLMProvider } from './openai-compatible.js';

/**
 * Central registry for all configured model suppliers.
 * ClawAPI is the default. Users can add Anthropic, OpenAI, DeepSeek, Ollama, or any
 * OpenAI-compatible endpoint.
 */
export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private defaultProviderId: string | null = null;

  /**
   * Load providers from config. Call once at startup.
   */
  async loadFromConfig(configs: ProviderConfig[]): Promise<void> {
    for (const config of configs) {
      const resolvedConfig = {
        ...config,
        apiKey: this.resolveEnvVar(config.apiKey),
      };

      const provider = this.createProvider(resolvedConfig);
      this.providers.set(config.id, provider);

      if (config.isDefault) {
        this.defaultProviderId = config.id;
      }

      // Discover models for 'auto' providers
      if (config.models === 'auto') {
        await provider.listModels();
      }
    }

    // If no default set, use first provider
    if (!this.defaultProviderId && configs.length > 0) {
      this.defaultProviderId = configs[0].id;
    }
  }

  /**
   * Get a specific provider by ID, or the default.
   */
  get(id?: string): LLMProvider {
    if (id) {
      const p = this.providers.get(id);
      if (p) return p;
    }
    if (this.defaultProviderId) {
      const p = this.providers.get(this.defaultProviderId);
      if (p) return p;
    }
    throw new Error('No providers configured. Run `clawcompany init` first.');
  }

  /**
   * Get the default provider (ClawAPI if configured).
   */
  getDefault(): LLMProvider {
    return this.get(this.defaultProviderId ?? undefined);
  }

  /**
   * Find the first provider that serves a given model.
   * Prefers the default provider if it has the model.
   */
  findProviderForModel(modelId: string): LLMProvider | null {
    // Check default first
    if (this.defaultProviderId) {
      const def = this.providers.get(this.defaultProviderId);
      if (def?.hasModel(modelId)) return def;
    }

    // Search all others
    for (const [, provider] of this.providers) {
      if (provider.hasModel(modelId)) return provider;
    }

    return null;
  }

  /**
   * Hot-add a provider without restart.
   */
  async add(config: ProviderConfig): Promise<void> {
    const resolvedConfig = {
      ...config,
      apiKey: this.resolveEnvVar(config.apiKey),
    };
    const provider = this.createProvider(resolvedConfig);

    if (config.models === 'auto') {
      await provider.listModels();
    }

    this.providers.set(config.id, provider);
  }

  /**
   * Remove a provider.
   */
  remove(id: string): boolean {
    if (id === this.defaultProviderId) {
      throw new Error('Cannot remove the default provider. Set another as default first.');
    }
    return this.providers.delete(id);
  }

  /**
   * List all registered providers.
   */
  list(): Array<{ id: string; name: string; isDefault: boolean }> {
    return Array.from(this.providers.entries()).map(([id, p]) => ({
      id,
      name: p.name,
      isDefault: id === this.defaultProviderId,
    }));
  }

  /**
   * Iterate over all provider entries.
   */
  entries(): IterableIterator<[string, LLMProvider]> {
    return this.providers.entries();
  }

  // ──────────────────────────────────────────
  // Internal
  // ──────────────────────────────────────────

  private createProvider(config: ProviderConfig): LLMProvider {
    // For now, all types use the OpenAI-compatible adapter.
    // Anthropic and Google native adapters can be added later —
    // they're also reachable via ClawAPI's OpenAI-compatible endpoint.
    switch (config.type) {
      case 'openai-compatible':
      case 'openai':
      case 'anthropic':
      case 'google-genai':
        return new OpenAICompatibleProvider(config);
      default:
        return new OpenAICompatibleProvider(config);
    }
  }

  /**
   * Resolve ${ENV_VAR} patterns in config values.
   */
  private resolveEnvVar(value: string): string {
    const match = value.match(/^\$\{(\w+)\}$/);
    if (match) {
      return process.env[match[1]] ?? value;
    }
    return value;
  }
}

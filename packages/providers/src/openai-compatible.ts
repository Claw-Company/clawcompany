import type {
  ProviderConfig,
  ChatParams,
  ChatResponse,
  ModelInfo,
} from '@clawcompany/shared';
import { calculateCost } from './pricing.js';

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
  listModels(): Promise<ModelInfo[]>;
  hasModel(modelId: string): boolean;
  healthCheck(): Promise<{ ok: boolean; balance?: number; error?: string }>;
}

/**
 * Universal adapter for any OpenAI-compatible endpoint.
 * Works with: ClawAPI, DeepSeek, Ollama, OpenRouter, SiliconFlow, vLLM, etc.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;
  private knownModels: Set<string> = new Set();

  constructor(private config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.apiKey = config.apiKey;

    // Pre-populate known models if provided statically
    if (Array.isArray(config.models)) {
      for (const m of config.models) {
        this.knownModels.add(m.id);
      }
    }
  }

  /**
   * Model fallback map: if a model fails with 504 (timeout),
   * automatically retry with a cheaper/faster model.
   */
  private static readonly MODEL_FALLBACK: Record<string, string> = {
    'gpt-5-mini': 'gemini-3.1-flash-lite',  // reasoning model timeout → fast model
    'gpt-5.4': 'claude-sonnet-4-6',          // GPT timeout → Sonnet
    'claude-opus-4-6': 'claude-sonnet-4-6',
    'claude-sonnet-4-6': 'gemini-3.1-flash-lite',  // Opus timeout → Sonnet
  };

  async chat(params: ChatParams): Promise<ChatResponse> {
    try {
      return await this._doChat(params);
    } catch (err) {
      // Auto-fallback on 504 (gateway timeout)
      if (err instanceof ProviderError && (err.status === 504 || err.status === 400)) {
        const fallbackModel = OpenAICompatibleProvider.MODEL_FALLBACK[params.model];
        if (fallbackModel) {
          console.log(`  ⚠ ${params.model} timed out, falling back to ${fallbackModel}`);
          return await this._doChat({ ...params, model: fallbackModel });
        }
      }
      throw err;
    }
  }

  private async _doChat(params: ChatParams): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
      stream: params.stream ?? false,
    };

    if (params.tools?.length) {
      body.tools = params.tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new ProviderError(
        response.status,
        `${this.name} API error ${response.status}: ${errorBody}`,
        this.id,
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      model: data.model ?? params.model,
      provider: this.id,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        cost: calculateCost(
          params.model,
          data.usage?.prompt_tokens ?? 0,
          data.usage?.completion_tokens ?? 0,
        ),
      },
      toolCalls: choice?.message?.tool_calls,
      finishReason: choice?.finish_reason ?? 'stop',
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    if (Array.isArray(this.config.models)) {
      return this.config.models;
    }

    // Auto-discover from /models endpoint
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      if (!response.ok) return [];

      const data = await response.json();
      const models: ModelInfo[] = (data.data ?? []).map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: this.id,
      }));

      // Cache discovered models
      for (const m of models) {
        this.knownModels.add(m.id);
      }

      return models;
    } catch {
      return [];
    }
  }

  hasModel(modelId: string): boolean {
    return this.knownModels.has(modelId);
  }

  async healthCheck(): Promise<{ ok: boolean; balance?: number; error?: string }> {
    try {
      const models = await this.listModels();
      return { ok: models.length > 0 };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Typed error for provider failures.
 * Status codes: 402 = no balance, 429 = rate limit, 502/503 = upstream down
 */
export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly providerId: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

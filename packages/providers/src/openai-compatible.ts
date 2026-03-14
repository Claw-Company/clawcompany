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

    if (Array.isArray(config.models)) {
      for (const m of config.models) {
        this.knownModels.add(m.id);
      }
    }
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
      stream: false,
    };

    if (params.tools?.length) {
      body.tools = params.tools;
    }

    // ★ 5 minutes timeout for heavy models like Opus
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

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
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new ProviderError(
          504,
          `${this.name}: request timed out after 5 minutes for model ${params.model}`,
          this.id,
        );
      }
      throw err;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    if (Array.isArray(this.config.models)) {
      return this.config.models;
    }

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

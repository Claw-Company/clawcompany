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
 * Uses streaming internally to avoid gateway timeouts.
 * Collects the full response before returning — callers see no difference.
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
      stream: true,  // ★ Always stream to avoid gateway timeout
    };

    if (params.tools?.length) {
      body.tools = params.tools;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min safety net

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

      // ★ Parse SSE stream, collect full content
      return await this.collectStream(response, params.model);

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

  /**
   * Read SSE stream line by line, accumulate content and tool calls.
   * Returns a complete ChatResponse when stream ends.
   */
  private async collectStream(response: Response, model: string): Promise<ChatResponse> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let content = '';
    let finishReason = 'stop';
    let toolCalls: any[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let actualModel = model;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          const choice = json.choices?.[0];

          if (delta?.content) {
            content += delta.content;
          }

          // Collect tool call deltas
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id ?? '',
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }

          if (json.model) {
            actualModel = json.model;
          }

          // Usage info comes in the final chunk (some providers)
          if (json.usage) {
            inputTokens = json.usage.prompt_tokens ?? 0;
            outputTokens = json.usage.completion_tokens ?? 0;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // If provider didn't send usage, estimate from content length
    if (outputTokens === 0 && content.length > 0) {
      outputTokens = Math.ceil(content.length / 4); // rough estimate
    }

    const validToolCalls = toolCalls.filter(tc => tc.id && tc.function.name);

    return {
      content,
      model: actualModel,
      provider: this.id,
      usage: {
        inputTokens,
        outputTokens,
        cost: calculateCost(model, inputTokens, outputTokens),
      },
      toolCalls: validToolCalls.length > 0 ? validToolCalls : undefined,
      finishReason: finishReason as any,
    };
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

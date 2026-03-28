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
    'claude-opus-4-6': 'claude-sonnet-4-6',  // Opus timeout → Sonnet
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
      messages: this.toApiMessages(params.messages as Array<Record<string, unknown>>),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    };

    // Reasoning models reject temperature
    if (this.isReasoningModel(params.model)) {
      delete body.temperature;
    }

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
      const status = response.status;
      let friendly: string;
      switch (true) {
        case status === 429:
          friendly = 'Rate limited — too many requests. Please wait and try again.'; break;
        case status === 529:
          friendly = 'Model overloaded — the API is currently busy. Try again in a moment.'; break;
        case status === 502 || status === 504:
          friendly = 'Request timeout — the model took too long to respond. Try a different role or model.'; break;
        case status === 401 || status === 403:
          friendly = 'Authentication failed — check your API key.'; break;
        case status === 400:
          friendly = `Bad request — this model may not support the current settings. (${errorBody.slice(0, 120)})`; break;
        default:
          friendly = `API error ${status}: ${errorBody.slice(0, 200)}`;
      }
      throw new ProviderError(status, friendly, this.id);
    }

    // Collect SSE stream chunks into a single response
    let content = '';
    let model = params.model;
    let finishReason = 'stop';
    let promptTokens = 0;
    let completionTokens = 0;
    const toolCallBuffers: Map<number, { id: string; name: string; args: string }> = new Map();

    const contentType = response.headers.get('content-type') ?? '';
    const isSSE = contentType.includes('text/event-stream');
    // If the API returned JSON (not SSE), parse it directly
    if (!isSSE) {
      const data = await response.json() as any;
      content = data.choices?.[0]?.message?.content ?? '';
      model = data.model ?? params.model;
      finishReason = data.choices?.[0]?.finish_reason ?? 'stop';
      promptTokens = data.usage?.prompt_tokens ?? 0;
      completionTokens = data.usage?.completion_tokens ?? 0;

      // Collect tool calls
      const tcList = data.choices?.[0]?.message?.tool_calls;
      if (tcList?.length) {
        for (const tc of tcList) {
          toolCallBuffers.set(toolCallBuffers.size, {
            id: tc.id, name: tc.function?.name ?? '', args: tc.function?.arguments ?? '',
          });
        }
      }
    } else {
      // SSE streaming path
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

          try {
            const chunk = JSON.parse(line.slice(6));
            const delta = chunk.choices?.[0]?.delta;

            if (delta?.content) content += delta.content;
            if (chunk.model) model = chunk.model;

            const fr = chunk.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;

            // Collect streamed tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallBuffers.has(idx)) {
                  toolCallBuffers.set(idx, { id: tc.id ?? `call_${idx}`, name: '', args: '' });
                }
                const buf = toolCallBuffers.get(idx)!;
                if (tc.id) buf.id = tc.id;
                if (tc.function?.name) buf.name = tc.function.name;
                if (tc.function?.arguments) buf.args += tc.function.arguments;
              }
            }

            if (chunk.usage) {
              promptTokens = chunk.usage.prompt_tokens ?? 0;
              completionTokens = chunk.usage.completion_tokens ?? 0;
            }
          } catch {}
        }
      }
    }

    // Assemble tool calls
    const toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
    for (const [, buf] of [...toolCallBuffers.entries()].sort((a, b) => a[0] - b[0])) {
      toolCalls.push({ id: buf.id, type: 'function', function: { name: buf.name, arguments: buf.args } });
    }

    // Detect empty response (no content, no tool calls, zero cost)
    const cost = calculateCost(params.model, promptTokens, completionTokens);
    if (!content && toolCalls.length === 0 && cost === 0) {
      return {
        content: '⚠️ No response received from the model. This usually means the API is temporarily unavailable. Try again or switch to a different role.',
        model,
        provider: this.id,
        usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
        finishReason,
      };
    }

    return {
      content,
      model,
      provider: this.id,
      usage: {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        cost,
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    };
  }

  /** Convert internal message format to OpenAI API format */
  private toApiMessages(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return messages.map(msg => {
      const out: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };
      // assistant message with tool calls
      if (msg.toolCalls) {
        out.tool_calls = msg.toolCalls;
        if (!out.content) out.content = null;
      }
      // tool result message
      if (msg.role === 'tool' && msg.toolCallId) {
        out.tool_call_id = msg.toolCallId;
      }
      if (msg.name) out.name = msg.name;
      return out;
    });
  }

  private isReasoningModel(model: string): boolean {
    return /^(o1|o3|gpt-5-mini)/.test(model);
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

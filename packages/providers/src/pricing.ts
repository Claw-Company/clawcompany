import { MODEL_PRICING } from '@clawcompany/shared';

/**
 * Calculate cost in USD for a given model + token usage.
 * Falls back to $0 if model not in pricing table (e.g. local Ollama).
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
}

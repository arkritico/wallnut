/**
 * AI Model Selection — shared helper for depth-aware model and thinking configuration.
 *
 * All AI-powered routes use this to select the right model based on analysis depth.
 */

import type { AnalysisDepth } from "./unified-pipeline";

export interface DepthModelConfig {
  model: string;
  maxTokens: number;
  /** If set, add `thinking` parameter to the API request body. */
  thinkingBudget?: number;
}

/**
 * Select model and parameters based on analysis depth.
 *
 * - quick:    Sonnet — fast, cheap, good for scoping
 * - standard: Opus — full reasoning, default
 * - deep:     Opus + extended thinking — for bid-ready work
 *
 * @param depth Analysis depth level
 * @param baseMaxTokens Default max_tokens for standard mode (overridden per depth)
 * @param thinkingBudgetForDeep Thinking budget for deep mode (default 10000)
 */
export function getModelForDepth(
  depth: AnalysisDepth = "standard",
  baseMaxTokens = 8192,
  thinkingBudgetForDeep = 10000,
): DepthModelConfig {
  switch (depth) {
    case "quick":
      return {
        model: "claude-sonnet-4-6",
        maxTokens: Math.min(baseMaxTokens, 4096),
      };
    case "deep":
      return {
        model: "claude-opus-4-6",
        // Deep mode needs more tokens for thinking + output
        maxTokens: Math.max(baseMaxTokens * 2, 16384),
        thinkingBudget: thinkingBudgetForDeep,
      };
    case "standard":
    default:
      return {
        model: "claude-opus-4-6",
        maxTokens: baseMaxTokens,
      };
  }
}

/**
 * Build the API request body with depth-aware model and thinking configuration.
 */
export function buildApiRequestBody(
  config: DepthModelConfig,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages,
  };

  if (config.thinkingBudget) {
    body.thinking = { type: "enabled", budget_tokens: config.thinkingBudget };
  }

  return body;
}

import { NextResponse } from "next/server";
import type { AIReviewResult } from "@/lib/ai-feedback-types";
import { buildReviewSystemPrompt, buildReviewMessage } from "@/lib/ai-review-prompts";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

const log = createLogger("ai-review");

const FETCH_TIMEOUT_MS = 90_000;

export const POST = withApiHandler("ai-review", async (request) => {
  const body = await request.json();
  const { aiEstimate, matchReport, reconciliation } = body;

  // ── Validation ────────────────────────────────────────────
  if (!aiEstimate || !matchReport || !reconciliation) {
    return NextResponse.json({
      available: false,
      fallbackReason: "Dados insuficientes para revisão AI.",
    }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      available: false,
      fallbackReason: "ANTHROPIC_API_KEY não configurada.",
    });
  }

  // ── Build prompt ──────────────────────────────────────────
  const startMs = performance.now();
  const systemPrompt = buildReviewSystemPrompt();
  const userMessage = buildReviewMessage(aiEstimate, matchReport, reconciliation);

  // ── Call Anthropic ────────────────────────────────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: `Reveja as seguintes correspondências de preços:\n\n${userMessage}` }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    log.warn(isTimeout ? "Anthropic API timeout" : "Anthropic API fetch error", { error: String(err) });
    return NextResponse.json({
      available: false,
      fallbackReason: isTimeout ? "API timeout (90s)" : `API fetch error: ${String(err)}`,
    }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    log.warn(`Anthropic API ${response.status}`, { body: errText.slice(0, 500) });
    return NextResponse.json({
      available: false,
      fallbackReason: `API error: ${response.status}`,
    }, { status: 502 });
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };

  if (!data.content || !Array.isArray(data.content)) {
    return NextResponse.json({
      available: false,
      fallbackReason: "Resposta inesperada da API.",
    }, { status: 502 });
  }

  // ── Parse JSON response ───────────────────────────────────
  const rawText = data.content
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  const parsed = extractJson(rawText);
  if (!parsed) {
    log.warn("Failed to parse review JSON", { rawText: rawText.slice(0, 1000) });
    return NextResponse.json({
      available: false,
      fallbackReason: "Não foi possível interpretar a revisão da IA.",
    }, { status: 502 });
  }

  const processingTimeMs = Math.round(performance.now() - startMs);
  const result: AIReviewResult = {
    matchReviews: parsed.matchReviews ?? [],
    unmatchedReviews: parsed.unmatchedReviews ?? [],
    patternInsights: parsed.patternInsights ?? [],
    matcherSuggestions: parsed.matcherSuggestions ?? [],
    refinedEstimate: parsed.refinedEstimate,
    modelUsed: data.model ?? "claude-sonnet-4-5-20250929",
    processingTimeMs,
  };

  log.info("AI review complete", {
    processingTimeMs,
    matchReviews: result.matchReviews.length,
    correct: result.matchReviews.filter(r => r.verdict === "correct").length,
    wrong: result.matchReviews.filter(r => r.verdict === "wrong").length,
    suggestions: result.matcherSuggestions.length,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  });

  return NextResponse.json(result);
}, { errorMessage: "Erro interno ao gerar revisão AI." });

// ============================================================

function extractJson(text: string): Partial<AIReviewResult> | null {
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  } catch { /* not pure JSON */ }

  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* bad JSON */ }
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch { /* not valid */ }
  }

  return null;
}

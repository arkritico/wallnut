import { NextResponse } from "next/server";
import type { AIEstimateResult } from "@/lib/ai-estimate-types";
import { buildEstimationSystemPrompt } from "@/lib/ai-estimate-prompts";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("ai-estimate");

const MAX_SUMMARY_LENGTH = 80_000; // ~20K tokens
const FETCH_TIMEOUT_MS = 270_000; // 270s — leave headroom within maxDuration

export const POST = withApiHandler("ai-estimate", async (request) => {
  const body = await request.json();
  const projectSummary = body.projectSummary;
  const model = body.model ?? "claude-sonnet-4-5-20250929";

  // ── Input Validation ──────────────────────────────────────
  if (!projectSummary || typeof projectSummary !== "string" || projectSummary.trim().length < 20) {
    return NextResponse.json({
      available: false,
      fallbackReason: "Resumo do projeto insuficiente.",
    }, { status: 400 });
  }

  // ── API Key Check ─────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      available: false,
      fallbackReason: "ANTHROPIC_API_KEY não configurada.",
    });
  }

  // ── Call Anthropic API ────────────────────────────────────
  const startMs = performance.now();
  const systemPrompt = buildEstimationSystemPrompt();
  const truncatedSummary = projectSummary.slice(0, MAX_SUMMARY_LENGTH);

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
        model,
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Analise o seguinte projeto e produza uma estimativa de custos completa.\n\n${truncatedSummary}`,
        }],
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

  // ── Extract JSON from response ────────────────────────────
  const rawText = data.content
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  const parsed = extractJsonFromText(rawText);
  if (!parsed) {
    log.warn("Failed to parse JSON from AI response", { rawText: rawText.slice(0, 1000) });
    return NextResponse.json({
      available: false,
      fallbackReason: "Não foi possível interpretar a resposta da IA.",
      rawResponse: rawText.slice(0, 2000),
    }, { status: 502 });
  }

  // ── Build result ──────────────────────────────────────────
  const processingTimeMs = Math.round(performance.now() - startMs);
  const result: AIEstimateResult = {
    ...parsed,
    modelUsed: data.model ?? model,
    processingTimeMs,
  };

  log.info("AI estimate complete", {
    model: result.modelUsed,
    processingTimeMs,
    workPackages: result.workPackages?.length ?? 0,
    totalMin: result.totalEstimate?.min,
    totalMax: result.totalEstimate?.max,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  });

  return NextResponse.json(result);
}, { errorMessage: "Erro interno ao gerar estimativa AI." });

// ============================================================
// JSON Extraction
// ============================================================

/**
 * Extract a JSON object from LLM text output.
 * Handles: bare JSON, markdown code fences, or JSON embedded in prose.
 */
function extractJsonFromText(text: string): Omit<AIEstimateResult, "modelUsed" | "processingTimeMs"> | null {
  // Normalize line endings (Windows \r\n → \n)
  const normalized = text.replace(/\r\n/g, "\n").trim();

  // Try 1: Clean JSON (entire response is JSON)
  try {
    if (normalized.startsWith("{")) {
      return JSON.parse(normalized);
    }
  } catch { /* not pure JSON */ }

  // Try 2: Markdown code fence (greedy match for large responses)
  const fenceMatch = normalized.match(/```(?:json)?\s*\n([\s\S]+)\n```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* bad JSON in fence */ }
  }

  // Try 3: Find first { ... last }
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(normalized.slice(firstBrace, lastBrace + 1));
    } catch { /* not valid JSON */ }
  }

  return null;
}

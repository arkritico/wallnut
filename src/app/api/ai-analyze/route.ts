import { NextResponse } from "next/server";
import type { AIAnalysisRequest, AIAnalysisResponse } from "@/lib/ai-analysis";
import { buildAnalysisSystemPrompt } from "@/lib/ai-analysis";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";

const log = createLogger("ai-analyze");

const MAX_PROMPT_LENGTH = 8_000;
const MAX_DOCUMENT_LENGTH = 10_000;
const MAX_DOCUMENTS = 5;
const MAX_CONTEXT_LENGTH = 15_000;

export const POST = withApiHandler("ai-analyze", async (request) => {
  const body: AIAnalysisRequest = await request.json();

  // ── Input Validation ──────────────────────────────────────
  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({
      answer: "", confidence: "low", regulationReferences: [], suggestions: [],
      error: "Campo 'prompt' é obrigatório.",
    } satisfies AIAnalysisResponse, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      answer: "Serviço de IA não configurado. Defina a variável de ambiente ANTHROPIC_API_KEY.",
      confidence: "low",
      regulationReferences: [],
      suggestions: ["Configurar ANTHROPIC_API_KEY no ficheiro .env.local"],
      error: "API key not configured",
    } satisfies AIAnalysisResponse);
  }

  // ── Build Messages with Bounded Input ─────────────────────
  const systemPrompt = buildAnalysisSystemPrompt();

  let userMessage = body.prompt.slice(0, MAX_PROMPT_LENGTH);
  if (body.projectContext && typeof body.projectContext === "string") {
    userMessage = `Contexto do projeto:\n${body.projectContext.slice(0, MAX_CONTEXT_LENGTH)}\n\nPergunta/Tarefa:\n${userMessage}`;
  }
  if (body.documentTexts && Array.isArray(body.documentTexts)) {
    const safeDocs = body.documentTexts.slice(0, MAX_DOCUMENTS);
    const docsText = safeDocs
      .filter((t): t is string => typeof t === "string")
      .map((t, i) => `--- Documento ${i + 1} ---\n${t.slice(0, MAX_DOCUMENT_LENGTH)}`)
      .join("\n\n");
    userMessage += `\n\nDocumentos fornecidos:\n${docsText}`;
  }
  if (body.regulationArea && typeof body.regulationArea === "string") {
    userMessage += `\n\nFoco na área regulamentar: ${body.regulationArea.slice(0, 100)}`;
  }

  // ── Call Anthropic API ─────────────────────────────────────
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    log.warn(`Anthropic API ${response.status}`, { body: errText.slice(0, 500) });
    return NextResponse.json({
      answer: "",
      confidence: "low",
      regulationReferences: [],
      suggestions: [],
      error: "Serviço de IA temporariamente indisponível. Tente novamente.",
    } satisfies AIAnalysisResponse, { status: 502 });
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };

  if (!data.content || !Array.isArray(data.content)) {
    return NextResponse.json({
      answer: "", confidence: "low", regulationReferences: [], suggestions: [],
      error: "Resposta inesperada do serviço de IA.",
    } satisfies AIAnalysisResponse, { status: 502 });
  }

  const answerText = data.content
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  const regPattern = /(?:DL|Decreto-Lei|Portaria|Lei|Art\.?|Regulamento)\s+[\d/\-.]+(?:\s*(?:de\s+)?\d{4})?/gi;
  const regulationReferences = [...new Set(answerText.match(regPattern) ?? [])].slice(0, 50);

  return NextResponse.json({
    answer: answerText,
    confidence: "high",
    regulationReferences,
    suggestions: [],
  } satisfies AIAnalysisResponse);
}, { errorMessage: "Erro interno ao processar o pedido de IA." });

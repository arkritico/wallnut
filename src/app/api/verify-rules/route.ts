/**
 * API Route: Verify Rules Against Official Sources
 *
 * Iterative AI + web search powered verification of Portuguese
 * construction regulation rules. Supports:
 * - Batch verification (up to 5 rules)
 * - Web search for official regulation text (Brave / Google)
 * - AI cross-reference with Claude
 * - Engineer feedback loop for iterative refinement
 */

import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-error-handler";
import { getModelForDepth, buildApiRequestBody } from "@/lib/ai-model-selection";
import {
  buildSearchQueries,
  buildVerificationPrompt,
  performSearch,
  getSearchProvider,
  type VerificationRequest,
  type VerificationResponse,
  type VerificationResult,
  type RuleToVerify,
  type BraveSearchResult,
} from "@/lib/rule-verification";

// ============================================================
// Config
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes for search + AI

const MAX_RULES_PER_BATCH = 5;
const MAX_SEARCH_RESULTS_PER_QUERY = 5;

// ============================================================
// Route handler
// ============================================================

export const POST = withApiHandler("verify-rules", async (request) => {
  const body: VerificationRequest = await request.json();

  // Validate input
  if (!body.rules || !Array.isArray(body.rules) || body.rules.length === 0) {
    return NextResponse.json(
      { error: "Campo 'rules' é obrigatório (array não vazio)." },
      { status: 400 },
    );
  }

  if (body.rules.length > MAX_RULES_PER_BATCH) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_RULES_PER_BATCH} regras por lote.` },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não configurada." },
      { status: 500 },
    );
  }

  // Step 1: Build search queries for each rule
  const allSearchResults: Array<{
    query: string;
    results: BraveSearchResult[];
  }> = [];

  const searchProvider = getSearchProvider();
  console.log(`[verify-rules] Search provider: ${searchProvider}, rules: ${body.rules.length}`);

  if (searchProvider !== "none") {
    // Execute searches in parallel (deduplicate queries across rules)
    const querySet = new Set<string>();
    const queryToRule = new Map<string, RuleToVerify>();

    for (const rule of body.rules) {
      const queries = body.customSearchQueries?.length
        ? body.customSearchQueries
        : buildSearchQueries(rule, body.feedback);

      for (const q of queries) {
        if (!querySet.has(q)) {
          querySet.add(q);
          queryToRule.set(q, rule);
        }
      }
    }

    const searchPromises = Array.from(querySet).map(async (query) => {
      const results = await performSearch(query, MAX_SEARCH_RESULTS_PER_QUERY);
      return { query, results };
    });

    const searchResults = await Promise.allSettled(searchPromises);
    for (const result of searchResults) {
      if (result.status === "fulfilled" && result.value.results.length > 0) {
        allSearchResults.push(result.value);
      }
    }

    console.log(`[verify-rules] Search complete: ${allSearchResults.length} queries with results`);
  } else {
    console.log("[verify-rules] No search provider configured, using AI knowledge only");
  }

  // Step 2: Build the verification prompt
  const prompt = buildVerificationPrompt(
    body.rules,
    allSearchResults,
    body.feedback,
  );

  // Step 3: Call Claude for verification
  const rawDepth = body.analysisDepth;
  const depth = (rawDepth === "quick" || rawDepth === "standard" || rawDepth === "deep")
    ? rawDepth
    : "standard";
  const modelConfig = getModelForDepth(depth, 12000, 10000);

  const systemPrompt = `Você é um auditor de regulamentação portuguesa de construção civil com conhecimento profundo de:
- RTIEBT (Regras Técnicas das Instalações Elétricas de Baixa Tensão)
- SCIE / RT-SCIE (Segurança Contra Incêndio em Edifícios)
- REH / RECS (Regulamento de Eficiência Energética)
- RRAE (Regulamento dos Requisitos Acústicos dos Edifícios)
- RGSPPDADAR (Regulamento Geral dos Sistemas Públicos e Prediais de Distribuição de Água e de Drenagem de Águas Residuais)
- Eurocódigos (EC0 a EC8 via NP EN)
- DL 163/2006 (Acessibilidade)
- RJUE (Regime Jurídico da Urbanização e Edificação)
- ITED/ITUR (Infraestruturas de Telecomunicações)
- DL 521/99 (Instalações de Gás)
- RGEU (Regulamento Geral das Edificações Urbanas)

Responda SEMPRE em JSON válido, sem texto adicional antes ou depois do JSON.
Seja rigoroso na verificação: quando encontrar discrepâncias, cite o texto oficial exacto.
Quando não conseguir verificar, indique "unverifiable" e sugira pesquisas adicionais.`;

  const messages = [{ role: "user" as const, content: prompt }];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(buildApiRequestBody(modelConfig, systemPrompt, messages)),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`[verify-rules] Anthropic API error ${response.status}: ${errorText}`);
    return NextResponse.json(
      { error: "Serviço de IA temporariamente indisponível." },
      { status: 502 },
    );
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };

  if (!data.content || !Array.isArray(data.content)) {
    return NextResponse.json(
      { error: "Resposta inesperada do serviço de IA." },
      { status: 502 },
    );
  }

  // Extract text from response (skip thinking blocks)
  let aiText = data.content
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n")
    .trim();

  // Clean markdown code fences
  if (aiText.startsWith("```")) {
    aiText = aiText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/```\s*$/, "");
  }

  // Extract JSON portion
  const lastBrace = aiText.lastIndexOf("}");
  if (lastBrace !== -1) {
    aiText = aiText.substring(0, lastBrace + 1).trim();
  }

  // Parse AI response
  let parsed: { results?: VerificationResult[]; nextSteps?: string[] };
  try {
    parsed = JSON.parse(aiText);
  } catch {
    console.error("[verify-rules] Failed to parse AI JSON response");
    console.error("Raw (first 500):", aiText.substring(0, 500));

    // Fallback: return unverifiable results
    const fallbackResults: VerificationResult[] = body.rules.map(rule => ({
      ruleId: rule.id,
      status: "unverifiable" as const,
      confidence: 0,
      explanation: "Não foi possível analisar a resposta do serviço de IA. Tente novamente.",
      officialText: null,
      discrepancies: [],
      sources: allSearchResults.flatMap(sr =>
        sr.results.map(r => ({
          url: r.url,
          title: r.title,
          excerpt: r.snippet,
          authority: 0.5,
        }))
      ).slice(0, 10),
      suggestedCorrection: null,
      regulationUpdated: false,
      verifiedAt: new Date().toISOString(),
      searchQueries: allSearchResults.map(sr => sr.query),
    }));

    return NextResponse.json({
      results: fallbackResults,
      summary: {
        total: body.rules.length,
        verified: 0,
        discrepancies: 0,
        outdated: 0,
        unverifiable: body.rules.length,
        misinterpretations: 0,
      },
      nextSteps: ["Repetir a verificação — a análise de IA falhou nesta iteração."],
      searchProvider,
    } satisfies VerificationResponse & { searchProvider: string });
  }

  // Enrich results with metadata
  const results: VerificationResult[] = (parsed.results ?? []).map(r => ({
    ...r,
    verifiedAt: r.verifiedAt || new Date().toISOString(),
    sources: [
      ...(r.sources ?? []),
      // Append search sources not already included
      ...allSearchResults.flatMap(sr =>
        sr.results
          .filter(s => !(r.sources ?? []).some(rs => rs.url === s.url))
          .map(s => ({
            url: s.url,
            title: s.title,
            excerpt: s.snippet,
            authority: 0.5,
          }))
      ),
    ].slice(0, 15),
    searchQueries: r.searchQueries ?? allSearchResults.map(sr => sr.query),
  }));

  // Build summary
  const summary = {
    total: results.length,
    verified: results.filter(r => r.status === "verified").length,
    discrepancies: results.filter(r => r.status === "discrepancy").length,
    outdated: results.filter(r => r.status === "outdated").length,
    unverifiable: results.filter(r => r.status === "unverifiable").length,
    misinterpretations: results.filter(r => r.status === "misinterpretation").length,
  };

  return NextResponse.json({
    results,
    summary,
    nextSteps: parsed.nextSteps ?? [],
    searchProvider,
  } satisfies VerificationResponse & { searchProvider: string });
}, { errorMessage: "Erro interno ao verificar regras." });

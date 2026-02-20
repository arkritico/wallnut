/**
 * AI Review Prompts (Pass 3 — THE JUDGE)
 *
 * After the AI estimates and the algorithmic matcher runs,
 * the AI reviews the matcher's choices: are they correct?
 * What patterns are missing? How should we improve?
 *
 * This creates the compounding improvement loop.
 */

import type { AIEstimateResult } from "./ai-estimate-types";
import type { MatchReport, PriceMatch } from "./wbs-types";
import type { ReconciliationReport } from "./ai-estimate-types";

// ============================================================
// System Prompt
// ============================================================

export function buildReviewSystemPrompt(): string {
  return `Você é um revisor de orçamentos de construção portuguesa. O seu papel é avaliar a qualidade das correspondências automáticas entre artigos de um mapa de quantidades e uma base de dados de preços unitários.

## O QUE ANALISAR
Para cada correspondência algorítmica, avalie:
1. O artigo da base de preços corresponde REALMENTE ao artigo do mapa de quantidades?
2. As unidades são compatíveis? (m vs m², m³ vs Ud, etc.)
3. O custo unitário é razoável para o mercado português 2024-2025?
4. Existem artigos melhores na base de dados para este trabalho?

## VERDITOS
- "correct": Correspondência perfeita, artigo e unidade corretos
- "acceptable": Correspondência razoável, pode não ser o artigo ideal mas serve
- "wrong": Correspondência errada — artigo incompatível, unidade errada, ou custo absurdo
- "missing_context": Não há informação suficiente para avaliar

## PADRÕES A IDENTIFICAR
Identifique padrões sistemáticos no matcher:
- Sinónimos em falta (ex: "capoto" e "ETICS" são o mesmo)
- Unidades mal mapeadas (ex: pilar medido em m³ mas base de preços em m)
- Categorias mal classificadas (ex: artigo de reabilitação a usar preço de obra nova)
- Preços desatualizados

## FORMATO DE SAÍDA
Retorne APENAS JSON válido:
{
  "matchReviews": [
    {
      "articleCode": "06.01.001",
      "matchedPriceCode": "EHS010",
      "verdict": "correct | acceptable | wrong | missing_context",
      "reasoning": "justificação breve",
      "suggestedAlternative": "código alternativo se wrong",
      "confidence": "high | medium | low"
    }
  ],
  "unmatchedReviews": [
    {
      "articleCode": "xx.xx.xxx",
      "articleDescription": "descrição",
      "suggestion": "como tratar este artigo",
      "estimatedCostRange": { "min": 0, "max": 0 }
    }
  ],
  "patternInsights": [
    "Padrão observado: descrição"
  ],
  "matcherSuggestions": [
    {
      "type": "missing_synonym | wrong_unit | missing_pattern | category_mismatch | price_outdated",
      "description": "descrição da sugestão",
      "data": {
        "word1": "opcional",
        "word2": "opcional",
        "fromUnit": "opcional",
        "toUnit": "opcional",
        "pattern": "opcional",
        "priceCode": "opcional"
      }
    }
  ],
  "refinedEstimate": {
    "min": 0,
    "max": 0,
    "mostLikely": 0,
    "adjustmentReason": "porque o valor foi ajustado"
  }
}`;
}

// ============================================================
// User Message Builder
// ============================================================

/**
 * Build the user message for Pass 3, containing:
 * - The AI's original estimate (for context)
 * - The algorithmic match results
 * - The reconciliation divergences
 * - Unmatched articles
 */
export function buildReviewMessage(
  aiEstimate: AIEstimateResult,
  matchReport: MatchReport,
  reconciliation: ReconciliationReport,
): string {
  const sections: string[] = [];

  // Project context from AI's understanding
  const pu = aiEstimate.projectUnderstanding;
  sections.push(`## CONTEXTO DO PROJETO`);
  sections.push(`Tipo: ${pu.buildingType}, Âmbito: ${pu.scope}`);
  sections.push(`Complexidade: ${pu.complexity}, Área: ${pu.grossFloorArea} m²`);
  sections.push(`Localização: ${pu.location}`);
  sections.push(`Estimativa AI: €${fmt(aiEstimate.totalEstimate.min)}-€${fmt(aiEstimate.totalEstimate.max)} (mais provável: €${fmt(aiEstimate.totalEstimate.mostLikely)})`);
  sections.push(`Estimativa algorítmica: €${fmt(reconciliation.algorithmicTotal)}`);
  sections.push(`Divergência global: ${reconciliation.overallDivergencePercent}%`);
  sections.push("");

  // Algorithmic matches to review (focus on low-confidence and high-divergence)
  const matchesToReview = selectMatchesForReview(matchReport, reconciliation);

  sections.push(`## CORRESPONDÊNCIAS A AVALIAR (${matchesToReview.length} artigos)`);
  for (const m of matchesToReview) {
    sections.push(
      `- [${m.articleCode}] "${m.articleDescription}" ` +
      `→ ${m.priceCode} "${m.priceDescription}" ` +
      `(${m.confidence}% conf, €${m.unitCost}/${m.priceUnit}, total €${fmt(m.estimatedCost ?? 0)})`,
    );
  }
  sections.push("");

  // Unmatched articles
  if (matchReport.unmatched.length > 0) {
    sections.push(`## ARTIGOS SEM CORRESPONDÊNCIA (${matchReport.unmatched.length})`);
    for (const u of matchReport.unmatched) {
      sections.push(`- [${u.articleCode}] "${u.description}"`);
    }
    sections.push("");
  }

  // Divergence details
  const highDivergence = reconciliation.items.filter(i => i.divergencePercent > 30);
  if (highDivergence.length > 0) {
    sections.push(`## DIVERGÊNCIAS SIGNIFICATIVAS (>30%)`);
    for (const d of highDivergence) {
      sections.push(
        `- ${d.workPackage}: AI €${fmt(d.aiEstimate.min)}-€${fmt(d.aiEstimate.max)} ` +
        `vs Algo €${fmt(d.algorithmicEstimate.total)} (${d.divergencePercent}% divergência, rec: ${d.recommendation})`,
      );
    }
  }

  return sections.join("\n");
}

// ============================================================
// Helpers
// ============================================================

/** Select the most important matches for AI review (not all — token budget) */
function selectMatchesForReview(
  matchReport: MatchReport,
  reconciliation: ReconciliationReport,
): PriceMatch[] {
  const matches = [...matchReport.matches];

  // Score each match by "review priority"
  const scored = matches.map(m => {
    let priority = 0;
    // Low confidence → high priority
    if (m.confidence < 40) priority += 30;
    else if (m.confidence < 60) priority += 15;
    // High cost impact → high priority
    const cost = m.estimatedCost ?? 0;
    if (cost > 50000) priority += 20;
    else if (cost > 10000) priority += 10;
    // Match method matters
    if (m.matchMethod === "fallback") priority += 15;
    if (m.matchMethod === "category") priority += 10;
    // Divergent in reconciliation → high priority
    const reconcItem = reconciliation.items.find(i =>
      i.workPackage.includes(m.articleCode.split(".")[0]),
    );
    if (reconcItem && reconcItem.divergencePercent > 30) priority += 20;

    return { match: m, priority };
  });

  // Sort by priority, take top 25 (token budget ~3000 for 25 items)
  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, 25).map(s => s.match);
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-PT");
}

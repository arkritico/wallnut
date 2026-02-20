/**
 * AI Estimate Reconciler
 *
 * Compares the AI-driven cost estimate against the algorithmic
 * price-matching pipeline results. Produces a reconciliation report
 * with per-work-package divergence analysis and recommendations.
 */

import type { AIEstimateResult, ReconciliationItem, ReconciliationReport } from "./ai-estimate-types";
import type { MatchReport, WbsProject } from "./wbs-types";

// ============================================================
// Main Reconciliation
// ============================================================

/**
 * Compare AI estimate against algorithmic MatchReport.
 * Maps work packages to WBS chapters, computes divergence,
 * and recommends which source to trust per item.
 */
export function reconcileEstimates(
  aiEstimate: AIEstimateResult,
  matchReport: MatchReport,
  wbsProject?: WbsProject,
): ReconciliationReport {
  const items: ReconciliationItem[] = [];

  // Build algorithmic cost map by chapter prefix
  const algoByChapter = new Map<string, { total: number; confidence: number; priceCode?: string }>();

  for (const match of matchReport.matches) {
    const chapterCode = match.articleCode.split(".").slice(0, 2).join(".");
    const existing = algoByChapter.get(chapterCode);
    if (existing) {
      existing.total += match.estimatedCost ?? 0;
      existing.confidence = Math.min(existing.confidence, match.confidence);
    } else {
      algoByChapter.set(chapterCode, {
        total: match.estimatedCost ?? 0,
        confidence: match.confidence,
        priceCode: match.priceCode,
      });
    }
  }

  // Also aggregate by 1-digit chapter for broader matching
  const algoByTopChapter = new Map<string, { total: number; confidence: number }>();
  for (const [code, data] of algoByChapter) {
    const top = code.split(".")[0];
    const existing = algoByTopChapter.get(top);
    if (existing) {
      existing.total += data.total;
      existing.confidence = Math.min(existing.confidence, data.confidence);
    } else {
      algoByTopChapter.set(top, { total: data.total, confidence: data.confidence });
    }
  }

  // Compare each AI work package against algorithmic results
  for (const wp of aiEstimate.workPackages) {
    const aiMostLikely = (wp.totalCostRange.min + wp.totalCostRange.max) / 2;

    // Try exact match, then top-chapter match
    const algo = algoByChapter.get(wp.code) ?? algoByTopChapter.get(wp.code.split(".")[0]);

    if (algo && algo.total > 0) {
      const divergence = computeDivergence(aiMostLikely, algo.total);

      items.push({
        workPackage: `${wp.code} ${wp.name}`,
        aiEstimate: { min: wp.totalCostRange.min, max: wp.totalCostRange.max },
        algorithmicEstimate: {
          total: Math.round(algo.total * 100) / 100,
          confidence: algo.confidence,
          priceCode: "priceCode" in algo ? (algo as { priceCode?: string }).priceCode : undefined,
        },
        divergencePercent: divergence,
        recommendation: recommendSource(divergence, wp.confidence, algo.confidence),
      });
    } else {
      // AI has this work package but algorithmic doesn't
      items.push({
        workPackage: `${wp.code} ${wp.name}`,
        aiEstimate: { min: wp.totalCostRange.min, max: wp.totalCostRange.max },
        algorithmicEstimate: { total: 0, confidence: 0 },
        divergencePercent: 100,
        recommendation: "use_ai",
      });
    }
  }

  // Check for algorithmic matches with no AI counterpart
  for (const [code, data] of algoByTopChapter) {
    const hasAI = aiEstimate.workPackages.some(
      wp => wp.code === code || wp.code.startsWith(`${code}.`),
    );
    if (!hasAI && data.total > 0) {
      items.push({
        workPackage: `${code} (apenas base de preços)`,
        aiEstimate: { min: 0, max: 0 },
        algorithmicEstimate: {
          total: Math.round(data.total * 100) / 100,
          confidence: data.confidence,
        },
        divergencePercent: 100,
        recommendation: "review_needed",
      });
    }
  }

  // Aggregate totals
  const aiTotal = {
    min: aiEstimate.totalEstimate.min,
    max: aiEstimate.totalEstimate.max,
  };
  const algorithmicTotal = matchReport.stats.totalEstimatedCost ?? 0;
  const aiMostLikely = aiEstimate.totalEstimate.mostLikely;
  const overallDivergence = computeDivergence(aiMostLikely, algorithmicTotal);

  const verdict: ReconciliationReport["verdict"] =
    overallDivergence <= 15 ? "aligned"
    : overallDivergence <= 40 ? "minor_divergence"
    : "major_divergence";

  const summary = buildSummary(verdict, overallDivergence, aiTotal, algorithmicTotal, items);

  return {
    items,
    aiTotal,
    algorithmicTotal,
    overallDivergencePercent: overallDivergence,
    verdict,
    summary,
  };
}

// ============================================================
// Helpers
// ============================================================

/** Compute percentage divergence between two values */
function computeDivergence(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const avg = (a + b) / 2;
  if (avg === 0) return 100;
  return Math.round(Math.abs(a - b) / avg * 100);
}

/** Recommend which source to prefer based on divergence and confidence */
function recommendSource(
  divergence: number,
  aiConfidence: string,
  algoConfidence: number,
): ReconciliationItem["recommendation"] {
  // Low divergence → either source is fine, prefer algorithmic (has unit detail)
  if (divergence <= 15) return "use_algorithmic";

  // High divergence → needs human review
  if (divergence > 40) return "review_needed";

  // Moderate divergence → prefer the more confident source
  const aiScore = aiConfidence === "high" ? 3 : aiConfidence === "medium" ? 2 : 1;
  const algoScore = algoConfidence >= 70 ? 3 : algoConfidence >= 40 ? 2 : 1;

  if (aiScore > algoScore) return "use_ai";
  if (algoScore > aiScore) return "use_algorithmic";
  return "review_needed";
}

/** Build a Portuguese summary of the reconciliation */
function buildSummary(
  verdict: ReconciliationReport["verdict"],
  divergence: number,
  aiTotal: { min: number; max: number },
  algorithmicTotal: number,
  items: ReconciliationItem[],
): string {
  const fmt = (n: number) => Math.round(n).toLocaleString("pt-PT");
  const aiOnly = items.filter(i => i.algorithmicEstimate.total === 0 && i.aiEstimate.max > 0).length;
  const algoOnly = items.filter(i => i.aiEstimate.max === 0 && i.algorithmicEstimate.total > 0).length;
  const reviewNeeded = items.filter(i => i.recommendation === "review_needed").length;

  let text = "";

  if (verdict === "aligned") {
    text = `As duas estimativas estão alinhadas (divergência ${divergence}%). `;
    text += `Estimativa AI: €${fmt(aiTotal.min)}-€${fmt(aiTotal.max)}. `;
    text += `Estimativa algorítmica: €${fmt(algorithmicTotal)}.`;
  } else if (verdict === "minor_divergence") {
    text = `Divergência moderada (${divergence}%) entre as estimativas. `;
    text += `AI: €${fmt(aiTotal.min)}-€${fmt(aiTotal.max)}, Algorítmica: €${fmt(algorithmicTotal)}. `;
    text += `Recomenda-se revisão dos ${reviewNeeded} itens assinalados.`;
  } else {
    text = `Divergência significativa (${divergence}%) entre as estimativas. `;
    text += `AI: €${fmt(aiTotal.min)}-€${fmt(aiTotal.max)}, Algorítmica: €${fmt(algorithmicTotal)}. `;
    text += `A estimativa algorítmica pode estar incompleta ou com artigos mal classificados. `;
    text += `Recomenda-se usar a estimativa AI como base e validar com a base de preços.`;
  }

  if (aiOnly > 0) {
    text += ` ${aiOnly} pacote(s) identificados apenas pela AI (sem correspondência na base de preços).`;
  }
  if (algoOnly > 0) {
    text += ` ${algoOnly} artigo(s) na base de preços sem correspondência AI.`;
  }

  return text;
}

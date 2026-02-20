/**
 * AI Estimate Converter
 *
 * Converts AI estimation output (AIEstimateResult) into the existing
 * pipeline types (WbsProject, PriceMatch[]) so downstream modules
 * (schedule, export, resource aggregation) work unchanged.
 */

import type { AIEstimateResult, AIWorkPackage } from "./ai-estimate-types";
import type { WbsProject, WbsChapter, WbsArticle, PriceMatch } from "./wbs-types";

// ============================================================
// AI Estimate → WbsProject
// ============================================================

/**
 * Convert AI work packages into a WbsProject structure.
 * Groups packages by their 2-digit chapter prefix.
 */
export function aiEstimateToWbs(estimate: AIEstimateResult): WbsProject {
  const pu = estimate.projectUnderstanding;

  // Group work packages by chapter (first 2 digits of code)
  const chapterMap = new Map<string, AIWorkPackage[]>();

  for (const wp of estimate.workPackages) {
    const chapterCode = wp.code.split(".")[0] || wp.code;
    const existing = chapterMap.get(chapterCode) ?? [];
    existing.push(wp);
    chapterMap.set(chapterCode, existing);
  }

  // Build WBS chapters
  const chapters: WbsChapter[] = [];

  for (const [chapterCode, packages] of chapterMap) {
    const articles: WbsArticle[] = packages.map((wp, idx) => ({
      code: wp.code.includes(".") ? wp.code : `${wp.code}.${String(idx + 1).padStart(2, "0")}`,
      description: `${wp.name} — ${wp.description}`,
      unit: wp.unit,
      quantity: wp.estimatedQuantity,
      unitPrice: wp.totalCostRange
        ? Math.round(((wp.totalCostRange.min + wp.totalCostRange.max) / 2) / Math.max(wp.estimatedQuantity, 1) * 100) / 100
        : undefined,
      tags: [wp.phase, wp.confidence],
    }));

    chapters.push({
      code: chapterCode,
      name: packages[0].name,
      subChapters: [{
        code: `${chapterCode}.01`,
        name: packages[0].name,
        articles,
      }],
    });
  }

  // Sort chapters by code
  chapters.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return {
    id: "ai-estimate",
    name: pu.buildingType || "Projeto",
    classification: "ProNIC",
    startDate: new Date().toISOString().split("T")[0],
    district: pu.location,
    buildingType: inferBuildingType(pu.buildingType),
    grossFloorArea: pu.grossFloorArea || undefined,
    chapters,
  };
}

// ============================================================
// AI Estimate → PriceMatch[]
// ============================================================

/**
 * Convert AI work packages into PriceMatch[] format.
 * Uses the AI's cost estimates directly (no price DB lookup needed).
 * These matches carry confidence from the AI, not from fuzzy matching.
 */
export function aiEstimateToMatches(estimate: AIEstimateResult): PriceMatch[] {
  return estimate.workPackages.map((wp) => {
    const mostLikelyCost = (wp.totalCostRange.min + wp.totalCostRange.max) / 2;
    const unitCost = wp.estimatedQuantity > 0
      ? Math.round(mostLikelyCost / wp.estimatedQuantity * 100) / 100
      : 0;

    // Map AI confidence to numeric score
    const confidenceScore = wp.confidence === "high" ? 85
      : wp.confidence === "medium" ? 65
      : 40;

    return {
      articleCode: wp.code,
      articleDescription: `${wp.name} — ${wp.description}`,
      priceCode: `AI-${wp.code}`,
      priceDescription: wp.name,
      priceChapter: wp.code.split(".")[0] || wp.code,
      confidence: confidenceScore,
      matchMethod: "fallback" as const,
      unitCost,
      breakdown: estimateBreakdown(unitCost, wp.phase),
      priceUnit: wp.unit,
      unitConversion: 1,
      warnings: wp.confidence === "low" ? ["Estimativa AI com confiança baixa"] : [],
      articleQuantity: wp.estimatedQuantity,
      articleUnit: wp.unit,
      estimatedCost: Math.round(mostLikelyCost * 100) / 100,
    };
  });
}

// ============================================================
// Helpers
// ============================================================

/** Estimate material/labor/machinery split based on construction phase */
function estimateBreakdown(
  unitCost: number,
  phase: string,
): { materials: number; labor: number; machinery: number } {
  // Typical Portuguese construction cost splits by phase type
  const splits: Record<string, [number, number, number]> = {
    site_setup:       [0.30, 0.50, 0.20],
    demolition:       [0.05, 0.55, 0.40],
    earthworks:       [0.10, 0.30, 0.60],
    foundations:      [0.55, 0.35, 0.10],
    structure:        [0.55, 0.35, 0.10],
    external_walls:   [0.60, 0.35, 0.05],
    roof:             [0.55, 0.40, 0.05],
    waterproofing:    [0.65, 0.30, 0.05],
    external_frames:  [0.70, 0.25, 0.05],
    insulation:       [0.65, 0.30, 0.05],
    external_finishes:[0.50, 0.45, 0.05],
    internal_finishes:[0.45, 0.50, 0.05],
    flooring:         [0.55, 0.40, 0.05],
    ceilings:         [0.50, 0.45, 0.05],
    painting:         [0.35, 0.60, 0.05],
    carpentry:        [0.65, 0.30, 0.05],
    fire_safety:      [0.60, 0.35, 0.05],
    elevators:        [0.70, 0.25, 0.05],
    external_works:   [0.45, 0.40, 0.15],
    testing:          [0.05, 0.85, 0.10],
    cleanup:          [0.10, 0.70, 0.20],
  };

  // Default split for MEP/unknown phases
  const defaultSplit: [number, number, number] = [0.50, 0.40, 0.10];

  // Match phase to a known split (rough_in_* → default MEP split)
  let split = defaultSplit;
  for (const [key, val] of Object.entries(splits)) {
    if (phase === key || phase.includes(key)) {
      split = val;
      break;
    }
  }

  return {
    materials: Math.round(unitCost * split[0] * 100) / 100,
    labor: Math.round(unitCost * split[1] * 100) / 100,
    machinery: Math.round(unitCost * split[2] * 100) / 100,
  };
}

function inferBuildingType(aiType: string): "residential" | "commercial" | "mixed" | "industrial" {
  const lower = (aiType || "").toLowerCase();
  if (lower.includes("hotel") || lower.includes("comercial") || lower.includes("escritório") || lower.includes("serviço")) return "commercial";
  if (lower.includes("industrial") || lower.includes("armazém")) return "industrial";
  if (lower.includes("misto") || lower.includes("mixed")) return "mixed";
  return "residential";
}

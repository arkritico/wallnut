/**
 * AI Price Estimator — fills gaps in the CYPE price database.
 *
 * Strategy (layered):
 * 1. Use the 8,500+ scraped items/variants as primary reference
 * 2. For each unmatched article, find the closest scraped items and
 *    provide them as context to the AI for calibrated estimation
 * 3. AI cross-references Portuguese market data (ProNIC, CYPE, LNEC,
 *    Construlink, supplier catalogs) to produce grounded estimates
 * 4. Each estimate includes specific procurement suggestions with
 *    real supplier references from the Portuguese market
 *
 * The AI estimates:
 *   - Unit costs (materials, labor, machinery breakdown)
 *   - Productivity rates for labor
 *   - Suggested suppliers/sources for verification and procurement
 */

import type { PriceMatch, MatchReport } from "./wbs-types";
import { createLogger } from "./logger";

const log = createLogger("ai-price-estimator");

export interface AiPriceEstimate {
  articleCode: string;
  articleDescription: string;
  estimatedUnitCost: number;
  breakdown: { materials: number; labor: number; machinery: number };
  unit: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
  /** Suggested sources for verification */
  verificationSources: string[];
  /** Specific procurement suggestions with supplier names */
  procurementSuggestions?: string[];
  /** Reference scraped item that informed this estimate */
  referenceItemCode?: string;
}

export interface AiPriceEstimationResult {
  estimates: AiPriceEstimate[];
  /** Articles the AI couldn't estimate (too specialized or ambiguous) */
  unestimable: string[];
  tokenUsage: { input: number; output: number };
  /** How many estimates were grounded in scraped reference data */
  referenceGrounded: number;
}

/** Scraped reference item provided as context to the AI */
interface ScrapedReference {
  code: string;
  description: string;
  unitCost: number;
  unit: string;
  score: number;
  breakdown?: { materials: number; labor: number; machinery: number };
  variantRange?: { min: number; max: number; count: number };
}

/**
 * Use AI to estimate prices for BOQ articles that the CYPE database couldn't match.
 *
 * For each unmatched article, first retrieves the closest scraped items from the
 * 8,500+ price database to give the AI calibrated reference points. The AI then
 * produces market-based estimates grounded in real Portuguese construction prices.
 */
export async function estimateUnmatchedPrices(
  unmatched: MatchReport["unmatched"],
  projectContext: {
    buildingType: string;
    location: string;
    area?: number;
    isRehabilitation?: boolean;
  },
  apiKey: string,
  signal?: AbortSignal,
): Promise<AiPriceEstimationResult> {
  if (unmatched.length === 0) {
    return { estimates: [], unestimable: [], tokenUsage: { input: 0, output: 0 }, referenceGrounded: 0 };
  }

  // Find nearest scraped items for each unmatched article
  let referenceMap: Map<string, ScrapedReference[]> = new Map();
  try {
    const { findNearestScrapedItems } = await import("./price-matcher");
    for (const article of unmatched.slice(0, 30)) {
      const nearest = await findNearestScrapedItems(article.description, "", 3);
      if (nearest.length > 0) {
        referenceMap.set(article.articleCode, nearest);
      }
    }
  } catch {
    log.warn("Could not load scraped references for AI context");
  }

  const systemPrompt = `You are a Portuguese construction cost estimator (Medidor/Orçamentista) with deep knowledge of the Portuguese market.

You are estimating unit costs for BOQ (Bill of Quantities) articles that weren't found in the CYPE Gerador de Preços database. For each article, you will receive nearby reference items from our scraped database of 8,500+ Portuguese construction prices — use these as calibration anchors.

For each article, provide:
1. Estimated unit cost in EUR (realistic Portuguese market prices, 2024-2025)
2. Cost breakdown: materials %, labor %, machinery %
3. Confidence level: high (reference item is very similar), medium (reasonable interpolation), low (educated guess)
4. Brief rationale referencing the nearby items when applicable
5. Verification sources (Portuguese suppliers, databases)
6. Specific procurement suggestions — name real Portuguese suppliers, distributors, or online platforms where this item could be procured:
   - Materials: Construlink, Saint-Gobain Weber, Leroy Merlin Pro, Sotecnisol, Secil, Cimpor, Sika, Hilti, etc.
   - Labor yields: CYPE labor tables, ProNIC productivity data, ACT collective agreements
   - Equipment: Loxam, Zeppelin, Hertz Equipamentos, etc.

IMPORTANT:
- When reference items are provided, use their prices as anchors. If the reference is very similar, adjust proportionally. If no reference is close, state that in your rationale.
- When a reference item includes a variantPriceRange, this represents the full market spread from our database of 10k+ scraped price variants. Use this range to place your estimate — e.g., if the range is 6.90€-14.11€ with 3 variants, pick where the requested article falls (económico/padrão/premium).

Respond with ONLY a JSON object:
{
  "estimates": [
    {
      "articleCode": "original code",
      "articleDescription": "original description",
      "estimatedUnitCost": 25.50,
      "breakdown": { "materials": 0.60, "labor": 0.30, "machinery": 0.10 },
      "unit": "m²",
      "confidence": "medium",
      "rationale": "Based on reference EHS010 (pilar betão C25/30 @ 420€/m³), adjusted for...",
      "verificationSources": ["CYPE Gerador de Preços - EHS010", "Construlink"],
      "procurementSuggestions": ["Betão pronto: Betão Liz / Unibetão", "Aço: Megasa / SN Seixal"],
      "referenceItemCode": "EHS010"
    }
  ],
  "unestimable": ["codes of articles too specialized to estimate"]
}`;

  // Limit to first 30 unmatched articles (token budget)
  const articlesToEstimate = unmatched.slice(0, 30);

  // Build article data with reference context
  const articlesWithRefs = articlesToEstimate.map(a => {
    const refs = referenceMap.get(a.articleCode) ?? [];
    return {
      code: a.articleCode,
      description: a.description,
      suggestedSearch: a.suggestedSearch,
      nearbyScrapedItems: refs.map(r => ({
        code: r.code,
        description: r.description.slice(0, 120),
        unitCost: r.unitCost,
        unit: r.unit,
        similarity: r.score,
        breakdown: r.breakdown ? {
          materials: r.breakdown.materials,
          labor: r.breakdown.labor,
          machinery: r.breakdown.machinery,
        } : undefined,
        // Include variant price range so AI knows the full market spread
        variantPriceRange: r.variantRange ? {
          min: r.variantRange.min,
          max: r.variantRange.max,
          variants: r.variantRange.count,
        } : undefined,
      })),
    };
  });

  const articlesJson = JSON.stringify(articlesWithRefs, null, 2);

  const refsProvided = articlesWithRefs.filter(a => a.nearbyScrapedItems.length > 0).length;

  const userPrompt = `## Project Context
- Building type: ${projectContext.buildingType}
- Location: ${projectContext.location}
- Area: ${projectContext.area ?? "Unknown"} m²
- Rehabilitation: ${projectContext.isRehabilitation ? "Yes" : "No"}

## Price Database Info
Our scraped database contains 8,500+ items with variants from geradordeprecos.info (CYPE Portugal).
${refsProvided} of ${articlesToEstimate.length} articles below have nearby reference items from this database.

## Unmatched BOQ Articles (${unmatched.length} total, showing ${articlesToEstimate.length})
${articlesJson}

Estimate unit costs for each article. Use the nearby scraped items as price anchors where available.
For procurement, name specific Portuguese suppliers/distributors for the key materials.`;

  log.info("Estimating prices for unmatched articles", {
    total: unmatched.length,
    estimating: articlesToEstimate.length,
    withReferences: refsProvided,
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Price estimation API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const answerText = (data.content ?? [])
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  const tokenUsage = {
    input: data.usage?.input_tokens ?? 0,
    output: data.usage?.output_tokens ?? 0,
  };

  // Parse estimates
  let estimates: AiPriceEstimate[] = [];
  let unestimable: string[] = [];

  try {
    let jsonStr = answerText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const braceStart = jsonStr.indexOf("{");
    if (braceStart > 0) jsonStr = jsonStr.slice(braceStart);
    const lastBrace = jsonStr.lastIndexOf("}");
    if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);

    const parsed = JSON.parse(jsonStr) as {
      estimates?: AiPriceEstimate[];
      unestimable?: string[];
    };

    estimates = (parsed.estimates ?? []).map(e => ({
      articleCode: e.articleCode ?? "",
      articleDescription: e.articleDescription ?? "",
      estimatedUnitCost: typeof e.estimatedUnitCost === "number" ? e.estimatedUnitCost : 0,
      breakdown: {
        materials: typeof e.breakdown?.materials === "number" ? e.breakdown.materials : 0.5,
        labor: typeof e.breakdown?.labor === "number" ? e.breakdown.labor : 0.4,
        machinery: typeof e.breakdown?.machinery === "number" ? e.breakdown.machinery : 0.1,
      },
      unit: e.unit ?? "un",
      confidence: (e.confidence === "high" || e.confidence === "medium" || e.confidence === "low")
        ? e.confidence : "low",
      rationale: e.rationale ?? "",
      verificationSources: Array.isArray(e.verificationSources) ? e.verificationSources : [],
      procurementSuggestions: Array.isArray(e.procurementSuggestions) ? e.procurementSuggestions : [],
      referenceItemCode: typeof e.referenceItemCode === "string" ? e.referenceItemCode : undefined,
    }));

    unestimable = Array.isArray(parsed.unestimable) ? parsed.unestimable : [];
  } catch (err) {
    log.warn("Failed to parse price estimation response", { error: String(err) });
  }

  const referenceGrounded = estimates.filter(e => e.referenceItemCode).length;

  return { estimates, unestimable, tokenUsage, referenceGrounded };
}

/**
 * Convert AI price estimates into PriceMatch objects
 * that can be merged into the match report.
 */
export function estimatesToPriceMatches(
  estimates: AiPriceEstimate[],
  articleQuantities: Map<string, { quantity: number; unit: string }>,
): PriceMatch[] {
  return estimates
    .filter(e => e.estimatedUnitCost > 0)
    .map(e => {
      const artInfo = articleQuantities.get(e.articleCode);
      const quantity = artInfo?.quantity ?? 1;
      const unitCost = e.estimatedUnitCost;

      const procurementNote = e.procurementSuggestions?.length
        ? ` Fornecedores: ${e.procurementSuggestions.join("; ")}.`
        : "";
      const refNote = e.referenceItemCode
        ? ` Ref: ${e.referenceItemCode}.`
        : "";

      return {
        articleCode: e.articleCode,
        articleDescription: e.articleDescription,
        priceCode: `AI-${e.articleCode}`,
        priceDescription: `Estimativa IA: ${e.rationale.slice(0, 80)}`,
        priceChapter: "AI Estimates",
        confidence: e.confidence === "high" ? 65 : e.confidence === "medium" ? 45 : 25,
        matchMethod: "fallback" as const,
        unitCost,
        breakdown: {
          materials: unitCost * e.breakdown.materials,
          labor: unitCost * e.breakdown.labor,
          machinery: unitCost * e.breakdown.machinery,
        },
        priceUnit: e.unit,
        unitConversion: 1,
        warnings: [
          `Preço estimado por IA (${e.confidence}).${refNote} Verificar com: ${e.verificationSources.join(", ") || "fornecedores locais"}.${procurementNote}`,
        ],
        articleQuantity: quantity,
        articleUnit: artInfo?.unit ?? e.unit,
        estimatedCost: unitCost * quantity,
      };
    });
}

/**
 * AI Price Estimator — fills gaps in the CYPE price database.
 *
 * In deep mode, when the CYPE database can't match BOQ articles,
 * this module sends the unmatched articles to Claude for market-based
 * price estimation using Portuguese construction market knowledge.
 *
 * The AI estimates:
 *   - Unit costs (materials, labor, machinery breakdown)
 *   - Productivity rates for labor
 *   - Suggested suppliers/sources for verification
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
}

export interface AiPriceEstimationResult {
  estimates: AiPriceEstimate[];
  /** Articles the AI couldn't estimate (too specialized or ambiguous) */
  unestimable: string[];
  tokenUsage: { input: number; output: number };
}

/**
 * Use AI to estimate prices for BOQ articles that the CYPE database couldn't match.
 *
 * Sends unmatched articles + project context to Claude, which returns
 * market-based estimates with confidence levels and verification sources.
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
    return { estimates: [], unestimable: [], tokenUsage: { input: 0, output: 0 } };
  }

  const systemPrompt = `You are a Portuguese construction cost estimator (Medidor/Orçamentista) with deep knowledge of the Portuguese market.

You are estimating unit costs for BOQ (Bill of Quantities) articles that weren't found in the standard CYPE price database.

For each article, provide:
1. Estimated unit cost in EUR (realistic Portuguese market prices, 2024-2025)
2. Cost breakdown: materials %, labor %, machinery %
3. Confidence level: high (you know this well), medium (reasonable estimate), low (educated guess)
4. Brief rationale for the estimate
5. Suggested sources for price verification (Portuguese suppliers, databases)

Key references for Portuguese construction pricing:
- ProNIC database
- CYPE Gerador de Preços
- LNEC price indices
- Supplier databases: Construlink, Leroy Merlin Profissional, Saint-Gobain

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
      "rationale": "Why this price (Portuguese)",
      "verificationSources": ["CYPE Gerador de Preços - similar item", "Construlink"]
    }
  ],
  "unestimable": ["codes of articles too specialized to estimate"]
}`;

  // Limit to first 30 unmatched articles (token budget)
  const articlesToEstimate = unmatched.slice(0, 30);
  const articlesJson = JSON.stringify(
    articlesToEstimate.map(a => ({
      code: a.articleCode,
      description: a.description,
      suggestedSearch: a.suggestedSearch,
    })),
    null,
    2,
  );

  const userPrompt = `## Project Context
- Building type: ${projectContext.buildingType}
- Location: ${projectContext.location}
- Area: ${projectContext.area ?? "Unknown"} m²
- Rehabilitation: ${projectContext.isRehabilitation ? "Yes" : "No"}

## Unmatched BOQ Articles (${unmatched.length} total, showing ${articlesToEstimate.length})
${articlesJson}

Estimate unit costs for each article based on current Portuguese market prices.`;

  log.info("Estimating prices for unmatched articles", {
    total: unmatched.length,
    estimating: articlesToEstimate.length,
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
    }));

    unestimable = Array.isArray(parsed.unestimable) ? parsed.unestimable : [];
  } catch (err) {
    log.warn("Failed to parse price estimation response", { error: String(err) });
  }

  return { estimates, unestimable, tokenUsage };
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
          `Preço estimado por IA (${e.confidence}). Verificar com: ${e.verificationSources.join(", ") || "fornecedores locais"}.`,
        ],
        articleQuantity: quantity,
        articleUnit: artInfo?.unit ?? e.unit,
        estimatedCost: unitCost * quantity,
      };
    });
}

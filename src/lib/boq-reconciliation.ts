/**
 * BOQ Reconciliation Engine
 *
 * Matches an execution project BOQ (canonical source) against IFC-derived
 * articles, preserving original BOQ descriptions and clearly marking
 * additions found in the IFC model but absent from the execution BOQ.
 *
 * Matching strategy (4-pass):
 *   0. Direct keynote — IFC element classification (from Revit keynote master file)
 *      matches BOQ article code directly (confidence 98). This is the user's own
 *      explicit linkage and takes highest priority.
 *   1. Generated code match — IFC-generated article code matches BOQ code (confidence 90-95)
 *   2. Price code match — both items resolved to the same price code (confidence 70-85)
 *   3. Text similarity — Jaccard + domain boost on descriptions (confidence 40-70, threshold ≥ 50)
 *
 * Unmatched IFC items become AdditionArticle entries with isAddition: true.
 */

import type { BoqItem, ParsedBoq } from "./xlsx-parser";
import type { WbsArticle } from "./wbs-types";
import type { PriceMatch } from "./wbs-types";
import type { IfcQuantityData } from "./ifc-specialty-analyzer";
import {
  normalizeText,
  tokenize,
  jaccardSimilarity,
  domainOverlapBonus,
  normalizeUnit,
  unitsCompatible,
} from "./text-similarity";

// ============================================================
// Types
// ============================================================

export interface ReconciledArticle {
  /** From execution BOQ — article code as-is */
  articleCode: string;
  /** Original description from execution BOQ — NEVER overwritten */
  originalDescription: string;
  /** Unit of measurement */
  unit: string;
  /** Quantity from execution BOQ */
  executionQuantity: number;
  /** Unit price from execution BOQ */
  executionUnitPrice: number;
  /** Total price from execution BOQ */
  executionTotalPrice: number;

  // IFC enrichment
  /** true if IFC analysis found matching elements */
  ifcCorroborated: boolean;
  /** Quantity measured from IFC model */
  ifcQuantity?: number;
  /** ifcQuantity - executionQuantity */
  quantityDelta?: number;
  /** Linked IFC element GUIDs */
  ifcElementIds?: string[];
  /** Description from IFC (for reference, never replaces original) */
  ifcDescription?: string;

  // Price enrichment
  /** Matched price code */
  priceCode?: string;
  /** Price unit cost */
  priceCost?: number;

  // Matching metadata
  /** Confidence 0-100 */
  matchConfidence: number;
  /** How the match was determined */
  matchMethod: "direct_keynote" | "keynote" | "text_similarity" | "price_code" | "unmatched";
  /** Always "execution_boq" for reconciled articles */
  source: "execution_boq";
}

export interface AdditionArticle {
  /** Auto-generated code (ADD-001, ADD-002...) */
  articleCode: string;
  /** Description from IFC element type/family */
  description: string;
  /** Unit of measurement */
  unit: string;
  /** Quantity from IFC measurement */
  ifcQuantity: number;
  /** IFC element GUIDs */
  ifcElementIds: string[];

  // Price enrichment
  priceCode?: string;
  priceCost?: number;
  estimatedCost?: number;

  /** Always "ifc" for addition articles */
  source: "ifc";
  /** Always true */
  isAddition: true;
  /** Portuguese reason */
  additionReason: string;
}

export interface ReconciliationStats {
  /** Total articles in execution BOQ */
  totalExecution: number;
  /** Execution articles confirmed by IFC */
  corroboratedByIfc: number;
  /** Execution articles with quantity difference */
  withQuantityDelta: number;
  /** Number of new items found in IFC but not in BOQ */
  totalAdditions: number;
  /** Total cost from execution BOQ */
  executionCost: number;
  /** Estimated cost of additions */
  additionCost: number;
  /** Average match confidence (0-100) */
  avgConfidence: number;
}

export interface ReconciledBoq {
  executionArticles: ReconciledArticle[];
  additionArticles: AdditionArticle[];
  stats: ReconciliationStats;
}

// ============================================================
// Helpers
// ============================================================

// ============================================================
// Pass 0: Direct Keynote from IFC Elements
// ============================================================

/**
 * Aggregate data from raw IFC elements grouped by their classification
 * (Revit keynote). This uses the user's own keynote master file linkage.
 */
interface KeynoteElementGroup {
  keynote: string;
  elements: IfcQuantityData[];
  totalQuantity: number;
  unit: string;
  elementIds: string[];
  description: string;
}

/**
 * Build a map of keynote code → grouped IFC elements.
 * Uses `IfcQuantityData.classification` which stores the Revit keynote
 * assigned from the user's keynote master file.
 */
function buildDirectKeynoteIndex(
  ifcElements: IfcQuantityData[],
): Map<string, KeynoteElementGroup> {
  const index = new Map<string, KeynoteElementGroup>();

  for (const elem of ifcElements) {
    if (!elem.classification) continue;

    // Skip TYPE entities
    const entityNorm = elem.entityType.toUpperCase().replace("IFC", "");
    if (entityNorm.endsWith("TYPE") || entityNorm.endsWith("STYLE")) continue;

    const keynote = elem.classification.trim();
    if (!keynote) continue;

    const existing = index.get(keynote);
    const globalId = elem.globalId ?? elem.name;

    // Determine quantity and unit based on entity type
    const { quantity, unit } = getElementQuantityAndUnit(elem);

    if (existing) {
      existing.elements.push(elem);
      existing.totalQuantity += quantity;
      existing.elementIds.push(globalId);
    } else {
      index.set(keynote, {
        keynote,
        elements: [elem],
        totalQuantity: quantity,
        unit,
        elementIds: [globalId],
        description: elem.name || elem.entityType,
      });
    }
  }

  return index;
}

/**
 * Get the most appropriate quantity and unit from an IFC element
 * based on its entity type.
 */
function getElementQuantityAndUnit(elem: IfcQuantityData): { quantity: number; unit: string } {
  const entityNorm = elem.entityType.toUpperCase().replace("IFC", "");
  const q = elem.quantities;

  // Columns, beams, pipes → linear meters
  if (entityNorm.includes("COLUMN") || entityNorm.includes("BEAM") ||
      entityNorm.includes("PIPE") || entityNorm.includes("CABLE") ||
      entityNorm.includes("DUCT") || entityNorm.includes("RAILING")) {
    return { quantity: q.length ?? q.height ?? 1, unit: "m" };
  }

  // Walls, slabs, roofs, floors → area
  if (entityNorm.includes("WALL") || entityNorm.includes("SLAB") ||
      entityNorm.includes("ROOF") || entityNorm.includes("COVERING") ||
      entityNorm.includes("WINDOW") || entityNorm.includes("CURTAINWALL")) {
    return { quantity: q.area ?? 1, unit: "m2" };
  }

  // Footings → volume
  if (entityNorm.includes("FOOTING") || entityNorm.includes("PILE")) {
    return { quantity: q.volume ?? 1, unit: "m3" };
  }

  // Reinforcing → weight
  if (entityNorm.includes("REINFORCING") || entityNorm.includes("MEMBER")) {
    return { quantity: q.weight ?? 1, unit: "kg" };
  }

  // Everything else (doors, fixtures, equipment, etc.) → count
  return { quantity: q.count ?? 1, unit: "Ud" };
}

// ============================================================
// Pass 1-3 Helpers
// ============================================================

/**
 * Build a map of IFC articles grouped by their keynote/article code.
 * Each key maps to all IFC articles that share that code.
 */
function buildIfcKeynoteIndex(
  ifcArticles: WbsArticle[],
): Map<string, WbsArticle[]> {
  const index = new Map<string, WbsArticle[]>();

  for (const art of ifcArticles) {
    const code = art.code.trim();
    if (!code) continue;
    const existing = index.get(code) ?? [];
    existing.push(art);
    index.set(code, existing);
  }

  return index;
}

/**
 * Build a map of IFC articles grouped by price code (if matched).
 */
function buildPriceCodeIndex(
  ifcArticles: WbsArticle[],
  priceMatches: PriceMatch[],
): Map<string, { article: WbsArticle; priceCode: string }[]> {
  const index = new Map<string, { article: WbsArticle; priceCode: string }[]>();

  // Build article code → price code lookup
  const articleToPrice = new Map<string, string>();
  for (const match of priceMatches) {
    articleToPrice.set(match.articleCode, match.priceCode);
  }

  for (const art of ifcArticles) {
    const priceCode = articleToPrice.get(art.code);
    if (!priceCode) continue;
    const existing = index.get(priceCode) ?? [];
    existing.push({ article: art, priceCode });
    index.set(priceCode, existing);
  }

  return index;
}

/**
 * Aggregate quantities from multiple IFC articles into a single
 * quantity value and collected element IDs.
 */
function aggregateIfcArticles(articles: WbsArticle[]): {
  quantity: number;
  elementIds: string[];
  description: string;
} {
  let quantity = 0;
  const elementIds: string[] = [];
  let description = "";

  for (const art of articles) {
    quantity += art.quantity;
    if (art.elementIds) elementIds.push(...art.elementIds);
    if (!description) description = art.description;
  }

  return { quantity, elementIds, description };
}

/** Quantity delta threshold — deltas within ±5% are considered matching */
const QUANTITY_TOLERANCE = 0.05;

/** Text similarity threshold for pass 3 */
const TEXT_SIMILARITY_THRESHOLD = 0.45;

// ============================================================
// Main Reconciliation Function
// ============================================================

/**
 * Reconcile an execution project BOQ against IFC-derived articles.
 *
 * @param executionBoq - Parsed BOQ from the execution project (canonical)
 * @param ifcArticles - Articles generated from IFC analysis
 * @param options - Optional price matches and keynote mappings
 * @returns ReconciledBoq with execution articles and additions
 */
export function reconcileBoqs(
  executionBoq: ParsedBoq,
  ifcArticles: WbsArticle[],
  options?: {
    /** Price matches for the execution BOQ articles */
    executionPriceMatches?: PriceMatch[];
    /** Price matches for the IFC-derived articles */
    ifcPriceMatches?: PriceMatch[];
    /**
     * Raw IFC elements with classification (Revit keynote) data.
     * When provided, enables direct keynote matching (Pass 0) which
     * uses the user's own keynote master file linkage for highest-confidence
     * matches between IFC elements and BOQ article codes.
     */
    ifcElements?: IfcQuantityData[];
  },
): ReconciledBoq {
  const executionPriceMatches = options?.executionPriceMatches ?? [];
  const ifcPriceMatches = options?.ifcPriceMatches ?? [];
  const ifcElements = options?.ifcElements ?? [];

  // Build indices
  const directKeynoteIndex = ifcElements.length > 0
    ? buildDirectKeynoteIndex(ifcElements)
    : new Map<string, KeynoteElementGroup>();
  const ifcByCode = buildIfcKeynoteIndex(ifcArticles);
  const ifcByPrice = buildPriceCodeIndex(ifcArticles, ifcPriceMatches);

  // Build execution BOQ → price lookup
  const execToPrice = new Map<string, PriceMatch>();
  for (const match of executionPriceMatches) {
    execToPrice.set(match.articleCode, match);
  }

  // Track which IFC articles have been consumed (matched to execution BOQ)
  const consumedIfcCodes = new Set<string>();
  // Track which direct keynotes have been consumed
  const consumedKeynotes = new Set<string>();

  const executionArticles: ReconciledArticle[] = [];

  // Process each execution BOQ item through 4 matching passes
  for (const boqItem of executionBoq.items) {
    let matched = false;
    let matchConfidence = 0;
    let matchMethod: ReconciledArticle["matchMethod"] = "unmatched";
    let ifcQuantity: number | undefined;
    let ifcElementIds: string[] | undefined;
    let ifcDescription: string | undefined;
    let priceCode: string | undefined;
    let priceCost: number | undefined;

    // Get price info for this execution article
    const execPrice = execToPrice.get(boqItem.code);
    if (execPrice) {
      priceCode = execPrice.priceCode;
      priceCost = execPrice.unitCost;
    }

    // ── Pass 0: Direct keynote match (from user's keynote master file) ──
    // IFC element classification (Revit keynote) → BOQ article code
    // This is the user's own explicit linkage and has highest confidence.
    const directGroup = directKeynoteIndex.get(boqItem.code);
    if (directGroup && directGroup.elements.length > 0) {
      ifcQuantity = directGroup.totalQuantity;
      ifcElementIds = directGroup.elementIds;
      ifcDescription = `${directGroup.elements.length} elementos IFC (keynote: ${boqItem.code})`;
      matchConfidence = 98;
      matchMethod = "direct_keynote";
      consumedKeynotes.add(boqItem.code);
      matched = true;
    }

    // ── Pass 1: Generated code match ────────────────────────
    // If the BOQ article code directly matches an IFC-generated article code
    if (!matched) {
      const codeMatchArticles = ifcByCode.get(boqItem.code);
      if (codeMatchArticles && codeMatchArticles.length > 0) {
        const agg = aggregateIfcArticles(codeMatchArticles);
        ifcQuantity = agg.quantity;
        ifcElementIds = agg.elementIds;
        ifcDescription = agg.description;
        matchConfidence = 95;
        matchMethod = "keynote";
        consumedIfcCodes.add(boqItem.code);
        matched = true;
      }
    }

    // ── Pass 2: Price code match ────────────────────────────
    if (!matched && priceCode) {
      const priceMatchArticles = ifcByPrice.get(priceCode);
      if (priceMatchArticles && priceMatchArticles.length > 0) {
        // Find unconsumed ones
        const available = priceMatchArticles.filter(
          (cm) => !consumedIfcCodes.has(cm.article.code),
        );
        if (available.length > 0) {
          const articles = available.map((a) => a.article);
          const agg = aggregateIfcArticles(articles);
          ifcQuantity = agg.quantity;
          ifcElementIds = agg.elementIds;
          ifcDescription = agg.description;

          // Confidence depends on unit compatibility
          const unitMatch = unitsCompatible(boqItem.unit, articles[0].unit);
          matchConfidence = unitMatch ? 80 : 70;
          matchMethod = "price_code";

          for (const a of articles) consumedIfcCodes.add(a.code);
          matched = true;
        }
      }
    }

    // ── Pass 3: Text similarity match ──────────────────────
    if (!matched) {
      let bestSim = 0;
      let bestIfcArticle: WbsArticle | null = null;

      for (const ifcArt of ifcArticles) {
        if (consumedIfcCodes.has(ifcArt.code)) continue;

        // Must have compatible units
        if (!unitsCompatible(boqItem.unit, ifcArt.unit)) continue;

        const tokensA = tokenize(boqItem.description);
        const tokensB = tokenize(ifcArt.description);

        if (tokensA.size === 0 || tokensB.size === 0) continue;

        const jaccard = jaccardSimilarity(tokensA, tokensB);
        const bonus = domainOverlapBonus(tokensA, tokensB);
        const sim = Math.min(1, jaccard + bonus);

        if (sim > bestSim) {
          bestSim = sim;
          bestIfcArticle = ifcArt;
        }
      }

      if (bestIfcArticle && bestSim >= TEXT_SIMILARITY_THRESHOLD) {
        const agg = aggregateIfcArticles([bestIfcArticle]);
        ifcQuantity = agg.quantity;
        ifcElementIds = agg.elementIds;
        ifcDescription = agg.description;
        matchConfidence = Math.round(bestSim * 100);
        matchMethod = "text_similarity";
        consumedIfcCodes.add(bestIfcArticle.code);
        matched = true;
      }
    }

    // Build reconciled article
    const ifcCorroborated = matched;
    let quantityDelta: number | undefined;
    if (ifcCorroborated && ifcQuantity !== undefined) {
      quantityDelta = ifcQuantity - boqItem.quantity;
    }

    executionArticles.push({
      articleCode: boqItem.code,
      originalDescription: boqItem.description,
      unit: boqItem.unit,
      executionQuantity: boqItem.quantity,
      executionUnitPrice: boqItem.unitPrice,
      executionTotalPrice: boqItem.totalPrice,
      ifcCorroborated,
      ifcQuantity: ifcCorroborated ? ifcQuantity : undefined,
      quantityDelta: ifcCorroborated ? quantityDelta : undefined,
      ifcElementIds: ifcCorroborated ? ifcElementIds : undefined,
      ifcDescription: ifcCorroborated ? ifcDescription : undefined,
      priceCode,
      priceCost,
      matchConfidence: matched ? matchConfidence : 0,
      matchMethod,
      source: "execution_boq",
    });
  }

  // ── Build additions from unmatched IFC articles ──────────
  const additionArticles: AdditionArticle[] = [];
  let additionIndex = 1;

  // Additions from unmatched IFC-generated articles (Pass 1-3 leftovers)
  for (const ifcArt of ifcArticles) {
    if (consumedIfcCodes.has(ifcArt.code)) continue;

    // Skip IFC articles with no quantity
    if (ifcArt.quantity <= 0) continue;

    // Find price match for this IFC article
    const ifcPrice = ifcPriceMatches.find((m) => m.articleCode === ifcArt.code);

    const estimatedCost = ifcPrice
      ? ifcPrice.unitCost * ifcArt.quantity
      : ifcArt.unitPrice
        ? ifcArt.unitPrice * ifcArt.quantity
        : undefined;

    additionArticles.push({
      articleCode: `ADD-${String(additionIndex).padStart(3, "0")}`,
      description: ifcArt.description,
      unit: ifcArt.unit,
      ifcQuantity: ifcArt.quantity,
      ifcElementIds: ifcArt.elementIds ?? [],
      priceCode: ifcPrice?.priceCode,
      priceCost: ifcPrice?.unitCost,
      estimatedCost,
      source: "ifc",
      isAddition: true,
      additionReason: "Encontrado no modelo IFC mas ausente no mapa de quantidades de execução",
    });

    additionIndex++;
  }

  // Additions from unconsumed direct keynote groups (Pass 0 leftovers)
  // These are IFC elements with keynotes that don't match any BOQ article code
  for (const [keynote, group] of directKeynoteIndex) {
    if (consumedKeynotes.has(keynote)) continue;
    if (group.totalQuantity <= 0) continue;

    additionArticles.push({
      articleCode: `ADD-${String(additionIndex).padStart(3, "0")}`,
      description: `${group.description} (keynote: ${keynote})`,
      unit: group.unit,
      ifcQuantity: group.totalQuantity,
      ifcElementIds: group.elementIds,
      source: "ifc",
      isAddition: true,
      additionReason: "Keynote IFC sem correspondência no mapa de quantidades de execução",
    });

    additionIndex++;
  }

  // ── Compute stats ────────────────────────────────────────
  const corroboratedByIfc = executionArticles.filter((a) => a.ifcCorroborated).length;
  const withQuantityDelta = executionArticles.filter(
    (a) =>
      a.ifcCorroborated &&
      a.quantityDelta !== undefined &&
      Math.abs(a.quantityDelta) > a.executionQuantity * QUANTITY_TOLERANCE,
  ).length;

  const executionCost = executionArticles.reduce(
    (sum, a) => sum + a.executionTotalPrice,
    0,
  );

  const additionCost = additionArticles.reduce(
    (sum, a) => sum + (a.estimatedCost ?? 0),
    0,
  );

  const matchedArticles = executionArticles.filter((a) => a.ifcCorroborated);
  const avgConfidence =
    matchedArticles.length > 0
      ? Math.round(
          matchedArticles.reduce((sum, a) => sum + a.matchConfidence, 0) /
            matchedArticles.length,
        )
      : 0;

  return {
    executionArticles,
    additionArticles,
    stats: {
      totalExecution: executionArticles.length,
      corroboratedByIfc,
      withQuantityDelta,
      totalAdditions: additionArticles.length,
      executionCost: Math.round(executionCost),
      additionCost: Math.round(additionCost),
      avgConfidence,
    },
  };
}

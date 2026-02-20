/**
 * BOQ Reconciliation Engine Tests
 *
 * Validates the 3-pass matching strategy, original description preservation,
 * additions marking, quantity delta calculations, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  reconcileBoqs,
  type ReconciledBoq,
} from "../lib/boq-reconciliation";
import type { ParsedBoq, BoqItem } from "../lib/xlsx-parser";
import type { WbsArticle, PriceMatch } from "../lib/wbs-types";
import type { IfcQuantityData } from "../lib/ifc-specialty-analyzer";

// ============================================================
// Helpers
// ============================================================

function makeBoqItem(overrides: Partial<BoqItem> & { code: string; description: string }): BoqItem {
  return {
    unit: "m2",
    quantity: 100,
    unitPrice: 50,
    totalPrice: 5000,
    sourceRow: 1,
    ...overrides,
  };
}

function makeParsedBoq(items: BoqItem[]): ParsedBoq {
  return {
    items,
    chapters: [],
    hasWbs: false,
    isIsoWbs: false,
    totalCost: items.reduce((sum, i) => sum + i.totalPrice, 0),
    currency: "EUR",
    sheetName: "BOQ",
    warnings: [],
    skippedRows: 0,
  };
}

function makeWbsArticle(overrides: Partial<WbsArticle> & { code: string; description: string }): WbsArticle {
  return {
    unit: "m2",
    quantity: 100,
    ...overrides,
  };
}

function makePriceMatch(articleCode: string, priceCode: string, unitCost: number = 50): PriceMatch {
  return {
    articleCode,
    priceCode,
    confidence: 75,
    unitCost,
    articleQuantity: 100,
    articleUnit: "m2",
    estimatedCost: unitCost * 100,
    matchedDescription: "",
  };
}

function makeIfcElement(overrides: Partial<IfcQuantityData> & { entityType: string }): IfcQuantityData {
  return {
    name: "Element",
    properties: {},
    propertySetData: {},
    quantities: { count: 1 },
    materials: [],
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe("BOQ Reconciliation Engine", () => {
  it("Pass 1: keynote-linked articles match with confidence ≥ 90", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.01.001",
        description: "Pilares de betão armado C25/30",
        unit: "m",
        quantity: 114,
        unitPrice: 673.53,
        totalPrice: 76782.42,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "06.01.001",
        description: "Pilares de betão armado (38 elementos IFC)",
        unit: "m",
        quantity: 120,
        elementIds: ["elem-1", "elem-2", "elem-3"],
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    expect(result.executionArticles).toHaveLength(1);
    const article = result.executionArticles[0];
    expect(article.ifcCorroborated).toBe(true);
    expect(article.matchConfidence).toBeGreaterThanOrEqual(90);
    expect(article.matchMethod).toBe("keynote");
    expect(article.ifcQuantity).toBe(120);
    expect(article.ifcElementIds).toEqual(["elem-1", "elem-2", "elem-3"]);
  });

  it("Pass 2: price code match when descriptions differ but codes match", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "08.01.005",
        description: "Alvenaria de tijolo cerâmico furado 15cm",
        unit: "m2",
        quantity: 350,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "08.01.001",
        description: "Alvenaria de tijolo (paredes exteriores)",
        unit: "m2",
        quantity: 380,
        elementIds: ["wall-1", "wall-2"],
      }),
    ];

    const executionPriceMatches: PriceMatch[] = [
      makePriceMatch("08.01.005", "ABT010"),
    ];
    const ifcPriceMatches: PriceMatch[] = [
      makePriceMatch("08.01.001", "ABT010"),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles, {
      executionPriceMatches,
      ifcPriceMatches,
    });

    expect(result.executionArticles).toHaveLength(1);
    const article = result.executionArticles[0];
    expect(article.ifcCorroborated).toBe(true);
    expect(article.matchMethod).toBe("price_code");
    expect(article.matchConfidence).toBeGreaterThanOrEqual(70);
    expect(article.ifcQuantity).toBe(380);
    expect(article.priceCode).toBe("ABT010");
  });

  it("Pass 3: text similarity match with Portuguese construction terms", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "23.01.010",
        description: "Fornecimento e instalação de quadro elétrico geral com proteções",
        unit: "Ud",
        quantity: 1,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "23.06.001",
        description: "Quadro elétrico principal com proteções diferenciais",
        unit: "Ud",
        quantity: 1,
        elementIds: ["qe-1"],
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    expect(result.executionArticles).toHaveLength(1);
    const article = result.executionArticles[0];
    expect(article.ifcCorroborated).toBe(true);
    expect(article.matchMethod).toBe("text_similarity");
    expect(article.matchConfidence).toBeGreaterThan(0);
  });

  it("unmatched IFC items become additions with isAddition: true", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.01.001",
        description: "Pilares de betão armado",
        unit: "m",
        quantity: 114,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "06.01.001",
        description: "Pilares",
        unit: "m",
        quantity: 114,
      }),
      // This article has no match in the execution BOQ
      makeWbsArticle({
        code: "27.01.001",
        description: "Sistema de deteção de incêndio",
        unit: "Ud",
        quantity: 3,
        elementIds: ["fire-1", "fire-2", "fire-3"],
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    expect(result.additionArticles).toHaveLength(1);
    const addition = result.additionArticles[0];
    expect(addition.isAddition).toBe(true);
    expect(addition.source).toBe("ifc");
    expect(addition.articleCode).toBe("ADD-001");
    expect(addition.description).toBe("Sistema de deteção de incêndio");
    expect(addition.ifcQuantity).toBe(3);
    expect(addition.ifcElementIds).toEqual(["fire-1", "fire-2", "fire-3"]);
    expect(addition.additionReason).toContain("ausente no mapa de quantidades");
  });

  it("original descriptions are preserved (never overwritten by IFC)", () => {
    const originalDescription = "Fornecimento e colocação de caixilharia de alumínio RPT com vidro duplo";
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "15.01.001",
        description: originalDescription,
        unit: "m2",
        quantity: 45,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "15.01.001",
        description: "Caixilharia exterior (janelas IFC)",
        unit: "m2",
        quantity: 48,
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    expect(result.executionArticles).toHaveLength(1);
    const article = result.executionArticles[0];
    expect(article.originalDescription).toBe(originalDescription);
    expect(article.source).toBe("execution_boq");
    // IFC description is stored separately for reference
    expect(article.ifcDescription).toBe("Caixilharia exterior (janelas IFC)");
  });

  it("quantity delta calculated correctly (positive = IFC has more)", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.02.001",
        description: "Vigas de betão armado",
        unit: "m",
        quantity: 200,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "06.02.001",
        description: "Vigas",
        unit: "m",
        quantity: 235,
        elementIds: ["beam-1"],
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    const article = result.executionArticles[0];
    expect(article.quantityDelta).toBe(35); // 235 - 200 = +35
    expect(article.ifcQuantity).toBe(235);
    expect(article.executionQuantity).toBe(200);
  });

  it("unit compatibility: m2 matches m², un matches ud", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "13.01.001",
        description: "Pavimento cerâmico",
        unit: "m²",
        quantity: 80,
      }),
      makeBoqItem({
        code: "17.01.001",
        description: "Portas interiores de madeira",
        unit: "un",
        quantity: 12,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "13.01.001",
        description: "Pavimento cerâmico antiderrapante",
        unit: "m2",
        quantity: 82,
      }),
      makeWbsArticle({
        code: "17.01.001",
        description: "Portas interiores",
        unit: "Ud",
        quantity: 14,
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    // Both should be corroborated despite different unit spellings
    expect(result.executionArticles[0].ifcCorroborated).toBe(true);
    expect(result.executionArticles[1].ifcCorroborated).toBe(true);
  });

  it("empty execution BOQ → all IFC items are additions", () => {
    const executionBoq = makeParsedBoq([]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "06.01.001",
        description: "Pilares",
        unit: "m",
        quantity: 114,
        elementIds: ["col-1"],
      }),
      makeWbsArticle({
        code: "06.02.001",
        description: "Vigas",
        unit: "m",
        quantity: 200,
        elementIds: ["beam-1"],
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    expect(result.executionArticles).toHaveLength(0);
    expect(result.additionArticles).toHaveLength(2);
    expect(result.additionArticles[0].articleCode).toBe("ADD-001");
    expect(result.additionArticles[1].articleCode).toBe("ADD-002");
    expect(result.stats.totalExecution).toBe(0);
    expect(result.stats.totalAdditions).toBe(2);
  });

  it("empty IFC BOQ → all execution items with ifcCorroborated: false", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.01.001",
        description: "Pilares de betão armado",
        unit: "m",
        quantity: 114,
      }),
      makeBoqItem({
        code: "08.01.001",
        description: "Alvenaria de tijolo",
        unit: "m2",
        quantity: 350,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    expect(result.executionArticles).toHaveLength(2);
    expect(result.executionArticles.every((a) => !a.ifcCorroborated)).toBe(true);
    expect(result.executionArticles.every((a) => a.matchMethod === "unmatched")).toBe(true);
    expect(result.additionArticles).toHaveLength(0);
    expect(result.stats.corroboratedByIfc).toBe(0);
  });

  it("stats computed correctly (corroborated count, costs, avg confidence)", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.01.001",
        description: "Pilares de betão armado",
        unit: "m",
        quantity: 114,
        unitPrice: 673.53,
        totalPrice: 76782.42,
      }),
      makeBoqItem({
        code: "06.02.001",
        description: "Vigas de betão armado",
        unit: "m",
        quantity: 200,
        unitPrice: 96.93,
        totalPrice: 19386,
      }),
      makeBoqItem({
        code: "25.01.001",
        description: "Sistema AVAC central",
        unit: "vg",
        quantity: 1,
        unitPrice: 15000,
        totalPrice: 15000,
      }),
    ]);

    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "06.01.001",
        description: "Pilares",
        unit: "m",
        quantity: 120,
      }),
      makeWbsArticle({
        code: "06.02.001",
        description: "Vigas",
        unit: "m",
        quantity: 235,
      }),
      // AVAC has no match (different unit/code)
      makeWbsArticle({
        code: "09.01.001",
        description: "Cobertura em telha cerâmica",
        unit: "m2",
        quantity: 160,
        elementIds: ["roof-1"],
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles);

    // 2 out of 3 execution articles matched (AVAC unmatched)
    expect(result.stats.totalExecution).toBe(3);
    expect(result.stats.corroboratedByIfc).toBe(2);

    // Both matched articles have quantity deltas > 5%
    expect(result.stats.withQuantityDelta).toBe(2);

    // 1 IFC article unmatched (cobertura)
    expect(result.stats.totalAdditions).toBe(1);

    // Execution cost = sum of all 3 execution articles
    expect(result.stats.executionCost).toBe(
      Math.round(76782.42 + 19386 + 15000),
    );

    // Average confidence should be > 0 (only for matched articles)
    expect(result.stats.avgConfidence).toBeGreaterThan(0);
  });

  // ============================================================
  // Pass 0: Direct Keynote Matching
  // ============================================================

  it("Pass 0: direct keynote match from IFC element classification", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.01.001",
        description: "Pilares de betão armado C25/30",
        unit: "m",
        quantity: 114,
        unitPrice: 673.53,
        totalPrice: 76782.42,
      }),
    ]);

    // IFC elements with classification matching the BOQ code
    const ifcElements: IfcQuantityData[] = [
      makeIfcElement({
        entityType: "IFCCOLUMN",
        name: "Concrete-Rectangular-Column:250x450mm",
        globalId: "col-guid-1",
        classification: "06.01.001",
        quantities: { length: 3.0 },
      }),
      makeIfcElement({
        entityType: "IFCCOLUMN",
        name: "Concrete-Rectangular-Column:250x450mm",
        globalId: "col-guid-2",
        classification: "06.01.001",
        quantities: { length: 3.5 },
      }),
    ];

    const result = reconcileBoqs(executionBoq, [], { ifcElements });

    expect(result.executionArticles).toHaveLength(1);
    const article = result.executionArticles[0];
    expect(article.ifcCorroborated).toBe(true);
    expect(article.matchMethod).toBe("direct_keynote");
    expect(article.matchConfidence).toBe(98);
    expect(article.ifcQuantity).toBe(6.5); // 3.0 + 3.5
    expect(article.ifcElementIds).toEqual(["col-guid-1", "col-guid-2"]);
    expect(article.originalDescription).toBe("Pilares de betão armado C25/30");
  });

  it("Pass 0: takes priority over Pass 1 generated code match", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.01.001",
        description: "Pilares de betão armado",
        unit: "m",
        quantity: 114,
      }),
    ]);

    // Both a generated IFC article AND raw IFC elements with keynote match
    const ifcArticles: WbsArticle[] = [
      makeWbsArticle({
        code: "06.01.001",
        description: "Pilares (auto-generated)",
        unit: "m",
        quantity: 100,
        elementIds: ["gen-1"],
      }),
    ];

    const ifcElements: IfcQuantityData[] = [
      makeIfcElement({
        entityType: "IFCCOLUMN",
        name: "Column",
        globalId: "direct-1",
        classification: "06.01.001",
        quantities: { length: 120 },
      }),
    ];

    const result = reconcileBoqs(executionBoq, ifcArticles, { ifcElements });

    // Direct keynote should win (Pass 0 before Pass 1)
    const article = result.executionArticles[0];
    expect(article.matchMethod).toBe("direct_keynote");
    expect(article.matchConfidence).toBe(98);
    expect(article.ifcQuantity).toBe(120);

    // The generated IFC article should become an addition since it wasn't consumed
    expect(result.additionArticles).toHaveLength(1);
    expect(result.additionArticles[0].description).toBe("Pilares (auto-generated)");
  });

  it("Pass 0: unconsumed keynote groups become additions", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.01.001",
        description: "Pilares",
        unit: "m",
        quantity: 114,
      }),
    ]);

    // IFC elements: some match BOQ code, some have a different keynote
    const ifcElements: IfcQuantityData[] = [
      makeIfcElement({
        entityType: "IFCCOLUMN",
        name: "Column",
        globalId: "col-1",
        classification: "06.01.001",
        quantities: { length: 114 },
      }),
      // This keynote does NOT match any BOQ article → should become an addition
      makeIfcElement({
        entityType: "IFCWALL",
        name: "Interior Wall",
        globalId: "wall-1",
        classification: "08.02.003",
        quantities: { area: 50 },
      }),
      makeIfcElement({
        entityType: "IFCWALL",
        name: "Interior Wall",
        globalId: "wall-2",
        classification: "08.02.003",
        quantities: { area: 75 },
      }),
    ];

    const result = reconcileBoqs(executionBoq, [], { ifcElements });

    // BOQ article matched via Pass 0
    expect(result.executionArticles[0].matchMethod).toBe("direct_keynote");

    // Unmatched keynote group becomes an addition
    expect(result.additionArticles).toHaveLength(1);
    const addition = result.additionArticles[0];
    expect(addition.isAddition).toBe(true);
    expect(addition.articleCode).toBe("ADD-001");
    expect(addition.description).toContain("08.02.003");
    expect(addition.ifcQuantity).toBe(125); // 50 + 75
    expect(addition.unit).toBe("m2");
    expect(addition.ifcElementIds).toEqual(["wall-1", "wall-2"]);
    expect(addition.additionReason).toContain("Keynote IFC");
  });

  it("Pass 0: TYPE entities are excluded from keynote grouping", () => {
    const executionBoq = makeParsedBoq([
      makeBoqItem({
        code: "06.01.001",
        description: "Pilares",
        unit: "m",
        quantity: 10,
      }),
    ]);

    const ifcElements: IfcQuantityData[] = [
      makeIfcElement({
        entityType: "IFCCOLUMN",
        name: "Column",
        globalId: "col-1",
        classification: "06.01.001",
        quantities: { length: 3.0 },
      }),
      // TYPE entity should be excluded
      makeIfcElement({
        entityType: "IFCCOLUMNTYPE",
        name: "Column Type",
        globalId: "type-1",
        classification: "06.01.001",
        quantities: { length: 0 },
      }),
    ];

    const result = reconcileBoqs(executionBoq, [], { ifcElements });

    const article = result.executionArticles[0];
    expect(article.ifcCorroborated).toBe(true);
    // Only the real column, not the type
    expect(article.ifcElementIds).toEqual(["col-1"]);
    expect(article.ifcQuantity).toBe(3.0);
  });
});

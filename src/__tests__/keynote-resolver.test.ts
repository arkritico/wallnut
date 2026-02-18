import { describe, it, expect } from "vitest";
import {
  generateBoqFromIfc,
  matchIfcToBoq,
  exportMappingTable,
  parseDimensionsFromName,
  type GeneratedBoq,
} from "@/lib/keynote-resolver";
import type { SpecialtyAnalysisResult } from "@/lib/ifc-specialty-analyzer";
import type { IfcQuantityData } from "@/lib/ifc-specialty-analyzer";
import type { WbsProject } from "@/lib/wbs-types";

function makeElement(overrides: Partial<IfcQuantityData> = {}): IfcQuantityData {
  return {
    entityType: "IFCCOLUMN",
    name: "Concrete-Rectangular-Column:250 x 450mm",
    globalId: "abc123",
    properties: {},
    propertySetData: {},
    quantities: { length: 3.0 },
    materials: ["C25/30"],
    ...overrides,
  };
}

function makeAnalysis(elements: IfcQuantityData[]): SpecialtyAnalysisResult {
  return {
    specialty: "structure",
    quantities: elements,
    chapters: [],
    optimizations: [],
    summary: {
      totalElements: elements.length,
      elementsByType: {},
      storeys: [],
      materialsUsed: [],
    },
  };
}

// ============================================================
// parseDimensionsFromName
// ============================================================

describe("parseDimensionsFromName", () => {
  it("parses rectangular dimensions (NNN x NNNmm)", () => {
    const result = parseDimensionsFromName("Concrete-Rectangular-Column:250 x 450mm");
    expect(result.width).toBeCloseTo(0.25);
    expect(result.depth).toBeCloseTo(0.45);
  });

  it("parses dimensions without mm suffix", () => {
    const result = parseDimensionsFromName("Column:300x300");
    expect(result.width).toBeCloseTo(0.3);
    expect(result.depth).toBeCloseTo(0.3);
  });

  it("parses circular diameter (Ø)", () => {
    const result = parseDimensionsFromName("Pile Ø600mm");
    expect(result.diameter).toBeCloseTo(0.6);
  });

  it("returns empty for names without dimensions", () => {
    const result = parseDimensionsFromName("Generic Wall");
    expect(result.width).toBeUndefined();
    expect(result.depth).toBeUndefined();
    expect(result.diameter).toBeUndefined();
  });
});

// ============================================================
// generateBoqFromIfc
// ============================================================

describe("generateBoqFromIfc", () => {
  it("maps IFCCOLUMN to chapter 06 (Estruturas de betão armado)", () => {
    const analysis = makeAnalysis([makeElement({ entityType: "IFCCOLUMN" })]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch06 = result.project.chapters.find(c => c.code === "06");
    expect(ch06).toBeDefined();
    expect(ch06!.name).toBe("Estruturas de betão armado");
  });

  it("maps IFCBEAM to chapter 06, sub-chapter 06.02", () => {
    const analysis = makeAnalysis([makeElement({ entityType: "IFCBEAM", quantities: { length: 5.0 } })]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch06 = result.project.chapters.find(c => c.code === "06");
    const sc0602 = ch06?.subChapters.find(sc => sc.code === "06.02");
    expect(sc0602).toBeDefined();
    expect(sc0602!.articles[0].unit).toBe("m");
    expect(sc0602!.articles[0].quantity).toBe(5.0);
  });

  it("maps IFCWALL to chapter 08 (Alvenarias)", () => {
    const analysis = makeAnalysis([makeElement({ entityType: "IFCWALL", quantities: { area: 25.0 } })]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch08 = result.project.chapters.find(c => c.code === "08");
    expect(ch08).toBeDefined();
  });

  it("maps IFCWINDOW to chapter 15 (Caixilharias)", () => {
    const analysis = makeAnalysis([makeElement({ entityType: "IFCWINDOW", quantities: { area: 2.5 } })]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch15 = result.project.chapters.find(c => c.code === "15");
    expect(ch15).toBeDefined();
    expect(ch15!.subChapters[0].articles[0].unit).toBe("m2");
  });

  it("maps IFCLIGHTFIXTURE to chapter 23 (Instalações elétricas)", () => {
    const analysis = makeAnalysis([makeElement({ entityType: "IFCLIGHTFIXTURE", quantities: { count: 1 } })]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch23 = result.project.chapters.find(c => c.code === "23");
    expect(ch23).toBeDefined();
  });

  it("aggregates quantities for same entity type", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "col1", quantities: { length: 3.0 } }),
      makeElement({ entityType: "IFCCOLUMN", globalId: "col2", quantities: { length: 4.5 } }),
      makeElement({ entityType: "IFCCOLUMN", globalId: "col3", quantities: { length: 2.5 } }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch06 = result.project.chapters.find(c => c.code === "06");
    const article = ch06?.subChapters[0].articles[0];
    expect(article?.quantity).toBe(10.0);
    expect(article?.description).toContain("3 elementos IFC");
  });

  it("skips TYPE entities (not actual elements)", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMNTYPE", globalId: "type1" }),
      makeElement({ entityType: "IFCCOLUMN", globalId: "col1", quantities: { length: 3.0 } }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    expect(result.stats.resolved).toBe(1);
    expect(result.stats.unresolved).toBe(1); // TYPE entity unresolved
  });

  it("handles multiple specialties in a single call", () => {
    const structural = makeAnalysis([makeElement({ entityType: "IFCCOLUMN", quantities: { length: 3.0 } })]);
    const electrical: SpecialtyAnalysisResult = {
      ...makeAnalysis([makeElement({ entityType: "IFCLIGHTFIXTURE", quantities: { count: 1 } })]),
      specialty: "electrical",
    };
    const result = generateBoqFromIfc([structural, electrical], "Test", "2026-03-01");
    expect(result.project.chapters.length).toBeGreaterThanOrEqual(2);
    expect(result.project.chapters.some(c => c.code === "06")).toBe(true);
    expect(result.project.chapters.some(c => c.code === "23")).toBe(true);
  });

  it("sorts chapters in ProNIC order", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCLIGHTFIXTURE", quantities: { count: 1 } }), // ch 23
      makeElement({ entityType: "IFCCOLUMN", quantities: { length: 3.0 } }),     // ch 06
      makeElement({ entityType: "IFCWALL", quantities: { area: 10.0 } }),        // ch 08
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const codes = result.project.chapters.map(c => c.code);
    expect(codes).toEqual([...codes].sort());
  });

  it("returns correct statistics", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", quantities: { length: 3.0 } }),
      makeElement({ entityType: "IFCBEAM", quantities: { length: 5.0 } }),
      makeElement({ entityType: "IFCCOLUMNTYPE" }), // skipped
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    expect(result.stats.totalElements).toBe(3);
    expect(result.stats.resolved).toBe(2);
    expect(result.stats.unresolved).toBe(1);
    expect(result.stats.coveragePercent).toBe(67); // 2/3 rounded
  });

  it("handles empty analysis input", () => {
    const result = generateBoqFromIfc([], "Empty", "2026-03-01");
    expect(result.project.chapters).toHaveLength(0);
    expect(result.stats.totalElements).toBe(0);
    expect(result.stats.coveragePercent).toBe(0);
  });

  it("sets project metadata correctly", () => {
    const analysis = makeAnalysis([makeElement()]);
    const result = generateBoqFromIfc([analysis], "Edifício Nova", "2026-04-01");
    expect(result.project.name).toBe("Edifício Nova");
    expect(result.project.startDate).toBe("2026-04-01");
    expect(result.project.classification).toBe("ProNIC");
  });

  // ==========================================================
  // Classification Reference Resolution (95% confidence)
  // ==========================================================

  it("uses classification reference when present (ProNIC code)", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1", classification: "06.01" }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    expect(result.stats.byMethod.classification).toBe(1);
    const ch06 = result.project.chapters.find(c => c.code === "06");
    expect(ch06).toBeDefined();
  });

  it("uses classification reference when present (CYPE code)", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCBEAM", globalId: "b1", classification: "EHB070" }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    expect(result.stats.byMethod.classification).toBe(1);
    const ch06 = result.project.chapters.find(c => c.code === "06");
    expect(ch06).toBeDefined();
  });

  // ==========================================================
  // Uniformat/ProNIC Keynote Code Resolution (85% confidence)
  // ==========================================================

  it("resolves Uniformat II codes (B1020 → structures)", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1", classification: "B1020" }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    // B1020 is a known Uniformat code → resolves via keynote_code
    expect(result.stats.byMethod.classification || result.stats.byMethod.keynote_code).toBeGreaterThan(0);
    const ch06 = result.project.chapters.find(c => c.code === "06");
    expect(ch06).toBeDefined();
  });

  it("resolves Uniformat II codes (D50 → electrical)", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCLIGHTFIXTURE", globalId: "l1", classification: "D50" }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch23 = result.project.chapters.find(c => c.code === "23");
    expect(ch23).toBeDefined();
  });

  it("resolves Uniformat II codes (E10 → elevators)", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCTRANSPORTELEMENT", globalId: "e1", classification: "E10" }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch26 = result.project.chapters.find(c => c.code === "26");
    expect(ch26).toBeDefined();
  });

  // ==========================================================
  // Name Heuristic Fallback (40-60% confidence)
  // ==========================================================

  it("falls back to name heuristic for unrecognized entity types", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCBUILDINGELEMENTPROXY",
        name: "Parede de alvenaria especial",
        globalId: "p1",
      }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    // "parede" keyword → chapter 08
    expect(result.stats.resolved).toBe(1);
    expect(result.stats.byMethod.name_heuristic).toBe(1);
    const ch08 = result.project.chapters.find(c => c.code === "08");
    expect(ch08).toBeDefined();
  });

  it("name heuristic recognizes Portuguese keywords (extintor → fire safety)", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCBUILDINGELEMENTPROXY",
        name: "Extintor ABC 6kg",
        globalId: "ext1",
      }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    expect(result.stats.resolved).toBe(1);
    const ch27 = result.project.chapters.find(c => c.code === "27");
    expect(ch27).toBeDefined();
  });

  // ==========================================================
  // byMethod statistics
  // ==========================================================

  it("tracks resolution methods in stats.byMethod", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1", classification: "06.01" }),
      makeElement({ entityType: "IFCBEAM", globalId: "b1", quantities: { length: 4 } }),
      makeElement({
        entityType: "IFCBUILDINGELEMENTPROXY",
        name: "Porta interior em madeira",
        globalId: "p1",
      }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    expect(result.stats.resolved).toBe(3);
    expect(result.stats.byMethod.classification).toBe(1);
    expect(result.stats.byMethod.entity_type).toBe(1);
    expect(result.stats.byMethod.name_heuristic).toBe(1);
  });

  // ==========================================================
  // CURTAINWALL before WALL ordering
  // ==========================================================

  it("maps IFCCURTAINWALL to chapter 11 (not 08)", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCURTAINWALL", globalId: "cw1", quantities: { area: 50 } }),
    ]);
    const result = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const ch11 = result.project.chapters.find(c => c.code === "11");
    expect(ch11).toBeDefined();
    // Should NOT be chapter 08
    const ch08 = result.project.chapters.find(c => c.code === "08");
    expect(ch08).toBeUndefined();
  });
});

// ============================================================
// matchIfcToBoq (BOQ present scenario)
// ============================================================

function makeBoqProject(articles: { code: string; description: string; unit: string; quantity: number; keynote?: string; chapterCode: string }[]): WbsProject {
  const chapterMap = new Map<string, typeof articles>();
  for (const art of articles) {
    const ch = chapterMap.get(art.chapterCode) ?? [];
    ch.push(art);
    chapterMap.set(art.chapterCode, ch);
  }

  const chapters = Array.from(chapterMap.entries()).map(([chCode, arts]) => ({
    code: chCode,
    name: `Chapter ${chCode}`,
    subChapters: [{
      code: `${chCode}.01`,
      name: `SubChapter ${chCode}.01`,
      articles: arts.map(a => ({
        code: a.code,
        description: a.description,
        unit: a.unit,
        quantity: a.quantity,
        keynote: a.keynote,
      })),
    }],
  }));

  return {
    id: "test-boq",
    name: "Test BOQ",
    classification: "ProNIC",
    startDate: "2026-03-01",
    chapters,
  };
}

describe("matchIfcToBoq", () => {
  it("links element to BOQ article via shared classification/keynote", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1", classification: "EHS010" }),
    ]);
    const boq = makeBoqProject([
      { code: "06.01.001", description: "Pilar betão armado", unit: "m", quantity: 50, keynote: "EHS010", chapterCode: "06" },
    ]);
    const result = matchIfcToBoq([analysis], boq);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].articleCode).toBe("06.01.001");
    expect(result.links[0].confidence).toBe(95);
    expect(result.links[0].method).toBe("classification");
  });

  it("falls back to entity type → chapter matching with description similarity", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCBEAM", globalId: "b1", name: "Viga betão C25/30" }),
    ]);
    const boq = makeBoqProject([
      { code: "06.02.001", description: "Vigas de betão armado", unit: "m", quantity: 100, chapterCode: "06" },
      { code: "08.01.001", description: "Alvenaria tijolo", unit: "m2", quantity: 200, chapterCode: "08" },
    ]);
    const result = matchIfcToBoq([analysis], boq);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].articleCode).toBe("06.02.001");
    expect(result.links[0].method).toBe("boq_match");
  });

  it("reports unlinked elements when no BOQ article matches", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCBUILDINGELEMENTPROXY", globalId: "proxy1", name: "Unknown element" }),
    ]);
    const boq = makeBoqProject([
      { code: "06.01.001", description: "Pilares", unit: "m", quantity: 50, chapterCode: "06" },
    ]);
    const result = matchIfcToBoq([analysis], boq);
    expect(result.unlinked).toContain("proxy1");
    expect(result.stats.unlinked).toBe(1);
  });

  it("reports orphan BOQ articles with no IFC elements", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
    ]);
    const boq = makeBoqProject([
      { code: "06.01.001", description: "Pilares de betão", unit: "m", quantity: 50, chapterCode: "06" },
      { code: "09.01.001", description: "Cobertura em telha", unit: "m2", quantity: 200, chapterCode: "09" },
    ]);
    const result = matchIfcToBoq([analysis], boq);
    expect(result.orphanArticles).toContain("09.01.001");
    expect(result.stats.orphanArticles).toBeGreaterThan(0);
  });

  it("skips TYPE entities in BOQ matching", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMNTYPE", globalId: "type1" }),
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1", classification: "EHS010" }),
    ]);
    const boq = makeBoqProject([
      { code: "06.01.001", description: "Pilares", unit: "m", quantity: 50, keynote: "EHS010", chapterCode: "06" },
    ]);
    const result = matchIfcToBoq([analysis], boq);
    // Only the actual IFCCOLUMN should be linked, not IFCCOLUMNTYPE
    expect(result.links).toHaveLength(1);
    expect(result.stats.totalElements).toBe(1);
  });

  it("returns correct coverage statistics", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1", classification: "EHS010" }),
      makeElement({ entityType: "IFCBEAM", globalId: "b1" }),
      makeElement({ entityType: "IFCBUILDINGELEMENTPROXY", globalId: "proxy1", name: "Unknown" }),
    ]);
    const boq = makeBoqProject([
      { code: "06.01.001", description: "Pilares", unit: "m", quantity: 50, keynote: "EHS010", chapterCode: "06" },
      { code: "06.02.001", description: "Vigas betão armado", unit: "m", quantity: 100, chapterCode: "06" },
    ]);
    const result = matchIfcToBoq([analysis], boq);
    expect(result.stats.totalElements).toBe(3);
    expect(result.stats.linked).toBeGreaterThanOrEqual(1);
    expect(result.stats.coveragePercent).toBeGreaterThan(0);
  });
});

// ============================================================
// exportMappingTable
// ============================================================

describe("exportMappingTable", () => {
  it("exports flat mapping table from resolutions", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1", storey: "Piso 0", quantities: { length: 3.0 } }),
      makeElement({ entityType: "IFCBEAM", globalId: "b1", storey: "Piso 1", quantities: { length: 5.0 } }),
    ]);
    const boq = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const table = exportMappingTable([analysis], boq.resolutions);

    expect(table).toHaveLength(2);
    expect(table[0].elementId).toBe("c1");
    expect(table[0].entityType).toBe("IFCCOLUMN");
    expect(table[0].storey).toBe("Piso 0");
    expect(table[0].method).toBe("entity_type");
    expect(table[0].confidence).toBe(80);
    expect(table[0].resolvedChapter).toContain("betão");
  });

  it("includes classification reference in export row", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1", classification: "06.01" }),
    ]);
    const boq = generateBoqFromIfc([analysis], "Test", "2026-03-01");
    const table = exportMappingTable([analysis], boq.resolutions);

    expect(table).toHaveLength(1);
    expect(table[0].classification).toBe("06.01");
    expect(table[0].method).toBe("classification");
    expect(table[0].confidence).toBe(95);
  });

  it("returns empty table for empty input", () => {
    const table = exportMappingTable([], []);
    expect(table).toHaveLength(0);
  });
});

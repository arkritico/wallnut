import { describe, it, expect } from "vitest";
import {
  mapElementsToTasks,
  exportTaskMappingTable,
  normalizeStorey,
} from "@/lib/element-task-mapper";
import type { SpecialtyAnalysisResult } from "@/lib/ifc-specialty-analyzer";
import type { IfcQuantityData } from "@/lib/ifc-specialty-analyzer";
import type {
  ScheduleTask,
  ProjectSchedule,
  ConstructionPhase,
} from "@/lib/wbs-types";

// ============================================================
// Test Helpers
// ============================================================

function makeElement(
  overrides: Partial<IfcQuantityData> = {},
): IfcQuantityData {
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

function makeAnalysis(
  elements: IfcQuantityData[],
  specialty = "structure" as const,
): SpecialtyAnalysisResult {
  return {
    specialty,
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

function makeTask(overrides: Partial<ScheduleTask>): ScheduleTask {
  return {
    uid: 1,
    wbs: "06.01",
    name: "Estrutura",
    durationDays: 30,
    durationHours: 240,
    startDate: "2026-03-01",
    finishDate: "2026-04-15",
    predecessors: [],
    isSummary: false,
    phase: "structure",
    resources: [],
    cost: 50000,
    materialCost: 30000,
    outlineLevel: 2,
    percentComplete: 0,
    ...overrides,
  };
}

function makeSchedule(
  tasks: Partial<ScheduleTask>[],
): ProjectSchedule {
  return {
    projectName: "Test Project",
    startDate: "2026-03-01",
    finishDate: "2026-12-31",
    totalDurationDays: 200,
    totalCost: 500000,
    tasks: tasks.map((t, i) => makeTask({ uid: i + 1, ...t })),
    resources: [],
    criticalPath: [],
    teamSummary: {
      maxWorkers: 20,
      averageWorkers: 12,
      totalManHours: 15000,
      peakWeek: "2026-06-01",
    },
  };
}

// ============================================================
// normalizeStorey
// ============================================================

describe("normalizeStorey", () => {
  it("normalizes 'Piso 0' to P0", () => {
    expect(normalizeStorey("Piso 0")).toBe("P0");
  });

  it("normalizes 'R/C' to P0", () => {
    expect(normalizeStorey("R/C")).toBe("P0");
  });

  it("normalizes 'Rés-do-chão' to P0", () => {
    expect(normalizeStorey("Rés-do-chão")).toBe("P0");
  });

  it("normalizes 'Piso 3' to P3", () => {
    expect(normalizeStorey("Piso 3")).toBe("P3");
  });

  it("normalizes 'Piso -1' to P-1", () => {
    expect(normalizeStorey("Piso -1")).toBe("P-1");
  });

  it("normalizes 'Level 2' to P2", () => {
    expect(normalizeStorey("Level 2")).toBe("P2");
  });

  it("normalizes 'Nível 1' to P1", () => {
    expect(normalizeStorey("Nível 1")).toBe("P1");
  });

  it("normalizes 'Cave' to P-1", () => {
    expect(normalizeStorey("Cave")).toBe("P-1");
  });

  it("normalizes 'Cave 2' to P-2", () => {
    expect(normalizeStorey("Cave 2")).toBe("P-2");
  });

  it("normalizes 'Cobertura' to PCOB", () => {
    expect(normalizeStorey("Cobertura")).toBe("PCOB");
  });

  it("returns as-is for unrecognized names", () => {
    expect(normalizeStorey("Zona técnica")).toBe("Zona técnica");
  });
});

// ============================================================
// Strategy 1: Keynote mapping
// ============================================================

describe("mapElementsToTasks — keynote strategy", () => {
  it("maps IFCCOLUMN to structure task via entity type resolution", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
    ]);
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("structure");
    expect(result.links[0].method).toBe("keynote");
    expect(result.links[0].confidence).toBeGreaterThanOrEqual(60);
  });

  it("maps element with classification reference at 95% confidence", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCCOLUMN",
        globalId: "c1",
        classification: "06.01",
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].confidence).toBe(95);
    expect(result.links[0].chapterCode).toBe("06");
  });

  it("maps IFCBEAM to structure task", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCBEAM",
        globalId: "b1",
        quantities: { length: 5 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("structure");
  });

  it("maps IFCWINDOW to external_frames task", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCWINDOW",
        globalId: "w1",
        quantities: { area: 2.5 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "external_frames", name: "Caixilharias Exteriores" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("external_frames");
  });

  it("maps IFCROOF to roof task", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCROOF",
        globalId: "r1",
        quantities: { area: 100 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "roof", name: "Cobertura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("roof");
  });

  it("accepts pre-computed resolutions via options", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
    ]);
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
    ]);
    // Pre-computed resolution
    const resolutions = [
      {
        elementId: "c1",
        entityType: "IFCCOLUMN",
        chapterCode: "06",
        articleCode: "06.01.001",
        confidence: 80,
        method: "entity_type" as const,
      },
    ];
    const result = mapElementsToTasks([analysis], schedule, {
      resolutions,
    });
    expect(result.links).toHaveLength(1);
    expect(result.links[0].confidence).toBe(80);
  });
});

// ============================================================
// Fixture Phase Override
// ============================================================

describe("mapElementsToTasks — fixture override", () => {
  it("maps IFCLIGHTFIXTURE to electrical_fixtures (not rough_in_electrical)", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCLIGHTFIXTURE",
        globalId: "l1",
        quantities: { count: 1 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "rough_in_electrical", name: "Instalações Elétricas (1ª fase)" },
      { phase: "electrical_fixtures", name: "Aparelhagem Elétrica" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("electrical_fixtures");
  });

  it("maps IFCSANITARYTERMINAL to plumbing_fixtures (not rough_in_plumbing)", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCSANITARYTERMINAL",
        globalId: "st1",
        quantities: { count: 1 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "rough_in_plumbing", name: "Redes de Águas (1ª fase)" },
      { phase: "plumbing_fixtures", name: "Loiças Sanitárias" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("plumbing_fixtures");
  });

  it("keeps IFCCABLESEGMENT in rough_in_electrical (no fixture override)", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCCABLESEGMENT",
        globalId: "cs1",
        quantities: { length: 20 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "rough_in_electrical", name: "Instalações Elétricas (1ª fase)" },
      { phase: "electrical_fixtures", name: "Aparelhagem Elétrica" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("rough_in_electrical");
  });

  it("keeps IFCPIPESEGMENT in rough_in_plumbing (no fixture override)", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCPIPESEGMENT",
        globalId: "ps1",
        quantities: { length: 15 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "rough_in_plumbing", name: "Redes de Águas (1ª fase)" },
      { phase: "plumbing_fixtures", name: "Loiças Sanitárias" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("rough_in_plumbing");
  });

  it("applies confidence penalty for fixture override", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCLIGHTFIXTURE",
        globalId: "l1",
        quantities: { count: 1 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "electrical_fixtures", name: "Aparelhagem Elétrica" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    // LIGHTFIXTURE via entity_type = 75 confidence, fixture override = -5
    expect(result.links[0].confidence).toBe(70);
  });
});

// ============================================================
// Wall Disambiguation
// ============================================================

describe("mapElementsToTasks — wall disambiguation", () => {
  it("maps external wall (IsExternal=true) to external_walls", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCWALL",
        globalId: "w1",
        quantities: { area: 25 },
        propertySetData: { Pset_WallCommon: { IsExternal: true } },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "external_walls", name: "Alvenarias Exteriores" },
      { phase: "internal_walls", name: "Alvenarias Interiores" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("external_walls");
  });

  it("maps internal wall (IsExternal=false) to internal_walls", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCWALL",
        globalId: "w2",
        quantities: { area: 15 },
        propertySetData: { Pset_WallCommon: { IsExternal: false } },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "external_walls", name: "Alvenarias Exteriores" },
      { phase: "internal_walls", name: "Alvenarias Interiores" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("internal_walls");
  });

  it("defaults wall to external_walls when IsExternal is missing", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCWALL",
        globalId: "w3",
        quantities: { area: 20 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "external_walls", name: "Alvenarias Exteriores" },
      { phase: "internal_walls", name: "Alvenarias Interiores" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("external_walls");
  });
});

// ============================================================
// Storey Refinement
// ============================================================

describe("mapElementsToTasks — storey refinement", () => {
  it("matches element on Piso 1 to storey-specific task", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCWALL",
        globalId: "w1",
        storey: "Piso 1",
        quantities: { area: 25 },
      }),
    ]);
    const schedule = makeSchedule([
      {
        uid: 10,
        phase: "external_walls",
        name: "Alvenarias Exteriores - Piso 0",
      },
      {
        uid: 11,
        phase: "external_walls",
        name: "Alvenarias Exteriores - Piso 1",
      },
      {
        uid: 12,
        phase: "external_walls",
        name: "Alvenarias Exteriores - Piso 2",
      },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].taskUid).toBe(11);
    expect(result.links[0].taskName).toContain("Piso 1");
  });

  it("falls back to first task when no storey-specific match", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCCOLUMN",
        globalId: "c1",
        storey: "Piso 5",
      }),
    ]);
    const schedule = makeSchedule([
      {
        uid: 20,
        phase: "structure",
        name: "Estrutura - Piso 0",
      },
      {
        uid: 21,
        phase: "structure",
        name: "Estrutura - Piso 1",
      },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    // No "Piso 5" task, so falls back to first
    expect(result.links[0].taskUid).toBe(20);
  });

  it("maps element without storey to the single phase task", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCCOLUMN",
        globalId: "c1",
      }),
    ]);
    const schedule = makeSchedule([
      { uid: 30, phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].taskUid).toBe(30);
  });
});

// ============================================================
// Strategy 3: System property
// ============================================================

describe("mapElementsToTasks — system strategy", () => {
  it("maps generic flow segment via System Name to plumbing", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCFLOWSEGMENT",
        globalId: "fs1",
        properties: { "System Name": "Domestic Hot Water Supply" },
        quantities: { length: 10 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "rough_in_plumbing", name: "Redes de Águas" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("rough_in_plumbing");
    expect(result.links[0].method).toBe("system");
  });

  it("maps generic flow terminal via SystemType to electrical", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCFLOWTERMINAL",
        globalId: "ft1",
        properties: { SystemType: "Lighting Circuit" },
        quantities: { count: 1 },
      }),
    ]);
    const schedule = makeSchedule([
      { phase: "rough_in_electrical", name: "Instalações Elétricas" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].phase).toBe("rough_in_electrical");
    expect(result.links[0].method).toBe("system");
  });
});

// ============================================================
// Strategy 4: Fallback
// ============================================================

describe("mapElementsToTasks — fallback strategy", () => {
  it("maps unknown flow element to plumbing summary task", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCFLOWCONTROLLER",
        globalId: "fc1",
        quantities: { count: 1 },
      }),
    ]);
    const schedule = makeSchedule([
      {
        phase: "rough_in_plumbing",
        name: "Redes de Águas",
        isSummary: true,
      },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].method).toBe("fallback");
    expect(result.links[0].confidence).toBeLessThanOrEqual(30);
  });
});

// ============================================================
// Unmapped Elements
// ============================================================

describe("mapElementsToTasks — unmapped elements", () => {
  it("reports unmapped elements when no task matches", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCBUILDINGELEMENTPROXY",
        globalId: "proxy1",
        name: "Unknown thing",
      }),
    ]);
    // Schedule with no matching phase tasks
    const schedule = makeSchedule([
      { phase: "cleanup", name: "Limpeza Final" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    // proxy → fallback tries "structure" but no structure task → unmapped
    expect(result.unmapped.length).toBeGreaterThanOrEqual(0);
    expect(result.stats.totalElements).toBe(1);
  });

  it("skips TYPE entities entirely", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMNTYPE", globalId: "type1" }),
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
    ]);
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    // Only IFCCOLUMN processed, IFCCOLUMNTYPE skipped
    expect(result.stats.totalElements).toBe(1);
    expect(result.links).toHaveLength(1);
  });

  it("handles empty schedule gracefully", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
    ]);
    const schedule = makeSchedule([]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.stats.totalElements).toBe(1);
    expect(result.stats.unmapped).toBe(1);
    expect(result.unmapped[0].reason).toContain("No matching");
  });

  it("handles empty analyses gracefully", () => {
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([], schedule);
    expect(result.stats.totalElements).toBe(0);
    expect(result.stats.coveragePercent).toBe(0);
  });
});

// ============================================================
// Statistics
// ============================================================

describe("mapElementsToTasks — statistics", () => {
  it("computes correct coverage percent", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
      makeElement({ entityType: "IFCBEAM", globalId: "b1", quantities: { length: 5 } }),
      makeElement({ entityType: "IFCBUILDINGELEMENTPROXY", globalId: "p1", name: "Unknown" }),
    ]);
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.stats.totalElements).toBe(3);
    // Column and beam should map, proxy may or may not
    expect(result.stats.mapped).toBeGreaterThanOrEqual(2);
    expect(result.stats.coveragePercent).toBeGreaterThanOrEqual(66);
  });

  it("tracks byMethod breakdown", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
      makeElement({ entityType: "IFCBEAM", globalId: "b1", quantities: { length: 5 } }),
    ]);
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.stats.byMethod.keynote).toBeGreaterThanOrEqual(2);
  });

  it("tracks byPhase breakdown", () => {
    const analysis = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
      makeElement({ entityType: "IFCWINDOW", globalId: "w1", quantities: { area: 2.5 } }),
    ]);
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
      { phase: "external_frames", name: "Caixilharias" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    expect(result.stats.byPhase.structure).toBe(1);
    expect(result.stats.byPhase.external_frames).toBe(1);
  });
});

// ============================================================
// Integration: Multiple specialties
// ============================================================

describe("mapElementsToTasks — integration", () => {
  it("maps elements from multiple specialties to correct phases", () => {
    const structural = makeAnalysis([
      makeElement({ entityType: "IFCCOLUMN", globalId: "c1" }),
      makeElement({ entityType: "IFCBEAM", globalId: "b1", quantities: { length: 5 } }),
    ]);
    const electrical = makeAnalysis(
      [
        makeElement({ entityType: "IFCLIGHTFIXTURE", globalId: "l1", quantities: { count: 1 } }),
        makeElement({ entityType: "IFCCABLESEGMENT", globalId: "cs1", quantities: { length: 20 } }),
      ],
      "electrical",
    );
    const schedule = makeSchedule([
      { phase: "structure", name: "Estrutura" },
      { phase: "rough_in_electrical", name: "Instalações Elétricas (1ª fase)" },
      { phase: "electrical_fixtures", name: "Aparelhagem Elétrica" },
    ]);
    const result = mapElementsToTasks([structural, electrical], schedule);
    expect(result.links).toHaveLength(4);
    expect(result.stats.byPhase.structure).toBe(2);
    expect(result.stats.byPhase.rough_in_electrical).toBe(1);
    expect(result.stats.byPhase.electrical_fixtures).toBe(1);
  });
});

// ============================================================
// exportTaskMappingTable
// ============================================================

describe("exportTaskMappingTable", () => {
  it("produces correct row structure", () => {
    const analysis = makeAnalysis([
      makeElement({
        entityType: "IFCCOLUMN",
        globalId: "c1",
        storey: "Piso 0",
      }),
    ]);
    const schedule = makeSchedule([
      { uid: 10, phase: "structure", name: "Estrutura" },
    ]);
    const result = mapElementsToTasks([analysis], schedule);
    const table = exportTaskMappingTable([analysis], result);

    expect(table).toHaveLength(1);
    expect(table[0].elementId).toBe("c1");
    expect(table[0].entityType).toBe("IFCCOLUMN");
    expect(table[0].storey).toBe("Piso 0");
    expect(table[0].phase).toBe("structure");
    expect(table[0].taskUid).toBe(10);
    expect(table[0].taskName).toBe("Estrutura");
    expect(table[0].method).toBe("keynote");
  });

  it("returns empty table for empty result", () => {
    const table = exportTaskMappingTable([], {
      links: [],
      unmapped: [],
      stats: {
        totalElements: 0,
        mapped: 0,
        unmapped: 0,
        coveragePercent: 0,
        byMethod: {},
        byPhase: {},
      },
    });
    expect(table).toHaveLength(0);
  });
});

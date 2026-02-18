import { describe, it, expect } from "vitest";
import {
  aggregateIfcQuantities,
  lookupIfcQuantity,
  type IfcQuantitySummary,
} from "@/lib/ifc-quantity-takeoff";
import type {
  SpecialtyAnalysisResult,
  IfcQuantityData,
} from "@/lib/ifc-specialty-analyzer";

// ============================================================
// Helpers
// ============================================================

function makeQuantity(overrides: Partial<IfcQuantityData> = {}): IfcQuantityData {
  return {
    entityType: "IFCWALL",
    name: "Basic Wall",
    globalId: `gid-${Math.random().toString(36).slice(2, 10)}`,
    properties: {},
    propertySetData: {},
    quantities: {},
    materials: [],
    ...overrides,
  };
}

function makeAnalysis(
  quantities: IfcQuantityData[],
  overrides: Partial<SpecialtyAnalysisResult> = {},
): SpecialtyAnalysisResult {
  return {
    specialty: "structural",
    quantities,
    chapters: [],
    optimizations: [],
    summary: {
      totalElements: quantities.length,
      elementsByType: {},
      storeys: ["Piso 0", "Piso 1"],
      materialsUsed: [],
    },
    ...overrides,
  };
}

// ============================================================
// aggregateIfcQuantities
// ============================================================

describe("aggregateIfcQuantities", () => {
  it("counts and classifies wall elements by external/internal", () => {
    const quantities: IfcQuantityData[] = [
      makeQuantity({
        entityType: "IFCWALL",
        name: "Exterior Wall",
        globalId: "wall-1",
        propertySetData: { "Pset_WallCommon": { IsExternal: true } },
        quantities: { area: 50, length: 10, height: 5 },
      }),
      makeQuantity({
        entityType: "IFCWALLSTANDARDCASE",
        name: "Interior Partition",
        globalId: "wall-2",
        propertySetData: { "Pset_WallCommon": { IsExternal: false } },
        quantities: { area: 30, length: 6, height: 5 },
      }),
    ];

    const result = aggregateIfcQuantities([makeAnalysis(quantities)]);

    expect(result.externalWallArea).toBe(50);
    expect(result.internalWallArea).toBe(30);
    expect(result.totalWallArea).toBe(80);
    expect(result.totalElements).toBe(2);
  });

  it("aggregates columns count and length", () => {
    const quantities: IfcQuantityData[] = [
      makeQuantity({
        entityType: "IFCCOLUMN",
        name: "Column A",
        globalId: "col-1",
        quantities: { length: 3.5, height: 3.5 },
      }),
      makeQuantity({
        entityType: "IFCCOLUMNSTANDARDCASE",
        name: "Column B",
        globalId: "col-2",
        quantities: { height: 3.0 },
      }),
    ];

    const result = aggregateIfcQuantities([makeAnalysis(quantities)]);

    expect(result.columnCount).toBe(2);
    expect(result.columnLength).toBe(6.5); // 3.5 + 3.0
  });

  it("aggregates beams count and length", () => {
    const quantities: IfcQuantityData[] = [
      makeQuantity({
        entityType: "IFCBEAM",
        name: "Beam 1",
        globalId: "beam-1",
        quantities: { length: 8.0 },
      }),
      makeQuantity({
        entityType: "IFCBEAMSTANDARDCASE",
        name: "Beam 2",
        globalId: "beam-2",
        quantities: { length: 5.5 },
      }),
    ];

    const result = aggregateIfcQuantities([makeAnalysis(quantities)]);

    expect(result.beamCount).toBe(2);
    expect(result.beamLength).toBe(13.5);
  });

  it("aggregates slabs, roofs, windows, doors", () => {
    const quantities: IfcQuantityData[] = [
      makeQuantity({
        entityType: "IFCSLAB",
        name: "Floor Slab",
        globalId: "slab-1",
        quantities: { area: 150 },
      }),
      makeQuantity({
        entityType: "IFCROOF",
        name: "Roof",
        globalId: "roof-1",
        quantities: { area: 120 },
      }),
      makeQuantity({
        entityType: "IFCWINDOW",
        name: "Window W1",
        globalId: "win-1",
        quantities: { area: 2.5 },
      }),
      makeQuantity({
        entityType: "IFCWINDOW",
        name: "Window W2",
        globalId: "win-2",
        quantities: { area: 1.8 },
      }),
      makeQuantity({
        entityType: "IFCDOOR",
        name: "Door D1",
        globalId: "door-1",
        quantities: {},
      }),
    ];

    const result = aggregateIfcQuantities([makeAnalysis(quantities)]);

    expect(result.slabArea).toBe(150);
    expect(result.roofArea).toBe(120);
    expect(result.windowArea).toBe(4.3);
    expect(result.windowCount).toBe(2);
    expect(result.doorCount).toBe(1);
  });

  it("deduplicates elements across multiple analyses by globalId", () => {
    const sharedElement = makeQuantity({
      entityType: "IFCCOLUMN",
      name: "Shared Column",
      globalId: "shared-col-1",
      quantities: { length: 3.0 },
    });

    const analysis1 = makeAnalysis([sharedElement]);
    const analysis2 = makeAnalysis([sharedElement]);

    const result = aggregateIfcQuantities([analysis1, analysis2]);

    expect(result.columnCount).toBe(1); // Not 2
    expect(result.columnLength).toBe(3.0);
  });

  it("excludes TYPE entities from counts", () => {
    const quantities: IfcQuantityData[] = [
      makeQuantity({
        entityType: "IFCCOLUMN",
        name: "Column Instance",
        globalId: "col-inst",
        quantities: { length: 3.0 },
      }),
      makeQuantity({
        entityType: "IFCCOLUMNTYPE",
        name: "Column Type Definition",
        globalId: "col-type",
        quantities: { length: 3.0 },
      }),
    ];

    const result = aggregateIfcQuantities([makeAnalysis(quantities)]);

    expect(result.columnCount).toBe(1);
    expect(result.totalElements).toBe(1);
  });

  it("collects storeys from analyses", () => {
    const result = aggregateIfcQuantities([
      makeAnalysis([], { summary: { totalElements: 0, elementsByType: {}, storeys: ["Piso 0", "Piso 1"], materialsUsed: [] } }),
      makeAnalysis([], { summary: { totalElements: 0, elementsByType: {}, storeys: ["Piso 1", "Piso 2"], materialsUsed: [] } }),
    ]);

    expect(result.storeys).toHaveLength(3);
    expect(result.storeyCount).toBe(3);
  });

  it("uses height as length for columns when length not available", () => {
    const quantities: IfcQuantityData[] = [
      makeQuantity({
        entityType: "IFCCOLUMN",
        name: "Tall Column",
        globalId: "tall-col",
        quantities: { height: 4.2 },
      }),
    ];

    const result = aggregateIfcQuantities([makeAnalysis(quantities)]);

    expect(result.columnLength).toBe(4.2);
  });

  it("detects external walls from name when no IsExternal property", () => {
    const quantities: IfcQuantityData[] = [
      makeQuantity({
        entityType: "IFCWALL",
        name: "Parede Exterior Fachada",
        globalId: "ext-wall",
        quantities: { area: 40 },
      }),
      makeQuantity({
        entityType: "IFCWALL",
        name: "Parede Interior Divisória",
        globalId: "int-wall",
        quantities: { area: 25 },
      }),
    ];

    const result = aggregateIfcQuantities([makeAnalysis(quantities)]);

    expect(result.externalWallArea).toBe(40);
    expect(result.internalWallArea).toBe(25);
  });

  it("builds per-type breakdown", () => {
    const quantities: IfcQuantityData[] = [
      makeQuantity({
        entityType: "IFCCOLUMN",
        globalId: "c1",
        quantities: { length: 3.0, volume: 0.5 },
      }),
      makeQuantity({
        entityType: "IFCCOLUMN",
        globalId: "c2",
        quantities: { length: 4.0, volume: 0.7 },
      }),
      makeQuantity({
        entityType: "IFCBEAM",
        globalId: "b1",
        quantities: { length: 6.0, area: 3.0 },
      }),
    ];

    const result = aggregateIfcQuantities([makeAnalysis(quantities)]);

    expect(result.byType["IFCCOLUMN"].count).toBe(2);
    expect(result.byType["IFCCOLUMN"].totalLength).toBe(7.0);
    expect(result.byType["IFCCOLUMN"].totalVolume).toBe(1.2);
    expect(result.byType["IFCBEAM"].count).toBe(1);
    expect(result.byType["IFCBEAM"].totalLength).toBe(6.0);
  });
});

// ============================================================
// lookupIfcQuantity
// ============================================================

describe("lookupIfcQuantity", () => {
  // Build a realistic summary for testing
  const summary: IfcQuantitySummary = {
    externalWallArea: 250,
    internalWallArea: 180,
    totalWallArea: 430,
    slabArea: 600,
    roofArea: 150,
    windowArea: 45,
    windowCount: 20,
    doorCount: 15,
    columnLength: 114,
    columnCount: 38,
    beamLength: 285,
    beamCount: 95,
    spaceArea: 540,
    stairCount: 4,
    rampCount: 1,
    rampLength: 8.5,
    curtainWallArea: 0,
    storeyCount: 6,
    storeys: ["Piso -1", "Piso 0", "Piso 1", "Piso 2", "Piso 3", "Cobertura"],
    totalElements: 400,
    byType: {},
  };

  it("returns external wall area for facade/ETICS items", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "m2",
      description: "Revestimento de fachada ETICS",
      areas: ["thermal"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(250);
    expect(result!.source).toBe("measured");
  });

  it("returns roof area for roof insulation items", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "m2",
      description: "Isolamento de cobertura",
      areas: ["thermal"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(150);
  });

  it("returns slab area for floor items", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "m2",
      description: "Revestimento de pavimento cerâmico",
      areas: ["architecture"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(600);
  });

  it("returns window area for glazing items", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "m2",
      description: "Caixilharia de janela em alumínio",
      areas: ["thermal"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(45);
  });

  it("returns internal wall area for acoustic items", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "m2",
      description: "Isolamento acústico em parede",
      areas: ["acoustic"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(180);
  });

  it("returns column length for structural column items (m)", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "m",
      description: "Pilar de betão armado",
      areas: ["structural"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(114);
  });

  it("returns beam length for structural beam items (m)", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "m",
      description: "Viga de betão armado",
      areas: ["structural"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(285);
  });

  it("returns column count for column reinforcement (Ud)", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "Ud",
      description: "Reforço de pilar com fibra de carbono",
      areas: ["structural"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(38);
  });

  it("returns beam count for beam reinforcement (Ud)", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "Ud",
      description: "Reforço de viga metálica",
      areas: ["structural"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(95);
  });

  it("returns storey-based count for fire equipment", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "Ud",
      description: "Boca de incêndio armada",
      areas: ["fire_safety"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(6); // 1 per storey
  });

  it("returns ramp length for ramp items", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "m",
      description: "Rampa acessível em betão",
      areas: ["accessibility"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(8.5);
  });

  it("returns null for lump-sum items (vg)", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "vg",
      description: "Estudo geotécnico",
      areas: ["structural"],
    });
    expect(result).toBeNull();
  });

  it("returns null when summary has no relevant data", () => {
    const emptySummary: IfcQuantitySummary = {
      externalWallArea: 0,
      internalWallArea: 0,
      totalWallArea: 0,
      slabArea: 0,
      roofArea: 0,
      windowArea: 0,
      windowCount: 0,
      doorCount: 0,
      columnLength: 0,
      columnCount: 0,
      beamLength: 0,
      beamCount: 0,
      spaceArea: 0,
      stairCount: 0,
      rampCount: 0,
      rampLength: 0,
      curtainWallArea: 0,
      storeyCount: 0,
      storeys: [],
      totalElements: 0,
      byType: {},
    };

    const result = lookupIfcQuantity(emptySummary, {
      unit: "m2",
      description: "Revestimento de fachada ETICS",
      areas: ["thermal"],
    });
    expect(result).toBeNull();
  });

  it("calculates smoke detector count from floor area", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "Ud",
      description: "Detetor ótico de fumos",
      areas: ["fire_safety"],
    });
    expect(result).not.toBeNull();
    // 600 m² slab / 6 storeys = 100 m² per floor
    // ceil(100/60) * 6 = 2 * 6 = 12
    expect(result!.quantity).toBe(12);
  });

  it("calculates fire extinguisher count from area", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "Ud",
      description: "Extintor de pó ABC",
      areas: ["fire_safety"],
    });
    expect(result).not.toBeNull();
    // 600 m² / 6 storeys = 100 m² per floor, ceil(100/200) = 1, ×6 = 6
    expect(result!.quantity).toBe(6);
  });

  it("returns window count for window unit items", () => {
    const result = lookupIfcQuantity(summary, {
      unit: "Ud",
      description: "Substituição de janela com vidro duplo",
      areas: ["thermal"],
    });
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(20);
  });
});

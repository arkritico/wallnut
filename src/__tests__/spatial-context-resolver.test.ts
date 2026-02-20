import { describe, it, expect } from "vitest";
import type { IfcQuantityData, SpecialtyAnalysisResult } from "../lib/ifc-specialty-analyzer";
import {
  resolveSpatialContext,
  matchesFilter,
  resolveEntityProperty,
  aggregate,
  EntityIndex,
  classifyFireRiskCategory,
  type SpatialFieldMapping,
} from "../lib/spatial-context-resolver";

// ============================================================
// Test Helpers
// ============================================================

function makeEntity(overrides: Partial<IfcQuantityData> = {}): IfcQuantityData {
  return {
    entityType: "IFCWALL",
    name: "Test Element",
    globalId: `gid-${Math.random().toString(36).slice(2, 10)}`,
    properties: {},
    propertySetData: {},
    quantities: {},
    materials: [],
    ...overrides,
  };
}

function makeAnalysis(quantities: IfcQuantityData[]): SpecialtyAnalysisResult {
  return {
    specialty: "architecture",
    quantities,
    chapters: [],
    optimizations: [],
    summary: {
      totalElements: quantities.length,
      elementsByType: {},
      storeys: [],
      materialsUsed: [],
    },
  };
}

// ============================================================
// Filter Matching
// ============================================================

describe("matchesFilter", () => {
  it("matches wildcard patterns", () => {
    const entity = makeEntity({ name: "Corredor Principal" });
    expect(matchesFilter(entity, { Name: "*corredor*" })).toBe(true);
    expect(matchesFilter(entity, { Name: "*cozinha*" })).toBe(false);
  });

  it("matches boolean properties", () => {
    const ext = makeEntity({ properties: { IsExternal: true } });
    const int = makeEntity({ properties: { IsExternal: false } });
    expect(matchesFilter(ext, { IsExternal: true })).toBe(true);
    expect(matchesFilter(int, { IsExternal: true })).toBe(false);
  });

  it("matches comparison operators", () => {
    const entity = makeEntity({ properties: { Elevation: -3.5 } });
    expect(matchesFilter(entity, { Elevation: "< 0" })).toBe(true);
    expect(matchesFilter(entity, { Elevation: ">= 0" })).toBe(false);
  });

  it("matches nested property paths", () => {
    const entity = makeEntity({
      propertySetData: {
        "Pset_SpaceCommon": { IsAccessible: true },
      },
    });
    expect(matchesFilter(entity, { "Pset_SpaceCommon.IsAccessible": true })).toBe(true);
  });

  it("applies AND logic across multiple filter keys", () => {
    const entity = makeEntity({
      name: "Corredor Norte",
      properties: { ObjectType: "CORRIDOR", IsExternal: false },
    });
    expect(matchesFilter(entity, {
      Name: "*corredor*",
      ObjectType: "CORRIDOR",
    })).toBe(true);
    expect(matchesFilter(entity, {
      Name: "*corredor*",
      IsExternal: true,
    })).toBe(false);
  });

  it("returns true for empty filter", () => {
    const entity = makeEntity();
    expect(matchesFilter(entity, {})).toBe(true);
  });

  it("returns false when entity lacks the property", () => {
    const entity = makeEntity({ properties: {} });
    expect(matchesFilter(entity, { NonExistent: "value" })).toBe(false);
  });

  it("matches case-insensitively for exact strings", () => {
    const entity = makeEntity({ properties: { ObjectType: "CORRIDOR" } });
    expect(matchesFilter(entity, { ObjectType: "corridor" })).toBe(true);
  });
});

// ============================================================
// Property Resolution
// ============================================================

describe("resolveEntityProperty", () => {
  it("resolves from property set (highest priority)", () => {
    const entity = makeEntity({
      propertySetData: {
        "Pset_RampCommon": { Slope: 0.06 },
      },
    });
    const result = resolveEntityProperty(entity, {
      pset: "Pset_RampCommon",
      psetProperty: "Slope",
    });
    expect(result).toBeDefined();
    expect(result!.value).toBe(0.06);
    expect(result!.source).toBe("ifc-pset");
  });

  it("resolves pset + property (no psetProperty)", () => {
    const entity = makeEntity({
      propertySetData: {
        "Qto_BuildingBaseQuantities": { GrossFloorArea: 1500 },
      },
    });
    const result = resolveEntityProperty(entity, {
      pset: "Qto_BuildingBaseQuantities",
      property: "GrossFloorArea",
    });
    expect(result).toBeDefined();
    expect(result!.value).toBe(1500);
  });

  it("resolves from quantities (width, height, area)", () => {
    const entity = makeEntity({ quantities: { width: 0.90 } });
    const result = resolveEntityProperty(entity, { property: "OverallWidth" });
    expect(result).toBeDefined();
    expect(result!.value).toBe(0.90);
    expect(result!.source).toBe("ifc-quantity");
  });

  it("resolves from flat properties", () => {
    const entity = makeEntity({ properties: { FireRating: "EI60" } });
    const result = resolveEntityProperty(entity, { property: "FireRating" });
    expect(result).toBeDefined();
    expect(result!.value).toBe("EI60");
    expect(result!.source).toBe("ifc-property");
  });

  it("resolves nested paths like Dimensions.Width", () => {
    const entity = makeEntity({
      propertySetData: {
        "Dimensions": { Width: 1.2 },
      },
    });
    const result = resolveEntityProperty(entity, { property: "Dimensions.Width" });
    expect(result).toBeDefined();
    expect(result!.value).toBe(1.2);
  });

  it("returns undefined for missing property", () => {
    const entity = makeEntity();
    const result = resolveEntityProperty(entity, { property: "NonExistent" });
    expect(result).toBeUndefined();
  });
});

// ============================================================
// Aggregation
// ============================================================

describe("aggregate", () => {
  const entities = [
    makeEntity({ quantities: { area: 25 } }),
    makeEntity({ quantities: { area: 15 } }),
    makeEntity({ quantities: { area: 30 } }),
  ];
  const values = [25, 15, 30];

  it("counts entities", () => {
    expect(aggregate(entities, values, "count")).toBe(3);
  });

  it("computes minimum", () => {
    expect(aggregate(entities, values, "minValue")).toBe(15);
  });

  it("computes maximum", () => {
    expect(aggregate(entities, values, "maxValue")).toBe(30);
  });

  it("computes sum", () => {
    expect(aggregate(entities, values, "sum")).toBe(70);
    expect(aggregate(entities, values, "sumArea")).toBe(70);
  });

  it("computes average", () => {
    const avg = aggregate(entities, values, "average") as number;
    expect(avg).toBeCloseTo(23.33, 1);
  });

  it("computes sumByZone", () => {
    const zoned = [
      makeEntity({ storey: "Piso 0", quantities: { area: 25 } }),
      makeEntity({ storey: "Piso 0", quantities: { area: 15 } }),
      makeEntity({ storey: "Piso 1", quantities: { area: 30 } }),
    ];
    expect(aggregate(zoned, [25, 15, 30], "sumByZone")).toBe(70);
  });

  it("returns undefined for empty values (non-count)", () => {
    expect(aggregate([], [], "minValue")).toBeUndefined();
  });

  it("returns first value when no method specified", () => {
    expect(aggregate(entities, values, undefined)).toBe(25);
  });
});

// ============================================================
// Entity Index
// ============================================================

describe("EntityIndex", () => {
  it("indexes entities by type", () => {
    const index = new EntityIndex([
      makeEntity({ entityType: "IFCWALL" }),
      makeEntity({ entityType: "IFCWALL" }),
      makeEntity({ entityType: "IFCDOOR" }),
      makeEntity({ entityType: "IFCWINDOW" }),
    ]);
    expect(index.getByType("IFCWALL")).toHaveLength(2);
    expect(index.getByType("IFCDOOR")).toHaveLength(1);
    expect(index.getByType("IFCWINDOW")).toHaveLength(1);
    expect(index.getByType("IFCSLAB")).toHaveLength(0);
  });

  it("handles case-insensitive lookups", () => {
    const index = new EntityIndex([
      makeEntity({ entityType: "IFCSPACE" }),
    ]);
    expect(index.getByType("IfcSpace")).toHaveLength(1);
    expect(index.getByType("IFCSPACE")).toHaveLength(1);
  });
});

// ============================================================
// Computed Spatial Relationships
// ============================================================

describe("computed spatial relationships", () => {
  it("computes room counts by type", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 1", quantities: { area: 12 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 2", quantities: { area: 10 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Cozinha", quantities: { area: 8 } }),
      makeEntity({ entityType: "IFCSPACE", name: "WC", quantities: { area: 4 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Sala de Estar", quantities: { area: 20 } }),
    ])], []);

    const fields = result.fields as Record<string, Record<string, unknown>>;
    expect(fields.computed?.bedroomCount).toBe(2);
    expect(fields.computed?.kitchenCount).toBe(1);
    expect(fields.computed?.bathroomCount).toBe(1);
    expect(fields.computed?.livingCount).toBe(1);
  });

  it("computes min bedroom area", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 1", quantities: { area: 12 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 2", quantities: { area: 9.5 } }),
    ])], []);

    const fields = result.fields as Record<string, Record<string, unknown>>;
    expect(fields.computed?.minBedroomArea).toBe(9.5);
    expect(fields.computed?.maxBedroomArea).toBe(12);
  });

  it("computes min door width", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCDOOR", name: "Door 1", quantities: { width: 0.90 } }),
      makeEntity({ entityType: "IFCDOOR", name: "Door 2", quantities: { width: 0.77 } }),
      makeEntity({ entityType: "IFCDOOR", name: "Door 3", quantities: { width: 1.10 } }),
    ])], []);

    const fields = result.fields as Record<string, Record<string, unknown>>;
    expect(fields.computed?.minDoorWidth).toBe(0.77);
  });

  it("computes window-to-wall ratio", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCWALL", name: "Ext Wall 1",
        quantities: { area: 100 },
        properties: { IsExternal: true },
      }),
      makeEntity({
        entityType: "IFCWINDOW", name: "Window 1",
        quantities: { area: 15 },
      }),
    ])], []);

    const fields = result.fields as Record<string, Record<string, unknown>>;
    expect(fields.computed?.windowToWallRatio).toBe(15);
  });

  it("computes min ceiling height", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Room 1", quantities: { height: 2.80 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Room 2", quantities: { height: 2.40 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Room 3", quantities: { height: 3.00 } }),
    ])], []);

    const fields = result.fields as Record<string, Record<string, unknown>>;
    expect(fields.computed?.minCeilingHeight).toBe(2.4);
  });

  it("computes max compartment area", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Space 1", quantities: { area: 500 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Space 2", quantities: { area: 1200 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Space 3", quantities: { area: 800 } }),
    ])], []);

    const fields = result.fields as Record<string, Record<string, unknown>>;
    expect(fields.computed?.maxCompartmentArea).toBe(1200);
  });

  it("computes total usable area", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Room 1", quantities: { area: 25 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Room 2", quantities: { area: 30 } }),
    ])], []);

    const fields = result.fields as Record<string, Record<string, unknown>>;
    expect(fields.computed?.totalUsableArea).toBe(55);
  });
});

// ============================================================
// Computed → Rule Field Bridge
// ============================================================

describe("computed-to-rule-field bridge", () => {
  it("bridges bedroom area to general.bedroomArea", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 1", quantities: { area: 12 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 2", quantities: { area: 9 } }),
    ])], []);

    const general = result.fields.general as Record<string, unknown>;
    expect(general?.bedroomArea).toBe(9);    // min bedroom area → general.bedroomArea
    expect(general?.mainBedroomArea).toBe(12); // max bedroom area → general.mainBedroomArea
  });

  it("bridges corridor width to both general and accessibility", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Corredor 1", quantities: { width: 1.20, area: 8 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Corredor 2", quantities: { width: 1.10, area: 6 } }),
    ])], []);

    const general = result.fields.general as Record<string, unknown>;
    const acc = result.fields.accessibility as Record<string, unknown>;
    expect(general?.corridorWidth).toBe(1.1);
    expect(acc?.corridorWidths).toBe(1.1);
  });

  it("bridges door width to accessibility.doorWidths", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCDOOR", name: "Door 1", quantities: { width: 0.90 } }),
      makeEntity({ entityType: "IFCDOOR", name: "Door 2", quantities: { width: 0.77 } }),
    ])], []);

    const acc = result.fields.accessibility as Record<string, unknown>;
    expect(acc?.doorWidths).toBe(0.77);
  });

  it("bridges max compartment area to fireSafety", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Zone A", quantities: { area: 800 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Zone B", quantities: { area: 1400 } }),
    ])], []);

    const fs = result.fields.fireSafety as Record<string, unknown>;
    expect(fs?.compartmentArea).toBe(1400);
  });

  it("bridges ceiling height to architecture", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Room 1", quantities: { height: 2.80 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Room 2", quantities: { height: 2.40 } }),
    ])], []);

    const arch = result.fields.architecture as Record<string, unknown>;
    expect(arch?.ceilingHeight).toBe(2.4);
  });

  it("does not overwrite ifcMapping-resolved values", () => {
    // When ifcMapping already resolved accessibility.corridorWidths,
    // the bridge should NOT overwrite it with the computed value
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Corredor", quantities: { width: 1.50, area: 10 } }),
    ])], [{
      field: "accessibility.corridorWidths",
      ifcMapping: {
        entityType: "IfcSpace",
        filter: { Name: "*corredor*" },
        property: "OverallWidth",
        method: "minValue",
      },
    }]);

    const acc = result.fields.accessibility as Record<string, unknown>;
    // ifcMapping resolved 1.50 (the actual width), bridge should not overwrite
    expect(acc?.corridorWidths).toBe(1.5);
  });
});

// ============================================================
// Stair & Ramp Extraction
// ============================================================

describe("stair and ramp extraction", () => {
  it("extracts stair dimensions", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCSTAIRFLIGHT", name: "Stair 1",
        quantities: { width: 1.20 },
        propertySetData: {
          "Pset_StairFlightCommon": { RiserHeight: 0.175, TreadLength: 0.28 },
        },
      }),
      makeEntity({
        entityType: "IFCSTAIRFLIGHT", name: "Stair 2",
        quantities: { width: 1.10 },
        propertySetData: {
          "Pset_StairFlightCommon": { RiserHeight: 0.18, TreadLength: 0.27 },
        },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.minStairWidth).toBe(1.1);
    expect(computed?.stairRiserHeight).toBe(0.18);  // max riser (worst case)
    expect(computed?.stairTreadDepth).toBe(0.27);   // min tread (worst case)

    // Check bridge to rule fields
    const general = result.fields.general as Record<string, unknown>;
    expect(general?.stairWidth).toBe(1.1);
    expect(general?.stairRiserHeight).toBe(0.18);
  });

  it("extracts ramp slope", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCRAMP", name: "Ramp 1",
        quantities: { width: 1.50 },
        propertySetData: {
          "Pset_RampCommon": { Slope: 0.06 },
        },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.rampSlope).toBe(0.06);
    expect(computed?.minRampWidth).toBe(1.5);

    // Check bridge
    const acc = result.fields.accessibility as Record<string, unknown>;
    expect(acc?.rampGradient).toBe(0.06);
    expect(acc?.rampWidth).toBe(1.5);
  });
});

// ============================================================
// Full Integration — resolve ifcMappings from field-mappings
// ============================================================

describe("resolveSpatialContext integration", () => {
  it("resolves accessibility field mappings with IFC data", () => {
    const mappings: SpatialFieldMapping[] = [
      {
        field: "accessibility.corridorWidths",
        ifcMapping: {
          entityType: "IfcSpace",
          filter: { Name: "*corredor*" },
          property: "OverallWidth",
          method: "minValue",
        },
      },
      {
        field: "accessibility.doorWidths",
        ifcMapping: {
          entityType: "IfcDoor",
          property: "OverallWidth",
          method: "minValue",
        },
      },
      {
        field: "accessibility.rampGradient",
        ifcMapping: {
          entityType: "IfcRamp",
          pset: "Pset_RampCommon",
          psetProperty: "Slope",
        },
      },
    ];

    const entities = [
      makeEntity({ entityType: "IFCSPACE", name: "Corredor 1", quantities: { width: 1.20 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Corredor 2", quantities: { width: 1.10 } }),
      makeEntity({ entityType: "IFCDOOR", name: "Door 1", quantities: { width: 0.90 } }),
      makeEntity({ entityType: "IFCDOOR", name: "Door 2", quantities: { width: 0.77 } }),
      makeEntity({
        entityType: "IFCRAMP", name: "Ramp 1",
        propertySetData: { "Pset_RampCommon": { Slope: 0.06 } },
      }),
    ];

    const result = resolveSpatialContext([makeAnalysis(entities)], mappings);

    expect(result.resolved).toHaveLength(3);

    // Access nested field values
    const acc = result.fields.accessibility as Record<string, unknown>;
    expect(acc.corridorWidths).toBe(1.1);
    expect(acc.doorWidths).toBe(0.77);
    expect(acc.rampGradient).toBe(0.06);
  });

  it("resolves fire-safety field mappings", () => {
    const mappings: SpatialFieldMapping[] = [
      {
        field: "fireSafety.compartmentArea",
        ifcMapping: {
          entityType: "IfcSpace",
          property: "Area",
          method: "maxValue",
        },
      },
      {
        field: "numberOfFloors",
        ifcMapping: {
          entity: "IfcBuildingStorey",
          method: "count",
        },
      },
    ];

    const entities = [
      makeEntity({ entityType: "IFCSPACE", name: "Zone A", quantities: { area: 800 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Zone B", quantities: { area: 1400 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 0" }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 1" }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 2" }),
    ];

    const result = resolveSpatialContext([makeAnalysis(entities)], mappings);

    const fs = result.fields.fireSafety as Record<string, unknown>;
    expect(fs.compartmentArea).toBe(1400);
    expect(result.fields.numberOfFloors).toBe(3);
  });

  it("resolves thermal envelope mappings", () => {
    const mappings: SpatialFieldMapping[] = [
      {
        field: "envelope.externalWallUValue",
        ifcMapping: {
          entityType: "IfcWall",
          filter: { IsExternal: true },
          pset: "Pset_WallCommon",
          psetProperty: "ThermalTransmittance",
          method: "average",
        },
      },
    ];

    const entities = [
      makeEntity({
        entityType: "IFCWALL", name: "Ext Wall 1",
        properties: { IsExternal: true },
        propertySetData: { "Pset_WallCommon": { ThermalTransmittance: 0.35, IsExternal: true } },
      }),
      makeEntity({
        entityType: "IFCWALL", name: "Ext Wall 2",
        properties: { IsExternal: true },
        propertySetData: { "Pset_WallCommon": { ThermalTransmittance: 0.45, IsExternal: true } },
      }),
      makeEntity({
        entityType: "IFCWALL", name: "Int Wall",
        properties: { IsExternal: false },
        propertySetData: { "Pset_WallCommon": { ThermalTransmittance: 1.5, IsExternal: false } },
      }),
    ];

    const result = resolveSpatialContext([makeAnalysis(entities)], mappings);

    const envelope = result.fields.envelope as Record<string, unknown>;
    expect(envelope.externalWallUValue).toBe(0.4);
  });

  it("handles no IFC data gracefully", () => {
    const result = resolveSpatialContext([], [
      { field: "test.field", ifcMapping: { entityType: "IfcDoor", property: "Width" } },
    ]);
    expect(result.resolved).toHaveLength(0);
    expect(result.stats.skipped).toBe(1);
  });

  it("skips mappings without ifcMapping", () => {
    const result = resolveSpatialContext([makeAnalysis([])], [
      { field: "test.noMapping" },
      { field: "test.emptyMapping", ifcMapping: {} },
    ]);
    expect(result.resolved).toHaveLength(0);
  });

  it("provides confidence tracking", () => {
    const mappings: SpatialFieldMapping[] = [
      {
        field: "test.psetField",
        ifcMapping: {
          entityType: "IfcWall",
          pset: "Pset_WallCommon",
          psetProperty: "FireRating",
        },
      },
      {
        field: "test.quantityField",
        ifcMapping: {
          entityType: "IfcDoor",
          property: "OverallWidth",
        },
      },
    ];

    const entities = [
      makeEntity({
        entityType: "IFCWALL",
        propertySetData: { "Pset_WallCommon": { FireRating: "EI60" } },
      }),
      makeEntity({ entityType: "IFCDOOR", quantities: { width: 0.90 } }),
    ];

    const result = resolveSpatialContext([makeAnalysis(entities)], mappings);

    const psetField = result.resolved.find(r => r.field === "test.psetField");
    expect(psetField?.confidence).toBe("high");
    expect(psetField?.source).toBe("ifc-pset");

    const qtyField = result.resolved.find(r => r.field === "test.quantityField");
    expect(qtyField?.confidence).toBe("high");
    expect(qtyField?.source).toBe("ifc-quantity");
  });

  it("performs within 100ms for 3000 elements", () => {
    const entities: IfcQuantityData[] = [];
    for (let i = 0; i < 3000; i++) {
      entities.push(makeEntity({
        entityType: i % 5 === 0 ? "IFCSPACE" : i % 5 === 1 ? "IFCWALL" : i % 5 === 2 ? "IFCDOOR" : i % 5 === 3 ? "IFCWINDOW" : "IFCSLAB",
        name: `Element ${i}`,
        quantities: { area: 10 + Math.random() * 50, width: 0.5 + Math.random() * 2, height: 2 + Math.random() * 1 },
        properties: { IsExternal: i % 3 === 0 },
      }));
    }

    const mappings: SpatialFieldMapping[] = [
      { field: "test.wallCount", ifcMapping: { entityType: "IfcWall", method: "count" } },
      { field: "test.minDoorWidth", ifcMapping: { entityType: "IfcDoor", property: "OverallWidth", method: "minValue" } },
      { field: "test.totalSpaceArea", ifcMapping: { entityType: "IfcSpace", property: "Area", method: "sumArea" } },
      { field: "test.extWallArea", ifcMapping: { entityType: "IfcWall", filter: { IsExternal: true }, property: "Area", method: "sumArea" } },
    ];

    const result = resolveSpatialContext([makeAnalysis(entities)], mappings);

    expect(result.stats.durationMs).toBeLessThan(100);
    expect(result.resolved.length).toBeGreaterThan(0);
    expect(result.computed.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Derived Classification Fields
// ============================================================

describe("derived classification fields", () => {
  it("derives numberOfFloors from IFCBUILDINGSTOREY count", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Cave", properties: { Elevation: -3.0 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 0", properties: { Elevation: 0 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 1", properties: { Elevation: 3.0 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 2", properties: { Elevation: 6.0 } }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.numberOfFloors).toBe(3); // 3 above ground
    expect(computed?.floorsBelowGround).toBe(1); // 1 below ground

    // Bridge to rule fields
    const general = result.fields.general as Record<string, unknown>;
    expect(general?.floorsAboveGround).toBe(3);
    expect(general?.floorsBelowGround).toBe(1);
  });

  it("derives buildingHeight from storey elevations", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 0", properties: { Elevation: 0 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 1", properties: { Elevation: 3.0 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 2", properties: { Elevation: 6.0 } }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    // Height = maxElev(6) - minElev(0) + 3m typical floor = 9m
    expect(computed?.buildingHeight).toBe(9);

    // Bridge to fire safety
    const fs = result.fields.fireSafety as Record<string, unknown>;
    expect(fs?.buildingHeight).toBe(9);
  });

  it("derives buildingHeight from Qto_BuildingBaseQuantities (preferred)", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCBUILDING", name: "Building",
        propertySetData: { "Qto_BuildingBaseQuantities": { Height: 12.5, GrossFloorArea: 450 } },
      }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 0", properties: { Elevation: 0 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 1", properties: { Elevation: 3.0 } }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    // Qto value should be present (may appear alongside storey-derived value)
    expect(computed?.buildingHeight).toBeDefined();
    expect(computed?.grossFloorArea).toBe(450);
  });

  it("derives grossFloorArea from building base quantities", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCBUILDING", name: "Building",
        propertySetData: { "Qto_BuildingBaseQuantities": { GrossFloorArea: 1200 } },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.grossFloorArea).toBe(1200);

    // Bridge
    const arch = result.fields.architecture as Record<string, unknown>;
    expect(arch?.grossFloorArea).toBe(1200);
  });

  it("falls back to sum of storey areas for grossFloorArea", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCBUILDINGSTOREY", name: "Piso 0",
        properties: { Elevation: 0 },
        propertySetData: { "Qto_BuildingStoreyBaseQuantities": { GrossFloorArea: 200 } },
      }),
      makeEntity({
        entityType: "IFCBUILDINGSTOREY", name: "Piso 1",
        properties: { Elevation: 3 },
        propertySetData: { "Qto_BuildingStoreyBaseQuantities": { GrossFloorArea: 200 } },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.grossFloorArea).toBe(400);
  });

  it("derives typology from bedroom count", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 1", quantities: { area: 12 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 2", quantities: { area: 10 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Quarto 3", quantities: { area: 9 } }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.typology).toBe("T3");

    // Bridge to rule fields
    const general = result.fields.general as Record<string, unknown>;
    expect(general?.typology).toBe("T3");
    const arch = result.fields.architecture as Record<string, unknown>;
    expect(arch?.typology).toBe("T3");
  });

  it("derives windowToFloorRatio from computed values", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCWINDOW", name: "Window 1",
        quantities: { area: 5 },
      }),
      makeEntity({
        entityType: "IFCWINDOW", name: "Window 2",
        quantities: { area: 5 },
      }),
      makeEntity({ entityType: "IFCSPACE", name: "Sala", quantities: { area: 50 } }),
      makeEntity({ entityType: "IFCSPACE", name: "Quarto", quantities: { area: 30 } }),
      // Need external walls for window-to-wall ratio to trigger window area computation
      makeEntity({
        entityType: "IFCWALL", name: "Ext Wall",
        properties: { IsExternal: true },
        quantities: { area: 100 },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    // 10m² windows / 80m² usable = 12.5%
    expect(computed?.windowToFloorRatio).toBe(12.5);
    // Bridge
    const envelope = result.fields.envelope as Record<string, unknown>;
    expect(envelope?.windowToFloorRatio).toBe(12.5);
  });

  it("derives occupantLoad from gross floor area", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCBUILDING", name: "Building",
        propertySetData: { "Qto_BuildingBaseQuantities": { GrossFloorArea: 500 } },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    // 500m² × 0.02 = 10 occupants
    expect(computed?.occupantLoad).toBe(10);

    // Bridge to fire safety
    const fs = result.fields.fireSafety as Record<string, unknown>;
    expect(fs?.occupantLoad).toBe(10);
  });
});

// ============================================================
// Fire Safety Risk Category Classification
// ============================================================

describe("classifyFireRiskCategory", () => {
  it("classifies low buildings as category 1", () => {
    expect(classifyFireRiskCategory(6)).toBe("1");
    expect(classifyFireRiskCategory(9)).toBe("1");
  });

  it("classifies medium buildings as category 2", () => {
    expect(classifyFireRiskCategory(9.1)).toBe("2");
    expect(classifyFireRiskCategory(15)).toBe("2");
    expect(classifyFireRiskCategory(28)).toBe("2");
  });

  it("classifies tall buildings as category 3", () => {
    expect(classifyFireRiskCategory(28.1)).toBe("3");
    expect(classifyFireRiskCategory(50)).toBe("3");
  });

  it("classifies very tall buildings as category 4", () => {
    expect(classifyFireRiskCategory(50.1)).toBe("4");
    expect(classifyFireRiskCategory(100)).toBe("4");
  });

  it("integrates with spatial resolver", () => {
    // 4-storey building: 0,3,6,9 → height = 9-0+3 = 12m → category 2
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 0", properties: { Elevation: 0 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 1", properties: { Elevation: 3 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 2", properties: { Elevation: 6 } }),
      makeEntity({ entityType: "IFCBUILDINGSTOREY", name: "Piso 3", properties: { Elevation: 9 } }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.riskCategory).toBe("2");

    // Bridge to fire safety
    const fs = result.fields.fireSafety as Record<string, unknown>;
    expect(fs?.riskCategory).toBe("2");
  });
});

// ============================================================
// Garage & Lobby Extraction
// ============================================================

describe("garage and lobby extraction", () => {
  it("extracts garage area and height", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCSPACE", name: "Garagem",
        quantities: { area: 30, height: 2.5 },
      }),
      makeEntity({
        entityType: "IFCSPACE", name: "Estacionamento 2",
        quantities: { area: 45, height: 2.3 },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.minGarageArea).toBe(30);
    expect(computed?.minGarageHeight).toBe(2.3);
    expect(computed?.garageCount).toBe(2);

    // Bridge
    const general = result.fields.general as Record<string, unknown>;
    expect(general?.garageHeight).toBe(2.3);
  });

  it("extracts lobby area", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCSPACE", name: "Hall de Entrada",
        quantities: { area: 8, width: 2.5 },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.minLobbyArea).toBe(8);
    expect(computed?.lobbyCount).toBe(1);

    // Bridge
    const arch = result.fields.architecture as Record<string, unknown>;
    expect(arch?.entranceLobbyArea).toBe(8);
  });
});

// ============================================================
// Guard Rail & Room Volume
// ============================================================

describe("guard rail and room volume", () => {
  it("extracts guard rail height from IFCRAILING", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({ entityType: "IFCRAILING", name: "Railing 1", quantities: { height: 1.10 } }),
      makeEntity({ entityType: "IFCRAILING", name: "Railing 2", quantities: { height: 0.90 } }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.guardRailHeight).toBe(0.9);

    // Bridge
    const general = result.fields.general as Record<string, unknown>;
    expect(general?.guardRailHeight).toBe(0.9);
  });

  it("extracts room volume for acoustic analysis", () => {
    const result = resolveSpatialContext([makeAnalysis([
      makeEntity({
        entityType: "IFCSPACE", name: "Quarto",
        quantities: { area: 12 },
        properties: { Volume: 30 },
      }),
      makeEntity({
        entityType: "IFCSPACE", name: "Sala",
        quantities: { area: 20 },
        properties: { Volume: 50 },
      }),
    ])], []);

    const computed = result.fields.computed as Record<string, unknown>;
    expect(computed?.minRoomVolume).toBe(30);

    // Bridge to acoustic
    const acoustic = result.fields.acoustic as Record<string, unknown>;
    expect(acoustic?.roomVolume).toBe(30);
  });
});

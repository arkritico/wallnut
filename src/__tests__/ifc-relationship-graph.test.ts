import { describe, it, expect } from "vitest";
import {
  buildSpatialGraph,
  type SpatialGraph,
  type RoomContext,
} from "@/lib/ifc-relationship-graph";
import type { IfcQuantityData } from "@/lib/ifc-specialty-analyzer";

// ============================================================
// Helpers
// ============================================================

let idCounter = 0;

function makeEntity(overrides: Partial<IfcQuantityData> = {}): IfcQuantityData {
  return {
    entityType: "IFCWALL",
    name: `Entity-${++idCounter}`,
    globalId: `gid-${idCounter}`,
    properties: {},
    propertySetData: {},
    quantities: {},
    materials: [],
    ...overrides,
  };
}

function makeSpace(name: string, storey: string, area: number, overrides: Partial<IfcQuantityData> = {}): IfcQuantityData {
  return makeEntity({
    entityType: "IFCSPACE",
    name,
    storey,
    quantities: { area },
    ...overrides,
  });
}

function makeWindow(storey: string, area: number, hostElement?: string, overrides: Partial<IfcQuantityData> = {}): IfcQuantityData {
  return makeEntity({
    entityType: "IFCWINDOW",
    name: `Window-${idCounter}`,
    storey,
    quantities: { area, width: Math.sqrt(area), height: Math.sqrt(area) },
    hostElement,
    ...overrides,
  });
}

function makeDoor(storey: string, width: number, overrides: Partial<IfcQuantityData> = {}): IfcQuantityData {
  return makeEntity({
    entityType: "IFCDOOR",
    name: `Door-${idCounter}`,
    storey,
    quantities: { width, height: 2.1, area: width * 2.1 },
    ...overrides,
  });
}

function makeWall(storey: string, overrides: Partial<IfcQuantityData> = {}): IfcQuantityData {
  return makeEntity({
    entityType: "IFCWALL",
    name: `Wall-${idCounter}`,
    storey,
    quantities: { area: 15, length: 5, height: 3 },
    ...overrides,
  });
}

beforeEach(() => {
  idCounter = 0;
});

// ============================================================
// Tests: Empty / Edge Cases
// ============================================================

describe("buildSpatialGraph — empty cases", () => {
  it("returns empty graph when no entities provided", () => {
    const graph = buildSpatialGraph([]);
    expect(graph.rooms).toHaveLength(0);
    expect(graph.adjacencies).toHaveLength(0);
    expect(graph.summary.allBedroomsHaveLight).toBe(true);
    expect(graph.summary.kitchenHasLight).toBe(true);
    expect(graph.summary.roomsWithoutLight).toBe(0);
  });

  it("returns empty rooms when no IFCSPACE entities exist", () => {
    const entities = [
      makeWall("Piso 0"),
      makeWindow("Piso 0", 2.0),
      makeDoor("Piso 0", 0.9),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms).toHaveLength(0);
    // Evacuation still analyzed from doors
    expect(graph.evacuation).toBeDefined();
  });

  it("handles spaces with zero floor area without division errors", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 0),
      makeWindow("Piso 0", 2.0),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms).toHaveLength(1);
    expect(graph.rooms[0].metrics.naturalLightRatio).toBe(0);
  });
});

// ============================================================
// Tests: Window→Room Assignment
// ============================================================

describe("buildSpatialGraph — window-to-room assignment", () => {
  it("assigns window to room on same storey via host wall", () => {
    const wall = makeWall("Piso 0");
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      wall,
      makeWindow("Piso 0", 2.0, wall.globalId),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms).toHaveLength(1);
    expect(graph.rooms[0].windows).toHaveLength(1);
    expect(graph.rooms[0].metrics.windowArea).toBe(2.0);
  });

  it("assigns window to single room when only one space on storey", () => {
    const entities = [
      makeSpace("Sala", "Piso 0", 20),
      makeWindow("Piso 0", 3.0),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms).toHaveLength(1);
    expect(graph.rooms[0].windows).toHaveLength(1);
    expect(graph.rooms[0].metrics.windowArea).toBe(3.0);
  });

  it("distributes unassigned windows proportionally across multiple rooms on same storey", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12), // 40%
      makeSpace("Sala", "Piso 0", 18),      // 60%
      makeWindow("Piso 0", 5.0),            // no hostElement
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms).toHaveLength(2);
    // Both rooms should have the window in their list (with fraction applied to metrics)
    const totalWindowArea = graph.rooms.reduce((s, r) => s + r.metrics.windowArea, 0);
    expect(totalWindowArea).toBeCloseTo(5.0, 1);
  });

  it("does not assign windows from different storeys", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      makeWindow("Piso 1", 2.0),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms).toHaveLength(1);
    // Window is on different storey so should not be assigned
    expect(graph.rooms[0].metrics.windowArea).toBe(0);
  });

  it("assigns multiple windows to same room", () => {
    const wall = makeWall("Piso 0");
    const entities = [
      makeSpace("Sala", "Piso 0", 25),
      wall,
      makeWindow("Piso 0", 2.0, wall.globalId),
      makeWindow("Piso 0", 3.0, wall.globalId),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms[0].windows).toHaveLength(2);
    expect(graph.rooms[0].metrics.windowArea).toBe(5.0);
  });
});

// ============================================================
// Tests: Per-Room Metrics
// ============================================================

describe("buildSpatialGraph — room metrics", () => {
  it("computes naturalLightRatio = windowArea / floorArea", () => {
    const wall = makeWall("Piso 0");
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      wall,
      makeWindow("Piso 0", 2.0, wall.globalId),
    ];
    const graph = buildSpatialGraph(entities);
    const room = graph.rooms[0];
    expect(room.metrics.naturalLightRatio).toBeCloseTo(2.0 / 12.0, 3);
  });

  it("room with no windows has zero light ratio", () => {
    const entities = [
      makeSpace("WC", "Piso 0", 4),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms[0].metrics.naturalLightRatio).toBe(0);
    expect(graph.rooms[0].metrics.windowArea).toBe(0);
  });

  it("computes doorCount and minDoorWidth correctly", () => {
    const entities = [
      makeSpace("Corredor", "Piso 0", 8),
      makeDoor("Piso 0", 0.9),
      makeDoor("Piso 0", 0.8),
    ];
    const graph = buildSpatialGraph(entities);
    const room = graph.rooms[0];
    expect(room.metrics.doorCount).toBe(2);
    expect(room.metrics.minDoorWidth).toBe(0.8);
  });

  it("ventilationArea equals windowArea", () => {
    const wall = makeWall("Piso 0");
    const entities = [
      makeSpace("Sala", "Piso 0", 20),
      wall,
      makeWindow("Piso 0", 3.5, wall.globalId),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms[0].metrics.ventilationArea).toBe(3.5);
  });
});

// ============================================================
// Tests: Room Adjacency
// ============================================================

describe("buildSpatialGraph — room adjacency", () => {
  it("detects adjacency between two rooms sharing a door on same storey", () => {
    const door = makeDoor("Piso 0", 0.9);
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      makeSpace("Corredor", "Piso 0", 8),
      door,
    ];
    const graph = buildSpatialGraph(entities);
    // Both rooms on same storey with a shared door → adjacent
    expect(graph.adjacencies.length).toBeGreaterThan(0);
    expect(graph.adjacencies[0].narrowestDoorWidth).toBe(0.9);
  });

  it("does not detect adjacency between rooms on different storeys", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      makeSpace("Quarto 2", "Piso 1", 12),
      makeDoor("Piso 0", 0.9),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.adjacencies).toHaveLength(0);
  });

  it("no adjacencies when no doors exist", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      makeSpace("Sala", "Piso 0", 20),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.adjacencies).toHaveLength(0);
  });
});

// ============================================================
// Tests: Evacuation Analysis
// ============================================================

describe("buildSpatialGraph — evacuation analysis", () => {
  it("minPathWidth is the narrowest exit door width", () => {
    const entities = [
      makeSpace("Corredor", "Piso 0", 10, {
        quantities: { area: 10, width: 1.5, length: 8 },
      }),
      makeDoor("Piso 0", 1.2, { properties: { IsExternal: true }, propertySetData: {} }),
      makeDoor("Piso 0", 0.9, { properties: { IsExternal: true }, propertySetData: {} }),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.evacuation.minPathWidth).toBe(0.9);
  });

  it("detects exit door by name pattern (saída)", () => {
    const entities = [
      makeDoor("Piso 0", 1.0, { name: "Porta de Saída", properties: {}, propertySetData: {} }),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.evacuation.minPathWidth).toBe(1.0);
  });

  it("includes corridor width in bottleneck calculation", () => {
    const corridorSpace = makeSpace("Corredor", "Piso 0", 8, {
      quantities: { area: 8, width: 1.1, length: 6 },
    });
    const exitDoor = makeDoor("Piso 0", 1.3, {
      properties: { IsExternal: true }, propertySetData: {},
    });
    const entities = [corridorSpace, exitDoor];
    const graph = buildSpatialGraph(entities);
    // Corridor width (1.1) is narrower than exit door (1.3)
    expect(graph.evacuation.minPathWidth).toBe(1.1);
  });

  it("computes maxEstimatedDistance from corridor lengths", () => {
    const entities = [
      makeSpace("Corredor 1", "Piso 0", 10, {
        quantities: { area: 10, width: 1.5, length: 8 },
      }),
      makeSpace("Corredor 2", "Piso 0", 6, {
        quantities: { area: 6, width: 1.5, length: 4 },
      }),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.evacuation.maxEstimatedDistance).toBe(12); // 8 + 4
  });

  it("returns undefined when no exit doors or corridors", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.evacuation.minPathWidth).toBeUndefined();
    expect(graph.evacuation.maxEstimatedDistance).toBeUndefined();
  });
});

// ============================================================
// Tests: Building Summary
// ============================================================

describe("buildSpatialGraph — building summary", () => {
  it("computes minHabitableLightRatio across habitable rooms", () => {
    const wall1 = makeWall("Piso 0");
    const wall2 = makeWall("Piso 0");
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      makeSpace("Sala", "Piso 0", 20),
      wall1, wall2,
      makeWindow("Piso 0", 1.5, wall1.globalId), // first goes to largest habitable room
      makeWindow("Piso 0", 3.0, wall2.globalId),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.summary.minHabitableLightRatio).toBeDefined();
    expect(graph.summary.minHabitableLightRatio!).toBeGreaterThan(0);
  });

  it("allBedroomsHaveLight is true when all bedrooms have windows", () => {
    const wall = makeWall("Piso 0");
    const entities = [
      makeSpace("Quarto Principal", "Piso 0", 15),
      wall,
      makeWindow("Piso 0", 2.0, wall.globalId),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.summary.allBedroomsHaveLight).toBe(true);
  });

  it("allBedroomsHaveLight is false when a bedroom has no windows", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      makeSpace("Quarto 2", "Piso 1", 10),
      makeWindow("Piso 0", 2.0), // only Piso 0 has a window
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.summary.allBedroomsHaveLight).toBe(false);
  });

  it("kitchenHasLight reflects whether any kitchen has a window", () => {
    const entities = [
      makeSpace("Cozinha", "Piso 0", 10),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.summary.kitchenHasLight).toBe(false);
  });

  it("roomsWithoutLight counts habitable rooms with no windows", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      makeSpace("Sala", "Piso 0", 20),
      makeSpace("Cozinha", "Piso 0", 8),
      makeWindow("Piso 0", 2.0), // shared across all 3 rooms
    ];
    const graph = buildSpatialGraph(entities);
    // All 3 rooms get proportional window share, so none should be without light
    expect(graph.summary.roomsWithoutLight).toBe(0);
  });

  it("maxCompartmentArea returns largest space area", () => {
    const entities = [
      makeSpace("Sala", "Piso 0", 45),
      makeSpace("Quarto", "Piso 0", 12),
      makeSpace("Cozinha", "Piso 0", 10),
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.summary.maxCompartmentArea).toBe(45);
  });
});

// ============================================================
// Tests: Room Type Classification
// ============================================================

describe("buildSpatialGraph — room type classification", () => {
  it("classifies Portuguese room names", () => {
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      makeSpace("Sala de Estar", "Piso 0", 20),
      makeSpace("Cozinha", "Piso 0", 10),
      makeSpace("WC", "Piso 0", 4),
      makeSpace("Corredor", "Piso 0", 6),
    ];
    const graph = buildSpatialGraph(entities);
    const types = graph.rooms.map(r => r.roomType);
    expect(types).toContain("bedroom");
    expect(types).toContain("living");
    expect(types).toContain("kitchen");
    expect(types).toContain("bathroom");
    expect(types).toContain("corridor");
  });

  it("classifies English room names", () => {
    const entities = [
      makeSpace("Bedroom 1", "Floor 0", 12),
      makeSpace("Living Room", "Floor 0", 20),
      makeSpace("Kitchen", "Floor 0", 10),
    ];
    const graph = buildSpatialGraph(entities);
    const types = graph.rooms.map(r => r.roomType);
    expect(types).toContain("bedroom");
    expect(types).toContain("living");
    expect(types).toContain("kitchen");
  });
});

// ============================================================
// Tests: Integration with IFC Parser
// ============================================================

describe("buildSpatialGraph — IFC parser relationship fields", () => {
  it("uses fillsOpeningId and hostElement from parser output", () => {
    const wall = makeWall("Piso 0");
    const window = makeWindow("Piso 0", 2.0, wall.globalId, {
      fillsOpeningId: "#opening-1",
    });
    const entities = [
      makeSpace("Quarto 1", "Piso 0", 12),
      wall,
      window,
    ];
    const graph = buildSpatialGraph(entities);
    expect(graph.rooms[0].windows).toHaveLength(1);
    expect(graph.rooms[0].metrics.windowArea).toBe(2.0);
  });

  it("uses aggregatedChildren field", () => {
    const storey = makeEntity({
      entityType: "IFCBUILDINGSTOREY",
      name: "Piso 0",
      aggregatedChildren: ["#space-1", "#space-2"],
    });
    const entities = [
      storey,
      makeSpace("Quarto", "Piso 0", 12),
    ];
    const graph = buildSpatialGraph(entities);
    // The storey has aggregatedChildren but the graph focuses on IFCSPACE
    expect(graph.rooms).toHaveLength(1);
  });
});

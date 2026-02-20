/**
 * IFC Spatial Relationship Graph
 *
 * Builds cross-entity spatial relationships from parsed IFC data:
 * - Window/door → room assignment (via host wall chain)
 * - Room adjacency (rooms sharing a connecting door)
 * - Per-room metrics (natural light ratio, ventilation area)
 * - Evacuation path analysis (bottleneck widths, estimated distances)
 *
 * Consumes IfcQuantityData[] (with hostElement, fillsOpeningId populated
 * by the extended parser) and produces a SpatialGraph.
 */

import type { IfcQuantityData } from "./ifc-specialty-analyzer";
import { EntityIndex, spaceMatchesType, getSpaceArea } from "./spatial-context-resolver";

// ============================================================
// Types
// ============================================================

export interface RoomMetrics {
  /** Floor area of the room (m²) */
  floorArea: number;
  /** Total window area assigned to this room (m²) */
  windowArea: number;
  /** Natural light ratio: windowArea / floorArea */
  naturalLightRatio: number;
  /** Ventilation area (uses window area as proxy) (m²) */
  ventilationArea: number;
  /** Number of doors in this room */
  doorCount: number;
  /** Minimum door width in this room (m) */
  minDoorWidth: number | undefined;
}

export interface RoomContext {
  /** The IFCSPACE entity */
  space: IfcQuantityData;
  /** Room type classification (bedroom, corridor, etc.) */
  roomType: string | undefined;
  /** Windows assigned to this room */
  windows: IfcQuantityData[];
  /** Doors assigned to this room */
  doors: IfcQuantityData[];
  /** Computed metrics */
  metrics: RoomMetrics;
}

export interface RoomAdjacency {
  spaceIdA: string;
  spaceIdB: string;
  /** Doors connecting the two rooms */
  connectingDoors: IfcQuantityData[];
  /** Width of the narrowest connecting door (m) */
  narrowestDoorWidth: number | undefined;
}

export interface EvacuationAnalysis {
  /** Narrowest bottleneck width along any evacuation path (m) */
  minPathWidth: number | undefined;
  /** Estimated max distance to exit — sum of corridor lengths (m) */
  maxEstimatedDistance: number | undefined;
  /** Per-storey narrowest path width */
  perStorey: Map<string, number>;
}

export interface SpatialGraphSummary {
  /** Minimum natural light ratio across habitable rooms */
  minHabitableLightRatio: number | undefined;
  /** Minimum ventilation ratio across habitable rooms */
  minHabitableVentRatio: number | undefined;
  /** Largest single space area (fire compartment proxy) */
  maxCompartmentArea: number | undefined;
  /** Count of rooms with zero window area */
  roomsWithoutLight: number;
  /** Whether all bedrooms have at least one window */
  allBedroomsHaveLight: boolean;
  /** Whether at least one kitchen has a window */
  kitchenHasLight: boolean;
}

export interface SpatialGraph {
  rooms: RoomContext[];
  adjacencies: RoomAdjacency[];
  evacuation: EvacuationAnalysis;
  summary: SpatialGraphSummary;
}

// ============================================================
// Helpers
// ============================================================

const HABITABLE_TYPES = ["bedroom", "living", "kitchen"];

function classifyRoomType(space: IfcQuantityData): string | undefined {
  const types = ["bedroom", "bathroom", "kitchen", "living", "corridor",
    "garage", "storage", "laundry", "lobby"];
  for (const type of types) {
    if (spaceMatchesType(space, type)) return type;
  }
  return undefined;
}

function groupByStorey<T extends { storey?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.storey ?? "_unknown";
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(item);
  }
  return map;
}

function isExternalDoor(door: IfcQuantityData): boolean {
  if (door.properties.IsExternal === true || door.properties._isExternal === true) return true;
  const pset = door.propertySetData?.["Pset_DoorCommon"];
  if (pset?.IsExternal === true) return true;
  const name = door.name.toLowerCase();
  return name.includes("exit") || name.includes("saída") || name.includes("saida") ||
    name.includes("emergência") || name.includes("emergencia") || name.includes("exterior");
}

// ============================================================
// Core: Build Spatial Graph
// ============================================================

export function buildSpatialGraph(quantities: IfcQuantityData[]): SpatialGraph {
  const index = new EntityIndex(quantities);
  const spaces = index.getByType("IFCSPACE");
  const windows = index.getByType("IFCWINDOW");
  const doors = index.getByType("IFCDOOR");

  // If no spaces, return empty graph
  if (spaces.length === 0) {
    return {
      rooms: [],
      adjacencies: [],
      evacuation: analyzeEvacuation([], doors),
      summary: {
        minHabitableLightRatio: undefined,
        minHabitableVentRatio: undefined,
        maxCompartmentArea: undefined,
        roomsWithoutLight: 0,
        allBedroomsHaveLight: true,
        kitchenHasLight: true,
      },
    };
  }

  // Build entity-id → IfcQuantityData lookup for host element resolution
  const entityById = new Map<string, IfcQuantityData>();
  for (const q of quantities) {
    if (q.globalId) {
      entityById.set(q.globalId, q);
    }
  }

  // Step 1: Assign windows and doors to rooms
  const rooms = assignElementsToRooms(spaces, windows, doors, entityById);

  // Step 2: Compute per-room metrics
  for (const room of rooms) {
    room.metrics = computeRoomMetrics(room);
  }

  // Step 3: Build adjacency list
  const adjacencies = buildAdjacencyList(rooms);

  // Step 4: Evacuation analysis
  const evacuation = analyzeEvacuation(rooms, doors);

  // Step 5: Building summary
  const summary = computeSummary(rooms);

  return { rooms, adjacencies, evacuation, summary };
}

// ============================================================
// Step 1: Assign Elements to Rooms
// ============================================================

function assignElementsToRooms(
  spaces: IfcQuantityData[],
  windows: IfcQuantityData[],
  doors: IfcQuantityData[],
  entityById: Map<string, IfcQuantityData>,
): RoomContext[] {
  const spacesByStorey = groupByStorey(spaces);

  // Build storey-level element groups for fallback distribution
  const windowsByStorey = groupByStorey(windows);
  const doorsByStorey = groupByStorey(doors);

  // Track which windows/doors have been assigned via host-element chain
  const assignedWindows = new Set<string>();
  const assignedDoors = new Set<string>();

  // Build host-element-id to storey+spaces mapping
  // hostElement is an entity ID like "#1234" — find which storey the host wall is on
  const hostToStorey = new Map<string, string>();
  for (const q of entityById.values()) {
    if (q.hostElement || q.storey) {
      // Not needed — we look up the host wall directly
    }
  }

  const rooms: RoomContext[] = spaces.map(space => ({
    space,
    roomType: classifyRoomType(space),
    windows: [],
    doors: [],
    metrics: { floorArea: 0, windowArea: 0, naturalLightRatio: 0, ventilationArea: 0, doorCount: 0, minDoorWidth: undefined },
  }));

  // Index rooms by storey for fast lookup
  const roomsByStorey = new Map<string, RoomContext[]>();
  for (const room of rooms) {
    const key = room.space.storey ?? "_unknown";
    let arr = roomsByStorey.get(key);
    if (!arr) {
      arr = [];
      roomsByStorey.set(key, arr);
    }
    arr.push(room);
  }

  // Phase A: Assign windows/doors with hostElement to rooms on same storey
  for (const win of windows) {
    if (!win.hostElement) continue;
    const storey = win.storey;
    if (!storey) continue;

    const storeyRooms = roomsByStorey.get(storey);
    if (!storeyRooms || storeyRooms.length === 0) continue;

    if (storeyRooms.length === 1) {
      // Only one room on this storey — direct assignment
      storeyRooms[0].windows.push(win);
      assignedWindows.add(win.globalId ?? win.name);
    } else {
      // Multiple rooms on storey — assign proportionally by floor area
      const totalArea = storeyRooms.reduce((s, r) => s + (getSpaceArea(r.space) ?? 0), 0);
      if (totalArea > 0) {
        // Assign to the largest room (heuristic: windows face the largest habitable room)
        // A better approach would use geometric proximity, but text-based parsing can't do that
        const habitableOnStorey = storeyRooms.filter(r =>
          r.roomType && HABITABLE_TYPES.includes(r.roomType)
        );
        const target = habitableOnStorey.length > 0
          ? habitableOnStorey.reduce((best, r) =>
            (getSpaceArea(r.space) ?? 0) > (getSpaceArea(best.space) ?? 0) ? r : best
          )
          : storeyRooms[0];
        target.windows.push(win);
        assignedWindows.add(win.globalId ?? win.name);
      }
    }
  }

  for (const door of doors) {
    if (!door.hostElement) continue;
    const storey = door.storey;
    if (!storey) continue;

    const storeyRooms = roomsByStorey.get(storey);
    if (!storeyRooms || storeyRooms.length === 0) continue;

    // Doors are assigned to ALL rooms on the storey (they connect rooms)
    for (const room of storeyRooms) {
      room.doors.push(door);
    }
    assignedDoors.add(door.globalId ?? door.name);
  }

  // Phase B: Fallback — distribute unassigned windows proportionally by floor area
  for (const [storey, storeyWindows] of windowsByStorey) {
    const unassigned = storeyWindows.filter(w => !assignedWindows.has(w.globalId ?? w.name));
    if (unassigned.length === 0) continue;

    const storeyRooms = roomsByStorey.get(storey);
    if (!storeyRooms || storeyRooms.length === 0) continue;
    // Skip mass-assignment for synthetic/large storeys
    if (storeyRooms.length > 100) continue;

    const totalArea = storeyRooms.reduce((s, r) => s + (getSpaceArea(r.space) ?? 0), 0);
    if (totalArea <= 0) continue;

    // Distribute proportionally
    for (const room of storeyRooms) {
      const roomArea = getSpaceArea(room.space) ?? 0;
      if (roomArea <= 0) continue;
      const fraction = roomArea / totalArea;
      // Assign a proportional fraction of the unassigned windows
      // For simplicity, assign all unassigned windows to each room with a weight
      // (the metrics calculation will use actual window areas weighted by fraction)
      for (const win of unassigned) {
        room.windows.push(win);
      }
      // Mark the fraction on the room for later metric calculation
      (room as RoomContext & { _windowFraction?: number })._windowFraction = fraction;
    }
  }

  // Phase B2: Fallback for unassigned doors (skip for large storeys to avoid O(n²))
  for (const [storey, storeyDoors] of doorsByStorey) {
    const unassigned = storeyDoors.filter(d => !assignedDoors.has(d.globalId ?? d.name));
    if (unassigned.length === 0) continue;

    const storeyRooms = roomsByStorey.get(storey);
    if (!storeyRooms || storeyRooms.length === 0) continue;
    // Skip mass-assignment when too many rooms (synthetic/test data — real buildings have <50 rooms/storey)
    if (storeyRooms.length > 100) continue;

    for (const room of storeyRooms) {
      const existingDoorIds = new Set(room.doors.map(d => d.globalId ?? d.name));
      for (const door of unassigned) {
        const doorId = door.globalId ?? door.name;
        if (!existingDoorIds.has(doorId)) {
          room.doors.push(door);
          existingDoorIds.add(doorId);
        }
      }
    }
  }

  return rooms;
}

// ============================================================
// Step 2: Compute Per-Room Metrics
// ============================================================

function computeRoomMetrics(room: RoomContext): RoomMetrics {
  const floorArea = getSpaceArea(room.space) ?? 0;
  const fraction = (room as RoomContext & { _windowFraction?: number })._windowFraction;

  // Sum window areas — if fraction is set, scale proportionally
  let windowArea = room.windows.reduce((sum, w) => sum + (w.quantities.area ?? 0), 0);
  if (fraction !== undefined && fraction < 1) {
    windowArea *= fraction;
  }

  const naturalLightRatio = floorArea > 0 ? windowArea / floorArea : 0;
  const ventilationArea = windowArea; // proxy: openable window area ≈ total window area

  const doorWidths = room.doors
    .map(d => d.quantities.width)
    .filter((w): w is number => w !== undefined && w > 0);
  const minDoorWidth = doorWidths.length > 0 ? Math.min(...doorWidths) : undefined;

  return {
    floorArea,
    windowArea: Math.round(windowArea * 100) / 100,
    naturalLightRatio: Math.round(naturalLightRatio * 10000) / 10000,
    ventilationArea: Math.round(ventilationArea * 100) / 100,
    doorCount: room.doors.length,
    minDoorWidth,
  };
}

// ============================================================
// Step 3: Build Adjacency List
// ============================================================

function buildAdjacencyList(rooms: RoomContext[]): RoomAdjacency[] {
  const adjacencies: RoomAdjacency[] = [];
  const roomsByStorey = groupByStorey(rooms.map(r => ({ ...r, storey: r.space.storey })));

  for (const [, storeyRooms] of roomsByStorey) {
    // Skip storey with too many rooms (data quality issue, would cause O(n²) blowup)
    if (storeyRooms.length > 100) continue;

    // Only consider rooms that have doors for adjacency (optimization)
    const roomsWithDoors = storeyRooms.filter(r => r.doors.length > 0);
    if (roomsWithDoors.length < 2) continue;

    for (let i = 0; i < roomsWithDoors.length; i++) {
      for (let j = i + 1; j < roomsWithDoors.length; j++) {
        const a = roomsWithDoors[i];
        const b = roomsWithDoors[j];

        // Two rooms are adjacent if they share at least one door
        const aDoorIds = new Set(a.doors.map(d => d.globalId ?? d.name));
        const sharedDoors = b.doors.filter(d => aDoorIds.has(d.globalId ?? d.name));

        // Only consider non-external doors for room-to-room adjacency
        const internalSharedDoors = sharedDoors.filter(d => !isExternalDoor(d));

        if (internalSharedDoors.length > 0) {
          const widths = internalSharedDoors
            .map(d => d.quantities.width)
            .filter((w): w is number => w !== undefined && w > 0);
          adjacencies.push({
            spaceIdA: a.space.globalId ?? a.space.name,
            spaceIdB: b.space.globalId ?? b.space.name,
            connectingDoors: internalSharedDoors,
            narrowestDoorWidth: widths.length > 0 ? Math.min(...widths) : undefined,
          });
        }
      }
    }
  }

  return adjacencies;
}

// ============================================================
// Step 4: Evacuation Analysis
// ============================================================

function analyzeEvacuation(rooms: RoomContext[], allDoors: IfcQuantityData[]): EvacuationAnalysis {
  // Find external doors (exits)
  const exitDoors = allDoors.filter(isExternalDoor);

  // Corridors
  const corridors = rooms.filter(r => r.roomType === "corridor");

  // Narrowest bottleneck: min of (corridor widths, exit door widths)
  const corridorWidths = corridors
    .map(c => c.space.quantities.width)
    .filter((w): w is number => w !== undefined && w > 0);
  const exitDoorWidths = exitDoors
    .map(d => d.quantities.width)
    .filter((w): w is number => w !== undefined && w > 0);

  const allWidths = [...corridorWidths, ...exitDoorWidths];
  const minPathWidth = allWidths.length > 0 ? Math.min(...allWidths) : undefined;

  // Estimated max distance: sum of corridor lengths on the storey with the most corridor length
  const corridorsByStorey = groupByStorey(corridors.map(c => ({
    length: c.space.quantities.length ?? 0,
    storey: c.space.storey,
  })));

  let maxEstimatedDistance: number | undefined;
  for (const [, storeyCorridors] of corridorsByStorey) {
    const total = storeyCorridors.reduce((s, c) => s + c.length, 0);
    if (total > 0 && (maxEstimatedDistance === undefined || total > maxEstimatedDistance)) {
      maxEstimatedDistance = total;
    }
  }

  // Per-storey analysis
  const perStorey = new Map<string, number>();
  const storeySet = new Set([
    ...corridors.map(c => c.space.storey),
    ...exitDoors.map(d => d.storey),
  ].filter(Boolean) as string[]);

  for (const storey of storeySet) {
    const widths = [
      ...corridors.filter(c => c.space.storey === storey)
        .map(c => c.space.quantities.width)
        .filter((w): w is number => w !== undefined && w > 0),
      ...exitDoors.filter(d => d.storey === storey)
        .map(d => d.quantities.width)
        .filter((w): w is number => w !== undefined && w > 0),
    ];
    if (widths.length > 0) {
      perStorey.set(storey, Math.min(...widths));
    }
  }

  return {
    minPathWidth: minPathWidth !== undefined ? Math.round(minPathWidth * 1000) / 1000 : undefined,
    maxEstimatedDistance: maxEstimatedDistance !== undefined ? Math.round(maxEstimatedDistance * 100) / 100 : undefined,
    perStorey,
  };
}

// ============================================================
// Step 5: Building Summary
// ============================================================

function computeSummary(rooms: RoomContext[]): SpatialGraphSummary {
  const bedrooms = rooms.filter(r => r.roomType === "bedroom");
  const kitchens = rooms.filter(r => r.roomType === "kitchen");
  const habitableRooms = rooms.filter(r =>
    r.roomType && HABITABLE_TYPES.includes(r.roomType)
  );

  // Natural light ratios for habitable rooms
  const lightRatios = habitableRooms
    .map(r => r.metrics.naturalLightRatio)
    .filter(r => r > 0);
  const minHabitableLightRatio = lightRatios.length > 0 ? Math.min(...lightRatios) : undefined;

  // Ventilation ratios for habitable rooms
  const ventRatios = habitableRooms
    .filter(r => r.metrics.floorArea > 0)
    .map(r => r.metrics.ventilationArea / r.metrics.floorArea)
    .filter(r => r > 0);
  const minHabitableVentRatio = ventRatios.length > 0
    ? Math.round(Math.min(...ventRatios) * 10000) / 10000
    : undefined;

  // Largest space area (fire compartment proxy)
  const allAreas = rooms
    .map(r => r.metrics.floorArea)
    .filter(a => a > 0);
  const maxCompartmentArea = allAreas.length > 0 ? Math.max(...allAreas) : undefined;

  // Rooms without natural light
  const roomsWithoutLight = rooms.filter(r =>
    r.roomType && HABITABLE_TYPES.includes(r.roomType) && r.metrics.windowArea <= 0
  ).length;

  // Bedroom light check
  const allBedroomsHaveLight = bedrooms.length === 0 || bedrooms.every(r => r.metrics.windowArea > 0);

  // Kitchen light check
  const kitchenHasLight = kitchens.length === 0 || kitchens.some(r => r.metrics.windowArea > 0);

  return {
    minHabitableLightRatio,
    minHabitableVentRatio,
    maxCompartmentArea,
    roomsWithoutLight,
    allBedroomsHaveLight,
    kitchenHasLight,
  };
}

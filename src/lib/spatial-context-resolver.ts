/**
 * Spatial Context Resolver
 *
 * Resolves spatial/geometric data from IFC models into the validation context,
 * enabling 6,836 regulation rules to evaluate against real project data
 * (room areas, door widths, corridor widths, ramp slopes, U-values, etc.)
 * instead of smart defaults.
 *
 * Consumes:
 *   - SpecialtyAnalysisResult[] from ifc-specialty-analyzer.ts
 *   - FieldMapping[] from plugin field-mappings.json files
 *
 * Produces:
 *   - Resolved field values with source and confidence tracking
 *   - Computed spatial relationships (window-to-wall ratio, min room areas, etc.)
 */

import type { SpecialtyAnalysisResult, IfcQuantityData } from "./ifc-specialty-analyzer";

// ============================================================
// Types
// ============================================================

export type FieldConfidenceLevel = "high" | "medium" | "low";
export type ResolvedSource = "ifc-pset" | "ifc-quantity" | "ifc-property" | "computed";

export interface ResolvedField {
  field: string;
  value: unknown;
  source: ResolvedSource;
  confidence: FieldConfidenceLevel;
  detail: string;
}

export interface SpatialResolutionResult {
  /** Dot-notation field → value map, ready for deepMerge */
  fields: Record<string, unknown>;
  /** Every field resolved from IFC mappings */
  resolved: ResolvedField[];
  /** Derived spatial relationships */
  computed: ResolvedField[];
  /** Stats */
  stats: {
    fromIfc: number;
    computed: number;
    skipped: number;
    durationMs: number;
  };
}

/** Minimal ifcMapping shape consumed from field-mappings.json */
export interface IfcMappingSpec {
  entityType?: string;
  entity?: string; // alias for entityType used in some files
  filter?: Record<string, unknown>;
  property?: string;
  propertyName?: string; // alias used in basic parser mappings
  pset?: string;
  propertySet?: string; // alias
  psetProperty?: string;
  method?: string;
  transform?: string;
}

/** Minimal field mapping shape — only what we need */
export interface SpatialFieldMapping {
  field: string;
  ifcMapping?: IfcMappingSpec;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// ============================================================
// Entity Index — pre-indexed for fast lookups
// ============================================================

export class EntityIndex {
  private byType = new Map<string, IfcQuantityData[]>();

  constructor(quantities: IfcQuantityData[]) {
    for (const entity of quantities) {
      const key = entity.entityType.toUpperCase();
      let arr = this.byType.get(key);
      if (!arr) {
        arr = [];
        this.byType.set(key, arr);
      }
      arr.push(entity);
    }
  }

  getByType(type: string): IfcQuantityData[] {
    // Normalize: accept "IfcDoor", "IFCDOOR", "IFC_DOOR"
    const normalized = type.toUpperCase().replace(/^IFC/, "IFC");
    return this.byType.get(normalized) || [];
  }

  getAllQuantities(): IfcQuantityData[] {
    const all: IfcQuantityData[] = [];
    for (const arr of this.byType.values()) {
      all.push(...arr);
    }
    return all;
  }
}

// ============================================================
// Filter Matching
// ============================================================

/**
 * Check if an IFC entity matches a filter specification.
 * Supports wildcards, booleans, comparisons, nested paths, AND logic.
 */
export function matchesFilter(
  entity: IfcQuantityData,
  filter: Record<string, unknown>
): boolean {
  for (const [key, pattern] of Object.entries(filter)) {
    const value = resolveEntityFieldValue(entity, key);

    // Wildcard string matching: "*corredor*"
    if (typeof pattern === "string" && pattern.includes("*")) {
      const regexStr = "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, (m) =>
        m === "*" ? ".*" : "\\" + m
      ) + "$";
      const regex = new RegExp(regexStr, "i");
      if (!regex.test(String(value ?? ""))) return false;
      continue;
    }

    // Comparison operators: "< 0", ">= 9.0", "== 5"
    if (typeof pattern === "string" && /^[<>=!]+\s*[\d.-]/.test(pattern)) {
      const match = pattern.match(/^([<>=!]+)\s*(.+)$/);
      if (match) {
        const [, operator, threshold] = match;
        const numValue = Number(value);
        const numThreshold = Number(threshold);
        if (isNaN(numValue) || isNaN(numThreshold)) return false;
        switch (operator) {
          case "<":  if (!(numValue < numThreshold)) return false; break;
          case "<=": if (!(numValue <= numThreshold)) return false; break;
          case ">":  if (!(numValue > numThreshold)) return false; break;
          case ">=": if (!(numValue >= numThreshold)) return false; break;
          case "==": if (numValue !== numThreshold) return false; break;
          case "!=": if (numValue === numThreshold) return false; break;
          default: return false;
        }
        continue;
      }
    }

    // Boolean matching
    if (typeof pattern === "boolean") {
      const boolVal = value === true || value === "true" || value === "TRUE" || value === 1;
      if (boolVal !== pattern) return false;
      continue;
    }

    // Number matching
    if (typeof pattern === "number") {
      if (Number(value) !== pattern) return false;
      continue;
    }

    // Exact string matching (case-insensitive)
    if (typeof pattern === "string") {
      if (String(value ?? "").toLowerCase() !== pattern.toLowerCase()) return false;
      continue;
    }

    // If we can't match the pattern type, fail
    return false;
  }
  return true;
}

/**
 * Resolve a field value from an entity, supporting nested paths.
 * Searches: name, properties, propertySetData, quantities
 */
function resolveEntityFieldValue(
  entity: IfcQuantityData,
  path: string
): unknown {
  // Direct name match
  if (path === "Name" || path === "name") return entity.name;
  if (path === "LongName") return entity.properties["LongName"] ?? entity.name;

  // Check flat properties first (most common)
  if (path in entity.properties) return entity.properties[path];

  // Check quantities
  const qKey = path.toLowerCase() as keyof typeof entity.quantities;
  if (qKey in entity.quantities) return entity.quantities[qKey];

  // Nested path: "Space.ObjectType" or "Pset_DoorCommon.FireRating"
  if (path.includes(".")) {
    const parts = path.split(".");

    // Try propertySetData first
    if (parts.length === 2) {
      const psetData = entity.propertySetData?.[parts[0]];
      if (psetData && parts[1] in psetData) return psetData[parts[1]];
    }

    // Try nested properties
    let current: unknown = entity.properties;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  // Case-insensitive property search
  const lowerPath = path.toLowerCase();
  for (const [key, val] of Object.entries(entity.properties)) {
    if (key.toLowerCase() === lowerPath) return val;
  }

  // Search across all property sets
  for (const psetData of Object.values(entity.propertySetData ?? {})) {
    if (path in psetData) return psetData[path];
    for (const [key, val] of Object.entries(psetData)) {
      if (key.toLowerCase() === lowerPath) return val;
    }
  }

  return undefined;
}

// ============================================================
// Property Resolution
// ============================================================

interface PropertySpec {
  pset?: string;
  propertySet?: string;
  psetProperty?: string;
  property?: string;
  propertyName?: string;
}

interface PropertyResult {
  value: unknown;
  source: ResolvedSource;
}

/**
 * Resolve a property value from an entity using the mapping specification.
 * Priority: pset+psetProperty > property path > quantity key > flat property
 */
export function resolveEntityProperty(
  entity: IfcQuantityData,
  spec: PropertySpec
): PropertyResult | undefined {
  const pset = spec.pset || spec.propertySet;
  const psetProp = spec.psetProperty;
  const property = spec.property || spec.propertyName;

  // 1. PropertySet-based (highest confidence)
  if (pset && psetProp) {
    const psetData = entity.propertySetData?.[pset];
    if (psetData && psetProp in psetData) {
      return { value: psetData[psetProp], source: "ifc-pset" };
    }
    // Try case-insensitive pset name match
    for (const [name, data] of Object.entries(entity.propertySetData ?? {})) {
      if (name.toLowerCase() === pset.toLowerCase() && psetProp in data) {
        return { value: data[psetProp], source: "ifc-pset" };
      }
    }
  }

  // 2. PropertySet value without specific psetProperty (e.g. pset="Qto_BuildingBaseQuantities", property="GrossFloorArea")
  if (pset && property && !psetProp) {
    const psetData = entity.propertySetData?.[pset];
    if (psetData && property in psetData) {
      return { value: psetData[property], source: "ifc-pset" };
    }
    for (const [name, data] of Object.entries(entity.propertySetData ?? {})) {
      if (name.toLowerCase() === pset.toLowerCase() && property in data) {
        return { value: data[property], source: "ifc-pset" };
      }
    }
  }

  if (!property) return undefined;

  // 3. Nested property path: "Dimensions.Width"
  if (property.includes(".")) {
    const val = resolveEntityFieldValue(entity, property);
    if (val !== undefined) return { value: val, source: "ifc-property" };
  }

  // 4. Quantity key match
  const quantityKeys = ["width", "height", "area", "volume", "length", "depth", "thickness", "weight"] as const;
  const propLower = property.toLowerCase();
  // Exact quantity key match first
  for (const qKey of quantityKeys) {
    if (propLower === qKey || propLower === `overall${qKey}`) {
      const val = entity.quantities[qKey];
      if (val !== undefined && val > 0) return { value: val, source: "ifc-quantity" };
    }
  }
  // Fuzzy: property name contains a quantity key
  for (const qKey of quantityKeys) {
    if (propLower.includes(qKey)) {
      const val = entity.quantities[qKey];
      if (val !== undefined && val > 0) return { value: val, source: "ifc-quantity" };
    }
  }

  // 5. Flat properties (exact, then case-insensitive)
  if (property in entity.properties) {
    return { value: entity.properties[property], source: "ifc-property" };
  }
  for (const [key, val] of Object.entries(entity.properties)) {
    if (key.toLowerCase() === propLower) {
      return { value: val, source: "ifc-property" };
    }
  }

  // 6. Search all property sets for the property
  for (const psetData of Object.values(entity.propertySetData ?? {})) {
    if (property in psetData) {
      return { value: psetData[property], source: "ifc-pset" };
    }
  }

  return undefined;
}

// ============================================================
// Aggregation
// ============================================================

/**
 * Aggregate values from multiple entities using the specified method.
 */
export function aggregate(
  entities: IfcQuantityData[],
  values: unknown[],
  method: string | undefined
): unknown {
  if (method === "count") return entities.length;

  // For methods that don't require numeric aggregation, return first non-null value
  if (!method) {
    const first = values.find(v => v !== undefined && v !== null);
    return first;
  }

  const numericValues = values
    .map(v => typeof v === "string" ? parseFloat(v) : v)
    .filter((v): v is number => typeof v === "number" && !isNaN(v) && v > 0);

  if (numericValues.length === 0) return undefined;

  switch (method) {
    case "minValue":
      return Math.min(...numericValues);
    case "maxValue":
      return Math.max(...numericValues);
    case "sum":
    case "sumArea":
      return numericValues.reduce((a, b) => a + b, 0);
    case "average":
      return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    case "sumByZone": {
      // Group by storey, sum per zone, return total
      const byZone: Record<string, number> = {};
      for (let i = 0; i < entities.length; i++) {
        const zone = entities[i].storey || "default";
        byZone[zone] = (byZone[zone] || 0) + (numericValues[i] || 0);
      }
      return Object.values(byZone).reduce((a, b) => a + b, 0);
    }
    case "countPerFacade": {
      const byDir: Record<string, number> = {};
      for (const entity of entities) {
        const dir = String(
          entity.properties.Orientation ||
          entity.properties.FacadeOrientation ||
          "unknown"
        ).toLowerCase();
        byDir[dir] = (byDir[dir] || 0) + 1;
      }
      return byDir;
    }
    default:
      // Unknown method — return first numeric value
      return numericValues.length > 0 ? numericValues[0] : undefined;
  }
}

// ============================================================
// Space Pattern Matching (Portuguese + English)
// ============================================================

const SPACE_PATTERNS: Record<string, string[]> = {
  bedroom:   ["quarto", "bedroom", "suite", "dormit"],
  bathroom:  ["wc", "banho", "bathroom", "toilet", "sanitár", "i.s."],
  kitchen:   ["cozinha", "kitchen"],
  living:    ["sala", "living", "estar"],
  corridor:  ["corredor", "corridor", "hallway", "circulação"],
  garage:    ["garagem", "garage", "parking", "estacion"],
  storage:   ["arrumo", "storage", "despensa", "pantry"],
  laundry:   ["lavandaria", "laundry"],
  lobby:     ["hall", "lobby", "entrada", "vestíbulo", "átrio", "entry"],
};

function spaceMatchesType(space: IfcQuantityData, type: string): boolean {
  const patterns = SPACE_PATTERNS[type];
  if (!patterns) return false;
  const name = space.name.toLowerCase();
  const longName = String(space.properties.LongName ?? "").toLowerCase();
  const objectType = String(space.properties.ObjectType ?? "").toLowerCase();
  return patterns.some(p => name.includes(p) || longName.includes(p) || objectType.includes(p));
}

function getSpaceArea(space: IfcQuantityData): number | undefined {
  const net = space.properties["NetFloorArea"] as number | undefined;
  if (net && net > 0) return net;
  const gross = space.properties["GrossFloorArea"] as number | undefined;
  if (gross && gross > 0) return gross;
  if (space.quantities.area && space.quantities.area > 0) return space.quantities.area;
  return undefined;
}

// ============================================================
// Computed Spatial Relationships
// ============================================================

// ============================================================
// Computed → Rule Field Bridge
// ============================================================
// Maps computed spatial values to the field paths that rules actually check.
// Only fills gaps — if ifcMapping already resolved a value, the bridge doesn't overwrite.

const COMPUTED_TO_RULE_FIELDS: [string, string[]][] = [
  // Room areas (RGEU compliance)
  ["computed.minBedroomArea",     ["general.bedroomArea"]],
  ["computed.maxBedroomArea",     ["general.mainBedroomArea", "architecture.mainBedroomArea"]],
  ["computed.minBathroomArea",    ["general.wcArea", "architecture.bathroomArea"]],
  ["computed.minKitchenArea",     ["general.kitchenArea", "architecture.kitchenArea"]],
  ["computed.minLivingArea",      ["general.livingRoomArea", "architecture.livingRoomArea"]],
  ["computed.minStorageArea",     ["general.storageArea", "general.pantryArea"]],
  // Room widths
  ["computed.minBedroomWidth",    ["general.bedroomWidth", "general.mainBedroomWidth"]],
  ["computed.minKitchenWidth",    ["general.kitchenWidth"]],
  ["computed.minBathroomWidth",   ["general.wcWidth"]],
  ["computed.minLivingWidth",     ["general.livingRoomWidth"]],
  // Room counts
  ["computed.bedroomCount",       ["general.numBedrooms", "architecture.numberOfBedrooms"]],
  ["computed.bathroomCount",      ["general.numBathrooms", "architecture.numberOfBathrooms"]],
  // Widths — corridors, doors
  ["computed.minCorridorWidth",   ["general.corridorWidth", "general.commonCorridorWidth", "accessibility.corridorWidths"]],
  ["computed.minDoorWidth",       ["general.interiorDoorWidth", "accessibility.doorWidths"]],
  // Heights
  ["computed.minCeilingHeight",   ["architecture.ceilingHeight", "general.nonHabitableHeight", "acoustic.ceilingHeight"]],
  // Building-level derived
  ["computed.numberOfFloors",     ["general.floorsAboveGround", "architecture.numberOfFloors"]],
  ["computed.buildingHeight",     ["fireSafety.buildingHeight", "architecture.buildingHeight"]],
  ["computed.grossFloorArea",     ["architecture.grossFloorArea"]],
  // Areas — building level
  ["computed.totalUsableArea",    ["architecture.totalUsableArea", "general.totalDwellingArea"]],
  ["computed.maxCompartmentArea", ["fireSafety.compartmentArea"]],
  // Typology inference
  ["computed.typology",           ["general.typology", "architecture.typology"]],
  ["computed.isMultifamily",      ["general.isMultifamily", "architecture.isMultifamily"]],
  // Fire safety derived
  ["computed.occupantLoad",       ["fireSafety.occupantLoad"]],
  ["computed.riskCategory",       ["fireSafety.riskCategory"]],
  // Envelope
  ["computed.windowToWallRatio",  ["envelope.windowToWallRatio"]],
  ["computed.windowToFloorRatio", ["envelope.windowToFloorRatio"]],
  ["computed.totalWindowArea",    ["envelope.windowArea"]],
  ["computed.totalExtWallArea",   ["envelope.externalWallArea"]],
  // Garage
  ["computed.minGarageArea",      ["architecture.garageArea"]],
  ["computed.minGarageHeight",    ["general.garageHeight", "architecture.garageCeilingHeight"]],
  // Stair dimensions
  ["computed.minStairWidth",      ["general.stairWidth", "general.commonStairWidth", "accessibility.stairWidth", "architecture.commonStairWidth"]],
  ["computed.stairRiserHeight",   ["general.stairRiserHeight", "accessibility.stairRiserHeight"]],
  ["computed.stairTreadDepth",    ["general.stairTreadDepth", "accessibility.stairTreadDepth"]],
  // Ramp dimensions
  ["computed.rampSlope",          ["general.accessRampSlope", "general.accessibleRampSlope", "accessibility.rampGradient"]],
  ["computed.minRampWidth",       ["accessibility.rampWidth"]],
  // Acoustic from spaces
  ["computed.minRoomVolume",      ["acoustic.roomVolume"]],
  // Lobby / entry
  ["computed.minLobbyArea",       ["architecture.entranceLobbyArea", "architecture.entryHallArea"]],
  // Guard rails
  ["computed.guardRailHeight",    ["general.guardRailHeight", "architecture.balconyGuardHeight"]],
  // Floor counts
  ["computed.floorsBelowGround",  ["general.floorsBelowGround"]],
];

function computeSpatialRelationships(index: EntityIndex): ResolvedField[] {
  const computed: ResolvedField[] = [];
  const spaces = index.getByType("IFCSPACE");
  const doors = index.getByType("IFCDOOR");
  const windows = index.getByType("IFCWINDOW");
  const walls = index.getByType("IFCWALL");
  const stairs = index.getByType("IFCSTAIRFLIGHT");
  const ramps = index.getByType("IFCRAMP");
  const rampFlights = index.getByType("IFCRAMPFLIGHT");
  const storeys = index.getByType("IFCBUILDINGSTOREY");
  const buildings = index.getByType("IFCBUILDING");
  const railings = index.getByType("IFCRAILING");

  // Helper to add a computed field
  function add(field: string, value: unknown, detail: string) {
    if (value === undefined || value === null) return;
    if (typeof value === "number" && (isNaN(value) || !isFinite(value))) return;
    computed.push({
      field,
      value: typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
      source: "computed",
      confidence: "medium",
      detail,
    });
  }

  // --- Window-to-wall ratio ---
  const externalWalls = walls.filter(w =>
    w.properties.IsExternal === true ||
    w.properties._isExternal === true ||
    w.propertySetData?.["Pset_WallCommon"]?.IsExternal === true
  );
  const totalWindowArea = windows.reduce((s, w) => s + (w.quantities.area || 0), 0);
  const totalExtWallArea = externalWalls.reduce((s, w) => s + (w.quantities.area || 0), 0);
  if (totalExtWallArea > 0 && totalWindowArea > 0) {
    add("computed.windowToWallRatio", (totalWindowArea / totalExtWallArea) * 100,
      `${totalWindowArea.toFixed(1)}m² windows / ${totalExtWallArea.toFixed(1)}m² ext walls`);
  }
  if (totalWindowArea > 0) {
    add("computed.totalWindowArea", totalWindowArea, `total window area`);
  }
  if (totalExtWallArea > 0) {
    add("computed.totalExtWallArea", totalExtWallArea, `total external wall area`);
  }

  // --- Room counts by type ---
  for (const [type, _patterns] of Object.entries(SPACE_PATTERNS)) {
    const matching = spaces.filter(s => spaceMatchesType(s, type));
    if (matching.length > 0) {
      add(`computed.${type}Count`, matching.length, `${matching.length} ${type} spaces found`);
    }
  }

  // --- Min/max areas AND widths by space type ---
  for (const type of ["bedroom", "bathroom", "kitchen", "living", "corridor", "storage", "lobby"]) {
    const matching = spaces.filter(s => spaceMatchesType(s, type));
    const areas = matching.map(s => getSpaceArea(s)).filter((a): a is number => a !== undefined);
    if (areas.length > 0) {
      add(`computed.min${capitalize(type)}Area`, Math.min(...areas),
        `min area across ${areas.length} ${type}(s)`);
      if (areas.length > 1) {
        add(`computed.max${capitalize(type)}Area`, Math.max(...areas),
          `max area across ${areas.length} ${type}(s)`);
      }
    }
    // Extract widths for rooms that have them
    const widths = matching
      .map(s => s.quantities.width)
      .filter((w): w is number => w !== undefined && w > 0);
    if (widths.length > 0) {
      add(`computed.min${capitalize(type)}Width`, Math.min(...widths),
        `min width across ${widths.length} ${type}(s)`);
    }
  }

  // --- Min corridor width (also covered above, but explicit for clarity) ---
  const corridors = spaces.filter(s => spaceMatchesType(s, "corridor"));
  const corridorWidths = corridors
    .map(c => c.quantities.width)
    .filter((w): w is number => w !== undefined && w > 0);
  if (corridorWidths.length > 0) {
    add("computed.minCorridorWidth", Math.min(...corridorWidths),
      `min width across ${corridorWidths.length} corridors`);
  }

  // --- Min door width ---
  const doorWidths = doors
    .map(d => d.quantities.width)
    .filter((w): w is number => w !== undefined && w > 0);
  if (doorWidths.length > 0) {
    add("computed.minDoorWidth", Math.min(...doorWidths),
      `min width across ${doorWidths.length} doors`);
  }

  // --- Min ceiling height ---
  const spaceHeights = spaces
    .map(s => s.quantities.height || (s.propertySetData?.["Pset_SpaceCommon"]?.Height as number))
    .filter((h): h is number => h !== undefined && h > 0 && h < 20);
  if (spaceHeights.length > 0) {
    add("computed.minCeilingHeight", Math.min(...spaceHeights),
      `min height across ${spaceHeights.length} spaces`);
  }

  // --- Total usable area ---
  const spaceAreas = spaces.map(s => getSpaceArea(s)).filter((a): a is number => a !== undefined);
  if (spaceAreas.length > 0) {
    add("computed.totalUsableArea", spaceAreas.reduce((a, b) => a + b, 0),
      `sum of ${spaceAreas.length} space areas`);
  }

  // --- Max compartment area (fire safety) ---
  if (spaceAreas.length > 0) {
    add("computed.maxCompartmentArea", Math.max(...spaceAreas),
      `largest space area for fire compartmentation`);
  }

  // --- Stair dimensions ---
  const allStairs = [...stairs, ...rampFlights.length === 0 ? [] : []]; // just stair flights
  if (allStairs.length > 0) {
    const stairWidths = allStairs
      .map(s => s.quantities.width)
      .filter((w): w is number => w !== undefined && w > 0);
    if (stairWidths.length > 0) {
      add("computed.minStairWidth", Math.min(...stairWidths),
        `min width across ${stairWidths.length} stair flights`);
    }
    // Riser height from property sets
    const riserHeights = allStairs
      .map(s =>
        s.propertySetData?.["Pset_StairFlightCommon"]?.RiserHeight as number ??
        s.properties.RiserHeight as number
      )
      .filter((h): h is number => h !== undefined && h > 0 && h < 0.5);
    if (riserHeights.length > 0) {
      add("computed.stairRiserHeight", Math.max(...riserHeights),
        `max riser height across ${riserHeights.length} stair flights`);
    }
    // Tread depth
    const treadDepths = allStairs
      .map(s =>
        s.propertySetData?.["Pset_StairFlightCommon"]?.TreadLength as number ??
        s.properties.TreadLength as number
      )
      .filter((d): d is number => d !== undefined && d > 0 && d < 1);
    if (treadDepths.length > 0) {
      add("computed.stairTreadDepth", Math.min(...treadDepths),
        `min tread depth across ${treadDepths.length} stair flights`);
    }
  }

  // --- Ramp dimensions ---
  const allRamps = [...ramps, ...rampFlights];
  if (allRamps.length > 0) {
    // Slope from property set
    const slopes = allRamps
      .map(r =>
        r.propertySetData?.["Pset_RampCommon"]?.Slope as number ??
        r.propertySetData?.["Pset_RampFlightCommon"]?.Slope as number ??
        r.properties.Slope as number
      )
      .filter((s): s is number => s !== undefined && s > 0 && s < 1);
    if (slopes.length > 0) {
      add("computed.rampSlope", Math.max(...slopes),
        `max slope across ${slopes.length} ramps`);
    }
    // Width
    const rampWidths = allRamps
      .map(r => r.quantities.width)
      .filter((w): w is number => w !== undefined && w > 0);
    if (rampWidths.length > 0) {
      add("computed.minRampWidth", Math.min(...rampWidths),
        `min width across ${rampWidths.length} ramps`);
    }
  }

  // --- Natural light ratio (min window/floor per habitable room) ---
  const habitableTypes = ["bedroom", "living", "kitchen"];
  const lightRatios: number[] = [];
  for (const type of habitableTypes) {
    const matching = spaces.filter(s => spaceMatchesType(s, type));
    for (const space of matching) {
      const floorArea = getSpaceArea(space);
      if (!floorArea || floorArea <= 0) continue;
      const spaceWindows = windows.filter(w => w.storey === space.storey);
      const habitableOnStorey = spaces.filter(s =>
        s.storey === space.storey && habitableTypes.some(t => spaceMatchesType(s, t))
      ).length || 1;
      const storeyWindowArea = spaceWindows.reduce((s, w) => s + (w.quantities.area || 0), 0);
      const approxRoomWindowArea = storeyWindowArea / habitableOnStorey;
      if (approxRoomWindowArea > 0) {
        lightRatios.push(approxRoomWindowArea / floorArea);
      }
    }
  }
  if (lightRatios.length > 0) {
    add("computed.naturalLightRatioMin", Math.min(...lightRatios),
      `min(window area / floor area) across ${lightRatios.length} habitable rooms`);
  }

  // --- Number of floors (from IFCBUILDINGSTOREY) ---
  if (storeys.length > 0) {
    // Count floors above ground (elevation >= 0 or no elevation data)
    const aboveGround = storeys.filter(s => {
      const elev = s.properties.Elevation ?? s.properties.elevation;
      if (elev === undefined) return true; // assume above ground
      return Number(elev) >= 0;
    });
    const belowGround = storeys.length - aboveGround.length;
    add("computed.numberOfFloors", aboveGround.length,
      `${aboveGround.length} storeys above ground from ${storeys.length} total`);
    if (belowGround > 0) {
      add("computed.floorsBelowGround", belowGround,
        `${belowGround} storeys below ground`);
    }
  }

  // --- Building height (from storey elevations) ---
  if (storeys.length > 1) {
    const elevations = storeys
      .map(s => Number(s.properties.Elevation ?? s.properties.elevation ?? 0))
      .filter(e => !isNaN(e));
    if (elevations.length > 1) {
      const maxElev = Math.max(...elevations);
      const minElev = Math.min(...elevations);
      // Approximate: highest storey + typical floor height (3m)
      const height = maxElev - minElev + 3.0;
      add("computed.buildingHeight", height,
        `derived from storey elevations: ${minElev.toFixed(1)}m to ${maxElev.toFixed(1)}m + 3m`);
    }
  }
  // Also check IFCBUILDING for direct height
  if (buildings.length > 0) {
    for (const building of buildings) {
      const qtoHeight = building.propertySetData?.["Qto_BuildingBaseQuantities"]?.Height as number;
      if (qtoHeight && qtoHeight > 0) {
        add("computed.buildingHeight", qtoHeight, `from Qto_BuildingBaseQuantities.Height`);
        break;
      }
    }
  }

  // --- Gross floor area (from IFCBUILDING base quantities) ---
  if (buildings.length > 0) {
    for (const building of buildings) {
      const gfa = building.propertySetData?.["Qto_BuildingBaseQuantities"]?.GrossFloorArea as number;
      if (gfa && gfa > 0) {
        add("computed.grossFloorArea", gfa, `from Qto_BuildingBaseQuantities.GrossFloorArea`);
        break;
      }
    }
  }
  // Fallback: sum storey gross areas
  if (!computed.find(c => c.field === "computed.grossFloorArea") && storeys.length > 0) {
    const storeyAreas = storeys
      .map(s => {
        const qto = s.propertySetData?.["Qto_BuildingStoreyBaseQuantities"]?.GrossFloorArea as number;
        return qto ?? s.quantities.area ?? 0;
      })
      .filter(a => a > 0);
    if (storeyAreas.length > 0) {
      const total = storeyAreas.reduce((a, b) => a + b, 0);
      add("computed.grossFloorArea", total,
        `sum of ${storeyAreas.length} storey gross floor areas`);
    }
  }

  // --- Window-to-floor ratio ---
  const totalUsable = spaceAreas.length > 0 ? spaceAreas.reduce((a, b) => a + b, 0) : 0;
  if (totalWindowArea > 0 && totalUsable > 0) {
    add("computed.windowToFloorRatio", (totalWindowArea / totalUsable) * 100,
      `${totalWindowArea.toFixed(1)}m² windows / ${totalUsable.toFixed(1)}m² usable area`);
  }

  // --- Typology inference (T0-T5 from bedroom count) ---
  const bedroomEntry = computed.find(c => c.field === "computed.bedroomCount");
  if (bedroomEntry && typeof bedroomEntry.value === "number") {
    const count = bedroomEntry.value;
    const typology = `T${Math.min(count, 9)}`;
    add("computed.typology", typology, `inferred from ${count} bedroom(s)`);
    // Multi-family: more than 1 dwelling = multi-family, but we can't detect
    // dwelling count from IFC reliably, so leave to manual or zone detection
  }

  // --- Occupant load (gross area × occupancy index) ---
  const gfaEntry = computed.find(c => c.field === "computed.grossFloorArea");
  if (gfaEntry && typeof gfaEntry.value === "number") {
    // Default occupancy index for residential UT-I: 0.02 persons/m²
    const occupancyIndex = 0.02;
    const occupantLoad = Math.ceil(gfaEntry.value as number * occupancyIndex);
    if (occupantLoad > 0) {
      add("computed.occupantLoad", occupantLoad,
        `${gfaEntry.value}m² × ${occupancyIndex} persons/m²`);
    }
  }

  // --- Fire safety risk category (DL 220/2008 simplified matrix) ---
  const heightEntry = computed.find(c => c.field === "computed.buildingHeight");
  const floorsEntry = computed.find(c => c.field === "computed.numberOfFloors");
  if (heightEntry && typeof heightEntry.value === "number") {
    const riskCat = classifyFireRiskCategory(
      heightEntry.value as number,
      floorsEntry ? (floorsEntry.value as number) : undefined
    );
    add("computed.riskCategory", riskCat,
      `DL 220/2008 UT-I: height=${heightEntry.value}m, floors=${floorsEntry?.value ?? "?"}`);
  }

  // --- Garage spaces ---
  const garages = spaces.filter(s => spaceMatchesType(s, "garage"));
  if (garages.length > 0) {
    const garageAreas = garages.map(s => getSpaceArea(s)).filter((a): a is number => a !== undefined);
    if (garageAreas.length > 0) {
      add("computed.minGarageArea", Math.min(...garageAreas),
        `min area across ${garageAreas.length} garage/parking spaces`);
    }
    const garageHeights = garages
      .map(s => s.quantities.height || (s.propertySetData?.["Pset_SpaceCommon"]?.Height as number))
      .filter((h): h is number => h !== undefined && h > 0);
    if (garageHeights.length > 0) {
      add("computed.minGarageHeight", Math.min(...garageHeights),
        `min height across ${garageHeights.length} garage spaces`);
    }
  }

  // --- Room volumes (for acoustic) ---
  const roomVolumes = spaces
    .map(s => {
      const vol = s.properties.Volume ?? s.propertySetData?.["Qto_SpaceBaseQuantities"]?.GrossVolume;
      return typeof vol === "number" ? vol : undefined;
    })
    .filter((v): v is number => v !== undefined && v > 0);
  if (roomVolumes.length > 0) {
    add("computed.minRoomVolume", Math.min(...roomVolumes),
      `min volume across ${roomVolumes.length} spaces`);
  }

  // --- Guard rail height ---
  if (railings.length > 0) {
    const railHeights = railings
      .map(r => r.quantities.height)
      .filter((h): h is number => h !== undefined && h > 0 && h < 3);
    if (railHeights.length > 0) {
      add("computed.guardRailHeight", Math.min(...railHeights),
        `min height across ${railHeights.length} railings`);
    }
  }

  return computed;
}

// ============================================================
// Fire Safety Risk Category — DL 220/2008 UT-I (Residential)
// ============================================================

/**
 * Classify fire risk category per DL 220/2008 for UT-I (residential).
 * Simplified matrix based on building height:
 *   1ª categoria: height ≤ 9m
 *   2ª categoria: 9m < height ≤ 28m
 *   3ª categoria: 28m < height ≤ 50m
 *   4ª categoria: height > 50m
 */
export function classifyFireRiskCategory(
  buildingHeight: number,
  numberOfFloors?: number
): string {
  // Use height-based classification (primary)
  if (buildingHeight <= 9) return "1";
  if (buildingHeight <= 28) return "2";
  if (buildingHeight <= 50) return "3";
  return "4";
}

/**
 * Bridge computed spatial fields to the rule field paths that regulations check.
 * Only fills gaps — fields already resolved from ifcMapping are not overwritten.
 */
function bridgeComputedToRuleFields(
  computedFields: ResolvedField[],
  existingFields: Record<string, unknown>
): ResolvedField[] {
  const bridged: ResolvedField[] = [];
  const computedMap = new Map(computedFields.map(f => [f.field, f]));

  for (const [computedPath, ruleFieldPaths] of COMPUTED_TO_RULE_FIELDS) {
    const source = computedMap.get(computedPath);
    if (!source) continue;

    for (const ruleField of ruleFieldPaths) {
      // Don't overwrite values already resolved from ifcMapping or hardcoded enrichment
      const existing = getDeepValue(existingFields, ruleField);
      if (existing !== undefined && existing !== null) continue;

      bridged.push({
        field: ruleField,
        value: source.value,
        source: "computed",
        confidence: "medium",
        detail: `bridged from ${computedPath}: ${source.detail}`,
      });
    }
  }

  return bridged;
}

function getDeepValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================
// Set Deep — set a value at a dot-notation path
// ============================================================

function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1];
  // Only set if not already defined (IFC enrichment has priority)
  if (current[lastKey] === undefined || current[lastKey] === null) {
    current[lastKey] = value;
  }
}

// ============================================================
// Main Resolver
// ============================================================

/**
 * Resolve spatial context from IFC analyses using field mappings.
 *
 * @param analyses - IFC specialty analysis results
 * @param mappings - Field mapping entries (from all plugins' field-mappings.json)
 * @returns Resolved fields, computed relationships, and stats
 */
export function resolveSpatialContext(
  analyses: SpecialtyAnalysisResult[],
  mappings: SpatialFieldMapping[]
): SpatialResolutionResult {
  const start = performance.now();
  const fields: Record<string, unknown> = {};
  const resolved: ResolvedField[] = [];
  let skipped = 0;

  // Build entity index from all analyses
  const allQuantities = analyses.flatMap(a => a.quantities);
  const index = new EntityIndex(allQuantities);

  // Process each field mapping with an ifcMapping
  for (const mapping of mappings) {
    if (!mapping.field || !mapping.ifcMapping) continue;

    const ifc = mapping.ifcMapping;
    const entityType = ifc.entityType || ifc.entity;

    // Must have an entity type or a pset-only mapping
    if (!entityType && !ifc.pset && !ifc.propertySet) {
      skipped++;
      continue;
    }

    // Find matching entities
    let entities: IfcQuantityData[];
    if (entityType) {
      entities = index.getByType(entityType);
    } else {
      entities = allQuantities;
    }

    // Apply filter
    if (ifc.filter && Object.keys(ifc.filter).length > 0) {
      entities = entities.filter(e => matchesFilter(e, ifc.filter!));
    }

    if (entities.length === 0) {
      skipped++;
      continue;
    }

    // Resolve property from each entity
    const method = ifc.method;
    let value: unknown;
    let source: ResolvedSource = "ifc-property";

    if (method === "count") {
      value = entities.length;
      source = "ifc-property";
    } else {
      // Extract property values from each entity
      const results = entities
        .map(e => resolveEntityProperty(e, {
          pset: ifc.pset || ifc.propertySet,
          psetProperty: ifc.psetProperty,
          property: ifc.property || ifc.propertyName,
        }))
        .filter((r): r is PropertyResult => r !== undefined);

      if (results.length === 0) {
        skipped++;
        continue;
      }

      source = results[0].source;
      const values = results.map(r => r.value);
      value = aggregate(entities, values, method);
    }

    if (value === undefined || value === null) {
      skipped++;
      continue;
    }

    // Apply transform
    if (ifc.transform === "parseFloat" && typeof value === "string") {
      value = parseFloat(value);
    } else if (ifc.transform === "boolean") {
      value = value === true || value === "true" || value === "TRUE" || value === 1;
    }

    // Round numbers
    if (typeof value === "number") {
      value = Math.round(value * 1000) / 1000;
    }

    // Set the field
    setDeep(fields, mapping.field, value);
    resolved.push({
      field: mapping.field,
      value,
      source,
      confidence: source === "ifc-pset" ? "high" : source === "ifc-quantity" ? "high" : "medium",
      detail: `${method || "first"}(${entityType || "all"}.${ifc.property || ifc.psetProperty || "count"}) across ${entities.length} entities`,
    });
  }

  // Compute spatial relationships
  const computedFields = computeSpatialRelationships(index);

  // Add computed fields to the output
  for (const cf of computedFields) {
    setDeep(fields, cf.field, cf.value);
  }

  // Bridge computed values to the rule field paths that regulations actually check
  const bridgedFields = bridgeComputedToRuleFields(computedFields, fields);
  for (const bf of bridgedFields) {
    setDeep(fields, bf.field, bf.value);
  }

  const allComputed = [...computedFields, ...bridgedFields];
  const durationMs = Math.round(performance.now() - start);

  return {
    fields,
    resolved,
    computed: allComputed,
    stats: {
      fromIfc: resolved.length,
      computed: computedFields.length,
      skipped,
      durationMs,
    },
  };
}

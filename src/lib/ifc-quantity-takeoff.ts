/**
 * IFC Quantity Takeoff Module
 *
 * Aggregates geometric data from parsed IFC elements into usable quantities
 * for cost estimation. Replaces heuristic-based estimates with measured values
 * extracted from the BIM model.
 *
 * Aggregation categories:
 *   - Walls: total area (m²), by external/internal
 *   - Slabs/Floors: total area (m²), by storey
 *   - Columns: total length (m), count
 *   - Beams: total length (m), count
 *   - Windows/Doors: total area (m²), count
 *   - Roofs: total area (m²)
 *   - Spaces/Rooms: total floor area (m²)
 *   - Stairs/Ramps: count, total length (m)
 *   - Curtain walls: total area (m²)
 */

import type { SpecialtyAnalysisResult, IfcQuantityData } from "./ifc-specialty-analyzer";

// ============================================================
// Types
// ============================================================

/** Aggregated quantity summary from IFC model. */
export interface IfcQuantitySummary {
  /** Total external wall area (m²) */
  externalWallArea: number;
  /** Total internal wall area (m²) */
  internalWallArea: number;
  /** Total wall area (m²) — external + internal */
  totalWallArea: number;

  /** Total slab/floor area (m²) */
  slabArea: number;
  /** Total roof area (m²) */
  roofArea: number;

  /** Total window area (m²) */
  windowArea: number;
  /** Window count */
  windowCount: number;
  /** Total door count */
  doorCount: number;

  /** Total column length (m) */
  columnLength: number;
  /** Column count */
  columnCount: number;

  /** Total beam length (m) */
  beamLength: number;
  /** Beam count */
  beamCount: number;

  /** Total usable floor area from spaces (m²) */
  spaceArea: number;

  /** Stair count */
  stairCount: number;
  /** Ramp count */
  rampCount: number;
  /** Ramp total length (m) */
  rampLength: number;

  /** Curtain wall area (m²) */
  curtainWallArea: number;

  /** Number of storeys detected */
  storeyCount: number;
  /** Storey names */
  storeys: string[];

  /** Total element count (all types) */
  totalElements: number;

  /** Per-element-type breakdown: { IFCWALL: { count, area, volume, length }, ... } */
  byType: Record<string, ElementTypeQuantity>;
}

/** Quantity summary for a single IFC element type. */
export interface ElementTypeQuantity {
  count: number;
  totalArea: number;
  totalVolume: number;
  totalLength: number;
}

// ============================================================
// Element Classification Helpers
// ============================================================

const WALL_TYPES = /^IFC(WALL|WALLSTANDARDCASE)$/i;
const SLAB_TYPES = /^IFC(SLAB|SLABELEMENTEDCASE)$/i;
const ROOF_TYPES = /^IFC(ROOF|ROOFSLAB)$/i;
const COLUMN_TYPES = /^IFC(COLUMN|COLUMNSTANDARDCASE)$/i;
const BEAM_TYPES = /^IFC(BEAM|BEAMSTANDARDCASE)$/i;
const WINDOW_TYPES = /^IFC(WINDOW|WINDOWSTANDARDCASE)$/i;
const DOOR_TYPES = /^IFC(DOOR|DOORSTANDARDCASE)$/i;
const SPACE_TYPES = /^IFCSPACE$/i;
const STAIR_TYPES = /^IFC(STAIRFLIGHT|STAIR)$/i;
const RAMP_TYPES = /^IFC(RAMPFLIGHT|RAMP)$/i;
const CURTAIN_WALL_TYPES = /^IFCCURTAINWALL$/i;

/** Check if element is an external wall using properties. */
function isExternalWall(el: IfcQuantityData): boolean {
  // Check propertySetData first (more reliable)
  const psetWall = el.propertySetData?.["Pset_WallCommon"];
  if (psetWall) {
    const isExternal = psetWall["IsExternal"];
    if (isExternal === true || isExternal === "True" || isExternal === "TRUE" || isExternal === 1) {
      return true;
    }
    if (isExternal === false || isExternal === "False" || isExternal === "FALSE" || isExternal === 0) {
      return false;
    }
  }

  // Check flat properties
  if (el.properties["IsExternal"] === true || el.properties["IsExternal"] === "True") {
    return true;
  }
  if (el.properties["IsExternal"] === false || el.properties["IsExternal"] === "False") {
    return false;
  }

  // Heuristic: name-based detection
  const name = el.name.toLowerCase();
  if (/exterior|external|fachada|externo/i.test(name)) return true;
  if (/interior|internal|interno|divisória/i.test(name)) return false;

  // Default: assume external if unknown (conservative for cost estimation)
  return true;
}

/** Get usable area from element — tries area, then falls back to width×length. */
function getElementArea(el: IfcQuantityData): number {
  if (el.quantities.area && el.quantities.area > 0) return el.quantities.area;
  if (el.quantities.width && el.quantities.length) {
    return el.quantities.width * el.quantities.length;
  }
  // For walls: height × length can give area
  if (el.quantities.height && el.quantities.length) {
    return el.quantities.height * el.quantities.length;
  }
  return 0;
}

/** Get usable length from element. */
function getElementLength(el: IfcQuantityData): number {
  if (el.quantities.length && el.quantities.length > 0) return el.quantities.length;
  // For columns, height can serve as length
  if (el.quantities.height && el.quantities.height > 0) return el.quantities.height;
  return 0;
}

// ============================================================
// Core Aggregation
// ============================================================

/**
 * Aggregate IFC element quantities from one or more specialty analysis results.
 * Returns a unified summary of all measured quantities in the model.
 */
export function aggregateIfcQuantities(
  analyses: SpecialtyAnalysisResult[],
): IfcQuantitySummary {
  const summary: IfcQuantitySummary = {
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

  // Deduplicate elements by globalId (multiple analyses may share elements)
  const seen = new Set<string>();
  const storeySet = new Set<string>();

  for (const analysis of analyses) {
    // Collect storeys
    for (const s of analysis.summary.storeys) {
      storeySet.add(s);
    }

    for (const el of analysis.quantities) {
      // Skip TYPE entities (they are definitions, not instances)
      if (/TYPE$/i.test(el.entityType)) continue;

      // Deduplicate by globalId
      const key = el.globalId || `${el.entityType}:${el.name}:${el.storey || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      summary.totalElements++;

      // Track storey
      if (el.storey) storeySet.add(el.storey);

      // Per-type aggregation
      const typeKey = el.entityType.toUpperCase();
      if (!summary.byType[typeKey]) {
        summary.byType[typeKey] = { count: 0, totalArea: 0, totalVolume: 0, totalLength: 0 };
      }
      const typeEntry = summary.byType[typeKey];
      typeEntry.count++;
      typeEntry.totalArea += getElementArea(el);
      typeEntry.totalVolume += el.quantities.volume || 0;
      typeEntry.totalLength += getElementLength(el);

      // Category-specific aggregation
      if (WALL_TYPES.test(el.entityType)) {
        const area = getElementArea(el);
        if (isExternalWall(el)) {
          summary.externalWallArea += area;
        } else {
          summary.internalWallArea += area;
        }
      } else if (SLAB_TYPES.test(el.entityType)) {
        summary.slabArea += getElementArea(el);
      } else if (ROOF_TYPES.test(el.entityType)) {
        summary.roofArea += getElementArea(el);
      } else if (COLUMN_TYPES.test(el.entityType)) {
        summary.columnCount++;
        summary.columnLength += getElementLength(el);
      } else if (BEAM_TYPES.test(el.entityType)) {
        summary.beamCount++;
        summary.beamLength += getElementLength(el);
      } else if (WINDOW_TYPES.test(el.entityType)) {
        summary.windowCount++;
        summary.windowArea += getElementArea(el);
      } else if (DOOR_TYPES.test(el.entityType)) {
        summary.doorCount++;
      } else if (SPACE_TYPES.test(el.entityType)) {
        summary.spaceArea += getElementArea(el);
      } else if (STAIR_TYPES.test(el.entityType)) {
        summary.stairCount++;
      } else if (RAMP_TYPES.test(el.entityType)) {
        summary.rampCount++;
        summary.rampLength += getElementLength(el);
      } else if (CURTAIN_WALL_TYPES.test(el.entityType)) {
        summary.curtainWallArea += getElementArea(el);
      }
    }
  }

  summary.totalWallArea = summary.externalWallArea + summary.internalWallArea;
  summary.storeys = Array.from(storeySet).sort();
  summary.storeyCount = storeySet.size;

  return summary;
}

// ============================================================
// Quantity Lookup for Cost Estimation
// ============================================================

/**
 * Lookup interface for cost estimation to query IFC-measured quantities.
 * Returns { quantity, source: "measured" } when data is available from the model,
 * or null when no IFC data covers this item (so heuristic can be used instead).
 */
export function lookupIfcQuantity(
  summary: IfcQuantitySummary,
  item: { unit: string; description: string; areas: string[] },
): { quantity: number; source: "measured" } | null {
  const desc = item.description.toLowerCase();
  const unit = item.unit;

  // ── m² items ──
  if (unit === "m2") {
    // Acoustic insulation (internal walls) — check before generic wall patterns
    if (item.areas.includes("acoustic") && summary.internalWallArea > 0) {
      return { quantity: round2(summary.internalWallArea), source: "measured" };
    }

    // Internal wall items — check before generic wall patterns
    if (/parede.*interior|internal.*wall|divisória/i.test(desc)) {
      if (summary.internalWallArea > 0) {
        return { quantity: round2(summary.internalWallArea), source: "measured" };
      }
    }

    // External wall items (thermal insulation, facades, ETICS)
    if (/parede|fachada|ETICS|capoto|revestimento.*exterior/i.test(desc)) {
      if (summary.externalWallArea > 0) {
        return { quantity: round2(summary.externalWallArea), source: "measured" };
      }
    }

    // Roof items
    if (/cobertura|roof|telhado/i.test(desc)) {
      if (summary.roofArea > 0) {
        return { quantity: round2(summary.roofArea), source: "measured" };
      }
    }

    // Floor/slab items
    if (/pavimento|floor|laje|piso/i.test(desc)) {
      if (summary.slabArea > 0) {
        return { quantity: round2(summary.slabArea), source: "measured" };
      }
    }

    // Window/glazing items
    if (/janela|envidraçado|window|vidro|caixilh/i.test(desc)) {
      if (summary.windowArea > 0) {
        return { quantity: round2(summary.windowArea), source: "measured" };
      }
    }

    // Sprinkler/fire protection (use total floor area)
    if (/sprinkler|proteção.*passiva|intumescente/i.test(desc)) {
      if (summary.slabArea > 0) {
        return { quantity: round2(summary.slabArea), source: "measured" };
      }
    }

    // Curtain wall
    if (/cortina|curtain/i.test(desc)) {
      if (summary.curtainWallArea > 0) {
        return { quantity: round2(summary.curtainWallArea), source: "measured" };
      }
    }

    // Radon protection (ground floor slab area)
    if (/radão|radon/i.test(desc)) {
      if (summary.slabArea > 0 && summary.storeyCount > 0) {
        // Estimate ground floor as total slab / storeys
        return { quantity: round2(summary.slabArea / summary.storeyCount), source: "measured" };
      }
    }

    // Generic area fallback: use total floor area from spaces if available
    if (summary.spaceArea > 0) {
      return { quantity: round2(summary.spaceArea), source: "measured" };
    }
    if (summary.slabArea > 0) {
      return { quantity: round2(summary.slabArea), source: "measured" };
    }
  }

  // ── m items (linear) ──
  if (unit === "m") {
    // Thermal bridge treatment (perimeter-based)
    if (/ponte.*térmica/i.test(desc)) {
      // Perimeter estimate: windows perimeter + floor/wall junctions
      if (summary.windowCount > 0 && summary.windowArea > 0) {
        const avgWindowPerimeter = Math.sqrt(summary.windowArea / summary.windowCount) * 4;
        const windowPerimeters = avgWindowPerimeter * summary.windowCount;
        // Add floor/wall junction: approximate building perimeter × storeys
        const buildingPerimeter = summary.slabArea > 0
          ? Math.sqrt(summary.slabArea / Math.max(1, summary.storeyCount)) * 4
          : 0;
        const junctions = buildingPerimeter * summary.storeyCount;
        return { quantity: round2(windowPerimeters + junctions), source: "measured" };
      }
    }

    // Ramp items
    if (/rampa/i.test(desc)) {
      if (summary.rampLength > 0) {
        return { quantity: round2(summary.rampLength), source: "measured" };
      }
    }

    // Column reinforcement (use column total length)
    if (/pilar|column/i.test(desc) && item.areas.includes("structural")) {
      if (summary.columnLength > 0) {
        return { quantity: round2(summary.columnLength), source: "measured" };
      }
    }

    // Beam items
    if (/viga|beam/i.test(desc) && item.areas.includes("structural")) {
      if (summary.beamLength > 0) {
        return { quantity: round2(summary.beamLength), source: "measured" };
      }
    }

    // Foundation underpinning (use building perimeter)
    if (/recalçamento|underpinning|fundação/i.test(desc)) {
      if (summary.slabArea > 0 && summary.storeyCount > 0) {
        const groundFloorArea = summary.slabArea / summary.storeyCount;
        const perimeter = Math.sqrt(groundFloorArea) * 4;
        return { quantity: round2(perimeter), source: "measured" };
      }
    }
  }

  // ── Ud items (unit count) ──
  if (unit === "Ud") {
    // Smoke detectors (~1 per 60m² per floor)
    if (/detetor.*fumo/i.test(desc) && summary.slabArea > 0) {
      const perFloor = summary.slabArea / Math.max(1, summary.storeyCount);
      return { quantity: Math.max(2, Math.ceil(perFloor / 60) * summary.storeyCount), source: "measured" };
    }

    // Emergency lighting (~1 per 15m of path)
    if (/bloco.*autónomo|iluminação.*emergência/i.test(desc) && summary.spaceArea > 0) {
      const perFloor = summary.spaceArea / Math.max(1, summary.storeyCount);
      return { quantity: Math.max(4, Math.ceil(perFloor / 15) * summary.storeyCount), source: "measured" };
    }

    // Fire extinguishers (1 per 200m² per floor)
    if (/extintor/i.test(desc) && summary.slabArea > 0) {
      const perFloor = summary.slabArea / Math.max(1, summary.storeyCount);
      return { quantity: Math.max(1, Math.ceil(perFloor / 200) * summary.storeyCount), source: "measured" };
    }

    // Column reinforcement count
    if (/reforço.*pilar|pilar.*reforç/i.test(desc)) {
      if (summary.columnCount > 0) {
        return { quantity: summary.columnCount, source: "measured" };
      }
    }

    // Beam reinforcement count
    if (/reforço.*viga|viga.*reforç/i.test(desc)) {
      if (summary.beamCount > 0) {
        return { quantity: summary.beamCount, source: "measured" };
      }
    }

    // Fire hose reels / boca de incêndio (1 per floor)
    if (/boca.*incêndio|carretel/i.test(desc) && summary.storeyCount > 0) {
      return { quantity: summary.storeyCount, source: "measured" };
    }

    // Manual call points (2 per floor)
    if (/botoneira/i.test(desc) && summary.storeyCount > 0) {
      return { quantity: Math.max(1, summary.storeyCount * 2), source: "measured" };
    }

    // Sirens (1 per floor)
    if (/sirene/i.test(desc) && summary.storeyCount > 0) {
      return { quantity: summary.storeyCount, source: "measured" };
    }

    // Signage (4 per floor)
    if (/sinalização/i.test(desc) && summary.storeyCount > 0) {
      return { quantity: Math.max(4, summary.storeyCount * 4), source: "measured" };
    }

    // Door widening (use door count)
    if (/porta.*largura|alargamento/i.test(desc) && summary.doorCount > 0) {
      // Estimate ~20% of doors may need widening for accessibility
      return { quantity: Math.max(1, Math.ceil(summary.doorCount * 0.2)), source: "measured" };
    }

    // Window count items
    if (/janela|window/i.test(desc) && summary.windowCount > 0) {
      return { quantity: summary.windowCount, source: "measured" };
    }
  }

  // No IFC data available for this item
  return null;
}

// ============================================================
// Helpers
// ============================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

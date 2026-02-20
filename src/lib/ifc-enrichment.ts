/**
 * IFC → BuildingProject Enrichment
 *
 * Bridges the gap between the IFC specialty analyzer (which extracts rich
 * structural/MEP data) and the BuildingProject form fields (which the
 * compliance rules evaluate).
 *
 * This module maps SpecialtyAnalysisResult[] → Partial<BuildingProject>,
 * enabling IFC uploads to auto-populate the project form.
 */

import type { SpecialtyAnalysisResult, IfcQuantityData, IfcSpecialty } from "./ifc-specialty-analyzer";
import type { BuildingProject } from "./types";

// ============================================================
// Types
// ============================================================

export type FieldConfidence = "high" | "medium" | "low";

export interface EnrichedField {
  /** Dot-notation field path (e.g. "structural.columnCount") */
  field: string;
  /** The value set */
  value: unknown;
  /** Human-readable source description */
  source: string;
  /** How confident are we in this value */
  confidence: FieldConfidence;
}

export interface IfcEnrichmentReport {
  /** All fields populated from IFC */
  populatedFields: EnrichedField[];
  /** Specialties detected in the IFC files */
  specialtiesDetected: IfcSpecialty[];
  /** Element counts by entity type */
  elementCounts: Record<string, number>;
  /** Total elements across all files */
  totalElements: number;
  /** Storeys detected */
  storeys: string[];
  /** Materials found */
  materials: string[];
}

// ============================================================
// Helpers
// ============================================================

/** Set a value at a dot-notation path in an object */
function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/** Count entities of a given type prefix across all quantities */
function countEntities(quantities: IfcQuantityData[], prefix: string): number {
  return quantities.filter(q => q.entityType.startsWith(prefix)).length;
}

/** Get all entities matching a type prefix */
function getEntities(quantities: IfcQuantityData[], prefix: string): IfcQuantityData[] {
  return quantities.filter(q => q.entityType.startsWith(prefix));
}

/** Extract concrete class from material names (e.g. "C25/30", "C30/37") */
function extractConcreteClass(materials: string[]): string | undefined {
  for (const mat of materials) {
    const match = mat.match(/C(\d+)\/(\d+)/);
    if (match) return match[0];
  }
  return undefined;
}

/** Extract steel grade from material names (e.g. "S235", "S355", "A500") */
function extractSteelGrade(materials: string[]): string | undefined {
  for (const mat of materials) {
    const match = mat.match(/[SA]\d{3,4}/);
    if (match) return match[0];
  }
  return undefined;
}

/** Get minimum dimension from a set of entities */
function getMinDimension(entities: IfcQuantityData[], dim: "width" | "height" | "depth"): number | undefined {
  const values = entities
    .map(e => e.quantities[dim])
    .filter((v): v is number => v !== undefined && v > 0);
  return values.length > 0 ? Math.min(...values) : undefined;
}

/** Sum a quantity dimension across entities */
function sumQuantity(entities: IfcQuantityData[], dim: "area" | "volume" | "length"): number {
  return entities.reduce((sum, e) => sum + (e.quantities[dim] ?? 0), 0);
}

// ============================================================
// Main Enrichment Function
// ============================================================

/**
 * Map IFC specialty analysis results to BuildingProject fields.
 *
 * Aggregates data from multiple IFC specialty files (structure, architecture,
 * MEP, etc.) and returns a partial BuildingProject with all derivable fields,
 * plus a report of what was populated and with what confidence.
 */
export function specialtyAnalysisToProjectFields(
  analyses: SpecialtyAnalysisResult[]
): { fields: Record<string, unknown>; report: IfcEnrichmentReport } {
  const fields: Record<string, unknown> = {};
  const populatedFields: EnrichedField[] = [];
  const specialtiesDetected: IfcSpecialty[] = [];
  const allElementCounts: Record<string, number> = {};
  const allStoreys = new Set<string>();
  const allMaterials = new Set<string>();
  let totalElements = 0;

  // Aggregate summary data across all analyses
  for (const analysis of analyses) {
    if (analysis.specialty !== "unknown") {
      specialtiesDetected.push(analysis.specialty);
    }
    totalElements += analysis.summary.totalElements;
    for (const [type, count] of Object.entries(analysis.summary.elementsByType)) {
      allElementCounts[type] = (allElementCounts[type] ?? 0) + count;
    }
    for (const s of analysis.summary.storeys) allStoreys.add(s);
    for (const m of analysis.summary.materialsUsed) allMaterials.add(m);
  }

  // Helper to record a field
  function record(field: string, value: unknown, source: string, confidence: FieldConfidence) {
    if (value === undefined || value === null) return;
    if (typeof value === "number" && (isNaN(value) || value === 0)) return;
    setDeep(fields, field, value);
    populatedFields.push({ field, value, source, confidence });
  }

  // Collect all quantities across all analyses
  const allQuantities = analyses.flatMap(a => a.quantities);

  // ----------------------------------------------------------
  // Top-level fields (from storeys)
  // ----------------------------------------------------------
  const storeys = Array.from(allStoreys);
  if (storeys.length > 0) {
    record("numberOfFloors", storeys.length, `${storeys.length} pisos detetados no IFC`, "high");
  }

  // ----------------------------------------------------------
  // Structure
  // ----------------------------------------------------------
  const structuralAnalysis = analyses.find(a => a.specialty === "structure");
  if (structuralAnalysis) {
    const sq = structuralAnalysis.quantities;

    const columnCount = countEntities(sq, "IFCCOLUMN");
    const beamCount = countEntities(sq, "IFCBEAM");
    const slabCount = countEntities(sq, "IFCSLAB");
    const footingCount = countEntities(sq, "IFCFOOTING");

    if (columnCount > 0) record("structural.columnCount", columnCount, `${columnCount} IFCCOLUMN no modelo`, "high");
    if (beamCount > 0) record("structural.beamCount", beamCount, `${beamCount} IFCBEAM no modelo`, "high");
    if (slabCount > 0) record("structural.slabCount", slabCount, `${slabCount} IFCSLAB no modelo`, "high");
    if (footingCount > 0) record("structural.footingCount", footingCount, `${footingCount} IFCFOOTING no modelo`, "high");

    // Structural system inference
    if (columnCount > 0 && beamCount > 0) {
      record("structural.structuralSystem", "reinforced_concrete", "Pilares + vigas detetados", "medium");
    }

    // Concrete class from materials
    const concreteClass = extractConcreteClass(structuralAnalysis.summary.materialsUsed);
    if (concreteClass) {
      record("structural.concreteClass", concreteClass, `Material "${concreteClass}" no modelo`, "high");
    }

    // Steel grade
    const steelGrade = extractSteelGrade(structuralAnalysis.summary.materialsUsed);
    if (steelGrade) {
      record("structural.steelGrade", steelGrade, `Material "${steelGrade}" no modelo`, "high");
    }

    // Total structural length (for beams/columns in linear meters)
    const totalLength = structuralAnalysis.summary.totalLength;
    if (totalLength && totalLength > 0) {
      record("structural.totalLinearMeters", Math.round(totalLength * 100) / 100, `${totalLength.toFixed(1)}m total de elementos lineares`, "medium");
    }
  }

  // ----------------------------------------------------------
  // Architecture
  // ----------------------------------------------------------
  const archAnalysis = analyses.find(a => a.specialty === "architecture");
  if (archAnalysis) {
    const aq = archAnalysis.quantities;

    // Gross floor area from slab areas
    const slabs = getEntities(aq, "IFCSLAB");
    const totalSlabArea = sumQuantity(slabs, "area");
    if (totalSlabArea > 0) {
      record("grossFloorArea", Math.round(totalSlabArea * 100) / 100, `Soma das areas de laje: ${totalSlabArea.toFixed(1)} m2`, "medium");
    }

    // Window area and thermal properties
    const windows = getEntities(aq, "IFCWINDOW");
    const totalWindowArea = sumQuantity(windows, "area");
    if (totalWindowArea > 0) {
      record("envelope.windowArea", Math.round(totalWindowArea * 100) / 100, `${windows.length} janelas, area total ${totalWindowArea.toFixed(1)} m2`, "high");
    }

    // Window U-values from Pset_WindowCommon
    const windowUValues = windows
      .map(w => (w.properties._thermalTransmittance ?? w.properties["ThermalTransmittance"]) as number | undefined)
      .filter((v): v is number => v !== undefined && v > 0);
    if (windowUValues.length > 0) {
      const avgWindowU = Math.round((windowUValues.reduce((a, b) => a + b, 0) / windowUValues.length) * 100) / 100;
      record("envelope.windowUValue", avgWindowU, `U medio janelas: ${avgWindowU} W/m2.K (${windowUValues.length} janelas)`, "high");
    }

    // Window solar factor from Pset_WindowCommon
    const windowSolarFactors = windows
      .map(w => (w.properties._solarFactor ?? w.properties["SolarHeatGainCoefficient"] ?? w.properties["GValue"]) as number | undefined)
      .filter((v): v is number => v !== undefined && v > 0);
    if (windowSolarFactors.length > 0) {
      const avgSolar = Math.round((windowSolarFactors.reduce((a, b) => a + b, 0) / windowSolarFactors.length) * 100) / 100;
      record("envelope.windowSolarFactor", avgSolar, `Fator solar medio: ${avgSolar} (${windowSolarFactors.length} janelas)`, "high");
    }

    // Window fire ratings for SCIE
    const windowFireRatings = windows.filter(w => w.properties._fireRating);
    if (windowFireRatings.length > 0) {
      record("fireSafety.hasFireRatedWindows", true, `${windowFireRatings.length} janelas com classificacao de fogo`, "high");
    }

    // Door dimensions for accessibility
    const doors = getEntities(aq, "IFCDOOR");
    const minDoorWidth = getMinDimension(doors, "width");
    if (minDoorWidth !== undefined) {
      record("accessibility.doorWidths", Math.round(minDoorWidth * 100) / 100, `Largura minima de porta: ${(minDoorWidth * 100).toFixed(0)} cm`, "medium");
    }

    // Door fire ratings from Pset_DoorCommon
    const fireRatedDoors = doors.filter(d => d.properties._fireRating);
    if (fireRatedDoors.length > 0) {
      record("fireSafety.hasFireRatedDoors", true, `${fireRatedDoors.length} portas com classificacao de resistencia ao fogo`, "high");

      // Extract the fire rating values (e.g. "EI30", "EI60", "EI90")
      const fireRatings = fireRatedDoors
        .map(d => d.properties._fireRating as string)
        .filter(Boolean);
      if (fireRatings.length > 0) {
        // Extract numeric minutes from fire ratings
        const minutes = fireRatings
          .map(r => {
            const m = String(r).match(/(\d+)/);
            return m ? parseInt(m[1]) : 0;
          })
          .filter(m => m > 0);
        if (minutes.length > 0) {
          record("fireSafety.minDoorFireRatingMinutes", Math.min(...minutes), `Classificacao minima: ${Math.min(...minutes)} min`, "high");
        }
      }
    }

    // Accessible doors from Pset_DoorCommon.HandicapAccessible
    const accessibleDoors = doors.filter(d => d.properties._handicapAccessible === true);
    if (accessibleDoors.length > 0) {
      record("accessibility.hasAccessibleEntrance", true, `${accessibleDoors.length} portas acessiveis detetadas`, "high");
    }

    // External doors for fire safety evacuation
    const externalDoors = doors.filter(d =>
      d.properties._isExternal === true ||
      d.properties["IsExternal"] === true
    );
    if (externalDoors.length > 0) {
      const minExitWidth = getMinDimension(externalDoors, "width");
      if (minExitWidth !== undefined) {
        record("fireSafety.exitDoorWidth", Math.round(minExitWidth * 100) / 100, `Largura minima porta exterior: ${(minExitWidth * 100).toFixed(0)} cm`, "medium");
      }
    }

    // Dwelling count from space names
    const spaces = getEntities(aq, "IFCSPACE");
    const dwellingSpaces = spaces.filter(s =>
      s.name.toLowerCase().includes("fração") ||
      s.name.toLowerCase().includes("apartamento") ||
      s.name.toLowerCase().includes("dwelling") ||
      s.name.toLowerCase().includes("fracao")
    );
    if (dwellingSpaces.length > 0) {
      record("numberOfDwellings", dwellingSpaces.length, `${dwellingSpaces.length} fracoes identificadas`, "medium");
    }

    // Space areas from Pset_SpaceCommon
    const spacesWithArea = spaces.filter(s =>
      s.properties["GrossFloorArea"] !== undefined ||
      s.properties["NetFloorArea"] !== undefined ||
      s.quantities.area !== undefined
    );
    if (spacesWithArea.length > 0) {
      const totalNetArea = spacesWithArea.reduce((sum, s) => {
        const net = (s.properties["NetFloorArea"] as number) ?? s.quantities.area ?? 0;
        return sum + net;
      }, 0);
      if (totalNetArea > 0) {
        record("usableFloorArea", Math.round(totalNetArea * 100) / 100, `Area util total dos espacos: ${totalNetArea.toFixed(1)} m2`, "medium");
      }
    }

    // Room dimensions for RGEU compliance (bedrooms, kitchen, WC, etc.)
    const bedrooms = spaces.filter(s =>
      s.name.toLowerCase().includes("quarto") ||
      s.name.toLowerCase().includes("bedroom") ||
      s.name.toLowerCase().includes("suite")
    );
    if (bedrooms.length > 0) {
      record("general.numBedrooms", bedrooms.length, `${bedrooms.length} quartos detetados`, "medium");
      const bedroomAreas = bedrooms
        .map(s => (s.properties["NetFloorArea"] as number) ?? s.quantities.area)
        .filter((v): v is number => v !== undefined && v > 0);
      if (bedroomAreas.length > 0) {
        const minArea = Math.min(...bedroomAreas);
        record("general.bedroomArea", Math.round(minArea * 100) / 100, `Area minima de quarto: ${minArea.toFixed(1)} m2`, "medium");
      }
    }

    const kitchens = spaces.filter(s =>
      s.name.toLowerCase().includes("cozinha") ||
      s.name.toLowerCase().includes("kitchen")
    );
    if (kitchens.length > 0) {
      const kitchenAreas = kitchens
        .map(s => (s.properties["NetFloorArea"] as number) ?? s.quantities.area)
        .filter((v): v is number => v !== undefined && v > 0);
      if (kitchenAreas.length > 0) {
        record("general.kitchenArea", Math.round(Math.min(...kitchenAreas) * 100) / 100, `Area de cozinha: ${Math.min(...kitchenAreas).toFixed(1)} m2`, "medium");
      }
    }

    const bathrooms = spaces.filter(s =>
      s.name.toLowerCase().includes("wc") ||
      s.name.toLowerCase().includes("banho") ||
      s.name.toLowerCase().includes("bathroom") ||
      s.name.toLowerCase().includes("toilet") ||
      s.name.toLowerCase().includes("sanitário") ||
      s.name.toLowerCase().includes("sanitario")
    );
    if (bathrooms.length > 0) {
      record("general.numBathrooms", bathrooms.length, `${bathrooms.length} casas de banho detetadas`, "medium");
      const bathroomAreas = bathrooms
        .map(s => (s.properties["NetFloorArea"] as number) ?? s.quantities.area)
        .filter((v): v is number => v !== undefined && v > 0);
      if (bathroomAreas.length > 0) {
        record("general.wcArea", Math.round(Math.min(...bathroomAreas) * 100) / 100, `Area minima WC: ${Math.min(...bathroomAreas).toFixed(1)} m2`, "medium");
      }
    }

    const livingRooms = spaces.filter(s =>
      s.name.toLowerCase().includes("sala") ||
      s.name.toLowerCase().includes("living") ||
      s.name.toLowerCase().includes("estar")
    );
    if (livingRooms.length > 0) {
      const livingAreas = livingRooms
        .map(s => (s.properties["NetFloorArea"] as number) ?? s.quantities.area)
        .filter((v): v is number => v !== undefined && v > 0);
      if (livingAreas.length > 0) {
        record("general.livingRoomArea", Math.round(Math.min(...livingAreas) * 100) / 100, `Area de sala: ${Math.min(...livingAreas).toFixed(1)} m2`, "medium");
      }
    }

    // Exit doors for fire safety
    const exitDoors = doors.filter(d =>
      d.name.toLowerCase().includes("exit") ||
      d.name.toLowerCase().includes("saida") ||
      d.name.toLowerCase().includes("saída") ||
      d.name.toLowerCase().includes("emergencia") ||
      d.name.toLowerCase().includes("emergência")
    );
    if (exitDoors.length > 0) {
      record("fireSafety.numberOfExits", exitDoors.length, `${exitDoors.length} portas de saida/emergencia`, "medium");
    }

    // Corridor widths
    const corridors = spaces.filter(s =>
      s.name.toLowerCase().includes("corridor") ||
      s.name.toLowerCase().includes("corredor") ||
      s.name.toLowerCase().includes("hallway")
    );
    const corridorWidth = getMinDimension(corridors, "width");
    if (corridorWidth !== undefined) {
      record("accessibility.corridorWidths", Math.round(corridorWidth * 100) / 100, `Largura minima de corredor: ${(corridorWidth * 100).toFixed(0)} cm`, "medium");
      record("general.corridorWidth", Math.round(corridorWidth * 100) / 100, `Largura corredor (RGEU): ${(corridorWidth * 100).toFixed(0)} cm`, "medium");
    }

    // Stair dimensions
    const stairs = getEntities(aq, "IFCSTAIR").concat(getEntities(aq, "IFCSTAIRFLIGHT"));
    const stairWidth = getMinDimension(stairs, "width");
    if (stairWidth !== undefined) {
      record("accessibility.stairWidth", Math.round(stairWidth * 100) / 100, `Largura de escada: ${(stairWidth * 100).toFixed(0)} cm`, "medium");
      record("general.stairWidth", Math.round(stairWidth * 100) / 100, `Largura de escada (RGEU): ${(stairWidth * 100).toFixed(0)} cm`, "medium");
    }

    // Ramps for accessibility
    const ramps = getEntities(aq, "IFCRAMP").concat(getEntities(aq, "IFCRAMPFLIGHT"));
    if (ramps.length > 0) {
      record("accessibility.hasRamp", true, `${ramps.length} rampas detetadas`, "high");
      const rampWidth = getMinDimension(ramps, "width");
      if (rampWidth !== undefined) {
        record("accessibility.rampWidth", Math.round(rampWidth * 100) / 100, `Largura rampa: ${(rampWidth * 100).toFixed(0)} cm`, "medium");
      }
    }

    // External wall count/area and thermal properties
    const walls = getEntities(aq, "IFCWALL").concat(getEntities(aq, "IFCWALLSTANDARDCASE"));
    const externalWalls = walls.filter(w =>
      w.properties._isExternal === true ||
      w.name.toLowerCase().includes("ext") ||
      w.name.toLowerCase().includes("fachada")
    );
    const extWallArea = sumQuantity(externalWalls, "area");
    if (extWallArea > 0) {
      record("envelope.externalWallArea", Math.round(extWallArea * 100) / 100, `${externalWalls.length} paredes exteriores, ${extWallArea.toFixed(1)} m2`, "medium");
    }

    // Wall U-values from Pset_WallCommon.ThermalTransmittance
    const extWallUValues = externalWalls
      .map(w => (w.properties._thermalTransmittance ?? w.properties["ThermalTransmittance"]) as number | undefined)
      .filter((v): v is number => v !== undefined && v > 0);
    if (extWallUValues.length > 0) {
      const avgWallU = Math.round((extWallUValues.reduce((a, b) => a + b, 0) / extWallUValues.length) * 100) / 100;
      record("envelope.externalWallUValue", avgWallU, `U medio paredes ext: ${avgWallU} W/m2.K (${extWallUValues.length} paredes)`, "high");
    }

    // Wall fire ratings from Pset_WallCommon.FireRating
    const fireRatedWalls = walls.filter(w => w.properties._fireRating);
    if (fireRatedWalls.length > 0) {
      const wallFireRatings = fireRatedWalls
        .map(w => {
          const m = String(w.properties._fireRating).match(/(\d+)/);
          return m ? parseInt(m[1]) : 0;
        })
        .filter(m => m > 0);
      if (wallFireRatings.length > 0) {
        record("fireSafety.minWallFireRatingMinutes", Math.min(...wallFireRatings), `Resistencia ao fogo minima de parede: ${Math.min(...wallFireRatings)} min`, "high");
      }
    }

    // Wall acoustic insulation from properties
    const wallAcousticValues = walls
      .map(w => (w.properties._acousticRating ?? w.properties["AcousticRating"]) as number | undefined)
      .filter((v): v is number => v !== undefined && v > 0);
    if (wallAcousticValues.length > 0) {
      const avgAcoustic = Math.round(wallAcousticValues.reduce((a, b) => a + b, 0) / wallAcousticValues.length);
      record("acoustic.airborneInsulationValue", avgAcoustic, `Isolamento sonoro medio paredes: ${avgAcoustic} dB`, "medium");
    }

    // Roof thermal properties
    const roofs = getEntities(aq, "IFCROOF");
    const roofUValues = roofs
      .map(r => (r.properties._thermalTransmittance ?? r.properties["ThermalTransmittance"]) as number | undefined)
      .filter((v): v is number => v !== undefined && v > 0);
    if (roofUValues.length > 0) {
      const avgRoofU = Math.round((roofUValues.reduce((a, b) => a + b, 0) / roofUValues.length) * 100) / 100;
      record("envelope.roofUValue", avgRoofU, `U medio cobertura: ${avgRoofU} W/m2.K`, "high");
    }

    // Floor/slab U-values from Pset_SlabCommon.ThermalTransmittance
    const floorSlabs = slabs.filter(s =>
      s.properties._isExternal === true ||
      s.name.toLowerCase().includes("ext") ||
      s.name.toLowerCase().includes("piso") ||
      s.name.toLowerCase().includes("floor")
    );
    const floorUValues = (floorSlabs.length > 0 ? floorSlabs : slabs)
      .map(s => (s.properties._thermalTransmittance ?? s.properties["ThermalTransmittance"]) as number | undefined)
      .filter((v): v is number => v !== undefined && v > 0);
    if (floorUValues.length > 0) {
      const avgFloorU = Math.round((floorUValues.reduce((a, b) => a + b, 0) / floorUValues.length) * 100) / 100;
      record("envelope.floorUValue", avgFloorU, `U medio pavimento: ${avgFloorU} W/m2.K (${floorUValues.length} lajes)`, "medium");
    }

    // External door U-values from Pset_DoorCommon.ThermalTransmittance
    const doorUValues = (externalDoors.length > 0 ? externalDoors : doors)
      .map(d => (d.properties._thermalTransmittance ?? d.properties["ThermalTransmittance"]) as number | undefined)
      .filter((v): v is number => v !== undefined && v > 0);
    if (doorUValues.length > 0) {
      const avgDoorU = Math.round((doorUValues.reduce((a, b) => a + b, 0) / doorUValues.length) * 100) / 100;
      record("envelope.externalDoorUValue", avgDoorU, `U medio portas exteriores: ${avgDoorU} W/m2.K`, "medium");
    }

    // Curtain wall U-values from IfcCurtainWall
    const curtainWalls = getEntities(aq, "IFCCURTAINWALL");
    if (curtainWalls.length > 0) {
      const cwUValues = curtainWalls
        .map(cw => (cw.properties._thermalTransmittance ?? cw.properties["ThermalTransmittance"]) as number | undefined)
        .filter((v): v is number => v !== undefined && v > 0);
      if (cwUValues.length > 0) {
        const avgCwU = Math.round((cwUValues.reduce((a, b) => a + b, 0) / cwUValues.length) * 100) / 100;
        record("envelope.curtainWallUValue", avgCwU, `U medio fachada cortina: ${avgCwU} W/m2.K`, "high");
      }
    }

    // Window-to-facade ratio (automatic from IFC areas)
    if (totalWindowArea > 0 && extWallArea > 0) {
      const ratio = Math.round((totalWindowArea / extWallArea) * 100);
      record("envelope.windowToFacadeRatio", ratio, `Racio envidracado/fachada: ${ratio}% (${totalWindowArea.toFixed(1)} m2 / ${extWallArea.toFixed(1)} m2)`, "medium");
    }

    // Number of storeys for thermal calculations
    if (archAnalysis.summary.storeys && archAnalysis.summary.storeys.length > 0) {
      record("numberOfFloors", archAnalysis.summary.storeys.length, `${archAnalysis.summary.storeys.length} pisos detetados`, "high");
    }

    // Detect balconies (slabs that project beyond the facade)
    const balconySlabs = slabs.filter(s =>
      s.name.toLowerCase().includes("varanda") ||
      s.name.toLowerCase().includes("balcon") ||
      s.name.toLowerCase().includes("terraço") ||
      s.name.toLowerCase().includes("terraco") ||
      s.name.toLowerCase().includes("loggia")
    );
    if (balconySlabs.length > 0) {
      record("envelope.hasBalcony", true, `${balconySlabs.length} varandas/terracos detetados`, "high");
    }
  }

  // ----------------------------------------------------------
  // Electrical
  // ----------------------------------------------------------
  const elecAnalysis = analyses.find(a => a.specialty === "electrical");
  if (elecAnalysis) {
    const eq = elecAnalysis.quantities;

    const boards = countEntities(eq, "IFCELECTRICDISTRIBUTIONBOARD");
    const outlets = countEntities(eq, "IFCOUTLET");
    const lights = countEntities(eq, "IFCLIGHTFIXTURE");
    const switches = countEntities(eq, "IFCSWITCHINGDEVICE");

    if (boards > 0) {
      record("electrical.distributionBoardCount", boards, `${boards} quadros eletricos`, "high");
      // Estimate circuits: typically 6-10 circuits per board
      record("electrical.numberOfCircuits", boards * 8, `Estimativa: ${boards} quadros x 8 circuitos`, "low");
    }
    if (outlets > 0) record("electrical.outletCount", outlets, `${outlets} tomadas`, "high");
    if (lights > 0) record("electrical.lightFixtureCount", lights, `${lights} luminarias`, "high");
    if (switches > 0) record("electrical.switchCount", switches, `${switches} interruptores`, "high");

    // Mark electrical as present
    if (elecAnalysis.summary.totalElements > 0) {
      record("electrical.compliance", true, "Instalacao eletrica detetada no modelo", "high");
    }
  }

  // ----------------------------------------------------------
  // Plumbing
  // ----------------------------------------------------------
  const plumbAnalysis = analyses.find(a => a.specialty === "plumbing");
  if (plumbAnalysis) {
    const pq = plumbAnalysis.quantities;

    const pipes = getEntities(pq, "IFCPIPESEGMENT");
    const sanitaryTerminals = countEntities(pq, "IFCSANITARYTERMINAL");
    const fittings = countEntities(pq, "IFCPIPEFITTING");

    if (sanitaryTerminals > 0) {
      record("waterDrainage.sanitaryTerminalCount", sanitaryTerminals, `${sanitaryTerminals} aparelhos sanitarios`, "high");
    }
    if (pipes.length > 0) {
      record("waterDrainage.pipeCount", pipes.length, `${pipes.length} trocos de tubagem`, "high");
      // Detect pipe material from materials list
      const pipeMaterials = plumbAnalysis.summary.materialsUsed;
      const material = detectPipeMaterial(pipeMaterials);
      if (material) {
        record("waterDrainage.waterPipeMaterial", material, `Material de tubagem: ${material}`, "medium");
      }
    }

    // Mark water systems as present
    if (plumbAnalysis.summary.totalElements > 0) {
      record("waterDrainage.hasPublicWaterConnection", true, "Rede de agua detetada no modelo", "medium");
    }

    // Detect drainage system separation
    if (pipes.length > 5) {
      record("waterDrainage.hasSeparateDrainageSystem", true, "Rede de drenagem detetada", "low");
    }
  }

  // ----------------------------------------------------------
  // HVAC
  // ----------------------------------------------------------
  const hvacAnalysis = analyses.find(a => a.specialty === "hvac");
  if (hvacAnalysis) {
    const hq = hvacAnalysis.quantities;

    const ducts = countEntities(hq, "IFCDUCTSEGMENT");
    const airTerminals = countEntities(hq, "IFCAIRTERMINAL");
    const equipment = countEntities(hq, "IFCUNITARYEQUIPMENT");

    if (ducts > 0 || airTerminals > 0) {
      record("avac.hasHVACProject", true, "Rede de AVAC detetada no modelo", "high");
      record("avac.ventilationType", "mechanical", "Condutas/terminais de ar detetados", "medium");
    }
    if (ducts > 0) record("avac.ductCount", ducts, `${ducts} trocos de conduta`, "high");
    if (airTerminals > 0) record("avac.airTerminalCount", airTerminals, `${airTerminals} terminais de ar`, "high");
    if (equipment > 0) record("avac.equipmentCount", equipment, `${equipment} equipamentos AVAC`, "high");
  }

  // ----------------------------------------------------------
  // Fire Safety
  // ----------------------------------------------------------
  const fireAnalysis = analyses.find(a => a.specialty === "fire_safety");
  if (fireAnalysis) {
    const fq = fireAnalysis.quantities;

    const sprinklers = countEntities(fq, "IFCFIRESUPPRESSIONTERMINAL");
    const alarms = countEntities(fq, "IFCALARM");
    const sensors = countEntities(fq, "IFCSENSOR");

    if (sprinklers > 0) {
      record("fireSafety.hasSprinklers", true, `${sprinklers} sprinklers detetados`, "high");
    }
    if (alarms > 0 || sensors > 0) {
      record("fireSafety.hasFireDetection", true, `${alarms + sensors} dispositivos de detecao/alarme`, "high");
      record("fireSafety.hasFireAlarm", true, "Sistema de alarme detetado", "high");
    }
  }

  // ----------------------------------------------------------
  // Telecom
  // ----------------------------------------------------------
  const telecomAnalysis = analyses.find(a => a.specialty === "telecom");
  if (telecomAnalysis && telecomAnalysis.summary.totalElements > 0) {
    record("telecommunications.hasATE", true, "Equipamento de telecomunicacoes detetado", "medium");
  }

  // ----------------------------------------------------------
  // Gas (from burner detection)
  // ----------------------------------------------------------
  const gasAnalysis = analyses.find(a => a.specialty === "gas");
  if (gasAnalysis && gasAnalysis.summary.totalElements > 0) {
    record("gas.hasGasInstallation", true, "Equipamento de gas detetado", "medium");
  }

  // ----------------------------------------------------------
  // Cross-specialty: building height from storeys
  // ----------------------------------------------------------
  if (storeys.length > 0) {
    // Estimate building height: ~3m per storey (standard Portuguese floor height)
    const estimatedHeight = storeys.length * 3.0;
    record("buildingHeight", estimatedHeight, `Estimativa: ${storeys.length} pisos x 3.0m`, "low");
  }

  // ===========================================================
  // Cross-specialty fallback enrichment
  //
  // The specialty-specific sections above only fire when the
  // IFC is detected as that specialty. A real architectural IFC
  // may contain structural elements (columns, beams, slabs) but
  // won't trigger the "structure" block. This section extracts
  // fields from ALL quantities regardless of detected specialty.
  // It only sets fields that weren't already populated above.
  // ===========================================================

  /** Check if a dot-path field was already recorded */
  const alreadySet = (path: string): boolean => {
    const parts = path.split(".");
    let obj: unknown = fields;
    for (const part of parts) {
      if (obj === undefined || obj === null || typeof obj !== "object") return false;
      obj = (obj as Record<string, unknown>)[part];
    }
    return obj !== undefined && obj !== null;
  };

  // 1. Entity counts from any analysis
  const crossSpecialtyEntities = [
    { prefix: "IFCCOLUMN", field: "structural.columnCount", label: "pilares" },
    { prefix: "IFCBEAM", field: "structural.beamCount", label: "vigas" },
    { prefix: "IFCSLAB", field: "structural.slabCount", label: "lajes" },
    { prefix: "IFCFOOTING", field: "structural.footingCount", label: "fundacoes" },
    { prefix: "IFCWALL", field: "envelope.wallCount", label: "paredes" },
    { prefix: "IFCWINDOW", field: "envelope.windowCount", label: "janelas" },
    { prefix: "IFCDOOR", field: "accessibility.doorCount", label: "portas" },
    { prefix: "IFCSTAIR", field: "accessibility.hasStairs", label: "escadas" },
    { prefix: "IFCROOF", field: "envelope.roofCount", label: "coberturas" },
    { prefix: "IFCRAMP", field: "accessibility.hasRamp", label: "rampas" },
  ];

  for (const { prefix, field, label } of crossSpecialtyEntities) {
    if (alreadySet(field)) continue;
    const count = countEntities(allQuantities, prefix);
    if (count > 0) {
      const isBoolean = field.includes("has");
      record(field, isBoolean ? true : count, `${count} ${label} no modelo (cross-specialty)`, "medium");
    }
  }

  // 2. Structural system inference
  if (!alreadySet("structural.structuralSystem")) {
    const cols = countEntities(allQuantities, "IFCCOLUMN");
    const beams = countEntities(allQuantities, "IFCBEAM");
    if (cols > 0 && beams > 0) {
      record("structural.structuralSystem", "reinforced_concrete",
        "Pilares + vigas detetados (cross-specialty)", "medium");
    }
  }

  // 3. Gross floor area from slab areas
  if (!alreadySet("grossFloorArea")) {
    const allSlabs = getEntities(allQuantities, "IFCSLAB");
    const totalArea = sumQuantity(allSlabs, "area");
    if (totalArea > 0) {
      record("grossFloorArea", Math.round(totalArea),
        `Soma areas de laje: ${totalArea.toFixed(0)} m2 (cross-specialty)`, "low");
    }
  }

  // 4. Concrete class + steel grade from ALL materials
  if (!alreadySet("structural.concreteClass")) {
    const concreteClass = extractConcreteClass(Array.from(allMaterials));
    if (concreteClass) {
      record("structural.concreteClass", concreteClass,
        `Material "${concreteClass}" (cross-specialty)`, "medium");
    }
  }
  if (!alreadySet("structural.steelGrade")) {
    const steelGrade = extractSteelGrade(Array.from(allMaterials));
    if (steelGrade) {
      record("structural.steelGrade", steelGrade,
        `Material "${steelGrade}" (cross-specialty)`, "medium");
    }
  }

  // 5. Wall/window areas from ALL quantities
  if (!alreadySet("envelope.externalWallArea")) {
    const allWalls = getEntities(allQuantities, "IFCWALL")
      .concat(getEntities(allQuantities, "IFCWALLSTANDARDCASE"));
    const extWalls = allWalls.filter(w =>
      w.properties._isExternal === true ||
      w.name.toLowerCase().includes("ext") ||
      w.name.toLowerCase().includes("fachada")
    );
    const wallArea = sumQuantity(extWalls.length > 0 ? extWalls : allWalls, "area");
    if (wallArea > 0) {
      record("envelope.externalWallArea", Math.round(wallArea),
        `${allWalls.length} paredes, area ${wallArea.toFixed(0)} m2 (cross-specialty)`, "low");
    }
  }
  if (!alreadySet("envelope.windowArea")) {
    const allWindows = getEntities(allQuantities, "IFCWINDOW");
    const winArea = sumQuantity(allWindows, "area");
    if (winArea > 0) {
      record("envelope.windowArea", Math.round(winArea * 100) / 100,
        `${allWindows.length} janelas, area ${winArea.toFixed(1)} m2 (cross-specialty)`, "medium");
    }
  }

  // 6. Door dimensions for accessibility (fallback)
  if (!alreadySet("accessibility.doorWidths")) {
    const allDoors = getEntities(allQuantities, "IFCDOOR");
    const minDoorW = getMinDimension(allDoors, "width");
    if (minDoorW !== undefined) {
      record("accessibility.doorWidths", Math.round(minDoorW * 100) / 100,
        `Largura minima porta: ${(minDoorW * 100).toFixed(0)} cm (cross-specialty)`, "medium");
    }
  }

  // 7. Window-to-facade ratio (fallback)
  if (!alreadySet("envelope.windowToFacadeRatio")) {
    const wallAreaVal = fields.envelope && typeof fields.envelope === "object"
      ? (fields.envelope as Record<string, unknown>).externalWallArea as number | undefined
      : undefined;
    const winAreaVal = fields.envelope && typeof fields.envelope === "object"
      ? (fields.envelope as Record<string, unknown>).windowArea as number | undefined
      : undefined;
    if (wallAreaVal && winAreaVal && wallAreaVal > 0) {
      const ratio = Math.round((winAreaVal / wallAreaVal) * 100);
      record("envelope.windowToFacadeRatio", ratio,
        `Racio envidracado/fachada: ${ratio}% (cross-specialty)`, "low");
    }
  }

  // 8. Building type inference from entity mix
  if (!alreadySet("buildingType")) {
    const hasElevator = countEntities(allQuantities, "IFCTRANSPORTELEMENT") > 0;
    const dwellingCount = allQuantities.filter(q =>
      q.name.toLowerCase().includes("apartamento") ||
      q.name.toLowerCase().includes("fração") ||
      q.name.toLowerCase().includes("fracao") ||
      q.name.toLowerCase().includes("dwelling")
    ).length;
    if (dwellingCount > 1) {
      record("buildingType", "multi_family", `${dwellingCount} fracoes detetadas`, "low");
    } else if (hasElevator && storeys.length > 3) {
      record("buildingType", "multi_family", `Elevador + ${storeys.length} pisos`, "low");
    }
  }

  return {
    fields,
    report: {
      populatedFields,
      specialtiesDetected,
      elementCounts: allElementCounts,
      totalElements,
      storeys,
      materials: Array.from(allMaterials),
    },
  };
}

// ============================================================
// Pipe Material Detection
// ============================================================

function detectPipeMaterial(materials: string[]): string | undefined {
  const materialMap: Record<string, string> = {
    ppr: "PPR",
    pex: "PEX",
    copper: "Cobre",
    cobre: "Cobre",
    pvc: "PVC",
    "pvc-u": "PVC-U",
    hdpe: "PEAD",
    pead: "PEAD",
    inox: "Aco Inox",
    "stainless": "Aco Inox",
    multicamada: "Multicamada",
    galvanized: "Aco Galvanizado",
    galvanizado: "Aco Galvanizado",
  };

  for (const mat of materials) {
    const lower = mat.toLowerCase();
    for (const [key, value] of Object.entries(materialMap)) {
      if (lower.includes(key)) return value;
    }
  }
  return undefined;
}

// ============================================================
// Merge enriched fields into a BuildingProject
// ============================================================

/**
 * Deep-merge enriched IFC fields into an existing BuildingProject.
 * Only sets fields that are undefined/null in the target (won't overwrite user input).
 */
export function mergeIfcFieldsIntoProject(
  project: BuildingProject,
  analyses: SpecialtyAnalysisResult[]
): { project: BuildingProject; report: IfcEnrichmentReport } {
  const { fields, report } = specialtyAnalysisToProjectFields(analyses);

  const merged = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;

  for (const entry of report.populatedFields) {
    const parts = entry.field.split(".");
    let target: Record<string, unknown> = merged;
    let source: unknown = fields;

    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] === undefined || typeof target[parts[i]] !== "object") {
        target[parts[i]] = {};
      }
      target = target[parts[i]] as Record<string, unknown>;

      if (source !== undefined && typeof source === "object" && source !== null) {
        source = (source as Record<string, unknown>)[parts[i]];
      }
    }

    const lastKey = parts[parts.length - 1];
    // Only set if the field isn't already defined by the user
    if (target[lastKey] === undefined || target[lastKey] === null) {
      if (source !== undefined && typeof source === "object" && source !== null) {
        target[lastKey] = (source as Record<string, unknown>)[lastKey];
      }
    }
  }

  // Attach metadata
  merged._ifcEnrichmentReport = report;
  merged._ifcAnalyses = analyses;

  return {
    project: merged as unknown as BuildingProject,
    report,
  };
}

// ============================================================
// CONTEXT BUILDER — Bridges project data to rule evaluation
// ============================================================
//
// The rule engine evaluates rules against a BuildingProject object,
// but rules use field namespaces that don't always match the TS types.
// This module:
//
// 1. Resolves namespace aliases (e.g. rules say "elevator.*", type has "elevators")
// 2. Creates virtual namespaces (e.g. "building.*" from top-level fields)
// 3. Merges IFC-extracted data into the project
// 4. Applies smart defaults per building type
// 5. Returns an enriched object ready for rule evaluation
//

import type { BuildingProject, BuildingType } from "./types";
import type { IfcExtractedData } from "./ifc-parser";
import { ifcToProjectFields } from "./ifc-parser";
import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
import { specialtyAnalysisToProjectFields } from "./ifc-enrichment";
import { resolveLocationParams } from "./municipality-lookup";

// ----------------------------------------------------------
// Types
// ----------------------------------------------------------

/** How a field value is obtained */
export type FieldSource = "ifc" | "form" | "default" | "computed";

/** A field mapping entry for a single specialty field */
export interface FieldMapping {
  /** Dot-notation field path as used by rules: e.g. "fireSafety.riskCategory" */
  field: string;
  /** Human-readable label in Portuguese */
  label: string;
  /** Data type for form generation */
  type: "string" | "number" | "boolean" | "select" | "textarea";
  /** Unit of measurement (if applicable) */
  unit?: string;
  /** Select options (if type is "select") */
  options?: { value: string; label: string }[];
  /** Ordered priority: where to look first for this field's value */
  sources: FieldSource[];
  /** IFC property set and property name to extract from */
  ifcMapping?: {
    propertySet: string;
    propertyName: string;
    /** Optional transform: e.g. "parseFloat", "boolean" */
    transform?: string;
  };
  /** Default value by building type (or universal) */
  defaults?: Partial<Record<BuildingType, unknown>> & { _default?: unknown };
  /** Is this field required for rule evaluation? */
  required?: boolean;
}

/** Field mappings configuration for one specialty plugin */
export interface SpecialtyFieldMappings {
  pluginId: string;
  version: string;
  fields: FieldMapping[];
}

/** Report of what the context builder did */
export interface ContextBuildReport {
  /** Fields populated from IFC data */
  fromIfc: string[];
  /** Fields populated from form input (already in project) */
  fromForm: string[];
  /** Fields populated from defaults */
  fromDefaults: string[];
  /** Fields still missing (rules will be skipped) */
  stillMissing: string[];
  /** Fields auto-derived from municipality lookup */
  fromLocation: string[];
  /** Alias resolutions applied */
  aliasesApplied: string[];
  /** Total fields expected vs populated */
  coverage: { total: number; populated: number; percentage: number };
}

// ----------------------------------------------------------
// Namespace Alias Map
// ----------------------------------------------------------
// Rules use these namespaces → BuildingProject has these property names.
// Both directions are registered so lookup works either way.

const NAMESPACE_ALIASES: Record<string, string> = {
  // Rules namespace → BuildingProject property
  elevator: "elevators",
  hvac: "avac",
  water: "waterDrainage",
  drawings: "drawingQuality",
  municipal: "localRegulations",
};

// Reverse map: BuildingProject property → rule namespace
const REVERSE_ALIASES: Record<string, string> = {};
for (const [alias, canonical] of Object.entries(NAMESPACE_ALIASES)) {
  REVERSE_ALIASES[canonical] = alias;
}

// ----------------------------------------------------------
// Virtual Namespaces
// ----------------------------------------------------------
// Some rules reference "building.*" which maps to top-level fields.

function buildVirtualNamespaces(project: BuildingProject): Record<string, unknown> {
  return {
    // "building.*" → top-level BuildingProject fields
    building: {
      height: project.buildingHeight,
      numberOfFloors: project.numberOfFloors,
      yearBuilt: project.yearBuilt,
      grossFloorArea: project.grossFloorArea,
      usableFloorArea: project.usableFloorArea,
      numberOfDwellings: project.numberOfDwellings,
      type: project.buildingType,
      name: project.name,
      // Common computed flags
      hasUndergroundFloors: (project as Record<string, unknown>)["hasUndergroundFloors"] ?? false,
      isNew: (project as Record<string, unknown>)["isRehabilitation"] === false,
    },
    // "project.*" → projectContext fields
    project: project.projectContext ?? {},
  };
}

// ----------------------------------------------------------
// Deep merge utility
// ----------------------------------------------------------

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv !== undefined && sv !== null) {
      if (typeof sv === "object" && !Array.isArray(sv) && typeof tv === "object" && tv !== null && !Array.isArray(tv)) {
        result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
      } else {
        result[key] = sv;
      }
    }
  }
  return result;
}

// ----------------------------------------------------------
// Set a value at a dot-notation path
// ----------------------------------------------------------

function setFieldValue(obj: Record<string, unknown>, fieldPath: string, value: unknown): void {
  const parts = fieldPath.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const lastPart = parts[parts.length - 1];
  // Only set if not already defined (don't overwrite existing data)
  if (current[lastPart] === undefined || current[lastPart] === null) {
    current[lastPart] = value;
  }
}

function getFieldValue(obj: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ----------------------------------------------------------
// IFC Property Extraction
// ----------------------------------------------------------

function extractFromIfc(
  ifcData: IfcExtractedData,
  mappings: FieldMapping[]
): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};

  // First: use the existing ifcToProjectFields for standard fields
  const standardFields = ifcToProjectFields(ifcData);
  Object.assign(extracted, standardFields);

  // Then: use field-specific IFC mappings for specialty fields
  for (const mapping of mappings) {
    if (!mapping.ifcMapping) continue;
    const { propertySet, propertyName, transform } = mapping.ifcMapping;
    if (!propertySet || !propertyName) continue;

    // Search property sets for matching property
    for (const pset of ifcData.propertySets) {
      if (pset.name === propertySet || pset.name.includes(propertySet)) {
        const rawValue = pset.properties[propertyName];
        if (rawValue !== undefined && rawValue !== null) {
          let value: unknown = rawValue;
          if (transform === "parseFloat" && typeof rawValue === "string") {
            value = parseFloat(rawValue);
          } else if (transform === "boolean") {
            value = rawValue === true || rawValue === "true" || rawValue === "TRUE" || rawValue === 1;
          }
          setFieldValue(extracted, mapping.field, value);
          break;
        }
      }
    }
  }

  return extracted;
}

/**
 * Extract field values from IFC specialty analysis using entity-based
 * ifcMapping patterns (entityType, pset, filter, property).
 * This complements the hardcoded extraction in ifc-enrichment.ts with
 * declarative mappings from field-mappings.json.
 */
function extractFromSpecialtyAnalyses(
  analyses: SpecialtyAnalysisResult[],
  mappings: FieldMapping[],
): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};
  const allQuantities = analyses.flatMap(a => a.quantities);

  for (const mapping of mappings) {
    const ifc = mapping.ifcMapping as Record<string, unknown> | undefined;
    if (!ifc) continue;

    const entityType = ifc.entityType as string | undefined;
    if (!entityType) continue;

    // Find matching entities (case-insensitive match on IFC entity type)
    const entityUpper = entityType.toUpperCase().replace(/^IFC/, "IFC");
    let entities = allQuantities.filter(
      q => q.entityType.toUpperCase() === entityUpper ||
           q.entityType.toUpperCase() === `IFC${entityUpper.replace(/^IFC/, "")}`,
    );

    // Apply filter if specified (simple property match)
    const filter = ifc.filter as Record<string, string> | undefined;
    if (filter && entities.length > 0) {
      entities = entities.filter(q => {
        for (const [key, pattern] of Object.entries(filter)) {
          const val = String(q.properties[key] ?? q.name ?? "").toLowerCase();
          const pat = pattern.toLowerCase().replace(/\*/g, "");
          if (!val.includes(pat)) return false;
        }
        return true;
      });
    }

    if (entities.length === 0) continue;

    // Extract value based on property/pset/method
    let value: unknown;

    const pset = ifc.pset as string | undefined;
    const psetProperty = ifc.psetProperty as string | undefined;
    const property = (ifc.property ?? ifc.propertyName) as string | undefined;
    const method = ifc.method as string | undefined;

    if (pset && psetProperty) {
      // Extract from property set: e.g. Pset_RampCommon.Slope
      const values = entities
        .map(q => q.propertySetData?.[pset]?.[psetProperty])
        .filter((v): v is string | number | boolean => v !== undefined);
      if (values.length > 0) value = values[0];
    } else if (property) {
      // Extract from quantities or properties
      const propLower = property.toLowerCase();
      const quantityKeys = ["width", "height", "area", "volume", "length", "depth", "thickness"] as const;
      const matchedQKey = quantityKeys.find(k => propLower.includes(k));

      if (matchedQKey) {
        // It's a dimension quantity
        const vals = entities
          .map(q => q.quantities[matchedQKey])
          .filter((v): v is number => v !== undefined && v > 0);
        if (vals.length > 0) {
          if (method === "minValue") value = Math.min(...vals);
          else if (method === "maxValue") value = Math.max(...vals);
          else if (method === "sumArea" || method === "sum") value = vals.reduce((a, b) => a + b, 0);
          else if (method === "average") value = vals.reduce((a, b) => a + b, 0) / vals.length;
          else value = vals[0]; // Default: first match
        }
      } else {
        // Search in properties map
        const vals = entities
          .map(q => q.properties[property] ?? q.properties[propLower])
          .filter(v => v !== undefined);
        if (vals.length > 0) value = vals[0];
      }
    } else if (method === "count") {
      value = entities.length;
    } else {
      // Default: count matching entities
      value = entities.length;
    }

    if (value !== undefined && value !== null) {
      // Apply transform
      const transform = ifc.transform as string | undefined;
      if (transform === "parseFloat" && typeof value === "string") {
        value = parseFloat(value);
      } else if (transform === "boolean") {
        value = Boolean(value);
      }
      setFieldValue(extracted, mapping.field, value);
    }
  }

  return extracted;
}

// ----------------------------------------------------------
// Smart Defaults by Building Type
// ----------------------------------------------------------

// ----------------------------------------------------------
// Specialty-Level Defaults (boolean gates, basic config)
// ----------------------------------------------------------

const SPECIALTY_DEFAULTS_RESIDENTIAL: Record<string, unknown> = {
  // Fire Safety
  "fireSafety.utilizationType": "I",
  "fireSafety.riskCategory": "1",
  "fireSafety.hasFireExtinguishers": true,
  "fireSafety.hasEmergencyLighting": false,
  "fireSafety.hasSprinklers": false,
  "fireSafety.hasFireDetection": false,
  "fireSafety.hasFireAlarm": false,
  // Accessibility
  "accessibility.hasAccessibleEntrance": true,
  "accessibility.doorWidths": 0.77,
  "accessibility.corridorWidths": 1.10,
  "accessibility.hasElevator": false,
  "accessibility.hasAccessibleWC": false,
  "accessibility.hasAccessibleParking": false,
  "accessibility.doorHandleHeight": 1.0,
  "accessibility.stairRiserHeight": 0.175,
  "accessibility.stairWidth": 1.20,
  "accessibility.stairTreadDepth": 0.28,
  "accessibility.stairBlondelValue": 0.63,
  "accessibility.rampLevelDifference": 0.02,
  "accessibility.rampLength": 6.0,
  "accessibility.elevatorCallButtonHeight": 1.0,
  "accessibility.grabBarHeight": 0.75,
  "accessibility.toiletSeatHeight": 0.45,
  "accessibility.wcAccessoryHeight": 0.80,
  "accessibility.tableHeight": 0.75,
  // Acoustic
  "acoustic.buildingLocation": "mixed",
  // Gas — boolean gate
  "gas.hasGasInstallation": false,
  "gas.gasType": "natural_gas",
  // Elevator — boolean gate
  "elevator.hasElevator": false,
  "elevators.hasElevator": false,
  // Telecom — boolean gates
  "telecommunications.isUrbanization": false,
  "ited.isUrbanization": false,
  "itur.isUrbanization": false,
  // Licensing
  "licensing.projectPhase": "licensing",
  "licensing.operationType": "building_permit",
  // Waste
  "waste.recyclingPercentageTarget": 70,
  // Energy
  "energy.hasCertificate": false,
  // Electrical — gate fields
  "electrical.compliance": true,
  "electrical.hasProjectApproval": false,
  // Architecture — typology mirror
  "architecture.typology": "T2",
  // Water/Drainage — gate fields
  "water.hasPublicWaterConnection": true,
  "water.hasWaterMeter": true,
  "water.hasCheckValve": true,
  "water.hasSeparateDrainageSystem": true,
  "water.hasVentilatedDrainage": true,
  "water.hasDrainageSiphons": true,
  "water.hasBackflowPrevention": true,
  "water.hasStormwaterManagement": true,
  "water.hasGreaseTrap": false,
  "water.waterPipeMaterial": "PPR",
  "water.velocidadeMinimaMs": 0.5,
  "water.velocidadeMinimaMS": 0.5,
  "water.pressaoMinimaKPa": 100,
  "water.pressaoMaximaKPa": 600,
  "water.fracaoDiametroConduta": 0.5,
  // Structural — basic defaults
  "structural.exposureClass": "XC1",
  "structural.coverDepth": 25,
  "structural.liveLoad": 2.0,
  "structural.ductilityClass": "DCM",
  "structural.behaviourFactor": 3.0,
  // Elevator — detail fields
  "elevator.cabinCapacity": 630,
  "elevator.cabinDepth": 1.40,
  "elevator.cabinWidth": 1.10,
  "elevator.isAccessible": false,
  "elevator.speed": 1.0,
  "elevator.doorWidth": 0.80,
  // Mirror into elevators alias
  "elevators.cabinCapacity": 630,
  "elevators.cabinDepth": 1.40,
  "elevators.cabinWidth": 1.10,
  "elevators.isAccessible": false,
  "elevators.speed": 1.0,
  "elevators.doorWidth": 0.80,
  // Acoustic — measurement defaults (RRAE minimums)
  "acoustic.facadeInsulationValue": 28,
  "acoustic.airborneInsulationValue": 50,
  "acoustic.impactInsulationValue": 60,
  "acoustic.airborneInsulationCommonAreas": 48,
  // Architecture — additional fields
  "architecture.totalUsableArea": 400,
  "architecture.numberOfBedrooms": 2,
  // Energy — basic defaults
  "energy.ieeActual": 100,
  "energy.installedPower": 20,
  "energy.lightingDensity": 5,
  // HVAC
  "hvac.installedHVACPower": 5,
  "hvac.spaceType": "residential",
  "avac.installedHVACPower": 5,
  "avac.spaceType": "residential",
  // Gas — detail fields
  "gas.applianceType": "cooktop",
  "gas.hasFlueSystem": false,
  // Location supplements
  "location.heatingDegreeDays": 1071,
  // Drawings
  "drawings.hasPlantaLocalizacao": true,
  "drawings.hasPlantaImplantacao": true,
  "drawings.hasPlantas": true,
  "drawings.hasCortes": true,
  "drawings.hasAlcados": true,
  "drawings.hasPormenores": true,
  "drawings.hasMemoriaDescritiva": true,
  "drawings.hasOrcamento": true,
  // Elevator — additional detail
  "elevator.isFirefighterElevator": false,
  "elevator.ratedPersons": 8,
  "elevator.pitDepth": 1.20,
  "elevator.callButtonHeight": 1.0,
  "elevator.interiorPanelHeight": 1.0,
  "elevator.cableSafetyFactor": 8,
  "elevator.driveType": "traction",
  "elevators.isFirefighterElevator": false,
  "elevators.ratedPersons": 8,
  "elevators.pitDepth": 1.20,
  "elevators.callButtonHeight": 1.0,
  "elevators.interiorPanelHeight": 1.0,
  "elevators.cableSafetyFactor": 8,
  "elevators.driveType": "traction",
  // Energy — thermal/SCE
  "energy.ntcNtRatio": 1.0,
  "energy.energyClassRatio": 1.0,
  "energy.thermalInertiaMass": 300,
  // Structural — additional
  "structural.structuralSystem": "frame",
  // Licensing — additional
  "licensing.isProtectedArea": false,
  // Gas — additional
  "gas.pipesMaterial": "copper",
  // HVAC — additional
  "hvac.ductDeltaT": 10,
  "avac.ductDeltaT": 10,
  // Acoustic — additional
  "acoustic.hasAdjacentGarage": false,
  "acoustic.reverberationTime": 0.5,
  // Architecture — additional
  "architecture.ceilingHeight": 2.70,
  "architecture.commonStairWidth": 1.10,
  // Telecom — additional
  "telecommunications.rj45OutletsPerDwelling": 2,
  "ited.rj45OutletsPerDwelling": 2,
  // Fire Safety — additional
  "fireSafety.occupancyIndex": 0.02,
  "fireSafety.compartmentArea": 1600,
  "fireSafety.hasRIA": false,
  "fireSafety.hydrantDistance": 50,
  "fireSafety.numberOfExits": 1,
  "fireSafety.evacuationPathWidth": 1.20,
  "fireSafety.accessRoadWidth": 3.50,
  "fireSafety.occupantLoad": 16,
  "fireSafety.accessRoadHeight": 4.0,
  "fireSafety.kitchenPower": 5,
  "fireSafety.hasHVACSystem": false,
  "fireSafety.fireOutletHeight": 0.80,
  "fireSafety.outletAngle": 45,
  // Licensing — additional
  "licensing.hasConstructionLicense": false,
  "licensing.hasComunicacaoPrevia": false,
  "licensing.hasMunicipalApproval": false,
  "licensing.isInARU": false,
  "licensing.altersFacadeOrHeight": false,
  "licensing.isConformWithPDM": true,
  "licensing.isRehabilitation": false,
  // Structural — additional defaults
  "structural.hasGeotechnicalStudy": false,
  "structural.snowLoad": 0.3,
  "structural.snowZone": "Z1",
  "structural.concreteClass": "C25/30",
  "structural.foundationType": "shallow",
  "structural.psi0": 0.7,
  "structural.designLife": 50,
  "structural.buildingCategory": "B",
  "structural.windSpeed": 27,
  "structural.windZone": "A",
  "structural.crackWidth": 0.3,
  "structural.columnReinfRatio": 0.01,
  "structural.soilType": "B",
  // Gas — additional defaults
  "gas.roomType": "kitchen",
  "gas.ventilationType": "natural",
  "gas.utilizationPressure": 20,
  "gas.hasGasDetector": false,
  "gas.ventilationAreaLower": 150,
  "gas.mechanicalExtractionRate": 0,
  "gas.testPressure": 150,
  "gas.installationType": "individual",
  "gas.interiorPipeDiameter": 22,
  "gas.hasPhysicalSeparation": true,
  "gas.roomVolume": 15,
  "gas.yearsSinceLastInspection": 0,
  "gas.buildingUse": "residential",
  // HVAC — additional
  "hvac.heatPumpType": "split",
  "hvac.hotWaterStorageTemp": 60,
  "hvac.installedCoolingPower": 5,
  "hvac.occupancy": 4,
  "hvac.relativeHumidity": 50,
  "avac.heatPumpType": "split",
  "avac.hotWaterStorageTemp": 60,
  "avac.installedCoolingPower": 5,
  "avac.occupancy": 4,
  "avac.relativeHumidity": 50,
  // Acoustic — additional
  "acoustic.airborneInsulationCommercial": 50,
  "acoustic.hasAcousticProject": false,
  "acoustic.airborneInsulationTechnical": 48,
  "acoustic.equipmentNoiseBedroom": 27,
  "acoustic.equipmentNoiseLevel": 30,
  "acoustic.roomType": "bedroom",
  "acoustic.roomVolume": 30,
  "acoustic.ambientNoiseLden": 55,
  "acoustic.ambientNoiseLn": 45,
  "acoustic.hasNoiseSource": false,
  // Telecom — additional
  "telecommunications.hasFiberOptic": true,
  "telecommunications.hasCoaxialCabling": true,
  "telecommunications.hasCopperCabling": true,
  "telecommunications.coaxOutletsPerDwelling": 2,
  "ited.hasFiberOptic": true,
  "ited.hasCoaxialCabling": true,
  "ited.hasCopperCabling": true,
  "ited.coaxOutletsPerDwelling": 2,
  "ited.ateWidth": 0.40,
  "ited.buildingEntryDuctDiameter": 63,
  // ITUR — urbanization infrastructure defaults
  "itur.ductDiameter": 110,
  "itur.ductsPerRoute": 2,
  "itur.burialDepthSidewalk": 0.60,
  "itur.burialDepthRoadway": 0.80,
  "itur.cvmuWidth": 0.30,
  "itur.cvmuSpacing": 0.50,
  "itur.hasSignalTape": true,
  // Envelope — typical residential
  "envelope.wallUValue": 0.50,
  "envelope.roofUValue": 0.40,
  "envelope.floorUValue": 0.50,
  "envelope.windowUValue": 2.80,
  "envelope.windowGValue": 0.50,
  "envelope.windowArea": 30,
  "envelope.airChangesPerHour": 0.6,
  "envelope.ventilationType": "natural",
  // Energy — additional
  "energy.hasSolarThermal": false,
  "energy.transactionType": "none",
  "energy.primaryEnergyRatio": 1.0,
  "energy.pvPowerW": 0,
  "energy.hasTIM": false,
  "energy.certificateAgeYears": 0,
  "energy.isGES": false,
  "energy.energyClass": "B",
  // Systems
  "systems.heatingType": "split_ac",
  "systems.coolingType": "split_ac",
  "systems.dhwType": "gas_boiler",
  "systems.dhwSystem": "gas_boiler",
  "systems.hasSolarThermal": false,
  "systems.hasSolarPV": false,
  // Waste — additional
  "waste.asbestosPresent": false,
  "waste.totalRCDTonnes": 50,
  "waste.recyclingRate": 70,
  // Electrical — detail fields
  "electrical.supplyType": "single_phase",
  "electrical.contractedPower": 6.9,
  // Location
  "location.district": "Lisboa",
  "location.municipality": "Lisboa",
  "location.climateZoneWinter": "I1",
  "location.climateZoneSummer": "V2",
  "location.altitude": 50,
  "location.distanceToCoast": 5,
  "location.summerExteriorTemp": 35,
  // Municipal / PDM
  "municipal.proposedUse": "residential",
  // Drainage — residential compliant defaults (RGSPPDADAR)
  "drainage.diametroMinimoMm": 110,
  "drainage.decliveMinimoMmM": 20,
  "drainage.alturaMinimaM": 2.0,
  "drainage.distanciaMinimaM": 1.5,
  "drainage.dimensaoProfundidadeMenor25M": 0.80,
  "drainage.afastamentoMaximoM": 15,
  "drainage.velocidadeMinimaMs": 0.6,
  "drainage.diametroMinimoColectoresMm": 200,
  "drainage.profundidadeMinimaColectoresM": 1.0,
  "drainage.velocidadeMaximaDomesticosMS": 3.0,
  "drainage.diametroMinimoRamaisLigacaoMm": 125,
  "drainage.afastamentoMaximoNaoVisitaveisM": 15,
  "drainage.dimensaoMinimaProfMenor25M": 0.60,
  "drainage.profundidadeLimitePatamaresM": 1.50,
  "drainage.inclinacaoMinimaSoleiraPercentagem": 1,
  "drainage.desnivelLimiteQuedaGuiadaM": 1.50,
  "drainage.sarjetaLarguraAberturaCm": 10,
  "drainage.diametroMinimoColectorLigacaoMm": 200,
  "drainage.inclinacaoMinimaPercentagem": 0.5,
  "drainage.anguloMaximoInsercaoGraus": 67.5,
  "drainage.temperaturaMaximaEfluenteC": 30,
  "drainage.taxaEnchimentoMaxDomesticoAte500mm": 0.5,
  "drainage.factorAfluenciaMinimo": 1.2,
  "drainage.tempoRetencaoMaximoMin": 30,
  "drainage.pressao": 10,
  "drainage.stormwater.divisor": 2,
  "drainage.stormwater.tempoConcentracaoMin": 5,
  "drainage.stormwater.tempoConcentracaoMinMin": 5,
  "drainage.stormwater.periodoRetornoTipicoMinAnos": 5,
};

// ----------------------------------------------------------
// RGEU General Defaults — Portuguese residential building norms
// ----------------------------------------------------------

const RGEU_RESIDENTIAL_DEFAULTS: Record<string, unknown> = {
  // Typology
  "general.typology": "T2",
  "general.floorsAboveGround": 2,
  "general.isMultifamily": true,
  "general.totalDwellingArea": 75,
  // Bedrooms (Art. 66-67)
  "general.mainBedroomArea": 10.5,
  "general.mainBedroomWidth": 2.70,
  "general.bedroomArea": 9.0,
  "general.bedroomWidth": 2.40,
  "general.numBedrooms": 2,
  "general.allBedroomsHaveNaturalLight": true,
  // Living room (Art. 66-67)
  "general.livingRoomArea": 12.0,
  "general.livingRoomWidth": 3.00,
  // Kitchen (Art. 66-67)
  "general.kitchenArea": 6.0,
  "general.kitchenWidth": 2.10,
  "general.kitchenHasNaturalLight": true,
  "general.kitchenHasExhaust": true,
  "general.kitchenHasImpermeableFloor": true,
  "general.kitchenTileHeight": 1.50,
  // WC (Art. 68-69)
  "general.wcArea": 3.5,
  "general.wcWidth": 1.50,
  "general.wcDoorWidth": 0.70,
  "general.wcHasImpermeableFloor": true,
  "general.wcHasVentilation": true,
  "general.wcTileHeight": 1.50,
  "general.numBathrooms": 1,
  "general.numFullBathrooms": 1,
  "general.hasBathtub": true,
  "general.halfBathArea": 1.5,
  "general.halfBathWidth": 1.20,
  // Pantry / Storage
  "general.pantryArea": 2.0,
  "general.pantryWidth": 1.10,
  "general.storageArea": 2.0,
  "general.storageHeight": 2.40,
  // Corridors (Art. 70)
  "general.corridorWidth": 1.10,
  "general.shortCorridorWidth": 0.90,
  "general.corridorLength": 5.0,
  "general.commonCorridorWidth": 1.10,
  // Floor heights (Art. 65)
  "general.nonHabitableHeight": 2.40,
  "general.basementHeight": 2.40,
  "general.garageHeight": 2.20,
  "general.atticHeight": 2.40,
  "general.roomDepthToHeightRatio": 2.5,
  // Doors (Art. 71)
  "general.mainDoorWidth": 0.87,
  "general.mainDoorHeight": 2.10,
  "general.interiorDoorWidth": 0.77,
  "general.buildingEntryDoorWidth": 0.87,
  "general.commonAreaDoorWidth": 0.87,
  // Stairs — private (Art. 73)
  "general.stairWidth": 0.90,
  "general.stairRiserHeight": 0.175,
  "general.stairTreadDepth": 0.28,
  "general.stairBlondelValue": 0.63,
  "general.stairHasHandrail": true,
  "general.stairLandingDepth": 0.90,
  "general.stairLiveLoad": 3.0,
  "general.numSteps": 18,
  "general.consecutiveSteps": 18,
  // Stairs — common (Art. 73)
  "general.commonStairWidth": 1.10,
  "general.commonStairRiserHeight": 0.175,
  "general.commonStairTreadDepth": 0.28,
  "general.commonStairBlondel": 0.63,
  "general.commonStairLandingDepth": 1.10,
  "general.commonStairHasHandrailsBothSides": true,
  "general.publicStairWidth": 1.20,
  // Guard rails (Art. 74)
  "general.guardRailHeight": 1.10,
  "general.interiorGuardRailHeight": 0.90,
  "general.guardRailSpacing": 0.12,
  // Ramps
  "general.accessRampSlope": 8,
  "general.accessibleRampSlope": 6,
  // Entry
  "general.entryHallWidth": 1.40,
  "general.entryLandingDepth": 1.20,
  // Walls
  "general.extWallThickness": 0.30,
  "general.extWallMaterial": "double_brick",
  "general.interiorPartitionThickness": 0.11,
  "general.partitionWallThickness": 0.15,
  "general.boundaryWallThickness": 0.22,
  // Fences & yard
  "general.frontFenceHeight": 1.50,
  "general.frontFenceTransparency": 50,
  "general.frontWallHeight": 1.50,
  "general.sideWallHeight": 1.80,
  "general.yardDepth": 6.0,
  "general.yardHasDrainage": true,
  "general.permeableYardRatio": 30,
  "general.groundFloorElevation": 0.20,
  // Balcony
  "general.balconyDepth": 1.20,
  "general.balconyHasWaterproofing": true,
  "general.balconyLiveLoad": 3.0,
  // Roof
  "general.roofType": "pitched",
  "general.roofSlopePercent": 30,
  "general.flatRoofSlopePercent": 2,
  "general.roofHasThermalInsulation": true,
  "general.roofHasMaintenanceAccess": true,
  // Acoustic / sound
  "general.hasAcousticInsulation": true,
  "general.floorHasSoundInsulation": true,
  "general.impactSoundLevel": 60,
  "general.facadeSoundInsulation": 28,
  "general.interDwellingSoundInsulation": 50,
  // Structural / loads
  "general.floorLiveLoad": 2.0,
  "general.floorDeflectionRatio": 250,
  // Elevator
  "general.hasElevator": false,
  "general.elevatorCabinArea": 1.56,
  // Garage
  "general.parkingSpaceWidth": 2.50,
  "general.parkingSpaceLength": 5.00,
  "general.garageAisleWidth": 5.00,
  "general.garageRampSlope": 15,
  "general.garageRampWidth": 3.00,
  "general.garageVentilationArea": 0.5,
  "general.garageFireResistance": 60,
  // Emergency
  "general.emergencyExitWidth": 0.90,
  "general.maxDeadEndDistance": 15,
  "general.exteriorWalkwayWidth": 1.20,
  // Chimney
  "general.chimneyHeightAboveRidge": 0.50,
  "general.flueIsFireResistant": true,
  "general.flueSectionArea": 0.02,
  // Gas/ventilation/waterproofing
  "general.hasGasAppliances": false,
  "general.gasRoomVentArea": 0.02,
  "general.hasNaturalVentilation": true,
  "general.hasCrossVentilation": true,
  "general.basementHasNaturalVentilation": true,
  "general.hasWaterproofing": true,
  "general.hasThermalInsulation": true,
  "general.basementIsWaterproof": true,
  "general.basementUsedAsHabitation": false,
  // Utilities
  "general.hasWaterAndSewage": true,
  "general.hasIndividualWaterMeter": true,
  "general.hasElectricalInstallation": true,
  "general.hasCommonElectricalPanel": true,
  "general.hasCanteen": false,
  "general.hasChangingRooms": false,
};

/** Merge specialty + RGEU defaults for residential */
const RESIDENTIAL_DEFAULTS: Record<string, unknown> = {
  ...SPECIALTY_DEFAULTS_RESIDENTIAL,
  ...RGEU_RESIDENTIAL_DEFAULTS,
};

const COMMERCIAL_DEFAULTS: Record<string, unknown> = {
  ...SPECIALTY_DEFAULTS_RESIDENTIAL,
  // Override specialty-level for commercial
  "fireSafety.utilizationType": "VIII",
  "fireSafety.riskCategory": "2",
  "fireSafety.hasEmergencyLighting": true,
  "accessibility.doorWidths": 0.87,
  "accessibility.corridorWidths": 1.20,
  "gas.hasGasInstallation": false,
  "licensing.operationType": "building_permit",
  // Commercial RGEU overrides
  "general.typology": "commercial",
  "general.isMultifamily": false,
  "general.commercialFloorHeight": 3.00,
  "general.commercialBasementHeight": 2.70,
  "general.commercialExitWidth": 1.20,
  "general.commercialLuxLevel": 300,
  "general.commercialVentilationRate": 35,
  "general.commercialWcRatio": 25,
};

const DEFAULTS_BY_TYPE: Record<BuildingType, Record<string, unknown>> = {
  residential: RESIDENTIAL_DEFAULTS,
  commercial: { ...RGEU_RESIDENTIAL_DEFAULTS, ...COMMERCIAL_DEFAULTS },
  mixed: { ...RESIDENTIAL_DEFAULTS, ...COMMERCIAL_DEFAULTS },
  industrial: {
    ...RGEU_RESIDENTIAL_DEFAULTS,
    ...COMMERCIAL_DEFAULTS,
    "fireSafety.utilizationType": "XII",
    "fireSafety.riskCategory": "2",
    "general.typology": "industrial",
    "general.industrialHeight": 6.0,
    "general.industrialLiveLoad": 5.0,
    "general.industrialVentilationRate": 50,
    "general.industrialWorkersPerWc": 25,
    "general.industrialExitWidthPerOccupant": 0.01,
    "general.warehouseHeight": 6.0,
    "general.warehouseLiveLoad": 7.5,
    "general.warehouseVentRatio": 2.5,
  },
};

function applyDefaults(
  enriched: Record<string, unknown>,
  buildingType: BuildingType,
  fieldMappings?: FieldMapping[]
): string[] {
  const applied: string[] = [];

  // Apply top-level defaults
  if (enriched.isDemolition === undefined) {
    enriched.isDemolition = false;
  }
  if (enriched.isRehabilitation === undefined) {
    enriched.isRehabilitation = false;
  }
  if (enriched.isMajorRehabilitation === undefined) {
    enriched.isMajorRehabilitation = false;
  }
  if (enriched.projectPhase === undefined) {
    enriched.projectPhase = "licensing";
  }

  // Apply type-based defaults
  const typeDefaults = DEFAULTS_BY_TYPE[buildingType] ?? {};
  for (const [field, value] of Object.entries(typeDefaults)) {
    if (getFieldValue(enriched, field) === undefined) {
      setFieldValue(enriched, field, value);
      applied.push(field);
    }
  }

  // Apply field-mapping specific defaults
  if (fieldMappings) {
    for (const mapping of fieldMappings) {
      if (!mapping.field) continue; // Skip group headers
      if (getFieldValue(enriched, mapping.field) !== undefined) continue;
      if (!mapping.defaults) continue;

      const value = mapping.defaults[buildingType] ?? mapping.defaults._default;
      if (value !== undefined) {
        setFieldValue(enriched, mapping.field, value);
        applied.push(mapping.field);
      }
    }
  }

  return applied;
}

// ----------------------------------------------------------
// Alias Resolution
// ----------------------------------------------------------

/**
 * Add alias keys to the enriched object so both namespaces resolve.
 * e.g. enriched.elevator points to the same data as enriched.elevators.
 */
function applyAliases(enriched: Record<string, unknown>): string[] {
  const applied: string[] = [];

  for (const [alias, canonical] of Object.entries(NAMESPACE_ALIASES)) {
    // If canonical exists, create alias pointing to it
    if (enriched[canonical] !== undefined && enriched[alias] === undefined) {
      enriched[alias] = enriched[canonical];
      applied.push(`${alias} → ${canonical}`);
    }
    // If alias exists but canonical doesn't, create canonical
    else if (enriched[alias] !== undefined && enriched[canonical] === undefined) {
      enriched[canonical] = enriched[alias];
      applied.push(`${canonical} → ${alias}`);
    }
  }

  // Special: "ited" and "itur" are sub-namespaces of telecommunications
  // Rules reference "ited.ateWidth" etc. — need to be directly on enriched
  const telecom = enriched["telecommunications"] as Record<string, unknown> | undefined;
  if (telecom) {
    if (!enriched["ited"]) {
      enriched["ited"] = telecom;
      applied.push("ited → telecommunications");
    }
    if (!enriched["itur"]) {
      enriched["itur"] = telecom;
      applied.push("itur → telecommunications");
    }
  }

  return applied;
}

// ----------------------------------------------------------
// Cross-Population: top-level → specialty namespaces
// ----------------------------------------------------------

/**
 * Some rules reference top-level project fields via specialty namespaces
 * (e.g. fireSafety.buildingHeight, architecture.typology).
 * This copies values from the canonical location into specialty sub-objects
 * so rules can resolve them.
 */
function crossPopulateFields(enriched: Record<string, unknown>): void {
  const topLevel = {
    buildingHeight: enriched.buildingHeight,
    numberOfFloors: enriched.numberOfFloors,
    grossFloorArea: enriched.grossFloorArea,
    usableFloorArea: enriched.usableFloorArea,
    numberOfDwellings: enriched.numberOfDwellings,
    buildingType: enriched.buildingType,
    isRehabilitation: enriched.isRehabilitation,
    yearBuilt: enriched.yearBuilt,
  };

  // Namespaces that rules use to reference top-level fields
  const targets = ["fireSafety", "accessibility", "structural", "architecture", "acoustic", "energy"];

  for (const ns of targets) {
    if (!enriched[ns] || typeof enriched[ns] !== "object") {
      enriched[ns] = {};
    }
    const section = enriched[ns] as Record<string, unknown>;
    for (const [key, value] of Object.entries(topLevel)) {
      if (value !== undefined && section[key] === undefined) {
        section[key] = value;
      }
    }
  }
}

// ----------------------------------------------------------
// Main Entry Point
// ----------------------------------------------------------

export interface BuildContextOptions {
  /** IFC data extracted from uploaded file (basic parser) */
  ifcData?: IfcExtractedData;
  /** IFC specialty analysis results (deep parser - structural, MEP, etc.) */
  ifcSpecialtyAnalyses?: SpecialtyAnalysisResult[];
  /** Field mappings for specialty-specific extraction and defaults */
  fieldMappings?: FieldMapping[];
  /** Whether to apply smart defaults for undefined fields */
  applySmartDefaults?: boolean;
  /** Extra fields to inject (from form input or other sources) */
  extraFields?: Record<string, unknown>;
}

/**
 * Build an enriched project context ready for rule evaluation.
 *
 * Execution order:
 * 1. Start with base project data (from form input)
 * 2. Merge IFC-extracted fields (won't overwrite existing)
 * 3. Merge extra fields (from dynamic form sections)
 * 4. Apply smart defaults for undefined fields
 * 5. Create virtual namespaces (building.*, project.*)
 * 6. Apply namespace aliases (elevator↔elevators, etc.)
 * 7. Return enriched object + coverage report
 */
export function buildProjectContext(
  project: BuildingProject,
  options: BuildContextOptions = {}
): { enriched: BuildingProject; report: ContextBuildReport } {
  const {
    ifcData,
    ifcSpecialtyAnalyses,
    fieldMappings = [],
    applySmartDefaults = true,
    extraFields,
  } = options;

  const report: ContextBuildReport = {
    fromIfc: [],
    fromForm: [],
    fromDefaults: [],
    fromLocation: [],
    stillMissing: [],
    aliasesApplied: [],
    coverage: { total: 0, populated: 0, percentage: 0 },
  };

  // Start with a deep copy of the project
  let enriched = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;

  // Step 1: Identify which fields are already present (from form input)
  for (const mapping of fieldMappings) {
    if (!mapping.field) continue; // Skip group headers (_group entries)
    if (getFieldValue(enriched, mapping.field) !== undefined) {
      report.fromForm.push(mapping.field);
    }
  }

  // Step 2: Merge IFC-extracted data
  if (ifcData) {
    const ifcFields = extractFromIfc(ifcData, fieldMappings);
    const before = countDefinedFields(enriched, fieldMappings);
    enriched = deepMerge(enriched, ifcFields);
    const after = countDefinedFields(enriched, fieldMappings);
    // Track which fields came from IFC
    for (const mapping of fieldMappings) {
      if (!mapping.field) continue; // Skip group headers
      if (getFieldValue(enriched, mapping.field) !== undefined && !report.fromForm.includes(mapping.field)) {
        report.fromIfc.push(mapping.field);
      }
    }
    // Also track standard IFC fields not in mappings
    if (after > before) {
      report.fromIfc.push(`(${after - before} standard fields)`);
    }
  }

  // Step 2b: Merge IFC specialty analysis data (deep parser: structural counts, MEP, etc.)
  if (ifcSpecialtyAnalyses && ifcSpecialtyAnalyses.length > 0) {
    const { fields: specialtyFields, report: ifcEnrichReport } = specialtyAnalysisToProjectFields(ifcSpecialtyAnalyses);
    enriched = deepMerge(enriched, specialtyFields);
    report.fromIfc.push(...ifcEnrichReport.populatedFields.map(f => f.field));

    // Step 2c: Declarative entity-based extraction from field-mappings ifcMapping
    const declarativeFields = extractFromSpecialtyAnalyses(ifcSpecialtyAnalyses, fieldMappings);
    const beforeDecl = countDefinedFields(enriched, fieldMappings);
    enriched = deepMerge(enriched, declarativeFields);
    const afterDecl = countDefinedFields(enriched, fieldMappings);
    if (afterDecl > beforeDecl) {
      report.fromIfc.push(`(${afterDecl - beforeDecl} declarative IFC fields)`);
    }
  }

  // Step 2d: Municipality auto-derivation
  // If municipality is set, derive seismic zones, climate zones, soil type, etc.
  const municipalityName = getFieldValue(enriched, "location.municipality") as string | undefined;
  if (municipalityName) {
    const altitude = getFieldValue(enriched, "location.altitude") as number | undefined;
    const resolved = resolveLocationParams(municipalityName, altitude ?? undefined);
    if (resolved) {
      const locationFields: [string, unknown][] = [
        ["location.district", resolved.district],
        ["location.climateZoneWinter", resolved.climateZoneWinter],
        ["location.climateZoneSummer", resolved.climateZoneSummer],
        ["location.heatingDegreeDays", resolved.heatingDegreeDays],
        ["location.heatingSeasonMonths", resolved.heatingSeasonMonths],
        ["location.summerExternalTemp", resolved.summerExternalTemp],
        ["location.solarRadiationSouth", resolved.solarRadiationSouth],
        ["location.latitude", resolved.lat],
        ["location.longitude", resolved.lon],
        ["structural.seismicZone", resolved.seismicZoneType1],
        ["structural.seismicZoneType2", resolved.seismicZoneType2],
        ["structural.soilType", resolved.soilType],
      ];
      for (const [field, value] of locationFields) {
        const existing = getFieldValue(enriched, field);
        if (existing === undefined || existing === null) {
          setFieldValue(enriched, field, value);
          report.fromLocation.push(field);
        }
      }
    }
  }

  // Step 3: Merge extra fields
  if (extraFields) {
    enriched = deepMerge(enriched, extraFields);
  }

  // Step 4: Apply smart defaults
  if (applySmartDefaults) {
    const buildingType = (enriched.buildingType as BuildingType) ?? "residential";
    report.fromDefaults = applyDefaults(enriched, buildingType, fieldMappings);
  }

  // Step 5: Create virtual namespaces
  const virtualNs = buildVirtualNamespaces(enriched as unknown as BuildingProject);
  for (const [ns, data] of Object.entries(virtualNs)) {
    if (!enriched[ns]) {
      enriched[ns] = data;
    }
  }

  // Step 6: Apply namespace aliases
  report.aliasesApplied = applyAliases(enriched);

  // Step 6b: Cross-populate top-level fields into specialty namespaces
  // Rules like fireSafety.buildingHeight expect the value from the top-level field
  crossPopulateFields(enriched);

  // Step 7: Calculate coverage (filter out group headers that have no field)
  const actualMappings = fieldMappings.filter(m => m.field);
  if (actualMappings.length > 0) {
    report.coverage.total = actualMappings.length;
    report.coverage.populated = actualMappings.filter(
      m => getFieldValue(enriched, m.field) !== undefined
    ).length;
    report.coverage.percentage = Math.round(
      (report.coverage.populated / report.coverage.total) * 100
    );
    report.stillMissing = actualMappings
      .filter(m => getFieldValue(enriched, m.field) === undefined)
      .map(m => m.field);
  }

  return {
    enriched: enriched as unknown as BuildingProject,
    report,
  };
}

// ----------------------------------------------------------
// Coverage Analysis
// ----------------------------------------------------------

function countDefinedFields(obj: Record<string, unknown>, mappings: FieldMapping[]): number {
  return mappings.filter(m => m.field && getFieldValue(obj, m.field) !== undefined).length;
}

/**
 * Analyze how many rules can be evaluated with the current project data.
 * Returns per-specialty coverage stats.
 */
export function analyzeRuleCoverage(
  project: BuildingProject,
  rules: Array<{ id: string; conditions: Array<{ field: string; operator: string }> }>
): {
  total: number;
  evaluable: number;
  skipped: number;
  percentage: number;
  missingFields: string[];
  byNamespace: Record<string, { total: number; evaluable: number }>;
} {
  const enriched = project as unknown as Record<string, unknown>;
  const missingFieldsSet = new Set<string>();
  let evaluable = 0;
  let skipped = 0;
  const byNamespace: Record<string, { total: number; evaluable: number }> = {};

  for (const rule of rules) {
    const namespace = rule.conditions[0]?.field.split(".")[0] ?? "unknown";
    if (!byNamespace[namespace]) byNamespace[namespace] = { total: 0, evaluable: 0 };
    byNamespace[namespace].total++;

    const canEvaluate = rule.conditions.every(c => {
      if (c.operator === "not_exists") return true;
      if (c.operator.startsWith("lookup_")) return true;
      const val = getFieldValue(enriched, c.field);
      if (val === undefined) {
        missingFieldsSet.add(c.field);
        return false;
      }
      return true;
    });

    if (canEvaluate) {
      evaluable++;
      byNamespace[namespace].evaluable++;
    } else {
      skipped++;
    }
  }

  return {
    total: rules.length,
    evaluable,
    skipped,
    percentage: rules.length > 0 ? Math.round((evaluable / rules.length) * 100) : 0,
    missingFields: Array.from(missingFieldsSet).sort(),
    byNamespace,
  };
}

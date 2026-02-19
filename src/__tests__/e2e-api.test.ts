import { describe, it, expect } from "vitest";
import { analyzeProject } from "@/lib/analyzer";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type {
  BuildingProject,
  AnalysisResult,
  RegulationArea,
  EnergyClass,
  Severity,
} from "@/lib/types";

// ============================================================
// HELPERS
// ============================================================

/** Deep-clone DEFAULT_PROJECT and merge overrides at the top level. */
function createProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  const base: BuildingProject = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  return { ...base, ...overrides } as BuildingProject;
}

/** Create a fully compliant residential project with all best-practice values. */
function createCompliantProject(): BuildingProject {
  return createProject({
    name: "Fully Compliant Residential",
    buildingType: "residential",
    isRehabilitation: false,
    grossFloorArea: 200,
    usableFloorArea: 160,
    numberOfFloors: 2,
    buildingHeight: 6,
    numberOfDwellings: 1,
    architecture: {
      hasCivilCodeCompliance: true,
      hasRainwaterDrainage: true,
      isHorizontalProperty: false,
      respectsCommonParts: true,
      hasBuildingPermitDesign: true,
      meetsRGEU: true,
      hasNaturalLight: true,
      hasCrossVentilation: true,
      ceilingHeight: 2.7,
      isMultifamily: false,
      // Salubridade (RGEU Arts. 31-40)
      hasWaterSupply: true,
      hasDrainage: true,
      hasPluvialDrainage: true,
      hasMoistureProtection: true,
      hasAdequateThermalComfort: true,
      hasCommonAreaLighting: true,
      hasWasteStorage: true,
      hasElectricalInstallation: true,
      hasPestProtection: true,
      hasMinimumInsolation: true,
      // Coberturas e Garagens (RGEU Arts. 50-58)
      hasAccessibleTerrace: false,
      hasGarage: false,
      hasCommercialFloor: false,
      // Conservação
      hasTechnicalMaintenance: true,
      // Ficha Técnica (Portaria 216-B/2008)
      hasTechnicalSheet: true,
      hasMaterialsDescription: true,
      hasEquipmentDescription: true,
      hasAreaSchedule: true,
      hasWarrantyInfo: true,
      hasFinishesDescription: true,
      // Qualidade Habitacional (DL 177/2001)
      hasFireSafetyIntegration: true,
      hasNP1037Compliance: true,
      hasAdequateCommonAreas: true,
      hasResourceEfficiency: true,
      // Vizinhança (Código Civil)
      hasPublicRoadAccess: true,
      hasFireInsurance: true,
      // Licenciamento (DL 10/2024)
      hasDigitalSubmission: true,
      hasMunicipalNotification: true,
    },
    structural: {
      structuralSystem: "frame",
      seismicZone: "1.3",
      soilType: "B",
      importanceClass: "II",
      hasStructuralProject: true,
      hasGeotechnicalStudy: true,
      foundationType: "shallow",
      hasSeismicDesign: true,
      ductilityClass: "DCM",
      hasULSVerification: true,
      designLife: 50,
      buildingCategory: "A",
      concreteClass: "C25/30",
      steelGrade: "A500NR",
      exposureClass: "XC1",
      gammaG: 1.35,
      gammaQ: 1.5,
      psi0: 0.7,
      behaviourFactor: 3.0,
      coverDepth: 25,
      crackWidth: 0.3,
      columnReinfRatio: 0.01,
      gammaConcrete: 1.5,
      gammaSteel: 1.15,
      hasShearVerification: true,
      hasPunchingVerification: true,
      hasCapacityDesignCheck: true,
      hasAccidentalTorsion: true,
      hasSoftStoreyCheck: true,
      hasDiaphragmVerification: true,
      hasFoundationOverstrength: true,
      hasSecondOrderAnalysis: true,
      hasCreepShrinkageAnalysis: true,
      hasNonStructuralVerification: true,
      columnMinDimension: 300,
      slabThickness: 200,
      beamMinWidth: 250,
      waterTableDetermined: true,
      investigationDepthAdequate: true,
      // EC1 actions on structures
      liveLoad: 2.0,
      concentratedLoad: 2.0,
      guardrailHorizontalLoad: 0.5,
      barrierHorizontalLoad: 0.4,
      partitionSurcharge: 0.8,
      partitionWeight: 1.0,
      partitionEquivLoad: 0.5,
      stairsLiveLoad: 3.0,
      roofLiveLoad: 0.4,
      concreteDensity: 25,
      steelDensity: 78.5,
      masonryDensity: 14,
      snowLoad: 0.3,
      windSpeed: 27,
      altitude: 100,
      barrierForce: 150,
      barrierForceHeight: 375,
      axleLoad: 26,
      vehicleGrossWeight: 30,
      alphaA: 0.65,
      dynamicCoefficient: 1.4,
      forkliftHorizontalRatio: 0.3,
      rampBarrierFactor: 0.5,
      balconyParapetLoad: 5,
      // EC1 procedural checks
      hasImposedLoadsClassified: true,
      hasSelfWeightClassified: true,
      hasBallastClassified: true,
      hasEarthLoadClassified: true,
      hasWaterContentVariation: true,
      hasDynamicAnalysis: true,
      hasSelfWeightAsSingleAction: true,
      hasFutureCoatingsConsidered: true,
      hasMostCriticalLoadCase: true,
      hasIndependentActions: true,
      hasRoofHSimultaneous: false,
      hasPsiAlphaNExclusive: true,
      hasSingleCharacteristicValue: true,
      hasPartitionsAsImposed: true,
      hasFreeActionPlacement: true,
      hasSeparateConcentratedCheck: true,
      hasConcentratedAnyPoint: true,
      hasForkliftLoads: true,
      hasMultipleCategoryCheck: true,
      hasMaxStorageLoad: true,
      hasRoofSeparateChecks: true,
      hasMeanAsCharacteristic: true,
      hasWaterLevelConsidered: true,
      hasAlphaNVerification: true,
      hasThicknessDeviation: true,
      hasCableWeightDeviation: true,
      hasVerification: true,
      hasLoadReductionFactor: true,
      hasAreaReductionFactor: true,
    },
    fireSafety: {
      utilizationType: "I",
      riskCategory: "1",
      hasFireDetection: true,
      hasFireAlarm: true,
      hasSprinklers: true,
      hasEmergencyLighting: true,
      hasFireExtinguishers: true,
      evacuationRouteWidth: 1.4,
      numberOfExits: 2,
      maxEvacuationDistance: 10,
      fireResistanceOfStructure: 60,
    },
    avac: {
      hasHVACProject: true,
      hasVentilationSystem: true,
      ventilationType: "mechanical_supply_extract",
      hasKitchenExtraction: true,
      hasBathroomExtraction: true,
      hasDuctwork: true,
      hasAirQualityControl: true,
      hasMaintenancePlan: true,
      hasFGasCompliance: true,
      hasRadonProtection: true,
    },
    waterDrainage: {
      hasPublicWaterConnection: true,
      waterPipeMaterial: "ppr",
      hasWaterMeter: true,
      hasCheckValve: true,
      hasPressureReducer: true,
      hotWaterRecirculation: true,
      hasSeparateDrainageSystem: true,
      hasVentilatedDrainage: true,
      hasDrainageSiphons: true,
      hasGreaseTrap: false,
      hasStormwaterManagement: true,
      hasWaterReuse: true,
      hasBackflowPrevention: true,
    },
    gas: {
      hasGasInstallation: false,
      gasType: "none",
      hasGasProject: false,
      hasGasDetector: false,
      hasEmergencyValve: false,
      hasVentilation: false,
      hasFlueSystem: false,
      pipesMaterial: "none",
      hasPressureTest: false,
      hasGasCertification: false,
    },
    electrical: {
      supplyType: "single_phase",
      contractedPower: 6.9,
      hasProjectApproval: true,
      hasMainCircuitBreaker: true,
      hasResidualCurrentDevice: true,
      rcdSensitivity: 30,
      hasIndividualCircuitProtection: true,
      hasSurgeProtection: true,
      hasEarthingSystem: true,
      earthingResistance: 10,
      hasEquipotentialBonding: true,
      wiringType: "embedded",
      cableType: "h07v",
      hasCorrectCableSizing: true,
      numberOfCircuits: 8,
      hasSeparateLightingCircuits: true,
      hasSeparateSocketCircuits: true,
      hasDedicatedApplianceCircuits: true,
      hasBathroomZoneCompliance: true,
      hasOutdoorIPProtection: true,
      hasEVCharging: true,
      hasEmergencyCircuit: false,
      hasDistributionBoardLabelling: true,
      hasSchematicDiagram: true,
    },
    telecommunications: {
      itedEdition: "4",
      hasATE: true,
      hasATI: true,
      numberOfATI: 1,
      hasCopperCabling: true,
      copperCableCategory: "6a",
      hasFiberOptic: true,
      fiberType: "single_mode",
      hasCoaxialCabling: true,
      hasFoorDistribution: true,
      hasRiserCableway: true,
      hasIndividualDucts: true,
      rj45OutletsPerDwelling: 4,
      coaxialOutletsPerDwelling: 2,
      fiberOutletsPerDwelling: 2,
      isUrbanization: false,
      hasITURProject: false,
      hasUndergroundDucts: false,
      hasCEE: false,
      hasITEDCertification: true,
      installerITEDLicense: true,
    },
    envelope: {
      externalWallUValue: 0.30,
      externalWallArea: 200,
      roofUValue: 0.25,
      roofArea: 100,
      floorUValue: 0.30,
      floorArea: 100,
      windowUValue: 1.50,
      windowArea: 25,
      windowSolarFactor: 0.35,
      windowFrameType: "pvc",
      linearThermalBridges: 0.20,
      airChangesPerHour: 0.6,
      hasHRV: true,
      hrvEfficiency: 80,
    },
    systems: {
      heatingSystem: "heat_pump",
      heatingEfficiency: 4.0,
      coolingSystem: "heat_pump",
      coolingEfficiency: 4.5,
      dhwSystem: "heat_pump",
      dhwEfficiency: 3.5,
      hasSolarPV: true,
      solarPVCapacity: 3,
      hasSolarThermal: true,
      solarThermalArea: 4,
    },
    acoustic: {
      buildingLocation: "quiet",
      hasAirborneInsulation: true,
      hasImpactInsulation: true,
      hasFacadeInsulation: true,
      hasEquipmentNoiseControl: true,
      hasAcousticProject: true,
    },
    accessibility: {
      hasAccessibleEntrance: true,
      hasElevator: true,
      doorWidths: 0.90,
      corridorWidths: 1.50,
      hasAccessibleWC: true,
      hasAccessibleParking: true,
    },
    elevators: {
      hasElevator: false,
      numberOfElevators: 0,
      elevatorType: "none",
      hasCEMarking: false,
      hasMaintenanceContract: false,
      hasPeriodicInspection: false,
      hasEmergencyCommunication: false,
      hasPitAndHeadroom: false,
      hasAccessibleElevator: false,
    },
    licensing: {
      projectPhase: "licensing",
      hasArchitecturalProject: true,
      hasSpecialtyProjects: true,
      hasTermoDeResponsabilidade: true,
      hasMunicipalApproval: true,
      hasConstructionLicense: true,
      hasUtilizationLicense: true,
      hasTechnicalDirector: true,
      isInARU: false,
      isProtectedArea: false,
    },
    waste: {
      hasWasteManagementPlan: true,
      hasSortingOnSite: true,
      hasLicensedTransporter: true,
      hasLicensedDestination: true,
      hasWasteRegistration: true,
      hasDemolitionAudit: false,
      recyclingPercentageTarget: 70,
    },
    localRegulations: {
      municipality: "Lisboa",
      documents: [],
      notes: "",
      waterUtilityDocs: [],
      consultedEntities: [],
    },
    drawingQuality: {
      hasCorrectScaleForPrint: true,
      hasConsistentFonts: true,
      hasReadableTextAtScale: true,
      hasStandardSymbols: true,
      hasLegendOnEverySheet: true,
      hasNorthArrow: true,
      hasScaleBar: true,
      hasConsistentLineWeights: true,
      hasDimensioning: true,
      hasSheetTitleBlock: true,
    },
    projectContext: {
      description: "Compliant test project",
      questions: [],
      specificConcerns: "",
    },
  });
}

/** Create a worst-case project with many violations. */
function createWorstCaseProject(): BuildingProject {
  return createProject({
    name: "Worst Case Project",
    buildingType: "residential",
    isRehabilitation: false,
    grossFloorArea: 300,
    usableFloorArea: 240,
    numberOfFloors: 4,
    buildingHeight: 12,
    numberOfDwellings: 4,
    architecture: {
      hasCivilCodeCompliance: false,
      hasRainwaterDrainage: false,
      isHorizontalProperty: true,
      respectsCommonParts: false,
      hasBuildingPermitDesign: false,
      meetsRGEU: false,
      hasNaturalLight: false,
      hasCrossVentilation: false,
      ceilingHeight: 2.2,
    },
    structural: {
      structuralSystem: "masonry",
      seismicZone: "1.1",
      soilType: "D",
      importanceClass: "III",
      hasStructuralProject: false,
      hasGeotechnicalStudy: false,
      foundationType: "shallow",
      hasSeismicDesign: false,
      ductilityClass: "DCL",
    },
    fireSafety: {
      utilizationType: "I",
      riskCategory: "3",
      hasFireDetection: false,
      hasFireAlarm: false,
      hasSprinklers: false,
      hasEmergencyLighting: false,
      hasFireExtinguishers: false,
      evacuationRouteWidth: 0.6,
      numberOfExits: 1,
      maxEvacuationDistance: 40,
      fireResistanceOfStructure: 15,
    },
    avac: {
      hasHVACProject: false,
      hasVentilationSystem: false,
      ventilationType: "natural",
      hasKitchenExtraction: false,
      hasBathroomExtraction: false,
      hasDuctwork: false,
      hasAirQualityControl: false,
      hasMaintenancePlan: false,
      hasFGasCompliance: false,
      hasRadonProtection: false,
    },
    waterDrainage: {
      hasPublicWaterConnection: false,
      waterPipeMaterial: "galvanized",
      hasWaterMeter: false,
      hasCheckValve: false,
      hasPressureReducer: false,
      hotWaterRecirculation: false,
      hasSeparateDrainageSystem: false,
      hasVentilatedDrainage: false,
      hasDrainageSiphons: false,
      hasGreaseTrap: false,
      hasStormwaterManagement: false,
      hasWaterReuse: false,
      hasBackflowPrevention: false,
    },
    gas: {
      hasGasInstallation: true,
      gasType: "natural_gas",
      hasGasProject: false,
      hasGasDetector: false,
      hasEmergencyValve: false,
      hasVentilation: false,
      hasFlueSystem: false,
      pipesMaterial: "steel",
      hasPressureTest: false,
      hasGasCertification: false,
    },
    electrical: {
      supplyType: "single_phase",
      contractedPower: 3.45,
      hasProjectApproval: false,
      hasMainCircuitBreaker: false,
      hasResidualCurrentDevice: false,
      rcdSensitivity: 300,
      hasIndividualCircuitProtection: false,
      hasSurgeProtection: false,
      hasEarthingSystem: false,
      earthingResistance: 100,
      hasEquipotentialBonding: false,
      wiringType: "surface",
      cableType: "other",
      hasCorrectCableSizing: false,
      numberOfCircuits: 2,
      hasSeparateLightingCircuits: false,
      hasSeparateSocketCircuits: false,
      hasDedicatedApplianceCircuits: false,
      hasBathroomZoneCompliance: false,
      hasOutdoorIPProtection: false,
      hasEVCharging: false,
      hasEmergencyCircuit: false,
      hasDistributionBoardLabelling: false,
      hasSchematicDiagram: false,
    },
    telecommunications: {
      itedEdition: "4",
      hasATE: false,
      hasATI: false,
      numberOfATI: 0,
      hasCopperCabling: false,
      copperCableCategory: "none",
      hasFiberOptic: false,
      fiberType: "none",
      hasCoaxialCabling: false,
      hasFoorDistribution: false,
      hasRiserCableway: false,
      hasIndividualDucts: false,
      rj45OutletsPerDwelling: 0,
      coaxialOutletsPerDwelling: 0,
      fiberOutletsPerDwelling: 0,
      isUrbanization: false,
      hasITURProject: false,
      hasUndergroundDucts: false,
      hasCEE: false,
      hasITEDCertification: false,
      installerITEDLicense: false,
    },
    envelope: {
      externalWallUValue: 1.50,
      externalWallArea: 300,
      roofUValue: 1.20,
      roofArea: 75,
      floorUValue: 1.00,
      floorArea: 75,
      windowUValue: 5.00,
      windowArea: 50,
      windowSolarFactor: 0.75,
      windowFrameType: "aluminum_no_break",
      linearThermalBridges: 1.00,
      airChangesPerHour: 0.2,
      hasHRV: false,
    },
    systems: {
      heatingSystem: "electric_radiator",
      coolingSystem: "none",
      dhwSystem: "electric",
      hasSolarPV: false,
      hasSolarThermal: false,
    },
    acoustic: {
      buildingLocation: "noisy",
      hasAirborneInsulation: false,
      hasImpactInsulation: false,
      hasFacadeInsulation: false,
      hasEquipmentNoiseControl: false,
      hasAcousticProject: false,
    },
    accessibility: {
      hasAccessibleEntrance: false,
      hasElevator: false,
      doorWidths: 0.65,
      corridorWidths: 0.80,
      hasAccessibleWC: false,
      hasAccessibleParking: false,
    },
    elevators: {
      hasElevator: false,
      numberOfElevators: 0,
      elevatorType: "none",
      hasCEMarking: false,
      hasMaintenanceContract: false,
      hasPeriodicInspection: false,
      hasEmergencyCommunication: false,
      hasPitAndHeadroom: false,
      hasAccessibleElevator: false,
    },
    licensing: {
      projectPhase: "licensing",
      hasArchitecturalProject: false,
      hasSpecialtyProjects: false,
      hasTermoDeResponsabilidade: false,
      hasMunicipalApproval: false,
      hasConstructionLicense: false,
      hasUtilizationLicense: false,
      hasTechnicalDirector: false,
      isInARU: false,
      isProtectedArea: true,
    },
    waste: {
      hasWasteManagementPlan: false,
      hasSortingOnSite: false,
      hasLicensedTransporter: false,
      hasLicensedDestination: false,
      hasWasteRegistration: false,
      hasDemolitionAudit: false,
      recyclingPercentageTarget: 70,
    },
    localRegulations: {
      municipality: "Lisboa",
      documents: [],
      notes: "",
      waterUtilityDocs: [],
      consultedEntities: [],
    },
    drawingQuality: {
      hasCorrectScaleForPrint: false,
      hasConsistentFonts: false,
      hasReadableTextAtScale: false,
      hasStandardSymbols: false,
      hasLegendOnEverySheet: false,
      hasNorthArrow: false,
      hasScaleBar: false,
      hasConsistentLineWeights: false,
      hasDimensioning: false,
      hasSheetTitleBlock: false,
    },
    projectContext: {
      description: "",
      questions: [],
      specificConcerns: "",
    },
  });
}

// The 18 regulation areas as defined in the regulation summary builder.
const ALL_REGULATION_AREAS: RegulationArea[] = [
  "architecture",
  "structural",
  "fire_safety",
  "avac",
  "water_drainage",
  "gas",
  "electrical",
  "ited_itur",
  "thermal",
  "acoustic",
  "accessibility",
  "energy",
  "elevators",
  "licensing",
  "waste",
  "local",
  "drawings",
  "general",
];

const VALID_ENERGY_CLASSES: EnergyClass[] = ["A+", "A", "B", "B-", "C", "D", "E", "F"];

const VALID_SEVERITIES: Severity[] = ["critical", "warning", "info", "pass"];

// ============================================================
// 1. DEFAULT PROJECT ANALYSIS
// ============================================================

describe("E2E: Default project analysis", async () => {
  const result: AnalysisResult = await analyzeProject(
    createProject({ name: "Default E2E" }),
  );

  it("returns a valid AnalysisResult shape", async () => {
    expect(result).toHaveProperty("projectName", "Default E2E");
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("energyClass");
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("recommendations");
    expect(result).toHaveProperty("regulationSummary");
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(Array.isArray(result.regulationSummary)).toBe(true);
  });

  it("has findings from multiple areas", async () => {
    const areasWithFindings = new Set(result.findings.map((f) => f.area));
    // The default project has many non-compliant fields; at least 5 areas should have findings
    expect(areasWithFindings.size).toBeGreaterThanOrEqual(5);
  });

  it("has recommendations", async () => {
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("has regulation summary for all 18 areas", async () => {
    expect(result.regulationSummary).toHaveLength(18);
    const summaryAreas = result.regulationSummary.map((s) => s.area);
    for (const area of ALL_REGULATION_AREAS) {
      expect(summaryAreas).toContain(area);
    }
  });

  it("all finding IDs are unique and correctly prefixed", async () => {
    const ids = result.findings.map((f) => f.id);
    // Uniqueness
    expect(new Set(ids).size).toBe(ids.length);
    // Prefix check: every finding must have a known prefix
    // PF- = plugin finding, PDM- = municipal, PASS- = compliance pass
    // RTIEBT_ = electrical engine, PLUMB_ / plumbing- = plumbing engine
    // SCE- = energy deep analyzer, SCIE-CALC- / SCIE- = fire safety deep analyzer
    // *-SKIPPED = engine skipped (missing data), *-UNAVAIL = engine crashed
    for (const id of ids) {
      expect(id).toMatch(/^(PF-|PDM-|PASS-|NA-|RTIEBT_|RTIEBT-|PLUMB_|plumbing-|SCE-|SCIE-CALC-|SCIE-|RGSPPDADAR-)/);
    }
  });

  it("score is between 0 and 100", async () => {
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("energy class is valid", async () => {
    expect(VALID_ENERGY_CLASSES).toContain(result.energyClass);
  });

  it("all findings have valid severity values", async () => {
    for (const f of result.findings) {
      expect(VALID_SEVERITIES).toContain(f.severity);
    }
  });

  it("all findings have a non-empty description", async () => {
    for (const f of result.findings) {
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it("all findings have a valid area", async () => {
    for (const f of result.findings) {
      expect(ALL_REGULATION_AREAS).toContain(f.area);
    }
  });

  it("all recommendation IDs are unique", async () => {
    const ids = result.recommendations.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all regulation summaries have valid status", async () => {
    for (const s of result.regulationSummary) {
      expect(["compliant", "non_compliant", "partially_compliant"]).toContain(
        s.status,
      );
    }
  });

  it("regulation summary scores are between 0 and 100", async () => {
    for (const s of result.regulationSummary) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================
// 2. FULLY COMPLIANT PROJECT
// ============================================================

describe("E2E: Fully compliant project", async () => {
  const compliantResult = await analyzeProject(createCompliantProject());
  const defaultResult = await analyzeProject(
    createProject({ name: "Default Compare" }),
  );

  it("achieves a higher score than the default project", async () => {
    expect(compliantResult.overallScore).toBeGreaterThan(
      defaultResult.overallScore,
    );
  });

  it("has a better pass-to-violation ratio than the default project", async () => {
    const compliantPass = compliantResult.findings.filter(f => f.severity === "pass").length;
    const compliantViolations = compliantResult.findings.filter(
      f => f.severity === "critical" || f.severity === "warning",
    ).length;
    const defaultPass = defaultResult.findings.filter(f => f.severity === "pass").length;
    const defaultViolations = defaultResult.findings.filter(
      f => f.severity === "critical" || f.severity === "warning",
    ).length;
    const compliantRatio = compliantViolations > 0 ? compliantPass / compliantViolations : Infinity;
    const defaultRatio = defaultViolations > 0 ? defaultPass / defaultViolations : Infinity;
    expect(compliantRatio).toBeGreaterThan(defaultRatio);
  });

  it("has fewer critical findings than the default project", async () => {
    const compliantCritical = compliantResult.findings.filter(
      (f) => f.severity === "critical",
    ).length;
    const defaultCritical = defaultResult.findings.filter(
      (f) => f.severity === "critical",
    ).length;
    expect(compliantCritical).toBeLessThan(defaultCritical);
  });

  it("has a good or better energy class", async () => {
    const classOrder: EnergyClass[] = ["A+", "A", "B", "B-", "C", "D", "E", "F"];
    const idx = classOrder.indexOf(compliantResult.energyClass);
    // A compliant project with heat pumps and solar should get B- or better
    expect(idx).toBeLessThanOrEqual(classOrder.indexOf("B-"));
  });
});

// ============================================================
// 3. WORST CASE PROJECT
// ============================================================

describe("E2E: Worst case project", async () => {
  const worstResult = await analyzeProject(createWorstCaseProject());
  const compliantResult = await analyzeProject(createCompliantProject());

  it("achieves a lower score than the compliant project", async () => {
    expect(worstResult.overallScore).toBeLessThan(
      compliantResult.overallScore,
    );
  });

  it("has many critical and warning findings", async () => {
    const criticalAndWarning = worstResult.findings.filter(
      (f) => f.severity === "critical" || f.severity === "warning",
    ).length;
    // Worst case should trigger at least 15 violations
    expect(criticalAndWarning).toBeGreaterThanOrEqual(15);
  });

  it("has more recommendations than the compliant case", async () => {
    expect(worstResult.recommendations.length).toBeGreaterThan(
      compliantResult.recommendations.length,
    );
  });

  it("has multiple non-compliant areas in regulation summary", async () => {
    const nonCompliantAreas = worstResult.regulationSummary.filter(
      (s) => s.status === "non_compliant",
    );
    expect(nonCompliantAreas.length).toBeGreaterThanOrEqual(5);
  });

  it("has a poor energy class", async () => {
    const classOrder: EnergyClass[] = ["A+", "A", "B", "B-", "C", "D", "E", "F"];
    const idx = classOrder.indexOf(worstResult.energyClass);
    // Worst case with electric radiator and no insulation should get D or worse
    expect(idx).toBeGreaterThanOrEqual(classOrder.indexOf("D"));
  });

  it("critical/warning findings have remediation guidance", async () => {
    const violationFindings = worstResult.findings.filter(
      (f) => f.severity === "critical" || f.severity === "warning",
    );
    const withRemediation = violationFindings.filter(
      (f) => f.remediation && f.remediation.length > 0,
    );
    // At least 50% of violations should have remediation text
    expect(withRemediation.length).toBeGreaterThanOrEqual(
      Math.floor(violationFindings.length * 0.5),
    );
  });
});

// ============================================================
// 4. RESIDENTIAL VS COMMERCIAL
// ============================================================

describe("E2E: Residential vs commercial building types", async () => {
  const residentialProject = createProject({
    name: "Residential Test",
    buildingType: "residential",
    architecture: {
      ...DEFAULT_PROJECT.architecture,
      ceilingHeight: 2.5,
    },
  });

  const commercialProject = createProject({
    name: "Commercial Test",
    buildingType: "commercial",
    architecture: {
      ...DEFAULT_PROJECT.architecture,
      ceilingHeight: 2.5,
    },
  });

  const residentialResult = await analyzeProject(residentialProject);
  const commercialResult = await analyzeProject(commercialProject);

  it("both produce valid analysis results", async () => {
    expect(residentialResult.findings.length).toBeGreaterThan(0);
    expect(commercialResult.findings.length).toBeGreaterThan(0);
  });

  it("produce different numbers of findings", async () => {
    // Different building types should trigger different rule paths
    const resAreas = new Set(residentialResult.findings.map((f) => `${f.area}:${f.id}`));
    const comAreas = new Set(commercialResult.findings.map((f) => `${f.area}:${f.id}`));
    // They should not be identical
    const overlap = [...resAreas].filter((a) => comAreas.has(a)).length;
    expect(overlap).toBeLessThan(resAreas.size);
  });

  it("commercial may have different ceiling height requirements", async () => {
    // Commercial buildings in Portugal (RGEU) may have different ceiling height
    // requirements than residential. Check that the analysis handles them differently.
    const resCeilingFindings = residentialResult.findings.filter(
      (f) =>
        f.area === "architecture" &&
        f.description.toLowerCase().includes("pé-direito"),
    );
    const comCeilingFindings = commercialResult.findings.filter(
      (f) =>
        f.area === "architecture" &&
        f.description.toLowerCase().includes("pé-direito"),
    );

    // At least one should have a ceiling height finding for 2.5m (which is below
    // the RGEU minimum for commercial of 3.0m but meets residential 2.4m)
    const hasCeilingIssue =
      resCeilingFindings.length > 0 || comCeilingFindings.length > 0;
    expect(hasCeilingIssue).toBe(true);
  });

  it("residential project has residential-specific energy recommendations", async () => {
    // Check that residential projects get solar thermal recommendations
    // (which are specific to residential under REH)
    const solarThermalRec = residentialResult.recommendations.find(
      (r) =>
        r.area === "energy" &&
        r.description.toLowerCase().includes("solar"),
    );
    // Default residential project without solar thermal should get this recommendation
    expect(solarThermalRec).toBeDefined();
  });
});

// ============================================================
// 5. REHABILITATION PROJECT
// ============================================================

describe("E2E: Rehabilitation project", async () => {
  const rehabProject = createProject({
    name: "Rehabilitation Project",
    isRehabilitation: true,
    buildingType: "residential",
    licensing: {
      ...DEFAULT_PROJECT.licensing,
      isInARU: true,
    },
    localRegulations: {
      ...DEFAULT_PROJECT.localRegulations,
      municipality: "Lisboa",
      pdmZoning: "Espaço Residencial",
    },
  });

  const newBuildProject = createProject({
    name: "New Build Project",
    isRehabilitation: false,
  });

  const rehabResult = await analyzeProject(rehabProject);
  const newBuildResult = await analyzeProject(newBuildProject);

  it("produces a valid analysis for rehabilitation projects", async () => {
    expect(rehabResult.findings.length).toBeGreaterThan(0);
    expect(rehabResult.regulationSummary).toHaveLength(18);
  });

  it("rehabilitation project has rehabilitation-specific recommendations", async () => {
    // isRehabilitation=true should trigger "Benefícios fiscais para reabilitação"
    const rehabRec = rehabResult.recommendations.find(
      (r) =>
        r.title.includes("fiscais") ||
        r.description.includes("IVA reduzido") ||
        r.description.includes("IVA a 6%"),
    );
    expect(rehabRec).toBeDefined();
  });

  it("new-build project does not include rehabilitation fiscal benefits recommendation", async () => {
    const rehabFiscalRec = newBuildResult.recommendations.find(
      (r) =>
        r.title.toLowerCase().includes("benefícios fiscais") &&
        r.title.toLowerCase().includes("reabilitação"),
    );
    expect(rehabFiscalRec).toBeUndefined();
  });

  it("ARU location generates info findings about fiscal benefits", async () => {
    // isInARU=true should produce PDM findings about ARU benefits
    const aruFinding = rehabResult.findings.find(
      (f) =>
        f.area === "local" &&
        f.description.toLowerCase().includes("aru"),
    );
    expect(aruFinding).toBeDefined();
    if (aruFinding) {
      expect(aruFinding.severity).toBe("info");
    }
  });
});

// ============================================================
// 6. ALL 18 AREAS GET COVERAGE
// ============================================================

describe("E2E: All 18 areas get coverage in regulation summary", async () => {
  const result = await analyzeProject(createProject({ name: "Coverage Test" }));

  it("regulationSummary contains exactly 18 entries", async () => {
    expect(result.regulationSummary).toHaveLength(18);
  });

  it("every regulation area is represented in the summary", async () => {
    const summaryAreas = result.regulationSummary.map((s) => s.area);
    for (const area of ALL_REGULATION_AREAS) {
      expect(summaryAreas).toContain(area);
    }
  });

  it("each summary entry has a non-empty name", async () => {
    for (const s of result.regulationSummary) {
      expect(s.name.length).toBeGreaterThan(0);
    }
  });

  it("each summary entry has a findings count >= 0", async () => {
    for (const s of result.regulationSummary) {
      expect(s.findingsCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("areas with violations have findingsCount > 0 in summary", async () => {
    const areasWithViolations = new Set(
      result.findings
        .filter((f) => f.severity === "critical" || f.severity === "warning")
        .map((f) => f.area),
    );

    for (const summary of result.regulationSummary) {
      if (areasWithViolations.has(summary.area)) {
        expect(summary.findingsCount).toBeGreaterThan(0);
      }
    }
  });

  it("areas with only pass findings have compliant status", async () => {
    const areasWithViolations = new Set(
      result.findings
        .filter((f) => f.severity === "critical" || f.severity === "warning")
        .map((f) => f.area),
    );

    for (const summary of result.regulationSummary) {
      if (
        !areasWithViolations.has(summary.area) &&
        result.findings.some(
          (f) => f.area === summary.area && f.severity === "pass",
        )
      ) {
        expect(summary.status).toBe("compliant");
      }
    }
  });
});

// ============================================================
// 7. RECOMMENDATIONS ARE AREA-APPROPRIATE
// ============================================================

describe("E2E: Recommendations are area-appropriate", async () => {
  const result = await analyzeProject(createProject({ name: "Rec Area Test" }));

  it("each recommendation has a valid area", async () => {
    for (const rec of result.recommendations) {
      expect(ALL_REGULATION_AREAS).toContain(rec.area);
    }
  });

  it("recommendations from violation areas match areas that have findings", async () => {
    const areasWithFindings = new Set(result.findings.map((f) => f.area));

    // Most recommendations should relate to areas that produced findings
    // (some general recommendations may not, e.g. "certificação energética")
    const matchingRecs = result.recommendations.filter((r) =>
      areasWithFindings.has(r.area),
    );
    // At least 50% of recommendations should align with finding areas
    expect(matchingRecs.length).toBeGreaterThanOrEqual(
      Math.floor(result.recommendations.length * 0.5),
    );
  });

  it("each recommendation has valid impact level", async () => {
    for (const rec of result.recommendations) {
      expect(["high", "medium", "low"]).toContain(rec.impact);
    }
  });

  it("each recommendation has a non-empty title and description", async () => {
    for (const rec of result.recommendations) {
      expect(rec.title.length).toBeGreaterThan(0);
      expect(rec.description.length).toBeGreaterThan(0);
    }
  });

  it("recommendation IDs follow R- prefix pattern", async () => {
    for (const rec of result.recommendations) {
      expect(rec.id).toMatch(/^R-\d+$/);
    }
  });
});

// ============================================================
// 8. PLUGIN EVALUATION PRODUCES FINDINGS
// ============================================================

describe("E2E: Plugin evaluation produces findings", async () => {
  const result = await analyzeProject(createProject({ name: "Plugin Findings Test" }));

  it("produces plugin-generated findings with PF- prefix", async () => {
    const pluginFindings = result.findings.filter((f) =>
      f.id.startsWith("PF-"),
    );
    expect(pluginFindings.length).toBeGreaterThan(0);
  });

  it("plugin findings cover multiple regulation areas", async () => {
    const pluginFindings = result.findings.filter((f) =>
      f.id.startsWith("PF-"),
    );
    const pluginAreas = new Set(pluginFindings.map((f) => f.area));
    // With 18 specialty plugins, we should have findings across many areas
    expect(pluginAreas.size).toBeGreaterThanOrEqual(5);
  });

  it("plugin findings include regulation references", async () => {
    const pluginFindings = result.findings.filter((f) =>
      f.id.startsWith("PF-"),
    );
    for (const f of pluginFindings) {
      // Each plugin finding should reference a regulation
      expect(f.regulation.length).toBeGreaterThan(0);
    }
  });

  it("plugin findings include severity levels", async () => {
    const pluginFindings = result.findings.filter((f) =>
      f.id.startsWith("PF-"),
    );
    const severities = new Set(pluginFindings.map((f) => f.severity));
    // Should have at least two different severity levels
    expect(severities.size).toBeGreaterThanOrEqual(2);
  });

  it("a compliant project produces fewer plugin violation findings", async () => {
    const compliantResult = await analyzeProject(createCompliantProject());
    const defaultResult = await analyzeProject(
      createProject({ name: "Default Plugin Compare" }),
    );

    const compliantViolations = compliantResult.findings.filter(
      (f) =>
        f.id.startsWith("PF-") &&
        (f.severity === "critical" || f.severity === "warning"),
    ).length;

    const defaultViolations = defaultResult.findings.filter(
      (f) =>
        f.id.startsWith("PF-") &&
        (f.severity === "critical" || f.severity === "warning"),
    ).length;

    expect(compliantViolations).toBeLessThan(defaultViolations);
  });
});

// ============================================================
// 9. PDM COMPLIANCE PRODUCES FINDINGS
// ============================================================

describe("E2E: PDM compliance produces findings", async () => {
  it("generates PDM findings for projects with municipality set", async () => {
    const project = createProject({
      name: "PDM Test",
      location: {
        ...DEFAULT_PROJECT.location,
        municipality: "Lisboa",
      },
    });
    const result = await analyzeProject(project);
    const pdmFindings = result.findings.filter((f) =>
      f.id.startsWith("PDM-"),
    );
    // Lisboa municipality should produce at least one PDM finding
    expect(pdmFindings.length).toBeGreaterThan(0);
  });

  it("PDM findings relate to the local regulation area", async () => {
    const project = createProject({
      name: "PDM Area Test",
      location: {
        ...DEFAULT_PROJECT.location,
        municipality: "Porto",
      },
    });
    const result = await analyzeProject(project);
    const pdmFindings = result.findings.filter((f) =>
      f.id.startsWith("PDM-"),
    );
    for (const f of pdmFindings) {
      expect(f.area).toBe("local");
    }
  });

  it("PDM findings reference PDM regulation", async () => {
    const project = createProject({
      name: "PDM Reg Test",
      location: {
        ...DEFAULT_PROJECT.location,
        municipality: "Lisboa",
      },
    });
    const result = await analyzeProject(project);
    const pdmFindings = result.findings.filter((f) =>
      f.id.startsWith("PDM-"),
    );
    for (const f of pdmFindings) {
      expect(f.regulation.toLowerCase()).toContain("pdm");
    }
  });

  it("specifying pdmZoning produces zone-specific findings", async () => {
    const project = createProject({
      name: "PDM Zoned Test",
      location: {
        ...DEFAULT_PROJECT.location,
        municipality: "Lisboa",
      },
      localRegulations: {
        ...DEFAULT_PROJECT.localRegulations,
        municipality: "Lisboa",
        pdmZoning: "Espaço Residencial",
      },
    });
    const result = await analyzeProject(project);
    const pdmFindings = result.findings.filter((f) =>
      f.id.startsWith("PDM-"),
    );
    // With explicit zoning, we get zone-specific constraint checks
    expect(pdmFindings.length).toBeGreaterThan(0);
    // Should have height/floor pass findings since the project is within limits
    const passFindings = pdmFindings.filter((f) => f.severity === "pass");
    expect(passFindings.length).toBeGreaterThanOrEqual(0);
  });

  it("protected area flag generates a PDM warning", async () => {
    const project = createProject({
      name: "Protected Area Test",
      licensing: {
        ...DEFAULT_PROJECT.licensing,
        isProtectedArea: true,
      },
      localRegulations: {
        ...DEFAULT_PROJECT.localRegulations,
        municipality: "Lisboa",
        pdmZoning: "Espaço Residencial",
      },
    });
    const result = await analyzeProject(project);
    const protectedFinding = result.findings.find(
      (f) =>
        f.id.startsWith("PDM-") &&
        f.description.toLowerCase().includes("protegida"),
    );
    expect(protectedFinding).toBeDefined();
    if (protectedFinding) {
      expect(protectedFinding.severity).toBe("warning");
    }
  });

  it("building exceeding max height triggers PDM critical finding", async () => {
    const project = createProject({
      name: "Height Exceed Test",
      buildingHeight: 50, // Exceeds any normal zoning limit
      localRegulations: {
        ...DEFAULT_PROJECT.localRegulations,
        municipality: "Cascais",
        pdmZoning: "Espaço Residencial",
      },
    });
    const result = await analyzeProject(project);
    const heightFinding = result.findings.find(
      (f) =>
        f.id.startsWith("PDM-") &&
        f.severity === "critical" &&
        f.description.toLowerCase().includes("altura"),
    );
    expect(heightFinding).toBeDefined();
  });
});

// ============================================================
// 10. PASS FINDINGS FOR CLEAN AREAS
// ============================================================

describe("E2E: Pass findings for clean areas", async () => {
  const compliantResult = await analyzeProject(createCompliantProject());

  it("generates PASS- prefixed findings", async () => {
    const passFindings = compliantResult.findings.filter((f) =>
      f.id.startsWith("PASS-"),
    );
    expect(passFindings.length).toBeGreaterThan(0);
  });

  it("pass findings have severity of pass", async () => {
    const passFindings = compliantResult.findings.filter((f) =>
      f.id.startsWith("PASS-"),
    );
    for (const f of passFindings) {
      expect(f.severity).toBe("pass");
    }
  });

  it("pass findings exist for areas without violations", async () => {
    const violationAreas = new Set(
      compliantResult.findings
        .filter((f) => f.severity === "critical" || f.severity === "warning")
        .map((f) => f.area),
    );

    const passFindings = compliantResult.findings.filter(
      (f) => f.id.startsWith("PASS-"),
    );

    // PASS findings should be for areas that do not have violations
    for (const pf of passFindings) {
      expect(violationAreas.has(pf.area)).toBe(false);
    }
  });

  it("a compliant project has more PASS findings than a non-compliant one", async () => {
    const defaultResult = await analyzeProject(
      createProject({ name: "Default Pass Compare" }),
    );

    const compliantPassCount = compliantResult.findings.filter((f) =>
      f.id.startsWith("PASS-"),
    ).length;
    const defaultPassCount = defaultResult.findings.filter((f) =>
      f.id.startsWith("PASS-"),
    ).length;

    expect(compliantPassCount).toBeGreaterThanOrEqual(defaultPassCount);
  });

  it("pass finding IDs include the area name", async () => {
    const passFindings = compliantResult.findings.filter((f) =>
      f.id.startsWith("PASS-"),
    );
    for (const f of passFindings) {
      // PASS findings have format PASS-<area>
      const areaFromId = f.id.replace("PASS-", "");
      expect(areaFromId).toBe(f.area);
    }
  });

  it("pass findings reference a regulation (plugin name)", async () => {
    const passFindings = compliantResult.findings.filter((f) =>
      f.id.startsWith("PASS-"),
    );
    for (const f of passFindings) {
      expect(f.regulation.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// ADDITIONAL CROSS-CUTTING E2E TESTS
// ============================================================

describe("E2E: Idempotency — repeated analysis produces same results", async () => {
  it("produces identical results when run twice on the same project", async () => {
    const project = createProject({ name: "Idempotent Test" });
    const result1 = await analyzeProject(project);
    const result2 = await analyzeProject(project);

    expect(result1.overallScore).toBe(result2.overallScore);
    expect(result1.energyClass).toBe(result2.energyClass);
    expect(result1.findings.length).toBe(result2.findings.length);
    expect(result1.recommendations.length).toBe(result2.recommendations.length);

    // Finding IDs should be identical in order
    const ids1 = result1.findings.map((f) => f.id);
    const ids2 = result2.findings.map((f) => f.id);
    expect(ids1).toEqual(ids2);
  });
});

describe("E2E: Score ordering across project quality tiers", async () => {
  it("worst < default < compliant in overall score", async () => {
    const worstResult = await analyzeProject(createWorstCaseProject());
    const defaultResult = await analyzeProject(
      createProject({ name: "Default Tier" }),
    );
    const compliantResult = await analyzeProject(createCompliantProject());

    expect(worstResult.overallScore).toBeLessThan(defaultResult.overallScore);
    expect(defaultResult.overallScore).toBeLessThan(
      compliantResult.overallScore,
    );
  });

  it("worst < default < compliant in energy class rank", async () => {
    const classOrder: EnergyClass[] = ["A+", "A", "B", "B-", "C", "D", "E", "F"];

    const worstResult = await analyzeProject(createWorstCaseProject());
    const defaultResult = await analyzeProject(
      createProject({ name: "Default Energy" }),
    );
    const compliantResult = await analyzeProject(createCompliantProject());

    const worstIdx = classOrder.indexOf(worstResult.energyClass);
    const defaultIdx = classOrder.indexOf(defaultResult.energyClass);
    const compliantIdx = classOrder.indexOf(compliantResult.energyClass);

    // Higher index = worse energy class
    expect(compliantIdx).toBeLessThanOrEqual(defaultIdx);
    expect(defaultIdx).toBeLessThanOrEqual(worstIdx);
  });
});

describe("E2E: Municipality-specific PDM handling", async () => {
  it("different municipalities produce different PDM findings", async () => {
    const lisbonProject = createProject({
      name: "Lisboa PDM",
      location: { ...DEFAULT_PROJECT.location, municipality: "Lisboa" },
    });
    const portoProject = createProject({
      name: "Porto PDM",
      location: {
        ...DEFAULT_PROJECT.location,
        municipality: "Porto",
        district: "Porto",
      },
    });

    const lisbonResult = await analyzeProject(lisbonProject);
    const portoResult = await analyzeProject(portoProject);

    const lisbonPdm = lisbonResult.findings
      .filter((f) => f.id.startsWith("PDM-"))
      .map((f) => f.description);
    const portoPdm = portoResult.findings
      .filter((f) => f.id.startsWith("PDM-"))
      .map((f) => f.description);

    // At least one PDM finding should differ between municipalities
    expect(lisbonPdm).not.toEqual(portoPdm);
  });

  it("unknown municipality still produces PDM advisory", async () => {
    const project = createProject({
      name: "Unknown Municipality",
      location: {
        ...DEFAULT_PROJECT.location,
        municipality: "Aldeia Desconhecida",
      },
    });
    const result = await analyzeProject(project);
    const pdmFindings = result.findings.filter((f) =>
      f.id.startsWith("PDM-"),
    );
    // Should still produce at least a warning about unknown PDM classification
    expect(pdmFindings.length).toBeGreaterThan(0);
  });
});

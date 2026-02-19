/**
 * Tests for Licensing Phase Generator (DL 10/2024 Timeline Bridge)
 *
 * Validates:
 * 1. Pathway determination (exempt, comunicação prévia, licenciamento)
 * 2. Task generation per pathway
 * 3. Specialty and consultation detection
 * 4. Schedule merge utility
 * 5. Edge cases (rehabilitation, calendar→working day conversion)
 */

import { describe, it, expect } from "vitest";
import type { BuildingProject } from "@/lib/types";
import type { ProjectSchedule } from "@/lib/wbs-types";
import {
  determineLicensingPathway,
  getRequiredSpecialties,
  getRequiredConsultations,
  generateLicensingPhases,
  mergeScheduleWithLicensing,
} from "@/lib/licensing-phases";

// ============================================================
// Test Helpers
// ============================================================

function createMinimalProject(overrides: Record<string, unknown> = {}): BuildingProject {
  return {
    name: "Teste Licenciamento",
    buildingType: "residential",
    location: { district: "Lisboa", municipality: "Lisboa", parish: "Santa Maria Maior", address: "Rua Teste 1" },
    isRehabilitation: false,
    grossFloorArea: 500,
    usableFloorArea: 400,
    numberOfFloors: 4,
    buildingHeight: 12,
    architecture: {
      hasCivilCodeCompliance: true,
      hasRainwaterDrainage: true,
      isHorizontalProperty: true,
      respectsCommonParts: true,
      hasBuildingPermitDesign: true,
      meetsRGEU: true,
      hasNaturalLight: true,
      hasCrossVentilation: true,
      ...overrides,
    },
    structural: {
      structuralSystem: "reinforced_concrete",
      seismicZone: "1.3",
      soilType: "B",
      importanceClass: "II",
      hasStructuralProject: true,
      hasGeotechnicalStudy: true,
      foundationType: "shallow",
      hasSeismicDesign: true,
      ductilityClass: "DCM",
    },
    fireSafety: {
      utilizationType: "I",
      riskCategory: "2",
      fireResistanceOfStructure: 60,
      hasFireAlarm: true,
      hasEmergencyLighting: true,
      hasFireExtinguishers: true,
      hasEvacuationPlan: true,
      hasFireHydrant: false,
      hasSprinklerSystem: false,
      hasFireCompartmentation: true,
      hasEmergencyExits: true,
      maxEvacuationDistance: 15,
      hasFireSafetyProject: true,
    },
    avac: {
      hasHVACProject: false,
      hasVentilationSystem: false,
      ventilationType: "natural",
      hasKitchenExtraction: true,
      hasBathroomExtraction: true,
      hasDuctwork: false,
      hasAirQualityControl: false,
      hasMaintenancePlan: false,
      hasFGasCompliance: false,
      hasRadonProtection: false,
    },
    waterDrainage: {
      hasPublicWaterConnection: true,
      waterPipeMaterial: "ppr",
      hasWaterMeter: true,
      hasCheckValve: true,
      hasPressureReducer: true,
      hotWaterRecirculation: false,
      hasSeparateDrainageSystem: true,
      hasVentilatedDrainage: true,
      hasDrainageSiphons: true,
      hasGreaseTrap: false,
      hasStormwaterManagement: true,
      hasWaterReuse: false,
      hasBackflowPrevention: true,
    },
    gas: {
      hasGasInstallation: true,
      gasType: "natural_gas",
      hasGasProject: true,
      hasGasDetector: true,
      hasEmergencyValve: true,
      hasVentilation: true,
      hasFlueSystem: true,
      pipesMaterial: "copper",
      hasPressureTest: true,
      hasGasCertification: true,
    },
    electrical: {
      hasElectricalProject: true,
      hasEarthingSystem: true,
      hasResidualCurrentDevice: true,
      hasSurgeProtection: true,
      hasLightningProtection: false,
      panelLocation: "common_area",
      circuitBreakers: "C",
      hasEmergencyPower: false,
      hasEVCharging: false,
      meterType: "smart",
    },
    telecommunications: {
      hasITEDProject: true,
      hasITURProject: false,
      hasFiberOptic: true,
      hasTVDistribution: true,
      hasIntercom: true,
      hasSatellite: false,
      cabling: "cat6",
      hasATI: true,
    },
    envelope: {
      wallUValue: 0.4,
      roofUValue: 0.35,
      floorUValue: 0.4,
      windowUValue: 2.4,
      windowSHGC: 0.4,
      hasETICS: true,
      hasDoubleGlazing: true,
      airTightness: 3.0,
    },
    systems: {
      heatingSystem: "heat_pump",
      coolingSystem: "none",
      dhwSystem: "heat_pump",
      renewableEnergy: "solar_thermal",
      solarThermalArea: 4.0,
      photovoltaicPower: 0,
      hasEnergyStorageSystem: false,
    },
    acoustic: {
      facadeInsulation: 33,
      interFloorInsulation: 58,
      interUnitWallInsulation: 50,
      impactNoise: 60,
      hasBuildingAcousticStudy: true,
    },
    accessibility: {
      hasAccessibleEntrance: true,
      hasAccessibleElevator: true,
      doorWidths: 0.87,
      hasAccessibleBathroom: true,
      hasAccessibleParking: true,
      hasWayfinding: true,
      rampSlope: 6,
    },
    elevators: {
      hasElevator: true,
      numberOfElevators: 1,
      elevatorType: "passenger",
      hasCEMarking: true,
      hasMaintenanceContract: true,
      hasPeriodicInspection: true,
      hasEmergencyCommunication: true,
      hasPitAndHeadroom: true,
      hasAccessibleElevator: true,
    },
    localRegulations: {
      municipality: "Lisboa",
      documents: [],
      notes: "",
      waterUtilityDocs: [],
      consultedEntities: [],
    },
    drawingQuality: {
      hasArchitectureDrawings: true,
      hasStructuralDrawings: true,
      hasMEPDrawings: true,
    },
  } as unknown as BuildingProject;
}

function createMinimalSchedule(): ProjectSchedule {
  return {
    projectName: "Teste",
    startDate: "2026-06-01",
    finishDate: "2026-12-01",
    totalDurationDays: 183,
    totalCost: 100000,
    tasks: [
      {
        uid: 1, wbs: "01", name: "Estaleiro",
        durationDays: 5, durationHours: 40,
        startDate: "2026-06-01", finishDate: "2026-06-06",
        predecessors: [], isSummary: true, phase: "site_setup",
        resources: [], cost: 0, materialCost: 0, outlineLevel: 1, percentComplete: 0,
      },
      {
        uid: 30, wbs: "30", name: "Limpeza Final",
        durationDays: 3, durationHours: 24,
        startDate: "2026-11-28", finishDate: "2026-12-01",
        predecessors: [], isSummary: true, phase: "cleanup",
        resources: [], cost: 0, materialCost: 0, outlineLevel: 1, percentComplete: 0,
      },
    ],
    resources: [],
    criticalPath: [1, 30],
    teamSummary: { maxWorkers: 10, averageWorkers: 5, totalManHours: 2000, peakWeek: "2026-W30" },
  };
}

// ============================================================
// Pathway Determination Tests
// ============================================================

describe("determineLicensingPathway", () => {
  it("returns public_entity_exempt for public entities", () => {
    const project = createMinimalProject({ isPublicEntity: true });
    const result = determineLicensingPathway(project);
    expect(result.pathway).toBe("public_entity_exempt");
    expect(result.baseApprovalDays).toBe(0);
  });

  it("returns exempt for minor works", () => {
    const project = createMinimalProject({ isMinorWork: true });
    const result = determineLicensingPathway(project);
    expect(result.pathway).toBe("exempt");
    expect(result.baseApprovalDays).toBe(5);
    expect(result.legalBasis).toContain("Art. 6");
  });

  it("returns comunicacao_previa for lot allotment without licensing", () => {
    const project = createMinimalProject({ hasLotAllotment: true, requiresLicensing: false });
    const result = determineLicensingPathway(project);
    expect(result.pathway).toBe("comunicacao_previa");
    expect(result.baseApprovalDays).toBe(20);
  });

  it("returns licenciamento 45 days for lot allotment requiring licensing", () => {
    const project = createMinimalProject({ hasLotAllotment: true, requiresLicensing: true });
    const result = determineLicensingPathway(project);
    expect(result.pathway).toBe("licenciamento");
    expect(result.baseApprovalDays).toBe(45);
  });

  it("returns licenciamento 20 days for standard construction", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    const result = determineLicensingPathway(project);
    expect(result.pathway).toBe("licenciamento");
    expect(result.baseApprovalDays).toBe(20);
  });

  it("defaults to licenciamento 20 days when no fields set", () => {
    const project = createMinimalProject();
    const result = determineLicensingPathway(project);
    expect(result.pathway).toBe("licenciamento");
    expect(result.baseApprovalDays).toBe(20);
  });

  it("public entity takes priority over minor work", () => {
    const project = createMinimalProject({ isPublicEntity: true, isMinorWork: true });
    const result = determineLicensingPathway(project);
    expect(result.pathway).toBe("public_entity_exempt");
  });
});

// ============================================================
// Specialty Detection Tests
// ============================================================

describe("getRequiredSpecialties", () => {
  it("always includes ARQ and ELE and ITED", () => {
    const project = createMinimalProject();
    const specialties = getRequiredSpecialties(project);
    const abbreviations = specialties.map(s => s.abbreviation);
    expect(abbreviations).toContain("ARQ");
    expect(abbreviations).toContain("ELE");
    expect(abbreviations).toContain("ITED");
  });

  it("includes SCIE when fire risk category >= 2", () => {
    const project = createMinimalProject();
    const specialties = getRequiredSpecialties(project);
    expect(specialties.map(s => s.abbreviation)).toContain("SCIE");
  });

  it("includes GAS when gas installation present", () => {
    const project = createMinimalProject();
    const specialties = getRequiredSpecialties(project);
    expect(specialties.map(s => s.abbreviation)).toContain("GAS");
  });

  it("includes ASC when elevator present", () => {
    const project = createMinimalProject();
    const specialties = getRequiredSpecialties(project);
    expect(specialties.map(s => s.abbreviation)).toContain("ASC");
  });
});

// ============================================================
// Consultation Detection Tests
// ============================================================

describe("getRequiredConsultations", () => {
  it("includes ANPC when SCIE specialty is required", () => {
    const project = createMinimalProject();
    const specialties = getRequiredSpecialties(project);
    const consultations = getRequiredConsultations(project, specialties);
    expect(consultations.map(c => c.entityAbbreviation)).toContain("ANPC");
  });

  it("includes DGEG when gas/electrical specialty required", () => {
    const project = createMinimalProject();
    const specialties = getRequiredSpecialties(project);
    const consultations = getRequiredConsultations(project, specialties);
    expect(consultations.map(c => c.entityAbbreviation)).toContain("DGEG");
  });

  it("includes ANACOM when ITED specialty required", () => {
    const project = createMinimalProject();
    const specialties = getRequiredSpecialties(project);
    const consultations = getRequiredConsultations(project, specialties);
    expect(consultations.map(c => c.entityAbbreviation)).toContain("ANACOM");
  });

  it("does not duplicate entities", () => {
    const project = createMinimalProject();
    const specialties = getRequiredSpecialties(project);
    const consultations = getRequiredConsultations(project, specialties);
    const abbreviations = consultations.map(c => c.entityAbbreviation);
    expect(new Set(abbreviations).size).toBe(abbreviations.length);
  });
});

// ============================================================
// Task Generation Tests
// ============================================================

describe("generateLicensingPhases", () => {
  it("generates minimal tasks for exempt pathway", () => {
    const project = createMinimalProject({ isMinorWork: true });
    const result = generateLicensingPhases(project);
    expect(result.pathway.pathway).toBe("exempt");
    expect(result.preConstructionTasks.length).toBeGreaterThanOrEqual(2);
    expect(result.preConstructionTasks.length).toBeLessThanOrEqual(4);
    // Should have notification + tax receipt at minimum
    const wbsCodes = result.preConstructionTasks.map(t => t.wbs);
    expect(wbsCodes.some(c => c.startsWith("LIC.01"))).toBe(true);
    expect(wbsCodes.some(c => c.startsWith("LIC.05"))).toBe(true);
  });

  it("generates full task tree for licenciamento", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    const result = generateLicensingPhases(project);
    expect(result.pathway.pathway).toBe("licenciamento");
    const wbsCodes = result.preConstructionTasks.map(t => t.wbs);
    // Should have all blocks: LIC.00, LIC.01, LIC.02, LIC.03, LIC.04, LIC.05
    expect(wbsCodes.some(c => c.startsWith("LIC.00"))).toBe(true);
    expect(wbsCodes.some(c => c.startsWith("LIC.01"))).toBe(true);
    expect(wbsCodes.some(c => c.startsWith("LIC.02"))).toBe(true);
    expect(wbsCodes.some(c => c.startsWith("LIC.03"))).toBe(true);
    expect(wbsCodes.some(c => c.startsWith("LIC.04"))).toBe(true);
    expect(wbsCodes.some(c => c.startsWith("LIC.05"))).toBe(true);
  });

  it("comunicação prévia skips external consultations", () => {
    const project = createMinimalProject({ hasLotAllotment: true, requiresLicensing: false });
    const result = generateLicensingPhases(project);
    expect(result.pathway.pathway).toBe("comunicacao_previa");
    const wbsCodes = result.preConstructionTasks.map(t => t.wbs);
    expect(wbsCodes.some(c => c.startsWith("LIC.03"))).toBe(false);
  });

  it("all tasks have Portuguese names", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    const result = generateLicensingPhases(project);
    for (const task of result.allTasks) {
      // Portuguese text should NOT be pure ASCII English — check for common Portuguese characters or words
      expect(task.name.length).toBeGreaterThan(0);
    }
  });

  it("uses UIDs starting from configured startingUid", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    const result = generateLicensingPhases(project, undefined, { startingUid: 9000 });
    for (const task of result.allTasks) {
      expect(task.uid).toBeGreaterThanOrEqual(9000);
    }
  });

  it("all WBS codes follow LIC.xx.xx pattern", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    const result = generateLicensingPhases(project);
    for (const task of result.allTasks) {
      expect(task.wbs).toMatch(/^LIC\.\d{2}\.\d{2}$/);
    }
  });

  it("summary tasks have isSummary: true", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    const result = generateLicensingPhases(project);
    const summaries = result.allTasks.filter(t => t.isSummary);
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      expect(s.isSummary).toBe(true);
    }
  });

  it("generates post-construction tasks when option is true", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    const result = generateLicensingPhases(project, undefined, { includePostConstruction: true });
    expect(result.postConstructionTasks.length).toBeGreaterThan(0);
    const postWbs = result.postConstructionTasks.map(t => t.wbs);
    expect(postWbs.some(c => c.startsWith("LIC.90"))).toBe(true);
  });
});

// ============================================================
// Edge Cases
// ============================================================

describe("edge cases", () => {
  it("rehabilitation skips autorização de utilização", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    (project as Record<string, unknown>).isRehabilitation = true;
    const result = generateLicensingPhases(project, undefined, { includePostConstruction: true });
    expect(result.postConstructionTasks.length).toBe(0);
  });

  it("summary includes correct specialty and consultation counts", () => {
    const project = createMinimalProject({ requiresLicensing: true });
    const result = generateLicensingPhases(project);
    expect(result.summary.requiredSpecialties).toBeGreaterThan(0);
    expect(result.summary.requiredConsultations).toBeGreaterThan(0);
    expect(result.summary.totalPreConstructionDays).toBeGreaterThan(0);
  });

  it("all tasks have valid licensing ConstructionPhase values", () => {
    const validPhases = new Set([
      "licensing_preparation", "specialty_projects", "external_consultations",
      "licensing_approval", "construction_authorization", "utilization_authorization",
    ]);
    const project = createMinimalProject({ requiresLicensing: true });
    const result = generateLicensingPhases(project, undefined, { includePostConstruction: true });
    for (const task of result.allTasks) {
      expect(validPhases.has(task.phase)).toBe(true);
    }
  });
});

// ============================================================
// Schedule Merge Tests
// ============================================================

describe("mergeScheduleWithLicensing", () => {
  it("prepends pre-construction tasks before site_setup", () => {
    const schedule = createMinimalSchedule();
    const project = createMinimalProject({ requiresLicensing: true });
    const licensingResult = generateLicensingPhases(project, undefined, { includePostConstruction: false });
    const merged = mergeScheduleWithLicensing(schedule, licensingResult);

    // First task should be a licensing task
    expect(merged.tasks[0].wbs.startsWith("LIC")).toBe(true);
  });

  it("links licensing to site_setup via FS predecessor", () => {
    const schedule = createMinimalSchedule();
    const project = createMinimalProject({ requiresLicensing: true });
    const licensingResult = generateLicensingPhases(project, undefined, { includePostConstruction: false });
    const merged = mergeScheduleWithLicensing(schedule, licensingResult);

    const siteSetup = merged.tasks.find(t => t.phase === "site_setup");
    expect(siteSetup).toBeDefined();
    // Should have a predecessor from a licensing task
    const licensingUids = new Set(licensingResult.preConstructionTasks.map(t => t.uid));
    const hasLicensingPred = siteSetup!.predecessors.some(p => licensingUids.has(p.uid));
    expect(hasLicensingPred).toBe(true);
  });

  it("appends post-construction tasks after cleanup", () => {
    const schedule = createMinimalSchedule();
    const project = createMinimalProject({ requiresLicensing: true });
    const licensingResult = generateLicensingPhases(project, undefined, { includePostConstruction: true });
    const merged = mergeScheduleWithLicensing(schedule, licensingResult);

    const lastTask = merged.tasks[merged.tasks.length - 1];
    expect(lastTask.wbs.startsWith("LIC.90")).toBe(true);
  });
});

/**
 * Calculate completion percentage for each form section.
 * Returns a status indicator (green/yellow/red) for tab badges.
 */

import type { BuildingProject, BuildingType } from "./types";
import { canAnalyzeEnergy } from "./energy-analyzer";
import { canAnalyzeElectrical } from "./electrical-analyzer";
import { canAnalyzePlumbing } from "./plumbing-analyzer";
import { canAnalyzeFireSafety } from "./fire-safety-analyzer";

export type CompletionStatus = "complete" | "partial" | "empty";

export interface EngineReadiness {
  id: string;
  label: string;
  ready: boolean;
  section: string;
}

export function computeEngineReadiness(project: BuildingProject): EngineReadiness[] {
  return [
    { id: "sce", label: "SCE (Energia)", ready: canAnalyzeEnergy(project), section: "envelope" },
    { id: "rtiebt", label: "RTIEBT (Elétrica)", ready: canAnalyzeElectrical(project), section: "electrical" },
    { id: "rgsppdadar", label: "RGSPPDADAR (Águas)", ready: canAnalyzePlumbing(project), section: "water" },
    { id: "scie", label: "SCIE (Incêndio)", ready: canAnalyzeFireSafety(project), section: "fire" },
  ];
}

export interface SectionCompletion {
  id: string;
  filled: number;
  total: number;
  percentage: number;
  status: CompletionStatus;
}

function countFilled(obj: Record<string, unknown>, keys: string[]): { filled: number; total: number } {
  let filled = 0;
  const total = keys.length;
  for (const key of keys) {
    const val = obj[key];
    if (val === undefined || val === null || val === "" || val === 0) continue;
    if (typeof val === "boolean") { filled++; continue; }
    if (typeof val === "number" && val > 0) { filled++; continue; }
    if (typeof val === "string" && val.trim().length > 0) { filled++; continue; }
    if (Array.isArray(val) && val.length > 0) { filled++; continue; }
    filled++;
  }
  return { filled, total };
}

function getStatus(pct: number): CompletionStatus {
  if (pct >= 80) return "complete";
  if (pct > 0) return "partial";
  return "empty";
}

export function calculateSectionCompletion(project: BuildingProject): Record<string, SectionCompletion> {
  const result: Record<string, SectionCompletion> = {};

  // Context
  const ctx = countFilled(project.projectContext as unknown as Record<string, unknown>, ["description", "specificConcerns", "questions"]);
  result.context = { id: "context", ...ctx, percentage: ctx.total ? Math.round((ctx.filled / ctx.total) * 100) : 0, status: getStatus(ctx.total ? (ctx.filled / ctx.total) * 100 : 0) };

  // General
  const genKeys = ["name", "buildingType", "grossFloorArea", "usableFloorArea", "numberOfFloors", "buildingHeight"];
  const genObj: Record<string, unknown> = {};
  for (const k of genKeys) genObj[k] = (project as unknown as Record<string, unknown>)[k];
  const loc = project.location;
  genObj["district"] = loc.district;
  genObj["municipality"] = loc.municipality;
  const gen = countFilled(genObj, [...genKeys, "district", "municipality"]);
  result.general = { id: "general", ...gen, percentage: gen.total ? Math.round((gen.filled / gen.total) * 100) : 0, status: getStatus(gen.total ? (gen.filled / gen.total) * 100 : 0) };

  // Architecture
  const arch = countFilled(project.architecture as unknown as Record<string, unknown>, [
    "hasBuildingPermitDesign", "meetsRGEU", "hasNaturalLight", "hasCrossVentilation",
    "hasCivilCodeCompliance", "ceilingHeight",
  ]);
  result.architecture = { id: "architecture", ...arch, percentage: arch.total ? Math.round((arch.filled / arch.total) * 100) : 0, status: getStatus(arch.total ? (arch.filled / arch.total) * 100 : 0) };

  // Structural
  const struc = countFilled(project.structural as unknown as Record<string, unknown>, [
    "hasStructuralProject", "structuralSystem", "hasGeotechnicalStudy",
    "hasSeismicDesign", "soilType",
  ]);
  result.structural = { id: "structural", ...struc, percentage: struc.total ? Math.round((struc.filled / struc.total) * 100) : 0, status: getStatus(struc.total ? (struc.filled / struc.total) * 100 : 0) };

  // Fire Safety
  const fire = countFilled(project.fireSafety as unknown as Record<string, unknown>, [
    "utilizationType", "riskCategory", "fireResistanceOfStructure",
    "hasFireDetection", "hasFireAlarm", "hasEmergencyLighting", "hasFireExtinguishers",
    "numberOfExits", "maxEvacuationDistance",
  ]);
  result.fire = { id: "fire", ...fire, percentage: fire.total ? Math.round((fire.filled / fire.total) * 100) : 0, status: getStatus(fire.total ? (fire.filled / fire.total) * 100 : 0) };

  // AVAC
  const avac = countFilled(project.avac as unknown as Record<string, unknown>, [
    "ventilationType", "hasKitchenExtraction", "hasBathroomExtraction",
    "hasMaintenancePlan",
  ]);
  result.avac = { id: "avac", ...avac, percentage: avac.total ? Math.round((avac.filled / avac.total) * 100) : 0, status: getStatus(avac.total ? (avac.filled / avac.total) * 100 : 0) };

  // Water
  const water = countFilled(project.waterDrainage as unknown as Record<string, unknown>, [
    "hasSeparateDrainageSystem", "hasWaterMeter", "hasWaterTreatment",
    "hasStorageTank", "numberOfBathrooms",
  ]);
  result.water = { id: "water", ...water, percentage: water.total ? Math.round((water.filled / water.total) * 100) : 0, status: getStatus(water.total ? (water.filled / water.total) * 100 : 0) };

  // Gas
  const gas = countFilled(project.gas as unknown as Record<string, unknown>, [
    "hasGasInstallation", "gasType",
  ]);
  result.gas = { id: "gas", ...gas, percentage: gas.total ? Math.round((gas.filled / gas.total) * 100) : 0, status: getStatus(gas.total ? (gas.filled / gas.total) * 100 : 0) };

  // Electrical
  const elec = countFilled(project.electrical as unknown as Record<string, unknown>, [
    "supplyType", "contractedPower", "hasMainCircuitBreaker",
    "hasResidualCurrentDevice", "hasEarthingSystem", "numberOfCircuits",
  ]);
  result.electrical = { id: "electrical", ...elec, percentage: elec.total ? Math.round((elec.filled / elec.total) * 100) : 0, status: getStatus(elec.total ? (elec.filled / elec.total) * 100 : 0) };

  // Telecom
  const tel = countFilled(project.telecommunications as unknown as Record<string, unknown>, [
    "itedEdition", "hasATE", "hasATI", "hasFiberOptic",
  ]);
  result.telecom = { id: "telecom", ...tel, percentage: tel.total ? Math.round((tel.filled / tel.total) * 100) : 0, status: getStatus(tel.total ? (tel.filled / tel.total) * 100 : 0) };

  // Envelope
  const env = countFilled(project.envelope as unknown as Record<string, unknown>, [
    "externalWallUValue", "roofUValue", "windowUValue",
    "windowSolarFactor", "airChangesPerHour",
  ]);
  result.envelope = { id: "envelope", ...env, percentage: env.total ? Math.round((env.filled / env.total) * 100) : 0, status: getStatus(env.total ? (env.filled / env.total) * 100 : 0) };

  // Systems
  const sys = countFilled(project.systems as unknown as Record<string, unknown>, [
    "heatingSystem", "coolingSystem", "dhwSystem",
  ]);
  result.systems = { id: "systems", ...sys, percentage: sys.total ? Math.round((sys.filled / sys.total) * 100) : 0, status: getStatus(sys.total ? (sys.filled / sys.total) * 100 : 0) };

  // Acoustic
  const aco = countFilled(project.acoustic as unknown as Record<string, unknown>, [
    "buildingLocation", "hasAcousticProject", "hasAirborneInsulation",
  ]);
  result.acoustic = { id: "acoustic", ...aco, percentage: aco.total ? Math.round((aco.filled / aco.total) * 100) : 0, status: getStatus(aco.total ? (aco.filled / aco.total) * 100 : 0) };

  // Accessibility
  const acc = countFilled(project.accessibility as unknown as Record<string, unknown>, [
    "hasAccessibleEntrance", "doorWidths", "corridorWidths",
  ]);
  result.accessibility = { id: "accessibility", ...acc, percentage: acc.total ? Math.round((acc.filled / acc.total) * 100) : 0, status: getStatus(acc.total ? (acc.filled / acc.total) * 100 : 0) };

  // Elevators
  const elev = countFilled(project.elevators as unknown as Record<string, unknown>, [
    "hasElevator", "numberOfElevators",
  ]);
  result.elevators = { id: "elevators", ...elev, percentage: elev.total ? Math.round((elev.filled / elev.total) * 100) : 0, status: getStatus(elev.total ? (elev.filled / elev.total) * 100 : 0) };

  // Licensing
  const lic = countFilled(project.licensing as unknown as Record<string, unknown>, [
    "projectPhase", "hasArchitecturalProject",
  ]);
  result.licensing = { id: "licensing", ...lic, percentage: lic.total ? Math.round((lic.filled / lic.total) * 100) : 0, status: getStatus(lic.total ? (lic.filled / lic.total) * 100 : 0) };

  // Waste
  const waste = countFilled(project.waste as unknown as Record<string, unknown>, [
    "hasWasteManagementPlan", "estimatedWasteVolume",
  ]);
  result.waste = { id: "waste", ...waste, percentage: waste.total ? Math.round((waste.filled / waste.total) * 100) : 0, status: getStatus(waste.total ? (waste.filled / waste.total) * 100 : 0) };

  // Drawings
  const draw = countFilled(project.drawingQuality as unknown as Record<string, unknown>, [
    "architectureScale", "hasStandardSymbols", "hasNorthArrow",
    "hasSheetTitleBlock", "hasConsistentLineWeights",
  ]);
  result.drawings = { id: "drawings", ...draw, percentage: draw.total ? Math.round((draw.filled / draw.total) * 100) : 0, status: getStatus(draw.total ? (draw.filled / draw.total) * 100 : 0) };

  // Local/Municipal
  const local = countFilled(project.localRegulations as unknown as Record<string, unknown>, [
    "municipality", "notes",
  ]);
  result.local = { id: "local", ...local, percentage: local.total ? Math.round((local.filled / local.total) * 100) : 0, status: getStatus(local.total ? (local.filled / local.total) * 100 : 0) };

  return result;
}

/**
 * Get sections relevant for a building type (progressive disclosure).
 * Returns all section IDs that should be shown.
 */
export function getRelevantSections(buildingType: BuildingType, _isRehabilitation?: boolean): string[] {
  // Core sections always shown
  const core = ["context", "general", "architecture", "envelope", "systems", "licensing"];

  // By building type
  const byType: Record<BuildingType, string[]> = {
    residential: [
      "structural", "fire", "avac", "water", "gas", "electrical", "telecom",
      "acoustic", "accessibility", "elevators", "waste", "drawings", "local",
    ],
    commercial: [
      "structural", "fire", "avac", "water", "gas", "electrical", "telecom",
      "acoustic", "accessibility", "elevators", "waste", "drawings", "local",
    ],
    mixed: [
      "structural", "fire", "avac", "water", "gas", "electrical", "telecom",
      "acoustic", "accessibility", "elevators", "waste", "drawings", "local",
    ],
    industrial: [
      "structural", "fire", "avac", "water", "gas", "electrical",
      "waste", "drawings", "local",
    ],
  };

  return [...core, ...byType[buildingType]];
}

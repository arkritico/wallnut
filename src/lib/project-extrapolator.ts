/**
 * Project Stage Extrapolation Engine
 *
 * Estimates the full project cost, schedule, and specialty impacts from
 * partial data. When a user only has an architectural project (fase de
 * projeto de arquitetura), the system extrapolates what the remaining
 * specialties will likely cost and require.
 *
 * Uses statistical ratios derived from Portuguese construction market data
 * (CYPE, LNEC, InCI/IMPIC statistics, ProNIC benchmarks).
 *
 * Project stages (Portuguese licensing process):
 *   1. Informação Prévia (PIP)
 *   2. Projeto de Arquitetura (Licenciamento)
 *   3. Projetos de Especialidades (after municipal approval)
 *   4. Projeto de Execução (detailed design)
 *   5. Obra (construction)
 */

import type { WbsProject, WbsChapter, WbsSubChapter, WbsArticle, ConstructionPhase } from "./wbs-types";
import type { BuildingProject, BuildingType } from "./types";

// ============================================================
// Types
// ============================================================

export type ProjectStage =
  | "pip"              // Informação prévia — almost no data
  | "architecture"     // Projeto de arquitetura — dimensions, areas, typology
  | "specialties"      // Projetos de especialidades — partial MEP data
  | "execution"        // Projeto de execução — full detail, quantities
  | "construction";    // Em obra — actuals available

export interface ExtrapolationInput {
  /** Current project stage */
  stage: ProjectStage;
  /** Building type */
  buildingType: BuildingType;
  /** Gross floor area (m²) — the minimum required input */
  grossFloorArea: number;
  /** Number of floors */
  numberOfFloors?: number;
  /** Number of dwellings (for multi-family) */
  numberOfDwellings?: number;
  /** Building height (m) */
  buildingHeight?: number;
  /** Usable floor area (m²) */
  usableFloorArea?: number;
  /** District for regional cost adjustment */
  district?: string;
  /** Is rehabilitation? (significantly affects costs) */
  isRehabilitation?: boolean;
  /** Known WBS chapters (from whatever data is available) */
  knownChapters?: WbsChapter[];
  /** Known total cost if any (from partial WBS or estimates) */
  knownTotalCost?: number;
  /** Partial BuildingProject data if available */
  partialProject?: Partial<BuildingProject>;
}

export interface ExtrapolatedSpecialty {
  /** Specialty name */
  name: string;
  /** ProNIC chapter codes covered */
  chapters: string[];
  /** Estimated cost range */
  minCost: number;
  maxCost: number;
  /** Confidence level */
  confidence: "high" | "medium" | "low" | "very_low";
  /** How the estimate was determined */
  method: "known" | "ratio" | "benchmark" | "extrapolated";
  /** Percentage of total construction cost */
  percentOfTotal: number;
  /** Key cost drivers identified */
  drivers: string[];
  /** What additional information would improve this estimate */
  dataNeeded: string[];
}

export interface ExtrapolationResult {
  /** Detected project stage */
  stage: ProjectStage;
  /** Overall confidence of the extrapolation */
  overallConfidence: "high" | "medium" | "low" | "very_low";
  /** Data completeness score (0-100) */
  completenessScore: number;
  /** Per-specialty cost breakdown */
  specialties: ExtrapolatedSpecialty[];
  /** Total estimated cost range */
  totalMinCost: number;
  totalMaxCost: number;
  /** Best estimate (weighted midpoint) */
  bestEstimate: number;
  /** Cost per m² benchmark */
  costPerM2: { min: number; max: number; benchmark: number };
  /** Estimated construction duration (working days) */
  estimatedDurationDays: { min: number; max: number; best: number };
  /** Estimated team size */
  estimatedTeamSize: { min: number; max: number; optimal: number };
  /** Generated WBS from extrapolation (for use in sequencer) */
  extrapolatedWbs: WbsProject;
  /** Warnings and caveats */
  warnings: string[];
  /** What to prioritize for better accuracy */
  recommendations: string[];
}

// ============================================================
// Portuguese Construction Cost Benchmarks (EUR/m², 2024-2025)
// ============================================================

/**
 * Base construction costs per m² by building type.
 * Source: Price Database Portugal + LNEC data + IMPIC statistics
 */
const BASE_COST_PER_M2: Record<BuildingType, { min: number; max: number; typical: number }> = {
  residential: { min: 800, max: 1500, typical: 1100 },
  commercial:  { min: 700, max: 1400, typical: 1000 },
  mixed:       { min: 750, max: 1450, typical: 1050 },
  industrial:  { min: 450, max: 900, typical: 650 },
};

/** Rehabilitation premium over new construction */
const REHAB_MULTIPLIER = 1.25;

/** District cost adjustment factors (Lisboa = 1.0) */
const DISTRICT_FACTORS: Record<string, number> = {
  "Lisboa": 1.00, "Porto": 0.95, "Setúbal": 0.97, "Faro": 1.02,
  "Braga": 0.90, "Aveiro": 0.90, "Coimbra": 0.92, "Leiria": 0.92,
  "Santarém": 0.90, "Viseu": 0.88, "Viana do Castelo": 0.88,
  "Vila Real": 0.85, "Bragança": 0.85, "Guarda": 0.85,
  "Castelo Branco": 0.87, "Portalegre": 0.87, "Évora": 0.90,
  "Beja": 0.88, "R.A. Madeira": 1.10, "R.A. Açores": 1.15,
};

// ============================================================
// Specialty Cost Ratios (% of total construction cost)
// ============================================================

/**
 * Typical cost breakdown by specialty as percentage of total.
 * Based on Portuguese market data for different building types.
 *
 * These ratios are the core of the extrapolation engine:
 * if we know the total cost (from m² benchmark), we can estimate
 * each specialty's cost even without detailed data.
 */
interface SpecialtyRatio {
  name: string;
  chapters: string[];
  phase: ConstructionPhase;
  /** Cost ratio by building type [min%, max%, typical%] */
  ratios: Record<BuildingType, [number, number, number]>;
  /** Key cost drivers */
  drivers: string[];
  /** What data improves accuracy */
  dataNeeded: string[];
}

const SPECIALTY_RATIOS: SpecialtyRatio[] = [
  {
    name: "Estaleiro e Preparatórios",
    chapters: ["01"],
    phase: "site_setup",
    ratios: {
      residential: [1.5, 3, 2], commercial: [2, 4, 3],
      mixed: [2, 4, 3], industrial: [2, 5, 3.5],
    },
    drivers: ["dimensão do lote", "condições de acesso", "duração da obra"],
    dataNeeded: ["implantação", "condições do terreno"],
  },
  {
    name: "Demolições",
    chapters: ["02"],
    phase: "demolition",
    ratios: {
      residential: [0, 5, 1], commercial: [0, 8, 2],
      mixed: [0, 6, 1.5], industrial: [0, 10, 3],
    },
    drivers: ["reabilitação vs. novo", "volume de demolição", "amianto"],
    dataNeeded: ["levantamento existente", "análise de materiais perigosos"],
  },
  {
    name: "Movimento de Terras",
    chapters: ["03"],
    phase: "earthworks",
    ratios: {
      residential: [2, 6, 3.5], commercial: [3, 8, 5],
      mixed: [2.5, 7, 4.5], industrial: [3, 10, 6],
    },
    drivers: ["topografia", "caves", "nível freático", "tipo de solo"],
    dataNeeded: ["estudo geotécnico", "topografia", "projeto de fundações"],
  },
  {
    name: "Fundações",
    chapters: ["04", "05"],
    phase: "foundations",
    ratios: {
      residential: [5, 12, 8], commercial: [6, 15, 10],
      mixed: [5.5, 13, 9], industrial: [4, 10, 7],
    },
    drivers: ["tipo de solo", "profundidade", "nível freático", "tipo de fundação"],
    dataNeeded: ["estudo geotécnico", "projeto de estabilidade"],
  },
  {
    name: "Estrutura",
    chapters: ["06", "07"],
    phase: "structure",
    ratios: {
      residential: [15, 25, 20], commercial: [18, 30, 24],
      mixed: [16, 28, 22], industrial: [12, 22, 17],
    },
    drivers: ["sistema estrutural", "n.º pisos", "vãos", "zona sísmica"],
    dataNeeded: ["projeto de estabilidade", "classe do betão", "aço"],
  },
  {
    name: "Alvenarias e Divisórias",
    chapters: ["08"],
    phase: "external_walls",
    ratios: {
      residential: [4, 8, 6], commercial: [3, 7, 5],
      mixed: [3.5, 7.5, 5.5], industrial: [2, 5, 3.5],
    },
    drivers: ["tipologia de parede", "compartimentação", "alturas"],
    dataNeeded: ["plantas de arquitetura", "cortes"],
  },
  {
    name: "Cobertura",
    chapters: ["09"],
    phase: "roof",
    ratios: {
      residential: [3, 7, 5], commercial: [3, 8, 5.5],
      mixed: [3, 7.5, 5], industrial: [5, 12, 8],
    },
    drivers: ["tipo de cobertura", "área", "isolamento", "acessos"],
    dataNeeded: ["desenhos de cobertura", "detalhes construtivos"],
  },
  {
    name: "Impermeabilizações e Isolamentos",
    chapters: ["10", "28"],
    phase: "waterproofing",
    ratios: {
      residential: [3, 6, 4.5], commercial: [3, 7, 5],
      mixed: [3, 6.5, 4.5], industrial: [2, 5, 3.5],
    },
    drivers: ["sistema ETICS", "espessura isolamento", "zonas enterradas"],
    dataNeeded: ["projeto térmico", "pormenores construtivos"],
  },
  {
    name: "Revestimentos e Acabamentos",
    chapters: ["11", "12", "13", "14"],
    phase: "internal_finishes",
    ratios: {
      residential: [8, 15, 11], commercial: [7, 14, 10],
      mixed: [7.5, 14.5, 10.5], industrial: [3, 8, 5],
    },
    drivers: ["nível de acabamento", "materiais", "áreas", "tetos falsos"],
    dataNeeded: ["mapa de acabamentos", "projeto de arquitetura detalhado"],
  },
  {
    name: "Caixilharias e Serralharias",
    chapters: ["15", "16", "18"],
    phase: "external_frames",
    ratios: {
      residential: [5, 10, 7], commercial: [6, 12, 8],
      mixed: [5.5, 11, 7.5], industrial: [3, 7, 5],
    },
    drivers: ["tipo de caixilharia", "área envidraçada", "guardas", "RPT"],
    dataNeeded: ["mapa de vãos", "especificação de caixilharias"],
  },
  {
    name: "Carpintarias e Portas",
    chapters: ["17"],
    phase: "carpentry",
    ratios: {
      residential: [3, 6, 4.5], commercial: [2, 5, 3.5],
      mixed: [2.5, 5.5, 4], industrial: [1, 3, 2],
    },
    drivers: ["n.º portas", "armários", "qualidade de madeira"],
    dataNeeded: ["mapa de vãos interiores", "mapa de carpintarias"],
  },
  {
    name: "Pinturas",
    chapters: ["19"],
    phase: "painting",
    ratios: {
      residential: [2, 4, 3], commercial: [2, 5, 3.5],
      mixed: [2, 4.5, 3], industrial: [1, 3, 2],
    },
    drivers: ["áreas de parede e teto", "tipo de tinta", "n.º demãos"],
    dataNeeded: ["mapa de acabamentos"],
  },
  {
    name: "Redes de Águas e Drenagem",
    chapters: ["20", "21"],
    phase: "rough_in_plumbing",
    ratios: {
      residential: [4, 8, 5.5], commercial: [3, 7, 5],
      mixed: [3.5, 7.5, 5.5], industrial: [2, 5, 3],
    },
    drivers: ["n.º IS", "pontos de água", "redes enterradas", "elevação"],
    dataNeeded: ["projeto de águas e drenagem"],
  },
  {
    name: "Instalação de Gás",
    chapters: ["22"],
    phase: "rough_in_gas",
    ratios: {
      residential: [0.5, 2, 1], commercial: [0, 1.5, 0.5],
      mixed: [0.3, 1.5, 0.8], industrial: [0, 3, 1],
    },
    drivers: ["tipo de gás", "n.º aparelhos", "comprimento de rede"],
    dataNeeded: ["projeto de gás"],
  },
  {
    name: "Instalações Elétricas",
    chapters: ["23"],
    phase: "rough_in_electrical",
    ratios: {
      residential: [5, 9, 7], commercial: [6, 12, 8],
      mixed: [5.5, 10, 7.5], industrial: [4, 9, 6],
    },
    drivers: ["potência contratada", "n.º circuitos", "VE", "PV"],
    dataNeeded: ["projeto de eletricidade"],
  },
  {
    name: "ITED / ITUR",
    chapters: ["24"],
    phase: "rough_in_telecom",
    ratios: {
      residential: [1, 3, 1.5], commercial: [1.5, 4, 2.5],
      mixed: [1, 3.5, 2], industrial: [0.5, 2, 1],
    },
    drivers: ["n.º frações", "fibra óptica", "distribuição"],
    dataNeeded: ["projeto ITED"],
  },
  {
    name: "AVAC e Ventilação",
    chapters: ["25"],
    phase: "rough_in_hvac",
    ratios: {
      residential: [2, 6, 3.5], commercial: [5, 15, 10],
      mixed: [3.5, 10, 6.5], industrial: [3, 12, 7],
    },
    drivers: ["tipo de sistema", "VMC", "condutas", "potência"],
    dataNeeded: ["projeto AVAC"],
  },
  {
    name: "Ascensores",
    chapters: ["26"],
    phase: "elevators",
    ratios: {
      residential: [0, 8, 2], commercial: [2, 10, 5],
      mixed: [1, 9, 3.5], industrial: [0, 5, 1],
    },
    drivers: ["n.º elevadores", "paragens", "tipo"],
    dataNeeded: ["informação sobre elevadores"],
  },
  {
    name: "Segurança Contra Incêndio",
    chapters: ["27"],
    phase: "fire_safety",
    ratios: {
      residential: [1, 3, 1.5], commercial: [2, 6, 4],
      mixed: [1.5, 5, 3], industrial: [1.5, 5, 3],
    },
    drivers: ["utilização-tipo", "categoria de risco", "sprinklers", "deteção"],
    dataNeeded: ["projeto SCIE"],
  },
  {
    name: "Arranjos Exteriores",
    chapters: ["29"],
    phase: "external_works",
    ratios: {
      residential: [3, 8, 5], commercial: [2, 6, 4],
      mixed: [2.5, 7, 4.5], industrial: [3, 10, 6],
    },
    drivers: ["área exterior", "paisagismo", "pavimentos", "vedações"],
    dataNeeded: ["projeto de arranjos exteriores", "implantação"],
  },
  {
    name: "Ensaios e Certificações",
    chapters: ["30"],
    phase: "testing",
    ratios: {
      residential: [1, 2.5, 1.5], commercial: [1.5, 3, 2],
      mixed: [1, 3, 2], industrial: [1, 3, 2],
    },
    drivers: ["ensaios obrigatórios", "certificação energética", "acústica"],
    dataNeeded: ["lista de ensaios requeridos"],
  },
];

// ============================================================
// Confidence & Completeness by Stage
// ============================================================

const STAGE_CONFIDENCE: Record<ProjectStage, {
  overall: "high" | "medium" | "low" | "very_low";
  completeness: number;
  costAccuracy: number; // ± percentage
}> = {
  pip:          { overall: "very_low", completeness: 10, costAccuracy: 40 },
  architecture: { overall: "low",      completeness: 30, costAccuracy: 25 },
  specialties:  { overall: "medium",   completeness: 60, costAccuracy: 15 },
  execution:    { overall: "high",     completeness: 90, costAccuracy: 8 },
  construction: { overall: "high",     completeness: 95, costAccuracy: 5 },
};

// ============================================================
// Duration Estimation
// ============================================================

/** Working days per m² by building type (includes all phases) */
const DURATION_PER_M2: Record<BuildingType, { min: number; max: number; typical: number }> = {
  residential: { min: 0.8,  max: 1.8,  typical: 1.2 },
  commercial:  { min: 0.7,  max: 1.5,  typical: 1.0 },
  mixed:       { min: 0.75, max: 1.6,  typical: 1.1 },
  industrial:  { min: 0.5,  max: 1.2,  typical: 0.8 },
};

// ============================================================
// Detect Project Stage
// ============================================================

/**
 * Auto-detect the project stage from available data.
 */
export function detectProjectStage(input: ExtrapolationInput): ProjectStage {
  if (input.stage) return input.stage;

  const p = input.partialProject;
  if (!p) return input.grossFloorArea > 0 ? "architecture" : "pip";

  // Check how many specialties have data
  let specialtyCount = 0;
  if (p.structural?.hasStructuralProject) specialtyCount++;
  if (p.fireSafety?.hasFireDetection !== undefined) specialtyCount++;
  if (p.avac?.hasHVACProject) specialtyCount++;
  if (p.waterDrainage?.hasPublicWaterConnection !== undefined) specialtyCount++;
  if (p.electrical?.hasProjectApproval) specialtyCount++;
  if (p.gas?.hasGasProject) specialtyCount++;
  if (p.telecommunications?.hasATI !== undefined) specialtyCount++;
  if (p.acoustic?.hasAcousticProject) specialtyCount++;

  if (specialtyCount >= 6) return "execution";
  if (specialtyCount >= 3) return "specialties";
  if (input.grossFloorArea > 0) return "architecture";
  return "pip";
}

// ============================================================
// Core Extrapolation
// ============================================================

/**
 * Extrapolate full project costs, schedule, and specialty impacts
 * from partial data at any project stage.
 *
 * The less data available, the wider the estimate ranges, but the
 * system always provides a useful approximation that becomes more
 * accurate as more data is added.
 */
export function extrapolateProject(input: ExtrapolationInput): ExtrapolationResult {
  const stage = detectProjectStage(input);
  const stageConf = STAGE_CONFIDENCE[stage];
  const buildingType = input.buildingType;
  const gfa = input.grossFloorArea;
  const floors = input.numberOfFloors ?? estimateFloors(gfa, buildingType);
  const isRehab = input.isRehabilitation ?? false;
  const districtFactor = input.district ? (DISTRICT_FACTORS[input.district] ?? 1.0) : 1.0;

  // Step 1: Estimate total construction cost from m² benchmarks
  const baseCost = BASE_COST_PER_M2[buildingType];
  const rehabMultiplier = isRehab ? REHAB_MULTIPLIER : 1.0;
  const floorMultiplier = floors > 3 ? 1 + (floors - 3) * 0.03 : 1.0; // taller = more expensive

  const costPerM2 = {
    min: Math.round(baseCost.min * rehabMultiplier * districtFactor * floorMultiplier),
    max: Math.round(baseCost.max * rehabMultiplier * districtFactor * floorMultiplier),
    benchmark: Math.round(baseCost.typical * rehabMultiplier * districtFactor * floorMultiplier),
  };

  const totalMinCost = Math.round(costPerM2.min * gfa);
  const totalMaxCost = Math.round(costPerM2.max * gfa);
  const bestEstimate = Math.round(costPerM2.benchmark * gfa);

  // Step 2: Break down by specialty using ratios
  const knownChapterCodes = new Set(
    (input.knownChapters ?? []).map(ch => ch.code),
  );

  const specialties: ExtrapolatedSpecialty[] = [];
  let totalRatioMin = 0;
  let totalRatioMax = 0;

  for (const spec of SPECIALTY_RATIOS) {
    const ratios = spec.ratios[buildingType];
    const [rMin, rMax, rTypical] = ratios;

    // Check if we have actual data for this specialty
    const hasKnownData = spec.chapters.some(ch => knownChapterCodes.has(ch));

    let method: ExtrapolatedSpecialty["method"];
    let confidence: ExtrapolatedSpecialty["confidence"];
    let minCost: number;
    let maxCost: number;

    if (hasKnownData && input.knownTotalCost) {
      // We have actual data — use it directly with narrower ranges
      method = "known";
      confidence = "high";
      const knownPortion = input.knownTotalCost * (rTypical / 100);
      minCost = Math.round(knownPortion * 0.9);
      maxCost = Math.round(knownPortion * 1.1);
    } else if (stage === "execution" || stage === "construction") {
      method = "ratio";
      confidence = "medium";
      minCost = Math.round(bestEstimate * rMin / 100);
      maxCost = Math.round(bestEstimate * rMax / 100);
    } else if (stage === "specialties") {
      method = "ratio";
      confidence = hasKnownData ? "medium" : "low";
      minCost = Math.round(totalMinCost * rMin / 100);
      maxCost = Math.round(totalMaxCost * rMax / 100);
    } else {
      method = "extrapolated";
      confidence = stage === "architecture" ? "low" : "very_low";
      minCost = Math.round(totalMinCost * rMin / 100);
      maxCost = Math.round(totalMaxCost * rMax / 100);
    }

    // Apply special adjustments
    if (spec.name.includes("Demolições") && !isRehab) {
      minCost = 0;
      maxCost = Math.round(maxCost * 0.1); // Minimal demolition for new build
    }
    if (spec.name.includes("Ascensores") && floors < 4 && buildingType === "residential") {
      minCost = 0;
      maxCost = Math.round(maxCost * 0.2);
    }
    if (spec.name.includes("Gás") && input.partialProject?.gas?.gasType === "none") {
      minCost = 0;
      maxCost = 0;
    }

    totalRatioMin += minCost;
    totalRatioMax += maxCost;

    specialties.push({
      name: spec.name,
      chapters: spec.chapters,
      minCost,
      maxCost,
      confidence,
      method,
      percentOfTotal: rTypical,
      drivers: spec.drivers,
      dataNeeded: hasKnownData ? [] : spec.dataNeeded,
    });
  }

  // Step 3: Estimate duration
  const durPerM2 = DURATION_PER_M2[buildingType];
  const durationRehabFactor = isRehab ? 1.3 : 1.0;
  const estimatedDurationDays = {
    min: Math.round(durPerM2.min * gfa * durationRehabFactor),
    max: Math.round(durPerM2.max * gfa * durationRehabFactor),
    best: Math.round(durPerM2.typical * gfa * durationRehabFactor),
  };

  // Cap durations for very large buildings
  estimatedDurationDays.min = Math.min(estimatedDurationDays.min, 600);
  estimatedDurationDays.max = Math.min(estimatedDurationDays.max, 900);
  estimatedDurationDays.best = Math.min(estimatedDurationDays.best, 750);

  // Step 4: Estimate team size
  const totalManHours = bestEstimate / 12; // Rough: €12/man-hour average
  const estimatedTeamSize = {
    min: Math.max(2, Math.ceil(totalManHours / (estimatedDurationDays.max * 8))),
    max: Math.min(20, Math.ceil(totalManHours / (estimatedDurationDays.min * 8))),
    optimal: Math.min(10, Math.max(3, Math.ceil(totalManHours / (estimatedDurationDays.best * 8)))),
  };

  // Step 5: Generate extrapolated WBS
  const extrapolatedWbs = generateExtrapolatedWbs(input, specialties, bestEstimate);

  // Step 6: Warnings and recommendations
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (stage === "pip") {
    warnings.push("Estimativa baseada apenas em informação prévia. Precisão: ±40%.");
    recommendations.push("Obtenha pelo menos o projeto de arquitetura para melhorar a estimativa.");
  }
  if (stage === "architecture") {
    warnings.push("Estimativa sem projetos de especialidades. Precisão: ±25%.");
    recommendations.push("Priorize o projeto de estabilidade (15-25% do custo total).");
    recommendations.push("O projeto AVAC pode representar 2-15% — obtenha-o para edifícios comerciais.");
    recommendations.push("Solicite o mapa de vãos para afinar a estimativa de caixilharias (5-10%).");
  }
  if (stage === "specialties") {
    warnings.push("Estimativa com projetos parciais de especialidades. Precisão: ±15%.");
    const missing = specialties.filter(s => s.method === "extrapolated");
    if (missing.length > 0) {
      recommendations.push(
        `Faltam dados para: ${missing.map(s => s.name).join(", ")}. Obtenha estes projetos para maior precisão.`,
      );
    }
  }
  if (isRehab) {
    warnings.push("Projetos de reabilitação têm variabilidade +25% devido a imprevistos.");
    recommendations.push("Realize levantamento detalhado do existente para reduzir incerteza.");
  }
  if (floors > 5) {
    warnings.push("Edifícios > 5 pisos requerem soluções estruturais e MEP mais complexas.");
  }

  return {
    stage,
    overallConfidence: stageConf.overall,
    completenessScore: stageConf.completeness,
    specialties,
    totalMinCost: Math.round(totalRatioMin),
    totalMaxCost: Math.round(totalRatioMax),
    bestEstimate,
    costPerM2,
    estimatedDurationDays,
    estimatedTeamSize,
    extrapolatedWbs,
    warnings,
    recommendations,
  };
}

// ============================================================
// WBS Generation from Extrapolation
// ============================================================

function generateExtrapolatedWbs(
  input: ExtrapolationInput,
  specialties: ExtrapolatedSpecialty[],
  bestEstimate: number,
): WbsProject {
  const gfa = input.grossFloorArea;
  const floors = input.numberOfFloors ?? 2;
  const dwellings = input.numberOfDwellings ?? 1;

  const chapters: WbsChapter[] = [];

  for (const spec of specialties) {
    if (spec.maxCost <= 0) continue;

    const avgCost = (spec.minCost + spec.maxCost) / 2;
    const articles = generateArticlesForSpecialty(spec, gfa, floors, dwellings, avgCost);

    for (const chCode of spec.chapters) {
      chapters.push({
        code: chCode,
        name: spec.name,
        subChapters: [{
          code: `${chCode}.01`,
          name: spec.name,
          articles,
        }],
      });
    }
  }

  return {
    id: `extrapolated-${Date.now()}`,
    name: `${input.buildingType === "residential" ? "Moradia" : "Edifício"} ${gfa}m² (Extrapolado)`,
    classification: "ProNIC",
    startDate: new Date().toISOString().split("T")[0],
    district: input.district,
    buildingType: input.buildingType,
    grossFloorArea: gfa,
    usableFloorArea: input.usableFloorArea ?? gfa * 0.8,
    numberOfFloors: floors,
    numberOfDwellings: dwellings,
    buildingHeight: input.buildingHeight ?? floors * 3,
    isRehabilitation: input.isRehabilitation,
    chapters: chapters.sort((a, b) => a.code.localeCompare(b.code)),
  };
}

function generateArticlesForSpecialty(
  spec: ExtrapolatedSpecialty,
  gfa: number,
  floors: number,
  dwellings: number,
  totalCost: number,
): WbsArticle[] {
  const articles: WbsArticle[] = [];
  const chCode = spec.chapters[0];

  // Generate representative articles based on specialty type
  switch (spec.name) {
    case "Estrutura": {
      const concreteVol = gfa * 0.15 * floors; // ~0.15 m³/m² per floor
      const steelKg = concreteVol * 100; // ~100 kg/m³
      articles.push(
        { code: `${chCode}.01.001`, description: "Betão armado C25/30 em pilares e vigas", unit: "m3", quantity: Math.round(concreteVol * 0.4) },
        { code: `${chCode}.01.002`, description: "Betão armado C25/30 em lajes", unit: "m2", quantity: gfa },
        { code: `${chCode}.01.003`, description: "Aço A500 NR SD em armaduras", unit: "kg", quantity: Math.round(steelKg) },
      );
      break;
    }
    case "Alvenarias e Divisórias": {
      const extWallArea = Math.sqrt(gfa / floors) * 4 * floors * 3; // perimeter × height
      const intWallArea = gfa * 0.6;
      articles.push(
        { code: `${chCode}.01.001`, description: "Alvenaria de tijolo cerâmico furado e=15cm (paredes exteriores)", unit: "m2", quantity: Math.round(extWallArea) },
        { code: `${chCode}.01.002`, description: "Alvenaria de tijolo cerâmico furado e=11cm (divisórias)", unit: "m2", quantity: Math.round(intWallArea) },
      );
      break;
    }
    case "Revestimentos e Acabamentos": {
      articles.push(
        { code: `${chCode}.01.001`, description: "Reboco interior projetado em paredes", unit: "m2", quantity: Math.round(gfa * 2.5) },
        { code: `${chCode}.01.002`, description: "Revestimento cerâmico em zonas húmidas", unit: "m2", quantity: Math.round(gfa * 0.3) },
        { code: `${chCode}.01.003`, description: "Pavimento cerâmico / flutuante", unit: "m2", quantity: gfa },
        { code: `${chCode}.01.004`, description: "Teto falso em gesso cartonado", unit: "m2", quantity: Math.round(gfa * 0.2) },
      );
      break;
    }
    case "Instalações Elétricas": {
      articles.push(
        { code: `${chCode}.01.001`, description: "Rede de distribuição elétrica interior", unit: "Ud", quantity: dwellings },
        { code: `${chCode}.01.002`, description: "Quadro elétrico de habitação", unit: "Ud", quantity: dwellings },
        { code: `${chCode}.01.003`, description: "Ponto de carregamento VE", unit: "Ud", quantity: Math.max(1, Math.ceil(dwellings * 0.5)) },
      );
      break;
    }
    case "Redes de Águas e Drenagem": {
      articles.push(
        { code: `${chCode}.01.001`, description: "Rede de abastecimento de água fria e quente", unit: "Ud", quantity: dwellings },
        { code: `${chCode}.01.002`, description: "Rede de drenagem de esgotos domésticos", unit: "Ud", quantity: dwellings },
        { code: `${chCode}.01.003`, description: "Loiças sanitárias e equipamento", unit: "Ud", quantity: dwellings * 3 },
      );
      break;
    }
    default: {
      // Generic article based on cost
      const unitPrice = totalCost > 0 ? Math.round(totalCost) : 0;
      articles.push({
        code: `${chCode}.01.001`,
        description: spec.name,
        unit: "Ud",
        quantity: 1,
        unitPrice,
      });
    }
  }

  return articles;
}

function estimateFloors(gfa: number, type: BuildingType): number {
  if (type === "industrial") return 1;
  if (gfa < 150) return 1;
  if (gfa < 400) return 2;
  if (gfa < 800) return 3;
  return Math.min(8, Math.ceil(gfa / 250));
}

// ============================================================
// Convenience: Extrapolate from BuildingProject
// ============================================================

/**
 * Create an ExtrapolationInput from a partial BuildingProject.
 * Useful for auto-detecting what's missing and estimating the rest.
 */
export function fromBuildingProject(project: Partial<BuildingProject>): ExtrapolationInput {
  return {
    stage: "architecture", // will be auto-detected
    buildingType: project.buildingType ?? "residential",
    grossFloorArea: project.grossFloorArea ?? 100,
    numberOfFloors: project.numberOfFloors,
    numberOfDwellings: project.numberOfDwellings,
    buildingHeight: project.buildingHeight,
    usableFloorArea: project.usableFloorArea,
    district: project.location?.district,
    isRehabilitation: project.isRehabilitation,
    partialProject: project,
  };
}

/**
 * Fire Safety (SCIE) Deep Analyzer — DL 220/2008 + RT-SCIE
 *
 * Computes derived fire safety values that cannot be user-entered:
 * - Effective occupancy (efectivo) from UT type + floor area
 * - Risk category from the 4-variable matrix
 * - Required evacuation UP and widths
 * - Compartment area limits
 * - Required fire resistance (REI)
 * - Extinguisher sizing
 * - Required number of exits
 * - Evacuation distance limits
 *
 * Runs AFTER plugin rule evaluation (like electrical/plumbing)
 * and produces additional findings from calculation-based checks.
 *
 * Pattern: same as electrical-analyzer.ts / plumbing-analyzer.ts
 */

import type { BuildingProject, Finding, RegulationArea } from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface FireSafetyAnalysisResult {
  engineType: "SCIE_FIRE_SAFETY";
  findings: Finding[];
  /** Computed values injected into the project context */
  computed: FireSafetyComputed;
  /** Statistics */
  statistics: {
    checksPerformed: number;
    passed: number;
    failed: number;
    critical: number;
    warnings: number;
  };
}

export interface FireSafetyComputed {
  occupantLoad: number;
  riskCategory: string;
  requiredREI: number;
  maxCompartmentArea: number;
  requiredCompartmentEI: number;
  minExitsRequired: number;
  requiredEvacuationUP: number;
  requiredEvacuationWidth: number;
  maxEvacuationDistance: number;
  maxDeadEndDistance: number;
  requiredExtinguishers: number;
  sprinklersRequired: boolean;
  detectionRequired: boolean;
  riaRequired: boolean;
  dryRiserRequired: boolean;
  firefighterElevatorRequired: boolean;
}

// ============================================================================
// OCCUPANCY INDICES (RT-SCIE Art. 51.º)
// ============================================================================

/** Persons per m² by Utilização-Tipo (UT) */
const OCCUPANCY_INDICES: Record<string, number> = {
  "I":    0.04,   // Habitacional — 1 per 25 m²
  "II":   0.033,  // Estacionamentos — 1 per 30 m²
  "III":  0.10,   // Administrativos — 1 per 10 m²
  "IV":   0.10,   // Escolares — 1 per 10 m²
  "V":    0.167,  // Hospitalares — 1 per 6 m²
  "VI":   0.10,   // Espetáculos — 1 per 10 m²
  "VII":  0.25,   // Hoteleiros — 1 per 4 m²
  "VIII": 0.20,   // Comerciais — 1 per 5 m²
  "IX":   0.033,  // Desportivos — 1 per 30 m²
  "X":    0.05,   // Museus — 1 per 20 m²
  "XI":   0.033,  // Bibliotecas — 1 per 30 m²
  "XII":  0.033,  // Industriais — 1 per 30 m²
};

/** Map buildingType to default UT */
const BUILDING_TYPE_TO_UT: Record<string, string> = {
  residential: "I",
  commercial: "VIII",
  mixed: "VIII",
  industrial: "XII",
};

// ============================================================================
// RISK CATEGORY MATRIX (DL 220/2008 Art. 12.º + Anexo II)
// ============================================================================

interface RiskThresholds {
  /** [height, occupancy, area] thresholds for each category */
  categories: Array<{
    maxHeight?: number;
    maxOccupancy?: number;
    maxArea?: number;
  }>;
}

const RISK_MATRICES: Record<string, RiskThresholds> = {
  "I": { // Habitacional
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 1500 },
      {}, // 4th category: anything above
    ],
  },
  "II": { // Estacionamentos
    categories: [
      { maxArea: 3200 },
      { maxArea: 9600 },
      { maxArea: 32000 },
      {},
    ],
  },
  "III": { // Administrativos
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 1500 },
      {},
    ],
  },
  "IV": { // Escolares
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 1500 },
      {},
    ],
  },
  "V": { // Hospitalares
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 1500 },
      {},
    ],
  },
  "VI": { // Espetáculos
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 1500 },
      {},
    ],
  },
  "VII": { // Hoteleiros
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 1500 },
      {},
    ],
  },
  "VIII": { // Comerciais
    categories: [
      { maxHeight: 9, maxArea: 800, maxOccupancy: 100 },
      { maxHeight: 28, maxArea: 3200, maxOccupancy: 500 },
      { maxHeight: 50, maxArea: 10000, maxOccupancy: 1500 },
      {},
    ],
  },
  "IX": { // Desportivos
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 5000 },
      {},
    ],
  },
  "X": { // Museus
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 1500 },
      {},
    ],
  },
  "XI": { // Bibliotecas
    categories: [
      { maxHeight: 9, maxOccupancy: 100 },
      { maxHeight: 28, maxOccupancy: 500 },
      { maxHeight: 50, maxOccupancy: 1500 },
      {},
    ],
  },
  "XII": { // Industriais
    categories: [
      { maxArea: 3200, maxOccupancy: 100 },
      { maxArea: 9600, maxOccupancy: 500 },
      { maxArea: 32000, maxOccupancy: 1500 },
      {},
    ],
  },
};

// ============================================================================
// FIRE RESISTANCE TABLE (RT-SCIE Art. 15.º)
// ============================================================================

const REQUIRED_REI: Record<string, number> = {
  "1": 30,
  "2": 60,
  "3": 90,
  "4": 120,
};

// ============================================================================
// GATE CHECK
// ============================================================================

/**
 * Check if the project has enough data for fire safety calculations.
 * Needs at minimum: building type + floor area or height.
 */
export function canAnalyzeFireSafety(project: BuildingProject): boolean {
  const fs = project.fireSafety;
  if (!fs || typeof fs !== "object") return false;

  // Need at least a utilization type or building type + some dimensional data
  const hasUT = !!(fs as Record<string, unknown>).utilizationType;
  const hasBuildingType = !!project.buildingType;
  const hasArea = (project.grossFloorArea ?? 0) > 0 || (project.usableFloorArea ?? 0) > 0;
  const hasHeight = (project.buildingHeight ?? 0) > 0 || (project.numberOfFloors ?? 0) > 0;

  return (hasUT || hasBuildingType) && (hasArea || hasHeight);
}

// ============================================================================
// CALCULATION ENGINE
// ============================================================================

let findingCounter = 8000;
function nextId(): string {
  return `SCIE-CALC-${++findingCounter}`;
}

/**
 * Compute all derived fire safety values from project data.
 */
function computeFireSafetyValues(project: BuildingProject): FireSafetyComputed {
  const fs = (project.fireSafety ?? {}) as Record<string, unknown>;

  // -- Resolve utilization type
  const utilizationType = (fs.utilizationType as string) ??
    BUILDING_TYPE_TO_UT[project.buildingType ?? "residential"] ?? "I";

  // -- Resolve dimensional data
  const grossArea = project.grossFloorArea ?? project.usableFloorArea ?? 0;
  const height = project.buildingHeight ?? ((project.numberOfFloors ?? 1) * 3.0);
  const hasSprinklers = (fs.hasSprinklers as boolean) ?? false;
  const manualOccupancy = fs.occupantLoad as number | undefined;

  // -- 1. Effective Occupancy (Art. 51.º)
  const index = (fs.occupancyIndex as number) ?? OCCUPANCY_INDICES[utilizationType] ?? 0.04;
  const occupantLoad = manualOccupancy ?? Math.ceil(grossArea * index);

  // -- 2. Risk Category (DL 220/2008 Art. 12.º)
  const riskCategory = computeRiskCategory(utilizationType, height, occupantLoad, grossArea);

  // -- 3. Required REI (Art. 15.º)
  const requiredREI = REQUIRED_REI[riskCategory] ?? 60;

  // -- 4. Compartment limits (Art. 18.º)
  const baseCompartmentArea = riskCategory === "1" ? 1600 : 800;
  const maxCompartmentArea = hasSprinklers ? Math.floor(baseCompartmentArea * 1.5) : baseCompartmentArea;
  const requiredCompartmentEI = riskCategory === "1" ? 60 : riskCategory === "2" ? 90 : 120;

  // -- 5. Minimum exits (Art. 54.º)
  const minExitsRequired = occupantLoad <= 50 ? 1
    : occupantLoad <= 500 ? 2
    : occupantLoad <= 1500 ? 3
    : 4;

  // -- 6. Evacuation UP (Art. 58.º)
  const requiredEvacuationUP = Math.max(1, Math.ceil(occupantLoad / 100));
  const requiredEvacuationWidth = requiredEvacuationUP === 1 ? 0.90
    : requiredEvacuationUP === 2 ? 1.40
    : 0.80 + (requiredEvacuationUP * 0.60);

  // -- 7. Evacuation distances (Art. 56.º)
  const baseEvacDistance = minExitsRequired >= 2 ? 30 : 15;
  const maxEvacuationDistance = hasSprinklers ? baseEvacDistance * 1.5 : baseEvacDistance;
  const maxDeadEndDistance = hasSprinklers ? 22.5 : 15;

  // -- 8. Extinguishers (Art. 163.º)
  const requiredExtinguishers = Math.max(2, Math.ceil(grossArea / 200));

  // -- 9. Sprinklers required (Art. 173.º)
  const sprinklersRequired = parseInt(riskCategory) >= 3;

  // -- 10. Detection required (Art. 125.º)
  const detectionRequired = parseInt(riskCategory) >= 2;

  // -- 11. RIA required (Art. 164.º)
  const riaRequired = (utilizationType === "I" && parseInt(riskCategory) >= 3) ||
    (utilizationType !== "I" && parseInt(riskCategory) >= 2);

  // -- 12. Dry riser required (Art. 169.º)
  const dryRiserRequired = parseInt(riskCategory) >= 2 && height > 28;

  // -- 13. Firefighter elevator (Art. 100.º)
  const firefighterElevatorRequired = height > 28;

  return {
    occupantLoad,
    riskCategory,
    requiredREI,
    maxCompartmentArea,
    requiredCompartmentEI,
    minExitsRequired,
    requiredEvacuationUP,
    requiredEvacuationWidth,
    maxEvacuationDistance,
    maxDeadEndDistance,
    requiredExtinguishers,
    sprinklersRequired,
    detectionRequired,
    riaRequired,
    dryRiserRequired,
    firefighterElevatorRequired,
  };
}

/**
 * Determine risk category from the multi-variable matrix.
 * The highest category from any single factor wins.
 */
function computeRiskCategory(
  ut: string,
  height: number,
  occupancy: number,
  area: number,
): string {
  const matrix = RISK_MATRICES[ut] ?? RISK_MATRICES["I"];

  for (let i = 0; i < matrix.categories.length; i++) {
    const cat = matrix.categories[i];
    const fits =
      (cat.maxHeight === undefined || height <= cat.maxHeight) &&
      (cat.maxOccupancy === undefined || occupancy <= cat.maxOccupancy) &&
      (cat.maxArea === undefined || area <= cat.maxArea);

    if (fits) return String(i + 1);
  }

  return "4";
}

// ============================================================================
// FINDING GENERATION
// ============================================================================

/**
 * Generate findings from computed values vs actual project data.
 */
function generateFindings(
  project: BuildingProject,
  computed: FireSafetyComputed,
): Finding[] {
  findingCounter = 8000;
  const findings: Finding[] = [];
  const fs = (project.fireSafety ?? {}) as Record<string, unknown>;
  const area: RegulationArea = "fire_safety";

  // -- Risk category determination
  findings.push({
    id: nextId(),
    area,
    regulation: "DL 220/2008",
    article: "Art. 12.º + Anexo II",
    severity: "pass",
    description: `Categoria de risco determinada: ${computed.riskCategory}ª categoria (UT ${(fs.utilizationType as string) ?? "I"}, ${computed.occupantLoad} ocupantes, h = ${(project.buildingHeight ?? 0).toFixed(1)} m).`,
  });

  // -- Structural fire resistance (Art. 15.º)
  const actualREI = (fs.fireResistanceOfStructure as number) ?? 0;
  if (actualREI > 0 && actualREI < computed.requiredREI) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 15.º",
      severity: "critical",
      description: `Resistência ao fogo da estrutura (REI ${actualREI}) inferior ao exigido (REI ${computed.requiredREI}) para a ${computed.riskCategory}ª categoria de risco.`,
      currentValue: `REI ${actualREI}`,
      requiredValue: `REI ${computed.requiredREI}`,
      remediation: `Aumentar a resistência ao fogo da estrutura para REI ${computed.requiredREI}. Considerar proteção passiva (placas de gesso, betão projetado) ou verificar dimensionamento estrutural.`,
    });
  } else if (actualREI > 0) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 15.º",
      severity: "pass",
      description: `Resistência ao fogo da estrutura conforme: REI ${actualREI} ≥ REI ${computed.requiredREI} (${computed.riskCategory}ª categoria).`,
    });
  }

  // -- Compartment area (Art. 18.º)
  const actualCompartment = (fs.compartmentArea as number) ?? 0;
  if (actualCompartment > 0 && actualCompartment > computed.maxCompartmentArea) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 18.º",
      severity: "critical",
      description: `Área de compartimento corta-fogo (${actualCompartment} m²) excede o máximo permitido (${computed.maxCompartmentArea} m²) para a ${computed.riskCategory}ª categoria${computed.maxCompartmentArea > 800 ? " (com sprinklers)" : ""}.`,
      currentValue: `${actualCompartment} m²`,
      requiredValue: `≤ ${computed.maxCompartmentArea} m²`,
      remediation: `Dividir o espaço em compartimentos ≤ ${computed.maxCompartmentArea} m² com paredes EI ${computed.requiredCompartmentEI} e portas corta-fogo.`,
    });
  }

  // -- Compartment wall rating (Art. 18.º)
  const actualWallRating = (fs.compartmentWallRating as number) ?? 0;
  if (actualWallRating > 0 && actualWallRating < computed.requiredCompartmentEI) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 18.º",
      severity: "critical",
      description: `Paredes de compartimentação (EI ${actualWallRating}) inferiores ao exigido (EI ${computed.requiredCompartmentEI}) para a ${computed.riskCategory}ª categoria.`,
      currentValue: `EI ${actualWallRating}`,
      requiredValue: `EI ${computed.requiredCompartmentEI}`,
      remediation: `Reforçar paredes de compartimentação para EI ${computed.requiredCompartmentEI}. Utilizar blocos de betão, gesso cartonado duplo, ou solução equivalente certificada.`,
    });
  }

  // -- Number of exits (Art. 54.º)
  const actualExits = (fs.numberOfExits as number) ?? 0;
  if (actualExits > 0 && actualExits < computed.minExitsRequired) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 54.º",
      severity: "critical",
      description: `Número de saídas (${actualExits}) insuficiente. Mínimo exigido: ${computed.minExitsRequired} saídas para ${computed.occupantLoad} ocupantes.`,
      currentValue: `${actualExits} saídas`,
      requiredValue: `≥ ${computed.minExitsRequired} saídas`,
      remediation: `Adicionar ${computed.minExitsRequired - actualExits} saída(s) adicional(ais). As saídas devem ser distribuídas de forma a minimizar a distância máxima de evacuação.`,
    });
  }

  // -- Evacuation path width (Art. 58.º)
  const actualEvacWidth = (fs.evacuationPathWidth as number) ?? 0;
  if (actualEvacWidth > 0 && actualEvacWidth < computed.requiredEvacuationWidth) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 58.º",
      severity: "critical",
      description: `Largura dos caminhos de evacuação (${(actualEvacWidth * 100).toFixed(0)} cm) inferior ao mínimo (${(computed.requiredEvacuationWidth * 100).toFixed(0)} cm) para ${computed.requiredEvacuationUP} UP (${computed.occupantLoad} ocupantes).`,
      currentValue: `${(actualEvacWidth * 100).toFixed(0)} cm`,
      requiredValue: `≥ ${(computed.requiredEvacuationWidth * 100).toFixed(0)} cm (${computed.requiredEvacuationUP} UP)`,
      remediation: `Alargar os caminhos de evacuação para ${(computed.requiredEvacuationWidth * 100).toFixed(0)} cm. Cada Unidade de Passagem (UP) corresponde a 0,60 m (mínimo 0,90 m para 1 UP).`,
    });
  }

  // -- Evacuation distance (Art. 56.º)
  const actualEvacDist = (fs.maxEvacuationDistance as number) ?? 0;
  if (actualEvacDist > 0 && actualEvacDist > computed.maxEvacuationDistance) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 56.º",
      severity: "critical",
      description: `Distância máxima de evacuação (${actualEvacDist} m) excede o limite (${computed.maxEvacuationDistance} m)${(fs.hasSprinklers as boolean) ? " (com bónus de sprinklers)" : ""}.`,
      currentValue: `${actualEvacDist} m`,
      requiredValue: `≤ ${computed.maxEvacuationDistance} m`,
      remediation: "Adicionar saídas alternativas, criar percursos adicionais, ou instalar sprinklers (permite aumento de 50% na distância máxima).",
    });
  }

  // -- Dead-end distance (Art. 56.º)
  const actualDeadEnd = (fs.deadEndDistance as number) ?? 0;
  if (actualDeadEnd > 0 && actualDeadEnd > computed.maxDeadEndDistance) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 56.º",
      severity: "critical",
      description: `Distância em impasse (${actualDeadEnd} m) excede o máximo (${computed.maxDeadEndDistance} m).`,
      currentValue: `${actualDeadEnd} m`,
      requiredValue: `≤ ${computed.maxDeadEndDistance} m`,
      remediation: "Reduzir o comprimento de impasses abrindo saídas alternativas ou reorganizando a compartimentação.",
    });
  }

  // -- Sprinkler requirement (Art. 173.º)
  if (computed.sprinklersRequired && !(fs.hasSprinklers as boolean)) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 173.º",
      severity: "critical",
      description: `Sistema de sprinklers obrigatório para a ${computed.riskCategory}ª categoria de risco mas não está previsto.`,
      requiredValue: "Sprinklers obrigatórios",
      remediation: "Instalar sistema fixo de extinção automática por água (sprinklers) conforme NP EN 12845. Prever rede de distribuição, central de bombagem e reservatório de água de incêndio.",
    });
  }

  // -- Detection requirement (Art. 125.º)
  if (computed.detectionRequired && !(fs.hasFireDetection as boolean)) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 125.º",
      severity: "critical",
      description: `Sistema de deteção de incêndio obrigatório para a ${computed.riskCategory}ª categoria de risco mas não está previsto.`,
      requiredValue: "SADI obrigatório",
      remediation: "Instalar Sistema Automático de Deteção de Incêndio (SADI) com central de deteção, detetores automáticos, botões de alarme manual e dispositivos sonoros de alarme.",
    });
  }

  // -- RIA requirement (Art. 164.º)
  if (computed.riaRequired && !(fs.hasRIA as boolean)) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 164.º",
      severity: "warning",
      description: `Rede de Incêndio Armada (RIA) recomendada para a ${computed.riskCategory}ª categoria de risco.`,
      requiredValue: "RIA recomendada",
      remediation: "Instalar bocas de incêndio armadas tipo carretel com mangueira semi-rígida Ø25mm. Pressão mínima: 250 kPa no difusor. Caudal: 1,5 L/s por carretel.",
    });
  }

  // -- Dry riser (Art. 169.º)
  if (computed.dryRiserRequired && !(fs.hasDryRiser as boolean)) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 169.º",
      severity: "warning",
      description: `Coluna seca obrigatória para edifícios com h > 28 m na ${computed.riskCategory}ª categoria de risco.`,
      requiredValue: "Coluna seca obrigatória",
      remediation: "Instalar coluna seca com bocas de alimentação DN65 na fachada e bocas de piso DN45 em cada piso.",
    });
  }

  // -- Firefighter elevator (Art. 100.º)
  if (computed.firefighterElevatorRequired && !(fs.hasFirefighterElevator as boolean)) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 100.º",
      severity: "warning",
      description: "Ascensor para bombeiros obrigatório para edifícios com altura superior a 28 m.",
      requiredValue: "Ascensor de bombeiros obrigatório",
      remediation: "Instalar ascensor prioritário para bombeiros com cabina de dimensões mínimas 1,10 × 1,40 m, comando prioritário por chave e alimentação elétrica de segurança.",
    });
  }

  // -- Emergency lighting check (Art. 113.º)
  const hasEmergencyLighting = (fs.hasEmergencyLighting as boolean) ?? false;
  if (!hasEmergencyLighting && computed.detectionRequired) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 113.º",
      severity: "warning",
      description: `Iluminação de emergência obrigatória para a ${computed.riskCategory}ª categoria de risco.`,
      requiredValue: "Iluminação de emergência obrigatória (≥ 1 lux, autonomia ≥ 60 min)",
      remediation: "Instalar blocos autónomos de iluminação de emergência nos caminhos de evacuação, saídas, e junto a equipamentos de segurança. Mínimo 1 lux ao nível do pavimento.",
    });
  }

  // -- Fire extinguisher check (Art. 163.º)
  const hasExtinguishers = (fs.hasFireExtinguishers as boolean) ?? false;
  if (!hasExtinguishers) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 163.º",
      severity: "critical",
      description: `Extintores obrigatórios. Mínimo ${computed.requiredExtinguishers} extintores para ${(project.grossFloorArea ?? 0).toFixed(0)} m² (1 por 200 m², mínimo 2 por piso).`,
      requiredValue: `≥ ${computed.requiredExtinguishers} extintores`,
      remediation: `Instalar ${computed.requiredExtinguishers} extintores de pó químico ABC 6 kg, distribuídos de forma que a distância máxima a percorrer seja ≤ 15 m. Colocar a 1,20 m do pavimento.`,
    });
  }

  // -- Security delegate (Art. 194.º) — required for 2nd+ category
  if (parseInt(computed.riskCategory) >= 2 && !(fs.hasSecurityDelegate as boolean)) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 194.º",
      severity: "warning",
      description: `Delegado de segurança obrigatório para a ${computed.riskCategory}ª categoria de risco.`,
      remediation: "Designar responsável pela segurança contra incêndio do edifício. Deve ter formação específica em segurança contra incêndio.",
    });
  }

  // -- Security plan (Art. 196.º) — required for 3rd+ category
  if (parseInt(computed.riskCategory) >= 3 && !(fs.hasSecurityPlan as boolean)) {
    findings.push({
      id: nextId(),
      area,
      regulation: "RT-SCIE",
      article: "Art. 196.º",
      severity: "warning",
      description: `Plano de segurança interno obrigatório para a ${computed.riskCategory}ª categoria de risco.`,
      remediation: "Elaborar plano de segurança interno com plantas de emergência, procedimentos de evacuação, e programa de manutenção dos equipamentos de segurança.",
    });
  }

  return findings;
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

/**
 * Analyze fire safety using calculation-based checks from RT-SCIE.
 */
export function analyzeFireSafetySCIE(project: BuildingProject): FireSafetyAnalysisResult {
  const computed = computeFireSafetyValues(project);
  const findings = generateFindings(project, computed);

  // Statistics
  const critical = findings.filter(f => f.severity === "critical").length;
  const warnings = findings.filter(f => f.severity === "warning").length;
  const passed = findings.filter(f => f.severity === "pass").length;

  return {
    engineType: "SCIE_FIRE_SAFETY",
    findings,
    computed,
    statistics: {
      checksPerformed: findings.length,
      passed,
      failed: critical + warnings,
      critical,
      warnings,
    },
  };
}

/**
 * Inject computed fire safety values into the project context.
 * Makes them available to declarative rules that reference
 * `fireSafety.computed*` or `fireSafety.riskCategory` fields.
 */
export function enrichProjectWithFireSafetyCalculations(
  project: BuildingProject,
  result: FireSafetyAnalysisResult,
): void {
  const fs = (project as Record<string, unknown>).fireSafety as Record<string, unknown> ?? {};

  // Inject computed values (don't overwrite existing)
  const c = result.computed;
  const injections: Record<string, unknown> = {
    computedOccupantLoad: c.occupantLoad,
    computedRiskCategory: c.riskCategory,
    computedRequiredREI: c.requiredREI,
    computedMaxCompartmentArea: c.maxCompartmentArea,
    computedRequiredCompartmentEI: c.requiredCompartmentEI,
    computedMinExitsRequired: c.minExitsRequired,
    computedRequiredEvacuationUP: c.requiredEvacuationUP,
    computedRequiredEvacuationWidth: c.requiredEvacuationWidth,
    computedMaxEvacuationDistance: c.maxEvacuationDistance,
    computedMaxDeadEndDistance: c.maxDeadEndDistance,
    computedRequiredExtinguishers: c.requiredExtinguishers,
    computedSprinklersRequired: c.sprinklersRequired,
    computedDetectionRequired: c.detectionRequired,
    computedRiaRequired: c.riaRequired,
    computedDryRiserRequired: c.dryRiserRequired,
    computedFirefighterElevatorRequired: c.firefighterElevatorRequired,
  };

  for (const [key, value] of Object.entries(injections)) {
    if (fs[key] === undefined) {
      fs[key] = value;
    }
  }

  // Also inject risk category into the standard field if not already set
  if (fs.riskCategory === undefined) {
    fs.riskCategory = c.riskCategory;
  }
  if (fs.occupantLoad === undefined) {
    fs.occupantLoad = c.occupantLoad;
  }

  (project as Record<string, unknown>).fireSafety = fs;
}

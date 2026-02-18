/**
 * Energy/SCE Deep Analyzer — DL 101-D/2020 + REH (DL 118/2013)
 *
 * Bridges the calculation engine (Ntc/Nt methodology) with the
 * declarative rule engine. Runs BEFORE plugin rule evaluation so
 * computed values (energy class, Ntc/Nt ratio, etc.) are available
 * to the 129 energy + thermal rules.
 *
 * Pattern: same as electrical-analyzer.ts / plumbing-analyzer.ts
 */

import type { BuildingProject, Finding, RegulationArea } from "./types";
import {
  calculateThermal,
  calculateEnergyClass,
  type ThermalResult,
  type EnergyClassResult,
} from "./calculations";

// ============================================================================
// TYPES
// ============================================================================

export interface EnergyAnalysisResult {
  engineType: "SCE_ENERGY";
  thermal: ThermalResult;
  energyClass: EnergyClassResult;
  findings: Finding[];
  /** Values injected into the project context for rule evaluation */
  injectedFields: Record<string, unknown>;
}

// ============================================================================
// GATE CHECK
// ============================================================================

/**
 * Check if the project has enough envelope + location data for
 * thermal/energy calculations.
 */
export function canAnalyzeEnergy(project: BuildingProject): boolean {
  const { envelope, location } = project;
  if (!envelope || !location) return false;

  // Need at minimum: one U-value, window area, climate zones
  const hasEnvelope =
    envelope.externalWallUValue > 0 &&
    envelope.externalWallArea > 0 &&
    envelope.windowArea >= 0;

  const hasClimate =
    !!location.climateZoneWinter &&
    !!location.climateZoneSummer;

  return hasEnvelope && hasClimate;
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

let findingCounter = 7000;

function nextId(): string {
  return `SCE-${++findingCounter}`;
}

/**
 * Run full energy/thermal calculations and produce findings.
 *
 * Call this BEFORE plugin rule evaluation so the injected fields
 * are available to energy and thermal rules.
 */
export function analyzeEnergySCE(project: BuildingProject): EnergyAnalysisResult {
  findingCounter = 7000;

  const thermal = calculateThermal(project);
  const energyClass = calculateEnergyClass(project);
  const findings: Finding[] = [];

  const isNew = !project.isRehabilitation;
  const isResidential = project.buildingType === "residential" || project.buildingType === "mixed";

  // ── Thermal compliance (REH) ─────────────────────────────

  // Nic vs Ni (heating needs)
  if (thermal.Nic > thermal.Ni) {
    findings.push({
      id: nextId(),
      area: "thermal" as RegulationArea,
      regulation: "REH (DL 118/2013)",
      article: "Art. 26.º",
      severity: "critical",
      description: `Necessidades de aquecimento (Nic = ${thermal.Nic.toFixed(1)} kWh/m².ano) excedem o máximo regulamentar (Ni = ${thermal.Ni.toFixed(1)} kWh/m².ano).`,
      currentValue: `Nic = ${thermal.Nic.toFixed(1)} kWh/m².ano`,
      requiredValue: `Ni ≤ ${thermal.Ni.toFixed(1)} kWh/m².ano`,
      remediation: "Melhorar isolamento térmico da envolvente (paredes, cobertura, pavimento) ou reduzir pontes térmicas. Considerar sistema de recuperação de calor na ventilação.",
    });
  } else {
    findings.push({
      id: nextId(),
      area: "thermal" as RegulationArea,
      regulation: "REH (DL 118/2013)",
      article: "Art. 26.º",
      severity: "pass",
      description: `Necessidades de aquecimento conformes: Nic = ${thermal.Nic.toFixed(1)} ≤ Ni = ${thermal.Ni.toFixed(1)} kWh/m².ano.`,
    });
  }

  // Nvc vs Nv (cooling needs)
  if (thermal.Nvc > thermal.Nv) {
    findings.push({
      id: nextId(),
      area: "thermal" as RegulationArea,
      regulation: "REH (DL 118/2013)",
      article: "Art. 26.º",
      severity: "warning",
      description: `Necessidades de arrefecimento (Nvc = ${thermal.Nvc.toFixed(1)} kWh/m².ano) excedem a referência (Nv = ${thermal.Nv.toFixed(1)} kWh/m².ano).`,
      currentValue: `Nvc = ${thermal.Nvc.toFixed(1)} kWh/m².ano`,
      requiredValue: `Nv ≤ ${thermal.Nv.toFixed(1)} kWh/m².ano`,
      remediation: "Reduzir ganhos solares com proteções exteriores, melhorar ventilação natural, ou considerar vidros de baixo fator solar.",
    });
  } else {
    findings.push({
      id: nextId(),
      area: "thermal" as RegulationArea,
      regulation: "REH (DL 118/2013)",
      article: "Art. 26.º",
      severity: "pass",
      description: `Necessidades de arrefecimento conformes: Nvc = ${thermal.Nvc.toFixed(1)} ≤ Nv = ${thermal.Nv.toFixed(1)} kWh/m².ano.`,
    });
  }

  // ── Energy class (SCE — DL 101-D/2020) ───────────────────

  // Minimum class for new buildings
  if (isNew && isResidential) {
    const minClass = "B-";
    const classOrder = ["A+", "A", "B", "B-", "C", "D", "E", "F"];
    const currentIdx = classOrder.indexOf(energyClass.energyClass);
    const minIdx = classOrder.indexOf(minClass);

    if (currentIdx > minIdx) {
      findings.push({
        id: nextId(),
        area: "energy" as RegulationArea,
        regulation: "SCE (DL 101-D/2020)",
        article: "Art. 30.º",
        severity: "critical",
        description: `Classe energética ${energyClass.energyClass} não cumpre o mínimo exigido (${minClass}) para edifícios novos residenciais. Ntc/Nt = ${energyClass.ratio.toFixed(2)}.`,
        currentValue: `Classe ${energyClass.energyClass} (Ntc/Nt = ${energyClass.ratio.toFixed(2)})`,
        requiredValue: `Classe ≥ ${minClass} (Ntc/Nt ≤ 1.00)`,
        remediation: "Melhorar envolvente térmica, instalar sistemas mais eficientes (bomba de calor), ou adicionar energias renováveis (solar térmico/fotovoltaico).",
      });
    } else {
      findings.push({
        id: nextId(),
        area: "energy" as RegulationArea,
        regulation: "SCE (DL 101-D/2020)",
        article: "Art. 30.º",
        severity: "pass",
        description: `Classe energética ${energyClass.energyClass} cumpre o mínimo exigido (${minClass}) para edifícios novos. Ntc/Nt = ${energyClass.ratio.toFixed(2)}.`,
      });
    }
  }

  // Primary energy (Ntc vs Nt)
  if (energyClass.ratio > 1.0) {
    findings.push({
      id: nextId(),
      area: "energy" as RegulationArea,
      regulation: "SCE (DL 101-D/2020)",
      article: "Art. 28.º",
      severity: isNew ? "critical" : "warning",
      description: `Energia primária total (Ntc = ${energyClass.Ntc.toFixed(1)} kWh/m².ano) excede a referência (Nt = ${energyClass.Nt.toFixed(1)} kWh/m².ano). Rácio Ntc/Nt = ${energyClass.ratio.toFixed(2)}.`,
      currentValue: `Ntc = ${energyClass.Ntc.toFixed(1)} kWh/m².ano`,
      requiredValue: `Nt ≤ ${energyClass.Nt.toFixed(1)} kWh/m².ano`,
      remediation: "Reduzir consumo com equipamentos mais eficientes, melhorar envolvente, ou instalar renováveis para compensar.",
    });
  }

  // ── Solar thermal obligation (DL 118/2013, Art. 27.º) ────

  if (isNew && isResidential && !project.systems.hasSolarThermal && !project.systems.hasSolarPV) {
    findings.push({
      id: nextId(),
      area: "energy" as RegulationArea,
      regulation: "REH (DL 118/2013)",
      article: "Art. 27.º, n.º 4",
      severity: "critical",
      description: "Edifício novo residencial sem sistema solar térmico ou fotovoltaico. A instalação de coletores solares térmicos é obrigatória (mínimo 1 m²/ocupante) salvo exceções técnicas devidamente justificadas.",
      requiredValue: "Coletores solares ≥ 1.0 m²/ocupante",
      remediation: "Instalar coletores solares térmicos orientados a Sul (±45°), com inclinação adequada à latitude. Alternativa: sistema fotovoltaico ou bomba de calor dedicada a AQS.",
    });
  }

  // ── NZEB compliance (edifícios novos após 2021) ──────────

  if (isNew && project.yearBuilt && project.yearBuilt >= 2021) {
    const hasRenewable = project.systems.hasSolarPV || project.systems.hasSolarThermal;
    if (!hasRenewable) {
      findings.push({
        id: nextId(),
        area: "energy" as RegulationArea,
        regulation: "SCE (DL 101-D/2020)",
        article: "Art. 16.º",
        severity: "warning",
        description: "Edifício novo (pós-2021) deve ser NZEB (necessidades quase nulas de energia). Recomenda-se instalação de fontes de energia renovável para cumprir o requisito.",
        remediation: "Instalar painéis fotovoltaicos e/ou coletores solares térmicos. Considerar bomba de calor para aquecimento e AQS.",
      });
    }
  }

  // ── Build injected fields ────────────────────────────────

  const injectedFields: Record<string, unknown> = {
    // Energy namespace (for energy plugin rules)
    "energy.ntcNtRatio": energyClass.ratio,
    "energy.energyClass": energyClass.energyClass,
    "energy.primaryEnergyRatio": energyClass.ratio,
    "energy.Ntc": energyClass.Ntc,
    "energy.Nt": energyClass.Nt,
    "energy.ieeActual": energyClass.Ntc, // IEE ≈ Ntc for residential
    "energy.ieeReference": energyClass.Nt,

    // Thermal namespace (for thermal plugin rules)
    "energy.Nic": thermal.Nic,
    "energy.Ni": thermal.Ni,
    "energy.Nvc": thermal.Nvc,
    "energy.Nv": thermal.Nv,
    "energy.Nac": thermal.Nac,
    "energy.totalHeatLoss": thermal.totalHeatLoss,
    "energy.solarGains": thermal.solarGains,
    "energy.thermallyCompliant": thermal.compliant,

    // Computed derived values
    "energy.energyClassRatio": energyClass.ratio,
    "energy.isGES": false, // Grande Edifício de Serviços (only for services > 1000m²)
    "energy.hasCertificate": true, // Analysis implies pre-certificate
  };

  return {
    engineType: "SCE_ENERGY",
    thermal,
    energyClass,
    findings,
    injectedFields,
  };
}

/**
 * Inject computed energy/thermal values into the project context.
 * This makes them available to declarative rules that reference
 * fields like `energy.ntcNtRatio`, `energy.energyClass`, etc.
 */
export function enrichProjectWithEnergyCalculations(
  project: BuildingProject,
  result: EnergyAnalysisResult,
): void {
  // Inject into energy sub-object
  const energy = (project as Record<string, unknown>).energy as Record<string, unknown> ?? {};
  for (const [key, value] of Object.entries(result.injectedFields)) {
    if (key.startsWith("energy.")) {
      const field = key.slice("energy.".length);
      if (energy[field] === undefined) {
        energy[field] = value;
      }
    }
  }
  (project as Record<string, unknown>).energy = energy;
}

/**
 * Version diffing for BuildingProject revisions.
 * Compares two project versions and generates a structured diff
 * showing what changed, what improved, and what regressed.
 */

import type { BuildingProject, AnalysisResult, Finding, RegulationArea } from "./types";

export interface VersionDiff {
  timestamp: string;
  previousVersion: string;
  currentVersion: string;
  fieldChanges: FieldChange[];
  complianceChanges: ComplianceChange[];
  scoreChange: number;
  newFindings: Finding[];
  resolvedFindings: Finding[];
  summary: string;
}

export interface FieldChange {
  path: string;
  label: string;
  area: RegulationArea | "general";
  previousValue: unknown;
  currentValue: unknown;
  type: "added" | "removed" | "changed";
}

export interface ComplianceChange {
  area: RegulationArea;
  areaName: string;
  previousStatus: "compliant" | "non_compliant" | "partially_compliant";
  currentStatus: "compliant" | "non_compliant" | "partially_compliant";
  direction: "improved" | "regressed" | "unchanged";
}

export interface ProjectVersion {
  id: string;
  name: string;
  timestamp: string;
  project: BuildingProject;
  analysis?: AnalysisResult;
}

const FIELD_LABELS: Record<string, string> = {
  "name": "Nome do projeto",
  "buildingType": "Tipo de edifício",
  "grossFloorArea": "Área bruta (m²)",
  "usableFloorArea": "Área útil (m²)",
  "numberOfFloors": "Número de pisos",
  "buildingHeight": "Altura (m)",
  "numberOfDwellings": "Número de fogos",
  "isRehabilitation": "Reabilitação",
  "location.municipality": "Município",
  "location.district": "Distrito",
  "location.altitude": "Altitude",
  "architecture.ceilingHeight": "Pé-direito (m)",
  "architecture.hasCivilCodeCompliance": "Conformidade Código Civil",
  "architecture.hasBuildingPermitDesign": "Projeto aprovado",
  "envelope.externalWallUValue": "U paredes exteriores",
  "envelope.roofUValue": "U cobertura",
  "envelope.windowUValue": "U envidraçados",
  "envelope.windowSolarFactor": "Fator solar",
  "systems.heatingSystem": "Sistema aquecimento",
  "systems.coolingSystem": "Sistema arrefecimento",
  "systems.dhwSystem": "Sistema AQS",
  "systems.hasSolarPV": "Solar fotovoltaico",
  "systems.hasSolarThermal": "Solar térmico",
  "fireSafety.riskCategory": "Categoria de risco",
  "fireSafety.hasFireDetection": "Deteção incêndio",
  "fireSafety.hasSprinklers": "Sprinklers",
  "electrical.contractedPower": "Potência contratada (kVA)",
  "electrical.supplyType": "Tipo de alimentação",
  "acoustic.hasAcousticProject": "Projeto acústico",
};

const AREA_LABELS: Record<RegulationArea, string> = {
  architecture: "Arquitetura",
  structural: "Estruturas",
  fire_safety: "Segurança Contra Incêndio",
  hvac: "AVAC",
  water_drainage: "Águas e Drenagem",
  gas: "Gás",
  electrical: "Instalações Elétricas",
  telecommunications: "ITED/ITUR",
  thermal: "Desempenho Térmico",
  acoustic: "Acústica",
  accessibility: "Acessibilidades",
  energy: "Energia",
  elevators: "Ascensores",
  licensing: "Licenciamento",
  waste: "Resíduos",
  municipal: "Municipal",
  drawings: "Desenhos",
  general: "Geral",
};

function getPathLabel(path: string): string {
  return FIELD_LABELS[path] || path.split(".").pop() || path;
}

function getPathArea(path: string): RegulationArea | "general" {
  const section = path.split(".")[0];
  const mapping: Record<string, RegulationArea> = {
    architecture: "architecture",
    structural: "structural",
    fireSafety: "fire_safety",
    avac: "hvac",
    waterDrainage: "water_drainage",
    gas: "gas",
    electrical: "electrical",
    telecommunications: "telecommunications",
    envelope: "thermal",
    systems: "energy",
    acoustic: "acoustic",
    accessibility: "accessibility",
    elevators: "elevators",
    licensing: "licensing",
    waste: "waste",
    localRegulations: "municipal",
    drawingQuality: "drawings",
    location: "general",
  };
  return mapping[section] || "general";
}

/**
 * Deep comparison of two objects, returns changed paths.
 */
function deepDiff(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>,
  prefix = "",
): FieldChange[] {
  const changes: FieldChange[] = [];

  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const pv = prev[key];
    const cv = curr[key];

    // Skip arrays and complex objects for now - focus on scalar values
    if (Array.isArray(pv) || Array.isArray(cv)) continue;

    if (pv === undefined && cv !== undefined) {
      changes.push({ path, label: getPathLabel(path), area: getPathArea(path), previousValue: undefined, currentValue: cv, type: "added" });
    } else if (pv !== undefined && cv === undefined) {
      changes.push({ path, label: getPathLabel(path), area: getPathArea(path), previousValue: pv, currentValue: undefined, type: "removed" });
    } else if (typeof pv === "object" && typeof cv === "object" && pv !== null && cv !== null) {
      changes.push(...deepDiff(pv as Record<string, unknown>, cv as Record<string, unknown>, path));
    } else if (pv !== cv) {
      changes.push({ path, label: getPathLabel(path), area: getPathArea(path), previousValue: pv, currentValue: cv, type: "changed" });
    }
  }

  return changes;
}

/**
 * Compare two project versions and generate a diff report.
 */
export function compareVersions(
  previous: ProjectVersion,
  current: ProjectVersion,
): VersionDiff {
  const fieldChanges = deepDiff(
    previous.project as unknown as Record<string, unknown>,
    current.project as unknown as Record<string, unknown>,
  );

  // Compare analysis results
  const complianceChanges: ComplianceChange[] = [];
  const newFindings: Finding[] = [];
  const resolvedFindings: Finding[] = [];
  let scoreChange = 0;

  if (previous.analysis && current.analysis) {
    scoreChange = current.analysis.overallScore - previous.analysis.overallScore;

    // Compare regulation summaries
    for (const currSummary of current.analysis.regulationSummary) {
      const prevSummary = previous.analysis.regulationSummary.find(s => s.area === currSummary.area);
      if (prevSummary) {
        const direction = currSummary.score > prevSummary.score ? "improved"
          : currSummary.score < prevSummary.score ? "regressed" : "unchanged";
        if (direction !== "unchanged") {
          complianceChanges.push({
            area: currSummary.area,
            areaName: AREA_LABELS[currSummary.area] || currSummary.area,
            previousStatus: prevSummary.status,
            currentStatus: currSummary.status,
            direction,
          });
        }
      }
    }

    // Find new and resolved findings
    const prevIds = new Set(previous.analysis.findings.map(f => `${f.area}:${f.regulation}:${f.article}`));
    const currIds = new Set(current.analysis.findings.map(f => `${f.area}:${f.regulation}:${f.article}`));

    for (const f of current.analysis.findings) {
      const key = `${f.area}:${f.regulation}:${f.article}`;
      if (!prevIds.has(key) && (f.severity === "critical" || f.severity === "warning")) {
        newFindings.push(f);
      }
    }

    for (const f of previous.analysis.findings) {
      const key = `${f.area}:${f.regulation}:${f.article}`;
      if (!currIds.has(key) && (f.severity === "critical" || f.severity === "warning")) {
        resolvedFindings.push(f);
      }
    }
  }

  // Generate summary
  const parts: string[] = [];
  if (fieldChanges.length > 0) {
    parts.push(`${fieldChanges.length} campo(s) alterado(s)`);
  }
  if (scoreChange !== 0) {
    parts.push(`Pontuação: ${scoreChange > 0 ? "+" : ""}${scoreChange}`);
  }
  if (newFindings.length > 0) {
    parts.push(`${newFindings.length} nova(s) não-conformidade(s)`);
  }
  if (resolvedFindings.length > 0) {
    parts.push(`${resolvedFindings.length} não-conformidade(s) resolvida(s)`);
  }

  return {
    timestamp: new Date().toISOString(),
    previousVersion: previous.id,
    currentVersion: current.id,
    fieldChanges,
    complianceChanges,
    scoreChange,
    newFindings,
    resolvedFindings,
    summary: parts.join(". ") || "Sem alterações significativas.",
  };
}

/**
 * Converts analysis findings into WBS remediation articles.
 * Bridges the analysis tool and the WBS/schedule tool by generating
 * actionable work breakdown items from regulatory non-conformities.
 */

import type { Finding, RegulationArea } from "./types";
import type { WbsArticle } from "./wbs-types";

/**
 * Area-specific remediation work templates with estimated durations.
 */
const AREA_REMEDIATION_CONFIG: Record<RegulationArea, {
  chapterCode: string;
  chapterName: string;
  specialty: string;
  baseDays: number;
}> = {
  architecture: { chapterCode: "01", chapterName: "Arquitetura", specialty: "Arquitetura", baseDays: 5 },
  structural: { chapterCode: "02", chapterName: "Estruturas", specialty: "Estruturas", baseDays: 15 },
  fire_safety: { chapterCode: "03", chapterName: "Segurança Incêndio", specialty: "SCIE", baseDays: 10 },
  hvac: { chapterCode: "04", chapterName: "AVAC", specialty: "AVAC", baseDays: 8 },
  water_drainage: { chapterCode: "05", chapterName: "Águas e Drenagem", specialty: "Hidráulica", baseDays: 7 },
  gas: { chapterCode: "06", chapterName: "Instalações de Gás", specialty: "Gás", baseDays: 5 },
  electrical: { chapterCode: "07", chapterName: "Instalações Elétricas", specialty: "Eletricidade", baseDays: 8 },
  telecommunications: { chapterCode: "08", chapterName: "Telecomunicações", specialty: "ITED", baseDays: 5 },
  thermal: { chapterCode: "09", chapterName: "Desempenho Térmico", specialty: "Térmica", baseDays: 10 },
  acoustic: { chapterCode: "10", chapterName: "Acústica", specialty: "Acústica", baseDays: 7 },
  accessibility: { chapterCode: "11", chapterName: "Acessibilidades", specialty: "Acessibilidade", baseDays: 5 },
  energy: { chapterCode: "12", chapterName: "Energia / Renováveis", specialty: "Energia", baseDays: 8 },
  elevators: { chapterCode: "13", chapterName: "Ascensores", specialty: "Ascensores", baseDays: 10 },
  licensing: { chapterCode: "14", chapterName: "Licenciamento", specialty: "Licenciamento", baseDays: 3 },
  waste: { chapterCode: "15", chapterName: "Resíduos", specialty: "Ambiente", baseDays: 3 },
  municipal: { chapterCode: "16", chapterName: "Regulamentação Municipal", specialty: "Urbanismo", baseDays: 5 },
  drawings: { chapterCode: "17", chapterName: "Peças Desenhadas", specialty: "Desenho", baseDays: 3 },
  general: { chapterCode: "18", chapterName: "Geral", specialty: "Coordenação", baseDays: 2 },
};

/**
 * Generate WBS articles from analysis findings (critical + warning only).
 * Groups findings by area and generates remediation work items.
 * The returned articles are compatible with the WBS tool import format.
 */
export function findingsToWbs(findings: Finding[]): WbsArticle[] {
  const actionableFindings = findings.filter(
    f => f.severity === "critical" || f.severity === "warning"
  );

  if (actionableFindings.length === 0) return [];

  // Group by area
  const byArea = new Map<RegulationArea, Finding[]>();
  for (const f of actionableFindings) {
    const list = byArea.get(f.area) ?? [];
    list.push(f);
    byArea.set(f.area, list);
  }

  const articles: WbsArticle[] = [];

  for (const [area, areaFindings] of byArea) {
    const config = AREA_REMEDIATION_CONFIG[area];
    const criticals = areaFindings.filter(f => f.severity === "critical");
    const warnings = areaFindings.filter(f => f.severity === "warning");

    // Create a project revision summary task per area
    const revisionCode = `REM.${config.chapterCode}.01`;
    const description = criticals.length > 0
      ? `Revisão de projeto ${config.specialty}: corrigir ${criticals.length} não-conformidade(s) crítica(s) e ${warnings.length} aviso(s)`
      : `Revisão de projeto ${config.specialty}: resolver ${warnings.length} aviso(s)`;

    articles.push({
      code: revisionCode,
      description,
      unit: "vg",
      quantity: 1,
      tags: [config.specialty, area, "remediação", `${config.baseDays}d`],
    });

    // Create specific remediation tasks for each critical finding
    let taskIdx = 2;
    for (const finding of criticals) {
      const taskCode = `REM.${config.chapterCode}.${String(taskIdx++).padStart(2, "0")}`;
      articles.push({
        code: taskCode,
        description: `[${finding.regulation}] ${finding.description.slice(0, 200)}`,
        unit: "vg",
        quantity: 1,
        tags: [config.specialty, area, finding.severity, finding.regulation],
      });
    }
  }

  // Add coordination/submission task at the end
  articles.push({
    code: "REM.99.01",
    description: "Compilação e submissão das alterações aos projetos de especialidades",
    unit: "vg",
    quantity: 1,
    tags: ["Coordenação", "submissão"],
  });

  return articles;
}

/**
 * Generate a summary of the remediation WBS.
 */
export function generateRemediationSummary(findings: Finding[]): {
  totalTasks: number;
  criticalCount: number;
  warningCount: number;
  estimatedTotalDays: number;
  affectedAreas: string[];
} {
  const actionable = findings.filter(f => f.severity === "critical" || f.severity === "warning");
  const articles = findingsToWbs(findings);
  const areas = new Set(actionable.map(f => AREA_REMEDIATION_CONFIG[f.area].specialty));

  // Estimate: parallel paths by area, longest wins + coordination
  const byArea = new Map<string, number>();
  for (const f of actionable) {
    const config = AREA_REMEDIATION_CONFIG[f.area];
    const current = byArea.get(f.area) ?? 0;
    byArea.set(f.area, current + (f.severity === "critical" ? 3 : 1));
  }
  // Add base days for each area
  for (const [area] of byArea) {
    const config = AREA_REMEDIATION_CONFIG[area as RegulationArea];
    byArea.set(area, (byArea.get(area) ?? 0) + config.baseDays);
  }
  const longestPath = Math.max(0, ...byArea.values());
  const estimatedTotalDays = longestPath + 5; // +5 for coordination

  return {
    totalTasks: articles.length,
    criticalCount: actionable.filter(f => f.severity === "critical").length,
    warningCount: actionable.filter(f => f.severity === "warning").length,
    estimatedTotalDays,
    affectedAreas: [...areas].sort(),
  };
}

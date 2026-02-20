import type {
  BuildingProject,
  AnalysisResult,
  Finding,
  RegulationSummary,
  RegulationArea,
  RuleEvaluationMetrics,
} from "./types";
import { calculateEnergyClass } from "./calculations";
import { checkPdmCompliance } from "./pdm-database";
import { getRemediation } from "./remediation-guidance";
import { getAvailablePlugins, evaluatePlugin, resetPluginFindingCounter, getFieldMappings, evaluateComputedFields } from "./plugins";
import { evaluateRecommendations } from "./recommendations-engine";
import { analyzeElectricalRTIEBT, canAnalyzeElectrical } from "./electrical-analyzer";
import { analyzePlumbingRGSPPDADAR, canAnalyzePlumbing } from "./plumbing-analyzer";
import { analyzeEnergySCE, canAnalyzeEnergy, enrichProjectWithEnergyCalculations } from "./energy-analyzer";
import { analyzeFireSafetySCIE, canAnalyzeFireSafety, enrichProjectWithFireSafetyCalculations } from "./fire-safety-analyzer";
import { buildProjectContext, type ContextBuildReport } from "./context-builder";

// ── Determine which regulation areas have REAL data (IFC/form, not defaults) ──
// This prevents false PASS findings for specialties with no project data.
const NAMESPACE_TO_AREAS: Record<string, string[]> = {
  gas: ["gas"],
  fireSafety: ["fire_safety"],
  electrical: ["electrical"],
  waterDrainage: ["water_drainage"],
  water: ["water_drainage"],
  plumbing: ["water_drainage"],
  avac: ["hvac"],
  hvac: ["hvac"],
  acoustic: ["acoustic"],
  elevators: ["elevators"],
  elevator: ["elevators"],
  thermal: ["thermal"],
  envelope: ["thermal", "energy"],
  energy: ["energy"],
  ited: ["telecommunications"],
  itur: ["telecommunications"],
  telecommunications: ["telecommunications"],
  accessibility: ["accessibility"],
  licensing: ["licensing"],
  waste: ["waste"],
  drawings: ["drawings"],
  structure: ["structural"],
  structural: ["structural"],
};

function getAnalyzedAreas(report: ContextBuildReport): Set<string> {
  const realFields = [...report.fromIfc, ...report.fromForm];
  const namespaces = new Set<string>();

  for (const field of realFields) {
    if (field.startsWith("(")) continue; // Skip aggregate entries like "(15 standard fields)"
    const dotIdx = field.indexOf(".");
    if (dotIdx > 0) namespaces.add(field.substring(0, dotIdx));
  }

  // Architecture, general, and municipal use generic building data — always analyzable
  const areas = new Set<string>(["architecture", "general", "municipal"]);

  for (const ns of namespaces) {
    const mapped = NAMESPACE_TO_AREAS[ns];
    if (mapped) for (const area of mapped) areas.add(area);
  }

  return areas;
}

// ── Missing-field helpers for actionable SKIPPED findings ──────────
function getMissingFieldsSCE(project: BuildingProject): string[] {
  const missing: string[] = [];
  if (!project.envelope) {
    missing.push("envelope (envolvente térmica)");
  } else {
    if (!(project.envelope.externalWallUValue > 0)) missing.push("envelope.externalWallUValue");
    if (!(project.envelope.externalWallArea > 0)) missing.push("envelope.externalWallArea");
    if (project.envelope.windowArea === undefined) missing.push("envelope.windowArea");
  }
  if (!project.location) {
    missing.push("location (localização)");
  } else {
    if (!project.location.climateZoneWinter) missing.push("location.climateZoneWinter");
    if (!project.location.climateZoneSummer) missing.push("location.climateZoneSummer");
  }
  return missing;
}

function getMissingFieldsRTIEBT(project: BuildingProject): string[] {
  const elec = project.electrical as Record<string, unknown> | undefined;
  if (!elec || typeof elec !== "object") return ["electrical (instalação elétrica)"];
  const missing: string[] = [];
  if (elec.totalPower === undefined && elec.numberOfCircuits === undefined &&
      elec.groundingSystem === undefined && elec.voltage === undefined) {
    missing.push("electrical.totalPower", "electrical.numberOfCircuits", "electrical.voltage");
  }
  return missing;
}

function getMissingFieldsPlumbing(project: BuildingProject): string[] {
  const proj = project as Record<string, unknown>;
  const missing: string[] = [];
  if (proj.pressaoRedePublica === undefined && proj.numeroPisos === undefined &&
      proj.tipologia === undefined && proj.areaCoberturaM2 === undefined) {
    missing.push("pressaoRedePublica", "numeroPisos", "tipologia", "areaCoberturaM2");
  }
  return missing;
}

function getMissingFieldsSCIE(project: BuildingProject): string[] {
  const missing: string[] = [];
  const fs = project.fireSafety as Record<string, unknown> | undefined;
  if (!fs || typeof fs !== "object") {
    missing.push("fireSafety (segurança contra incêndio)");
  } else if (!fs.utilizationType) {
    missing.push("fireSafety.utilizationType");
  }
  if (!project.buildingType && !(fs && fs.utilizationType)) {
    missing.push("buildingType");
  }
  const hasArea = (project.grossFloorArea ?? 0) > 0 || (project.usableFloorArea ?? 0) > 0;
  const hasHeight = (project.buildingHeight ?? 0) > 0 || (project.numberOfFloors ?? 0) > 0;
  if (!hasArea) missing.push("grossFloorArea ou usableFloorArea");
  if (!hasHeight) missing.push("buildingHeight ou numberOfFloors");
  return missing;
}

export async function analyzeProject(project: BuildingProject): Promise<AnalysisResult> {
  const findings: Finding[] = [];

  // ── Context enrichment ──────────────────────────────────
  // Resolve namespace aliases (elevator↔elevators, hvac↔avac, etc.),
  // create virtual namespaces (building.*, project.*),
  // and apply smart defaults per building type.
  // This ensures rules can find the fields they reference.
  const fieldMappings = getFieldMappings();
  // Pass IFC specialty analyses if attached to the project (from wizard IFC upload)
  const ifcSpecialtyAnalyses = (project as Record<string, unknown>)._ifcAnalyses as
    import("./ifc-specialty-analyzer").SpecialtyAnalysisResult[] | undefined;
  const { enriched, report: contextReport } = buildProjectContext(project, {
    fieldMappings,
    ifcSpecialtyAnalyses,
    applySmartDefaults: true,
  });

  // ── Global computed fields (runs BEFORE all rules) ────────
  // Pre-compute ALL computed fields from ALL plugins into shared context.
  // This enables cross-plugin dependencies (e.g., fire-safety rule referencing
  // computed.avgFloorHeight defined by the general plugin).
  {
    const plugins = getAvailablePlugins();
    const globalComputed: Record<string, unknown> = {};
    for (const plugin of plugins) {
      const pluginComputed = evaluateComputedFields(enriched, plugin.computedFields ?? []);
      Object.assign(globalComputed, pluginComputed);
    }
    enriched.computed = globalComputed;
  }

  // ── Energy deep analyzer (runs BEFORE rules) ─────────────
  // Computes Ntc/Nt, energy class, thermal compliance, and injects
  // results into the project context so energy/thermal rules can
  // reference fields like energy.ntcNtRatio, energy.energyClass, etc.
  if (canAnalyzeEnergy(enriched)) {
    try {
      const energyResult = analyzeEnergySCE(enriched);
      findings.push(...energyResult.findings);
      enrichProjectWithEnergyCalculations(enriched, energyResult);
    } catch (e) {
      findings.push({
        id: "SCE-UNAVAIL",
        area: "energy",
        regulation: "SCE (DL 101-D/2020)",
        article: "",
        description: "Analisador SCE falhou durante a execução.",
        severity: "info",
        remediation: `Erro interno: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  } else {
    const missing = getMissingFieldsSCE(enriched);
    findings.push({
      id: "SCE-SKIPPED",
      area: "energy",
      regulation: "SCE (DL 101-D/2020)",
      article: "",
      description: `Análise energética SCE não executada — ${missing.length} campo(s) em falta.`,
      severity: "info",
      remediation: `Preencha: ${missing.join(", ")}`,
    });
  }

  // All 18 specialties evaluated via declarative plugin engine
  const { findings: pluginFindings, metrics: ruleEvaluation } = evaluatePluginRulesWithMetrics(enriched);
  findings.push(...pluginFindings);

  // Deep analyzers use the enriched project for consistent field resolution
  if (canAnalyzeElectrical(enriched)) {
    try {
      const electricalResult = await analyzeElectricalRTIEBT(enriched);
      findings.push(...electricalResult.findings);
    } catch (e) {
      findings.push({
        id: "RTIEBT-UNAVAIL",
        area: "electrical",
        regulation: "RTIEBT",
        article: "",
        description: "Analisador RTIEBT falhou durante a execução.",
        severity: "info",
        remediation: `Erro interno: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  } else {
    const missing = getMissingFieldsRTIEBT(enriched);
    findings.push({
      id: "RTIEBT-SKIPPED",
      area: "electrical",
      regulation: "RTIEBT",
      article: "",
      description: `Análise elétrica RTIEBT não executada — ${missing.length} campo(s) em falta.`,
      severity: "info",
      remediation: `Preencha: ${missing.join(", ")}`,
    });
  }

  if (canAnalyzePlumbing(enriched)) {
    try {
      const plumbingResult = await analyzePlumbingRGSPPDADAR(enriched);
      findings.push(...plumbingResult.findings);
    } catch (e) {
      findings.push({
        id: "RGSPPDADAR-UNAVAIL",
        area: "water_drainage",
        regulation: "RGSPPDADAR",
        article: "",
        description: "Analisador RGSPPDADAR falhou durante a execução.",
        severity: "info",
        remediation: `Erro interno: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  } else {
    const missing = getMissingFieldsPlumbing(enriched);
    findings.push({
      id: "RGSPPDADAR-SKIPPED",
      area: "water_drainage",
      regulation: "RGSPPDADAR",
      article: "",
      description: `Análise de canalização RGSPPDADAR não executada — ${missing.length} campo(s) em falta.`,
      severity: "info",
      remediation: `Preencha: ${missing.join(", ")}`,
    });
  }

  // Fire Safety deep analyzer (RT-SCIE calculation-based checks)
  if (canAnalyzeFireSafety(enriched)) {
    try {
      const fireResult = analyzeFireSafetySCIE(enriched);
      findings.push(...fireResult.findings);
      enrichProjectWithFireSafetyCalculations(enriched, fireResult);
    } catch (e) {
      findings.push({
        id: "SCIE-UNAVAIL",
        area: "fire_safety",
        regulation: "RT-SCIE (DL 220/2008)",
        article: "",
        description: "Analisador SCIE falhou durante a execução.",
        severity: "info",
        remediation: `Erro interno: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  } else {
    const missing = getMissingFieldsSCIE(enriched);
    findings.push({
      id: "SCIE-SKIPPED",
      area: "fire_safety",
      regulation: "RT-SCIE (DL 220/2008)",
      article: "",
      description: `Análise SCIE não executada — ${missing.length} campo(s) em falta.`,
      severity: "info",
      remediation: `Preencha: ${missing.join(", ")}`,
    });
  }

  // PDM / Municipal Zoning (municipality-specific database checks)
  findings.push(...checkPdmCompliance(enriched));

  // Generate pass/not-analyzed findings for areas based on real data availability
  const analyzedAreas = getAnalyzedAreas(contextReport);
  findings.push(...generatePassFindings(findings, analyzedAreas));

  // Enrich findings with remediation guidance
  for (const f of findings) {
    if (!f.remediation && (f.severity === "critical" || f.severity === "warning")) {
      f.remediation = getRemediation(f);
    }
  }

  // Generate recommendations via declarative engine
  const recommendations = evaluateRecommendations(enriched, findings);

  // Build regulation summaries
  const regulationSummary = buildRegulationSummary(findings);

  // Calculate overall score and energy class
  const overallScore = calculateOverallScore(findings);
  const energyClass = calculateEnergyClass(enriched).energyClass;

  return {
    projectName: enriched.name,
    overallScore,
    energyClass,
    findings,
    recommendations,
    regulationSummary,
    ruleEvaluation,
    contextCoverage: fieldMappings.length > 0 ? {
      total: contextReport.coverage.total,
      populated: contextReport.coverage.populated,
      percentage: contextReport.coverage.percentage,
      missingFields: contextReport.stillMissing,
      sources: {
        fromIfc: contextReport.fromIfc,
        fromForm: contextReport.fromForm,
        fromDefaults: contextReport.fromDefaults,
      },
      aliasesApplied: contextReport.aliasesApplied,
    } : undefined,
  };
}

function evaluatePluginRulesWithMetrics(project: BuildingProject): {
  findings: Finding[];
  metrics: RuleEvaluationMetrics[];
} {
  const findings: Finding[] = [];
  const metrics: RuleEvaluationMetrics[] = [];

  try {
    resetPluginFindingCounter();
    const plugins = getAvailablePlugins();

    for (const plugin of plugins) {
      const result = evaluatePlugin(plugin, project);
      findings.push(...result.findings);

      const totalRules = result.totalActiveRules;
      const skippedRules = result.rulesSkipped.length;
      const evaluatedRules = totalRules - skippedRules;
      const firedRules = result.findings.length;

      metrics.push({
        pluginId: plugin.id,
        pluginName: plugin.name,
        area: plugin.areas[0] as RegulationArea,
        totalRules,
        evaluatedRules,
        skippedRules,
        firedRules,
        coveragePercent: totalRules > 0 ? Math.round((evaluatedRules / totalRules) * 100) : 100,
        skippedRuleIds: result.rulesSkipped,
      });
    }
  } catch {
    // Plugin system is optional — if it fails, continue with built-in analysis
  }

  return { findings, metrics };
}

/**
 * Generate pass/not-analyzed findings for regulation areas.
 * - Areas with violations → skip (already have findings)
 * - Areas with SKIPPED/UNAVAIL info → skip (already flagged by deep analyzers)
 * - Areas with real data and no violations → PASS
 * - Areas without real data → NOT ANALYZED (info severity)
 */
function generatePassFindings(findings: Finding[], analyzedAreas: Set<string>): Finding[] {
  const passFindings: Finding[] = [];
  const violationAreas = new Set(
    findings
      .filter(f => f.severity === "critical" || f.severity === "warning")
      .map(f => f.area)
  );

  // Areas that already have SKIPPED/UNAVAIL info findings from deep analyzers
  const skippedAreas = new Set(
    findings
      .filter(f => f.severity === "info" && /-(SKIPPED|UNAVAIL)$/.test(f.id))
      .map(f => f.area)
  );

  const areaLabels: Record<string, string> = {
    architecture: "Arquitetura (RGEU + Código Civil)",
    structural: "Estruturas (Eurocódigos)",
    fire_safety: "Segurança Contra Incêndio (SCIE)",
    hvac: "AVAC (Ventilação e Ar Condicionado)",
    water_drainage: "Águas e Drenagem (RGSPPDADAR)",
    gas: "Instalações de Gás",
    electrical: "Instalações Elétricas (RTIEBT)",
    telecommunications: "Telecomunicações (ITED/ITUR)",
    thermal: "Desempenho Térmico (REH/RECS)",
    acoustic: "Acústica (RRAE)",
    accessibility: "Acessibilidade (DL 163/2006)",
    energy: "Eficiência Energética (SCE)",
    elevators: "Ascensores (DL 320/2002)",
    licensing: "Licenciamento (RJUE)",
    waste: "Resíduos de Construção (DL 46/2008)",
    drawings: "Peças Desenhadas (Portaria 701-H)",
    general: "Regulamento Geral (RGEU)",
    municipal: "Regulamentos Municipais",
  };

  const plugins = getAvailablePlugins();
  for (const plugin of plugins) {
    for (const area of plugin.areas) {
      // Already has violations or was already flagged as skipped
      if (violationAreas.has(area) || skippedAreas.has(area)) continue;

      if (analyzedAreas.has(area)) {
        // Real data present, rules evaluated → PASS
        passFindings.push({
          id: `PASS-${area}`,
          area: area as RegulationArea,
          regulation: plugin.name,
          article: "",
          description: `${areaLabels[area] ?? area} — sem não conformidades detetadas.`,
          severity: "pass",
        });
      } else {
        // No real data for this specialty → NOT ANALYZED
        passFindings.push({
          id: `NA-${area}`,
          area: area as RegulationArea,
          regulation: plugin.name,
          article: "",
          description: `${areaLabels[area] ?? area} — não analisado (sem dados de projeto).`,
          severity: "info",
        });
      }
    }
  }

  return passFindings;
}

// ============================================================
// SCORING & ENERGY CLASS
// ============================================================

function buildRegulationSummary(findings: Finding[]): RegulationSummary[] {
  const areas: { area: RegulationArea; name: string }[] = [
    { area: "architecture", name: "1. Arquitetura (RGEU + Código Civil)" },
    { area: "structural", name: "2. Estruturas / Sísmica (Eurocódigos)" },
    { area: "fire_safety", name: "3. Segurança Contra Incêndio (SCIE + NTs)" },
    { area: "hvac", name: "4. AVAC (Ventilação e Ar Condicionado)" },
    { area: "water_drainage", name: "5. Águas e Drenagem (RGSPPDADAR)" },
    { area: "gas", name: "6. Instalações de Gás (DL 521/99)" },
    { area: "electrical", name: "7. Instalações Elétricas (RTIEBT + ISQ/EREDES)" },
    { area: "telecommunications", name: "8. Telecomunicações (ITED/ITUR + ANACOM)" },
    { area: "thermal", name: "9. Desempenho Térmico (REH/RECS)" },
    { area: "acoustic", name: "10. Acústica (RRAE)" },
    { area: "accessibility", name: "11. Acessibilidade (DL 163/2006)" },
    { area: "energy", name: "12. Eficiência Energética (SCE)" },
    { area: "elevators", name: "13. Ascensores (DL 320/2002)" },
    { area: "licensing", name: "14. Licenciamento (RJUE)" },
    { area: "waste", name: "15. Resíduos de Construção (DL 46/2008)" },
    { area: "municipal", name: "16. Regulamentos Municipais" },
    { area: "drawings", name: "17. Qualidade das Peças Desenhadas" },
    { area: "general", name: "18. Regulamento Geral (RGEU)" },
  ];

  return areas.map(({ area, name }) => {
    const areaFindings = findings.filter(f => f.area === area);
    const criticalCount = areaFindings.filter(f => f.severity === "critical").length;
    const warningCount = areaFindings.filter(f => f.severity === "warning").length;
    const passCount = areaFindings.filter(f => f.severity === "pass").length;
    const total = areaFindings.length;

    let status: "compliant" | "non_compliant" | "partially_compliant" = "compliant";
    if (criticalCount > 0) status = "non_compliant";
    else if (warningCount > 0) status = "partially_compliant";

    const score = total > 0 ? Math.round((passCount / total) * 100) : 100;

    return {
      area,
      name,
      status,
      findingsCount: criticalCount + warningCount,
      score,
    };
  });
}

function calculateOverallScore(findings: Finding[]): number {
  const total = findings.length;
  if (total === 0) return 100;

  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 100 / total * 1.5;
    else if (f.severity === "warning") score -= 100 / total * 0.75;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

// estimateEnergyClass removed — now uses calculateEnergyClass() from calculations.ts
// which implements the proper Ntc/Nt ratio method per DL 101-D/2020

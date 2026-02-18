"use client";

import type { AnalysisResult, Finding, Recommendation, RegulationSummary, Severity, RuleEvaluationMetrics } from "@/lib/types";
import type { AllCalculations } from "@/lib/calculations";
import type { BuildingProject } from "@/lib/types";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Zap,
  Shield,
  Accessibility,
  Flame,
  Building,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Plug,
  Wifi,
  Volume2,
  Fuel,
  Droplets,
  Columns3,
  ArrowUpDown,
  FileText,
  Recycle,
  Ruler,
  Wind,
  MapPin,
  PenTool,
  Download,
  Printer,
  Calculator,
  ClipboardList,
  Euro,
  MessageSquare,
  CalendarClock,
  GitCompareArrows,
  Wrench,
  Filter,
  BarChart3,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import type { RegulationArea } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { estimateCosts, formatCost, type CostSummary, type CostLineItem } from "@/lib/cost-estimation";
import { generateChecklists, type Checklist } from "@/lib/checklist-generator";
import { generateRemediationSummary, findingsToWbs } from "@/lib/findings-to-wbs";
import { generateCoverageReport, type CoverageReport, type AreaCoverage } from "@/lib/plugins/coverage";

const AiAssistant = lazy(() => import("@/components/AiAssistant"));
const ConsultationTimelineView = lazy(() => import("@/components/ConsultationTimelineView"));
const VersionDiffView = lazy(() => import("@/components/VersionDiffView"));

interface AnalysisResultsProps {
  result: AnalysisResult;
  calculations?: AllCalculations | null;
  project?: BuildingProject;
  onReset: () => void;
  /** Navigate back to form, optionally targeting a specific section */
  onEditProject?: (targetSection?: string) => void;
}

/** Map field namespace prefixes to ProjectForm section IDs */
const FIELD_TO_SECTION: Record<string, string> = {
  fireSafety: "fire",
  acoustic: "acoustic",
  accessibility: "accessibility",
  electrical: "electrical",
  gas: "gas",
  structural: "structural",
  architecture: "architecture",
  general: "general",
  envelope: "envelope",
  systems: "systems",
  avac: "avac",
  hvac: "avac",
  water: "water",
  waterDrainage: "water",
  drainage: "water",
  telecommunications: "telecom",
  ited: "telecom",
  itur: "telecom",
  elevator: "elevators",
  elevators: "elevators",
  energy: "envelope",
  thermal: "envelope",
  licensing: "licensing",
  waste: "waste",
  drawings: "drawings",
  municipal: "local",
  localRegulations: "local",
  location: "context",
  building: "context",
};

/** Find the most common form section from a list of missing field paths */
function findDominantSection(missingFields: string[]): string | undefined {
  const counts: Record<string, number> = {};
  for (const field of missingFields) {
    const ns = field.split(".")[0];
    const section = FIELD_TO_SECTION[ns];
    if (section) {
      counts[section] = (counts[section] || 0) + 1;
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [section, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = section;
      bestCount = count;
    }
  }
  return best;
}

export default function AnalysisResults({ result, calculations, project, onReset, onEditProject }: AnalysisResultsProps) {
  const { t, lang } = useI18n();
  const [expandedSection, setExpandedSection] = useState<string | null>("summary");
  const [isExporting, setIsExporting] = useState(false);
  const [areaFilter, setAreaFilter] = useState<RegulationArea | "all">("all");

  // Feature toggles for cost estimation and project planning
  const [showCostEstimation, setShowCostEstimation] = useState(false);
  const [showProjectPlan, setShowProjectPlan] = useState(false);

  // Export options popovers
  const [exportMenu, setExportMenu] = useState<"pdf" | "excel" | null>(null);
  const [pdfOpts, setPdfOpts] = useState({ findings: true, recommendations: true, passFindings: true, metrics: true, coverage: true });
  const [excelOpts, setExcelOpts] = useState({ nonConformities: true, conformities: true, recommendations: true, rulesCoverage: true, auditTrail: true });

  const criticalCount = result.findings.filter(f => f.severity === "critical").length;
  const warningCount = result.findings.filter(f => f.severity === "warning").length;
  const passCount = result.findings.filter(f => f.severity === "pass").length;

  // Group findings by area for the heatmap and filtering
  const findingsByArea = useMemo(() => {
    const map = new Map<RegulationArea, { critical: number; warning: number; info: number; pass: number }>();
    for (const f of result.findings) {
      const entry = map.get(f.area) ?? { critical: 0, warning: 0, info: 0, pass: 0 };
      entry[f.severity]++;
      map.set(f.area, entry);
    }
    return map;
  }, [result.findings]);

  // Areas that have findings, sorted by severity (most critical first)
  const areasWithFindings = useMemo(() => {
    const entries = Array.from(findingsByArea.entries());
    return entries.sort((a, b) => {
      const scoreA = a[1].critical * 1000 + a[1].warning * 100;
      const scoreB = b[1].critical * 1000 + b[1].warning * 100;
      return scoreB - scoreA;
    });
  }, [findingsByArea]);

  // Filtered findings
  const filteredFindings = useMemo(() => {
    if (areaFilter === "all") return result.findings;
    return result.findings.filter(f => f.area === areaFilter);
  }, [result.findings, areaFilter]);

  // Drill-down: click a regulation card to jump to its findings
  const drillDownToArea = useCallback((area: RegulationArea) => {
    setAreaFilter(area);
    setExpandedSection("findings");
  }, []);

  // Cost estimation from findings + project data
  const costSummary = useMemo(() => estimateCosts(result.findings, project), [result.findings, project]);
  const [showCostDetails, setShowCostDetails] = useState(false);

  // Per-finding cost lookup for inline badges
  const costLookup = useMemo(() => {
    const map = new Map<string, { minCost: number; maxCost: number }>();
    for (const est of costSummary.estimates) {
      map.set(est.findingId, { minCost: est.minCost, maxCost: est.maxCost });
    }
    return map;
  }, [costSummary]);

  // Checklists
  const checklists = useMemo(() => {
    if (!project) return [];
    return generateChecklists(project, result);
  }, [project, result]);

  // Remediation WBS summary
  const remediationSummary = useMemo(
    () => generateRemediationSummary(result.findings),
    [result.findings]
  );

  // Plugin coverage report (reads cached plugins — cheap)
  const coverageReport = useMemo(() => {
    try {
      return generateCoverageReport();
    } catch {
      return null;
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{result.projectName}</h2>
            <p className="text-gray-500 mt-1">{t.analysisReport}</p>
          </div>
          <div className="flex items-center gap-4">
            <ScoreCircle score={result.overallScore} />
            <EnergyClassBadge energyClass={result.energyClass} />
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <StatCard
            icon={<XCircle className="w-5 h-5 text-red-500" />}
            label={t.nonCompliant}
            value={criticalCount}
            color="red"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
            label={t.warnings}
            value={warningCount}
            color="amber"
          />
          <StatCard
            icon={<CheckCircle className="w-5 h-5 text-green-500" />}
            label={t.compliant}
            value={passCount}
            color="green"
          />
        </div>

        {/* Severity-by-area heatmap — shows WHERE the problems are */}
        {areasWithFindings.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Problemas por especialidade</p>
            <div className="flex flex-wrap gap-1.5">
              {areasWithFindings.map(([area, counts]) => {
                const areaLabel = AREA_SHORT_LABELS[area] ?? area;
                const hasCritical = counts.critical > 0;
                const hasWarning = counts.warning > 0;
                const bgColor = hasCritical
                  ? "bg-red-100 border-red-300 text-red-800"
                  : hasWarning
                    ? "bg-amber-100 border-amber-300 text-amber-800"
                    : "bg-green-100 border-green-300 text-green-800";

                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => drillDownToArea(area)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium transition-all hover:scale-105 hover:shadow-sm cursor-pointer ${bgColor}`}
                    title={`${counts.critical} críticas, ${counts.warning} avisos, ${counts.pass} conforme`}
                  >
                    {areaLabel}
                    {hasCritical && <span className="font-bold">{counts.critical}</span>}
                    {hasWarning && !hasCritical && <span className="font-bold">{counts.warning}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Regulation Summary */}
      <CollapsibleSection
        title={t.regulationSummary}
        id="summary"
        expanded={expandedSection}
        onToggle={setExpandedSection}
      >
        <div className="space-y-3">
          {result.regulationSummary.map(reg => (
            <RegulationCard key={reg.area} summary={reg} onDrillDown={drillDownToArea} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Plugin Coverage — Cobertura Regulamentar */}
      {coverageReport && coverageReport.areas.length > 0 && (
        <CollapsibleSection
          title={`Cobertura Regulamentar (${coverageReport.overallCoverageScore}%)`}
          id="coverage"
          expanded={expandedSection}
          onToggle={setExpandedSection}
          icon={<BarChart3 className="w-5 h-5 text-teal-600" />}
        >
          <div className="space-y-4">
            {/* Overall score badge */}
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${
                  coverageReport.overallCoverageScore >= 75
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : coverageReport.overallCoverageScore >= 50
                      ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                      : "bg-red-100 text-red-800 border border-red-300"
                }`}
              >
                {coverageReport.overallCoverageScore}%
              </span>
              <span className="text-sm text-gray-600">
                {coverageReport.totalPlugins} {coverageReport.totalPlugins === 1 ? "plugin" : "plugins"} &middot;{" "}
                {coverageReport.totalRules} {coverageReport.totalRules === 1 ? "regra" : "regras"} &middot;{" "}
                {coverageReport.totalRegulations} {coverageReport.totalRegulations === 1 ? "regulamento" : "regulamentos"}
              </span>
            </div>

            {/* Area coverage grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="pb-2 pr-4">{lang === "pt" ? "Especialidade" : "Area"}</th>
                    <th className="pb-2 pr-4 text-right">{lang === "pt" ? "Regras" : "Rules"}</th>
                    <th className="pb-2 pr-4 text-right">{lang === "pt" ? "Regulamentos" : "Regulations"}</th>
                    <th className="pb-2 text-right">{lang === "pt" ? "Cobertura" : "Coverage"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...coverageReport.areas]
                    .sort((a, b) => b.coverageScore - a.coverageScore)
                    .map((ac) => (
                      <tr key={`${ac.pluginId}-${ac.area}`} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2 pr-4 font-medium text-gray-800">
                          {AREA_SHORT_LABELS[ac.area] ?? ac.area}
                        </td>
                        <td className="py-2 pr-4 text-right text-gray-600 tabular-nums">
                          {ac.ruleCount}
                        </td>
                        <td className="py-2 pr-4 text-right text-gray-600 tabular-nums">
                          {ac.regulationCount}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={`inline-block min-w-[3rem] text-center px-2 py-0.5 rounded text-xs font-bold ${
                              ac.coverageScore >= 75
                                ? "bg-green-100 text-green-700"
                                : ac.coverageScore >= 50
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {ac.coverageScore}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Pending regulations warning */}
            {coverageReport.pendingRegulations.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">
                    {coverageReport.pendingRegulations.length}{" "}
                    {coverageReport.pendingRegulations.length === 1
                      ? "regulamento pendente"
                      : "regulamentos pendentes"}{" "}
                    (sem regras extraidas)
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    {coverageReport.pendingRegulations
                      .slice(0, 5)
                      .map((pr) => pr.shortRef)
                      .join(", ")}
                    {coverageReport.pendingRegulations.length > 5 && (
                      <> e mais {coverageReport.pendingRegulations.length - 5}</>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Rule Evaluation per Specialty — Avaliação de Regras por Especialidade */}
      {result.ruleEvaluation && result.ruleEvaluation.length > 0 && (
        <CollapsibleSection
          title={(() => {
            const totalEval = result.ruleEvaluation.reduce((s, m) => s + m.evaluatedRules, 0);
            const totalAll = result.ruleEvaluation.reduce((s, m) => s + m.totalRules, 0);
            const pct = totalAll > 0 ? Math.round((totalEval / totalAll) * 100) : 100;
            return `Avaliação de Regras (${totalEval}/${totalAll} — ${pct}%)`;
          })()}
          id="rule-evaluation"
          expanded={expandedSection}
          onToggle={setExpandedSection}
          icon={<BarChart3 className="w-5 h-5 text-purple-600" />}
        >
          <div className="space-y-4">
            {/* Overall summary */}
            {(() => {
              const totalEval = result.ruleEvaluation.reduce((s, m) => s + m.evaluatedRules, 0);
              const totalAll = result.ruleEvaluation.reduce((s, m) => s + m.totalRules, 0);
              const totalSkipped = result.ruleEvaluation.reduce((s, m) => s + m.skippedRules, 0);
              const totalFired = result.ruleEvaluation.reduce((s, m) => s + m.firedRules, 0);
              const pct = totalAll > 0 ? Math.round((totalEval / totalAll) * 100) : 100;
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-accent-light rounded-lg p-3 text-center border border-accent">
                    <p className="text-2xl font-bold text-accent">{totalAll}</p>
                    <p className="text-xs text-accent">Total regras</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <p className="text-2xl font-bold text-green-700">{totalEval}</p>
                    <p className="text-xs text-green-600">Avaliadas ({pct}%)</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                    <p className="text-2xl font-bold text-amber-700">{totalSkipped}</p>
                    <p className="text-xs text-amber-600">Ignoradas (dados em falta)</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
                    <p className="text-2xl font-bold text-red-700">{totalFired}</p>
                    <p className="text-xs text-red-600">Disparadas (findings)</p>
                  </div>
                </div>
              );
            })()}

            {/* Per-specialty table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="pb-2 pr-4">Especialidade</th>
                    <th className="pb-2 pr-2 text-right">Total</th>
                    <th className="pb-2 pr-2 text-right">Avaliadas</th>
                    <th className="pb-2 pr-2 text-right">Ignoradas</th>
                    <th className="pb-2 pr-2 text-right">Disparadas</th>
                    <th className="pb-2 text-right">Cobertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...result.ruleEvaluation]
                    .sort((a, b) => b.totalRules - a.totalRules)
                    .map((m) => (
                      <tr key={m.pluginId} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2 pr-4 font-medium text-gray-800">
                          {AREA_SHORT_LABELS[m.area] ?? m.pluginName}
                        </td>
                        <td className="py-2 pr-2 text-right text-gray-600 tabular-nums">
                          {m.totalRules}
                        </td>
                        <td className="py-2 pr-2 text-right text-green-700 tabular-nums font-medium">
                          {m.evaluatedRules}
                        </td>
                        <td className="py-2 pr-2 text-right text-amber-600 tabular-nums">
                          {m.skippedRules > 0 ? m.skippedRules : "-"}
                        </td>
                        <td className="py-2 pr-2 text-right text-red-600 tabular-nums">
                          {m.firedRules > 0 ? m.firedRules : "-"}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  m.coveragePercent >= 75 ? "bg-green-500" :
                                  m.coveragePercent >= 40 ? "bg-amber-500" : "bg-red-500"
                                }`}
                                style={{ width: `${m.coveragePercent}%` }}
                              />
                            </div>
                            <span
                              className={`inline-block min-w-[3rem] text-center px-2 py-0.5 rounded text-xs font-bold ${
                                m.coveragePercent >= 75
                                  ? "bg-green-100 text-green-700"
                                  : m.coveragePercent >= 40
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {m.coveragePercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500 flex-1">
                Regras ignoradas dependem de campos de projeto que ainda não foram preenchidos.
                Preencha mais dados no formulário para aumentar a cobertura de avaliação.
              </p>
              {onEditProject && (
                <button
                  type="button"
                  onClick={() => onEditProject()}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-200 transition-colors text-xs font-medium"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Editar Dados
                </button>
              )}
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Context Data Coverage — Cobertura de Dados */}
      {result.contextCoverage && result.contextCoverage.total > 0 && (
        <CollapsibleSection
          title={`Cobertura de Dados (${result.contextCoverage.percentage}%)`}
          id="data-coverage"
          expanded={expandedSection}
          onToggle={setExpandedSection}
          icon={<ClipboardList className="w-5 h-5 text-indigo-600" />}
        >
          <div className="space-y-4">
            {/* Overall data coverage bar */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">
                    {result.contextCoverage.populated} de {result.contextCoverage.total} campos preenchidos
                  </span>
                  <span className={`font-bold ${
                    result.contextCoverage.percentage >= 60 ? "text-green-600" :
                    result.contextCoverage.percentage >= 30 ? "text-amber-600" : "text-red-600"
                  }`}>
                    {result.contextCoverage.percentage}%
                  </span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      result.contextCoverage.percentage >= 60 ? "bg-green-500" :
                      result.contextCoverage.percentage >= 30 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${result.contextCoverage.percentage}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Sources breakdown */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-accent-light border border-accent rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-accent">{result.contextCoverage.sources.fromForm.length}</p>
                <p className="text-xs text-accent">Formulário</p>
              </div>
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-teal-700">{result.contextCoverage.sources.fromIfc.length}</p>
                <p className="text-xs text-teal-600">IFC</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-700">{result.contextCoverage.sources.fromDefaults.length}</p>
                <p className="text-xs text-gray-600">Predefinições</p>
              </div>
            </div>

            {/* Aliases applied */}
            {result.contextCoverage.aliasesApplied.length > 0 && (
              <div className="text-xs text-gray-500">
                <span className="font-medium">Aliases aplicados:</span>{" "}
                {result.contextCoverage.aliasesApplied.join(", ")}
              </div>
            )}

            {/* Missing fields summary */}
            {result.contextCoverage.missingFields.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      {result.contextCoverage.missingFields.length} campos em falta
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Regras que dependem destes campos são ignoradas. Preencha-os no formulário para uma análise mais completa.
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {result.contextCoverage.missingFields.slice(0, 12).map(f => (
                        <span key={f} className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">
                          {f}
                        </span>
                      ))}
                      {result.contextCoverage.missingFields.length > 12 && (
                        <span className="text-xs text-amber-500">
                          +{result.contextCoverage.missingFields.length - 12} mais
                        </span>
                      )}
                    </div>
                    {onEditProject && (
                      <button
                        type="button"
                        onClick={() => {
                          const section = findDominantSection(result.contextCoverage!.missingFields);
                          onEditProject(section);
                        }}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
                      >
                        <ClipboardList className="w-4 h-4" />
                        Completar Dados no Formulário
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Findings */}
      <CollapsibleSection
        title={`${t.findings} (${result.findings.length})`}
        id="findings"
        expanded={expandedSection}
        onToggle={setExpandedSection}
      >
        {/* Area filter chips */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-400" />
          <button
            type="button"
            onClick={() => setAreaFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              areaFilter === "all"
                ? "bg-accent text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Todas ({result.findings.length})
          </button>
          {areasWithFindings.map(([area, counts]) => {
            const total = counts.critical + counts.warning + counts.info + counts.pass;
            const isActive = areaFilter === area;
            const hasCritical = counts.critical > 0;
            return (
              <button
                key={area}
                type="button"
                onClick={() => setAreaFilter(isActive ? "all" : area)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-white"
                    : hasCritical
                      ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {AREA_SHORT_LABELS[area] ?? area} ({total})
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {sortFindings(filteredFindings).map(finding => (
            <FindingCard key={finding.id} finding={finding} costEstimate={costLookup.get(finding.id)} />
          ))}
          {filteredFindings.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">Nenhuma constatação nesta especialidade.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* Recommendations */}
      <CollapsibleSection
        title={`${t.recommendations} (${result.recommendations.length})`}
        id="recommendations"
        expanded={expandedSection}
        onToggle={setExpandedSection}
      >
        <div className="space-y-3">
          {result.recommendations.map(rec => (
            <RecommendationCard key={rec.id} recommendation={rec} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Calculations */}
      {calculations && (
        <CollapsibleSection
          title="Cálculos Técnicos"
          id="calculations"
          expanded={expandedSection}
          onToggle={setExpandedSection}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Thermal */}
            <div className="bg-accent-light rounded-lg p-4 border border-accent">
              <h4 className="font-semibold text-accent mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Desempenho Térmico (REH)
              </h4>
              <div className="space-y-1 text-sm text-accent">
                <p>Nic = <strong>{calculations.thermal.Nic.toFixed(1)}</strong> kWh/m&sup2;.ano (máx: {calculations.thermal.Ni.toFixed(1)})</p>
                <p>Nvc = <strong>{calculations.thermal.Nvc.toFixed(1)}</strong> kWh/m&sup2;.ano</p>
                <p>Nac = <strong>{calculations.thermal.Nac.toFixed(1)}</strong> kWh/m&sup2;.ano</p>
                <p>Ntc = <strong>{calculations.thermal.Ntc.toFixed(1)}</strong> | Nt = <strong>{calculations.thermal.Nt.toFixed(1)}</strong></p>
                <p>Ntc/Nt = <strong>{calculations.thermal.ratio.toFixed(2)}</strong></p>
                <p>Perdas totais: <strong>{calculations.thermal.totalHeatLoss.toFixed(0)}</strong> W/°C</p>
                {calculations.thermalMonthly && (
                  <p className="text-xs text-accent mt-1">
                    Método mensal: Nic={calculations.thermalMonthly.annualNic.toFixed(1)} | Nvc={calculations.thermalMonthly.annualNvc.toFixed(1)} kWh/m&sup2;.ano
                  </p>
                )}
                <p className={`font-medium ${calculations.thermal.compliant ? "text-green-700" : "text-red-700"}`}>
                  {calculations.thermal.compliant ? "Conforme" : "Não conforme"} com REH
                </p>
              </div>
            </div>

            {/* Energy Class */}
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Classe Energética (SCE)
              </h4>
              <div className="space-y-1 text-sm text-green-800">
                <p>Classe calculada: <strong className="text-2xl">{calculations.energyClass.energyClass}</strong></p>
                <p>Ntc/Nt = <strong>{calculations.energyClass.ratio.toFixed(2)}</strong></p>
                <p className="text-xs text-green-600 mt-2">Baseado em DL 101-D/2020 (método simplificado)</p>
              </div>
            </div>

            {/* Acoustic */}
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <h4 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                <Volume2 className="w-4 h-4" /> Acústica (RRAE)
              </h4>
              <div className="space-y-1 text-sm text-indigo-800">
                <p>D&apos;nT,w exigido: <strong>≥ {calculations.acoustic.requiredAirborne} dB</strong> {calculations.acoustic.airborneCompliant ? "✓" : "✗"}</p>
                <p>L&apos;nT,w exigido: <strong>≤ {calculations.acoustic.requiredImpact} dB</strong> {calculations.acoustic.impactCompliant ? "✓" : "✗"}</p>
                <p>D2m,nT,w exigido: <strong>≥ {calculations.acoustic.requiredFacade} dB</strong> {calculations.acoustic.facadeCompliant ? "✓" : "✗"}</p>
                <p>Ruído equipamentos: <strong>≤ {calculations.acoustic.equipmentNoiseLimit} dB(A)</strong></p>
              </div>
            </div>

            {/* Electrical */}
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                <Plug className="w-4 h-4" /> Instalação Elétrica (RTIEBT)
              </h4>
              <div className="space-y-1 text-sm text-amber-800">
                <p>Carga total: <strong>{calculations.electrical.totalLoad} kVA</strong></p>
                <p>Alimentação: <strong>{calculations.electrical.recommendedSupply === "three_phase" ? "Trifásica" : "Monofásica"}</strong></p>
                <p>Potência contratada: <strong>{calculations.electrical.recommendedPower} kVA</strong></p>
                <p>Disjuntor geral: <strong>{calculations.electrical.mainBreakerAmps} A</strong></p>
                <p>Circuitos mín.: <strong>{calculations.electrical.minCircuits}</strong> | RCDs mín.: <strong>{calculations.electrical.minRCDCount}</strong></p>
                <p>Secção cabo: <strong>{calculations.electrical.mainCableSection} mm²</strong></p>
                {calculations.electrical.needsDGEGApproval && (
                  <p className="text-red-700 font-medium">Requer aprovação DGEG (&gt;41.4 kVA)</p>
                )}
              </div>
            </div>

            {/* Water */}
            <div className="bg-sky-50 rounded-lg p-4 border border-sky-200 md:col-span-2">
              <h4 className="font-semibold text-sky-900 mb-2 flex items-center gap-2">
                <Droplets className="w-4 h-4" /> Dimensionamento Hidráulico (RGSPPDADAR)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-sky-800">
                <p>Caudal simultâneo: <strong>{calculations.waterSizing.simultaneousFlow} L/s</strong></p>
                <p>Ramal principal: <strong>Ø{calculations.waterSizing.mainPipeDiameter} mm</strong></p>
                <p>Ramal AQS: <strong>Ø{calculations.waterSizing.hotWaterPipeDiameter} mm</strong></p>
                <p>Drenagem: <strong>Ø{calculations.waterSizing.drainagePipeDiameter} mm</strong></p>
                <p>Consumo diário: <strong>{calculations.waterSizing.dailyConsumption} L/dia</strong></p>
                {calculations.waterSizing.storageTankSize > 0 && (
                  <p>Reservatório: <strong>{calculations.waterSizing.storageTankSize} L</strong></p>
                )}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Feature Toggle Selectors */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">
          {lang === "pt" ? "Módulos adicionais" : "Additional modules"}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowCostEstimation(!showCostEstimation)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
              showCostEstimation
                ? "bg-amber-50 border-amber-300 text-amber-800 shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700"
            }`}
          >
            <Euro className="w-4 h-4" />
            {lang === "pt" ? "Estimativa de Custos (CYPE)" : "Cost Estimate (CYPE)"}
            <span className={`w-2 h-2 rounded-full ${showCostEstimation ? "bg-amber-500" : "bg-gray-300"}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowProjectPlan(!showProjectPlan)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
              showProjectPlan
                ? "bg-accent-light border-accent text-accent shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:border-accent hover:text-accent-hover"
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            {lang === "pt" ? "Planeamento MS Project" : "MS Project Planning"}
            <span className={`w-2 h-2 rounded-full ${showProjectPlan ? "bg-accent" : "bg-gray-300"}`} />
          </button>
        </div>
      </div>

      {/* Cost Estimation (toggle-controlled) */}
      {showCostEstimation && costSummary.estimates.length > 0 && (
        <CollapsibleSection
          title={`Estimativa de Custos (${formatCost(costSummary.totalMinCost)} - ${formatCost(costSummary.totalMaxCost)})`}
          id="costs"
          expanded={expandedSection}
          onToggle={setExpandedSection}
        >
          <div className="space-y-4">
            {/* Total summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 text-center">
                <Euro className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-xs text-amber-600">Mínimo Estimado</p>
                <p className="text-xl font-bold text-amber-800">{formatCost(costSummary.totalMinCost)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border border-red-200 text-center">
                <Euro className="w-5 h-5 text-red-500 mx-auto mb-1" />
                <p className="text-xs text-red-600">Máximo Estimado</p>
                <p className="text-xl font-bold text-red-800">{formatCost(costSummary.totalMaxCost)}</p>
              </div>
            </div>

            {/* Adjustment factors */}
            {(costSummary.locationFactor !== 1.0 || costSummary.typeFactor !== 1.0) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {costSummary.locationFactor !== 1.0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-light text-accent rounded border border-accent">
                    <MapPin className="w-3 h-3" />
                    Fator localização: {costSummary.locationFactor.toFixed(2)}
                  </span>
                )}
                {costSummary.typeFactor !== 1.0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded border border-purple-200">
                    <Building className="w-3 h-3" />
                    Fator tipologia: {costSummary.typeFactor.toFixed(2)}
                  </span>
                )}
              </div>
            )}

            {/* By area breakdown */}
            {costSummary.byArea.map(area => (
              <div key={area.area} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{area.areaName}</span>
                    <span className="text-xs text-gray-400">({area.count} {area.count === 1 ? "item" : "itens"})</span>
                  </div>
                  <span className="text-sm font-medium text-gray-700">{formatCost(area.minCost)} - {formatCost(area.maxCost)}</span>
                </div>
              </div>
            ))}

            {/* Toggle detailed line items */}
            {costSummary.lineItems.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowCostDetails(!showCostDetails)}
                  className="text-sm text-accent hover:text-accent-hover font-medium flex items-center gap-1"
                >
                  {showCostDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showCostDetails ? "Ocultar detalhes CYPE" : `Ver detalhes CYPE (${costSummary.lineItems.length} rubricas)`}
                </button>

                {showCostDetails && (
                  <div className="mt-3 space-y-2">
                    {costSummary.lineItems.map((li, idx) => (
                      <CypeLineItemCard key={`${li.workItem.code}-${idx}`} lineItem={li} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-gray-500">
              Valores de referência: <strong>geradordeprecos.info</strong> (CYPE, Portugal 2024-2025).
              Custos reais variam conforme localização, acessibilidade e complexidade da obra.
            </p>
          </div>
        </CollapsibleSection>
      )}

      {/* Checklists */}
      {checklists.length > 0 && (
        <CollapsibleSection
          title={`Checklists de Verificação (${checklists.length} especialidades)`}
          id="checklists"
          expanded={expandedSection}
          onToggle={setExpandedSection}
        >
          <div className="space-y-4">
            {checklists.map(cl => (
              <div key={cl.specialty} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-gray-500" />
                  <h4 className="font-semibold text-sm text-gray-800">{cl.title}</h4>
                  <span className="text-xs text-gray-500 ml-auto">{cl.items.length} itens</span>
                </div>
                <div className="p-3 space-y-2">
                  {cl.items.slice(0, 5).map(item => (
                    <div key={item.id} className="flex items-start gap-2 text-sm">
                      <span className={`mt-0.5 ${item.critical ? "text-red-400" : "text-gray-300"}`}>
                        {item.critical ? "!" : "-"}
                      </span>
                      <div>
                        <p className="text-gray-700">{item.description}</p>
                        <p className="text-xs text-gray-500">{item.regulation} - {item.article}</p>
                      </div>
                    </div>
                  ))}
                  {cl.items.length > 5 && (
                    <p className="text-xs text-gray-500">+{cl.items.length - 5} itens adicionais</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* AI Assistant */}
      {project && (
        <CollapsibleSection
          title="Assistente IA Regulamentar"
          id="ai-assistant"
          expanded={expandedSection}
          onToggle={setExpandedSection}
          icon={<MessageSquare className="w-5 h-5 text-accent" />}
        >
          <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
            <AiAssistant project={project} analysis={result} />
          </Suspense>
        </CollapsibleSection>
      )}

      {/* Consultation Timeline */}
      {project && (
        <CollapsibleSection
          title="Cronograma de Consultas (RJUE)"
          id="consultation-timeline"
          expanded={expandedSection}
          onToggle={setExpandedSection}
          icon={<CalendarClock className="w-5 h-5 text-emerald-600" />}
        >
          <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
            <ConsultationTimelineView project={project} />
          </Suspense>
        </CollapsibleSection>
      )}

      {/* Version Diff */}
      {project && (
        <CollapsibleSection
          title="Histórico de Versões"
          id="version-diff"
          expanded={expandedSection}
          onToggle={setExpandedSection}
          icon={<GitCompareArrows className="w-5 h-5 text-violet-600" />}
        >
          <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
            <VersionDiffView project={project} analysis={result} />
          </Suspense>
        </CollapsibleSection>
      )}

      {/* Remediation WBS Bridge (toggle-controlled) */}
      {showProjectPlan && remediationSummary.totalTasks > 0 && (
        <CollapsibleSection
          title={`Plano de Remediação (${remediationSummary.criticalCount} críticas, ${remediationSummary.warningCount} avisos)`}
          id="remediation-wbs"
          expanded={expandedSection}
          onToggle={setExpandedSection}
          icon={<Wrench className="w-5 h-5 text-orange-600" />}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
                <p className="text-2xl font-bold text-red-700">{remediationSummary.criticalCount}</p>
                <p className="text-xs text-red-600">Não-conformidades</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                <p className="text-2xl font-bold text-amber-700">{remediationSummary.warningCount}</p>
                <p className="text-xs text-amber-600">Avisos</p>
              </div>
              <div className="bg-accent-light rounded-lg p-3 text-center border border-accent">
                <p className="text-2xl font-bold text-accent">{remediationSummary.totalTasks}</p>
                <p className="text-xs text-accent">Tarefas WBS</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                <p className="text-2xl font-bold text-purple-700">~{remediationSummary.estimatedTotalDays}d</p>
                <p className="text-xs text-purple-600">Duração estimada</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Especialidades afetadas:</p>
              <div className="flex flex-wrap gap-2">
                {remediationSummary.affectedAreas.map(area => (
                  <span key={area} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full border border-gray-200">
                    {area}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                const articles = findingsToWbs(result.findings);
                const json = JSON.stringify(articles, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `remediation-wbs-${result.projectName.replace(/\s+/g, "-")}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Exportar WBS de Remediação
            </button>

            <p className="text-xs text-gray-500">
              O WBS de remediação pode ser importado na ferramenta de Planeamento WBS para gerar
              cronograma de trabalhos corretivos com custos CYPE e exportação MS Project.
            </p>
          </div>
        </CollapsibleSection>
      )}

      {/* Actions */}
      <div className="flex gap-4 flex-wrap items-start">
        <button
          onClick={onReset}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Nova Análise
        </button>

        {/* PDF export with options popover */}
        <div className="relative">
          <button
            onClick={() => setExportMenu(exportMenu === "pdf" ? null : "pdf")}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isExporting ? t.loading : t.exportPDF}
            <ChevronDown className="w-3 h-3 ml-1" />
          </button>
          {exportMenu === "pdf" && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-[220px]">
              <p className="text-xs font-semibold text-gray-500 mb-2">Secções do PDF</p>
              {([
                ["findings", "Constatações"] as const,
                ["recommendations", "Recomendações"] as const,
                ["passFindings", "Conformidades"] as const,
                ["metrics", "Cobertura de regras"] as const,
                ["coverage", "Dados do projeto"] as const,
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 py-1 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfOpts[key]}
                    onChange={() => setPdfOpts(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded border-gray-300"
                  />
                  {label}
                </label>
              ))}
              <button
                onClick={async () => {
                  setExportMenu(null);
                  setIsExporting(true);
                  try {
                    const { generatePDFReport } = await import("@/lib/pdf-report");
                    generatePDFReport(result, pdfOpts);
                  } catch (err) {
                    console.error("PDF export error:", err);
                  } finally {
                    setIsExporting(false);
                  }
                }}
                className="mt-2 w-full px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Transferir PDF
              </button>
            </div>
          )}
        </div>

        {/* Excel export with options popover */}
        <div className="relative">
          <button
            onClick={() => setExportMenu(exportMenu === "excel" ? null : "excel")}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t.exportExcel}
            <ChevronDown className="w-3 h-3 ml-1" />
          </button>
          {exportMenu === "excel" && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-[220px]">
              <p className="text-xs font-semibold text-gray-500 mb-2">Folhas do Excel</p>
              {([
                ["nonConformities", "Não Conformidades"] as const,
                ["conformities", "Conformidades"] as const,
                ["recommendations", "Recomendações"] as const,
                ["rulesCoverage", "Cobertura de regras"] as const,
                ["auditTrail", "Auditoria"] as const,
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 py-1 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excelOpts[key]}
                    onChange={() => setExcelOpts(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded border-gray-300"
                  />
                  {label}
                </label>
              ))}
              <button
                onClick={async () => {
                  setExportMenu(null);
                  try {
                    const { downloadComplianceExcel } = await import("@/lib/compliance-export");
                    downloadComplianceExcel(result, {
                      projectName: result.projectName,
                      ...excelOpts,
                    });
                  } catch (err) {
                    console.error("Excel export error:", err);
                  }
                }}
                className="mt-2 w-full px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Transferir Excel
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        >
          <Printer className="w-4 h-4" />
          {t.printReport}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ScoreCircle({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-500" : "text-red-500";
  const bgColor =
    score >= 80 ? "bg-green-50" : score >= 60 ? "bg-amber-50" : "bg-red-50";

  return (
    <div className={`w-20 h-20 rounded-full ${bgColor} flex flex-col items-center justify-center`}>
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-gray-500">/100</span>
    </div>
  );
}

function EnergyClassBadge({ energyClass }: { energyClass: string }) {
  const colors: Record<string, string> = {
    "A+": "bg-green-700 text-white",
    A: "bg-green-600 text-white",
    B: "bg-green-500 text-white",
    "B-": "bg-yellow-400 text-gray-900",
    C: "bg-yellow-500 text-gray-900",
    D: "bg-orange-400 text-white",
    E: "bg-orange-500 text-white",
    F: "bg-red-600 text-white",
  };

  return (
    <div className="text-center">
      <div className={`inline-block px-4 py-2 rounded-lg font-bold text-2xl ${colors[energyClass] ?? "bg-gray-400 text-white"}`}>
        {energyClass}
      </div>
      <p className="text-xs text-gray-500 mt-1">Classe Energética</p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  const bgMap: Record<string, string> = {
    red: "bg-red-50",
    amber: "bg-amber-50",
    green: "bg-green-50",
  };
  return (
    <div className={`${bgMap[color] ?? "bg-gray-50"} rounded-lg p-4 text-center`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

function RegulationCard({ summary, onDrillDown }: { summary: RegulationSummary; onDrillDown?: (area: RegulationArea) => void }) {
  const statusConfig = {
    compliant: { bg: "bg-green-50 border-green-200", icon: <CheckCircle className="w-5 h-5 text-green-500" />, label: "Conforme" },
    partially_compliant: { bg: "bg-amber-50 border-amber-200", icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, label: "Parcialmente Conforme" },
    non_compliant: { bg: "bg-red-50 border-red-200", icon: <XCircle className="w-5 h-5 text-red-500" />, label: "Não Conforme" },
  };

  const areaIcons: Record<string, React.ReactNode> = {
    architecture: <Ruler className="w-5 h-5 text-teal-600" />,
    structural: <Columns3 className="w-5 h-5 text-stone-600" />,
    fire_safety: <Flame className="w-5 h-5 text-orange-500" />,
    avac: <Wind className="w-5 h-5 text-cyan-600" />,
    water_drainage: <Droplets className="w-5 h-5 text-sky-500" />,
    gas: <Fuel className="w-5 h-5 text-red-500" />,
    electrical: <Plug className="w-5 h-5 text-amber-600" />,
    ited_itur: <Wifi className="w-5 h-5 text-cyan-500" />,
    thermal: <Zap className="w-5 h-5 text-accent" />,
    acoustic: <Volume2 className="w-5 h-5 text-indigo-500" />,
    accessibility: <Accessibility className="w-5 h-5 text-purple-500" />,
    energy: <Lightbulb className="w-5 h-5 text-yellow-500" />,
    elevators: <ArrowUpDown className="w-5 h-5 text-violet-500" />,
    licensing: <FileText className="w-5 h-5 text-emerald-600" />,
    waste: <Recycle className="w-5 h-5 text-lime-600" />,
    local: <MapPin className="w-5 h-5 text-rose-500" />,
    drawings: <PenTool className="w-5 h-5 text-pink-500" />,
    general: <Building className="w-5 h-5 text-gray-500" />,
  };

  const config = statusConfig[summary.status];

  const hasFindings = summary.findingsCount > 0;
  const Wrapper = hasFindings && onDrillDown ? "button" : "div";

  return (
    <Wrapper
      {...(hasFindings && onDrillDown ? {
        type: "button" as const,
        onClick: () => onDrillDown(summary.area as RegulationArea),
      } : {})}
      className={`flex items-center gap-4 p-4 rounded-lg border ${config.bg} w-full text-left ${
        hasFindings && onDrillDown ? "cursor-pointer hover:shadow-md transition-shadow group" : ""
      }`}
    >
      <div>{areaIcons[summary.area] ?? <Shield className="w-5 h-5" />}</div>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{summary.name}</p>
        <div className="flex items-center gap-2 mt-1">
          {config.icon}
          <span className="text-sm text-gray-600">{config.label}</span>
          {summary.findingsCount > 0 && (
            <span className="text-xs text-gray-500">
              ({summary.findingsCount} {summary.findingsCount === 1 ? "constatação" : "constatações"})
            </span>
          )}
        </div>
      </div>
      <div className="text-right flex items-center gap-2">
        <div className="text-lg font-bold text-gray-800">{summary.score}%</div>
        {hasFindings && onDrillDown && (
          <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-accent transition-colors" />
        )}
      </div>
    </Wrapper>
  );
}

function getAnalyzerSource(id: string): string | null {
  if (id.startsWith("PF-")) return "Plugins";
  if (id.startsWith("RTIEBT_")) return "RTIEBT";
  if (id.startsWith("plumbing-")) return "RGSPPDADAR";
  if (id.startsWith("SCIE-CALC-")) return "SCIE";
  if (id.startsWith("SCE-")) return "SCE";
  if (id.startsWith("PDM-")) return "PDM";
  return null;
}

function getSourceBadgeClass(source: string): string {
  const map: Record<string, string> = {
    Plugins: "bg-accent-medium text-accent",
    RTIEBT: "bg-yellow-100 text-yellow-700",
    RGSPPDADAR: "bg-cyan-100 text-cyan-700",
    SCIE: "bg-red-100 text-red-700",
    SCE: "bg-green-100 text-green-700",
    PDM: "bg-purple-100 text-purple-700",
  };
  return map[source] || "bg-gray-100 text-gray-700";
}

function FindingCard({ finding, costEstimate }: { finding: Finding; costEstimate?: { minCost: number; maxCost: number } }) {
  const severityConfig: Record<Severity, { bg: string; icon: React.ReactNode; label: string }> = {
    critical: { bg: "bg-red-50 border-red-200", icon: <XCircle className="w-5 h-5 text-red-500 shrink-0" />, label: "Crítico" },
    warning: { bg: "bg-amber-50 border-amber-200", icon: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />, label: "Aviso" },
    info: { bg: "bg-accent-light border-accent", icon: <Info className="w-5 h-5 text-accent shrink-0" />, label: "Info" },
    pass: { bg: "bg-green-50 border-green-200", icon: <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />, label: "Conforme" },
  };

  const config = severityConfig[finding.severity];
  const source = getAnalyzerSource(finding.id);

  return (
    <div className={`p-4 rounded-lg border ${config.bg}`}>
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
              {finding.regulation}
            </span>
            {source && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${getSourceBadgeClass(source)}`}>
                {source}
              </span>
            )}
            {finding.article && (
              <span className="text-xs text-gray-500">{finding.article}</span>
            )}
          </div>
          <p className="text-sm text-gray-800 mt-1">{finding.description}</p>
          {(finding.currentValue || finding.requiredValue) && (
            <div className="flex gap-4 mt-2 text-xs">
              {finding.currentValue && (
                <span className="text-gray-600">
                  Atual: <strong>{finding.currentValue}</strong>
                </span>
              )}
              {finding.requiredValue && (
                <span className="text-gray-600">
                  Exigido: <strong>{finding.requiredValue}</strong>
                </span>
              )}
            </div>
          )}
          {finding.remediation && (
            <div className="mt-2 p-2 bg-white/60 border border-gray-200 rounded text-xs text-gray-700">
              <span className="font-semibold text-gray-800">Como resolver: </span>
              {finding.remediation}
            </div>
          )}
          {costEstimate && (costEstimate.minCost > 0 || costEstimate.maxCost > 0) && (
            <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
              <Euro className="w-3 h-3" />
              <span>Custo est.: <strong className="text-gray-700">{formatCost(costEstimate.minCost)}&ndash;{formatCost(costEstimate.maxCost)}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const impactColors = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-accent-medium text-accent",
  };
  const impactLabels = { high: "Alto Impacto", medium: "Impacto Médio", low: "Baixo Impacto" };

  return (
    <div className="p-4 rounded-lg border border-accent bg-accent-light">
      <div className="flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900">{recommendation.title}</h4>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${impactColors[recommendation.impact]}`}>
              {impactLabels[recommendation.impact]}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1">{recommendation.description}</p>
          {recommendation.estimatedSavings && (
            <p className="text-xs text-green-700 mt-2 font-medium">
              Poupança estimada: {recommendation.estimatedSavings}
            </p>
          )}
          {recommendation.regulatoryBasis && (
            <p className="text-xs text-gray-500 mt-1">
              Base regulamentar: {recommendation.regulatoryBasis}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  id,
  expanded,
  onToggle,
  children,
  icon,
}: {
  title: string;
  id: string;
  expanded: string | null;
  onToggle: (id: string | null) => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const isExpanded = expanded === id;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(isExpanded ? null : id)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {isExpanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function CypeLineItemCard({ lineItem }: { lineItem: CostLineItem }) {
  const { workItem: wi, quantity, quantitySource, adjustedCost, breakdown } = lineItem;
  const confidenceColors = {
    high: "bg-green-100 text-green-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-gray-100 text-gray-600",
  };
  const confidenceLabels = { high: "Alta", medium: "Média", low: "Baixa" };
  const sourceLabels = { measured: "medido", estimated: "estimado", minimum: "mínimo" };
  const total = breakdown.materials + breakdown.labor + breakdown.machinery;

  return (
    <div className="p-3 bg-white rounded-lg border border-gray-200 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">{wi.code}</code>
            <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceColors[lineItem.confidence]}`}>
              {confidenceLabels[lineItem.confidence]}
            </span>
          </div>
          <p className="text-gray-800 mt-1">{wi.description}</p>
          <p className="text-xs text-gray-400 mt-0.5">{wi.chapter}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-gray-900">{formatCost(adjustedCost)}</p>
          <p className="text-xs text-gray-500">{quantity.toFixed(1)} {wi.unit} × {formatCost(wi.unitCost)}/{wi.unit}</p>
          <p className="text-xs text-gray-400">({sourceLabels[quantitySource]})</p>
        </div>
      </div>
      {/* Breakdown bar */}
      {total > 0 && (
        <div className="mt-2">
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-accent" style={{ width: `${(breakdown.materials / total) * 100}%` }} title={`Materiais: ${formatCost(breakdown.materials)}`} />
            <div className="bg-orange-400" style={{ width: `${(breakdown.labor / total) * 100}%` }} title={`Mão-de-obra: ${formatCost(breakdown.labor)}`} />
            <div className="bg-gray-400" style={{ width: `${(breakdown.machinery / total) * 100}%` }} title={`Equipamento: ${formatCost(breakdown.machinery)}`} />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" /> Materiais {formatCost(breakdown.materials)}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Mão-de-obra {formatCost(breakdown.labor)}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Equip. {formatCost(breakdown.machinery)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function sortFindings(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Short labels for area filter chips and heatmap */
const AREA_SHORT_LABELS: Record<string, string> = {
  architecture: "Arquitetura",
  structural: "Estruturas",
  fire_safety: "Incêndio",
  avac: "AVAC",
  water_drainage: "Águas",
  gas: "Gás",
  electrical: "Elétrico",
  ited_itur: "ITED/ITUR",
  thermal: "Térmico",
  acoustic: "Acústica",
  accessibility: "Acessibilidade",
  energy: "Energia",
  elevators: "Ascensores",
  licensing: "Licenciamento",
  waste: "Resíduos",
  local: "Municipal",
  drawings: "Desenhos",
  general: "Geral",
};

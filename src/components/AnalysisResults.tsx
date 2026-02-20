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
  Minus,
  TrendingUp,
} from "lucide-react";
import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import type { RegulationArea } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { estimateCosts, formatCost, type CostSummary, type CostLineItem } from "@/lib/cost-estimation";
import type { SpecialtyAnalysisResult } from "@/lib/ifc-specialty-analyzer";
import { generateChecklists, type Checklist } from "@/lib/checklist-generator";
import { generateRemediationSummary, findingsToWbs } from "@/lib/findings-to-wbs";
import { generateLicensingPhases, type LicensingPhasesResult } from "@/lib/licensing-phases";
import { phaseColor, phaseLabel } from "@/lib/phase-colors";
import { generateCoverageReport, type CoverageReport, type AreaCoverage } from "@/lib/plugins/coverage";

const AiAssistant = lazy(() => import("@/components/AiAssistant"));
const ConsultationTimelineView = lazy(() => import("@/components/ConsultationTimelineView"));
const VersionDiffView = lazy(() => import("@/components/VersionDiffView"));
import CommentAnchor from "@/components/CommentAnchor";
import { canPerformAction } from "@/lib/collaboration";

interface AnalysisResultsProps {
  result: AnalysisResult;
  calculations?: AllCalculations | null;
  project?: BuildingProject;
  onReset: () => void;
  onEditProject?: (targetSection?: string) => void;
  budgetExcel?: ArrayBuffer;
  msProjectXml?: string;
  ccpmGanttExcel?: ArrayBuffer;
  complianceExcel?: ArrayBuffer;
  projectId?: string;
  userRole?: import("@/lib/collaboration").ProjectRole | null;
  ifcAnalyses?: SpecialtyAnalysisResult[];
  cashFlow?: import("@/lib/cashflow").CashFlowResult;
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

function findDominantSection(missingFields: string[]): string | undefined {
  const counts: Record<string, number> = {};
  for (const field of missingFields) {
    const ns = field.split(".")[0];
    const section = FIELD_TO_SECTION[ns];
    if (section) counts[section] = (counts[section] || 0) + 1;
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [section, count] of Object.entries(counts)) {
    if (count > bestCount) { best = section; bestCount = count; }
  }
  return best;
}

// ============================================================
// Main Component
// ============================================================

export default function AnalysisResults({ result, calculations, project, onReset, onEditProject, budgetExcel, msProjectXml, ccpmGanttExcel, complianceExcel, projectId, userRole, ifcAnalyses, cashFlow }: AnalysisResultsProps) {
  const { t, lang } = useI18n();

  // Multi-open sections (independent expand/collapse)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const [isExporting, setIsExporting] = useState(false);
  const [areaFilter, setAreaFilter] = useState<RegulationArea | "all">("all");
  const [showAllActions, setShowAllActions] = useState(false);
  const [showCostDetails, setShowCostDetails] = useState(false);

  // Export options
  const [exportMenu, setExportMenu] = useState<"pdf" | "excel" | null>(null);
  const [pdfOpts, setPdfOpts] = useState({ findings: true, recommendations: true, passFindings: true, metrics: true, coverage: true });
  const [excelOpts, setExcelOpts] = useState({ nonConformities: true, conformities: true, recommendations: true, rulesCoverage: true, auditTrail: true });

  // Counts
  const criticalCount = result.findings.filter(f => f.severity === "critical").length;
  const warningCount = result.findings.filter(f => f.severity === "warning").length;
  const passCount = result.findings.filter(f => f.severity === "pass").length;

  // NA areas (no data provided)
  const naAreas = useMemo(() => {
    const set = new Set<string>();
    for (const f of result.findings) {
      if (f.id.startsWith("NA-")) set.add(f.area);
    }
    return set;
  }, [result.findings]);

  // Action items: critical + warning only
  const actionItems = useMemo(
    () => sortFindings(result.findings.filter(f => f.severity === "critical" || f.severity === "warning")),
    [result.findings],
  );

  // Findings grouped by area
  const findingsByArea = useMemo(() => {
    const map = new Map<RegulationArea, { critical: number; warning: number; info: number; pass: number }>();
    for (const f of result.findings) {
      const entry = map.get(f.area) ?? { critical: 0, warning: 0, info: 0, pass: 0 };
      entry[f.severity]++;
      map.set(f.area, entry);
    }
    return map;
  }, [result.findings]);

  const areasWithFindings = useMemo(() => {
    const entries = Array.from(findingsByArea.entries());
    return entries.sort((a, b) => {
      const scoreA = a[1].critical * 1000 + a[1].warning * 100;
      const scoreB = b[1].critical * 1000 + b[1].warning * 100;
      return scoreB - scoreA;
    });
  }, [findingsByArea]);

  const filteredFindings = useMemo(() => {
    if (areaFilter === "all") return result.findings;
    return result.findings.filter(f => f.area === areaFilter);
  }, [result.findings, areaFilter]);

  const drillDownToArea = useCallback((area: RegulationArea) => {
    setAreaFilter(area);
    setOpenSections(prev => new Set([...prev, "findings"]));
  }, []);

  // Cost estimation
  const costSummary = useMemo(() => estimateCosts(result.findings, project, ifcAnalyses), [result.findings, project, ifcAnalyses]);
  const costLookup = useMemo(() => {
    const map = new Map<string, { minCost: number; maxCost: number }>();
    for (const est of costSummary.estimates) {
      map.set(est.findingId, { minCost: est.minCost, maxCost: est.maxCost });
    }
    return map;
  }, [costSummary]);

  // Checklists, remediation, coverage
  const checklists = useMemo(() => project ? generateChecklists(project, result) : [], [project, result]);
  const remediationSummary = useMemo(() => generateRemediationSummary(result.findings), [result.findings]);
  const licensingResult = useMemo<LicensingPhasesResult | null>(() => {
    if (!project) return null;
    try { return generateLicensingPhases(project, result.findings, { includePostConstruction: true, startingUid: 8000 }); }
    catch { return null; }
  }, [project, result.findings]);
  const coverageReport = useMemo(() => { try { return generateCoverageReport(); } catch { return null; } }, []);

  // Cost impact line for hero
  const hasCostData = costSummary.estimates.length > 0;

  // Group action items by regulation for the summary bar
  const regulationBreakdown = useMemo(() => {
    const byReg = new Map<string, { regulation: string; areas: Set<string>; critical: number; warning: number }>();
    for (const f of actionItems) {
      const existing = byReg.get(f.regulation);
      if (existing) {
        existing.areas.add(f.area);
        if (f.severity === "critical") existing.critical++;
        else existing.warning++;
      } else {
        byReg.set(f.regulation, {
          regulation: f.regulation,
          areas: new Set([f.area]),
          critical: f.severity === "critical" ? 1 : 0,
          warning: f.severity === "warning" ? 1 : 0,
        });
      }
    }
    return Array.from(byReg.values()).sort((a, b) => (b.critical * 10 + b.warning) - (a.critical * 10 + a.warning));
  }, [actionItems]);

  // ── Narrative summary ──────────────────────────────────────
  const narrative = useMemo(() => {
    const parts: string[] = [];

    // Opening
    parts.push(`O edifício está ${result.overallScore}% conforme com a regulamentação portuguesa.`);

    // Group violations by regulation
    if (actionItems.length > 0) {
      const byReg = new Map<string, { areas: Set<string>; count: number }>();
      for (const f of actionItems) {
        const key = f.regulation;
        const existing = byReg.get(key);
        if (existing) { existing.count++; existing.areas.add(f.area); }
        else byReg.set(key, { areas: new Set([f.area]), count: 1 });
      }

      // Build regulation list: "segurança contra incêndio (DL 220/2008, 2)"
      const regParts: string[] = [];
      for (const [reg, { areas, count }] of byReg) {
        const areaName = AREA_SHORT_LABELS[Array.from(areas)[0]] ?? Array.from(areas)[0];
        regParts.push(`${areaName.toLowerCase()} (${reg}, ${count})`);
      }

      if (criticalCount > 0) {
        parts.push(`${criticalCount} não-${criticalCount === 1 ? "conformidade" : "conformidades"} em ${regParts.slice(0, 3).join(", ")}${regParts.length > 3 ? ` e mais ${regParts.length - 3}` : ""}.`);
      } else if (warningCount > 0) {
        parts.push(`${warningCount} ${warningCount === 1 ? "aviso" : "avisos"} em ${regParts.slice(0, 3).join(", ")}${regParts.length > 3 ? ` e mais ${regParts.length - 3}` : ""}.`);
      }
    }

    // NA areas
    if (naAreas.size > 0) {
      parts.push(`${naAreas.size} ${naAreas.size === 1 ? "especialidade não foi analisada" : "especialidades não foram analisadas"} por falta de dados.`);
    }

    // Cost
    if (hasCostData) {
      parts.push(`Custo estimado de correção: ${formatCost(costSummary.totalMinCost)}–${formatCost(costSummary.totalMaxCost)}.`);
    }

    return parts.join(" ");
  }, [result.overallScore, actionItems, criticalCount, warningCount, naAreas, hasCostData, costSummary]);

  // One-click PDF export
  const handleQuickPDF = useCallback(async () => {
    setIsExporting(true);
    try {
      const { generatePDFReport } = await import("@/lib/pdf-report");
      generatePDFReport(result, { findings: true, recommendations: true, passFindings: true, metrics: true, coverage: true });
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsExporting(false);
    }
  }, [result]);

  return (
    <div className="space-y-6">

      {/* ════════════════════════════════════════════════════════════
           1. HERO SUMMARY — always visible
         ════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{result.projectName}</h2>
            <p className="text-3xl font-bold mt-2">
              <span className={result.overallScore >= 80 ? "text-green-600" : result.overallScore >= 60 ? "text-amber-600" : "text-red-600"}>
                {result.overallScore}%
              </span>
              <span className="text-lg font-medium text-gray-500 ml-2">conforme</span>
            </p>
            {/* Narrative summary */}
            <p className="text-sm text-gray-600 mt-3 leading-relaxed max-w-2xl">{narrative}</p>
          </div>
          <div className="flex items-center gap-4">
            <ScoreCircle score={result.overallScore} />
            <EnergyClassBadge energyClass={result.energyClass} />
          </div>
        </div>

        {/* Quick stats + PDF button */}
        <div className="flex flex-col md:flex-row md:items-end gap-4 mt-6">
          <div className="grid grid-cols-3 gap-4 flex-1">
            <StatCard icon={<XCircle className="w-5 h-5 text-red-500" />} label={t.nonCompliant} value={criticalCount} color="red" />
            <StatCard icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} label={t.warnings} value={warningCount} color="amber" />
            <StatCard icon={<CheckCircle className="w-5 h-5 text-green-500" />} label={t.compliant} value={passCount} color="green" />
          </div>
          <button
            onClick={handleQuickPDF}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium shadow-sm disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-5 h-5" />
            {isExporting ? "A gerar..." : "Relatório PDF"}
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
           2. SPECIALTY GRID — always visible, compact tiles
         ════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Especialidades</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {result.regulationSummary.map(reg => (
            <SpecialtyTile
              key={reg.area}
              summary={reg}
              isNA={naAreas.has(reg.area)}
              findings={findingsByArea.get(reg.area as RegulationArea)}
              onClick={() => drillDownToArea(reg.area as RegulationArea)}
              onAddData={onEditProject ? () => onEditProject(AREA_TO_FORM_SECTION[reg.area]) : undefined}
            />
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
           3. ACTION ITEMS — auto-visible if there are issues
         ════════════════════════════════════════════════════════════ */}
      {actionItems.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            {actionItems.length} {actionItems.length === 1 ? "problema" : "problemas"} a resolver
          </h3>
          {/* Regulation breakdown chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {regulationBreakdown.map(rb => (
              <span
                key={rb.regulation}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  rb.critical > 0 ? "bg-red-50 text-red-800 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                <Shield className="w-3 h-3" />
                {rb.regulation}
                <span className="font-bold">{rb.critical + rb.warning}</span>
              </span>
            ))}
          </div>
          <div className="space-y-3">
            {(showAllActions ? actionItems : actionItems.slice(0, 5)).map(f => (
              <FindingCard key={f.id} finding={f} costEstimate={costLookup.get(f.id)} projectId={projectId} userRole={userRole} />
            ))}
          </div>
          {actionItems.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllActions(!showAllActions)}
              className="mt-4 text-sm text-accent hover:text-accent-hover font-medium flex items-center gap-1"
            >
              {showAllActions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showAllActions ? "Mostrar menos" : `Ver todos os ${actionItems.length} problemas`}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-6 text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <h3 className="text-lg font-semibold text-green-800">Sem problemas detetados</h3>
          <p className="text-sm text-green-600 mt-1">
            {naAreas.size > 0
              ? `${18 - naAreas.size} especialidades analisadas, ${naAreas.size} sem dados`
              : "Todas as especialidades em conformidade"}
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
           4. RECOMMENDATIONS
         ════════════════════════════════════════════════════════════ */}
      {result.recommendations.length > 0 && (
        <Section
          title={`Recomendações (${result.recommendations.length})`}
          id="recommendations"
          icon={<Lightbulb className="w-5 h-5 text-accent" />}
          open={openSections.has("recommendations")}
          onToggle={() => toggleSection("recommendations")}
        >
          <div className="space-y-3">
            {result.recommendations.map(rec => (
              <RecommendationCard key={rec.id} recommendation={rec} />
            ))}
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════
           5. COST ESTIMATION
         ════════════════════════════════════════════════════════════ */}
      {hasCostData && (
        <Section
          title={`Estimativa de Custos (${formatCost(costSummary.totalMinCost)} - ${formatCost(costSummary.totalMaxCost)})`}
          id="costs"
          icon={<Euro className="w-5 h-5 text-amber-600" />}
          open={openSections.has("costs")}
          onToggle={() => toggleSection("costs")}
        >
          <div className="space-y-4">
            {/* Donut chart + totals */}
            <div className="flex flex-col md:flex-row items-center gap-6">
              {costSummary.byArea.length > 1 && (
                <CostDonut areas={costSummary.byArea} />
              )}
              <div className="grid grid-cols-2 gap-4 flex-1 w-full">
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
            </div>

            {(costSummary.locationFactor !== 1.0 || costSummary.typeFactor !== 1.0) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {costSummary.locationFactor !== 1.0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-light text-accent rounded border border-accent">
                    <MapPin className="w-3 h-3" /> Fator localização: {costSummary.locationFactor.toFixed(2)}
                  </span>
                )}
                {costSummary.typeFactor !== 1.0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded border border-purple-200">
                    <Building className="w-3 h-3" /> Fator tipología: {costSummary.typeFactor.toFixed(2)}
                  </span>
                )}
              </div>
            )}

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

            {costSummary.lineItems.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowCostDetails(!showCostDetails)}
                  className="text-sm text-accent hover:text-accent-hover font-medium flex items-center gap-1"
                >
                  {showCostDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showCostDetails ? "Ocultar detalhes de preços" : `Ver detalhes de preços (${costSummary.lineItems.length} rubricas)`}
                </button>
                {showCostDetails && (
                  <div className="mt-3 space-y-2">
                    {costSummary.lineItems.map((li, idx) => (
                      <PriceLineItemCard key={`${li.workItem.code}-${idx}`} lineItem={li} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-gray-500">
              Valores de referência: <strong>geradordeprecos.info</strong> (Portugal 2024-2025).
              Custos reais variam conforme localização, acessibilidade e complexidade da obra.
            </p>
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════
           5b. CASH FLOW SUMMARY
         ════════════════════════════════════════════════════════════ */}
      {cashFlow && cashFlow.periods.length > 0 && (
        <Section
          title={`Fluxo de Caixa (${cashFlow.totalMonths} meses)`}
          id="cashflow"
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          open={openSections.has("cashflow")}
          onToggle={() => toggleSection("cashflow")}
        >
          <div className="space-y-4">
            {/* Key metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200 text-center">
                <p className="text-xs text-emerald-600">Custo Total</p>
                <p className="text-lg font-bold text-emerald-800">{formatCost(cashFlow.totalCost)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                <p className="text-xs text-blue-600">Pico Mensal</p>
                <p className="text-lg font-bold text-blue-800">{formatCost(cashFlow.workingCapital.peakMonthlySpend)}</p>
                <p className="text-[10px] text-blue-500">{cashFlow.workingCapital.peakMonth}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-center">
                <p className="text-xs text-amber-600">Capital de Giro</p>
                <p className="text-lg font-bold text-amber-800">{formatCost(cashFlow.workingCapital.recommendedWorkingCapital)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
                <p className="text-xs text-gray-600">Contingência ({cashFlow.contingency.percent}%)</p>
                <p className="text-lg font-bold text-gray-800">{formatCost(cashFlow.contingency.amount)}</p>
              </div>
            </div>

            {/* Monthly spend sparkline (compact bar chart) */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Despesa Mensal</h4>
              <div className="flex items-end gap-0.5" style={{ height: 48 }}>
                {cashFlow.periods.map((p) => {
                  const maxSpend = cashFlow.workingCapital.peakMonthlySpend || 1;
                  const pct = (p.total / maxSpend) * 100;
                  return (
                    <div
                      key={p.key}
                      className="flex-1 rounded-t-sm transition-all hover:opacity-80"
                      style={{
                        height: `${Math.max(2, pct)}%`,
                        backgroundColor: p.key === cashFlow.workingCapital.peakMonth ? "#D97706" : "#10B981",
                      }}
                      title={`${p.label}: ${formatCost(p.total)}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                <span>{cashFlow.periods[0]?.label}</span>
                <span>{cashFlow.periods[cashFlow.periods.length - 1]?.label}</span>
              </div>
            </div>

            {/* S-curve milestones */}
            {cashFlow.milestones.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Marcos de Pagamento</h4>
                <div className="space-y-1.5">
                  {cashFlow.milestones.map((ms) => (
                    <div key={ms.number} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 flex items-center justify-center bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                        {ms.number}
                      </span>
                      <span className="flex-1 text-gray-700 truncate">{ms.label}</span>
                      <span className="font-medium text-gray-900 tabular-nums">{formatCost(ms.amount)}</span>
                      <span className="text-xs text-gray-400 tabular-nums">{Math.round(ms.cumulativePercent)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500">
              {cashFlow.contingency.rationale}. Prazo de pagamento: 30 dias.
            </p>
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════
           6. TECHNICAL CALCULATIONS
         ════════════════════════════════════════════════════════════ */}
      {calculations && (
        <Section
          title="Cálculos Técnicos"
          id="calculations"
          icon={<Calculator className="w-5 h-5 text-accent" />}
          open={openSections.has("calculations")}
          onToggle={() => toggleSection("calculations")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-accent-light rounded-lg p-4 border border-accent">
              <h4 className="font-semibold text-accent mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Desempenho Térmico (REH)
              </h4>
              <div className="space-y-1 text-sm text-accent">
                <p>Nic = <strong>{calculations.thermal.Nic.toFixed(1)}</strong> kWh/m&sup2;.ano (max: {calculations.thermal.Ni.toFixed(1)})</p>
                <p>Nvc = <strong>{calculations.thermal.Nvc.toFixed(1)}</strong> kWh/m&sup2;.ano</p>
                <p>Nac = <strong>{calculations.thermal.Nac.toFixed(1)}</strong> kWh/m&sup2;.ano</p>
                <p>Ntc = <strong>{calculations.thermal.Ntc.toFixed(1)}</strong> | Nt = <strong>{calculations.thermal.Nt.toFixed(1)}</strong></p>
                <p>Ntc/Nt = <strong>{calculations.thermal.ratio.toFixed(2)}</strong></p>
                <p>Perdas totais: <strong>{calculations.thermal.totalHeatLoss.toFixed(0)}</strong> W/&deg;C</p>
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

            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <h4 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                <Volume2 className="w-4 h-4" /> Acústica (RRAE)
              </h4>
              <div className="space-y-1 text-sm text-indigo-800">
                <p>D&apos;nT,w exigido: <strong>&ge; {calculations.acoustic.requiredAirborne} dB</strong> {calculations.acoustic.airborneCompliant ? "\u2713" : "\u2717"}</p>
                <p>L&apos;nT,w exigido: <strong>&le; {calculations.acoustic.requiredImpact} dB</strong> {calculations.acoustic.impactCompliant ? "\u2713" : "\u2717"}</p>
                <p>D2m,nT,w exigido: <strong>&ge; {calculations.acoustic.requiredFacade} dB</strong> {calculations.acoustic.facadeCompliant ? "\u2713" : "\u2717"}</p>
                <p>Ruído equipamentos: <strong>&le; {calculations.acoustic.equipmentNoiseLimit} dB(A)</strong></p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                <Plug className="w-4 h-4" /> Instalação Elétrica (RTIEBT)
              </h4>
              <div className="space-y-1 text-sm text-amber-800">
                <p>Carga total: <strong>{calculations.electrical.totalLoad} kVA</strong></p>
                <p>Alimentação: <strong>{calculations.electrical.recommendedSupply === "three_phase" ? "Trifásica" : "Monofásica"}</strong></p>
                <p>Potência contratada: <strong>{calculations.electrical.recommendedPower} kVA</strong></p>
                <p>Disjuntor geral: <strong>{calculations.electrical.mainBreakerAmps} A</strong></p>
                <p>Circuitos min.: <strong>{calculations.electrical.minCircuits}</strong> | RCDs min.: <strong>{calculations.electrical.minRCDCount}</strong></p>
                <p>Secção cabo: <strong>{calculations.electrical.mainCableSection} mm&sup2;</strong></p>
                {calculations.electrical.needsDGEGApproval && (
                  <p className="text-red-700 font-medium">Requer aprovação DGEG (&gt;41.4 kVA)</p>
                )}
              </div>
            </div>

            <div className="bg-sky-50 rounded-lg p-4 border border-sky-200 md:col-span-2">
              <h4 className="font-semibold text-sky-900 mb-2 flex items-center gap-2">
                <Droplets className="w-4 h-4" /> Dimensionamento Hidráulico (RGSPPDADAR)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-sky-800">
                <p>Caudal simultâneo: <strong>{calculations.waterSizing.simultaneousFlow} L/s</strong></p>
                <p>Ramal principal: <strong>&Oslash;{calculations.waterSizing.mainPipeDiameter} mm</strong></p>
                <p>Ramal AQS: <strong>&Oslash;{calculations.waterSizing.hotWaterPipeDiameter} mm</strong></p>
                <p>Drenagem: <strong>&Oslash;{calculations.waterSizing.drainagePipeDiameter} mm</strong></p>
                <p>Consumo diário: <strong>{calculations.waterSizing.dailyConsumption} L/dia</strong></p>
                {calculations.waterSizing.storageTankSize > 0 && (
                  <p>Reservatório: <strong>{calculations.waterSizing.storageTankSize} L</strong></p>
                )}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════
           7. ALL FINDINGS — detailed list with filters
         ════════════════════════════════════════════════════════════ */}
      <Section
        title={`Todas as Constatações (${result.findings.length})`}
        id="findings"
        open={openSections.has("findings")}
        onToggle={() => toggleSection("findings")}
      >
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-400" />
          <button
            type="button"
            onClick={() => setAreaFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              areaFilter === "all" ? "bg-accent text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
            <FindingCard key={finding.id} finding={finding} costEstimate={costLookup.get(finding.id)} projectId={projectId} userRole={userRole} />
          ))}
          {filteredFindings.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">Nenhuma constatação nesta especialidade.</p>
          )}
        </div>
      </Section>

      {/* ════════════════════════════════════════════════════════════
           8. TECHNICAL DETAILS — consolidated coverage & evaluation
         ════════════════════════════════════════════════════════════ */}
      <Section
        title="Detalhes Técnicos"
        id="technical"
        icon={<BarChart3 className="w-5 h-5 text-gray-500" />}
        open={openSections.has("technical")}
        onToggle={() => toggleSection("technical")}
      >
        <div className="space-y-6">
          {/* Data Coverage */}
          {result.contextCoverage && result.contextCoverage.total > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-indigo-600" />
                Cobertura de Dados ({result.contextCoverage.percentage}%)
              </h4>
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1">
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
                <span className={`text-sm font-bold ${
                  result.contextCoverage.percentage >= 60 ? "text-green-600" :
                  result.contextCoverage.percentage >= 30 ? "text-amber-600" : "text-red-600"
                }`}>
                  {result.contextCoverage.populated}/{result.contextCoverage.total}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-accent-light border border-accent rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-accent">{result.contextCoverage.sources.fromForm.length}</p>
                  <p className="text-xs text-accent">Formulário</p>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-teal-700">{result.contextCoverage.sources.fromIfc.length}</p>
                  <p className="text-xs text-teal-600">IFC</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-gray-700">{result.contextCoverage.sources.fromDefaults.length}</p>
                  <p className="text-xs text-gray-600">Predefinições</p>
                </div>
              </div>
              {result.contextCoverage.missingFields.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        {result.contextCoverage.missingFields.length} campos em falta
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {result.contextCoverage.missingFields.slice(0, 8).map(f => (
                          <span key={f} className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">{f}</span>
                        ))}
                        {result.contextCoverage.missingFields.length > 8 && (
                          <span className="text-xs text-amber-500">+{result.contextCoverage.missingFields.length - 8} mais</span>
                        )}
                      </div>
                      {onEditProject && (
                        <button
                          type="button"
                          onClick={() => {
                            const section = findDominantSection(result.contextCoverage!.missingFields);
                            onEditProject(section);
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-xs font-medium"
                        >
                          <ClipboardList className="w-3.5 h-3.5" /> Completar Dados
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rule Evaluation */}
          {result.ruleEvaluation && result.ruleEvaluation.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-600" />
                {(() => {
                  const totalEval = result.ruleEvaluation.reduce((s, m) => s + m.evaluatedRules, 0);
                  const totalAll = result.ruleEvaluation.reduce((s, m) => s + m.totalRules, 0);
                  const pct = totalAll > 0 ? Math.round((totalEval / totalAll) * 100) : 100;
                  return `Avaliação de Regras (${totalEval}/${totalAll} — ${pct}%)`;
                })()}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <th className="pb-2 pr-4">Especialidade</th>
                      <th className="pb-2 pr-2 text-right">Total</th>
                      <th className="pb-2 pr-2 text-right">Avaliadas</th>
                      <th className="pb-2 pr-2 text-right">Ignoradas</th>
                      <th className="pb-2 text-right">Cobertura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...result.ruleEvaluation]
                      .sort((a, b) => b.totalRules - a.totalRules)
                      .map((m) => (
                        <tr key={m.pluginId} className="hover:bg-gray-50 transition-colors">
                          <td className="py-1.5 pr-4 font-medium text-gray-800">{AREA_SHORT_LABELS[m.area] ?? m.pluginName}</td>
                          <td className="py-1.5 pr-2 text-right text-gray-600 tabular-nums">{m.totalRules}</td>
                          <td className="py-1.5 pr-2 text-right text-green-700 tabular-nums font-medium">{m.evaluatedRules}</td>
                          <td className="py-1.5 pr-2 text-right text-amber-600 tabular-nums">{m.skippedRules > 0 ? m.skippedRules : "-"}</td>
                          <td className="py-1.5 text-right">
                            <span className={`inline-block min-w-[3rem] text-center px-2 py-0.5 rounded text-xs font-bold ${
                              m.coveragePercent >= 75 ? "bg-green-100 text-green-700" :
                              m.coveragePercent >= 40 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                            }`}>
                              {m.coveragePercent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Plugin Coverage */}
          {coverageReport && coverageReport.areas.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-600" />
                Cobertura Regulamentar ({coverageReport.overallCoverageScore}%)
              </h4>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-gray-600">
                  {coverageReport.totalPlugins} plugins &middot; {coverageReport.totalRules} regras &middot; {coverageReport.totalRegulations} regulamentos
                </span>
              </div>
              {coverageReport.pendingRegulations.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">
                      {coverageReport.pendingRegulations.length} regulamentos pendentes (sem regras extraídas)
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      {coverageReport.pendingRegulations.slice(0, 5).map(pr => pr.shortRef).join(", ")}
                      {coverageReport.pendingRegulations.length > 5 && <> e mais {coverageReport.pendingRegulations.length - 5}</>}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ════════════════════════════════════════════════════════════
           9. TOOLS — checklists, AI, timeline, version, remediation
         ════════════════════════════════════════════════════════════ */}
      {checklists.length > 0 && (
        <Section
          title={`Checklists (${checklists.length} especialidades)`}
          id="checklists"
          icon={<ClipboardList className="w-5 h-5 text-gray-500" />}
          open={openSections.has("checklists")}
          onToggle={() => toggleSection("checklists")}
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
        </Section>
      )}

      {project && (
        <Section
          title="Assistente IA Regulamentar"
          id="ai-assistant"
          icon={<MessageSquare className="w-5 h-5 text-accent" />}
          open={openSections.has("ai-assistant")}
          onToggle={() => toggleSection("ai-assistant")}
        >
          <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
            <AiAssistant project={project} analysis={result} />
          </Suspense>
        </Section>
      )}

      {project && (
        <Section
          title="Cronograma de Consultas (RJUE)"
          id="consultation-timeline"
          icon={<CalendarClock className="w-5 h-5 text-emerald-600" />}
          open={openSections.has("consultation-timeline")}
          onToggle={() => toggleSection("consultation-timeline")}
        >
          <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
            <ConsultationTimelineView project={project} />
          </Suspense>
        </Section>
      )}

      {project && (
        <Section
          title="Histórico de Versões"
          id="version-diff"
          icon={<GitCompareArrows className="w-5 h-5 text-violet-600" />}
          open={openSections.has("version-diff")}
          onToggle={() => toggleSection("version-diff")}
        >
          <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
            <VersionDiffView project={project} analysis={result} />
          </Suspense>
        </Section>
      )}

      {remediationSummary.totalTasks > 0 && (
        <Section
          title={`Plano de Remediação (${remediationSummary.criticalCount} críticas, ${remediationSummary.warningCount} avisos)`}
          id="remediation-wbs"
          icon={<Wrench className="w-5 h-5 text-orange-600" />}
          open={openSections.has("remediation-wbs")}
          onToggle={() => toggleSection("remediation-wbs")}
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
              <Download className="w-4 h-4" /> Exportar WBS de Remediação
            </button>
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════
           10. LICENSING TIMELINE (Gantt)
         ════════════════════════════════════════════════════════════ */}
      {licensingResult && licensingResult.allTasks.length > 0 && (() => {
        const lr = licensingResult;
        const pw = lr.pathway;
        const LICENSING_PHASE_ORDER = [
          "licensing_preparation", "specialty_projects", "external_consultations",
          "licensing_approval", "construction_authorization", "utilization_authorization",
        ] as const;
        const pathwayLabels: Record<string, { label: string; color: string }> = {
          exempt: { label: "Isento", color: "bg-green-100 text-green-800 border-green-300" },
          comunicacao_previa: { label: "Comunicação Prévia", color: "bg-blue-100 text-blue-800 border-blue-300" },
          licenciamento: { label: "Licenciamento", color: "bg-amber-100 text-amber-800 border-amber-300" },
          public_entity_exempt: { label: "Isento (Entidade Pública)", color: "bg-green-100 text-green-800 border-green-300" },
        };
        const pwStyle = pathwayLabels[pw.pathway] ?? pathwayLabels.licenciamento;

        // Gantt calculations
        const allTasks = lr.preConstructionTasks.concat(lr.postConstructionTasks);
        const tasksByPhase = new Map<string, typeof allTasks>();
        for (const t of allTasks) {
          const list = tasksByPhase.get(t.phase) ?? [];
          list.push(t);
          tasksByPhase.set(t.phase, list);
        }
        const allStarts = allTasks.map(t => new Date(t.startDate).getTime());
        const allFinishes = allTasks.map(t => new Date(t.finishDate).getTime());
        const timelineStart = Math.min(...allStarts);
        const timelineEnd = Math.max(...allFinishes);
        const totalSpan = timelineEnd - timelineStart || 1;

        const activePhases = LICENSING_PHASE_ORDER.filter(p => tasksByPhase.has(p));
        const leafTasks = allTasks.filter(t => !t.isSummary);

        const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });

        return (
          <Section
            title={`Cronograma de Licenciamento (${lr.summary.totalPreConstructionDays}d pré-obra${lr.summary.totalPostConstructionDays > 0 ? ` + ${lr.summary.totalPostConstructionDays}d pós-obra` : ""})`}
            id="licensing-gantt"
            icon={<CalendarClock className="w-5 h-5 text-blue-600" />}
            open={openSections.has("licensing-gantt")}
            onToggle={() => toggleSection("licensing-gantt")}
          >
            <div className="space-y-4">
              {/* Pathway summary */}
              <div className={`rounded-lg border p-3 ${pwStyle.color}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="font-semibold text-sm">{pwStyle.label}</span>
                    <span className="text-xs ml-2 opacity-75">({pw.legalBasis})</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span>{pw.baseApprovalDays}d aprovação</span>
                    <span>{lr.summary.requiredSpecialties} especialidades</span>
                    <span>{lr.summary.requiredConsultations} consultas</span>
                  </div>
                </div>
                <p className="text-xs mt-1 opacity-80">{pw.reason}</p>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                  <p className="text-2xl font-bold text-blue-700">{lr.summary.totalPreConstructionDays}d</p>
                  <p className="text-xs text-blue-600">Pré-construção</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                  <p className="text-2xl font-bold text-purple-700">{lr.summary.totalPostConstructionDays}d</p>
                  <p className="text-xs text-purple-600">Pós-construção</p>
                </div>
                <div className="bg-sky-50 rounded-lg p-3 text-center border border-sky-200">
                  <p className="text-2xl font-bold text-sky-700">{lr.summary.requiredSpecialties}</p>
                  <p className="text-xs text-sky-600">Especialidades</p>
                </div>
                <div className="bg-indigo-50 rounded-lg p-3 text-center border border-indigo-200">
                  <p className="text-2xl font-bold text-indigo-700">{lr.summary.criticalPathEntity}</p>
                  <p className="text-xs text-indigo-600">Caminho crítico</p>
                </div>
              </div>

              {/* Inline Gantt */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  {formatDate(allTasks[0]?.startDate ?? "")} — {formatDate(allTasks[allTasks.length - 1]?.finishDate ?? "")}
                </p>
                <div className="space-y-1">
                  {activePhases.map(phase => {
                    const phaseTasks = tasksByPhase.get(phase) ?? [];
                    const phaseStarts = phaseTasks.map(t => new Date(t.startDate).getTime());
                    const phaseFinishes = phaseTasks.map(t => new Date(t.finishDate).getTime());
                    const pStart = Math.min(...phaseStarts);
                    const pEnd = Math.max(...phaseFinishes);
                    const leftPct = ((pStart - timelineStart) / totalSpan) * 100;
                    const widthPct = Math.max(1, ((pEnd - pStart) / totalSpan) * 100);
                    const durationDays = Math.ceil((pEnd - pStart) / (1000 * 60 * 60 * 24));
                    const taskNames = phaseTasks.filter(t => !t.isSummary).map(t => t.name).join(", ");

                    return (
                      <div key={phase} className="flex items-center gap-1" style={{ height: 22 }}>
                        <div className="flex-shrink-0 text-[10px] text-gray-600 truncate text-right pr-1" style={{ width: 100 }}>
                          {phaseLabel(phase)}
                        </div>
                        <div className="flex-1 relative h-full bg-gray-100 rounded-sm">
                          <div
                            className="absolute top-0.5 rounded-sm transition-all"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              height: 16,
                              backgroundColor: phaseColor(phase),
                              minWidth: 4,
                            }}
                            title={`${phaseLabel(phase)}: ${formatDate(new Date(pStart).toISOString())} — ${formatDate(new Date(pEnd).toISOString())}\n${taskNames}`}
                          >
                            {widthPct > 12 && (
                              <span className="text-[8px] text-white px-1 truncate block leading-4">{durationDays}d</span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-[9px] text-gray-400 w-6 text-right">{durationDays}d</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Task detail table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="py-1.5 px-2 text-left font-medium">WBS</th>
                      <th className="py-1.5 px-2 text-left font-medium">Tarefa</th>
                      <th className="py-1.5 px-2 text-right font-medium">Duração</th>
                      <th className="py-1.5 px-2 text-left font-medium">Início</th>
                      <th className="py-1.5 px-2 text-left font-medium">Fim</th>
                      <th className="py-1.5 px-2 text-left font-medium hidden md:table-cell">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leafTasks.map(task => (
                      <tr key={task.uid} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-mono text-gray-400">{task.wbs}</td>
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: phaseColor(task.phase) }} />
                            <span className="text-gray-800">{task.name}</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-right text-gray-600">{task.durationDays}d</td>
                        <td className="py-1.5 px-2 text-gray-500">{formatDate(task.startDate)}</td>
                        <td className="py-1.5 px-2 text-gray-500">{formatDate(task.finishDate)}</td>
                        <td className="py-1.5 px-2 text-gray-400 hidden md:table-cell max-w-[200px] truncate">{task.notes ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Export button */}
              <button
                onClick={() => {
                  const json = JSON.stringify(lr, null, 2);
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `licensing-timeline-${result.projectName.replace(/\s+/g, "-")}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Download className="w-4 h-4" /> Exportar Cronograma de Licenciamento
              </button>
            </div>
          </Section>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════
           11. EXPORT BAR
         ════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={onReset}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
          >
            Nova Análise
          </button>

          <div className="h-6 w-px bg-gray-200" />

          {/* Pipeline outputs */}
          {budgetExcel && (
            <button
              onClick={() => {
                const blob = new Blob([budgetExcel], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `orcamento_${result.projectName || "projeto"}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" /> Orçamento
            </button>
          )}
          {msProjectXml && (
            <button
              onClick={() => {
                const blob = new Blob([msProjectXml], { type: "application/xml" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `cronograma_${result.projectName || "projeto"}.xml`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Cronograma
            </button>
          )}
          {ccpmGanttExcel && (
            <button
              onClick={() => {
                const blob = new Blob([ccpmGanttExcel], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `gantt_ccpm_${result.projectName || "projeto"}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#202A30] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" /> {lang === "pt" ? "Gantt CCPM" : "CCPM Gantt"}
            </button>
          )}
          {complianceExcel && (
            <button
              onClick={() => {
                const blob = new Blob([complianceExcel], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `conformidade_${result.projectName || "projeto"}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" /> Conformidade
            </button>
          )}

          {/* PDF export with options */}
          <div className="relative">
            <button
              onClick={() => setExportMenu(exportMenu === "pdf" ? null : "pdf")}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isExporting ? t.loading : t.exportPDF}
              <ChevronDown className="w-3 h-3" />
            </button>
            {exportMenu === "pdf" && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-[220px]">
                <p className="text-xs font-semibold text-gray-500 mb-2">Seccoes do PDF</p>
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

          {/* Excel export with options */}
          <div className="relative">
            <button
              onClick={() => setExportMenu(exportMenu === "excel" ? null : "excel")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t.exportExcel}
              <ChevronDown className="w-3 h-3" />
            </button>
            {exportMenu === "excel" && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-[220px]">
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Printer className="w-4 h-4" /> {t.printReport}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-500" : "text-red-500";
  const bgColor = score >= 80 ? "bg-green-50" : score >= 60 ? "bg-amber-50" : "bg-red-50";
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

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const bgMap: Record<string, string> = { red: "bg-red-50", amber: "bg-amber-50", green: "bg-green-50" };
  return (
    <div className={`${bgMap[color] ?? "bg-gray-50"} rounded-lg p-4 text-center`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

/** Compact tile for the specialty grid */
function SpecialtyTile({ summary, isNA, findings, onClick, onAddData }: {
  summary: RegulationSummary;
  isNA: boolean;
  findings?: { critical: number; warning: number; info: number; pass: number };
  onClick: () => void;
  onAddData?: () => void;
}) {
  const label = AREA_SHORT_LABELS[summary.area] ?? summary.area;
  const areaIcon = AREA_ICONS[summary.area];

  if (isNA) {
    return (
      <button
        type="button"
        onClick={onAddData}
        disabled={!onAddData}
        className={`p-2.5 rounded-lg bg-gray-50 border border-dashed border-gray-300 text-center transition-all ${onAddData ? "hover:border-accent hover:bg-accent-light cursor-pointer group" : "opacity-60"}`}
      >
        <div className="flex justify-center text-gray-400 mb-1 group-hover:text-accent">{areaIcon ?? <Minus className="w-4 h-4" />}</div>
        <p className="text-xs font-medium text-gray-400 truncate group-hover:text-accent">{label}</p>
        <p className="text-[10px] text-gray-400 mt-0.5 group-hover:text-accent-hover">{onAddData ? "Adicionar dados" : "sem dados"}</p>
      </button>
    );
  }

  const hasCritical = (findings?.critical ?? 0) > 0;
  const hasWarning = (findings?.warning ?? 0) > 0;

  const bgClass = hasCritical
    ? "bg-red-50 border-red-200 hover:border-red-300"
    : hasWarning
      ? "bg-amber-50 border-amber-200 hover:border-amber-300"
      : "bg-green-50 border-green-200 hover:border-green-300";

  const iconColor = hasCritical ? "text-red-500" : hasWarning ? "text-amber-500" : "text-green-500";
  const statusIcon = hasCritical
    ? <XCircle className={`w-4 h-4 ${iconColor}`} />
    : hasWarning
      ? <AlertTriangle className={`w-4 h-4 ${iconColor}`} />
      : <CheckCircle className={`w-4 h-4 ${iconColor}`} />;

  const count = (findings?.critical ?? 0) + (findings?.warning ?? 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-2.5 rounded-lg border text-center transition-all hover:shadow-sm cursor-pointer ${bgClass}`}
      title={`${label}: ${summary.score}% — ${findings?.critical ?? 0} críticas, ${findings?.warning ?? 0} avisos`}
    >
      <div className="flex justify-center mb-1">{statusIcon}</div>
      <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
      {count > 0 ? (
        <p className="text-[10px] font-bold text-gray-600 mt-0.5">{count} {count === 1 ? "problema" : "problemas"}</p>
      ) : (
        <p className="text-[10px] text-gray-500 mt-0.5">{summary.score}%</p>
      )}
    </button>
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

function FindingCard({ finding, costEstimate, projectId, userRole }: {
  finding: Finding;
  costEstimate?: { minCost: number; maxCost: number };
  projectId?: string;
  userRole?: import("@/lib/collaboration").ProjectRole | null;
}) {
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
          {/* Regulation headline — prominent */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{finding.regulation}</span>
            {finding.article && (
              <span className="text-xs font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{finding.article}</span>
            )}
            <span className="text-xs text-gray-400">|</span>
            <span className="text-xs text-gray-500">{AREA_SHORT_LABELS[finding.area] ?? finding.area}</span>
            {source && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${getSourceBadgeClass(source)}`}>{source}</span>
            )}
            {projectId && canPerformAction(userRole ?? null, "comment") && (
              <CommentAnchor projectId={projectId} targetType="finding" targetId={finding.id} commentCount={0} onCommentAdded={() => {}} />
            )}
          </div>
          <p className="text-sm text-gray-800 mt-1.5">{finding.description}</p>
          {(finding.currentValue || finding.requiredValue) && (
            <div className="flex gap-4 mt-2 text-xs">
              {finding.currentValue && <span className="text-gray-600">Atual: <strong>{finding.currentValue}</strong></span>}
              {finding.requiredValue && <span className="text-gray-600">Exigido: <strong>{finding.requiredValue}</strong></span>}
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
  const impactColors = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700", low: "bg-accent-medium text-accent" };
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
            <p className="text-xs text-green-700 mt-2 font-medium">Poupança estimada: {recommendation.estimatedSavings}</p>
          )}
          {recommendation.regulatoryBasis && (
            <p className="text-xs text-gray-500 mt-1">Base regulamentar: {recommendation.regulatoryBasis}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Collapsible section — supports independent open/close */
function Section({ title, id, open, onToggle, children, icon }: {
  title: string;
  id: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function PriceLineItemCard({ lineItem }: { lineItem: CostLineItem }) {
  const { workItem: wi, quantity, quantitySource, adjustedCost, breakdown } = lineItem;
  const confidenceColors = { high: "bg-green-100 text-green-700", medium: "bg-amber-100 text-amber-700", low: "bg-gray-100 text-gray-600" };
  const confidenceLabels = { high: "Alta", medium: "Media", low: "Baixa" };
  const sourceLabels = { measured: "medido", estimated: "estimado", minimum: "minimo" };
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
          <p className="text-xs text-gray-500">{quantity.toFixed(1)} {wi.unit} x {formatCost(wi.unitCost)}/{wi.unit}</p>
          <p className="text-xs text-gray-400">({sourceLabels[quantitySource]})</p>
        </div>
      </div>
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

const DONUT_COLORS = [
  "#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

/** CSS conic-gradient donut chart for cost breakdown by specialty */
function CostDonut({ areas }: { areas: { area: string; areaName: string; maxCost: number }[] }) {
  const total = areas.reduce((s, a) => s + a.maxCost, 0);
  if (total === 0) return null;

  // Build conic-gradient stops
  const segments: { color: string; pct: number; label: string }[] = [];
  let cumulative = 0;
  for (let i = 0; i < areas.length; i++) {
    const pct = (areas[i].maxCost / total) * 100;
    segments.push({ color: DONUT_COLORS[i % DONUT_COLORS.length], pct, label: areas[i].areaName });
    cumulative += pct;
  }

  // Build CSS conic-gradient
  let gradientParts: string[] = [];
  let angle = 0;
  for (const seg of segments) {
    const end = angle + seg.pct;
    gradientParts.push(`${seg.color} ${angle.toFixed(1)}% ${end.toFixed(1)}%`);
    angle = end;
  }
  const gradient = `conic-gradient(${gradientParts.join(", ")})`;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Donut */}
      <div
        className="w-28 h-28 rounded-full relative"
        style={{ background: gradient }}
      >
        <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-xs font-bold text-gray-700">{areas.length}</p>
            <p className="text-[9px] text-gray-500">áreas</p>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="grid grid-cols-1 gap-0.5">
        {segments.slice(0, 5).map((seg, i) => (
          <div key={areas[i].area} className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="truncate max-w-[100px]">{seg.label}</span>
            <span className="text-gray-400 ml-auto">{seg.pct.toFixed(0)}%</span>
          </div>
        ))}
        {segments.length > 5 && (
          <p className="text-[9px] text-gray-400">+{segments.length - 5} mais</p>
        )}
      </div>
    </div>
  );
}

function sortFindings(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Map regulation areas to ProjectWizard form section IDs */
const AREA_TO_FORM_SECTION: Record<string, string> = {
  architecture: "architecture",
  structural: "structural",
  fire_safety: "fire",
  hvac: "avac",
  water_drainage: "water",
  gas: "gas",
  electrical: "electrical",
  telecommunications: "telecom",
  thermal: "envelope",
  acoustic: "acoustic",
  accessibility: "accessibility",
  energy: "envelope",
  elevators: "elevators",
  licensing: "licensing",
  waste: "waste",
  municipal: "local",
  drawings: "drawings",
  general: "general",
};

/** Short labels for area filter chips and tiles */
const AREA_SHORT_LABELS: Record<string, string> = {
  architecture: "Arquitetura",
  structural: "Estruturas",
  fire_safety: "Incêndio",
  hvac: "AVAC",
  water_drainage: "Águas",
  gas: "Gás",
  electrical: "Elétrico",
  telecommunications: "ITED/ITUR",
  thermal: "Térmico",
  acoustic: "Acústica",
  accessibility: "Acessibilidade",
  energy: "Energia",
  elevators: "Ascensores",
  licensing: "Licenciamento",
  waste: "Resíduos",
  municipal: "Municipal",
  drawings: "Desenhos",
  general: "Geral",
};

/** Area icons for specialty tiles */
const AREA_ICONS: Record<string, React.ReactNode> = {
  architecture: <Ruler className="w-4 h-4 text-teal-600" />,
  structural: <Columns3 className="w-4 h-4 text-stone-600" />,
  fire_safety: <Flame className="w-4 h-4 text-orange-500" />,
  hvac: <Wind className="w-4 h-4 text-cyan-600" />,
  water_drainage: <Droplets className="w-4 h-4 text-sky-500" />,
  gas: <Fuel className="w-4 h-4 text-red-500" />,
  electrical: <Plug className="w-4 h-4 text-amber-600" />,
  telecommunications: <Wifi className="w-4 h-4 text-cyan-500" />,
  thermal: <Zap className="w-4 h-4 text-accent" />,
  acoustic: <Volume2 className="w-4 h-4 text-indigo-500" />,
  accessibility: <Accessibility className="w-4 h-4 text-purple-500" />,
  energy: <Lightbulb className="w-4 h-4 text-yellow-500" />,
  elevators: <ArrowUpDown className="w-4 h-4 text-violet-500" />,
  licensing: <FileText className="w-4 h-4 text-emerald-600" />,
  waste: <Recycle className="w-4 h-4 text-lime-600" />,
  municipal: <MapPin className="w-4 h-4 text-rose-500" />,
  drawings: <PenTool className="w-4 h-4 text-pink-500" />,
  general: <Building className="w-4 h-4 text-gray-500" />,
};

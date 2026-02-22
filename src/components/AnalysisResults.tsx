"use client";

import type { AnalysisResult, Finding, Severity } from "@/lib/types";
import type { AllCalculations } from "@/lib/calculations";
import type { BuildingProject, RegulationArea } from "@/lib/types";
import { Lightbulb } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { estimateCosts, formatCost } from "@/lib/cost-estimation";
import type { SpecialtyAnalysisResult } from "@/lib/ifc-specialty-analyzer";
import { generateChecklists } from "@/lib/checklist-generator";
import { generateRemediationSummary, findingsToWbs } from "@/lib/findings-to-wbs";
import { generateLicensingPhases, type LicensingPhasesResult } from "@/lib/licensing-phases";
import { generateCoverageReport } from "@/lib/plugins/coverage";
import { buildAnalysisHierarchy } from "@/lib/analysis-hierarchy";
import { AREA_SHORT_LABELS } from "@/lib/area-metadata";

import {
  HeroSummary,
  SpecialtyGrid,
  ActionItemsPanel,
  FindingsExplorer,
  CostEstimationPanel,
  CashFlowPanel,
  TechnicalDetailsPanel,
  LicensingGantt,
  ExportBar,
  Section,
  RecommendationCard,
  ChecklistsSection,
  AiAssistantSection,
  ConsultationTimelineSection,
  VersionDiffSection,
  RemediationSection,
} from "./analysis";

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

function sortFindings(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

export default function AnalysisResults({ result, calculations, project, onReset, onEditProject, budgetExcel, msProjectXml, ccpmGanttExcel, complianceExcel, projectId, userRole, ifcAnalyses, cashFlow }: AnalysisResultsProps) {
  const { t } = useI18n();

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

  // Hierarchical grouping: Domain → Specialty → Regulation → Finding
  const hierarchy = useMemo(() => buildAnalysisHierarchy(result.findings), [result.findings]);

  // Hierarchy for action items only (critical + warning)
  const actionHierarchy = useMemo(
    () => buildAnalysisHierarchy(result.findings.filter(f => f.severity === "critical" || f.severity === "warning")),
    [result.findings],
  );

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

  // ── Narrative summary ──────────────────────────────────────
  const narrative = useMemo(() => {
    const parts: string[] = [];
    parts.push(`O edifício está ${result.overallScore}% conforme com a regulamentação portuguesa.`);

    if (actionItems.length > 0) {
      const byReg = new Map<string, { areas: Set<string>; count: number }>();
      for (const f of actionItems) {
        const key = f.regulation;
        const existing = byReg.get(key);
        if (existing) { existing.count++; existing.areas.add(f.area); }
        else byReg.set(key, { areas: new Set([f.area]), count: 1 });
      }

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

    if (naAreas.size > 0) {
      parts.push(`${naAreas.size} ${naAreas.size === 1 ? "especialidade não foi analisada" : "especialidades não foram analisadas"} por falta de dados.`);
    }

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

      {/* 1. HERO SUMMARY */}
      <HeroSummary
        result={result}
        narrative={narrative}
        criticalCount={criticalCount}
        warningCount={warningCount}
        passCount={passCount}
        isExporting={isExporting}
        onQuickPDF={handleQuickPDF}
      />

      {/* 2. SPECIALTY GRID */}
      <SpecialtyGrid
        regulationSummary={result.regulationSummary}
        naAreas={naAreas}
        findingsByArea={findingsByArea}
        onDrillDown={drillDownToArea}
        onEditProject={onEditProject}
      />

      {/* 3. ACTION ITEMS — hierarchical: Domain → Specialty → Regulation */}
      <ActionItemsPanel
        actionItems={actionItems}
        actionHierarchy={actionHierarchy}
        naAreas={naAreas}
        costLookup={costLookup}
        projectId={projectId}
        userRole={userRole}
      />

      {/* 4. RECOMMENDATIONS */}
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

      {/* 5. COST ESTIMATION */}
      {hasCostData && (
        <CostEstimationPanel
          costSummary={costSummary}
          open={openSections.has("costs")}
          onToggle={() => toggleSection("costs")}
        />
      )}

      {/* 5b. CASH FLOW */}
      {cashFlow && cashFlow.periods.length > 0 && (
        <CashFlowPanel
          cashFlow={cashFlow}
          open={openSections.has("cashflow")}
          onToggle={() => toggleSection("cashflow")}
        />
      )}

      {/* 6. TECHNICAL DETAILS */}
      <TechnicalDetailsPanel
        result={result}
        calculations={calculations}
        coverageReport={coverageReport}
        open={openSections.has("technical")}
        onToggle={() => toggleSection("technical")}
        onEditProject={onEditProject}
      />

      {/* 7. ALL FINDINGS — hierarchical view */}
      <FindingsExplorer
        findings={result.findings}
        filteredFindings={filteredFindings}
        hierarchy={hierarchy}
        areasWithFindings={areasWithFindings}
        areaFilter={areaFilter}
        setAreaFilter={setAreaFilter}
        costLookup={costLookup}
        open={openSections.has("findings")}
        onToggle={() => toggleSection("findings")}
        projectId={projectId}
        userRole={userRole}
      />

      {/* 8. TOOLS — checklists, AI, timeline, version, remediation */}
      <ChecklistsSection
        checklists={checklists}
        open={openSections.has("checklists")}
        onToggle={() => toggleSection("checklists")}
      />

      {project && (
        <AiAssistantSection
          project={project}
          result={result}
          open={openSections.has("ai-assistant")}
          onToggle={() => toggleSection("ai-assistant")}
        />
      )}

      {project && (
        <ConsultationTimelineSection
          project={project}
          open={openSections.has("consultation-timeline")}
          onToggle={() => toggleSection("consultation-timeline")}
        />
      )}

      {project && (
        <VersionDiffSection
          project={project}
          result={result}
          open={openSections.has("version-diff")}
          onToggle={() => toggleSection("version-diff")}
        />
      )}

      <RemediationSection
        findings={result.findings}
        result={result}
        remediationSummary={remediationSummary}
        open={openSections.has("remediation-wbs")}
        onToggle={() => toggleSection("remediation-wbs")}
      />

      {/* 9. LICENSING TIMELINE */}
      {licensingResult && licensingResult.allTasks.length > 0 && (
        <LicensingGantt
          licensingResult={licensingResult}
          projectName={result.projectName}
          open={openSections.has("licensing-gantt")}
          onToggle={() => toggleSection("licensing-gantt")}
        />
      )}

      {/* 10. EXPORT BAR */}
      <ExportBar
        result={result}
        isExporting={isExporting}
        setIsExporting={setIsExporting}
        budgetExcel={budgetExcel}
        msProjectXml={msProjectXml}
        ccpmGanttExcel={ccpmGanttExcel}
        complianceExcel={complianceExcel}
        onReset={onReset}
      />
    </div>
  );
}

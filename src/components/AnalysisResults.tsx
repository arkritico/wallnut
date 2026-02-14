"use client";

import type { AnalysisResult, Finding, Recommendation, RegulationSummary, Severity } from "@/lib/types";
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
} from "lucide-react";
import { useState } from "react";

interface AnalysisResultsProps {
  result: AnalysisResult;
  onReset: () => void;
}

export default function AnalysisResults({ result, onReset }: AnalysisResultsProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>("summary");

  const criticalCount = result.findings.filter(f => f.severity === "critical").length;
  const warningCount = result.findings.filter(f => f.severity === "warning").length;
  const passCount = result.findings.filter(f => f.severity === "pass").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{result.projectName}</h2>
            <p className="text-gray-500 mt-1">Relatório de Análise Regulamentar</p>
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
            label="Não conformidades"
            value={criticalCount}
            color="red"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
            label="Avisos"
            value={warningCount}
            color="amber"
          />
          <StatCard
            icon={<CheckCircle className="w-5 h-5 text-green-500" />}
            label="Conforme"
            value={passCount}
            color="green"
          />
        </div>
      </div>

      {/* Regulation Summary */}
      <CollapsibleSection
        title="Resumo por Regulamento"
        id="summary"
        expanded={expandedSection}
        onToggle={setExpandedSection}
      >
        <div className="space-y-3">
          {result.regulationSummary.map(reg => (
            <RegulationCard key={reg.area} summary={reg} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Findings */}
      <CollapsibleSection
        title={`Constatações (${result.findings.length})`}
        id="findings"
        expanded={expandedSection}
        onToggle={setExpandedSection}
      >
        <div className="space-y-3">
          {/* Show critical first, then warnings, then passes */}
          {sortFindings(result.findings).map(finding => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Recommendations */}
      <CollapsibleSection
        title={`Recomendações de Melhoria (${result.recommendations.length})`}
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

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onReset}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Nova Análise
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

function RegulationCard({ summary }: { summary: RegulationSummary }) {
  const statusConfig = {
    compliant: { bg: "bg-green-50 border-green-200", icon: <CheckCircle className="w-5 h-5 text-green-500" />, label: "Conforme" },
    partially_compliant: { bg: "bg-amber-50 border-amber-200", icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, label: "Parcialmente Conforme" },
    non_compliant: { bg: "bg-red-50 border-red-200", icon: <XCircle className="w-5 h-5 text-red-500" />, label: "Não Conforme" },
  };

  const areaIcons: Record<string, React.ReactNode> = {
    thermal: <Zap className="w-5 h-5 text-blue-500" />,
    fire_safety: <Flame className="w-5 h-5 text-orange-500" />,
    accessibility: <Accessibility className="w-5 h-5 text-purple-500" />,
    energy: <Lightbulb className="w-5 h-5 text-yellow-500" />,
    general: <Building className="w-5 h-5 text-gray-500" />,
  };

  const config = statusConfig[summary.status];

  return (
    <div className={`flex items-center gap-4 p-4 rounded-lg border ${config.bg}`}>
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
      <div className="text-right">
        <div className="text-lg font-bold text-gray-800">{summary.score}%</div>
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const severityConfig: Record<Severity, { bg: string; icon: React.ReactNode; label: string }> = {
    critical: { bg: "bg-red-50 border-red-200", icon: <XCircle className="w-5 h-5 text-red-500 shrink-0" />, label: "Crítico" },
    warning: { bg: "bg-amber-50 border-amber-200", icon: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />, label: "Aviso" },
    info: { bg: "bg-blue-50 border-blue-200", icon: <Info className="w-5 h-5 text-blue-500 shrink-0" />, label: "Info" },
    pass: { bg: "bg-green-50 border-green-200", icon: <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />, label: "Conforme" },
  };

  const config = severityConfig[finding.severity];

  return (
    <div className={`p-4 rounded-lg border ${config.bg}`}>
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
              {finding.regulation}
            </span>
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
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const impactColors = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-blue-100 text-blue-700",
  };
  const impactLabels = { high: "Alto Impacto", medium: "Impacto Médio", low: "Baixo Impacto" };

  return (
    <div className="p-4 rounded-lg border border-blue-200 bg-blue-50">
      <div className="flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
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
}: {
  title: string;
  id: string;
  expanded: string | null;
  onToggle: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const isExpanded = expanded === id;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(isExpanded ? null : id)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
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

function sortFindings(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

import type { Finding, Severity } from "@/lib/types";
import { XCircle, AlertTriangle, Info, CheckCircle, Euro } from "lucide-react";
import { AREA_SHORT_LABELS } from "@/lib/area-metadata";
import { formatCost } from "@/lib/cost-estimation";
import CommentAnchor from "@/components/CommentAnchor";
import { canPerformAction } from "@/lib/collaboration";

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

export default function FindingCard({ finding, costEstimate, projectId, userRole }: {
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

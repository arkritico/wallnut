import type { RegulationSummary, RegulationArea } from "@/lib/types";
import { XCircle, AlertTriangle, CheckCircle, Minus } from "lucide-react";
import { AREA_SHORT_LABELS, AREA_TO_FORM_SECTION } from "@/lib/area-metadata";
import { AREA_ICONS } from "./area-icons";

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

export default function SpecialtyGrid({ regulationSummary, naAreas, findingsByArea, onDrillDown, onEditProject }: {
  regulationSummary: RegulationSummary[];
  naAreas: Set<string>;
  findingsByArea: Map<RegulationArea, { critical: number; warning: number; info: number; pass: number }>;
  onDrillDown: (area: RegulationArea) => void;
  onEditProject?: (targetSection?: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Especialidades</h3>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {regulationSummary.map(reg => (
          <SpecialtyTile
            key={reg.area}
            summary={reg}
            isNA={naAreas.has(reg.area)}
            findings={findingsByArea.get(reg.area as RegulationArea)}
            onClick={() => onDrillDown(reg.area as RegulationArea)}
            onAddData={onEditProject ? () => onEditProject(AREA_TO_FORM_SECTION[reg.area]) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

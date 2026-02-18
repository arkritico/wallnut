"use client";

import type { ElementTaskLink } from "@/lib/element-task-mapper";
import type { ScheduleTask } from "@/lib/wbs-types";
import { phaseColor, phaseLabel } from "@/lib/phase-colors";
import { X } from "lucide-react";

export interface ElementInfoPanelProps {
  link: ElementTaskLink | null;
  task: ScheduleTask | null;
  onClose: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  keynote: "Keynote",
  type_storey: "Tipo+Piso",
  system: "Sistema",
  fallback: "Genérico",
};

function formatDatePT(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function confidenceColor(c: number): string {
  if (c >= 70) return "#16a34a";
  if (c >= 40) return "#f59e0b";
  return "#ef4444";
}

export default function ElementInfoPanel({
  link,
  task,
  onClose,
}: ElementInfoPanelProps) {
  if (!link) return null;

  const color = phaseColor(link.phase);

  return (
    <div className="absolute top-2 right-2 z-10 w-56 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-semibold text-gray-800 truncate">
            {phaseLabel(link.phase)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Entity type + storey */}
        <div className="flex items-center gap-1.5 text-gray-500">
          <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[9px] font-mono">
            {link.entityType.replace("Ifc", "")}
          </span>
          {link.storey && (
            <span className="text-[9px]">{link.storey}</span>
          )}
        </div>

        {/* Task name */}
        {task && (
          <p className="text-gray-700 font-medium leading-tight">
            {task.name}
          </p>
        )}

        {/* Dates */}
        {task && (
          <div className="text-[10px] text-gray-500">
            {formatDatePT(task.startDate)} &rarr; {formatDatePT(task.finishDate)}
          </div>
        )}

        {/* Cost */}
        {task && task.cost > 0 && (
          <div className="text-[10px] text-gray-600">
            {task.cost.toLocaleString("pt-PT")} &euro;
          </div>
        )}

        {/* Confidence bar */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${link.confidence}%`,
                backgroundColor: confidenceColor(link.confidence),
              }}
            />
          </div>
          <span
            className="text-[9px] font-medium tabular-nums"
            style={{ color: confidenceColor(link.confidence) }}
          >
            {link.confidence}%
          </span>
        </div>

        {/* Method badge */}
        <div className="flex items-center gap-1">
          <span className="px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-500">
            {METHOD_LABELS[link.method] ?? link.method}
          </span>
        </div>
      </div>
    </div>
  );
}

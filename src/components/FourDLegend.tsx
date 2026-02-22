"use client";

import { useState } from "react";
import type { ConstructionPhase } from "@/lib/wbs-types";
import { phaseColor, phaseLabel } from "@/lib/phase-colors";

export interface LegendPhase {
  phase: ConstructionPhase;
  completedCount: number;
  inProgressCount: number;
  active: boolean;
}

export interface FourDLegendProps {
  phases: LegendPhase[];
  /** Currently isolated phase (only this phase shown) */
  isolatedPhase?: ConstructionPhase | null;
  /** Click a phase to isolate it; click again to show all */
  onPhaseClick?: (phase: ConstructionPhase | null) => void;
}

export default function FourDLegend({ phases, isolatedPhase, onPhaseClick }: FourDLegendProps) {
  const [open, setOpen] = useState(false);

  if (phases.length === 0) return null;

  function handlePhaseClick(phase: ConstructionPhase) {
    if (!onPhaseClick) return;
    // Toggle: click same phase → clear isolation; click different → isolate
    onPhaseClick(isolatedPhase === phase ? null : phase);
  }

  return (
    <div className="absolute bottom-14 sm:bottom-2 left-2 z-10">
      {open ? (
        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-2 max-h-60 overflow-y-auto w-56">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">
              Legenda
            </span>
            <div className="flex items-center gap-1">
              {isolatedPhase && (
                <button
                  onClick={() => onPhaseClick?.(null)}
                  className="text-[9px] text-accent hover:text-accent-hover font-medium"
                >
                  Mostrar tudo
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xs leading-none ml-1"
              >
                &times;
              </button>
            </div>
          </div>
          {phases.map(({ phase, completedCount, inProgressCount, active }) => {
            const isIsolated = isolatedPhase === phase;
            const isDimmed = isolatedPhase != null && !isIsolated;
            return (
              <div
                key={phase}
                className={`flex items-center gap-1.5 py-0.5 rounded cursor-pointer hover:bg-gray-100 transition-colors ${
                  isDimmed ? "opacity-30" : active ? "" : "opacity-40"
                } ${isIsolated ? "bg-gray-100" : ""}`}
                onClick={() => handlePhaseClick(phase)}
                title={`Clique para ${isIsolated ? "mostrar tudo" : "isolar"} ${phaseLabel(phase)}`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isIsolated ? "ring-2 ring-accent ring-offset-1" : ""}`}
                  style={{ backgroundColor: phaseColor(phase) }}
                />
                <span className="text-[10px] text-gray-700 truncate flex-1">
                  {phaseLabel(phase)}
                </span>
                <span className="text-[9px] tabular-nums flex items-center gap-1">
                  {completedCount > 0 && (
                    <span className="text-green-600">{completedCount}</span>
                  )}
                  {inProgressCount > 0 && (
                    <span className="text-amber-500">{inProgressCount}</span>
                  )}
                  {completedCount === 0 && inProgressCount === 0 && (
                    <span className="text-gray-400">0</span>
                  )}
                </span>
              </div>
            );
          })}
          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-100 text-[9px] text-gray-400">
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
              concluído
            </span>
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              em curso
            </span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 sm:px-2.5 py-1.5 sm:py-1 bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-gray-200 text-[11px] sm:text-[10px] font-medium text-gray-600 hover:bg-white transition-colors min-h-[36px] sm:min-h-0"
        >
          <span className="flex gap-0.5">
            {phases
              .filter((p) => p.active)
              .slice(0, 4)
              .map((p) => (
                <span
                  key={p.phase}
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: phaseColor(p.phase) }}
                />
              ))}
          </span>
          {isolatedPhase ? phaseLabel(isolatedPhase) : "Legenda"}
        </button>
      )}
    </div>
  );
}

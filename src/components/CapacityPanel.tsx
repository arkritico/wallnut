"use client";

import { useState, useCallback } from "react";
import {
  X,
  AlertTriangle,
  Lightbulb,
  ArrowRightLeft,
  Scissors,
  ListOrdered,
  Users,
  Settings2,
  Loader2,
} from "lucide-react";
import type { ProjectSchedule } from "@/lib/wbs-types";
import type { ProjectResources } from "@/lib/resource-aggregator";
import {
  optimizeSchedule,
  getDefaultConstraints,
  type SiteCapacityConstraints,
  type OptimizedSchedule,
  type Bottleneck,
} from "@/lib/site-capacity-optimizer";

// ============================================================
// Types
// ============================================================

export interface CapacityPanelProps {
  schedule: ProjectSchedule;
  onOptimized?: (result: OptimizedSchedule) => void;
  onClose: () => void;
}

// Minimal ProjectResources for when no full resource data is available
function makeMinimalResources(): ProjectResources {
  return {
    materials: [],
    labor: [],
    equipment: [],
    totalMaterialCost: 0,
    totalLaborCost: 0,
    totalLaborHours: 0,
    totalEquipmentCost: 0,
    grandTotal: 0,
  };
}

const SUGGESTION_ICONS: Record<string, typeof ArrowRightLeft> = {
  shift: ArrowRightLeft,
  split: Scissors,
  sequence: ListOrdered,
  resource: Users,
};

const SEVERITY_COLORS: Record<Bottleneck["severity"], string> = {
  high: "bg-red-50 border-red-200 text-red-700",
  medium: "bg-amber-50 border-amber-200 text-amber-700",
  low: "bg-yellow-50 border-yellow-200 text-yellow-700",
};

// ============================================================
// Component
// ============================================================

export default function CapacityPanel({
  schedule,
  onOptimized,
  onClose,
}: CapacityPanelProps) {
  const defaults = getDefaultConstraints();

  // Constraint controls
  const [maxWorkers, setMaxWorkers] = useState(defaults.maxWorkersPerFloor);
  const [craneLimit, setCraneLimit] = useState(
    defaults.equipmentConflicts.find((e) => e.equipment === "crane")?.maxSimultaneous ?? 1,
  );
  const [pumpLimit, setPumpLimit] = useState(
    defaults.equipmentConflicts.find((e) => e.equipment === "concrete_pump")?.maxSimultaneous ?? 1,
  );
  const [scaffoldLimit, setScaffoldLimit] = useState(
    defaults.equipmentConflicts.find((e) => e.equipment === "scaffolding")?.maxSimultaneous ?? 2,
  );

  // Results
  const [result, setResult] = useState<OptimizedSchedule | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimize = useCallback(() => {
    setIsOptimizing(true);
    // Run in next tick to allow spinner to render
    requestAnimationFrame(() => {
      const constraints: SiteCapacityConstraints = {
        ...defaults,
        maxWorkersPerFloor: maxWorkers,
        equipmentConflicts: [
          { equipment: "crane", maxSimultaneous: craneLimit },
          { equipment: "concrete_pump", maxSimultaneous: pumpLimit },
          { equipment: "scaffolding", maxSimultaneous: scaffoldLimit },
        ],
      };
      const optimized = optimizeSchedule(schedule, makeMinimalResources(), constraints);
      setResult(optimized);
      setIsOptimizing(false);
    });
  }, [schedule, maxWorkers, craneLimit, pumpLimit, scaffoldLimit, defaults]);

  const handleApply = useCallback(() => {
    if (result && onOptimized) {
      onOptimized(result);
    }
  }, [result, onOptimized]);

  return (
    <div className="absolute top-12 left-0 sm:left-3 bg-white rounded-lg shadow-lg border border-gray-200 w-full sm:w-80 z-20 max-h-[50vh] sm:max-h-[calc(100%-64px)] flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-semibold text-gray-700">Capacidade do Estaleiro</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      {/* Constraint controls */}
      <div className="px-3 py-2 space-y-3 border-b border-gray-100">
        {/* Max workers per floor */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-medium text-gray-600">
              Trabalhadores/piso
            </label>
            <span className="text-[10px] font-semibold text-accent">{maxWorkers}</span>
          </div>
          <input
            type="range"
            min={5}
            max={50}
            step={1}
            value={maxWorkers}
            onChange={(e) => setMaxWorkers(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[8px] text-gray-400">
            <span>5</span>
            <span>50</span>
          </div>
        </div>

        {/* Equipment limits */}
        <div>
          <p className="text-[10px] font-medium text-gray-600 mb-1">Equipamento</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[8px] text-gray-400 block mb-0.5">Grua</label>
              <select
                value={craneLimit}
                onChange={(e) => setCraneLimit(Number(e.target.value))}
                className="w-full text-[10px] px-1.5 py-1 border border-gray-200 rounded bg-white"
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[8px] text-gray-400 block mb-0.5">Bomba</label>
              <select
                value={pumpLimit}
                onChange={(e) => setPumpLimit(Number(e.target.value))}
                className="w-full text-[10px] px-1.5 py-1 border border-gray-200 rounded bg-white"
              >
                {[0, 1, 2].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[8px] text-gray-400 block mb-0.5">Andaimes</label>
              <select
                value={scaffoldLimit}
                onChange={(e) => setScaffoldLimit(Number(e.target.value))}
                className="w-full text-[10px] px-1.5 py-1 border border-gray-200 rounded bg-white"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Optimize button */}
        <button
          onClick={handleOptimize}
          disabled={isOptimizing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-0"
        >
          {isOptimizing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              A otimizar...
            </>
          ) : (
            "Otimizar"
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="px-3 py-2 space-y-3 flex-1 overflow-y-auto">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-1.5 bg-gray-50 rounded">
              <p className={`text-sm font-bold ${result.efficiencyGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                {result.efficiencyGain >= 0 ? "+" : ""}{result.efficiencyGain.toFixed(1)}%
              </p>
              <p className="text-[8px] text-gray-500">Eficiência</p>
            </div>
            <div className="text-center p-1.5 bg-gray-50 rounded">
              <p className="text-sm font-bold text-gray-800">
                {result.bottlenecks.length}
              </p>
              <p className="text-[8px] text-gray-500">Gargalos</p>
            </div>
            <div className="text-center p-1.5 bg-gray-50 rounded">
              <p className="text-sm font-bold text-gray-800">
                {result.adjustments.length}
              </p>
              <p className="text-[8px] text-gray-500">Ajustes</p>
            </div>
          </div>

          {/* Duration comparison */}
          <div className="flex items-center justify-between text-[10px] px-1">
            <span className="text-gray-500">
              {result.originalDuration}d → {result.optimizedDuration}d
            </span>
            <span className={`font-medium ${
              result.optimizedDuration <= result.originalDuration
                ? "text-green-600"
                : "text-amber-600"
            }`}>
              {result.optimizedDuration <= result.originalDuration
                ? `${result.originalDuration - result.optimizedDuration}d menos`
                : `${result.optimizedDuration - result.originalDuration}d mais`}
            </span>
          </div>

          {/* Bottlenecks */}
          {result.bottlenecks.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Gargalos ({result.bottlenecks.length})
              </p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {result.bottlenecks.slice(0, 5).map((b, i) => (
                  <div
                    key={i}
                    className={`px-2 py-1 rounded text-[9px] border ${SEVERITY_COLORS[b.severity]}`}
                  >
                    <span className="font-medium">
                      {b.date.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}
                    </span>
                    {" — "}
                    {b.reason}
                    <span className="ml-1 opacity-60">(+{b.overload})</span>
                  </div>
                ))}
                {result.bottlenecks.length > 5 && (
                  <p className="text-[9px] text-gray-400 text-center">
                    +{result.bottlenecks.length - 5} mais
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                Sugestões ({result.suggestions.length})
              </p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {result.suggestions.map((s, i) => {
                  const Icon = SUGGESTION_ICONS[s.type] || Lightbulb;
                  return (
                    <div key={i} className="px-2 py-1.5 bg-blue-50 rounded text-[9px] text-blue-800 border border-blue-100">
                      <div className="flex items-start gap-1.5">
                        <Icon className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">{s.title}</p>
                          <p className="text-blue-600 mt-0.5">{s.description}</p>
                          <p className="text-blue-400 mt-0.5">{s.estimatedImpact}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Apply button */}
          {onOptimized && result.adjustments.length > 0 && (
            <button
              onClick={handleApply}
              className="w-full px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors min-h-[44px] sm:min-h-0"
            >
              Aplicar otimização ({result.adjustments.length} ajustes)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { Upload, ChevronDown, ChevronRight, X, AlertTriangle, Trash2 } from "lucide-react";
import type { ProjectSchedule, ConstructionPhase } from "@/lib/wbs-types";
import {
  captureBaseline,
  computeEvmSnapshot,
  generateSCurveData,
  validateBaseline,
  type EvmBaseline,
  type TaskProgress,
  type ProjectEvmSnapshot,
  type SCurvePoint,
  type BaselineValidation,
} from "@/lib/earned-value";
import { parseProgressCSV, parseProgressXML } from "@/lib/progress-import";
import { phaseColor, phaseLabel } from "@/lib/phase-colors";

// ============================================================
// Props
// ============================================================

interface ProgressPanelProps {
  schedule: ProjectSchedule;
  progress: TaskProgress[];
  baseline: EvmBaseline | null;
  onProgressChange: (entries: TaskProgress[]) => void;
  onBaselineCapture: (baseline: EvmBaseline) => void;
  onClose: () => void;
}

// ============================================================
// Component
// ============================================================

export default function ProgressPanel({
  schedule,
  progress,
  baseline,
  onProgressChange,
  onBaselineCapture,
  onClose,
}: ProgressPanelProps) {
  const [dataDate, setDataDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [showSCurve, setShowSCurve] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [lastUnmatched, setLastUnmatched] = useState<string[]>([]);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  // Detail tasks only
  const detailTasks = useMemo(
    () => schedule.tasks.filter((t) => !t.isSummary),
    [schedule.tasks],
  );

  // Progress map for quick lookup
  const progressMap = useMemo(
    () => new Map(progress.map((p) => [p.taskUid, p])),
    [progress],
  );

  // Group tasks by phase
  const phaseGroups = useMemo(() => {
    const groups = new Map<ConstructionPhase, typeof detailTasks>();
    for (const t of detailTasks) {
      const list = groups.get(t.phase) ?? [];
      list.push(t);
      groups.set(t.phase, list);
    }
    return groups;
  }, [detailTasks]);

  // Compute EVM snapshot
  const snapshot: ProjectEvmSnapshot | null = useMemo(() => {
    if (!baseline) return null;
    return computeEvmSnapshot(baseline, schedule, progress, dataDate);
  }, [baseline, schedule, progress, dataDate]);

  // S-curve data
  const sCurveData: SCurvePoint[] = useMemo(() => {
    if (!baseline) return [];
    return generateSCurveData(baseline, progress);
  }, [baseline, progress]);

  // Baseline staleness check
  const baselineValidation: BaselineValidation | null = useMemo(
    () => (baseline ? validateBaseline(baseline, schedule) : null),
    [baseline, schedule],
  );

  // ── localStorage persistence ──────────────────────────
  // Load stored progress on mount (only if no progress yet)
  const storageKey = `wallnut_progress_${schedule.projectName}`;

  // Save progress to localStorage whenever it changes
  // (skip empty arrays to avoid overwriting with nothing)
  const handleProgressPersist = useCallback(
    (entries: TaskProgress[]) => {
      onProgressChange(entries);
      if (entries.length > 0) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(entries));
        } catch { /* quota exceeded — ignore */ }
      }
    },
    [onProgressChange, storageKey],
  );

  const handleClearProgress = useCallback(() => {
    localStorage.removeItem(storageKey);
    onProgressChange(detailTasks.map((t) => ({ taskUid: t.uid, percentComplete: 0 })));
  }, [storageKey, onProgressChange, detailTasks]);

  // ── Handlers ──────────────────────────────────────────

  const handleCaptureBaseline = useCallback(() => {
    const bl = captureBaseline(schedule);
    onBaselineCapture(bl);
    // Initialize progress at 0% for all detail tasks
    if (progress.length === 0) {
      onProgressChange(
        detailTasks.map((t) => ({ taskUid: t.uid, percentComplete: 0 })),
      );
    }
  }, [schedule, detailTasks, progress.length, onBaselineCapture, onProgressChange]);

  const handleTaskProgressChange = useCallback(
    (taskUid: number, pct: number) => {
      const updated = progress.map((p) =>
        p.taskUid === taskUid ? { ...p, percentComplete: Math.min(100, Math.max(0, pct)) } : p,
      );
      // Add if not exists
      if (!updated.find((p) => p.taskUid === taskUid)) {
        updated.push({ taskUid, percentComplete: Math.min(100, Math.max(0, pct)) });
      }
      handleProgressPersist(updated);
    },
    [progress, handleProgressPersist],
  );

  const handleBulkPhaseUpdate = useCallback(
    (phase: ConstructionPhase, pct: number) => {
      const phaseTasks = phaseGroups.get(phase) ?? [];
      const phaseUids = new Set(phaseTasks.map((t) => t.uid));
      const updated = progress.map((p) =>
        phaseUids.has(p.taskUid) ? { ...p, percentComplete: pct } : p,
      );
      handleProgressPersist(updated);
    },
    [progress, phaseGroups, handleProgressPersist],
  );

  const handleCSVImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = parseProgressCSV(reader.result as string, schedule);
        setLastUnmatched(result.unmatched);
        if (result.entries.length > 0) {
          handleProgressPersist(result.entries);
          setImportStatus(
            result.unmatched.length > 0
              ? `${result.matched} importadas (${result.unmatched.length} não correspondidas)`
              : `${result.matched} tarefas importadas de CSV`,
          );
        } else {
          setImportStatus("Nenhuma tarefa correspondente encontrada no CSV");
        }
        setTimeout(() => setImportStatus(null), 5000);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [schedule, handleProgressPersist],
  );

  const handleXMLImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = parseProgressXML(reader.result as string, schedule);
        setLastUnmatched(result.unmatched);
        if (result.entries.length > 0) {
          handleProgressPersist(result.entries);
          setImportStatus(
            result.unmatched.length > 0
              ? `${result.matched} importadas (${result.unmatched.length} não correspondidas)`
              : `${result.matched} tarefas importadas de MS Project`,
          );
        } else {
          setImportStatus("Nenhuma tarefa correspondente encontrada no XML");
        }
        setTimeout(() => setImportStatus(null), 5000);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [schedule, handleProgressPersist],
  );

  function togglePhase(phase: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }

  // ── Render ──────────────────────────────────────────

  return (
    <div className="absolute top-12 left-0 sm:left-3 bg-white rounded-lg shadow-lg border border-gray-200 w-full sm:w-80 z-20 max-h-[50vh] sm:max-h-[calc(100%-64px)] flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Progresso
        </p>
        <button onClick={onClose} className="p-0.5 text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* No baseline message */}
      {!baseline && (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-gray-500 mb-3">
            Capture uma baseline para comparar progresso real vs. planeado.
          </p>
          <button
            onClick={handleCaptureBaseline}
            className="px-4 py-1.5 bg-accent text-white text-xs rounded font-medium hover:bg-accent-hover transition-colors"
          >
            Capturar Baseline
          </button>
        </div>
      )}

      {baseline && (
        <>
          {/* Baseline staleness warning */}
          {baselineValidation?.isStale && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-amber-800">
                    Baseline desatualizada
                  </p>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    {baselineValidation.reason}
                  </p>
                  <button
                    onClick={handleCaptureBaseline}
                    className="mt-1.5 text-[10px] bg-amber-600 text-white px-2.5 py-0.5 rounded hover:bg-amber-700 transition-colors"
                  >
                    Recapturar baseline
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Data date + import buttons */}
          <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] text-gray-400 flex-shrink-0">Data ref.:</label>
              <input
                type="date"
                value={dataDate}
                onChange={(e) => setDataDate(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-[10px] rounded cursor-pointer hover:bg-gray-200 transition-colors">
                <Upload className="w-3 h-3" />
                CSV
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  className="hidden"
                />
              </label>
              <label className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-[10px] rounded cursor-pointer hover:bg-gray-200 transition-colors">
                <Upload className="w-3 h-3" />
                MS Project
                <input
                  ref={xmlInputRef}
                  type="file"
                  accept=".xml"
                  onChange={handleXMLImport}
                  className="hidden"
                />
              </label>
            </div>
            {importStatus && (
              <p className="text-[10px] text-accent mt-1">{importStatus}</p>
            )}
            {lastUnmatched.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setShowUnmatched(!showUnmatched)}
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                >
                  {showUnmatched ? "▾" : "▸"} Não correspondidas ({lastUnmatched.length})
                </button>
                {showUnmatched && (
                  <div className="mt-1 max-h-20 overflow-y-auto text-[9px] text-gray-400 space-y-0.5 pl-2">
                    {lastUnmatched.map((name, i) => (
                      <p key={i} className="truncate" title={name}>{name}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Phase-grouped task list */}
          <div className="flex-1 overflow-y-auto">
            {Array.from(phaseGroups.entries()).map(([phase, tasks]) => {
              const isExpanded = expandedPhases.has(phase);
              const phaseProgress =
                tasks.reduce(
                  (sum, t) => sum + (progressMap.get(t.uid)?.percentComplete ?? 0),
                  0,
                ) / tasks.length;

              return (
                <div key={phase} className="border-b border-gray-50">
                  {/* Phase header */}
                  <button
                    onClick={() => togglePhase(phase)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    )}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: phaseColor(phase) }}
                    />
                    <span className="text-[10px] font-medium text-gray-600 flex-1 text-left truncate">
                      {phaseLabel(phase)} ({tasks.length})
                    </span>
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {Math.round(phaseProgress)}%
                    </span>
                    {/* Bulk buttons */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleBulkPhaseUpdate(phase, 100); }}
                      className="text-[8px] px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                      title="Marcar tudo 100%"
                    >
                      100%
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleBulkPhaseUpdate(phase, 0); }}
                      className="text-[8px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded hover:bg-gray-200"
                      title="Repor tudo 0%"
                    >
                      0%
                    </button>
                  </button>

                  {/* Task list */}
                  {isExpanded && (
                    <div className="px-3 pb-2 space-y-1">
                      {tasks.map((task) => {
                        const pct = progressMap.get(task.uid)?.percentComplete ?? 0;
                        return (
                          <div key={task.uid} className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-500 flex-1 truncate" title={task.name}>
                              {task.name}
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={pct}
                              onChange={(e) => handleTaskProgressChange(task.uid, parseInt(e.target.value, 10))}
                              className="w-16 h-1 accent-accent"
                            />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={pct}
                              onChange={(e) => handleTaskProgressChange(task.uid, parseInt(e.target.value, 10) || 0)}
                              className={`text-[9px] tabular-nums w-8 text-right border-0 bg-transparent p-0 focus:outline-none focus:ring-0 ${pct >= 100 ? "text-emerald-600 font-medium" : "text-gray-400"}`}
                            />
                            <span className="text-[9px] text-gray-400">%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* EVM summary footer */}
          {snapshot && (
            <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3 text-[10px]">
                <span className={`font-medium ${snapshot.spi >= 0.9 ? "text-emerald-600" : snapshot.spi >= 0.75 ? "text-amber-600" : "text-red-600"}`}>
                  SPI: {snapshot.spi.toFixed(2)}
                </span>
                <span className={`font-medium ${snapshot.cpi >= 0.9 ? "text-emerald-600" : snapshot.cpi >= 0.75 ? "text-amber-600" : "text-red-600"}`}>
                  CPI: {snapshot.cpi.toFixed(2)}
                </span>
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                  snapshot.health === "green" ? "bg-emerald-100 text-emerald-700" :
                  snapshot.health === "yellow" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {snapshot.health === "green" ? "Saudável" :
                   snapshot.health === "yellow" ? "Atenção" : "Crítico"}
                </span>
                {snapshot.scheduleSlippageDays !== 0 && (
                  <span className={`text-[9px] ${snapshot.scheduleSlippageDays > 0 ? "text-red-500" : "text-emerald-500"}`}>
                    {snapshot.scheduleSlippageDays > 0 ? "+" : ""}{snapshot.scheduleSlippageDays}d
                  </span>
                )}
              </div>

              {/* S-curve toggle + clear */}
              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={() => setShowSCurve(!showSCurve)}
                  className="text-[10px] text-accent hover:underline"
                >
                  {showSCurve ? "Ocultar S-Curve" : "Mostrar S-Curve"}
                </button>
                <button
                  onClick={handleClearProgress}
                  className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-0.5 transition-colors"
                  title="Limpar progresso guardado"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar
                </button>
              </div>

              {showSCurve && sCurveData.length > 1 && (
                <div className="mt-2">
                  <MiniSCurve points={sCurveData} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Mini S-Curve (compact SVG inline chart)
// ============================================================

function MiniSCurve({ points }: { points: SCurvePoint[] }) {
  if (points.length < 2) return null;

  const width = 260;
  const height = 80;
  const pad = { top: 5, right: 5, bottom: 5, left: 5 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.plannedValue, p.earnedValue ?? 0, p.actualCost ?? 0)),
  );
  const yScale = maxVal > 0 ? chartH / maxVal : 1;
  const xStep = chartW / (points.length - 1);

  function line(getter: (p: SCurvePoint) => number | undefined): string {
    const pts = points
      .map((p, i) => {
        const val = getter(p);
        if (val === undefined) return null;
        return `${pad.left + i * xStep},${pad.top + chartH - val * yScale}`;
      })
      .filter(Boolean);
    return pts.length > 1 ? `M${pts.join("L")}` : "";
  }

  const pvPath = line((p) => p.plannedValue);
  const evPath = line((p) => p.earnedValue);
  const acPath = line((p) => p.actualCost);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      {pvPath && <path d={pvPath} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4,2" />}
      {evPath && <path d={evPath} fill="none" stroke="#10b981" strokeWidth={1.5} />}
      {acPath && <path d={acPath} fill="none" stroke="#ef4444" strokeWidth={1.5} />}
      {/* Legend */}
      <line x1={5} y1={height - 3} x2={15} y2={height - 3} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4,2" />
      <text x={18} y={height - 1} fontSize={7} className="fill-gray-500">PV</text>
      <line x1={35} y1={height - 3} x2={45} y2={height - 3} stroke="#10b981" strokeWidth={1.5} />
      <text x={48} y={height - 1} fontSize={7} className="fill-gray-500">EV</text>
      <line x1={62} y1={height - 3} x2={72} y2={height - 3} stroke="#ef4444" strokeWidth={1.5} />
      <text x={75} y={height - 1} fontSize={7} className="fill-gray-500">AC</text>
    </svg>
  );
}

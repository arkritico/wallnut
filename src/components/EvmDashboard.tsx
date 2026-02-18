"use client";

import { useState, useMemo, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { formatCost } from "@/lib/cost-estimation";
import type { ProjectSchedule } from "@/lib/wbs-types";
import {
  captureBaseline,
  computeEvmSnapshot,
  generateSCurveData,
  type EvmBaseline,
  type TaskProgress,
  type ProjectEvmSnapshot,
  type SCurvePoint,
} from "@/lib/earned-value";

// ============================================================
// Props
// ============================================================

interface EvmDashboardProps {
  schedule: ProjectSchedule;
}

// ============================================================
// Helpers
// ============================================================

function healthColor(health: "green" | "yellow" | "red"): string {
  switch (health) {
    case "green": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "yellow": return "bg-amber-100 text-amber-800 border-amber-200";
    case "red": return "bg-red-100 text-red-800 border-red-200";
  }
}

function healthDot(health: "green" | "yellow" | "red"): string {
  switch (health) {
    case "green": return "bg-emerald-500";
    case "yellow": return "bg-amber-500";
    case "red": return "bg-red-500";
  }
}

function indexColor(value: number): string {
  if (value >= 1.0) return "text-emerald-700";
  if (value >= 0.9) return "text-amber-700";
  return "text-red-700";
}

function varianceColor(value: number): string {
  if (value >= 0) return "text-emerald-700";
  return "text-red-700";
}

function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`;
}

function formatIndex(value: number): string {
  return value.toFixed(2);
}

// ============================================================
// Mini S-Curve chart (SVG)
// ============================================================

function SCurveChart({ points, height = 180 }: { points: SCurvePoint[]; height?: number }) {
  if (points.length < 2) return null;

  const width = 600;
  const pad = { top: 10, right: 10, bottom: 25, left: 55 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const maxVal = Math.max(...points.map(p => Math.max(p.plannedValue, p.earnedValue ?? 0, p.actualCost ?? 0)));
  const yScale = maxVal > 0 ? chartH / maxVal : 1;

  const xStep = chartW / (points.length - 1);

  function line(getter: (p: SCurvePoint) => number | undefined): string {
    const pts = points.map((p, i) => {
      const val = getter(p);
      if (val === undefined) return null;
      return `${pad.left + i * xStep},${pad.top + chartH - val * yScale}`;
    }).filter(Boolean);
    return pts.length > 1 ? `M${pts.join("L")}` : "";
  }

  const pvPath = line(p => p.plannedValue);
  const evPath = line(p => p.earnedValue);
  const acPath = line(p => p.actualCost);

  // Y-axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    val: f * maxVal,
    y: pad.top + chartH - f * chartH,
  }));

  // X-axis labels (show ~5 dates)
  const labelStep = Math.max(1, Math.floor(points.length / 5));
  const xLabels = points.filter((_, i) => i % labelStep === 0 || i === points.length - 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      {/* Grid lines */}
      {yTicks.map(({ y }, i) => (
        <line key={i} x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e5e7eb" strokeWidth={1} />
      ))}
      {/* Y labels */}
      {yTicks.map(({ val, y }, i) => (
        <text key={i} x={pad.left - 5} y={y + 4} textAnchor="end" className="fill-gray-500" fontSize={10}>
          {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
        </text>
      ))}
      {/* X labels */}
      {xLabels.map((p, i) => {
        const idx = points.indexOf(p);
        return (
          <text key={i} x={pad.left + idx * xStep} y={height - 5} textAnchor="middle" className="fill-gray-500" fontSize={9}>
            {p.date.slice(5)}
          </text>
        );
      })}
      {/* PV line (dashed) */}
      {pvPath && <path d={pvPath} fill="none" stroke="#6366f1" strokeWidth={2} strokeDasharray="6,3" />}
      {/* EV line */}
      {evPath && <path d={evPath} fill="none" stroke="#10b981" strokeWidth={2} />}
      {/* AC line */}
      {acPath && <path d={acPath} fill="none" stroke="#ef4444" strokeWidth={2} />}
      {/* Legend */}
      <line x1={pad.left} y1={height - 15} x2={pad.left + 20} y2={height - 15} stroke="#6366f1" strokeWidth={2} strokeDasharray="6,3" />
      <text x={pad.left + 24} y={height - 11} fontSize={9} className="fill-gray-600">PV</text>
      <line x1={pad.left + 50} y1={height - 15} x2={pad.left + 70} y2={height - 15} stroke="#10b981" strokeWidth={2} />
      <text x={pad.left + 74} y={height - 11} fontSize={9} className="fill-gray-600">EV</text>
      <line x1={pad.left + 100} y1={height - 15} x2={pad.left + 120} y2={height - 15} stroke="#ef4444" strokeWidth={2} />
      <text x={pad.left + 124} y={height - 11} fontSize={9} className="fill-gray-600">AC</text>
    </svg>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function EvmDashboard({ schedule }: EvmDashboardProps) {
  const { t, lang } = useI18n();

  // Baseline state (persisted in component for now)
  const [baseline, setBaseline] = useState<EvmBaseline | null>(null);

  // Progress entries (user-editable)
  const [progressEntries, setProgressEntries] = useState<TaskProgress[]>([]);

  // Data date (defaults to today)
  const [dataDate, setDataDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Capture baseline
  const handleCaptureBaseline = useCallback(() => {
    const bl = captureBaseline(schedule);
    setBaseline(bl);
    // Initialize progress entries for all work tasks at 0%
    setProgressEntries(
      bl.tasks
        .filter(t => !t.isSummary)
        .map(t => ({ taskUid: t.uid, percentComplete: 0 }))
    );
  }, [schedule]);

  // Update a single task's progress
  const handleProgressChange = useCallback((taskUid: number, pct: number) => {
    setProgressEntries(prev =>
      prev.map(p => p.taskUid === taskUid ? { ...p, percentComplete: pct } : p)
    );
  }, []);

  // Compute snapshot
  const snapshot: ProjectEvmSnapshot | null = useMemo(() => {
    if (!baseline) return null;
    return computeEvmSnapshot(baseline, schedule, progressEntries, dataDate);
  }, [baseline, schedule, progressEntries, dataDate]);

  // S-curve data
  const sCurveData: SCurvePoint[] = useMemo(() => {
    if (!baseline) return [];
    return generateSCurveData(baseline, progressEntries);
  }, [baseline, progressEntries]);

  // No baseline yet
  if (!baseline) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t.evmTitle}</h2>
        <p className="text-gray-500 mb-6">{t.evmNoBaseline}</p>
        <button
          onClick={handleCaptureBaseline}
          className="px-6 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors"
        >
          {t.evmCaptureBaseline}
        </button>
        <p className="text-xs text-gray-400 mt-3">
          {lang === "pt"
            ? `O planeamento atual tem ${schedule.tasks.filter(t => !t.isSummary).length} tarefas e custo total de ${formatCost(schedule.totalCost)}.`
            : `Current schedule has ${schedule.tasks.filter(t => !t.isSummary).length} tasks and total cost of ${formatCost(schedule.totalCost)}.`}
        </p>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-6">
      {/* Header + Health */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t.evmTitle}</h2>
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${healthColor(snapshot.health)}`}>
            <span className={`w-2 h-2 rounded-full ${healthDot(snapshot.health)}`} />
            {snapshot.health === "green" ? t.evmOnTrack
              : snapshot.health === "yellow" ? t.evmAtRisk
              : t.evmDelayed}
          </div>
        </div>

        {/* Data date picker */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-gray-600">{t.evmDataDate}:</label>
          <input
            type="date"
            value={dataDate}
            onChange={(e) => setDataDate(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2 py-1"
          />
          <span className="text-xs text-gray-400">
            {t.evmBaseline}: {baseline.capturedAt.split("T")[0]}
          </span>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* BAC */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">{t.evmBac}</p>
            <p className="text-lg font-bold text-gray-900">{formatCost(snapshot.budgetAtCompletion)}</p>
          </div>
          {/* PV */}
          <div className="bg-indigo-50 rounded-lg p-3">
            <p className="text-xs text-indigo-600">{t.evmPlannedValue}</p>
            <p className="text-lg font-bold text-indigo-900">{formatCost(snapshot.plannedValue)}</p>
          </div>
          {/* EV */}
          <div className="bg-emerald-50 rounded-lg p-3">
            <p className="text-xs text-emerald-600">{t.evmEarnedValue}</p>
            <p className="text-lg font-bold text-emerald-900">{formatCost(snapshot.earnedValue)}</p>
          </div>
          {/* AC */}
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-600">{t.evmActualCost}</p>
            <p className="text-lg font-bold text-red-900">{formatCost(snapshot.actualCost)}</p>
          </div>
        </div>
      </div>

      {/* Variances + Indices */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Schedule */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            {lang === "pt" ? "Desempenho de Prazo" : "Schedule Performance"}
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmScheduleVariance}</span>
              <span className={`text-sm font-semibold ${varianceColor(snapshot.scheduleVariance)}`}>
                {formatCost(snapshot.scheduleVariance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmSpi}</span>
              <span className={`text-sm font-semibold ${indexColor(snapshot.spi)}`}>
                {formatIndex(snapshot.spi)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmProjectedFinish}</span>
              <span className="text-sm font-semibold text-gray-900">{snapshot.projectedFinishDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmSlippage}</span>
              <span className={`text-sm font-semibold ${snapshot.scheduleSlippageDays > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {snapshot.scheduleSlippageDays > 0 ? "+" : ""}{snapshot.scheduleSlippageDays} {t.evmDays}
              </span>
            </div>
          </div>
        </div>

        {/* Cost */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            {lang === "pt" ? "Desempenho de Custo" : "Cost Performance"}
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmCostVariance}</span>
              <span className={`text-sm font-semibold ${varianceColor(snapshot.costVariance)}`}>
                {formatCost(snapshot.costVariance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmCpi}</span>
              <span className={`text-sm font-semibold ${indexColor(snapshot.cpi)}`}>
                {formatIndex(snapshot.cpi)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmEac}</span>
              <span className="text-sm font-semibold text-gray-900">{formatCost(snapshot.estimateAtCompletion)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmEtc}</span>
              <span className="text-sm font-semibold text-gray-900">{formatCost(snapshot.estimateToComplete)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmVac}</span>
              <span className={`text-sm font-semibold ${varianceColor(snapshot.varianceAtCompletion)}`}>
                {formatCost(snapshot.varianceAtCompletion)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.evmTcpi}</span>
              <span className="text-sm font-semibold text-gray-900">{formatIndex(snapshot.toCompletePerformanceIndex)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Task status summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          {lang === "pt" ? "Resumo de Tarefas" : "Task Summary"}
        </h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-sm text-gray-600">{t.evmOnTrack}: {snapshot.tasksByStatus.onTrack}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-sm text-gray-600">{t.evmAtRisk}: {snapshot.tasksByStatus.atRisk}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-sm text-gray-600">{t.evmDelayed}: {snapshot.tasksByStatus.delayed}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm text-gray-600">{t.evmCompleted}: {snapshot.tasksByStatus.completed}</span>
          </div>
        </div>
        {/* Status bar */}
        <div className="mt-3 flex h-3 rounded-full overflow-hidden bg-gray-100">
          {snapshot.tasksByStatus.completed > 0 && (
            <div className="bg-blue-500" style={{ width: `${(snapshot.tasksByStatus.completed / snapshot.taskMetrics.length) * 100}%` }} />
          )}
          {snapshot.tasksByStatus.onTrack > 0 && (
            <div className="bg-emerald-500" style={{ width: `${(snapshot.tasksByStatus.onTrack / snapshot.taskMetrics.length) * 100}%` }} />
          )}
          {snapshot.tasksByStatus.atRisk > 0 && (
            <div className="bg-amber-500" style={{ width: `${(snapshot.tasksByStatus.atRisk / snapshot.taskMetrics.length) * 100}%` }} />
          )}
          {snapshot.tasksByStatus.delayed > 0 && (
            <div className="bg-red-500" style={{ width: `${(snapshot.tasksByStatus.delayed / snapshot.taskMetrics.length) * 100}%` }} />
          )}
        </div>
      </div>

      {/* S-Curve */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-3">{t.evmSCurve}</h3>
        <SCurveChart points={sCurveData} height={200} />
      </div>

      {/* Task Progress Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-3">{t.evmTaskPerformance}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2 pr-3 text-gray-500 font-medium">
                  {lang === "pt" ? "Tarefa" : "Task"}
                </th>
                <th className="py-2 px-2 text-gray-500 font-medium text-center">%</th>
                <th className="py-2 px-2 text-gray-500 font-medium text-right">PV</th>
                <th className="py-2 px-2 text-gray-500 font-medium text-right">EV</th>
                <th className="py-2 px-2 text-gray-500 font-medium text-right">SPI</th>
                <th className="py-2 px-2 text-gray-500 font-medium text-right">CPI</th>
                <th className="py-2 px-2 text-gray-500 font-medium text-center">
                  {lang === "pt" ? "Estado" : "Status"}
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.taskMetrics
                .filter(tm => tm.budgetAtCompletion > 0)
                .slice(0, 50)
                .map((tm) => (
                <tr key={tm.taskUid} className={`border-b border-gray-100 ${tm.isCritical ? "bg-red-50/30" : ""}`}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      {tm.isCritical && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Critical path" />}
                      <span className="text-gray-800 truncate max-w-[200px]">{tm.taskName}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={progressEntries.find(p => p.taskUid === tm.taskUid)?.percentComplete ?? 0}
                      onChange={(e) => handleProgressChange(tm.taskUid, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-14 text-center text-sm border border-gray-200 rounded px-1 py-0.5"
                    />
                  </td>
                  <td className="py-2 px-2 text-right text-gray-600">{formatCost(tm.plannedValue)}</td>
                  <td className="py-2 px-2 text-right text-gray-600">{formatCost(tm.earnedValue)}</td>
                  <td className={`py-2 px-2 text-right font-medium ${indexColor(tm.spiRaw)}`}>
                    {tm.plannedValue > 0 ? formatIndex(tm.spiRaw) : "—"}
                  </td>
                  <td className={`py-2 px-2 text-right font-medium ${indexColor(tm.cpiRaw)}`}>
                    {tm.actualCost > 0 ? formatIndex(tm.cpiRaw) : "—"}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      tm.status === "completed" ? "bg-blue-500"
                      : tm.status === "on_track" ? "bg-emerald-500"
                      : tm.status === "at_risk" ? "bg-amber-500"
                      : "bg-red-500"
                    }`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {snapshot.taskMetrics.filter(tm => tm.budgetAtCompletion > 0).length > 50 && (
          <p className="text-xs text-gray-400 mt-2">
            {lang === "pt"
              ? `A mostrar 50 de ${snapshot.taskMetrics.filter(tm => tm.budgetAtCompletion > 0).length} tarefas.`
              : `Showing 50 of ${snapshot.taskMetrics.filter(tm => tm.budgetAtCompletion > 0).length} tasks.`}
          </p>
        )}
      </div>
    </div>
  );
}

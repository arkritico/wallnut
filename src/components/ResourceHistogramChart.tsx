"use client";

import { useMemo, useState, useCallback } from "react";
import type { ProjectSchedule } from "@/lib/wbs-types";
import type { TaskProgress, EvmBaseline, SCurvePoint } from "@/lib/earned-value";
import { generateSCurveData } from "@/lib/earned-value";
import {
  generateResourceHistogram,
  getTradeColor,
  type ResourceHistogramData,
  type ResourceHistogramPoint,
} from "@/lib/resource-histogram";

// ============================================================
// Props
// ============================================================

interface ResourceHistogramChartProps {
  schedule: ProjectSchedule;
  progress?: TaskProgress[];
  baseline?: EvmBaseline | null;
  /** Current timeline position in milliseconds */
  currentMs: number;
  /** Callback to seek timeline to a specific week (ms) */
  onSeekToWeek?: (weekStartMs: number) => void;
  /** Chart height in pixels */
  height?: number;
  className?: string;
}

// ============================================================
// Constants
// ============================================================

const PAD = { top: 20, right: 60, bottom: 30, left: 50 };
const SCURVE_COLORS = {
  pv: "#6366f1",  // indigo — planned value
  ev: "#10b981",  // emerald — earned value
  ac: "#ef4444",  // red — actual cost
};

// ============================================================
// Helpers
// ============================================================

function formatCompactPT(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return String(val);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT", { month: "short" });
}

// ============================================================
// Component
// ============================================================

export default function ResourceHistogramChart({
  schedule,
  progress,
  baseline,
  currentMs,
  onSeekToWeek,
  height = 160,
  className = "",
}: ResourceHistogramChartProps) {
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);

  // ── Generate histogram data ──────────────────────────────
  const histogramData: ResourceHistogramData = useMemo(
    () => generateResourceHistogram(schedule, progress),
    [schedule, progress],
  );

  // ── Generate S-curve data ────────────────────────────────
  const sCurvePoints: SCurvePoint[] = useMemo(
    () => (baseline ? generateSCurveData(baseline, progress) : []),
    [baseline, progress],
  );

  // ── Chart dimensions ──────────────────────────────────────
  const chartW = 100; // percent-based, will use viewBox
  const SVG_W = 900;
  const SVG_H = height;
  const plotW = SVG_W - PAD.left - PAD.right;
  const plotH = SVG_H - PAD.top - PAD.bottom;

  const points = histogramData.points;
  if (points.length === 0) return null;

  // ── Scales ────────────────────────────────────────────────
  const maxLabor = histogramData.peakLabor || 1;
  const maxCost = Math.max(
    ...points.map((p) => p.cumulativeCost),
    ...(sCurvePoints.length > 0 ? sCurvePoints.map((p) => p.plannedValue) : [0]),
  ) || 1;

  const barW = plotW / points.length;
  const yLabor = (val: number) => PAD.top + plotH - (val / maxLabor) * plotH;
  const yCost = (val: number) => PAD.top + plotH - (val / maxCost) * plotH;
  const xWeek = (i: number) => PAD.left + i * barW;

  // ── Current week playhead ────────────────────────────────
  const currentWeekIdx = useMemo(() => {
    const currentIso = new Date(currentMs).toISOString().split("T")[0];
    for (let i = 0; i < points.length; i++) {
      if (currentIso >= points[i].weekStart && currentIso <= points[i].weekEnd) return i;
    }
    // Fallback: find closest week
    for (let i = 0; i < points.length; i++) {
      if (currentIso < points[i].weekStart) return Math.max(0, i - 1);
    }
    return points.length - 1;
  }, [currentMs, points]);

  // ── Trade stacking order ─────────────────────────────────
  const trades = histogramData.trades;

  // ── Build S-curve line paths ─────────────────────────────
  const sCurveLines = useMemo(() => {
    if (sCurvePoints.length < 2) return { pvPath: "", evPath: "", acPath: "" };

    const startMs = new Date(schedule.startDate).getTime();
    const finishMs = new Date(schedule.finishDate).getTime();
    const totalMs = finishMs - startMs || 1;

    function lineFrom(getter: (p: SCurvePoint) => number | undefined): string {
      const pts: string[] = [];
      for (const p of sCurvePoints) {
        const val = getter(p);
        if (val === undefined) continue;
        const dateMs = new Date(p.date).getTime();
        const x = PAD.left + ((dateMs - startMs) / totalMs) * plotW;
        const y = yCost(val);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return pts.length > 1 ? `M${pts.join("L")}` : "";
    }

    return {
      pvPath: lineFrom((p) => p.plannedValue),
      evPath: lineFrom((p) => p.earnedValue),
      acPath: lineFrom((p) => p.actualCost),
    };
  }, [sCurvePoints, schedule.startDate, schedule.finishDate, plotW, yCost]);

  // ── Hover handler ────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const idx = Math.floor((mouseX - PAD.left) / barW);
      if (idx >= 0 && idx < points.length) {
        setHoveredWeek(idx);
      } else {
        setHoveredWeek(null);
      }
    },
    [barW, points.length],
  );

  const hoveredPoint = hoveredWeek !== null ? points[hoveredWeek] : null;

  // ── Month labels on X axis ───────────────────────────────
  const monthLabels = useMemo(() => {
    const labels: { x: number; label: string }[] = [];
    let lastMonth = "";
    for (let i = 0; i < points.length; i++) {
      const month = formatShortDate(points[i].weekStart);
      if (month !== lastMonth) {
        labels.push({ x: xWeek(i) + barW / 2, label: month });
        lastMonth = month;
      }
    }
    return labels;
  }, [points, barW]);

  return (
    <div className={`bg-white border-t border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
            Recursos
          </span>
          <span
            className={`text-[10px] text-gray-400 ${onSeekToWeek ? "cursor-pointer hover:text-accent transition-colors" : ""}`}
            onClick={() => {
              if (onSeekToWeek && histogramData.peakWeek) {
                onSeekToWeek(new Date(histogramData.peakWeek).getTime());
              }
            }}
            title={onSeekToWeek ? "Clicar para saltar para semana de pico" : undefined}
          >
            Pico: {histogramData.peakLabor} trabalhadores ({histogramData.peakWeek})
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[9px] text-gray-500">
          {trades.slice(0, 6).map((trade, i) => (
            <span key={trade} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: getTradeColor(i) }}
              />
              {trade}
            </span>
          ))}
          {trades.length > 6 && (
            <span className="text-gray-300">+{trades.length - 6}</span>
          )}
          <span className="w-px h-3 bg-gray-200" />
          <span className="flex items-center gap-1">
            <span className="w-3 border-b border-dashed" style={{ borderColor: SCURVE_COLORS.pv }} />
            PV
          </span>
          {sCurveLines.evPath && (
            <span className="flex items-center gap-1">
              <span className="w-3 border-b" style={{ borderColor: SCURVE_COLORS.ev }} />
              EV
            </span>
          )}
          {sCurveLines.acPath && (
            <span className="flex items-center gap-1">
              <span className="w-3 border-b" style={{ borderColor: SCURVE_COLORS.ac }} />
              AC
            </span>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full"
        style={{ height }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredWeek(null)}
      >
        {/* Y-axis left (workers) */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const val = Math.round(maxLabor * pct);
          const y = yLabor(val);
          return (
            <g key={`yl-${pct}`}>
              <line
                x1={PAD.left}
                y1={y}
                x2={SVG_W - PAD.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={0.5}
              />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={8} className="fill-gray-400">
                {val}
              </text>
            </g>
          );
        })}

        {/* Y-axis right (cost) */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const val = maxCost * pct;
          const y = yCost(val);
          return (
            <text
              key={`yr-${pct}`}
              x={SVG_W - PAD.right + 4}
              y={y + 3}
              textAnchor="start"
              fontSize={8}
              className="fill-gray-400"
            >
              {formatCompactPT(val)}\u20AC
            </text>
          );
        })}

        {/* Stacked bars */}
        {points.map((point, i) => {
          const x = xWeek(i);
          const isHighlighted = i === currentWeekIdx || i === hoveredWeek;
          let yOffset = 0;

          return (
            <g key={i} opacity={isHighlighted ? 1 : 0.75}>
              {trades.map((trade, ti) => {
                const count = point.byTrade[trade] ?? 0;
                if (count <= 0) return null;

                const barHeight = (count / maxLabor) * plotH;
                const y = PAD.top + plotH - yOffset - barHeight;
                yOffset += barHeight;

                return (
                  <rect
                    key={trade}
                    x={x + 1}
                    y={y}
                    width={Math.max(1, barW - 2)}
                    height={barHeight}
                    fill={getTradeColor(ti)}
                    rx={1}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Peak line */}
        <line
          x1={PAD.left}
          y1={yLabor(maxLabor)}
          x2={SVG_W - PAD.right}
          y2={yLabor(maxLabor)}
          stroke="#ef4444"
          strokeWidth={0.5}
          strokeDasharray="4,3"
          opacity={0.5}
        />

        {/* S-curve lines (cumulative cost) */}
        {sCurveLines.pvPath && (
          <path
            d={sCurveLines.pvPath}
            fill="none"
            stroke={SCURVE_COLORS.pv}
            strokeWidth={1.5}
            strokeDasharray="5,3"
          />
        )}
        {sCurveLines.evPath && (
          <path
            d={sCurveLines.evPath}
            fill="none"
            stroke={SCURVE_COLORS.ev}
            strokeWidth={1.5}
          />
        )}
        {sCurveLines.acPath && (
          <path
            d={sCurveLines.acPath}
            fill="none"
            stroke={SCURVE_COLORS.ac}
            strokeWidth={1.5}
          />
        )}

        {/* Current date playhead */}
        {currentWeekIdx >= 0 && currentWeekIdx < points.length && (
          <line
            x1={xWeek(currentWeekIdx) + barW / 2}
            y1={PAD.top}
            x2={xWeek(currentWeekIdx) + barW / 2}
            y2={PAD.top + plotH}
            stroke="#ef4444"
            strokeWidth={1}
            opacity={0.7}
          />
        )}

        {/* Hover highlight */}
        {hoveredWeek !== null && (
          <rect
            x={xWeek(hoveredWeek)}
            y={PAD.top}
            width={barW}
            height={plotH}
            fill="rgba(0,0,0,0.04)"
          />
        )}

        {/* X-axis month labels */}
        {monthLabels.map((label, i) => (
          <text
            key={i}
            x={label.x}
            y={SVG_H - 8}
            textAnchor="middle"
            fontSize={8}
            className="fill-gray-400"
          >
            {label.label}
          </text>
        ))}

        {/* Axis labels */}
        <text
          x={8}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          fontSize={8}
          className="fill-gray-400"
          transform={`rotate(-90, 8, ${PAD.top + plotH / 2})`}
        >
          Trabalhadores
        </text>
        <text
          x={SVG_W - 8}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          fontSize={8}
          className="fill-gray-400"
          transform={`rotate(90, ${SVG_W - 8}, ${PAD.top + plotH / 2})`}
        >
          Custo acum.
        </text>
      </svg>

      {/* Hover tooltip */}
      {hoveredPoint && (
        <div className="px-4 py-1 text-[10px] text-gray-500 flex items-center gap-3 border-t border-gray-100">
          <span className="font-medium text-gray-700">
            Semana {hoveredPoint.weekStart}
          </span>
          <span>{hoveredPoint.labor} trabalhadores</span>
          {hoveredPoint.machinery > 0 && (
            <span>{hoveredPoint.machinery} máquinas</span>
          )}
          <span>{hoveredPoint.cost.toLocaleString("pt-PT")}\u20AC/semana</span>
          <span className="text-gray-400">
            Acumulado: {hoveredPoint.cumulativeCost.toLocaleString("pt-PT")}\u20AC
          </span>
          {hoveredPoint.actualCost !== undefined && (
            <span className="text-red-500">
              Real: {hoveredPoint.actualCost.toLocaleString("pt-PT")}\u20AC
            </span>
          )}
          {/* Trade breakdown */}
          <span className="w-px h-3 bg-gray-200" />
          {Object.entries(hoveredPoint.byTrade)
            .filter(([, v]) => v > 0)
            .slice(0, 5)
            .map(([trade, count]) => (
              <span key={trade} className="text-gray-400">
                {trade}: {count}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

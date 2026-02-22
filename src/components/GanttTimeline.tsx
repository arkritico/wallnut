"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import type { ScheduleTask, ConstructionPhase, CriticalChainBuffer } from "@/lib/wbs-types";
import type { TaskProgress } from "@/lib/earned-value";
import { PHASE_ORDER } from "@/lib/construction-sequencer";
import { phaseColor, phaseLabel } from "@/lib/phase-colors";

// ============================================================
// Types
// ============================================================

export interface GanttTimelineProps {
  tasks: ScheduleTask[];
  startMs: number;
  finishMs: number;
  currentMs: number;
  onSeek: (ms: number) => void;
  /** Fired when user clicks a bar — sends task UIDs for that bar */
  onBarSelect?: (taskUids: number[]) => void;
  /** Task UIDs currently selected (for visual ring on bars) */
  selectedTaskUids?: Set<number>;
  /** Critical path task UIDs (shown with red accent) */
  criticalPathUids?: Set<number>;
  /** Actual progress entries — when provided, shows actual start/finish markers */
  progressEntries?: TaskProgress[];
  /** CCPM buffers — rendered as dashed bars below phase rows */
  buffers?: CriticalChainBuffer[];
  /** Milestone tasks — rendered as diamond markers on the timeline */
  milestones?: ScheduleTask[];
  /** Bottleneck markers — red circles above phase rows */
  bottlenecks?: { date: string; severity: string; reason: string }[];
}

interface PhaseBar {
  phase: ConstructionPhase;
  startPct: number; // 0-100
  widthPct: number; // 0-100
  tasks: ScheduleTask[];
}

interface HoverInfo {
  taskName: string;
  dates: string;
  x: number;
  y: number;
}

// ============================================================
// Helpers
// ============================================================

const ROW_H_DESKTOP = 24;
const ROW_H_MOBILE = 32; // taller rows for touch targets on mobile
const LABEL_W_DESKTOP = 72;
const LABEL_W_MOBILE = 56; // narrower labels on small screens

function formatShortPT(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
  });
}

function mergeRanges(
  tasks: ScheduleTask[],
  totalMs: number,
  scheduleStartMs: number,
): { startPct: number; widthPct: number; tasks: ScheduleTask[] }[] {
  if (tasks.length === 0) return [];

  // Sort by start date
  const sorted = [...tasks].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  const bars: { startMs: number; endMs: number; tasks: ScheduleTask[] }[] = [];
  let current = {
    startMs: new Date(sorted[0].startDate).getTime(),
    endMs: new Date(sorted[0].finishDate).getTime(),
    tasks: [sorted[0]],
  };

  for (let i = 1; i < sorted.length; i++) {
    const tStart = new Date(sorted[i].startDate).getTime();
    const tEnd = new Date(sorted[i].finishDate).getTime();

    if (tStart <= current.endMs) {
      // Overlapping — merge
      current.endMs = Math.max(current.endMs, tEnd);
      current.tasks.push(sorted[i]);
    } else {
      bars.push(current);
      current = { startMs: tStart, endMs: tEnd, tasks: [sorted[i]] };
    }
  }
  bars.push(current);

  return bars.map((b) => ({
    startPct: ((b.startMs - scheduleStartMs) / totalMs) * 100,
    widthPct: Math.max(0.5, ((b.endMs - b.startMs) / totalMs) * 100),
    tasks: b.tasks,
  }));
}

// ============================================================
// Component
// ============================================================

export default function GanttTimeline({
  tasks,
  startMs,
  finishMs,
  currentMs,
  onSeek,
  onBarSelect,
  selectedTaskUids,
  criticalPathUids,
  progressEntries,
  buffers,
  milestones,
  bottlenecks,
}: GanttTimelineProps) {
  const ganttRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [isMobileGantt, setIsMobileGantt] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 639px)").matches;
  });

  // Responsive dimensions
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    function onChange(e: MediaQueryListEvent) { setIsMobileGantt(e.matches); }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const ROW_H = isMobileGantt ? ROW_H_MOBILE : ROW_H_DESKTOP;
  const LABEL_W = isMobileGantt ? LABEL_W_MOBILE : LABEL_W_DESKTOP;

  const totalMs = finishMs - startMs || 1;
  const playheadPct = ((currentMs - startMs) / totalMs) * 100;

  // Build progress lookup map
  const progressMap = useMemo(() => {
    if (!progressEntries || progressEntries.length === 0) return null;
    return new Map(progressEntries.map((p) => [p.taskUid, p]));
  }, [progressEntries]);

  // Group tasks by phase, sorted by PHASE_ORDER
  const phaseRows = useMemo(() => {
    const groups = new Map<ConstructionPhase, ScheduleTask[]>();
    for (const task of tasks) {
      const list = groups.get(task.phase) ?? [];
      list.push(task);
      groups.set(task.phase, list);
    }

    const rows: { phase: ConstructionPhase; bars: PhaseBar[] }[] = [];
    for (const phase of PHASE_ORDER) {
      const phaseTasks = groups.get(phase);
      if (!phaseTasks || phaseTasks.length === 0) continue;

      const merged = mergeRanges(phaseTasks, totalMs, startMs);
      rows.push({
        phase,
        bars: merged.map((m) => ({
          phase,
          startPct: m.startPct,
          widthPct: m.widthPct,
          tasks: m.tasks,
        })),
      });
    }
    return rows;
  }, [tasks, totalMs, startMs]);

  // Click/tap-to-seek on the Gantt area (pointer events for touch + mouse)
  const handlePointerSeek = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const gantt = ganttRef.current;
      if (!gantt) return;
      const rect = gantt.getBoundingClientRect();
      const xOffset = e.clientX - rect.left - LABEL_W;
      const barWidth = rect.width - LABEL_W;
      if (xOffset < 0 || barWidth <= 0) return;
      const pct = xOffset / barWidth;
      const ms = startMs + pct * totalMs;
      onSeek(Math.max(startMs, Math.min(finishMs, ms)));
    },
    [startMs, finishMs, totalMs, onSeek, LABEL_W],
  );

  // Bar status for opacity
  const barOpacity = useCallback(
    (bar: PhaseBar): number => {
      // Check if any task in this bar is in-progress or completed
      let hasInProgress = false;
      let hasCompleted = false;
      for (const t of bar.tasks) {
        const tStart = new Date(t.startDate).getTime();
        const tFinish = new Date(t.finishDate).getTime();
        if (currentMs >= tFinish) hasCompleted = true;
        else if (currentMs >= tStart) hasInProgress = true;
      }
      if (hasCompleted && !hasInProgress) return 1;
      if (hasInProgress) return 0.7;
      return 0.3;
    },
    [currentMs],
  );

  // Bar click handler — select bar (stop propagation to prevent seek)
  const handleBarClick = useCallback(
    (e: React.PointerEvent, bar: PhaseBar) => {
      e.stopPropagation();
      if (!onBarSelect) return;
      // Toggle: if already selected, deselect
      const barUids = bar.tasks.map((t) => t.uid);
      const isAlreadySelected = selectedTaskUids && barUids.some((uid) => selectedTaskUids.has(uid));
      onBarSelect(isAlreadySelected ? [] : barUids);
    },
    [onBarSelect, selectedTaskUids],
  );

  // Check if a bar is selected
  const isBarSelected = useCallback(
    (bar: PhaseBar): boolean => {
      if (!selectedTaskUids || selectedTaskUids.size === 0) return false;
      return bar.tasks.some((t) => selectedTaskUids.has(t.uid));
    },
    [selectedTaskUids],
  );

  // Check if a bar is on the critical path
  const isBarCritical = useCallback(
    (bar: PhaseBar): boolean => {
      if (!criticalPathUids || criticalPathUids.size === 0) return false;
      return bar.tasks.some((t) => criticalPathUids.has(t.uid));
    },
    [criticalPathUids],
  );

  // Hover handler (pointer events for cross-device support)
  const handleBarHover = useCallback(
    (e: React.PointerEvent, bar: PhaseBar) => {
      const taskNames = bar.tasks.map((t) => t.name).join(", ");
      const earliest = Math.min(...bar.tasks.map((t) => new Date(t.startDate).getTime()));
      const latest = Math.max(...bar.tasks.map((t) => new Date(t.finishDate).getTime()));
      setHover({
        taskName: bar.tasks.length === 1 ? taskNames : `${bar.tasks.length} tarefas`,
        dates: `${formatShortPT(earliest)} \u2013 ${formatShortPT(latest)}`,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [],
  );

  const bufferRowCount = buffers && buffers.length > 0 ? 1 : 0; // single row for all buffers
  const ganttHeight = Math.min(phaseRows.length * ROW_H, 8 * ROW_H) + bufferRowCount * ROW_H;
  const visibleRows = phaseRows.slice(0, 8);
  const hiddenCount = phaseRows.length - visibleRows.length;
  const hasActualDates = progressEntries && progressEntries.length > 0;

  return (
    <div
      ref={ganttRef}
      className="relative select-none cursor-pointer touch-none"
      style={{ height: ganttHeight + (hiddenCount > 0 ? 14 : 0) + (hasActualDates ? 14 : 0) }}
      onPointerDown={handlePointerSeek}
      onPointerLeave={() => setHover(null)}
    >
      {/* Phase rows */}
      {visibleRows.map((row, i) => (
        <div
          key={row.phase}
          className="flex items-center"
          style={{ height: ROW_H }}
        >
          {/* Phase label */}
          <div
            className="flex-shrink-0 text-[11px] sm:text-[9px] text-gray-500 truncate pr-1"
            style={{ width: LABEL_W }}
            title={phaseLabel(row.phase)}
          >
            {phaseLabel(row.phase)}
          </div>

          {/* Bar area */}
          <div className="flex-1 relative h-full">
            {/* Alternating bg */}
            <div
              className={`absolute inset-0 ${i % 2 === 0 ? "bg-gray-50" : ""}`}
            />

            {/* Task bars */}
            {row.bars.map((bar, j) => {
              const selected = isBarSelected(bar);
              const critical = isBarCritical(bar);

              // Compute actual progress markers for this bar
              const actualMarkers: { pct: number; isFinish: boolean; isLate: boolean }[] = [];
              if (progressMap) {
                for (const t of bar.tasks) {
                  const prog = progressMap.get(t.uid);
                  if (!prog) continue;

                  const plannedFinishMs = new Date(t.finishDate).getTime();

                  // Actual finish marker
                  if (prog.actualFinish) {
                    const actualFinishMs = new Date(prog.actualFinish).getTime();
                    const pct = ((actualFinishMs - startMs) / totalMs) * 100;
                    if (pct >= 0 && pct <= 100) {
                      actualMarkers.push({
                        pct,
                        isFinish: true,
                        isLate: actualFinishMs > plannedFinishMs,
                      });
                    }
                  }

                  // Actual start marker
                  if (prog.actualStart) {
                    const actualStartMs = new Date(prog.actualStart).getTime();
                    const plannedStartMs = new Date(t.startDate).getTime();
                    const pct = ((actualStartMs - startMs) / totalMs) * 100;
                    if (pct >= 0 && pct <= 100) {
                      actualMarkers.push({
                        pct,
                        isFinish: false,
                        isLate: actualStartMs > plannedStartMs,
                      });
                    }
                  }
                }
              }

              return (
                <div key={j} className="contents">
                  <div
                    className="absolute top-0.5 rounded-sm transition-opacity"
                    style={{
                      left: `${bar.startPct}%`,
                      width: `${bar.widthPct}%`,
                      height: ROW_H - 4,
                      backgroundColor: phaseColor(bar.phase),
                      opacity: selected ? 1 : barOpacity(bar),
                      minWidth: 2,
                      outline: selected ? "2px solid white" : "none",
                      outlineOffset: 1,
                      boxShadow: selected ? "0 0 4px rgba(255,255,255,0.8)" : "none",
                      zIndex: selected ? 10 : undefined,
                      borderBottom: critical ? "2px solid #ef4444" : "none",
                    }}
                    onPointerDown={(e) => handleBarClick(e, bar)}
                    onPointerEnter={(e) => handleBarHover(e, bar)}
                    onPointerMove={(e) => handleBarHover(e, bar)}
                    onPointerLeave={() => setHover(null)}
                  />

                  {/* Actual date diamond markers */}
                  {actualMarkers.map((marker, mi) => (
                    <div
                      key={`m-${j}-${mi}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${marker.pct}%`,
                        top: (ROW_H - 6) / 2,
                        width: 6,
                        height: 6,
                        marginLeft: -3,
                        backgroundColor: marker.isLate ? "#DC2626" : "#10B981",
                        transform: "rotate(45deg)",
                        zIndex: 15,
                      }}
                      title={`${marker.isFinish ? "Conclusão" : "Início"} real${marker.isLate ? " (atrasado)" : " (adiantado)"}`}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* CCPM Buffer bars */}
      {buffers && buffers.length > 0 && (
        <div className="flex items-center" style={{ height: ROW_H }}>
          <div
            className="flex-shrink-0 text-[9px] text-gray-400 truncate pr-1"
            style={{ width: LABEL_W }}
          >
            Buffers
          </div>
          <div className="flex-1 relative h-full">
            {buffers.map((buf, bi) => {
              const bufStartMs = new Date(buf.startDate).getTime();
              const bufEndMs = new Date(buf.finishDate).getTime();
              const bufStartPct = ((bufStartMs - startMs) / totalMs) * 100;
              const bufWidthPct = Math.max(0.5, ((bufEndMs - bufStartMs) / totalMs) * 100);
              const zoneColor =
                buf.zone === "green" ? "#10B981" :
                buf.zone === "yellow" ? "#D97706" : "#DC2626";

              return (
                <div
                  key={`buf-${bi}`}
                  className="absolute top-0.5 rounded-sm"
                  style={{
                    left: `${bufStartPct}%`,
                    width: `${bufWidthPct}%`,
                    height: ROW_H - 4,
                    background: zoneColor,
                    opacity: 0.55,
                    border: "1px dashed rgba(255,255,255,0.5)",
                    minWidth: 2,
                  }}
                  title={`${buf.name} — ${buf.durationDays}d (${Math.round(100 - buf.consumedPercent)}% restante)`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Milestone diamonds */}
      {milestones && milestones.length > 0 && (
        <div className="absolute pointer-events-none" style={{ top: 0, left: LABEL_W, right: 0, height: ganttHeight }}>
          {milestones.map((ms, mi) => {
            const msPct = ((new Date(ms.startDate).getTime() - startMs) / totalMs) * 100;
            if (msPct < 0 || msPct > 100) return null;
            return (
              <div
                key={`ms-${mi}`}
                className="absolute"
                style={{
                  left: `${msPct}%`,
                  top: -1,
                  zIndex: 20,
                }}
                title={ms.name}
              >
                <div
                  className="w-2 h-2 rotate-45 border"
                  style={{
                    backgroundColor: "#F59E0B",
                    borderColor: "#D97706",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Bottleneck markers (red circles above timeline) */}
      {bottlenecks && bottlenecks.length > 0 && (
        <div className="absolute pointer-events-none" style={{ top: -6, left: LABEL_W, right: 0, height: 12 }}>
          {bottlenecks.map((b, bi) => {
            const bMs = new Date(b.date).getTime();
            const bPct = ((bMs - startMs) / totalMs) * 100;
            if (bPct < 0 || bPct > 100) return null;
            return (
              <div
                key={`bn-${bi}`}
                className="absolute"
                style={{
                  left: `${bPct}%`,
                  top: 0,
                  zIndex: 25,
                }}
                title={b.reason}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full border border-white"
                  style={{
                    backgroundColor:
                      b.severity === "high" ? "#DC2626" :
                      b.severity === "medium" ? "#D97706" : "#FBBF24",
                    marginLeft: -5,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden phases indicator */}
      {hiddenCount > 0 && (
        <div className="text-[9px] text-gray-400 text-center" style={{ height: 14, lineHeight: "14px" }}>
          +{hiddenCount} fases
        </div>
      )}

      {/* Actual date diamond markers legend */}
      {progressEntries && progressEntries.length > 0 && (
        <div className="flex items-center gap-3 px-2 text-[8px] text-gray-400" style={{ height: 14, lineHeight: "14px" }}>
          <span className="flex items-center gap-1">
            <span className="inline-block w-[6px] h-[6px] rotate-45" style={{ backgroundColor: "#10B981" }} />
            Adiantado
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-[6px] h-[6px] rotate-45" style={{ backgroundColor: "#DC2626" }} />
            Atrasado
          </span>
          <span className="text-gray-300">◆ Datas reais</span>
        </div>
      )}

      {/* Playhead */}
      <div
        className="absolute top-0 w-px bg-red-500 pointer-events-none"
        style={{
          left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${playheadPct / 100})`,
          height: ganttHeight,
        }}
      />

      {/* Hover tooltip */}
      {hover && (
        <div
          className="fixed z-50 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg pointer-events-none"
          style={{
            left: Math.min(hover.x + 8, (typeof window !== "undefined" ? window.innerWidth : 9999) - 200),
            top: Math.max(hover.y - 32, 8),
          }}
        >
          <p className="font-medium">{hover.taskName}</p>
          <p className="text-gray-300">{hover.dates}</p>
        </div>
      )}
    </div>
  );
}

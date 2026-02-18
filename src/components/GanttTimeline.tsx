"use client";

import { useMemo, useCallback, useRef, useState } from "react";
import type { ScheduleTask, ConstructionPhase } from "@/lib/wbs-types";
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

const ROW_H = 16;
const LABEL_W = 72;

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
}: GanttTimelineProps) {
  const ganttRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const totalMs = finishMs - startMs || 1;
  const playheadPct = ((currentMs - startMs) / totalMs) * 100;

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

  // Click-to-seek on the Gantt area
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
    [startMs, finishMs, totalMs, onSeek],
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
    (e: React.MouseEvent, bar: PhaseBar) => {
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

  // Hover handler
  const handleBarHover = useCallback(
    (e: React.MouseEvent, bar: PhaseBar) => {
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

  const ganttHeight = Math.min(phaseRows.length * ROW_H, 8 * ROW_H);
  const visibleRows = phaseRows.slice(0, 8);
  const hiddenCount = phaseRows.length - visibleRows.length;

  return (
    <div
      ref={ganttRef}
      className="relative select-none cursor-pointer"
      style={{ height: ganttHeight + (hiddenCount > 0 ? 14 : 0) }}
      onClick={handleClick}
      onMouseLeave={() => setHover(null)}
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
            className="flex-shrink-0 text-[9px] text-gray-500 truncate pr-1"
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
              return (
                <div
                  key={j}
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
                  onClick={(e) => handleBarClick(e, bar)}
                  onMouseEnter={(e) => handleBarHover(e, bar)}
                  onMouseMove={(e) => handleBarHover(e, bar)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Hidden phases indicator */}
      {hiddenCount > 0 && (
        <div className="text-[9px] text-gray-400 text-center" style={{ height: 14, lineHeight: "14px" }}>
          +{hiddenCount} fases
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
          style={{ left: hover.x + 8, top: hover.y - 32 }}
        >
          <p className="font-medium">{hover.taskName}</p>
          <p className="text-gray-300">{hover.dates}</p>
        </div>
      )}
    </div>
  );
}

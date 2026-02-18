"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Pause, SkipForward, SkipBack, Calendar } from "lucide-react";
import type { ProjectSchedule, ScheduleTask } from "@/lib/wbs-types";
import type { ConstructionPhase } from "@/lib/wbs-types";
import { phaseColor, phaseLabel } from "@/lib/phase-colors";
import GanttTimeline from "./GanttTimeline";

// ============================================================
// Types
// ============================================================

export interface TimelineState {
  /** Current date in the timeline (ISO string) */
  currentDate: string;
  isPlaying: boolean;
  speed: number;
  /** Construction phases active at current date */
  activePhases: string[];
  /** Tasks currently in progress */
  activeTasks: ScheduleTask[];
  /** Number of detail tasks completed */
  completedTasks: number;
  /** Total detail tasks in schedule */
  totalTasks: number;
  /** Accumulated cost up to current date (EUR) */
  accumulatedCost: number;
  /** Workers on site at current date */
  activeWorkers: number;
}

export interface TimelinePlayerProps {
  schedule: ProjectSchedule;
  onStateChange: (state: TimelineState) => void;
  /** Fired when user clicks a Gantt bar — forwards task UIDs */
  onBarSelect?: (taskUids: number[]) => void;
  /** Task UIDs currently selected (for Gantt bar visual ring) */
  selectedTaskUids?: Set<number>;
  /** Critical path task UIDs (red accent on Gantt bars) */
  criticalPathUids?: Set<number>;
  className?: string;
}

// ============================================================
// Helpers
// ============================================================

const SPEEDS = [1, 2, 5, 10];
const MS_PER_DAY = 86_400_000;
const TICK_MS = 100; // 10 fps animation

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

function formatPT(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ============================================================
// Component
// ============================================================

export default function TimelinePlayer({
  schedule,
  onStateChange,
  onBarSelect,
  selectedTaskUids,
  criticalPathUids,
  className = "",
}: TimelinePlayerProps) {
  const startMs = useMemo(() => toMs(schedule.startDate), [schedule.startDate]);
  const finishMs = useMemo(() => toMs(schedule.finishDate), [schedule.finishDate]);
  const totalMs = finishMs - startMs;

  const [currentMs, setCurrentMs] = useState(startMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detail (non-summary) tasks only
  const detailTasks = useMemo(
    () => schedule.tasks.filter((t) => !t.isSummary),
    [schedule.tasks],
  );

  // ── Compute timeline state ─────────────────────────────────
  const timelineState = useMemo((): TimelineState => {
    const currentDate = toIso(currentMs);
    const activePhaseSet = new Set<string>();
    const activeTasks: ScheduleTask[] = [];
    let completedTasks = 0;
    let accumulatedCost = 0;
    let activeWorkers = 0;

    for (const task of detailTasks) {
      const tStart = toMs(task.startDate);
      const tFinish = toMs(task.finishDate);

      if (currentMs >= tFinish) {
        // Task complete
        completedTasks++;
        accumulatedCost += task.cost;
      } else if (currentMs >= tStart) {
        // Task in progress
        activeTasks.push(task);
        activePhaseSet.add(task.phase);
        const elapsed = currentMs - tStart;
        const duration = tFinish - tStart || 1;
        accumulatedCost += task.cost * (elapsed / duration);
        for (const r of task.resources) {
          if (r.type === "labor") activeWorkers += r.units;
        }
      }
    }

    return {
      currentDate,
      isPlaying,
      speed,
      activePhases: Array.from(activePhaseSet),
      activeTasks,
      completedTasks,
      totalTasks: detailTasks.length,
      accumulatedCost: Math.round(accumulatedCost),
      activeWorkers,
    };
  }, [currentMs, isPlaying, speed, detailTasks]);

  // ── Notify parent ──────────────────────────────────────────
  useEffect(() => {
    onStateChange(timelineState);
  }, [timelineState, onStateChange]);

  // ── Animation loop ─────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentMs((prev) => {
          const next = prev + (MS_PER_DAY * speed * TICK_MS) / 1000;
          if (next >= finishMs) {
            setIsPlaying(false);
            return finishMs;
          }
          return next;
        });
      }, TICK_MS);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed, finishMs]);

  // ── Controls ───────────────────────────────────────────────
  const progress = totalMs > 0 ? (currentMs - startMs) / totalMs : 0;

  const handleSeek = useCallback(
    (ms: number) => {
      setCurrentMs(ms);
    },
    [],
  );

  const handleSkipBack = useCallback(() => {
    setCurrentMs(startMs);
    setIsPlaying(false);
  }, [startMs]);

  const handleSkipForward = useCallback(() => {
    setCurrentMs(finishMs);
    setIsPlaying(false);
  }, [finishMs]);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => SPEEDS[(SPEEDS.indexOf(prev) + 1) % SPEEDS.length]);
  }, []);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className={`bg-white border-t border-gray-200 ${className}`}>
      {/* Gantt timeline */}
      <div className="px-4 pt-3">
        <GanttTimeline
          tasks={detailTasks}
          startMs={startMs}
          finishMs={finishMs}
          currentMs={currentMs}
          onSeek={handleSeek}
          onBarSelect={onBarSelect}
          selectedTaskUids={selectedTaskUids}
          criticalPathUids={criticalPathUids}
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>{formatPT(startMs)}</span>
          <span>{formatPT(finishMs)}</span>
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          onClick={handleSkipBack}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Início"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-2 bg-accent text-white rounded-full hover:bg-accent-hover transition-colors"
          title={isPlaying ? "Pausar" : "Reproduzir"}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>
        <button
          onClick={handleSkipForward}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Fim"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          onClick={cycleSpeed}
          className="px-2 py-0.5 text-xs font-mono font-medium text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors min-w-[3rem]"
          title="Velocidade"
        >
          {speed}x
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-800">
              {formatPT(currentMs)}
            </p>
            <p className="text-[10px] text-gray-400">
              {timelineState.completedTasks}/{timelineState.totalTasks} tarefas
            </p>
          </div>
          <label className="relative cursor-pointer" title="Saltar para data">
            <Calendar className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors" />
            <input
              type="date"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              min={toIso(startMs)}
              max={toIso(finishMs)}
              value={toIso(currentMs)}
              onChange={(e) => {
                if (e.target.value) {
                  const ms = new Date(e.target.value).getTime();
                  if (ms >= startMs && ms <= finishMs) {
                    handleSeek(ms);
                  }
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* Active phases & stats */}
      {timelineState.activePhases.length > 0 && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {timelineState.activePhases.map((phase) => (
              <span
                key={phase}
                className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                style={{
                  backgroundColor: `${phaseColor(phase as ConstructionPhase)}15`,
                  color: phaseColor(phase as ConstructionPhase),
                }}
              >
                {phaseLabel(phase as ConstructionPhase)}
              </span>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
            <span>{timelineState.activeWorkers} trabalhadores</span>
            <span>
              {timelineState.accumulatedCost.toLocaleString("pt-PT")} &euro;
            </span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

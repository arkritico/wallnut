"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  ClipboardList,
  GitCompareArrows,
  BarChart3,
  Film,
  Settings,
} from "lucide-react";
import type { FragmentsModel } from "@thatopen/fragments";
import type { ProjectSchedule, ScheduleTask, ConstructionPhase } from "@/lib/wbs-types";
import type { ElementTaskMappingResult, ElementTaskLink } from "@/lib/element-task-mapper";
import { normalizeStorey } from "@/lib/element-task-mapper";
import { phaseColor } from "@/lib/phase-colors";
import {
  captureBaseline,
  computeEvmSnapshot,
  type EvmBaseline,
  type TaskProgress,
} from "@/lib/earned-value";
import type { PhaseHighlight } from "./IfcViewer";
import type { LegendPhase } from "./FourDLegend";
import TimelinePlayer, { type TimelineState } from "./TimelinePlayer";
import StoreyFilter from "./StoreyFilter";
import ElementInfoPanel from "./ElementInfoPanel";
import FourDLegend from "./FourDLegend";
import ProgressPanel from "./ProgressPanel";
import ResourceHistogramChart from "./ResourceHistogramChart";
import VideoExportDialog from "./VideoExportDialog";
import CapacityPanel from "./CapacityPanel";
import type { OptimizedSchedule } from "@/lib/site-capacity-optimizer";

const IfcViewer = dynamic(() => import("./IfcViewer"), { ssr: false });

// ============================================================
// Types
// ============================================================

export interface FourDViewerProps {
  schedule: ProjectSchedule;
  elementMapping: ElementTaskMappingResult;
  ifcData?: Uint8Array;
  ifcName?: string;
  /** Called when user applies an optimized schedule (for MS Project re-export) */
  onScheduleOptimized?: (optimizedSchedule: ProjectSchedule) => void;
  className?: string;
}

/** Map from schedule task UID → set of fragment localIds */
type TaskLocalIdMap = Map<number, Set<number>>;

/** Comparison mode for planned vs actual overlay */
export type ComparisonMode = "off" | "overlay" | "heatmap";

// ============================================================
// Comparison color helpers
// ============================================================

/** Color codes for planned vs actual comparison overlay */
const COMPARISON_COLORS = {
  ahead: "#10B981",     // emerald-500 — ahead of schedule
  onTrack: "#6b7280",   // gray-500 — on track (use phase color)
  behind: "#D97706",    // amber-600 — behind schedule
  delayed: "#DC2626",   // red-600 — significantly delayed
} as const;

/**
 * Get comparison color for a task based on actual vs planned progress.
 * Returns null if the task should use its normal phase color.
 */
function getComparisonColor(
  actualPct: number,
  plannedPct: number,
): string | null {
  const delta = actualPct - plannedPct;
  if (delta > 5) return COMPARISON_COLORS.ahead;
  if (delta >= -10) return null; // on track → use normal phase color
  if (delta >= -25) return COMPARISON_COLORS.behind;
  return COMPARISON_COLORS.delayed;
}

/**
 * Get heatmap color from SPI value.
 */
function getSpiColor(spi: number): string {
  if (spi >= 1.0) return COMPARISON_COLORS.ahead;
  if (spi >= 0.75) return COMPARISON_COLORS.behind;
  return COMPARISON_COLORS.delayed;
}

// ============================================================
// Visual state computation
// ============================================================

interface VisualState {
  /** All visible element IDs (for Hider show/hide) */
  visibility: Record<string, Set<number>>;
  /** Completed elements: full phase color, high opacity */
  completedIds: Map<ConstructionPhase, Set<number>>;
  /** In-progress elements: phase color, ghosted */
  inProgressIds: Map<ConstructionPhase, Set<number>>;
  /** Future elements: faint ghost preview */
  futureIds: Set<number>;
}

/**
 * Determine which elements to show and their visual status.
 * - Task finished → completed (solid)
 * - Task started but not finished → in-progress (ghosted)
 * - Task not started → ghost (faint wireframe preview)
 */
function computeVisualState(
  modelId: string,
  currentDate: string,
  taskByUid: Map<number, ScheduleTask>,
  taskLocalIds: TaskLocalIdMap,
  storeyFilter: string | null,
  localIdToLinks: Map<number, ElementTaskLink[]>,
): VisualState | undefined {
  if (taskLocalIds.size === 0) return undefined;

  const currentMs = new Date(currentDate).getTime();
  const allVisible = new Set<number>();
  const completedIds = new Map<ConstructionPhase, Set<number>>();
  const inProgressIds = new Map<ConstructionPhase, Set<number>>();
  const futureIds = new Set<number>();

  const normFilter = storeyFilter ? normalizeStorey(storeyFilter) : null;

  for (const [taskUid, localIds] of taskLocalIds) {
    const task = taskByUid.get(taskUid);
    if (!task) continue;

    const taskStartMs = new Date(task.startDate).getTime();
    const taskFinishMs = new Date(task.finishDate).getTime();
    const notStarted = currentMs < taskStartMs;
    const isCompleted = !notStarted && currentMs >= taskFinishMs;

    for (const id of localIds) {
      // Storey filter
      if (normFilter) {
        const links = localIdToLinks.get(id);
        if (links) {
          const matchesStorey = links.some(
            (l) => l.storey && normalizeStorey(l.storey) === normFilter,
          );
          if (!matchesStorey) continue;
        }
      }

      allVisible.add(id);

      if (notStarted) {
        futureIds.add(id);
        continue;
      }

      // Determine phase
      const links = localIdToLinks.get(id);
      if (!links || links.length === 0) continue;
      const phase = links[0].phase;

      const targetMap = isCompleted ? completedIds : inProgressIds;
      const group = targetMap.get(phase);
      if (group) group.add(id);
      else targetMap.set(phase, new Set([id]));
    }
  }

  return {
    visibility: { [modelId]: allVisible },
    completedIds,
    inProgressIds,
    futureIds,
  };
}

// ============================================================
// Comparison mode label helper
// ============================================================

const COMPARISON_LABELS: Record<ComparisonMode, string> = {
  off: "Desligado",
  overlay: "Sobreposição",
  heatmap: "Mapa calor",
};

function nextComparisonMode(current: ComparisonMode): ComparisonMode {
  if (current === "off") return "overlay";
  if (current === "overlay") return "heatmap";
  return "off";
}

// ============================================================
// Component
// ============================================================

export default function FourDViewer({
  schedule,
  elementMapping,
  ifcData,
  ifcName,
  onScheduleOptimized,
  className = "",
}: FourDViewerProps) {
  const [modelId, setModelId] = useState<string | null>(null);
  const [taskLocalIds, setTaskLocalIds] = useState<TaskLocalIdMap>(new Map());
  const [timelineState, setTimelineState] = useState<TimelineState | null>(null);
  const [mappingStatus, setMappingStatus] = useState<string>("");
  const [storeyFilter, setStoreyFilter] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<ElementTaskLink | null>(null);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [selectedTaskUids, setSelectedTaskUids] = useState<Set<number>>(new Set());
  const [isolatedPhase, setIsolatedPhase] = useState<ConstructionPhase | null>(null);
  const modelRef = useRef<FragmentsModel | null>(null);
  const localIdToLinksRef = useRef<Map<number, ElementTaskLink[]>>(new Map());

  // ── Progress tracking state ──────────────────────────────
  const [progressEntries, setProgressEntries] = useState<TaskProgress[]>([]);
  const [baseline, setBaseline] = useState<EvmBaseline | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("off");
  const [showHistogram, setShowHistogram] = useState(false);
  const [showCapacity, setShowCapacity] = useState(false);
  const [optimizedResult, setOptimizedResult] = useState<OptimizedSchedule | null>(null);
  const [showVideoExport, setShowVideoExport] = useState(false);
  const [videoSeekMs, setVideoSeekMs] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const togglePlayRef = useRef<(() => void) | null>(null);

  // ── Progress map for quick lookup ────────────────────────
  const progressMap = useMemo(
    () => new Map(progressEntries.map((p) => [p.taskUid, p])),
    [progressEntries],
  );

  // ── Build GUID→task mapping index ──────────────────────────
  const guidToLinks = useMemo(() => {
    const map = new Map<string, ElementTaskLink[]>();
    for (const link of elementMapping.links) {
      const existing = map.get(link.elementId);
      if (existing) existing.push(link);
      else map.set(link.elementId, [link]);
    }
    return map;
  }, [elementMapping.links]);

  // ── Unique storeys for filter ──────────────────────────────
  const allStoreys = useMemo(() => {
    const set = new Set<string>();
    for (const link of elementMapping.links) {
      if (link.storey) set.add(link.storey);
    }
    return Array.from(set);
  }, [elementMapping.links]);

  // ── Task lookup ────────────────────────────────────────────
  const taskByUid = useMemo(() => {
    const map = new Map<number, ScheduleTask>();
    for (const t of schedule.tasks) map.set(t.uid, t);
    return map;
  }, [schedule.tasks]);

  // ── Critical path UIDs ──────────────────────────────────────
  const criticalPathUids = useMemo(
    () => new Set(schedule.criticalPath),
    [schedule.criticalPath],
  );

  // ── When model loads, bridge GUIDs → localIds ──────────────
  const handleModelLoaded = useCallback(
    async (model: FragmentsModel) => {
      modelRef.current = model;
      setModelId(model.modelId);

      const guids = Array.from(guidToLinks.keys());
      if (guids.length === 0) {
        setMappingStatus("Sem mapeamento elemento\u2192tarefa");
        return;
      }

      setMappingStatus("A resolver IDs...");

      try {
        const localIds = await model.getLocalIdsByGuids(guids);

        const taskMap: TaskLocalIdMap = new Map();
        const localIdMap = new Map<number, ElementTaskLink[]>();
        let resolved = 0;

        for (let i = 0; i < guids.length; i++) {
          const localId = localIds[i];
          if (localId == null) continue;
          resolved++;

          const links = guidToLinks.get(guids[i]);
          if (!links) continue;

          // Build localId → links reverse map
          const existing = localIdMap.get(localId);
          if (existing) existing.push(...links);
          else localIdMap.set(localId, [...links]);

          for (const link of links) {
            const existingTask = taskMap.get(link.taskUid);
            if (existingTask) existingTask.add(localId);
            else taskMap.set(link.taskUid, new Set([localId]));
          }
        }

        localIdToLinksRef.current = localIdMap;
        setTaskLocalIds(taskMap);
        setMappingStatus(
          `${resolved}/${guids.length} elementos mapeados (${taskMap.size} tarefas)`,
        );
      } catch (err) {
        console.error("Failed to resolve GUID\u2192localId mapping:", err);
        setMappingStatus("Erro ao mapear elementos");
      }
    },
    [guidToLinks],
  );

  // ── Element selection handler (3D → info panel + Gantt) ─────
  const handleElementSelect = useCallback(
    (localId: number | null, _modelId: string) => {
      if (localId == null) {
        setSelectedLink(null);
        setSelectedTask(null);
        setSelectedTaskUids(new Set());
        return;
      }
      const links = localIdToLinksRef.current.get(localId);
      if (links && links.length > 0) {
        const link = links[0];
        setSelectedLink(link);
        setSelectedTask(taskByUid.get(link.taskUid) ?? null);
        setSelectedTaskUids(new Set([link.taskUid]));
      } else {
        setSelectedLink(null);
        setSelectedTask(null);
        setSelectedTaskUids(new Set());
      }
    },
    [taskByUid],
  );

  // ── Gantt bar selection handler (Gantt → 3D) ─────────────
  const handleBarSelect = useCallback((taskUids: number[]) => {
    setSelectedTaskUids(new Set(taskUids));
    // Clear element-level selection when selecting from Gantt
    setSelectedLink(null);
    setSelectedTask(null);
  }, []);

  // ── Compute visual state from timeline ──────────────────────
  const visualState = useMemo(() => {
    if (!modelId || !timelineState) return undefined;
    return computeVisualState(
      modelId,
      timelineState.currentDate,
      taskByUid,
      taskLocalIds,
      storeyFilter,
      localIdToLinksRef.current,
    );
  }, [modelId, timelineState, taskByUid, taskLocalIds, storeyFilter]);

  // ── Apply phase isolation filter ──────────────────────────────
  const visibilityMap = useMemo(() => {
    if (!visualState || !modelId) return visualState?.visibility;
    if (!isolatedPhase) return visualState.visibility;

    // When a phase is isolated, only show elements belonging to that phase
    const isolatedIds = new Set<number>();
    const completed = visualState.completedIds.get(isolatedPhase);
    const inProgress = visualState.inProgressIds.get(isolatedPhase);
    if (completed) completed.forEach((id) => isolatedIds.add(id));
    if (inProgress) inProgress.forEach((id) => isolatedIds.add(id));
    return { [modelId]: isolatedIds };
  }, [visualState, modelId, isolatedPhase]);

  // ── Compute planned % per task at current date ──────────────
  const plannedPctByTask = useMemo(() => {
    if (!timelineState) return new Map<number, number>();
    const currentMs = new Date(timelineState.currentDate).getTime();
    const map = new Map<number, number>();
    for (const [uid, task] of taskByUid) {
      if (task.isSummary) continue;
      const startMs = new Date(task.startDate).getTime();
      const finishMs = new Date(task.finishDate).getTime();
      const duration = finishMs - startMs;
      if (duration <= 0) {
        map.set(uid, currentMs >= startMs ? 100 : 0);
      } else if (currentMs >= finishMs) {
        map.set(uid, 100);
      } else if (currentMs <= startMs) {
        map.set(uid, 0);
      } else {
        map.set(uid, Math.round(((currentMs - startMs) / duration) * 100));
      }
    }
    return map;
  }, [timelineState, taskByUid]);

  // ── EVM snapshot for heatmap SPI per task ───────────────────
  const taskSpiMap = useMemo(() => {
    if (comparisonMode !== "heatmap" || !baseline) return new Map<number, number>();
    const snapshot = computeEvmSnapshot(
      baseline,
      schedule,
      progressEntries,
      timelineState?.currentDate,
    );
    const map = new Map<number, number>();
    for (const tm of snapshot.taskMetrics) {
      map.set(tm.taskUid, tm.spiRaw);
    }
    return map;
  }, [comparisonMode, baseline, schedule, progressEntries, timelineState?.currentDate]);

  // ── Pre-compute comparison color per task (avoids per-element duplication) ──
  const taskComparisonColors = useMemo((): Map<number, string> => {
    if (comparisonMode === "off" || progressEntries.length === 0) return new Map();
    const colors = new Map<number, string>();
    for (const [uid, task] of taskByUid) {
      if (task.isSummary) continue;
      if (comparisonMode === "heatmap") {
        const spi = taskSpiMap.get(uid) ?? (progressMap.has(uid) ? 1 : 0);
        colors.set(uid, getSpiColor(spi));
      } else {
        // overlay mode
        const actualPct = progressMap.get(uid)?.percentComplete ?? 0;
        const plannedPct = plannedPctByTask.get(uid) ?? 0;
        const c = getComparisonColor(actualPct, plannedPct);
        if (c) colors.set(uid, c);
        // null → use phase color (no entry in map)
      }
    }
    return colors;
  }, [comparisonMode, progressEntries, taskByUid, taskSpiMap, progressMap, plannedPctByTask]);

  // ── Phase highlights: ghost → in-progress → completed (layered) ──
  // Modified to support comparison overlay/heatmap modes
  const phaseHighlights = useMemo((): PhaseHighlight[] | undefined => {
    if (!modelId || !visualState) return undefined;
    const highlights: PhaseHighlight[] = [];
    const hasComparison = comparisonMode !== "off" && progressEntries.length > 0;

    // Ghost future elements first (very faint, underneath everything)
    // Skip ghosts when a phase is isolated
    if (!isolatedPhase && visualState.futureIds.size > 0) {
      highlights.push({
        color: "#9ca3af", // gray-400
        opacity: 0.08,
        elements: { [modelId]: visualState.futureIds },
      });
    }

    if (hasComparison) {
      // ── Comparison mode: batch localIds by (color, opacity) ──
      // Uses pre-computed taskComparisonColors for O(1) lookup per element.
      // Groups all localIds sharing the same color+opacity into one highlight.
      const colorGroups = new Map<string, Set<number>>();

      const addToGroup = (color: string, opacity: number, id: number) => {
        const key = `${color}:${opacity}`;
        const existing = colorGroups.get(key);
        if (existing) {
          existing.add(id);
        } else {
          colorGroups.set(key, new Set([id]));
        }
      };

      // Process in-progress elements
      for (const [phase, ids] of visualState.inProgressIds) {
        if (isolatedPhase && phase !== isolatedPhase) continue;
        for (const id of ids) {
          const links = localIdToLinksRef.current.get(id);
          if (!links || links.length === 0) continue;
          const color = taskComparisonColors.get(links[0].taskUid) ?? phaseColor(phase);
          addToGroup(color, 0.35, id);
        }
      }

      // Process completed elements
      for (const [phase, ids] of visualState.completedIds) {
        if (isolatedPhase && phase !== isolatedPhase) continue;
        for (const id of ids) {
          const links = localIdToLinksRef.current.get(id);
          if (!links || links.length === 0) continue;
          const color = taskComparisonColors.get(links[0].taskUid) ?? phaseColor(phase);
          addToGroup(color, 0.85, id);
        }
      }

      // Convert grouped colors into highlights
      for (const [key, ids] of colorGroups) {
        const color = key.split(":")[0];
        const opacity = parseFloat(key.split(":")[1]);
        highlights.push({
          color,
          opacity,
          elements: { [modelId]: ids },
        });
      }
    } else {
      // ── Normal mode: phase colors ──
      // In-progress second (lower opacity)
      for (const [phase, ids] of visualState.inProgressIds) {
        if (isolatedPhase && phase !== isolatedPhase) continue;
        highlights.push({
          color: phaseColor(phase),
          opacity: 0.25,
          elements: { [modelId]: ids },
        });
      }

      // Completed last (higher opacity, rendered on top)
      for (const [phase, ids] of visualState.completedIds) {
        if (isolatedPhase && phase !== isolatedPhase) continue;
        highlights.push({
          color: phaseColor(phase),
          opacity: 0.8,
          elements: { [modelId]: ids },
        });
      }
    }

    return highlights.length > 0 ? highlights : undefined;
  }, [modelId, visualState, isolatedPhase, comparisonMode, progressEntries, taskComparisonColors]);

  // ── Selection highlights (white glow on selected task elements) ──
  const selectedLocalIds = useMemo((): Set<number> => {
    if (selectedTaskUids.size === 0) return new Set();
    const ids = new Set<number>();
    for (const uid of selectedTaskUids) {
      const taskIds = taskLocalIds.get(uid);
      if (taskIds) taskIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [selectedTaskUids, taskLocalIds]);

  const selectionHighlights = useMemo((): PhaseHighlight[] | undefined => {
    if (selectedLocalIds.size === 0 || !modelId) return undefined;
    return [{
      color: "#ffffff",
      opacity: 0.5,
      elements: { [modelId]: selectedLocalIds },
    }];
  }, [selectedLocalIds, modelId]);

  // ── Camera fly-to target (triggered by selection) ──────────
  const flyToTarget = useMemo((): Record<string, Set<number>> | undefined => {
    if (selectedLocalIds.size === 0 || !modelId) return undefined;
    return { [modelId]: selectedLocalIds };
  }, [selectedLocalIds, modelId]);

  // ── Legend data ─────────────────────────────────────────────
  const legendData = useMemo((): LegendPhase[] => {
    if (!visualState) return [];

    const activePhaseSet = new Set(timelineState?.activePhases ?? []);
    const phaseData = new Map<ConstructionPhase, { completed: number; inProgress: number }>();

    for (const [phase, ids] of visualState.completedIds) {
      const entry = phaseData.get(phase) ?? { completed: 0, inProgress: 0 };
      entry.completed += ids.size;
      phaseData.set(phase, entry);
    }
    for (const [phase, ids] of visualState.inProgressIds) {
      const entry = phaseData.get(phase) ?? { completed: 0, inProgress: 0 };
      entry.inProgress += ids.size;
      phaseData.set(phase, entry);
    }

    return Array.from(phaseData.entries()).map(([phase, data]) => ({
      phase,
      completedCount: data.completed,
      inProgressCount: data.inProgress,
      active: activePhaseSet.has(phase),
    }));
  }, [visualState, timelineState?.activePhases]);

  // ── Phase stats for info bar ───────────────────────────────
  const phaseStats = useMemo(() => {
    if (!timelineState) return null;
    const stats = {
      notStarted: 0,
      inProgress: timelineState.activeTasks.length,
      completed: timelineState.completedTasks,
      total: timelineState.totalTasks,
    };
    stats.notStarted = stats.total - stats.inProgress - stats.completed;
    return stats;
  }, [timelineState]);

  // ── 3D coverage stats ─────────────────────────────────────
  const coverageStats = useMemo(() => {
    const allPhases = new Set<string>();
    for (const t of schedule.tasks) {
      if (!t.isSummary) allPhases.add(t.phase);
    }
    const mappedPhases = new Set<string>();
    for (const link of elementMapping.links) {
      mappedPhases.add(link.phase);
    }
    return { total: allPhases.size, mapped: mappedPhases.size };
  }, [schedule.tasks, elementMapping.links]);

  // Does the current timeline position have any 3D elements?
  const currentPhasesHave3D = useMemo(() => {
    if (!timelineState || timelineState.activeTasks.length === 0) return true;
    return timelineState.activeTasks.some(task => taskLocalIds.has(task.uid));
  }, [timelineState, taskLocalIds]);

  // ── Progress toolbar handlers ──────────────────────────────
  const handleToggleProgress = useCallback(() => {
    setShowProgress((prev) => !prev);
  }, []);

  const handleCycleComparison = useCallback(() => {
    setComparisonMode((prev) => nextComparisonMode(prev));
  }, []);

  const handleBaselineCapture = useCallback((bl: EvmBaseline) => {
    setBaseline(bl);
  }, []);

  const handleToggleHistogram = useCallback(() => {
    setShowHistogram((prev) => !prev);
  }, []);

  const handleToggleCapacity = useCallback(() => {
    setShowCapacity((prev) => !prev);
  }, []);

  /** Store optimization result and notify parent with optimized schedule */
  const handleOptimized = useCallback((result: OptimizedSchedule) => {
    setOptimizedResult(result);
    if (onScheduleOptimized) {
      // Build a new ProjectSchedule with the optimized tasks
      const optimizedSchedule: ProjectSchedule = {
        ...schedule,
        tasks: result.optimizedTasks,
        totalDurationDays: result.optimizedDuration,
      };
      // Recompute finish date from optimized tasks
      const finishes = result.optimizedTasks
        .filter((t) => !t.isSummary)
        .map((t) => t.finishDate)
        .sort();
      if (finishes.length > 0) {
        optimizedSchedule.finishDate = finishes[finishes.length - 1];
      }
      onScheduleOptimized(optimizedSchedule);
    }
  }, [schedule, onScheduleOptimized]);

  const handleToggleVideoExport = useCallback(() => {
    setShowVideoExport((prev) => !prev);
  }, []);

  /** Video export seeks timeline by updating currentMs in TimelinePlayer via state */
  const handleVideoSeek = useCallback((dateMs: number) => {
    setVideoSeekMs(dateMs);
  }, []);

  // ── Keyboard shortcuts (Space/P/C/R) ──────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip when typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlayRef.current?.();
          break;
        case "KeyP":
          handleToggleProgress();
          break;
        case "KeyC":
          if (progressEntries.length > 0) handleCycleComparison();
          break;
        case "KeyR":
          handleToggleHistogram();
          break;
        case "KeyO":
          handleToggleCapacity();
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleProgress, handleCycleComparison, handleToggleHistogram, handleToggleCapacity, progressEntries.length]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className={`flex flex-col ${className}`}>
      {/* 3D viewport with overlays */}
      <div className="flex-1 min-h-[400px] md:min-h-0 relative">
        <IfcViewer
          ifcData={ifcData}
          ifcName={ifcName}
          onModelLoaded={handleModelLoaded}
          onElementSelect={handleElementSelect}
          visibilityMap={visibilityMap}
          phaseHighlights={phaseHighlights}
          selectionHighlights={selectionHighlights}
          flyToTarget={flyToTarget}
          externalVisibilityControl
          canvasRef={canvasRef}
          className="h-full"
        />

        {/* Storey filter pills */}
        <StoreyFilter
          storeys={allStoreys}
          selected={storeyFilter}
          onSelect={setStoreyFilter}
        />

        {/* Element info panel (right side) */}
        <ElementInfoPanel
          link={selectedLink}
          task={selectedTask}
          onClose={() => {
            setSelectedLink(null);
            setSelectedTask(null);
            setSelectedTaskUids(new Set());
          }}
        />

        {/* Phase legend (bottom-left) */}
        <FourDLegend
          phases={legendData}
          isolatedPhase={isolatedPhase}
          onPhaseClick={setIsolatedPhase}
        />

        {/* Progress panel (left side) */}
        {showProgress && (
          <ProgressPanel
            schedule={schedule}
            progress={progressEntries}
            baseline={baseline}
            onProgressChange={setProgressEntries}
            onBaselineCapture={handleBaselineCapture}
            onClose={() => setShowProgress(false)}
          />
        )}

        {/* Capacity optimizer panel (left side) */}
        {showCapacity && (
          <CapacityPanel
            schedule={schedule}
            onOptimized={handleOptimized}
            onClose={() => setShowCapacity(false)}
          />
        )}

        {/* Synchro 4D toolbar (top-center) */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 px-1.5 py-1">
          {/* Progress panel toggle */}
          <button
            onClick={handleToggleProgress}
            className={`flex items-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[10px] font-medium rounded transition-colors min-h-[44px] sm:min-h-0 ${
              showProgress
                ? "bg-accent text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Painel de progresso"
          >
            <ClipboardList className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Progresso</span>
          </button>

          <span className="w-px h-4 bg-gray-200 hidden sm:block" />

          {/* Comparison mode toggle */}
          <button
            onClick={handleCycleComparison}
            className={`flex items-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[10px] font-medium rounded transition-colors min-h-[44px] sm:min-h-0 ${
              comparisonMode !== "off"
                ? "bg-accent text-white"
                : progressEntries.length === 0
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-600 hover:bg-gray-100"
            }`}
            disabled={progressEntries.length === 0}
            title={`Plano vs Real: ${COMPARISON_LABELS[comparisonMode]}`}
          >
            <GitCompareArrows className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">
              Plano vs Real
              {comparisonMode !== "off" && (
                <span className="ml-1 opacity-75">({COMPARISON_LABELS[comparisonMode]})</span>
              )}
            </span>
          </button>

          <span className="w-px h-4 bg-gray-200 hidden sm:block" />

          {/* Resource histogram toggle */}
          <button
            onClick={handleToggleHistogram}
            className={`flex items-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[10px] font-medium rounded transition-colors min-h-[44px] sm:min-h-0 ${
              showHistogram
                ? "bg-accent text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Histograma de recursos"
          >
            <BarChart3 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Recursos</span>
          </button>

          <span className="w-px h-4 bg-gray-200 hidden sm:block" />

          {/* Video export */}
          <button
            onClick={handleToggleVideoExport}
            className={`flex items-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[10px] font-medium rounded transition-colors min-h-[44px] sm:min-h-0 ${
              showVideoExport
                ? "bg-accent text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Exportar vídeo 4D"
          >
            <Film className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Vídeo</span>
          </button>

          <span className="w-px h-4 bg-gray-200 hidden sm:block" />

          {/* Capacity optimizer */}
          <button
            onClick={handleToggleCapacity}
            className={`flex items-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[10px] font-medium rounded transition-colors min-h-[44px] sm:min-h-0 ${
              showCapacity
                ? "bg-accent text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Capacidade do estaleiro (O)"
          >
            <Settings className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Capacidade</span>
          </button>
        </div>

        {/* Comparison legend (top-right, shown in overlay/heatmap modes) */}
        {comparisonMode !== "off" && progressEntries.length > 0 && (
          <div className="absolute top-3 right-3 z-20 bg-white/90 backdrop-blur-sm rounded-lg shadow border border-gray-200 px-3 py-2">
            <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {comparisonMode === "overlay" ? "Progresso vs Plano" : "SPI por Tarefa"}
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: COMPARISON_COLORS.ahead }} />
                <span className="text-[9px] text-gray-600">
                  {comparisonMode === "overlay" ? "Adiantado" : "SPI \u2265 1.0"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: COMPARISON_COLORS.behind }} />
                <span className="text-[9px] text-gray-600">
                  {comparisonMode === "overlay" ? "Atrasado" : "SPI 0.75\u20131.0"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: COMPARISON_COLORS.delayed }} />
                <span className="text-[9px] text-gray-600">
                  {comparisonMode === "overlay" ? "Muito atrasado" : "SPI < 0.75"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* No-geometry overlay for phases without 3D */}
        {!currentPhasesHave3D && timelineState && timelineState.activeTasks.length > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-gray-900/70 backdrop-blur-sm rounded-lg px-4 py-2.5 text-center">
              <p className="text-white/90 text-xs font-medium">
                Fase sem geometria 3D
              </p>
              <p className="text-white/50 text-[10px] mt-0.5">
                Progresso no cronograma Gantt abaixo
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-1.5 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-500">
        {mappingStatus && <span>{mappingStatus}</span>}
        {phaseStats && (
          <>
            <span className="w-px h-3 bg-gray-200" />
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              {phaseStats.notStarted} por iniciar
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent" />
              {phaseStats.inProgress} em curso
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {phaseStats.completed} concluídas
            </span>
          </>
        )}
        {coverageStats.total > 0 && (
          <>
            <span className="w-px h-3 bg-gray-200" />
            <span>{coverageStats.mapped}/{coverageStats.total} fases com 3D</span>
          </>
        )}
        {progressEntries.length > 0 && (
          <>
            <span className="w-px h-3 bg-gray-200" />
            <span className="text-accent font-medium">
              {progressEntries.filter((p) => p.percentComplete >= 100).length}/{progressEntries.length} concluídas (real)
            </span>
          </>
        )}
        {schedule.criticalChain && (
          <>
            <span className="w-px h-3 bg-gray-200" />
            <span className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  schedule.criticalChain.projectBuffer.zone === "green" ? "bg-green-500" :
                  schedule.criticalChain.projectBuffer.zone === "yellow" ? "bg-amber-500" : "bg-red-500"
                }`}
              />
              Buffer: {Math.round(100 - schedule.criticalChain.projectBuffer.consumedPercent)}%
            </span>
          </>
        )}
      </div>

      {/* Resource histogram (collapsible) */}
      {showHistogram && timelineState && (
        <ResourceHistogramChart
          schedule={schedule}
          progress={progressEntries.length > 0 ? progressEntries : undefined}
          baseline={baseline}
          currentMs={new Date(timelineState.currentDate).getTime()}
          onSeekToWeek={handleVideoSeek}
          height={160}
          capacityThreshold={optimizedResult?.originalSchedule.teamSummary.maxWorkers}
        />
      )}

      {/* Timeline controls */}
      <TimelinePlayer
        schedule={schedule}
        onStateChange={setTimelineState}
        onBarSelect={handleBarSelect}
        selectedTaskUids={selectedTaskUids}
        criticalPathUids={criticalPathUids}
        progressEntries={progressEntries.length > 0 ? progressEntries : undefined}
        externalSeekMs={videoSeekMs}
        onTogglePlayRef={togglePlayRef}
        bottlenecks={optimizedResult?.bottlenecks.map((b) => ({
          date: b.date.toISOString().split("T")[0],
          severity: b.severity,
          reason: b.reason,
        }))}
      />

      {/* Video export dialog (modal) */}
      {showVideoExport && (
        <VideoExportDialog
          canvas={canvasRef.current}
          startDate={schedule.startDate}
          finishDate={schedule.finishDate}
          onSeekToDate={handleVideoSeek}
          onClose={() => setShowVideoExport(false)}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { FragmentsModel } from "@thatopen/fragments";
import type { ProjectSchedule, ScheduleTask, ConstructionPhase } from "@/lib/wbs-types";
import type { ElementTaskMappingResult, ElementTaskLink } from "@/lib/element-task-mapper";
import { normalizeStorey } from "@/lib/element-task-mapper";
import { phaseColor } from "@/lib/phase-colors";
import type { PhaseHighlight } from "./IfcViewer";
import type { LegendPhase } from "./FourDLegend";
import TimelinePlayer, { type TimelineState } from "./TimelinePlayer";
import StoreyFilter from "./StoreyFilter";
import ElementInfoPanel from "./ElementInfoPanel";
import FourDLegend from "./FourDLegend";

const IfcViewer = dynamic(() => import("./IfcViewer"), { ssr: false });

// ============================================================
// Types
// ============================================================

export interface FourDViewerProps {
  schedule: ProjectSchedule;
  elementMapping: ElementTaskMappingResult;
  ifcData?: Uint8Array;
  ifcName?: string;
  className?: string;
}

/** Map from schedule task UID → set of fragment localIds */
type TaskLocalIdMap = Map<number, Set<number>>;

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
// Component
// ============================================================

export default function FourDViewer({
  schedule,
  elementMapping,
  ifcData,
  ifcName,
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

  // ── Phase highlights: ghost → in-progress → completed (layered) ──
  const phaseHighlights = useMemo((): PhaseHighlight[] | undefined => {
    if (!modelId || !visualState) return undefined;
    const highlights: PhaseHighlight[] = [];

    // Ghost future elements first (very faint, underneath everything)
    // Skip ghosts when a phase is isolated
    if (!isolatedPhase && visualState.futureIds.size > 0) {
      highlights.push({
        color: "#9ca3af", // gray-400
        opacity: 0.08,
        elements: { [modelId]: visualState.futureIds },
      });
    }

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

    return highlights.length > 0 ? highlights : undefined;
  }, [modelId, visualState, isolatedPhase]);

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

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className={`flex flex-col ${className}`}>
      {/* 3D viewport with overlays */}
      <div className="flex-1 min-h-0 relative">
        <IfcViewer
          ifcData={ifcData}
          ifcName={ifcName}
          onModelLoaded={handleModelLoaded}
          onElementSelect={handleElementSelect}
          visibilityMap={visibilityMap}
          phaseHighlights={phaseHighlights}
          selectionHighlights={selectionHighlights}
          flyToTarget={flyToTarget}
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
      <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-500">
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
      </div>

      {/* Timeline controls */}
      <TimelinePlayer
        schedule={schedule}
        onStateChange={setTimelineState}
        onBarSelect={handleBarSelect}
        selectedTaskUids={selectedTaskUids}
        criticalPathUids={criticalPathUids}
      />
    </div>
  );
}

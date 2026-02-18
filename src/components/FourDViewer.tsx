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
}

/**
 * Determine which elements to show and their visual status.
 * - Task finished → completed (solid)
 * - Task started but not finished → in-progress (ghosted)
 * - Task not started → hidden
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

  const normFilter = storeyFilter ? normalizeStorey(storeyFilter) : null;

  for (const [taskUid, localIds] of taskLocalIds) {
    const task = taskByUid.get(taskUid);
    if (!task) continue;

    const taskStartMs = new Date(task.startDate).getTime();
    const taskFinishMs = new Date(task.finishDate).getTime();

    if (currentMs < taskStartMs) continue; // not started

    const isCompleted = currentMs >= taskFinishMs;

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

  // ── Element selection handler ──────────────────────────────
  const handleElementSelect = useCallback(
    (localId: number | null, _modelId: string) => {
      if (localId == null) {
        setSelectedLink(null);
        setSelectedTask(null);
        return;
      }
      const links = localIdToLinksRef.current.get(localId);
      if (links && links.length > 0) {
        const link = links[0];
        setSelectedLink(link);
        setSelectedTask(taskByUid.get(link.taskUid) ?? null);
      } else {
        setSelectedLink(null);
        setSelectedTask(null);
      }
    },
    [taskByUid],
  );

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

  const visibilityMap = visualState?.visibility;

  // ── Phase highlights: in-progress (ghosted) then completed (solid) ──
  const phaseHighlights = useMemo((): PhaseHighlight[] | undefined => {
    if (!modelId || !visualState) return undefined;
    const highlights: PhaseHighlight[] = [];

    // In-progress first (lower opacity, rendered underneath)
    for (const [phase, ids] of visualState.inProgressIds) {
      highlights.push({
        color: phaseColor(phase),
        opacity: 0.25,
        elements: { [modelId]: ids },
      });
    }

    // Completed second (higher opacity, rendered on top)
    for (const [phase, ids] of visualState.completedIds) {
      highlights.push({
        color: phaseColor(phase),
        opacity: 0.8,
        elements: { [modelId]: ids },
      });
    }

    return highlights.length > 0 ? highlights : undefined;
  }, [modelId, visualState]);

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
          }}
        />

        {/* Phase legend (bottom-left) */}
        <FourDLegend phases={legendData} />
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
      </div>

      {/* Timeline controls */}
      <TimelinePlayer
        schedule={schedule}
        onStateChange={setTimelineState}
      />
    </div>
  );
}

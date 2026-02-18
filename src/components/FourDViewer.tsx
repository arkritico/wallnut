"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { FragmentsModel } from "@thatopen/fragments";
import type { ProjectSchedule, ScheduleTask } from "@/lib/wbs-types";
import type { ElementTaskMappingResult, ElementTaskLink } from "@/lib/element-task-mapper";
import TimelinePlayer, { type TimelineState } from "./TimelinePlayer";

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
// Visibility computation
// ============================================================

/**
 * Determine which elements to show at a given date.
 * An element is visible once its associated task's startDate has arrived.
 */
function computeVisibility(
  modelId: string,
  currentDate: string,
  schedule: ProjectSchedule,
  taskLocalIds: TaskLocalIdMap,
): Record<string, Set<number>> | undefined {
  if (taskLocalIds.size === 0) return undefined;

  const currentMs = new Date(currentDate).getTime();
  const visible = new Set<number>();

  // Build task lookup once per call (fast — typically < 200 tasks)
  const taskByUid = new Map<number, ScheduleTask>();
  for (const t of schedule.tasks) taskByUid.set(t.uid, t);

  for (const [taskUid, localIds] of taskLocalIds) {
    const task = taskByUid.get(taskUid);
    if (!task) continue;

    const taskStart = new Date(task.startDate).getTime();
    if (currentMs >= taskStart) {
      for (const id of localIds) visible.add(id);
    }
  }

  return { [modelId]: visible };
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
  const modelRef = useRef<FragmentsModel | null>(null);

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

  // ── When model loads, bridge GUIDs → localIds ──────────────
  const handleModelLoaded = useCallback(
    async (model: FragmentsModel) => {
      modelRef.current = model;
      setModelId(model.modelId);

      const guids = Array.from(guidToLinks.keys());
      if (guids.length === 0) {
        setMappingStatus("Sem mapeamento elemento→tarefa");
        return;
      }

      setMappingStatus("A resolver IDs...");

      try {
        // Bridge: IFC GlobalId → fragment localId
        const localIds = await model.getLocalIdsByGuids(guids);

        const taskMap: TaskLocalIdMap = new Map();
        let resolved = 0;

        for (let i = 0; i < guids.length; i++) {
          const localId = localIds[i];
          if (localId == null) continue;
          resolved++;

          const links = guidToLinks.get(guids[i]);
          if (!links) continue;

          for (const link of links) {
            const existing = taskMap.get(link.taskUid);
            if (existing) existing.add(localId);
            else taskMap.set(link.taskUid, new Set([localId]));
          }
        }

        setTaskLocalIds(taskMap);
        setMappingStatus(
          `${resolved}/${guids.length} elementos mapeados (${taskMap.size} tarefas)`,
        );
      } catch (err) {
        console.error("Failed to resolve GUID→localId mapping:", err);
        setMappingStatus("Erro ao mapear elementos");
      }
    },
    [guidToLinks],
  );

  // ── Compute visibility map from timeline ───────────────────
  const visibilityMap = useMemo(() => {
    if (!modelId || !timelineState) return undefined;
    return computeVisibility(
      modelId,
      timelineState.currentDate,
      schedule,
      taskLocalIds,
    );
  }, [modelId, timelineState, schedule, taskLocalIds]);

  // ── Phase color map for info panel ─────────────────────────
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
      {/* 3D viewport */}
      <div className="flex-1 min-h-0">
        <IfcViewer
          ifcData={ifcData}
          ifcName={ifcName}
          onModelLoaded={handleModelLoaded}
          visibilityMap={visibilityMap}
          className="h-full"
        />
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

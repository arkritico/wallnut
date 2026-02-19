/**
 * Site Capacity Optimizer
 *
 * UNIQUE DIFFERENTIATOR: Optimizes construction schedule based on physical
 * workspace constraints. No other construction planning tool does this.
 *
 * Models physical reality:
 * - Max workers per floor/area (Portuguese safety: ~10m² per worker)
 * - Phase overlap rules (plaster must cure before painting, etc.)
 * - Equipment conflicts (only 1 crane available, etc.)
 *
 * Optimization strategies:
 * 1. Resource leveling (flatten labor histogram using float-based shifting)
 * 2. Split large tasks across time
 * 3. Sequence conflicting phases
 */

import type {
  ProjectSchedule,
  ScheduleTask,
  ConstructionPhase,
} from "./wbs-types";
import type { ProjectResources } from "./resource-aggregator";
import { PHASE_ORDER, addWorkingDays, isWorkingDay } from "./construction-sequencer";
import {
  PHASE_OVERLAP_RULES,
  getPhaseEquipment,
  type PhaseOverlapRule,
} from "./phase-constraints";

// ============================================================
// Interfaces
// ============================================================

export interface SiteCapacityConstraints {
  maxWorkersPerFloor: number;          // Default: 20
  maxWorkersPerArea: Record<ConstructionPhase, number>;
  equipmentConflicts: EquipmentConflict[];
  phaseOverlapRules: PhaseOverlapRule[];
}

export interface EquipmentConflict {
  equipment: string;
  maxSimultaneous: number;
}

export type { PhaseOverlapRule } from "./phase-constraints";

export interface OptimizedSchedule {
  originalSchedule: ProjectSchedule;
  optimizedTasks: ScheduleTask[];
  adjustments: ScheduleAdjustment[];
  capacityTimeline: CapacityPoint[];    // Daily worker count
  bottlenecks: Bottleneck[];
  suggestions: OptimizationSuggestion[];
  efficiencyGain: number;               // % time saved or lost
  originalDuration: number;
  optimizedDuration: number;
}

export interface ScheduleAdjustment {
  taskId: string;
  taskName: string;
  oldStart: Date;
  newStart: Date;
  oldEnd: Date;
  newEnd: Date;
  reason: string;
}

export interface CapacityPoint {
  date: Date;
  workersAllocated: number;
  workersCapacity: number;
  utilizationPercent: number;
  phases: { phase: ConstructionPhase; workers: number }[];
  equipment?: { name: string; count: number; max: number }[];
  isBottleneck: boolean;
}

export interface Bottleneck {
  date: Date;
  overload: number;              // Workers over capacity
  phases: ConstructionPhase[];
  reason: string;
  severity: "low" | "medium" | "high";
}

export interface OptimizationSuggestion {
  type: "shift" | "split" | "sequence" | "resource";
  title: string;
  description: string;
  affectedTasks: string[];
  estimatedImpact: string;
}

// Phase overlap rules imported from shared module (phase-constraints.ts)

// ============================================================
// Default Constraints
// ============================================================

const DEFAULT_CONSTRAINTS: SiteCapacityConstraints = {
  maxWorkersPerFloor: 20,
  maxWorkersPerArea: {
    site_setup: 10,
    demolition: 15,
    earthworks: 20,
    foundations: 15,
    structure: 20,
    external_walls: 15,
    roof: 12,
    waterproofing: 8,
    external_frames: 10,
    rough_in_plumbing: 6,
    rough_in_electrical: 6,
    rough_in_gas: 4,
    rough_in_telecom: 4,
    rough_in_hvac: 6,
    internal_walls: 12,
    insulation: 8,
    external_finishes: 10,
    internal_finishes: 12,
    flooring: 8,
    ceilings: 8,
    carpentry: 6,
    plumbing_fixtures: 4,
    electrical_fixtures: 4,
    painting: 8,
    metalwork: 6,
    fire_safety: 4,
    elevators: 6,
    external_works: 10,
    testing: 4,
    cleanup: 6,
    // Licensing phases (no site workers)
    licensing_preparation: 0,
    specialty_projects: 0,
    external_consultations: 0,
    licensing_approval: 0,
    construction_authorization: 0,
    utilization_authorization: 0,
  },
  equipmentConflicts: [
    { equipment: "crane", maxSimultaneous: 1 },
    { equipment: "concrete_pump", maxSimultaneous: 1 },
    { equipment: "scaffolding", maxSimultaneous: 2 },
  ],
  phaseOverlapRules: PHASE_OVERLAP_RULES,
};

// ============================================================
// Date Helpers
// ============================================================

function toDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Advance an ISO date string by 1 working day (skips weekends + Portuguese holidays). */
function addOneWorkingDay(isoDate: string): string {
  const d = new Date(isoDate + "T08:00:00");
  return toDateKey(addWorkingDays(d, 1));
}

// ============================================================
// Worker & Equipment Tracking
// ============================================================

/**
 * Sum actual labor units for a task (not just count of resource entries).
 */
function getTaskWorkerCount(task: ScheduleTask): number {
  return Math.max(
    1,
    task.resources
      .filter((r) => r.type === "labor" || r.type === "subcontractor")
      .reduce((sum, r) => sum + (r.type === "subcontractor" ? (r.teamSize ?? r.units) : (r.units || 1)), 0),
  );
}

/**
 * Build daily worker histogram from task list.
 * Returns a Map of dateKey → total labor units on that day.
 */
function buildDailyHistogram(tasks: ScheduleTask[]): Map<string, number> {
  const histogram = new Map<string, number>();

  for (const task of tasks) {
    if (task.isSummary) continue;
    const workers = getTaskWorkerCount(task);
    const currentDate = new Date(task.startDate);
    const taskEnd = new Date(task.finishDate);

    while (currentDate <= taskEnd) {
      if (isWorkingDay(currentDate)) {
        const key = toDateKey(currentDate);
        histogram.set(key, (histogram.get(key) ?? 0) + workers);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return histogram;
}

/**
 * Find the day with the greatest worker overload.
 * Returns the dateKey string, or null if no overloads.
 */
function findWorstOverloadDay(
  histogram: Map<string, number>,
  constraints: SiteCapacityConstraints,
): string | null {
  const capacity = constraints.maxWorkersPerFloor;
  let worstDay: string | null = null;
  let worstOverload = 0;

  for (const [dateKey, workers] of histogram) {
    const overload = workers - capacity;
    if (overload > worstOverload) {
      worstOverload = overload;
      worstDay = dateKey;
    }
  }

  return worstDay;
}

// ============================================================
// Float Calculation
// ============================================================

interface TaskFloat {
  uid: number;
  totalFloat: number; // Days this task can slip without delaying project
  isCritical: boolean;
}

/**
 * Compute total float for each non-summary task.
 *
 * Float = min(successor_start) - task.finishDate.
 * If no successors, float = projectEnd - task.finishDate.
 */
function computeTaskFloats(
  tasks: ScheduleTask[],
  criticalPath: number[],
): Map<number, TaskFloat> {
  const criticalSet = new Set(criticalPath);
  const floatMap = new Map<number, TaskFloat>();

  const nonSummaryTasks = tasks.filter((t) => !t.isSummary);
  if (nonSummaryTasks.length === 0) return floatMap;

  const projectEnd = Math.max(
    ...nonSummaryTasks.map((t) => new Date(t.finishDate).getTime()),
  );

  // Build successor map: predUid → [successorUid, ...]
  const successors = new Map<number, number[]>();
  for (const task of nonSummaryTasks) {
    for (const pred of task.predecessors) {
      const list = successors.get(pred.uid) ?? [];
      list.push(task.uid);
      successors.set(pred.uid, list);
    }
  }

  const taskMap = new Map(nonSummaryTasks.map((t) => [t.uid, t]));

  for (const task of nonSummaryTasks) {
    const taskEnd = new Date(task.finishDate).getTime();
    const succs = successors.get(task.uid) ?? [];

    let latestAllowable: number;
    if (succs.length === 0) {
      latestAllowable = projectEnd;
    } else {
      latestAllowable = Math.min(
        ...succs.map((suid) => {
          const s = taskMap.get(suid);
          return s ? new Date(s.startDate).getTime() : projectEnd;
        }),
      );
    }

    const floatMs = latestAllowable - taskEnd;
    const floatDays = Math.max(
      0,
      Math.floor(floatMs / (1000 * 60 * 60 * 24)),
    );

    floatMap.set(task.uid, {
      uid: task.uid,
      totalFloat: floatDays,
      isCritical: criticalSet.has(task.uid) || floatDays === 0,
    });
  }

  return floatMap;
}

// ============================================================
// Predecessor Validation
// ============================================================

/**
 * Check if shifting a task to newStart would violate predecessor constraints.
 */
function violatesPredecessors(
  task: ScheduleTask,
  newStart: string,
  allTasks: ScheduleTask[],
): boolean {
  const taskMap = new Map(allTasks.map((t) => [t.uid, t]));
  const newStartTime = new Date(newStart).getTime();

  for (const pred of task.predecessors) {
    const predTask = taskMap.get(pred.uid);
    if (!predTask) continue;

    if (pred.type === "FS") {
      // Finish-to-Start: task must start after predecessor finishes + lag
      const predEnd = new Date(predTask.finishDate).getTime();
      const lagMs = (pred.lag ?? 0) * 24 * 60 * 60 * 1000;
      if (newStartTime < predEnd + lagMs) return true;
    } else if (pred.type === "SS") {
      // Start-to-Start: task must start after predecessor starts + lag
      const predStart = new Date(predTask.startDate).getTime();
      const lagMs = (pred.lag ?? 0) * 24 * 60 * 60 * 1000;
      if (newStartTime < predStart + lagMs) return true;
    }
  }

  return false;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Build daily capacity timeline showing worker and equipment allocation.
 */
function buildCapacityTimeline(
  schedule: ProjectSchedule,
  _resources: ProjectResources,
  constraints: SiteCapacityConstraints,
): CapacityPoint[] {
  const timeline: CapacityPoint[] = [];
  const dailyWorkers = new Map<string, Map<ConstructionPhase, number>>();
  const dailyEquipment = new Map<string, Map<string, number>>();

  // For each task, allocate workers and equipment across its duration
  for (const task of schedule.tasks) {
    if (task.isSummary) continue;

    const workers = getTaskWorkerCount(task);
    const phaseEquip = getPhaseEquipment(task.phase);
    const currentDate = new Date(task.startDate);
    const taskEnd = new Date(task.finishDate);

    while (currentDate <= taskEnd) {
      // Only count working days (skip weekends + Portuguese holidays)
      if (isWorkingDay(currentDate)) {
        const dateKey = toDateKey(currentDate);

        // Track workers per phase per day
        if (!dailyWorkers.has(dateKey)) {
          dailyWorkers.set(dateKey, new Map());
        }
        const dayData = dailyWorkers.get(dateKey)!;
        const phase = task.phase || "cleanup";
        dayData.set(phase, (dayData.get(phase) ?? 0) + workers);

        // Track equipment per day
        if (phaseEquip.length > 0) {
          if (!dailyEquipment.has(dateKey)) {
            dailyEquipment.set(dateKey, new Map());
          }
          const dayEquip = dailyEquipment.get(dateKey)!;
          for (const eq of phaseEquip) {
            dayEquip.set(eq, (dayEquip.get(eq) ?? 0) + 1);
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Build timeline points
  for (const [dateKey, phases] of dailyWorkers.entries()) {
    const totalWorkers = Array.from(phases.values()).reduce(
      (sum, w) => sum + w,
      0,
    );
    const capacity = constraints.maxWorkersPerFloor;
    const isBottleneck = totalWorkers > capacity;

    // Build equipment data for this day
    const dayEquip = dailyEquipment.get(dateKey);
    let equipmentData: { name: string; count: number; max: number }[] | undefined;
    if (dayEquip) {
      equipmentData = [];
      for (const conflict of constraints.equipmentConflicts) {
        const count = dayEquip.get(conflict.equipment) ?? 0;
        if (count > 0) {
          equipmentData.push({
            name: conflict.equipment,
            count,
            max: conflict.maxSimultaneous,
          });
        }
      }
      if (equipmentData.length === 0) equipmentData = undefined;
    }

    timeline.push({
      date: new Date(dateKey),
      workersAllocated: totalWorkers,
      workersCapacity: capacity,
      utilizationPercent: (totalWorkers / capacity) * 100,
      phases: Array.from(phases.entries()).map(([p, w]) => ({
        phase: p,
        workers: w,
      })),
      equipment: equipmentData,
      isBottleneck,
    });
  }

  return timeline.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Detect capacity violations, equipment conflicts, and phase overlap conflicts.
 */
function detectViolations(
  timeline: CapacityPoint[],
  schedule: ProjectSchedule,
  constraints: SiteCapacityConstraints,
): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];

  // Check capacity violations
  for (const point of timeline) {
    if (point.workersAllocated > point.workersCapacity) {
      const overload = point.workersAllocated - point.workersCapacity;
      const severity: "low" | "medium" | "high" =
        overload > 10 ? "high" : overload > 5 ? "medium" : "low";

      bottlenecks.push({
        date: point.date,
        overload,
        phases: point.phases.map((p) => p.phase),
        reason: `Sobrecarga de ${overload} trabalhadores (${point.workersAllocated}/${point.workersCapacity})`,
        severity,
      });
    }

    // Check equipment conflicts
    if (point.equipment) {
      for (const eq of point.equipment) {
        if (eq.count > eq.max) {
          bottlenecks.push({
            date: point.date,
            overload: eq.count - eq.max,
            phases: point.phases.map((p) => p.phase),
            reason: `Conflito de equipamento: ${eq.count} fases a usar ${eq.name} (máximo: ${eq.max})`,
            severity: eq.count > eq.max + 1 ? "high" : "medium",
          });
        }
      }
    }
  }

  // Check phase overlap violations
  for (const rule of constraints.phaseOverlapRules) {
    if (rule.canOverlap) continue;

    const phase1Tasks = schedule.tasks.filter(
      (t) => t.phase === rule.phase1,
    );
    const phase2Tasks = schedule.tasks.filter(
      (t) => t.phase === rule.phase2,
    );

    for (const t1 of phase1Tasks) {
      for (const t2 of phase2Tasks) {
        const gap = rule.minimumGap || 0;
        const t1End = gap > 0
          ? addWorkingDays(new Date(t1.finishDate), gap)
          : new Date(t1.finishDate);

        const t2Start = new Date(t2.startDate);
        const t2End = new Date(t2.finishDate);
        const t1Start = new Date(t1.startDate);

        if (t2Start < t1End && t2End > t1Start) {
          bottlenecks.push({
            date: t2Start,
            overload: 0,
            phases: [rule.phase1, rule.phase2],
            reason: `Conflito de fases: ${rule.reason}`,
            severity: "medium",
          });
        }
      }
    }
  }

  return bottlenecks;
}

/**
 * Generate optimization suggestions.
 */
function generateSuggestions(
  bottlenecks: Bottleneck[],
  _schedule: ProjectSchedule,
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  if (bottlenecks.length === 0) {
    suggestions.push({
      type: "resource",
      title: "Cronograma Otimizado",
      description:
        "O cronograma está bem balanceado. Não foram detetados constrangimentos de capacidade.",
      affectedTasks: [],
      estimatedImpact: "Sem alterações necessárias",
    });
    return suggestions;
  }

  // Count high-severity bottlenecks
  const highSeverity = bottlenecks.filter(
    (b) => b.severity === "high",
  ).length;
  if (highSeverity > 0) {
    suggestions.push({
      type: "resource",
      title: `${highSeverity} Sobrecargas Críticas Detetadas`,
      description:
        "Recomenda-se aumentar a equipa ou dividir trabalhos em fases distintas para evitar congestionamento no estaleiro.",
      affectedTasks: [],
      estimatedImpact: `Redução de ${highSeverity * 2}-${highSeverity * 3} dias`,
    });
  }

  // Phase conflict suggestions
  const phaseConflicts = bottlenecks.filter((b) =>
    b.reason.includes("Conflito de fases"),
  );
  if (phaseConflicts.length > 0) {
    suggestions.push({
      type: "sequence",
      title: `${phaseConflicts.length} Conflitos de Fases`,
      description:
        "Algumas fases não podem ocorrer em paralelo devido a requisitos técnicos (cura de betão, secagem, etc.).",
      affectedTasks: [],
      estimatedImpact: `Ajuste de ${phaseConflicts.length * 1}-${phaseConflicts.length * 2} dias`,
    });
  }

  // Equipment conflict suggestions
  const equipmentConflicts = bottlenecks.filter((b) =>
    b.reason.includes("Conflito de equipamento"),
  );
  if (equipmentConflicts.length > 0) {
    suggestions.push({
      type: "resource",
      title: `${equipmentConflicts.length} Conflitos de Equipamento`,
      description:
        "Fases concorrentes necessitam do mesmo equipamento (grua, bomba de betão, andaimes). Recomenda-se resequenciar ou alugar equipamento adicional.",
      affectedTasks: [],
      estimatedImpact: `Possível atraso de ${equipmentConflicts.length * 2}-${equipmentConflicts.length * 5} dias sem intervenção`,
    });
  }

  return suggestions;
}

// ============================================================
// Resource Leveling (replaces shiftTasksToOffPeak)
// ============================================================

/**
 * Resource leveling: flatten the labor histogram by delaying
 * non-critical tasks within their available float.
 *
 * Greedy heuristic:
 * 1. Build daily worker histogram
 * 2. Find the day with the highest overload
 * 3. Among tasks active on that day, pick the non-critical one with most float
 * 4. Delay that task by 1 day (if float > 0 and predecessors respected)
 * 5. Repeat until no overloads or max iterations reached
 */
function levelResources(
  tasks: ScheduleTask[],
  criticalPath: number[],
  constraints: SiteCapacityConstraints,
  maxIterations: number = 200,
): { tasks: ScheduleTask[]; adjustments: ScheduleAdjustment[] } {
  const adjustments: ScheduleAdjustment[] = [];
  const current = tasks.map((t) => ({ ...t }));

  for (let iter = 0; iter < maxIterations; iter++) {
    // 1. Build daily histogram
    const histogram = buildDailyHistogram(current);

    // 2. Find worst overload day
    const worstDay = findWorstOverloadDay(histogram, constraints);
    if (!worstDay) break; // No overloads remain

    // 3. Compute float for current state
    const floatMap = computeTaskFloats(current, criticalPath);

    // 4. Among tasks active on worstDay, find the one with most float
    const activeTasks = current.filter((t) => {
      if (t.isSummary) return false;
      const start = t.startDate.split("T")[0];
      const end = t.finishDate.split("T")[0];
      return start <= worstDay && end >= worstDay;
    });

    let bestTask: ScheduleTask | null = null;
    let bestFloat = -1;
    for (const t of activeTasks) {
      const f = floatMap.get(t.uid);
      if (f && !f.isCritical && f.totalFloat > bestFloat) {
        bestFloat = f.totalFloat;
        bestTask = t;
      }
    }

    if (!bestTask || bestFloat <= 0) break; // Cannot improve further

    // 5. Delay task by 1 day
    const idx = current.findIndex((t) => t.uid === bestTask!.uid);
    if (idx === -1) break;

    const newStart = addOneWorkingDay(current[idx].startDate);
    const newEnd = addOneWorkingDay(current[idx].finishDate);

    // Verify predecessor constraints before applying
    if (violatesPredecessors(current[idx], newStart, current)) continue;

    adjustments.push({
      taskId: String(current[idx].uid),
      taskName: current[idx].name,
      oldStart: new Date(current[idx].startDate),
      newStart: new Date(newStart),
      oldEnd: new Date(current[idx].finishDate),
      newEnd: new Date(newEnd),
      reason: `Nivelamento de recursos: atrasar 1 dia para reduzir pico em ${worstDay}`,
    });

    current[idx] = {
      ...current[idx],
      startDate: newStart,
      finishDate: newEnd,
    };
  }

  return { tasks: current, adjustments };
}

// ============================================================
// Task Splitting (heuristic #2)
// ============================================================

/**
 * Split large tasks across time.
 *
 * Strategy: Find tasks with many workers (>8) and split them into
 * 2 sequential tasks with half the workers each, extending duration.
 *
 * UID strategy:
 * - Part 1 keeps the original task UID (preserves predecessor references)
 * - Part 2 gets a new UID with Part 1 as predecessor
 * - Other tasks referencing the original UID as predecessor are remapped
 *   to reference Part 2 (since Part 2 represents the task's completion)
 *
 * Cost is split proportionally between parts.
 */
function splitLargeTasks(
  tasks: ScheduleTask[],
  _constraints: SiteCapacityConstraints,
): ScheduleTask[] {
  const result: ScheduleTask[] = [];
  const SPLIT_THRESHOLD = 8;

  // Find max UID to avoid collisions with new Part 2 UIDs
  let nextUid = tasks.reduce((max, t) => Math.max(max, t.uid), 0) + 1;

  // Track which original UIDs were split → Part 2 UID
  // Successors of the original task should depend on Part 2 (completion)
  const splitMap = new Map<number, number>(); // originalUid → part2Uid

  for (const task of tasks) {
    if (task.isSummary) {
      result.push(task);
      continue;
    }

    const workerCount = getTaskWorkerCount(task);

    if (workerCount > SPLIT_THRESHOLD) {
      const startDate = new Date(task.startDate);
      const endDate = new Date(task.finishDate);
      const midpoint = new Date(
        startDate.getTime() +
          (endDate.getTime() - startDate.getTime()) / 2,
      );
      const midpointISO = toDateKey(midpoint);

      const part2Uid = nextUid++;
      splitMap.set(task.uid, part2Uid);

      // Split cost proportionally by duration
      const part1Days = Math.ceil(task.durationDays / 2);
      const part2Days = Math.max(1, task.durationDays - part1Days);
      const part1Ratio = task.durationDays > 0 ? part1Days / task.durationDays : 0.5;
      const part2Ratio = 1 - part1Ratio;

      // Part 1: keeps original UID (preserves incoming predecessor references)
      result.push({
        ...task,
        name: `${task.name} (Parte 1)`,
        finishDate: midpointISO,
        durationDays: part1Days,
        durationHours: Math.ceil(task.durationHours / 2),
        cost: Math.round(task.cost * part1Ratio),
        materialCost: Math.round(task.materialCost * part1Ratio),
        resources: task.resources.map((r) => ({
          ...r,
          units:
            r.type === "labor" || r.type === "subcontractor"
              ? Math.ceil((r.units || 1) / 2)
              : r.units,
        })),
      });

      // Part 2: new UID, predecessor = Part 1 (original UID)
      result.push({
        ...task,
        uid: part2Uid,
        name: `${task.name} (Parte 2)`,
        startDate: midpointISO,
        durationDays: part2Days,
        durationHours: Math.floor(task.durationHours / 2),
        cost: Math.round(task.cost * part2Ratio),
        materialCost: Math.round(task.materialCost * part2Ratio),
        predecessors: [
          ...task.predecessors,
          { uid: task.uid, type: "FS" as const },
        ],
        resources: task.resources.map((r) => ({
          ...r,
          units:
            r.type === "labor" || r.type === "subcontractor"
              ? Math.floor((r.units || 1) / 2)
              : r.units,
        })),
      });
    } else {
      result.push(task);
    }
  }

  // Remap predecessor references: tasks that depended on a split task's
  // original UID should now depend on Part 2's UID (the completion half)
  if (splitMap.size > 0) {
    for (const task of result) {
      if (task.isSummary) continue;
      let remapped = false;
      const newPreds = task.predecessors.map((pred) => {
        const part2Uid = splitMap.get(pred.uid);
        // Don't remap Part 2's own reference to Part 1
        if (part2Uid && task.uid !== part2Uid) {
          remapped = true;
          return { ...pred, uid: part2Uid };
        }
        return pred;
      });
      if (remapped) {
        task.predecessors = newPreds;
      }
    }
  }

  return result;
}

// ============================================================
// Phase Sequencing (heuristic #3 — safety net)
// ============================================================

/**
 * Sequence conflicting phases.
 *
 * Strategy: Enforce phase overlap rules by adjusting task dates.
 * If two phases cannot overlap, ensure phase2 starts after phase1 ends + gap.
 *
 * Note: With overlap rules now integrated into initial sequencing,
 * this function acts as a safety net catching any remaining violations.
 */
function sequenceConflicts(
  tasks: ScheduleTask[],
  rules: PhaseOverlapRule[],
): ScheduleTask[] {
  const adjustedTasks = [...tasks];

  for (const rule of rules) {
    if (rule.canOverlap) continue;

    const phase1Tasks = adjustedTasks.filter(
      (t) => t.phase === rule.phase1 && !t.isSummary,
    );
    const phase2Tasks = adjustedTasks.filter(
      (t) => t.phase === rule.phase2 && !t.isSummary,
    );

    if (phase1Tasks.length === 0 || phase2Tasks.length === 0) continue;

    const phase1EndDates = phase1Tasks.map((t) =>
      new Date(t.finishDate).getTime(),
    );
    const latestPhase1End = new Date(Math.max(...phase1EndDates));

    const minimumGap = rule.minimumGap || 0;
    // Use working-day offset for the minimum gap
    const requiredPhase2Start = minimumGap > 0
      ? addWorkingDays(latestPhase1End, minimumGap)
      : latestPhase1End;

    for (let i = 0; i < adjustedTasks.length; i++) {
      const task = adjustedTasks[i];
      if (task.phase === rule.phase2 && !task.isSummary) {
        const taskStartDate = new Date(task.startDate);
        if (taskStartDate < requiredPhase2Start) {
          // Shift by working days to respect holidays/weekends
          const taskDuration = task.durationDays;
          const newStart = addWorkingDays(requiredPhase2Start, 0);
          const newEnd = addWorkingDays(newStart, taskDuration);

          adjustedTasks[i] = {
            ...task,
            startDate: toDateKey(newStart),
            finishDate: toDateKey(newEnd),
          };
        }
      }
    }
  }

  return adjustedTasks;
}

// ============================================================
// Main Optimization Function
// ============================================================

/**
 * Optimize construction schedule based on site capacity constraints.
 *
 * This is the UNIQUE DIFFERENTIATOR feature.
 */
export function optimizeSchedule(
  schedule: ProjectSchedule,
  resources: ProjectResources,
  constraints: SiteCapacityConstraints = DEFAULT_CONSTRAINTS,
): OptimizedSchedule {
  // Phase 1: Build capacity timeline (workers + equipment)
  const timeline = buildCapacityTimeline(schedule, resources, constraints);

  // Phase 2: Detect violations (workers + equipment + overlaps)
  const bottlenecks = detectViolations(timeline, schedule, constraints);

  // Phase 3: Apply optimization strategies
  let optimizedTasks = [...schedule.tasks];
  let adjustments: ScheduleAdjustment[] = [];

  if (bottlenecks.length > 0) {
    // Strategy 1: Resource leveling (flatten labor histogram)
    const leveled = levelResources(
      optimizedTasks,
      schedule.criticalPath,
      constraints,
    );
    optimizedTasks = leveled.tasks;
    adjustments = leveled.adjustments;

    // Strategy 2: Split large tasks (>8 workers)
    optimizedTasks = splitLargeTasks(optimizedTasks, constraints);

    // Strategy 3: Sequence conflicts (safety net for remaining overlap violations)
    optimizedTasks = sequenceConflicts(
      optimizedTasks,
      constraints.phaseOverlapRules,
    );
  }

  // Phase 4: Generate suggestions
  const suggestions = generateSuggestions(bottlenecks, schedule);

  // Calculate duration change
  const scheduleStartDate = new Date(schedule.startDate);
  const scheduleEndDate = new Date(schedule.finishDate);
  const originalDuration =
    (scheduleEndDate.getTime() - scheduleStartDate.getTime()) /
    (1000 * 60 * 60 * 24);

  let optimizedEndDate = scheduleEndDate;
  if (optimizedTasks.length > 0) {
    const endDates = optimizedTasks.map((t) =>
      new Date(t.finishDate).getTime(),
    );
    optimizedEndDate = new Date(Math.max(...endDates));
  }

  const optimizedDuration =
    (optimizedEndDate.getTime() - scheduleStartDate.getTime()) /
    (1000 * 60 * 60 * 24);

  const efficiencyGain =
    ((originalDuration - optimizedDuration) / originalDuration) * 100;

  return {
    originalSchedule: schedule,
    optimizedTasks,
    adjustments,
    capacityTimeline: timeline,
    bottlenecks,
    suggestions,
    efficiencyGain,
    originalDuration,
    optimizedDuration,
  };
}

/**
 * Export default constraints for configuration UI.
 */
export function getDefaultConstraints(): SiteCapacityConstraints {
  return { ...DEFAULT_CONSTRAINTS };
}

// Exported for testing
export {
  buildDailyHistogram,
  computeTaskFloats,
  getTaskWorkerCount,
  type TaskFloat,
};

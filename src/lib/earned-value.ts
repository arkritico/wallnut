/**
 * Earned Value Management (EVM) engine.
 *
 * Implements the standard EVM calculations per PMI PMBOK:
 *   PV  = Planned Value (budgeted cost of work scheduled)
 *   EV  = Earned Value  (budgeted cost of work performed)
 *   AC  = Actual Cost   (actual cost of work performed)
 *   SV  = EV - PV       (schedule variance)
 *   CV  = EV - AC       (cost variance)
 *   SPI = EV / PV       (schedule performance index, >1 = ahead)
 *   CPI = EV / AC       (cost performance index, >1 = under budget)
 *   BAC = Budget at Completion
 *   EAC = BAC / CPI     (estimate at completion)
 *   ETC = EAC - AC      (estimate to complete)
 *   TCPI = (BAC - EV) / (BAC - AC)  (to-complete performance index)
 *
 * The module works with the existing ProjectSchedule + ScheduleTask types,
 * adding progress overlays without mutating the baseline.
 */

import type { ProjectSchedule, ScheduleTask } from "./wbs-types";

// ============================================================
// Types
// ============================================================

/** Per-task progress entry — supplied by the user or 4D viewer. */
export interface TaskProgress {
  taskUid: number;
  /** Physical percent complete (0-100). */
  percentComplete: number;
  /** Actual cost incurred so far (EUR). If omitted, derived from % × baseline cost. */
  actualCost?: number;
  /** Actual start date (ISO). */
  actualStart?: string;
  /** Actual finish date (ISO). */
  actualFinish?: string;
}

/** Computed EVM metrics for a single task. */
export interface TaskEvmMetrics {
  taskUid: number;
  taskName: string;
  phase: string;
  isCritical: boolean;

  // Baseline
  plannedValue: number;
  budgetAtCompletion: number;

  // Progress
  percentComplete: number;

  // Core EVM
  earnedValue: number;
  actualCost: number;
  scheduleVariance: number;
  costVariance: number;
  spiRaw: number;  // EV/PV, may be Infinity if PV=0
  cpiRaw: number;  // EV/AC, may be Infinity if AC=0

  // Status
  status: "on_track" | "at_risk" | "delayed" | "completed";
}

/** Project-level EVM snapshot. */
export interface ProjectEvmSnapshot {
  /** ISO date of this snapshot. */
  snapshotDate: string;

  // Budget
  budgetAtCompletion: number;

  // Time-phased PV at snapshot date
  plannedValue: number;
  earnedValue: number;
  actualCost: number;

  // Variances
  scheduleVariance: number;
  costVariance: number;

  // Indices
  spi: number;
  cpi: number;

  // Forecasts
  estimateAtCompletion: number;
  estimateToComplete: number;
  varianceAtCompletion: number;
  toCompletePerformanceIndex: number;

  // Schedule forecast
  projectedFinishDate: string;
  scheduleSlippageDays: number;

  // Task breakdown
  taskMetrics: TaskEvmMetrics[];

  // Summary counts
  tasksByStatus: {
    onTrack: number;
    atRisk: number;
    delayed: number;
    completed: number;
  };

  // Overall health
  health: "green" | "yellow" | "red";
}

/** Baseline snapshot — frozen copy of schedule for EVM comparison. */
export interface EvmBaseline {
  capturedAt: string;
  projectName: string;
  startDate: string;
  finishDate: string;
  totalCost: number;
  tasks: BaselineTask[];
}

interface BaselineTask {
  uid: number;
  name: string;
  phase: string;
  startDate: string;
  finishDate: string;
  durationDays: number;
  cost: number;
  isSummary: boolean;
}

// ============================================================
// Baseline Validation
// ============================================================

/** Result of checking whether a baseline is still valid. */
export interface BaselineValidation {
  isStale: boolean;
  reason?: string;
  originalFinishDate: string;
  currentFinishDate: string;
  taskCountChanged: boolean;
}

/**
 * Check whether a previously captured baseline is still aligned with the current schedule.
 * Detects: finish date change, task count change, any task shifted >7 days.
 */
export function validateBaseline(
  baseline: EvmBaseline,
  currentSchedule: ProjectSchedule,
): BaselineValidation {
  const currentDetailTasks = currentSchedule.tasks.filter(t => !t.isSummary);
  const taskCountChanged = baseline.tasks.length !== currentDetailTasks.length;
  const finishChanged = baseline.finishDate !== currentSchedule.finishDate;

  // Check if any baseline task shifted >7 days
  const taskMap = new Map(currentDetailTasks.map(t => [t.uid, t]));
  let majorShift = false;
  for (const bt of baseline.tasks) {
    const current = taskMap.get(bt.uid);
    if (!current) continue;
    const bMs = new Date(bt.finishDate).getTime();
    const cMs = new Date(current.finishDate).getTime();
    if (Math.abs(cMs - bMs) > 7 * 86_400_000) {
      majorShift = true;
      break;
    }
  }

  const isStale = finishChanged || taskCountChanged || majorShift;

  return {
    isStale,
    reason: isStale
      ? finishChanged
        ? "Data de conclusão do projeto alterada"
        : taskCountChanged
          ? "Número de tarefas alterado"
          : "Datas de tarefas alteradas significativamente"
      : undefined,
    originalFinishDate: baseline.finishDate,
    currentFinishDate: currentSchedule.finishDate,
    taskCountChanged,
  };
}

// ============================================================
// Baseline Capture
// ============================================================

/**
 * Capture a baseline snapshot from the current schedule.
 * This freezes the planned values so future progress can be measured against them.
 */
export function captureBaseline(schedule: ProjectSchedule): EvmBaseline {
  return {
    capturedAt: new Date().toISOString(),
    projectName: schedule.projectName,
    startDate: schedule.startDate,
    finishDate: schedule.finishDate,
    totalCost: schedule.totalCost,
    tasks: schedule.tasks
      .filter(t => !t.isSummary)
      .map(t => ({
        uid: t.uid,
        name: t.name,
        phase: t.phase,
        startDate: t.startDate,
        finishDate: t.finishDate,
        durationDays: t.durationDays,
        cost: t.cost,
        isSummary: t.isSummary,
      })),
  };
}

// ============================================================
// Date Helpers
// ============================================================

function parseDate(s: string): Date {
  return new Date(s + "T08:00:00");
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addWorkingDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

function workingDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ============================================================
// Time-Phased Planned Value
// ============================================================

/**
 * Calculate cumulative Planned Value at a given data date.
 * PV is distributed linearly across each task's duration.
 *
 * For a task spanning [startDate, finishDate] with cost C:
 *   - Before startDate: PV contribution = 0
 *   - After finishDate:  PV contribution = C
 *   - During task:       PV contribution = C × (working days elapsed / total working days)
 */
function cumulativePlannedValue(
  tasks: BaselineTask[],
  dataDate: Date,
): number {
  let pv = 0;
  for (const task of tasks) {
    if (task.isSummary || task.cost === 0) continue;

    const start = parseDate(task.startDate);
    const finish = parseDate(task.finishDate);

    if (dataDate >= finish) {
      // Task fully scheduled by data date
      pv += task.cost;
    } else if (dataDate > start) {
      // Task partially scheduled
      const totalDays = task.durationDays || workingDaysBetween(start, finish);
      if (totalDays > 0) {
        const elapsed = workingDaysBetween(start, dataDate);
        pv += task.cost * Math.min(1, elapsed / totalDays);
      }
    }
    // Before start: contributes 0
  }
  return pv;
}

// ============================================================
// Core EVM Calculation
// ============================================================

/**
 * Compute EVM snapshot for a project at a given data date.
 *
 * @param baseline - Frozen baseline from captureBaseline()
 * @param schedule - Current schedule (for critical path info)
 * @param progress - Array of task progress entries
 * @param dataDate - The "as of" date (defaults to today)
 */
export function computeEvmSnapshot(
  baseline: EvmBaseline,
  schedule: ProjectSchedule,
  progress: TaskProgress[],
  dataDate?: string,
): ProjectEvmSnapshot {
  const dd = dataDate ? parseDate(dataDate) : new Date();
  const ddStr = dataDate ?? toISODate(dd);

  const BAC = baseline.totalCost;
  const criticalSet = new Set(schedule.criticalPath);
  const progressMap = new Map(progress.map(p => [p.taskUid, p]));

  // Time-phased PV
  const PV = cumulativePlannedValue(baseline.tasks, dd);

  // Per-task metrics
  let totalEV = 0;
  let totalAC = 0;
  const taskMetrics: TaskEvmMetrics[] = [];
  const statusCounts = { onTrack: 0, atRisk: 0, delayed: 0, completed: 0 };

  for (const bt of baseline.tasks) {
    if (bt.isSummary) continue;

    const prog = progressMap.get(bt.uid);
    const pctComplete = prog?.percentComplete ?? 0;

    // EV = BAC_task × % complete
    const taskBAC = bt.cost;
    const taskEV = taskBAC * (pctComplete / 100);

    // AC: use actual if provided, otherwise estimate from % × BAC
    const taskAC = prog?.actualCost ?? taskEV;

    totalEV += taskEV;
    totalAC += taskAC;

    // Task-level PV
    const taskStart = parseDate(bt.startDate);
    const taskFinish = parseDate(bt.finishDate);
    let taskPV = 0;
    if (dd >= taskFinish) {
      taskPV = taskBAC;
    } else if (dd > taskStart && bt.durationDays > 0) {
      const elapsed = workingDaysBetween(taskStart, dd);
      taskPV = taskBAC * Math.min(1, elapsed / bt.durationDays);
    }

    // Variances
    const sv = taskEV - taskPV;
    const cv = taskEV - taskAC;
    const spiRaw = taskPV > 0 ? taskEV / taskPV : pctComplete > 0 ? 1 : 0;
    const cpiRaw = taskAC > 0 ? taskEV / taskAC : pctComplete > 0 ? 1 : 0;

    // Status
    let status: TaskEvmMetrics["status"];
    if (pctComplete >= 100) {
      status = "completed";
      statusCounts.completed++;
    } else if (spiRaw >= 0.9) {
      status = "on_track";
      statusCounts.onTrack++;
    } else if (spiRaw >= 0.75) {
      status = "at_risk";
      statusCounts.atRisk++;
    } else {
      // SPI < 0.75 or task should have started but hasn't
      const shouldHaveStarted = dd >= taskStart && pctComplete === 0 && taskPV > 0;
      status = shouldHaveStarted ? "delayed" : spiRaw < 0.75 ? "delayed" : "on_track";
      if (status === "delayed") statusCounts.delayed++;
      else statusCounts.onTrack++;
    }

    taskMetrics.push({
      taskUid: bt.uid,
      taskName: bt.name,
      phase: bt.phase,
      isCritical: criticalSet.has(bt.uid),
      plannedValue: Math.round(taskPV),
      budgetAtCompletion: taskBAC,
      percentComplete: pctComplete,
      earnedValue: Math.round(taskEV),
      actualCost: Math.round(taskAC),
      scheduleVariance: Math.round(sv),
      costVariance: Math.round(cv),
      spiRaw: Number(spiRaw.toFixed(3)),
      cpiRaw: Number(cpiRaw.toFixed(3)),
      status,
    });
  }

  // Project-level calculations
  const SV = totalEV - PV;
  const CV = totalEV - totalAC;
  const SPI = PV > 0 ? totalEV / PV : 0;
  const CPI = totalAC > 0 ? totalEV / totalAC : 0;

  // Forecasts
  const EAC = CPI > 0 ? BAC / CPI : BAC;
  const ETC = Math.max(0, EAC - totalAC);
  const VAC = BAC - EAC;
  const TCPI = (BAC - totalAC) > 0 ? (BAC - totalEV) / (BAC - totalAC) : 0;

  // Schedule forecast: adjust finish date based on SPI
  const baseFinish = parseDate(baseline.finishDate);
  const baseStart = parseDate(baseline.startDate);
  const baseDuration = workingDaysBetween(baseStart, baseFinish);
  const projectedDuration = SPI > 0 ? Math.round(baseDuration / SPI) : baseDuration * 2;
  const projectedFinish = addWorkingDays(baseStart, projectedDuration);
  const slippageDays = projectedDuration - baseDuration;

  // Overall health
  let health: ProjectEvmSnapshot["health"];
  if (SPI >= 0.9 && CPI >= 0.9) health = "green";
  else if (SPI >= 0.75 && CPI >= 0.75) health = "yellow";
  else health = "red";

  return {
    snapshotDate: ddStr,
    budgetAtCompletion: BAC,
    plannedValue: Math.round(PV),
    earnedValue: Math.round(totalEV),
    actualCost: Math.round(totalAC),
    scheduleVariance: Math.round(SV),
    costVariance: Math.round(CV),
    spi: Number(SPI.toFixed(3)),
    cpi: Number(CPI.toFixed(3)),
    estimateAtCompletion: Math.round(EAC),
    estimateToComplete: Math.round(ETC),
    varianceAtCompletion: Math.round(VAC),
    toCompletePerformanceIndex: Number(TCPI.toFixed(3)),
    projectedFinishDate: toISODate(projectedFinish),
    scheduleSlippageDays: slippageDays,
    taskMetrics,
    tasksByStatus: statusCounts,
    health,
  };
}

// ============================================================
// S-Curve Data Generation
// ============================================================

export interface SCurvePoint {
  date: string;
  plannedValue: number;
  earnedValue?: number;
  actualCost?: number;
}

/**
 * Generate S-curve data points for chart visualization.
 * Returns weekly PV from project start to finish, plus EV/AC if progress is provided.
 */
export function generateSCurveData(
  baseline: EvmBaseline,
  progress?: TaskProgress[],
): SCurvePoint[] {
  const points: SCurvePoint[] = [];
  const start = parseDate(baseline.startDate);
  const finish = parseDate(baseline.finishDate);
  const progressMap = progress ? new Map(progress.map(p => [p.taskUid, p])) : null;

  // Generate weekly points
  const current = new Date(start);
  while (current <= finish) {
    const pv = cumulativePlannedValue(baseline.tasks, current);

    const point: SCurvePoint = {
      date: toISODate(current),
      plannedValue: Math.round(pv),
    };

    // Add EV/AC if progress data available
    if (progressMap) {
      let ev = 0;
      let ac = 0;
      for (const bt of baseline.tasks) {
        if (bt.isSummary) continue;
        const prog = progressMap.get(bt.uid);
        if (prog) {
          const taskEV = bt.cost * (prog.percentComplete / 100);
          ev += taskEV;
          ac += prog.actualCost ?? taskEV;
        }
      }
      // Only add EV/AC up to current date (not future)
      if (current <= new Date()) {
        point.earnedValue = Math.round(ev);
        point.actualCost = Math.round(ac);
      }
    }

    points.push(point);

    // Advance 7 days
    current.setDate(current.getDate() + 7);
  }

  // Ensure final point at project finish
  const lastDate = points.length > 0 ? points[points.length - 1].date : "";
  if (lastDate !== toISODate(finish)) {
    points.push({
      date: toISODate(finish),
      plannedValue: Math.round(baseline.totalCost),
    });
  }

  return points;
}

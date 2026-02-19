/**
 * Resource Histogram — weekly resource aggregation from project schedule.
 *
 * Computes stacked worker counts by trade, machinery, material deliveries,
 * and weekly cost for chart visualization alongside the 4D timeline.
 *
 * Integrates with the existing earned-value S-curve (PV/EV/AC lines).
 */

import type { ProjectSchedule, ScheduleTask, TaskResource } from "./wbs-types";
import type { TaskProgress } from "./earned-value";

// ============================================================
// Types
// ============================================================

export interface ResourceHistogramPoint {
  /** ISO date of week start (Monday) */
  weekStart: string;
  /** ISO date of week end (Sunday) */
  weekEnd: string;
  /** Total workers on site this week */
  labor: number;
  /** Workers by trade name */
  byTrade: Record<string, number>;
  /** Machinery units active this week */
  machinery: number;
  /** Material delivery count this week */
  materials: number;
  /** Weekly planned cost (EUR) */
  cost: number;
  /** Cumulative planned cost up to this week */
  cumulativeCost: number;
  /** Weekly actual cost (if progress data provided) */
  actualCost?: number;
  /** Cumulative actual cost (if progress data provided) */
  cumulativeActualCost?: number;
}

export interface ResourceHistogramData {
  points: ResourceHistogramPoint[];
  /** Peak worker count across all weeks */
  peakLabor: number;
  /** Week of peak labor */
  peakWeek: string;
  /** All trade names found (for legend) */
  trades: string[];
  /** Total project duration in weeks */
  totalWeeks: number;
}

// ============================================================
// Helpers
// ============================================================

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = MS_PER_DAY * 7;

/**
 * Get the Monday of the week containing the given date.
 */
function getMonday(ms: number): number {
  const d = new Date(ms);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Check if a task overlaps with a given week [weekStartMs, weekEndMs].
 * Returns the proportion of the week that the task is active (0-1).
 */
function weekOverlap(
  taskStartMs: number,
  taskFinishMs: number,
  weekStartMs: number,
  weekEndMs: number,
): number {
  const overlapStart = Math.max(taskStartMs, weekStartMs);
  const overlapEnd = Math.min(taskFinishMs, weekEndMs);
  if (overlapStart >= overlapEnd) return 0;

  const weekDuration = weekEndMs - weekStartMs;
  return weekDuration > 0 ? (overlapEnd - overlapStart) / weekDuration : 0;
}

/**
 * Sum resources by type from a task's resource list.
 */
/** Normalize a trade name: trim whitespace and capitalize first letter. */
function normalizeTradeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function sumResources(
  resources: TaskResource[],
  overlapFactor: number,
): { labor: number; byTrade: Record<string, number>; machinery: number; materials: number } {
  let labor = 0;
  const byTrade: Record<string, number> = {};
  let machinery = 0;
  let materials = 0;

  for (const r of resources) {
    const units = r.units * overlapFactor;
    const tradeName = normalizeTradeName(r.name);
    switch (r.type) {
      case "labor":
        labor += units;
        byTrade[tradeName] = (byTrade[tradeName] ?? 0) + units;
        break;
      case "machinery":
        machinery += units;
        break;
      case "material":
        materials += units;
        break;
      // subcontractor: count their team as labor
      case "subcontractor":
        if (r.teamSize) {
          labor += r.teamSize * overlapFactor;
          byTrade[tradeName] = (byTrade[tradeName] ?? 0) + r.teamSize * overlapFactor;
        }
        break;
    }
  }

  return { labor, byTrade, machinery, materials };
}

// ============================================================
// Main Function
// ============================================================

/**
 * Generate weekly resource histogram data from a project schedule.
 *
 * For each week in the project:
 * - Finds all tasks overlapping that week
 * - Sums labor (by trade), machinery, materials, and cost
 * - Computes cumulative cost (S-curve)
 *
 * If progress entries are provided, also computes actual cost per week.
 */
export function generateResourceHistogram(
  schedule: ProjectSchedule,
  progressEntries?: TaskProgress[],
): ResourceHistogramData {
  const detailTasks = schedule.tasks.filter((t) => !t.isSummary);
  if (detailTasks.length === 0) {
    return { points: [], peakLabor: 0, peakWeek: "", trades: [], totalWeeks: 0 };
  }

  const projectStartMs = toMs(schedule.startDate);
  const projectFinishMs = toMs(schedule.finishDate);

  // Build progress map if provided
  const progressMap = progressEntries
    ? new Map(progressEntries.map((p) => [p.taskUid, p]))
    : null;

  // Find first Monday before or on project start
  const firstMonday = getMonday(projectStartMs);
  // Last Sunday after or on project finish
  const lastSunday = getMonday(projectFinishMs) + MS_PER_WEEK - MS_PER_DAY;

  const points: ResourceHistogramPoint[] = [];
  const allTrades = new Set<string>();
  let peakLabor = 0;
  let peakWeek = "";
  let cumulativeCost = 0;
  let cumulativeActualCost = 0;

  // Iterate week by week
  let weekStartMs = firstMonday;
  while (weekStartMs <= lastSunday) {
    const weekEndMs = weekStartMs + MS_PER_WEEK;

    let totalLabor = 0;
    const totalByTrade: Record<string, number> = {};
    let totalMachinery = 0;
    let totalMaterials = 0;
    let weeklyCost = 0;
    let weeklyActualCost = 0;
    let hasActualCost = false;

    for (const task of detailTasks) {
      const taskStartMs = toMs(task.startDate);
      const taskFinishMs = toMs(task.finishDate);

      const overlap = weekOverlap(taskStartMs, taskFinishMs, weekStartMs, weekEndMs);
      if (overlap <= 0) continue;

      // Resources
      const res = sumResources(task.resources, overlap);
      totalLabor += res.labor;
      totalMachinery += res.machinery;
      totalMaterials += res.materials;

      for (const [trade, count] of Object.entries(res.byTrade)) {
        totalByTrade[trade] = (totalByTrade[trade] ?? 0) + count;
        allTrades.add(trade);
      }

      // Cost (proportional to overlap)
      const taskDurationMs = taskFinishMs - taskStartMs;
      if (taskDurationMs > 0) {
        const weekMs = Math.min(weekEndMs, taskFinishMs) - Math.max(weekStartMs, taskStartMs);
        weeklyCost += task.cost * (weekMs / taskDurationMs);
      }

      // Actual cost (if progress data available)
      if (progressMap) {
        const prog = progressMap.get(task.uid);
        if (prog) {
          if (prog.actualCost !== undefined) {
            // Distribute actual cost proportionally over task duration
            if (taskDurationMs > 0) {
              const weekMs = Math.min(weekEndMs, taskFinishMs) - Math.max(weekStartMs, taskStartMs);
              weeklyActualCost += prog.actualCost * (weekMs / taskDurationMs);
              hasActualCost = true;
            }
          } else {
            // Estimate from % complete × planned cost
            const estimatedAC = task.cost * (prog.percentComplete / 100);
            if (taskDurationMs > 0) {
              const weekMs = Math.min(weekEndMs, taskFinishMs) - Math.max(weekStartMs, taskStartMs);
              weeklyActualCost += estimatedAC * (weekMs / taskDurationMs);
              hasActualCost = true;
            }
          }
        }
      }
    }

    cumulativeCost += weeklyCost;
    cumulativeActualCost += weeklyActualCost;

    const roundedLabor = Math.round(totalLabor);
    if (roundedLabor > peakLabor) {
      peakLabor = roundedLabor;
      peakWeek = toIso(weekStartMs);
    }

    const point: ResourceHistogramPoint = {
      weekStart: toIso(weekStartMs),
      weekEnd: toIso(weekEndMs - MS_PER_DAY), // Sunday
      labor: roundedLabor,
      byTrade: Object.fromEntries(
        Object.entries(totalByTrade).map(([k, v]) => [k, Math.round(v)]),
      ),
      machinery: Math.round(totalMachinery),
      materials: Math.round(totalMaterials),
      cost: Math.round(weeklyCost),
      cumulativeCost: Math.round(cumulativeCost),
    };

    if (hasActualCost) {
      point.actualCost = Math.round(weeklyActualCost);
      point.cumulativeActualCost = Math.round(cumulativeActualCost);
    }

    points.push(point);
    weekStartMs += MS_PER_WEEK;
  }

  return {
    points,
    peakLabor,
    peakWeek,
    trades: Array.from(allTrades).sort(),
    totalWeeks: points.length,
  };
}

/**
 * Assign colors to trade names for consistent chart coloring.
 * Uses a predefined palette that contrasts well on white backgrounds.
 */
const TRADE_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#d946ef", // fuchsia
];

export function getTradeColor(tradeIndex: number): string {
  return TRADE_COLORS[tradeIndex % TRADE_COLORS.length];
}

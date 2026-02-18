/**
 * Cash Flow & S-Curve Calculator
 *
 * Distributes project costs linearly across task durations,
 * computes cumulative S-curve data, suggests payment milestones,
 * and calculates working capital requirements.
 */

import type { ProjectSchedule, ScheduleTask } from "./wbs-types";
import type { ProjectResources } from "./resource-aggregator";

// ============================================================
// Types
// ============================================================

export interface CashFlowOptions {
  /** Contingency percentage (5-15, default 10) */
  contingencyPercent?: number;
  /** Payment lag in days after milestone (default 30) */
  paymentLagDays?: number;
  /** Number of milestone intervals (default 5 = every 20%) */
  milestoneIntervals?: number;
}

export interface CashFlowPeriod {
  /** Period key: "2026-03" */
  key: string;
  /** Display label: "Mar 2026" */
  label: string;
  /** Period start date (ISO) */
  startDate: string;
  /** Period end date (ISO) */
  endDate: string;
  /** Material costs this period */
  materials: number;
  /** Labor costs this period */
  labor: number;
  /** Equipment costs this period */
  equipment: number;
  /** Total cost = materials + labor + equipment */
  total: number;
  /** Dominant phase during this period */
  dominantPhase: string;
  /** Number of active tasks during this period */
  activeTaskCount: number;
}

export interface SCurvePoint {
  /** Period key matching CashFlowPeriod */
  periodKey: string;
  /** Cumulative cost up to and including this period */
  cumulativeCost: number;
  /** Cumulative percentage of total (0-100) */
  cumulativePercent: number;
  /** Period spend (same as CashFlowPeriod.total) */
  periodSpend: number;
}

export interface PaymentMilestone {
  /** Milestone number (1, 2, 3...) */
  number: number;
  /** Suggested payment date (ISO) */
  date: string;
  /** Period key where this falls */
  periodKey: string;
  /** Cumulative percentage at this point */
  cumulativePercent: number;
  /** Suggested payment amount */
  amount: number;
  /** Phase boundary name if aligned */
  phaseBoundary?: string;
  /** Portuguese label */
  label: string;
}

export interface WorkingCapitalAnalysis {
  /** Maximum cash exposure before payments */
  maxExposure: number;
  /** Period where max exposure occurs */
  maxExposurePeriod: string;
  /** Recommended working capital (maxExposure + contingency) */
  recommendedWorkingCapital: number;
  /** Average monthly burn rate */
  averageMonthlyBurn: number;
  /** Peak monthly spend */
  peakMonthlySpend: number;
  /** Peak month key */
  peakMonth: string;
}

export interface ContingencyBuffer {
  /** Percentage (5-15) */
  percent: number;
  /** Absolute amount */
  amount: number;
  /** Rationale */
  rationale: string;
}

export interface CashFlowResult {
  /** Monthly cost periods */
  periods: CashFlowPeriod[];
  /** Cumulative S-curve data */
  sCurve: SCurvePoint[];
  /** Suggested payment milestones */
  milestones: PaymentMilestone[];
  /** Working capital analysis */
  workingCapital: WorkingCapitalAnalysis;
  /** Contingency buffer */
  contingency: ContingencyBuffer;
  /** Total project cost (from schedule) */
  totalCost: number;
  /** Total with contingency */
  totalWithContingency: number;
  /** Project start date */
  startDate: string;
  /** Project finish date */
  finishDate: string;
  /** Number of months */
  totalMonths: number;
}

// ============================================================
// Date Utilities
// ============================================================

function isWorkingDay(d: Date): boolean {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6;
}

function parseDate(s: string): Date {
  return new Date(s + "T08:00:00");
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const idx = parseInt(month, 10) - 1;
  return `${MONTH_NAMES_PT[idx]} ${year}`;
}

function getWorkingDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    if (isWorkingDay(current)) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function monthStartDate(key: string): string {
  return `${key}-01`;
}

function monthEndDate(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${key}-${String(lastDay).padStart(2, "0")}`;
}

function addCalendarDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// ============================================================
// Major Phase Boundaries (for milestone snapping)
// ============================================================

const MAJOR_PHASE_BOUNDARIES: Record<string, string> = {
  foundations: "Fundações concluídas",
  structural_frame: "Estrutura concluída",
  external_walls: "Envolvente concluída",
  plumbing_first_fix: "MEP 1.ª fase concluída",
  interior_painting: "Acabamentos concluídos",
};

// ============================================================
// Cost Distribution
// ============================================================

interface MonthBucket {
  materials: number;
  labor: number;
  equipment: number;
  phaseCosts: Map<string, number>;
  activeTasks: Set<string>;
}

function getTaskCostBreakdown(task: ScheduleTask): {
  materialRatio: number;
  laborRatio: number;
  equipmentRatio: number;
} {
  let materials = 0;
  let labor = 0;
  let equipment = 0;

  for (const res of task.resources) {
    const cost =
      res.type === "labor"
        ? res.rate * res.hours
        : res.rate * res.units;

    if (res.type === "material") materials += cost;
    else if (res.type === "labor" || res.type === "subcontractor") labor += cost;
    else if (res.type === "machinery") equipment += cost;
  }

  const total = materials + labor + equipment;
  if (total === 0) return { materialRatio: 0, laborRatio: 0, equipmentRatio: 0 };

  return {
    materialRatio: materials / total,
    laborRatio: labor / total,
    equipmentRatio: equipment / total,
  };
}

function distributeCosts(tasks: ScheduleTask[]): Map<string, MonthBucket> {
  const buckets = new Map<string, MonthBucket>();

  function ensureBucket(key: string): MonthBucket {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        materials: 0,
        labor: 0,
        equipment: 0,
        phaseCosts: new Map(),
        activeTasks: new Set(),
      };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  for (const task of tasks) {
    if (task.isSummary || task.cost <= 0) continue;

    const start = parseDate(task.startDate);
    const end = parseDate(task.finishDate);
    const workingDays = getWorkingDays(start, end);

    if (workingDays.length === 0) continue;

    const dailyCost = task.cost / workingDays.length;
    const { materialRatio, laborRatio, equipmentRatio } = getTaskCostBreakdown(task);

    for (const day of workingDays) {
      const mk = monthKey(day);
      const bucket = ensureBucket(mk);

      bucket.materials += dailyCost * materialRatio;
      bucket.labor += dailyCost * laborRatio;
      bucket.equipment += dailyCost * equipmentRatio;

      const phaseCost = bucket.phaseCosts.get(task.phase) ?? 0;
      bucket.phaseCosts.set(task.phase, phaseCost + dailyCost);
      bucket.activeTasks.add(task.wbs);
    }
  }

  return buckets;
}

// ============================================================
// S-Curve
// ============================================================

function computeSCurve(
  periods: CashFlowPeriod[],
  totalCost: number,
): SCurvePoint[] {
  let cumulative = 0;
  return periods.map((p) => {
    cumulative += p.total;
    return {
      periodKey: p.key,
      cumulativeCost: cumulative,
      cumulativePercent: totalCost > 0 ? (cumulative / totalCost) * 100 : 0,
      periodSpend: p.total,
    };
  });
}

// ============================================================
// Payment Milestones
// ============================================================

function findPhaseBoundaries(
  tasks: ScheduleTask[],
): Map<string, { phase: string; label: string }> {
  // Find the last month for each major phase
  const phaseLastMonth = new Map<string, string>();

  for (const task of tasks) {
    if (task.isSummary) continue;
    if (!(task.phase in MAJOR_PHASE_BOUNDARIES)) continue;

    const end = parseDate(task.finishDate);
    const mk = monthKey(end);
    const existing = phaseLastMonth.get(task.phase);
    if (!existing || mk > existing) {
      phaseLastMonth.set(task.phase, mk);
    }
  }

  // Invert: month → phase boundary
  const boundaries = new Map<string, { phase: string; label: string }>();
  for (const [phase, mk] of phaseLastMonth) {
    boundaries.set(mk, {
      phase,
      label: MAJOR_PHASE_BOUNDARIES[phase],
    });
  }

  return boundaries;
}

function suggestMilestones(
  sCurve: SCurvePoint[],
  tasks: ScheduleTask[],
  totalCost: number,
  intervals: number,
): PaymentMilestone[] {
  if (sCurve.length === 0 || totalCost <= 0) return [];

  const boundaries = findPhaseBoundaries(tasks);
  const milestones: PaymentMilestone[] = [];
  let cumulativePaid = 0;

  for (let i = 1; i <= intervals; i++) {
    const targetPercent = (i / intervals) * 100;

    // Find first S-curve point crossing this threshold
    const point = sCurve.find((p) => p.cumulativePercent >= targetPercent);
    if (!point) continue;

    const pointIndex = sCurve.indexOf(point);

    // Check for phase boundary within ±1 period
    let phaseBoundary: string | undefined;
    let snappedKey = point.periodKey;
    let snappedPoint = point;

    for (let offset = -1; offset <= 1; offset++) {
      const checkIdx = pointIndex + offset;
      if (checkIdx < 0 || checkIdx >= sCurve.length) continue;
      const checkKey = sCurve[checkIdx].periodKey;
      const boundary = boundaries.get(checkKey);
      if (boundary) {
        phaseBoundary = boundary.label;
        snappedKey = checkKey;
        snappedPoint = sCurve[checkIdx];
        break;
      }
    }

    const amount = snappedPoint.cumulativeCost - cumulativePaid;
    cumulativePaid = snappedPoint.cumulativeCost;

    const labelPrefix = `${i}.º Pagamento`;
    const label = phaseBoundary
      ? `${labelPrefix} — ${phaseBoundary}`
      : `${labelPrefix} — ${Math.round(snappedPoint.cumulativePercent)}% concluído`;

    milestones.push({
      number: i,
      date: monthEndDate(snappedKey),
      periodKey: snappedKey,
      cumulativePercent: snappedPoint.cumulativePercent,
      amount,
      phaseBoundary,
      label,
    });
  }

  return milestones;
}

// ============================================================
// Working Capital Analysis
// ============================================================

function analyzeWorkingCapital(
  sCurve: SCurvePoint[],
  milestones: PaymentMilestone[],
  contingency: ContingencyBuffer,
  paymentLagDays: number,
): WorkingCapitalAnalysis {
  if (sCurve.length === 0) {
    return {
      maxExposure: 0,
      maxExposurePeriod: "",
      recommendedWorkingCapital: 0,
      averageMonthlyBurn: 0,
      peakMonthlySpend: 0,
      peakMonth: "",
    };
  }

  // Compute when each milestone payment is received
  // (milestone date + paymentLagDays)
  const paymentReceipts: Array<{ receiveByPeriod: string; amount: number }> = [];
  for (const m of milestones) {
    const receiveDate = addCalendarDays(m.date, paymentLagDays);
    // Map to period key (YYYY-MM)
    const d = parseDate(receiveDate);
    paymentReceipts.push({
      receiveByPeriod: monthKey(d),
      amount: m.amount,
    });
  }

  // For each period, compute net position
  let maxExposure = 0;
  let maxExposurePeriod = sCurve[0].periodKey;
  let peakMonthlySpend = 0;
  let peakMonth = sCurve[0].periodKey;

  for (const point of sCurve) {
    // Track peak monthly spend
    if (point.periodSpend > peakMonthlySpend) {
      peakMonthlySpend = point.periodSpend;
      peakMonth = point.periodKey;
    }

    // Sum payments received up to this period
    let paymentsReceived = 0;
    for (const receipt of paymentReceipts) {
      if (receipt.receiveByPeriod <= point.periodKey) {
        paymentsReceived += receipt.amount;
      }
    }

    const netPosition = point.cumulativeCost - paymentsReceived;
    if (netPosition > maxExposure) {
      maxExposure = netPosition;
      maxExposurePeriod = point.periodKey;
    }
  }

  const totalCost = sCurve[sCurve.length - 1].cumulativeCost;
  const averageMonthlyBurn = sCurve.length > 0 ? totalCost / sCurve.length : 0;

  return {
    maxExposure,
    maxExposurePeriod,
    recommendedWorkingCapital: maxExposure + contingency.amount,
    averageMonthlyBurn,
    peakMonthlySpend,
    peakMonth,
  };
}

// ============================================================
// Contingency
// ============================================================

function computeContingency(
  totalCost: number,
  percent?: number,
): ContingencyBuffer {
  const raw = percent ?? 10;
  const clamped = Math.max(5, Math.min(15, raw));
  const amount = totalCost * (clamped / 100);

  let rationale: string;
  if (clamped <= 7) {
    rationale = "Projeto bem definido, baixo risco";
  } else if (clamped <= 12) {
    rationale = "Margem standard para imprevistos";
  } else {
    rationale = "Projeto complexo ou informação incompleta";
  }

  return { percent: clamped, amount, rationale };
}

// ============================================================
// Main Entry Point
// ============================================================

export function calculateCashFlow(
  schedule: ProjectSchedule,
  _resources: ProjectResources,
  options?: CashFlowOptions,
): CashFlowResult {
  const contingencyPercent = options?.contingencyPercent;
  const paymentLagDays = options?.paymentLagDays ?? 30;
  const milestoneIntervals = options?.milestoneIntervals ?? 5;

  const articleTasks = schedule.tasks.filter((t) => !t.isSummary);

  // Total cost from schedule
  const totalCost = schedule.totalCost;

  // Contingency
  const contingency = computeContingency(totalCost, contingencyPercent);

  // Distribute costs across months
  const buckets = distributeCosts(articleTasks);

  // Sort months chronologically
  const sortedKeys = Array.from(buckets.keys()).sort();

  // Build periods
  const periods: CashFlowPeriod[] = sortedKeys.map((key) => {
    const bucket = buckets.get(key)!;
    const total = bucket.materials + bucket.labor + bucket.equipment;

    // Find dominant phase
    let dominantPhase = "Geral";
    let maxPhaseCost = 0;
    for (const [phase, cost] of bucket.phaseCosts) {
      if (cost > maxPhaseCost) {
        maxPhaseCost = cost;
        dominantPhase = phase;
      }
    }

    return {
      key,
      label: monthLabel(key),
      startDate: monthStartDate(key),
      endDate: monthEndDate(key),
      materials: bucket.materials,
      labor: bucket.labor,
      equipment: bucket.equipment,
      total,
      dominantPhase,
      activeTaskCount: bucket.activeTasks.size,
    };
  });

  // Apply rounding correction to match totalCost exactly
  if (periods.length > 0 && totalCost > 0) {
    const distributedTotal = periods.reduce((sum, p) => sum + p.total, 0);
    const diff = totalCost - distributedTotal;
    if (Math.abs(diff) > 0.001) {
      const lastPeriod = periods[periods.length - 1];
      lastPeriod.total += diff;
      // Assign correction to the largest cost category
      if (lastPeriod.materials >= lastPeriod.labor && lastPeriod.materials >= lastPeriod.equipment) {
        lastPeriod.materials += diff;
      } else if (lastPeriod.labor >= lastPeriod.equipment) {
        lastPeriod.labor += diff;
      } else {
        lastPeriod.equipment += diff;
      }
    }
  }

  // S-Curve
  const sCurve = computeSCurve(periods, totalCost);

  // Payment milestones
  const milestones = suggestMilestones(
    sCurve,
    schedule.tasks,
    totalCost,
    milestoneIntervals,
  );

  // Working capital analysis
  const workingCapital = analyzeWorkingCapital(
    sCurve,
    milestones,
    contingency,
    paymentLagDays,
  );

  return {
    periods,
    sCurve,
    milestones,
    workingCapital,
    contingency,
    totalCost,
    totalWithContingency: totalCost + contingency.amount,
    startDate: schedule.startDate,
    finishDate: schedule.finishDate,
    totalMonths: periods.length,
  };
}

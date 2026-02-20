import { describe, it, expect } from "vitest";
import {
  captureBaseline,
  computeEvmSnapshot,
  validateBaseline,
  type TaskProgress,
} from "@/lib/earned-value";
import type { ProjectSchedule, ScheduleTask, ProjectResource } from "@/lib/wbs-types";

// ============================================================
// Helpers
// ============================================================

function makeTask(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    uid: 1,
    wbs: "1.1.1",
    name: "Test Task",
    durationDays: 10,
    durationHours: 80,
    startDate: "2026-03-02",
    finishDate: "2026-03-13",
    predecessors: [],
    isSummary: false,
    phase: "foundations",
    resources: [],
    cost: 10000,
    materialCost: 5000,
    outlineLevel: 3,
    percentComplete: 0,
    ...overrides,
  };
}

function makeSchedule(tasks: ScheduleTask[]): ProjectSchedule {
  const starts = tasks.filter(t => !t.isSummary).map(t => t.startDate).sort();
  const finishes = tasks.filter(t => !t.isSummary).map(t => t.finishDate).sort();
  return {
    projectName: "Test Project",
    startDate: starts[0] || "2026-03-02",
    finishDate: finishes[finishes.length - 1] || "2026-06-30",
    totalDurationDays: 85,
    totalCost: tasks.reduce((s, t) => s + t.cost, 0),
    tasks,
    resources: [] as ProjectResource[],
    criticalPath: tasks.filter(t => !t.isSummary).map(t => t.uid),
    teamSummary: {
      maxWorkers: 10,
      averageWorkers: 5,
      totalManHours: 4000,
      peakWeek: "2026-W12",
    },
  };
}

// ============================================================
// Edge Case Tests
// ============================================================

describe("EVM Edge Cases", () => {
  it("handles zero-duration milestone tasks", () => {
    const tasks = [
      makeTask({ uid: 1, durationDays: 0, cost: 0, startDate: "2026-03-10", finishDate: "2026-03-10", isMilestone: true }),
      makeTask({ uid: 2, cost: 10000 }),
    ];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 100 },
      { taskUid: 2, percentComplete: 50 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-09");

    // Milestone EV=0 (cost=0), task2 EV=5000
    expect(snap.earnedValue).toBe(5000);
    expect(snap.tasksByStatus.completed).toBe(1);
  });

  it("handles all tasks 100% complete", () => {
    const tasks = [
      makeTask({ uid: 1, cost: 20000 }),
      makeTask({ uid: 2, cost: 30000, startDate: "2026-03-16", finishDate: "2026-04-10", durationDays: 20 }),
    ];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 100 },
      { taskUid: 2, percentComplete: 100 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-04-10");

    expect(snap.earnedValue).toBe(50000);
    expect(snap.tasksByStatus.completed).toBe(2);
    expect(snap.spi).toBeGreaterThanOrEqual(1);
  });

  it("handles data date before project start", () => {
    const tasks = [makeTask({ uid: 1, cost: 10000 })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    const snap = computeEvmSnapshot(baseline, schedule, [], "2026-01-01");

    // Before project starts — PV should be 0
    expect(snap.plannedValue).toBe(0);
    expect(snap.earnedValue).toBe(0);
    expect(snap.actualCost).toBe(0);
  });

  it("handles data date after project finish", () => {
    const tasks = [makeTask({ uid: 1, cost: 10000 })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    const snap = computeEvmSnapshot(baseline, schedule, [], "2026-12-31");

    // After project ends — PV should equal BAC
    expect(snap.plannedValue).toBe(10000);
  });

  it("handles early completion (negative schedule variance is positive SV)", () => {
    // Task scheduled for 10 days but 100% complete midway
    const tasks = [makeTask({ uid: 1, cost: 10000, durationDays: 10 })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    const progress: TaskProgress[] = [{ taskUid: 1, percentComplete: 100 }];
    // At day 5, only ~50% of PV should be scheduled, but 100% earned
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-06");

    expect(snap.scheduleVariance).toBeGreaterThan(0);
    expect(snap.spi).toBeGreaterThan(1);
  });

  it("computes TCPI > 1 when behind on cost", () => {
    const tasks = [makeTask({ uid: 1, cost: 10000 })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    // 30% complete but spent 50% of budget
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 30, actualCost: 5000 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-06");

    // TCPI = (BAC - EV) / (BAC - AC) = (10000 - 3000) / (10000 - 5000) = 7000/5000 = 1.4
    expect(snap.toCompletePerformanceIndex).toBeGreaterThan(1);
  });

  it("handles 500+ tasks within reasonable time", () => {
    const tasks: ScheduleTask[] = [];
    for (let i = 1; i <= 500; i++) {
      tasks.push(makeTask({
        uid: i,
        name: `Task ${i}`,
        cost: 1000,
        startDate: "2026-03-02",
        finishDate: "2026-06-30",
        durationDays: 85,
      }));
    }
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    const progress = tasks.map(t => ({ taskUid: t.uid, percentComplete: 50 }));

    const start = performance.now();
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-05-01");
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500); // Must complete in <500ms
    expect(snap.earnedValue).toBe(250000); // 500 tasks × 1000 × 50%
  });

  it("handles tasks with zero cost without division errors", () => {
    const tasks = [
      makeTask({ uid: 1, cost: 0, name: "Zero cost task" }),
      makeTask({ uid: 2, cost: 10000 }),
    ];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 100 },
      { taskUid: 2, percentComplete: 50 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-09");

    expect(snap.earnedValue).toBe(5000);
    expect(Number.isFinite(snap.spi)).toBe(true);
    expect(Number.isFinite(snap.cpi)).toBe(true);
  });

  it("handles actual cost with 0% progress", () => {
    const tasks = [makeTask({ uid: 1, cost: 10000 })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);
    // Spent money but no physical progress
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 0, actualCost: 3000 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-09");

    // EV=0, AC=3000 → CPI=0 (or gracefully handled)
    expect(snap.earnedValue).toBe(0);
    expect(snap.actualCost).toBe(3000);
    expect(snap.costVariance).toBeLessThan(0);
    expect(Number.isFinite(snap.cpi)).toBe(true);
  });
});

// ============================================================
// Baseline Validation
// ============================================================

describe("validateBaseline", () => {
  it("detects stale baseline when finish date changed", () => {
    const tasks = [makeTask({ uid: 1, cost: 10000 })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);

    // Modify schedule finish date
    const modified = { ...schedule, finishDate: "2026-12-31" };
    const result = validateBaseline(baseline, modified);

    expect(result.isStale).toBe(true);
    expect(result.reason).toContain("conclusão");
  });

  it("detects stale baseline when task count changed", () => {
    const tasks = [makeTask({ uid: 1, cost: 10000 })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);

    // Add a new task
    const modified = {
      ...schedule,
      tasks: [...schedule.tasks, makeTask({ uid: 99, cost: 5000 })],
    };
    const result = validateBaseline(baseline, modified);

    expect(result.isStale).toBe(true);
    expect(result.taskCountChanged).toBe(true);
  });

  it("detects stale baseline when task shifted >7 days", () => {
    const tasks = [makeTask({ uid: 1, cost: 10000, finishDate: "2026-03-13" })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);

    // Shift task by 10 days
    const modified = {
      ...schedule,
      tasks: [makeTask({ uid: 1, cost: 10000, finishDate: "2026-03-27" })],
    };
    const result = validateBaseline(baseline, modified);

    expect(result.isStale).toBe(true);
    expect(result.reason).toContain("significativamente");
  });

  it("reports valid baseline when nothing changed", () => {
    const tasks = [makeTask({ uid: 1, cost: 10000 })];
    const schedule = makeSchedule(tasks);
    const baseline = captureBaseline(schedule);

    const result = validateBaseline(baseline, schedule);

    expect(result.isStale).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});

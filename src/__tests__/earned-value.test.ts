import { describe, it, expect } from "vitest";
import {
  captureBaseline,
  computeEvmSnapshot,
  generateSCurveData,
  type EvmBaseline,
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
    startDate: "2026-03-02", // Monday
    finishDate: "2026-03-13", // Friday
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
  const allStarts = tasks.map(t => t.startDate).sort();
  const allFinishes = tasks.map(t => t.finishDate).sort();
  return {
    projectName: "Test Project",
    startDate: allStarts[0] || "2026-03-02",
    finishDate: allFinishes[allFinishes.length - 1] || "2026-06-30",
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
// captureBaseline
// ============================================================

describe("captureBaseline", () => {
  it("captures all work tasks (excludes summary)", () => {
    const tasks = [
      makeTask({ uid: 100, isSummary: true, name: "Chapter" }),
      makeTask({ uid: 1, name: "Task A", cost: 5000 }),
      makeTask({ uid: 2, name: "Task B", cost: 3000 }),
    ];
    const schedule = makeSchedule(tasks);
    const bl = captureBaseline(schedule);

    expect(bl.tasks).toHaveLength(2);
    expect(bl.tasks.map(t => t.uid)).toEqual([1, 2]);
    expect(bl.totalCost).toBe(schedule.totalCost);
    expect(bl.projectName).toBe("Test Project");
    expect(bl.capturedAt).toBeTruthy();
  });

  it("freezes dates and costs", () => {
    const task = makeTask({ uid: 1, cost: 10000, startDate: "2026-04-01", finishDate: "2026-05-01" });
    const bl = captureBaseline(makeSchedule([task]));

    expect(bl.tasks[0].cost).toBe(10000);
    expect(bl.tasks[0].startDate).toBe("2026-04-01");
    expect(bl.tasks[0].finishDate).toBe("2026-05-01");
  });
});

// ============================================================
// computeEvmSnapshot
// ============================================================

describe("computeEvmSnapshot", () => {
  const tasks = [
    makeTask({ uid: 1, name: "Foundations", cost: 20000, startDate: "2026-03-02", finishDate: "2026-03-13", durationDays: 10 }),
    makeTask({ uid: 2, name: "Structure", cost: 30000, startDate: "2026-03-16", finishDate: "2026-04-10", durationDays: 20 }),
  ];
  const schedule = makeSchedule(tasks);
  const baseline = captureBaseline(schedule);

  it("returns zero EV/AC when no progress reported", () => {
    const snap = computeEvmSnapshot(baseline, schedule, [], "2026-03-13");

    expect(snap.earnedValue).toBe(0);
    expect(snap.actualCost).toBe(0);
    expect(snap.budgetAtCompletion).toBe(50000);
    expect(snap.plannedValue).toBeGreaterThan(0);
  });

  it("computes EV from percent complete", () => {
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 50 },
      { taskUid: 2, percentComplete: 0 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-09");

    // Task 1 BAC=20000, 50% = EV of 10000
    expect(snap.earnedValue).toBe(10000);
  });

  it("computes variances correctly — ahead of schedule", () => {
    // At March 9, about 5/10 of task 1 should be scheduled → PV ~10000
    // But we report 80% complete → EV = 16000
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 80 },
      { taskUid: 2, percentComplete: 0 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-09");

    // EV=16000, PV≈10000 → SV positive (ahead)
    expect(snap.scheduleVariance).toBeGreaterThan(0);
    expect(snap.spi).toBeGreaterThan(1);
  });

  it("computes variances correctly — behind schedule", () => {
    // At March 13, task 1 fully scheduled → PV=20000
    // But only 20% complete → EV=4000
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 20 },
      { taskUid: 2, percentComplete: 0 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-13");

    expect(snap.scheduleVariance).toBeLessThan(0);
    expect(snap.spi).toBeLessThan(1);
  });

  it("computes CPI with actual cost override", () => {
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 100, actualCost: 25000 }, // over budget
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-13");

    // EV = 20000 (100% of BAC), AC = 25000
    // CPI = 20000/25000 = 0.8
    expect(snap.cpi).toBeCloseTo(0.8, 1);
    expect(snap.costVariance).toBeLessThan(0);
  });

  it("calculates EAC and ETC", () => {
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 100, actualCost: 25000 },
      { taskUid: 2, percentComplete: 50, actualCost: 20000 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-27");

    // BAC = 50000, CPI = EV/AC
    // EV = 20000 + 15000 = 35000, AC = 25000 + 20000 = 45000
    // CPI = 35000/45000 ≈ 0.778
    // EAC = BAC/CPI = 50000/0.778 ≈ 64286
    expect(snap.estimateAtCompletion).toBeGreaterThan(50000);
    expect(snap.estimateToComplete).toBeGreaterThan(0);
  });

  it("marks tasks as completed when 100%", () => {
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 100 },
      { taskUid: 2, percentComplete: 100 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-04-10");

    expect(snap.tasksByStatus.completed).toBe(2);
    expect(snap.tasksByStatus.onTrack).toBe(0);
  });

  it("identifies critical path tasks", () => {
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 50 },
      { taskUid: 2, percentComplete: 10 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-20");

    // Both tasks are on critical path in our test schedule
    expect(snap.taskMetrics.every(t => t.isCritical)).toBe(true);
  });

  it("health is green when SPI and CPI both >= 0.9", () => {
    // All tasks on or ahead of schedule
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 100 },
      { taskUid: 2, percentComplete: 50 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-27");

    expect(snap.health).toBe("green");
  });

  it("health is red when SPI < 0.75", () => {
    // Very behind schedule
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 10 },
      { taskUid: 2, percentComplete: 0 },
    ];
    // Late in the project
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-04-08");

    expect(snap.health).toBe("red");
  });

  it("projects schedule slippage for behind-schedule project", () => {
    const progress: TaskProgress[] = [
      { taskUid: 1, percentComplete: 50 },
      { taskUid: 2, percentComplete: 0 },
    ];
    const snap = computeEvmSnapshot(baseline, schedule, progress, "2026-03-27");

    // Behind schedule → slippage should be positive
    expect(snap.scheduleSlippageDays).toBeGreaterThan(0);
    expect(snap.projectedFinishDate > baseline.finishDate).toBe(true);
  });
});

// ============================================================
// generateSCurveData
// ============================================================

describe("generateSCurveData", () => {
  it("generates weekly PV points from start to finish", () => {
    const task = makeTask({ uid: 1, cost: 10000 });
    const baseline = captureBaseline(makeSchedule([task]));
    const points = generateSCurveData(baseline);

    expect(points.length).toBeGreaterThanOrEqual(2);
    // First point should have low PV
    expect(points[0].plannedValue).toBeLessThanOrEqual(points[points.length - 1].plannedValue);
    // Last point should equal total cost
    expect(points[points.length - 1].plannedValue).toBe(10000);
  });

  it("includes EV/AC when progress provided and dates are in the past", () => {
    // Use past dates so the "current <= new Date()" check passes
    const task = makeTask({ uid: 1, cost: 10000, startDate: "2025-01-06", finishDate: "2025-01-17", durationDays: 10 });
    const sch = makeSchedule([task]);
    sch.startDate = "2025-01-06";
    sch.finishDate = "2025-01-17";
    const baseline = captureBaseline(sch);
    const progress: TaskProgress[] = [{ taskUid: 1, percentComplete: 40 }];
    const points = generateSCurveData(baseline, progress);

    // Points in the past should have EV defined
    const withEv = points.filter(p => p.earnedValue !== undefined);
    expect(withEv.length).toBeGreaterThan(0);
    expect(withEv[0].earnedValue).toBe(4000); // 40% of 10000
  });

  it("PV curve is monotonically non-decreasing", () => {
    const tasks = [
      makeTask({ uid: 1, cost: 5000, startDate: "2026-03-02", finishDate: "2026-03-13" }),
      makeTask({ uid: 2, cost: 8000, startDate: "2026-03-16", finishDate: "2026-04-10" }),
    ];
    const baseline = captureBaseline(makeSchedule(tasks));
    const points = generateSCurveData(baseline);

    for (let i = 1; i < points.length; i++) {
      expect(points[i].plannedValue).toBeGreaterThanOrEqual(points[i - 1].plannedValue);
    }
  });
});

import { describe, it, expect } from "vitest";
import { calculateCashFlow } from "@/lib/cashflow";
import type { CashFlowResult } from "@/lib/cashflow";
import type {
  ProjectSchedule,
  ProjectResources,
  ScheduleTask,
  TaskResource,
} from "@/lib/wbs-types";

// ============================================================
// Helpers
// ============================================================

function makeResource(
  type: "labor" | "material" | "machinery",
  rate: number,
  units: number,
  hours: number,
): TaskResource {
  return { name: `${type}-res`, type, units, rate, hours };
}

function makeTask(overrides: Partial<ScheduleTask> & { uid: number }): ScheduleTask {
  return {
    wbs: "01.01.001",
    name: "Test Task",
    durationDays: 5,
    durationHours: 40,
    startDate: "2026-03-02", // Monday
    finishDate: "2026-03-06", // Friday
    predecessors: [],
    phase: "foundations" as ScheduleTask["phase"],
    resources: [
      makeResource("material", 100, 10, 0),  // 1000
      makeResource("labor", 15, 2, 40),       // 600
    ],
    cost: 1600,
    materialCost: 1000,
    outlineLevel: 3,
    percentComplete: 0,
    isSummary: false,
    ...overrides,
  };
}

function makeSchedule(tasks: ScheduleTask[]): ProjectSchedule {
  const starts = tasks.filter((t) => !t.isSummary).map((t) => t.startDate);
  const ends = tasks.filter((t) => !t.isSummary).map((t) => t.finishDate);
  const totalCost = tasks
    .filter((t) => t.isSummary)
    .reduce((sum, t) => sum + t.cost, 0)
    || tasks.filter((t) => !t.isSummary).reduce((sum, t) => sum + t.cost, 0);

  return {
    projectName: "Test Project",
    startDate: starts.length > 0 ? starts.sort()[0] : "2026-03-02",
    finishDate: ends.length > 0 ? ends.sort().reverse()[0] : "2026-03-06",
    totalDurationDays: 60,
    totalCost,
    tasks,
    resources: [],
    criticalPath: [],
    teamSummary: {
      maxWorkers: 6,
      averageWorkers: 4,
      totalManHours: 480,
      peakWeek: "2026-W10",
    },
  };
}

function makeResources(): ProjectResources {
  return {
    materials: [],
    labor: [],
    equipment: [],
    totalMaterialCost: 1000,
    totalLaborCost: 600,
    totalEquipmentCost: 0,
    grandTotal: 1600,
  };
}

// ============================================================
// Cost Distribution Tests
// ============================================================

describe("cost distribution", () => {
  it("distributes a single-week task entirely within one month", () => {
    // Mon Mar 2 - Fri Mar 6 = 5 working days, all in March
    const task = makeTask({ uid: 1 });
    const result = calculateCashFlow(makeSchedule([task]), makeResources());

    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].key).toBe("2026-03");
    expect(result.periods[0].total).toBeCloseTo(1600, 1);
  });

  it("distributes a 2-month task proportionally across both months", () => {
    // Mar 16 (Mon) to Apr 10 (Fri) = ~20 working days
    // Mar 16-31: 12 working days
    // Apr 1-10: 8 working days
    const task = makeTask({
      uid: 1,
      startDate: "2026-03-16",
      finishDate: "2026-04-10",
      durationDays: 20,
      cost: 2000,
      resources: [makeResource("labor", 25, 2, 40)],
    });

    const result = calculateCashFlow(makeSchedule([task]), makeResources());

    expect(result.periods).toHaveLength(2);
    expect(result.periods[0].key).toBe("2026-03");
    expect(result.periods[1].key).toBe("2026-04");

    // March should have more cost than April (12 vs 8 working days)
    expect(result.periods[0].total).toBeGreaterThan(result.periods[1].total);

    // Total should equal task cost
    const totalDistributed = result.periods.reduce((s, p) => s + p.total, 0);
    expect(totalDistributed).toBeCloseTo(2000, 1);
  });

  it("skips weekends (no cost on Sat/Sun)", () => {
    // Mon Mar 2 - Mon Mar 9 = 6 working days (Mon-Fri + next Mon)
    const task = makeTask({
      uid: 1,
      startDate: "2026-03-02",
      finishDate: "2026-03-09",
      cost: 600,
      resources: [makeResource("labor", 10, 1, 60)],
    });

    const result = calculateCashFlow(makeSchedule([task]), makeResources());
    // All 6 days in March, cost per day = 100
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].total).toBeCloseTo(600, 1);
  });

  it("handles a 1-day task correctly", () => {
    const task = makeTask({
      uid: 1,
      startDate: "2026-03-02", // Monday
      finishDate: "2026-03-02", // Same day
      durationDays: 1,
      cost: 500,
      resources: [makeResource("material", 500, 1, 0)],
    });

    const result = calculateCashFlow(makeSchedule([task]), makeResources());

    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].total).toBeCloseTo(500, 1);
  });

  it("handles zero-cost tasks without NaN", () => {
    const task = makeTask({
      uid: 1,
      cost: 0,
      resources: [],
    });

    const schedule = makeSchedule([task]);
    schedule.totalCost = 0;
    const result = calculateCashFlow(schedule, makeResources());

    // No periods since zero cost skips distribution
    expect(result.totalCost).toBe(0);
    for (const p of result.periods) {
      expect(Number.isNaN(p.total)).toBe(false);
    }
  });

  it("distributes materials, labor, equipment independently", () => {
    const task = makeTask({
      uid: 1,
      cost: 3000,
      resources: [
        makeResource("material", 100, 10, 0),   // 1000
        makeResource("labor", 20, 2, 50),         // 1000
        makeResource("machinery", 200, 5, 0),     // 1000
      ],
    });

    const result = calculateCashFlow(makeSchedule([task]), makeResources());

    expect(result.periods).toHaveLength(1);
    const p = result.periods[0];
    // Each category should get ~1/3 of total
    expect(p.materials).toBeCloseTo(1000, 0);
    expect(p.labor).toBeCloseTo(1000, 0);
    expect(p.equipment).toBeCloseTo(1000, 0);
  });
});

// ============================================================
// S-Curve Tests
// ============================================================

describe("S-curve calculation", () => {
  it("last point equals 100% of total cost", () => {
    const task = makeTask({ uid: 1, cost: 5000 });
    const schedule = makeSchedule([task]);
    schedule.totalCost = 5000;
    const result = calculateCashFlow(schedule, makeResources());

    const lastPoint = result.sCurve[result.sCurve.length - 1];
    expect(lastPoint.cumulativePercent).toBeCloseTo(100, 1);
    expect(lastPoint.cumulativeCost).toBeCloseTo(5000, 1);
  });

  it("cumulative values are monotonically increasing", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-02", finishDate: "2026-03-20", cost: 2000 }),
      makeTask({ uid: 2, startDate: "2026-04-01", finishDate: "2026-04-17", cost: 3000, phase: "structural_frame" as ScheduleTask["phase"] }),
    ];
    const schedule = makeSchedule(tasks);
    schedule.totalCost = 5000;
    const result = calculateCashFlow(schedule, makeResources());

    for (let i = 1; i < result.sCurve.length; i++) {
      expect(result.sCurve[i].cumulativeCost).toBeGreaterThanOrEqual(
        result.sCurve[i - 1].cumulativeCost,
      );
    }
  });

  it("single-month project has one S-curve point", () => {
    const task = makeTask({ uid: 1, cost: 1000 });
    const schedule = makeSchedule([task]);
    schedule.totalCost = 1000;
    const result = calculateCashFlow(schedule, makeResources());

    expect(result.sCurve).toHaveLength(1);
    expect(result.sCurve[0].cumulativePercent).toBeCloseTo(100, 1);
  });

  it("total S-curve cost matches schedule totalCost", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-02", finishDate: "2026-03-20", cost: 3000 }),
      makeTask({ uid: 2, startDate: "2026-04-01", finishDate: "2026-05-15", cost: 7000, phase: "structural_frame" as ScheduleTask["phase"] }),
    ];
    const schedule = makeSchedule(tasks);
    schedule.totalCost = 10000;
    const result = calculateCashFlow(schedule, makeResources());

    const finalPoint = result.sCurve[result.sCurve.length - 1];
    expect(finalPoint.cumulativeCost).toBeCloseTo(10000, 0);
  });
});

// ============================================================
// Payment Milestones Tests
// ============================================================

describe("payment milestones", () => {
  function multiMonthResult(): CashFlowResult {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-02", finishDate: "2026-03-27", cost: 10000 }),
      makeTask({ uid: 2, startDate: "2026-04-01", finishDate: "2026-04-30", cost: 15000, phase: "structural_frame" as ScheduleTask["phase"] }),
      makeTask({ uid: 3, startDate: "2026-05-04", finishDate: "2026-06-26", cost: 20000, phase: "external_walls" as ScheduleTask["phase"] }),
      makeTask({ uid: 4, startDate: "2026-07-01", finishDate: "2026-08-28", cost: 5000, phase: "interior_painting" as ScheduleTask["phase"] }),
    ];
    const schedule = makeSchedule(tasks);
    schedule.totalCost = 50000;
    return calculateCashFlow(schedule, makeResources());
  }

  it("generates 5 milestones by default", () => {
    const result = multiMonthResult();
    expect(result.milestones).toHaveLength(5);
  });

  it("milestone amounts sum to approximately total cost", () => {
    const result = multiMonthResult();
    const totalMilestones = result.milestones.reduce((s, m) => s + m.amount, 0);
    // Should be close to total cost (may differ slightly due to snapping)
    expect(totalMilestones).toBeCloseTo(50000, -1);
  });

  it("respects custom interval count", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-02", finishDate: "2026-06-30", cost: 10000 }),
    ];
    const schedule = makeSchedule(tasks);
    schedule.totalCost = 10000;
    const result = calculateCashFlow(schedule, makeResources(), {
      milestoneIntervals: 4,
    });
    expect(result.milestones).toHaveLength(4);
  });

  it("produces Portuguese labels", () => {
    const result = multiMonthResult();
    for (const m of result.milestones) {
      expect(m.label).toContain("Pagamento");
    }
  });
});

// ============================================================
// Working Capital Tests
// ============================================================

describe("working capital analysis", () => {
  it("maxExposure is positive when payments lag behind spend", () => {
    const task = makeTask({
      uid: 1,
      startDate: "2026-03-02",
      finishDate: "2026-05-29",
      cost: 30000,
    });
    const schedule = makeSchedule([task]);
    schedule.totalCost = 30000;
    const result = calculateCashFlow(schedule, makeResources());

    expect(result.workingCapital.maxExposure).toBeGreaterThan(0);
  });

  it("recommendedWorkingCapital includes contingency", () => {
    const task = makeTask({
      uid: 1,
      startDate: "2026-03-02",
      finishDate: "2026-05-29",
      cost: 10000,
    });
    const schedule = makeSchedule([task]);
    schedule.totalCost = 10000;
    const result = calculateCashFlow(schedule, makeResources());

    expect(result.workingCapital.recommendedWorkingCapital).toBeGreaterThan(
      result.workingCapital.maxExposure,
    );
  });

  it("averageMonthlyBurn is totalCost / totalMonths", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-02", finishDate: "2026-03-27", cost: 3000 }),
      makeTask({ uid: 2, startDate: "2026-04-01", finishDate: "2026-04-30", cost: 6000, phase: "structural_frame" as ScheduleTask["phase"] }),
      makeTask({ uid: 3, startDate: "2026-05-04", finishDate: "2026-05-29", cost: 3000, phase: "external_walls" as ScheduleTask["phase"] }),
    ];
    const schedule = makeSchedule(tasks);
    schedule.totalCost = 12000;
    const result = calculateCashFlow(schedule, makeResources());

    expect(result.workingCapital.averageMonthlyBurn).toBeCloseTo(
      12000 / result.totalMonths,
      0,
    );
  });

  it("peakMonthlySpend identifies the highest month", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-02", finishDate: "2026-03-27", cost: 1000 }),
      makeTask({ uid: 2, startDate: "2026-04-01", finishDate: "2026-04-30", cost: 9000, phase: "structural_frame" as ScheduleTask["phase"] }),
    ];
    const schedule = makeSchedule(tasks);
    schedule.totalCost = 10000;
    const result = calculateCashFlow(schedule, makeResources());

    expect(result.workingCapital.peakMonth).toBe("2026-04");
    expect(result.workingCapital.peakMonthlySpend).toBeGreaterThan(
      result.periods.find((p) => p.key === "2026-03")!.total,
    );
  });
});

// ============================================================
// Contingency Tests
// ============================================================

describe("contingency buffer", () => {
  it("defaults to 10%", () => {
    const task = makeTask({ uid: 1, cost: 10000 });
    const schedule = makeSchedule([task]);
    schedule.totalCost = 10000;
    const result = calculateCashFlow(schedule, makeResources());

    expect(result.contingency.percent).toBe(10);
    expect(result.contingency.amount).toBeCloseTo(1000, 1);
  });

  it("clamps to [5, 15] range", () => {
    const task = makeTask({ uid: 1, cost: 10000 });
    const schedule = makeSchedule([task]);
    schedule.totalCost = 10000;

    const low = calculateCashFlow(schedule, makeResources(), { contingencyPercent: 2 });
    expect(low.contingency.percent).toBe(5);

    const high = calculateCashFlow(schedule, makeResources(), { contingencyPercent: 25 });
    expect(high.contingency.percent).toBe(15);
  });

  it("allows override via options", () => {
    const task = makeTask({ uid: 1, cost: 10000 });
    const schedule = makeSchedule([task]);
    schedule.totalCost = 10000;

    const result = calculateCashFlow(schedule, makeResources(), {
      contingencyPercent: 7,
    });
    expect(result.contingency.percent).toBe(7);
    expect(result.contingency.amount).toBeCloseTo(700, 1);
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe("calculateCashFlow (integration)", () => {
  it("produces valid result for a 6-month schedule", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-02", finishDate: "2026-03-27", cost: 5000 }),
      makeTask({ uid: 2, startDate: "2026-04-01", finishDate: "2026-05-15", cost: 15000, phase: "structural_frame" as ScheduleTask["phase"] }),
      makeTask({ uid: 3, startDate: "2026-05-18", finishDate: "2026-06-30", cost: 10000, phase: "external_walls" as ScheduleTask["phase"] }),
      makeTask({ uid: 4, startDate: "2026-07-01", finishDate: "2026-08-28", cost: 20000, phase: "interior_painting" as ScheduleTask["phase"] }),
    ];
    const schedule = makeSchedule(tasks);
    schedule.totalCost = 50000;
    const result = calculateCashFlow(schedule, makeResources());

    expect(result.totalCost).toBe(50000);
    expect(result.totalWithContingency).toBe(55000); // 10% default
    expect(result.periods.length).toBeGreaterThanOrEqual(5);
    expect(result.sCurve.length).toBe(result.periods.length);
    expect(result.milestones.length).toBe(5);
    expect(result.workingCapital.maxExposure).toBeGreaterThan(0);
    expect(result.contingency.percent).toBe(10);
  });

  it("periods are sorted chronologically", () => {
    const tasks = [
      makeTask({ uid: 2, startDate: "2026-06-01", finishDate: "2026-06-30", cost: 2000, phase: "structural_frame" as ScheduleTask["phase"] }),
      makeTask({ uid: 1, startDate: "2026-03-02", finishDate: "2026-03-27", cost: 1000 }),
    ];
    const schedule = makeSchedule(tasks);
    schedule.totalCost = 3000;
    const result = calculateCashFlow(schedule, makeResources());

    for (let i = 1; i < result.periods.length; i++) {
      expect(result.periods[i].key > result.periods[i - 1].key).toBe(true);
    }
  });

  it("handles empty schedule gracefully", () => {
    const schedule = makeSchedule([]);
    schedule.totalCost = 0;
    const result = calculateCashFlow(schedule, makeResources());

    expect(result.periods).toHaveLength(0);
    expect(result.sCurve).toHaveLength(0);
    expect(result.milestones).toHaveLength(0);
    expect(result.totalCost).toBe(0);
  });
});

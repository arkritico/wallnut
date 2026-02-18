import { describe, it, expect } from "vitest";
import {
  optimizeSchedule,
  getDefaultConstraints,
  buildDailyHistogram,
  computeTaskFloats,
  getTaskWorkerCount,
} from "@/lib/site-capacity-optimizer";
import type {
  ScheduleTask,
  ProjectSchedule,
  ConstructionPhase,
  TaskResource,
} from "@/lib/wbs-types";
import type { ProjectResources } from "@/lib/resource-aggregator";

// ─── Helpers ────────────────────────────────────────────────

function makeResource(units: number, type: "labor" | "material" = "labor"): TaskResource {
  return { name: "Pedreiro", type, units, rate: 15, hours: units * 8 };
}

function makeTask(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    uid: 1,
    wbs: "01.01",
    name: "Test Task",
    durationDays: 5,
    durationHours: 40,
    startDate: "2026-03-01",
    finishDate: "2026-03-05",
    predecessors: [],
    isSummary: false,
    phase: "structure" as ConstructionPhase,
    resources: [makeResource(3)],
    cost: 1000,
    materialCost: 500,
    outlineLevel: 2,
    percentComplete: 0,
    ...overrides,
  };
}

function makeSchedule(
  tasks: ScheduleTask[],
  criticalPath: number[] = [],
): ProjectSchedule {
  const starts = tasks.map((t) => t.startDate);
  const ends = tasks.map((t) => t.finishDate);
  return {
    projectName: "Test Project",
    startDate: starts.sort()[0] || "2026-03-01",
    finishDate: ends.sort().reverse()[0] || "2026-04-01",
    totalDurationDays: 30,
    totalCost: 50000,
    tasks,
    resources: [],
    criticalPath,
    teamSummary: {
      maxWorkers: 10,
      averageWorkers: 5,
      totalManHours: 1200,
      peakWeek: "2026-W10",
    },
  };
}

function makeEmptyResources(): ProjectResources {
  return {
    materials: [],
    labor: [],
    equipment: [],
    totalMaterialCost: 0,
    totalLaborCost: 0,
    totalLaborHours: 0,
    totalEquipmentCost: 0,
    grandTotal: 0,
  };
}

// ─── Tests: UID Collision Fix ───────────────────────────────

describe("splitLargeTasks — UID collision fix", () => {
  it("produces unique UIDs when splitting tasks", () => {
    const tasks = [
      makeTask({ uid: 1, resources: [makeResource(12)] }),
      makeTask({ uid: 2, resources: [makeResource(10)], startDate: "2026-03-06", finishDate: "2026-03-10" }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const uids = result.optimizedTasks.map((t) => t.uid);
    const uniqueUids = new Set(uids);
    expect(uniqueUids.size).toBe(uids.length);
  });

  it("Part 1 keeps original UID, Part 2 gets new UID", () => {
    // Need two overlapping tasks to trigger bottleneck → splitting
    const tasks = [
      makeTask({ uid: 9000, resources: [makeResource(12)], startDate: "2026-03-01", finishDate: "2026-03-10" }),
      makeTask({ uid: 9001, resources: [makeResource(12)], startDate: "2026-03-01", finishDate: "2026-03-10" }),
    ];
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 15; // 24 workers > 15 triggers bottleneck
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);

    const part1 = result.optimizedTasks.find((t) => t.name.includes("Parte 1"));
    const part2 = result.optimizedTasks.find((t) => t.name.includes("Parte 2"));
    expect(part1).toBeDefined();
    expect(part2).toBeDefined();

    // Part 1 keeps one of the original UIDs (9000 or 9001)
    expect(part1!.uid === 9000 || part1!.uid === 9001).toBe(true);
    // Part 2 gets a new UID > max existing
    expect(part2!.uid).toBeGreaterThan(9001);
  });

  it("adds FS predecessor from Part 2 to Part 1", () => {
    // Two overlapping tasks to trigger bottleneck → splitting runs
    const tasks = [
      makeTask({ uid: 5, resources: [makeResource(12)], startDate: "2026-03-01", finishDate: "2026-03-10" }),
      makeTask({ uid: 6, resources: [makeResource(12)], startDate: "2026-03-01", finishDate: "2026-03-10" }),
    ];
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 15; // 24 workers > 15 triggers bottleneck
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);

    const part2 = result.optimizedTasks.find((t) =>
      t.name.includes("Parte 2"),
    );
    expect(part2).toBeDefined();
    const part1 = result.optimizedTasks.find((t) =>
      t.name.includes("Parte 1"),
    );
    expect(part1).toBeDefined();

    const fsPred = part2!.predecessors.find(
      (p) => p.uid === part1!.uid && p.type === "FS",
    );
    expect(fsPred).toBeDefined();
  });

  it("remaps successor predecessor references to Part 2 UID", () => {
    // Two overlapping high-worker tasks to trigger bottleneck → splitting
    // Task A (12 workers) + Task C (12 workers) overlap → bottleneck
    // Task B depends on Task A → after split, B should depend on A-Part2
    const tasks = [
      makeTask({ uid: 10, name: "Task A", resources: [makeResource(12)], startDate: "2026-03-01", finishDate: "2026-03-10", durationDays: 10 }),
      makeTask({ uid: 15, name: "Task C", resources: [makeResource(12)], startDate: "2026-03-01", finishDate: "2026-03-10", durationDays: 10 }),
      makeTask({ uid: 20, name: "Task B", resources: [makeResource(3)], startDate: "2026-03-11", finishDate: "2026-03-15", predecessors: [{ uid: 10, type: "FS" as const }] }),
    ];
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 15; // 24 workers > 15 triggers bottleneck
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);

    const taskB = result.optimizedTasks.find((t) => t.name === "Task B");
    expect(taskB).toBeDefined();

    const part2 = result.optimizedTasks.find((t) => t.name.includes("Task A") && t.name.includes("Parte 2"));
    expect(part2).toBeDefined();

    // Task B should now reference Part 2's UID (not the original 10)
    const pred = taskB!.predecessors.find((p) => p.uid === part2!.uid);
    expect(pred).toBeDefined();
    expect(pred!.type).toBe("FS");
  });

  it("splits cost proportionally between parts", () => {
    // Two overlapping high-worker tasks to trigger bottleneck → splitting
    const tasks = [
      makeTask({ uid: 1, name: "Costly Task", resources: [makeResource(12)], cost: 10000, materialCost: 6000, durationDays: 10, startDate: "2026-03-01", finishDate: "2026-03-10" }),
      makeTask({ uid: 2, name: "Other Task", resources: [makeResource(12)], cost: 2000, materialCost: 1000, durationDays: 10, startDate: "2026-03-01", finishDate: "2026-03-10" }),
    ];
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 15; // 24 workers > 15 triggers bottleneck
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);

    const part1 = result.optimizedTasks.find((t) => t.name.includes("Costly Task") && t.name.includes("Parte 1"));
    const part2 = result.optimizedTasks.find((t) => t.name.includes("Costly Task") && t.name.includes("Parte 2"));
    expect(part1).toBeDefined();
    expect(part2).toBeDefined();

    // Costs should sum to original (within rounding)
    expect(part1!.cost + part2!.cost).toBe(10000);
    expect(part1!.materialCost + part2!.materialCost).toBe(6000);

    // Neither part should have the full cost
    expect(part1!.cost).toBeLessThan(10000);
    expect(part2!.cost).toBeLessThan(10000);
  });

  it("does not split tasks with <= 8 workers", () => {
    const tasks = [makeTask({ uid: 1, resources: [makeResource(8)] })];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const splitTasks = result.optimizedTasks.filter((t) =>
      t.name.includes("Parte"),
    );
    expect(splitTasks.length).toBe(0);
  });
});

// ─── Tests: Worker Count Fix ────────────────────────────────

describe("getTaskWorkerCount", () => {
  it("sums units from all labor resources", () => {
    const task = makeTask({
      resources: [makeResource(5), makeResource(3)],
    });
    expect(getTaskWorkerCount(task)).toBe(8);
  });

  it("returns at least 1 even for tasks with no labor", () => {
    const task = makeTask({
      resources: [makeResource(5, "material")],
    });
    expect(getTaskWorkerCount(task)).toBe(1);
  });

  it("handles single labor resource with high units", () => {
    const task = makeTask({
      resources: [makeResource(15)],
    });
    expect(getTaskWorkerCount(task)).toBe(15);
  });
});

// ─── Tests: Daily Histogram ─────────────────────────────────

describe("buildDailyHistogram", () => {
  it("sums workers per day across overlapping tasks", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-01", finishDate: "2026-03-03", resources: [makeResource(4)] }),
      makeTask({ uid: 2, startDate: "2026-03-02", finishDate: "2026-03-04", resources: [makeResource(3)] }),
    ];
    const histogram = buildDailyHistogram(tasks);

    expect(histogram.get("2026-03-01")).toBe(4);
    expect(histogram.get("2026-03-02")).toBe(7);
    expect(histogram.get("2026-03-03")).toBe(7);
    expect(histogram.get("2026-03-04")).toBe(3);
  });

  it("skips summary tasks", () => {
    const tasks = [
      makeTask({ uid: 1, isSummary: true, resources: [makeResource(10)] }),
    ];
    const histogram = buildDailyHistogram(tasks);
    expect(histogram.size).toBe(0);
  });
});

// ─── Tests: Float Calculation ───────────────────────────────

describe("computeTaskFloats", () => {
  it("marks tasks on the critical path as critical", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-01", finishDate: "2026-03-05" }),
      makeTask({ uid: 2, startDate: "2026-03-06", finishDate: "2026-03-10", predecessors: [{ uid: 1, type: "FS" }] }),
    ];
    const floats = computeTaskFloats(tasks, [1, 2]);

    expect(floats.get(1)?.isCritical).toBe(true);
    expect(floats.get(2)?.isCritical).toBe(true);
  });

  it("calculates float for non-critical tasks", () => {
    // Task 1: Mar 1-5 → Task 3: Mar 11-15 (critical chain)
    // Task 2: Mar 1-3 (no successors, so float = projectEnd - Mar 3)
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-01", finishDate: "2026-03-05" }),
      makeTask({ uid: 2, startDate: "2026-03-01", finishDate: "2026-03-03" }),
      makeTask({ uid: 3, startDate: "2026-03-11", finishDate: "2026-03-15", predecessors: [{ uid: 1, type: "FS" }] }),
    ];
    const floats = computeTaskFloats(tasks, [1, 3]);

    const float2 = floats.get(2);
    expect(float2).toBeDefined();
    expect(float2!.isCritical).toBe(false);
    expect(float2!.totalFloat).toBeGreaterThan(0);
  });

  it("returns zero float for tasks with tight successors", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-01", finishDate: "2026-03-05" }),
      makeTask({ uid: 2, startDate: "2026-03-05", finishDate: "2026-03-10", predecessors: [{ uid: 1, type: "FS" }] }),
    ];
    const floats = computeTaskFloats(tasks, []);

    // Task 1 finishes on Mar 5, successor starts Mar 5 → float = 0
    expect(floats.get(1)?.totalFloat).toBe(0);
  });
});

// ─── Tests: Resource Leveling ───────────────────────────────

describe("resource leveling", () => {
  it("does not change tasks when no overloads exist", () => {
    const tasks = [
      makeTask({ uid: 1, resources: [makeResource(5)] }),
    ];
    const schedule = makeSchedule(tasks);
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 20;

    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);
    expect(result.adjustments.length).toBe(0);
  });

  it("never shifts critical path tasks", () => {
    // Two overlapping tasks creating overload, but task 1 is on critical path
    // Use workers <= 8 to avoid triggering task splitting
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(8)] }),
      makeTask({ uid: 2, startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(8)] }),
    ];
    const schedule = makeSchedule(tasks, [1]); // Task 1 is critical
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 10; // 16 workers > 10 triggers bottleneck

    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);

    // Task 1 (critical) should not have moved
    const task1 = result.optimizedTasks.find((t) => t.uid === 1);
    expect(task1).toBeDefined();
    expect(task1!.startDate).toBe("2026-03-01");
  });

  it("shifts non-critical tasks to flatten histogram", () => {
    // Two overlapping tasks, task 2 is non-critical with float
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-01", finishDate: "2026-03-10", resources: [makeResource(12)] }),
      makeTask({ uid: 2, startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(10)] }),
    ];
    const schedule = makeSchedule(tasks, [1]); // Only task 1 is critical
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 15;

    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);

    // Task 2 should have been shifted forward
    expect(result.adjustments.length).toBeGreaterThan(0);
    const task2 = result.optimizedTasks.find((t) => t.uid === 2);
    expect(task2?.startDate).not.toBe("2026-03-01");
  });

  it("tracks adjustments in Portuguese", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-01", finishDate: "2026-03-10", resources: [makeResource(12)] }),
      makeTask({ uid: 2, startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(10)] }),
    ];
    const schedule = makeSchedule(tasks, [1]);
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 15;

    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);

    if (result.adjustments.length > 0) {
      expect(result.adjustments[0].reason).toContain("Nivelamento de recursos");
    }
  });
});

// ─── Tests: Equipment Conflicts ─────────────────────────────

describe("equipment conflict detection", () => {
  it("detects crane conflict when 2 phases use crane simultaneously", () => {
    // earthworks and foundations both need crane
    const tasks = [
      makeTask({
        uid: 1,
        phase: "earthworks",
        startDate: "2026-03-01",
        finishDate: "2026-03-05",
        resources: [makeResource(3)],
      }),
      makeTask({
        uid: 2,
        phase: "foundations",
        startDate: "2026-03-03",
        finishDate: "2026-03-08",
        resources: [makeResource(3)],
      }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const equipmentBottlenecks = result.bottlenecks.filter((b) =>
      b.reason.includes("Conflito de equipamento"),
    );
    expect(equipmentBottlenecks.length).toBeGreaterThan(0);
    expect(equipmentBottlenecks[0].reason).toContain("crane");
  });

  it("allows 2 simultaneous scaffolding uses", () => {
    // external_walls and painting both need scaffolding (max 2 allowed)
    const tasks = [
      makeTask({
        uid: 1,
        phase: "external_walls",
        startDate: "2026-03-01",
        finishDate: "2026-03-05",
        resources: [makeResource(3)],
      }),
      makeTask({
        uid: 2,
        phase: "painting",
        startDate: "2026-03-03",
        finishDate: "2026-03-08",
        resources: [makeResource(3)],
      }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const scaffoldingConflicts = result.bottlenecks.filter(
      (b) =>
        b.reason.includes("Conflito de equipamento") &&
        b.reason.includes("scaffolding"),
    );
    expect(scaffoldingConflicts.length).toBe(0);
  });

  it("detects scaffolding conflict at 3 simultaneous uses", () => {
    // 3 phases needing scaffolding overlap (max 2)
    const tasks = [
      makeTask({ uid: 1, phase: "external_walls", startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(3)] }),
      makeTask({ uid: 2, phase: "painting", startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(3)] }),
      makeTask({ uid: 3, phase: "external_finishes", startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const scaffoldingConflicts = result.bottlenecks.filter(
      (b) =>
        b.reason.includes("Conflito de equipamento") &&
        b.reason.includes("scaffolding"),
    );
    expect(scaffoldingConflicts.length).toBeGreaterThan(0);
  });

  it("does not report equipment conflicts for phases without equipment", () => {
    const tasks = [
      makeTask({ uid: 1, phase: "internal_finishes", startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(3)] }),
      makeTask({ uid: 2, phase: "flooring", startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const equipConflicts = result.bottlenecks.filter((b) =>
      b.reason.includes("Conflito de equipamento"),
    );
    expect(equipConflicts.length).toBe(0);
  });
});

// ─── Tests: Equipment Suggestions ───────────────────────────

describe("equipment conflict suggestions", () => {
  it("generates Portuguese equipment conflict suggestion", () => {
    const tasks = [
      makeTask({ uid: 1, phase: "earthworks", startDate: "2026-03-01", finishDate: "2026-03-05", resources: [makeResource(3)] }),
      makeTask({ uid: 2, phase: "foundations", startDate: "2026-03-03", finishDate: "2026-03-08", resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const equipSugg = result.suggestions.find((s) =>
      s.title.includes("Equipamento"),
    );
    expect(equipSugg).toBeDefined();
    expect(equipSugg!.description).toContain("grua");
  });
});

// ─── Tests: Phase Overlap ───────────────────────────────────

describe("phase overlap enforcement", () => {
  it("detects non-overlap violation between structure and waterproofing", () => {
    const tasks = [
      makeTask({ uid: 1, phase: "structure", startDate: "2026-03-01", finishDate: "2026-03-10", resources: [makeResource(5)] }),
      makeTask({ uid: 2, phase: "waterproofing", startDate: "2026-03-08", finishDate: "2026-03-15", resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const phaseConflicts = result.bottlenecks.filter((b) =>
      b.reason.includes("Conflito de fases"),
    );
    expect(phaseConflicts.length).toBeGreaterThan(0);
  });

  it("does not flag allowed overlaps", () => {
    // rough_in_electrical + rough_in_plumbing can overlap
    const tasks = [
      makeTask({ uid: 1, phase: "rough_in_electrical", startDate: "2026-03-01", finishDate: "2026-03-10", resources: [makeResource(3)] }),
      makeTask({ uid: 2, phase: "rough_in_plumbing", startDate: "2026-03-01", finishDate: "2026-03-10", resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const overlapConflicts = result.bottlenecks.filter(
      (b) =>
        b.reason.includes("Conflito de fases") &&
        (b.phases.includes("rough_in_electrical") ||
          b.phases.includes("rough_in_plumbing")),
    );
    expect(overlapConflicts.length).toBe(0);
  });

  it("sequenceConflicts shifts phase2 after phase1 + gap", () => {
    // structure finishes Mar 10, waterproofing starts Mar 8 (violates 7-day gap)
    const tasks = [
      makeTask({ uid: 1, phase: "structure", startDate: "2026-03-01", finishDate: "2026-03-10", resources: [makeResource(5)] }),
      makeTask({ uid: 2, phase: "waterproofing", startDate: "2026-03-08", finishDate: "2026-03-15", resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    const waterTask = result.optimizedTasks.find(
      (t) => t.phase === "waterproofing",
    );
    if (waterTask) {
      const waterStart = new Date(waterTask.startDate);
      const structEnd = new Date("2026-03-10");
      const gapDays = Math.floor(
        (waterStart.getTime() - structEnd.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(gapDays).toBeGreaterThanOrEqual(7);
    }
  });
});

// ─── Tests: End-to-End ──────────────────────────────────────

describe("end-to-end optimization", () => {
  it("calculates efficiency gain correctly", () => {
    const tasks = [
      makeTask({ uid: 1, startDate: "2026-03-01", finishDate: "2026-03-15", resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    // If no overloads, tasks unchanged → efficiencyGain = 0
    expect(result.efficiencyGain).toBeCloseTo(0);
    expect(result.originalDuration).toBeGreaterThan(0);
  });

  it("preserves original schedule in output", () => {
    const tasks = [
      makeTask({ uid: 1, resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    expect(result.originalSchedule).toBe(schedule);
  });

  it("generates Portuguese suggestions for no bottlenecks", () => {
    const tasks = [
      makeTask({ uid: 1, resources: [makeResource(3)] }),
    ];
    const schedule = makeSchedule(tasks);
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = 100;

    const result = optimizeSchedule(schedule, makeEmptyResources(), constraints);

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].title).toContain("Otimizado");
  });
});

// ─── Tests: Backward Compatibility ──────────────────────────

describe("backward compatibility", () => {
  it("getDefaultConstraints returns valid constraints", () => {
    const constraints = getDefaultConstraints();
    expect(constraints.maxWorkersPerFloor).toBe(20);
    expect(constraints.equipmentConflicts.length).toBe(3);
    expect(constraints.phaseOverlapRules.length).toBe(20);
  });

  it("handles empty schedule", () => {
    const schedule = makeSchedule([]);
    const result = optimizeSchedule(schedule, makeEmptyResources());

    expect(result.bottlenecks.length).toBe(0);
    expect(result.optimizedTasks.length).toBe(0);
  });

  it("works without explicit constraints parameter", () => {
    const tasks = [makeTask({ uid: 1, resources: [makeResource(3)] })];
    const schedule = makeSchedule(tasks);

    // Should not throw
    const result = optimizeSchedule(schedule, makeEmptyResources());
    expect(result).toBeDefined();
    expect(result.optimizedTasks.length).toBeGreaterThanOrEqual(1);
  });
});

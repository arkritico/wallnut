import { describe, it, expect } from "vitest";
import {
  captureBaseline,
  computeEvmSnapshot,
  generateSCurveData,
  type TaskProgress,
} from "@/lib/earned-value";
import { generateSchedule } from "@/lib/construction-sequencer";
import type { WbsProject, CypeMatch } from "@/lib/wbs-types";

// ============================================================
// Helpers
// ============================================================

function makeProject(overrides: Partial<WbsProject> = {}): WbsProject {
  return {
    id: "evm-test",
    name: "EVM Integration Project",
    classification: "ProNIC",
    startDate: "2026-03-02",
    chapters: [
      {
        code: "06",
        name: "Estruturas de betão armado",
        subChapters: [
          {
            code: "06.01",
            name: "Pilares",
            articles: [
              { code: "06.01.001", name: "Pilar betão armado", unit: "m", quantity: 50, unitCost: 673.53 },
            ],
          },
          {
            code: "06.02",
            name: "Vigas",
            articles: [
              { code: "06.02.001", name: "Viga betão armado", unit: "m", quantity: 100, unitCost: 96.93 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeMatch(articleCode: string, cypeCode: string, unitCost = 100): CypeMatch {
  return {
    articleCode,
    articleDescription: "Test article",
    cypeCode,
    cypeDescription: "Test CYPE item",
    cypeChapter: articleCode.substring(0, 2),
    confidence: 80,
    matchMethod: "description",
    unitCost,
    breakdown: { materials: unitCost * 0.6, labor: unitCost * 0.3, machinery: unitCost * 0.1 },
    cypeUnit: "m",
    unitConversion: 1,
    warnings: [],
    articleQuantity: 50,
    articleUnit: "m",
    estimatedCost: unitCost * 50,
  };
}

// ============================================================
// E2E: schedule → baseline → progress → EVM
// ============================================================

describe("EVM E2E Integration", () => {
  it("runs full pipeline: schedule → baseline → progress → verify SPI/CPI", () => {
    const project = makeProject();
    const matches: CypeMatch[] = [
      makeMatch("06.01.001", "EHS010"),
      makeMatch("06.02.001", "EHB070"),
    ];

    // Step 1: Generate schedule
    const schedule = generateSchedule(project, matches);
    expect(schedule.tasks.length).toBeGreaterThan(0);

    // Step 2: Capture baseline
    const baseline = captureBaseline(schedule);
    const detailTasks = schedule.tasks.filter(t => !t.isSummary);
    expect(baseline.tasks.length).toBe(detailTasks.length);
    expect(baseline.totalCost).toBe(schedule.totalCost);

    // Step 3: Simulate 50% progress on first half of tasks
    const halfIdx = Math.ceil(detailTasks.length / 2);
    const progress: TaskProgress[] = detailTasks.map((t, i) => ({
      taskUid: t.uid,
      percentComplete: i < halfIdx ? 100 : 0,
    }));

    // Step 4: Compute EVM snapshot
    const snap = computeEvmSnapshot(baseline, schedule, progress, schedule.startDate);

    // Assertions
    expect(Number.isFinite(snap.spi)).toBe(true);
    expect(Number.isFinite(snap.cpi)).toBe(true);
    expect(snap.earnedValue).toBeGreaterThan(0);
    expect(snap.budgetAtCompletion).toBe(baseline.totalCost);
    expect(snap.taskMetrics.length).toBe(detailTasks.length);
    expect(["green", "yellow", "red"]).toContain(snap.health);
    expect(snap.estimateAtCompletion).toBeGreaterThan(0);
  });

  it("S-curve with progress has EV/AC only for past dates", () => {
    const project = makeProject({
      startDate: "2025-01-06", // Past dates for S-curve EV/AC
    });
    const matches: CypeMatch[] = [
      makeMatch("06.01.001", "EHS010"),
    ];

    const schedule = generateSchedule(project, matches);
    const baseline = captureBaseline(schedule);
    const detailTasks = schedule.tasks.filter(t => !t.isSummary);
    const progress: TaskProgress[] = detailTasks.map(t => ({
      taskUid: t.uid,
      percentComplete: 40,
    }));

    const points = generateSCurveData(baseline, progress);

    expect(points.length).toBeGreaterThanOrEqual(2);
    // PV monotonically non-decreasing
    for (let i = 1; i < points.length; i++) {
      expect(points[i].plannedValue).toBeGreaterThanOrEqual(points[i - 1].plannedValue);
    }

    // Past points should have EV defined
    const withEv = points.filter(p => p.earnedValue !== undefined);
    expect(withEv.length).toBeGreaterThan(0);
  });
});

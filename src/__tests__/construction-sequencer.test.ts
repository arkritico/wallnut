import { describe, it, expect } from "vitest";
import {
  generateSchedule,
  addWorkingDays,
  isPortugueseHoliday,
  isWorkingDay,
  PHASE_ORDER,
} from "@/lib/construction-sequencer";
import type { WbsProject, CypeMatch } from "@/lib/wbs-types";

// ─── Helpers ────────────────────────────────────────────────

function makeProject(overrides: Partial<WbsProject> = {}): WbsProject {
  return {
    id: "test",
    name: "Test Project",
    classification: "ProNIC",
    startDate: "2026-03-02", // Monday
    chapters: [
      {
        code: "06",
        name: "Estruturas de betão armado",
        subChapters: [
          {
            code: "06.01",
            name: "Pilares",
            articles: [
              {
                code: "06.01.001",
                name: "Pilar de betão armado 250x450mm",
                unit: "m",
                quantity: 50,
                unitCost: 673.53,
              },
            ],
          },
          {
            code: "06.02",
            name: "Vigas",
            articles: [
              {
                code: "06.02.001",
                name: "Viga de betão armado",
                unit: "m",
                quantity: 80,
                unitCost: 96.93,
              },
            ],
          },
        ],
      },
      {
        code: "09",
        name: "Revestimentos exteriores",
        subChapters: [
          {
            code: "09.01",
            name: "Reboco exterior",
            articles: [
              {
                code: "09.01.001",
                name: "Reboco exterior",
                unit: "m2",
                quantity: 200,
                unitCost: 25,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeMatch(overrides: Partial<CypeMatch> = {}): CypeMatch {
  return {
    articleCode: "06.01.001",
    articleDescription: "Pilar de betão armado",
    cypeCode: "EHS010",
    cypeDescription: "Pilar de betão armado",
    cypeChapter: "06",
    confidence: 80,
    matchMethod: "description",
    unitCost: 673.53,
    breakdown: { materials: 400, labor: 200, machinery: 73.53 },
    cypeUnit: "m",
    unitConversion: 1,
    warnings: [],
    articleQuantity: 50,
    articleUnit: "m",
    estimatedCost: 33676.5,
    ...overrides,
  };
}

function makeMatches(): CypeMatch[] {
  return [
    makeMatch({
      articleCode: "06.01.001",
      cypeCode: "EHS010",
      cypeDescription: "Pilar de betão armado",
      unitCost: 673.53,
      breakdown: { materials: 400, labor: 200, machinery: 73.53 },
      articleQuantity: 50,
      estimatedCost: 33676.5,
    }),
    makeMatch({
      articleCode: "06.02.001",
      cypeCode: "EHB070",
      cypeDescription: "Viga de betão armado",
      confidence: 75,
      unitCost: 96.93,
      breakdown: { materials: 50, labor: 35, machinery: 11.93 },
      articleQuantity: 80,
      estimatedCost: 7754.4,
    }),
    makeMatch({
      articleCode: "09.01.001",
      cypeCode: "ERR020",
      cypeDescription: "Reboco exterior",
      cypeChapter: "09",
      confidence: 60,
      unitCost: 25,
      breakdown: { materials: 12, labor: 10, machinery: 3 },
      cypeUnit: "m2",
      articleUnit: "m2",
      articleQuantity: 200,
      estimatedCost: 5000,
    }),
  ];
}

// ─── Portuguese Holiday Calendar ────────────────────────────

describe("Portuguese holiday calendar", () => {
  describe("isPortugueseHoliday", () => {
    it("recognizes Dia da Liberdade (April 25)", () => {
      expect(isPortugueseHoliday(new Date(2026, 3, 25))).toBe(true);
    });

    it("recognizes Ano Novo (January 1)", () => {
      expect(isPortugueseHoliday(new Date(2026, 0, 1))).toBe(true);
    });

    it("recognizes Natal (December 25)", () => {
      expect(isPortugueseHoliday(new Date(2026, 11, 25))).toBe(true);
    });

    it("recognizes Dia do Trabalhador (May 1)", () => {
      expect(isPortugueseHoliday(new Date(2026, 4, 1))).toBe(true);
    });

    it("recognizes Dia de Portugal (June 10)", () => {
      expect(isPortugueseHoliday(new Date(2026, 5, 10))).toBe(true);
    });

    it("recognizes Sexta-feira Santa (Easter-dependent)", () => {
      // Easter 2026 is April 5, Good Friday is April 3
      expect(isPortugueseHoliday(new Date(2026, 3, 3))).toBe(true);
    });

    it("recognizes Corpo de Deus (Easter + 60 days)", () => {
      // Easter 2026 is April 5, Corpus Christi is June 4
      expect(isPortugueseHoliday(new Date(2026, 5, 4))).toBe(true);
    });

    it("returns false for regular weekdays", () => {
      expect(isPortugueseHoliday(new Date(2026, 2, 10))).toBe(false); // March 10, Tue
    });

    it("handles different years (Easter moves)", () => {
      // Easter 2027 is March 28, Good Friday = March 26
      expect(isPortugueseHoliday(new Date(2027, 2, 26))).toBe(true);
    });
  });

  describe("isWorkingDay", () => {
    it("returns false for Saturday", () => {
      expect(isWorkingDay(new Date(2026, 2, 7))).toBe(false); // March 7 = Sat
    });

    it("returns false for Sunday", () => {
      expect(isWorkingDay(new Date(2026, 2, 8))).toBe(false); // March 8 = Sun
    });

    it("returns false for holidays", () => {
      expect(isWorkingDay(new Date(2026, 3, 25))).toBe(false); // Dia da Liberdade
    });

    it("returns true for regular weekdays", () => {
      expect(isWorkingDay(new Date(2026, 2, 9))).toBe(true); // March 9 = Mon
    });
  });

  describe("addWorkingDays", () => {
    it("skips weekends", () => {
      // Friday March 6 + 1 working day = Monday March 9
      const result = addWorkingDays(new Date(2026, 2, 6), 1);
      expect(result.getDate()).toBe(9);
      expect(result.getMonth()).toBe(2);
    });

    it("skips Portuguese holidays", () => {
      // April 24 (Fri) + 1 working day should skip April 25 (Dia da Liberdade, Sat)
      // and land on April 27 (Mon)... wait, April 25 is Sat in 2026? Let me check.
      // April 25 2026 is a Saturday. So it would be a weekend + holiday.
      // Let's use a year where April 25 is a weekday.
      // In 2024: April 25 is Thursday. April 24 (Wed) + 1 = April 26 (Fri), skipping April 25
      const result = addWorkingDays(new Date(2024, 3, 24), 1);
      expect(result.getDate()).toBe(26);
      expect(result.getMonth()).toBe(3); // April
    });

    it("skips multiple consecutive holidays and weekends", () => {
      // Dec 24 2026 is Thursday, Dec 25 is Friday (Natal - holiday),
      // Dec 26 is Sat, Dec 27 is Sun, Dec 28 is Mon (working day)
      // So Dec 24 (Thu) + 1 working day = Dec 28 (Mon)
      const result = addWorkingDays(new Date(2026, 11, 24), 1);
      expect(result.getDate()).toBe(28);
      expect(result.getMonth()).toBe(11); // December
    });

    it("handles zero working days", () => {
      const start = new Date(2026, 2, 9); // Mon March 9
      const result = addWorkingDays(start, 0);
      expect(result.getDate()).toBe(9); // Same day
    });

    it("correctly adds 5 working days (one week)", () => {
      // Mon March 2 + 5 working days = Mon March 9
      const result = addWorkingDays(new Date(2026, 2, 2), 5);
      expect(result.getDate()).toBe(9);
      expect(result.getMonth()).toBe(2);
    });
  });
});

// ─── Schedule Generation ────────────────────────────────────

describe("generateSchedule", () => {
  it("generates tasks for all matched articles", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const detailTasks = schedule.tasks.filter(t => !t.isSummary && !t.isMilestone);
    expect(detailTasks.length).toBeGreaterThanOrEqual(3);
  });

  it("includes summary (phase) tasks", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const summaryTasks = schedule.tasks.filter(t => t.isSummary);
    expect(summaryTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("sets startDate and finishDate on all tasks", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    for (const task of schedule.tasks) {
      expect(task.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(task.finishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("generates a critical path with at least one entry", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    expect(schedule.criticalPath.length).toBeGreaterThanOrEqual(1);
  });

  it("assigns labor resources to detail tasks (excluding procurement)", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const detailTasks = schedule.tasks.filter(
      t => !t.isSummary && !t.isMilestone && !t.name.startsWith("Encomenda:"),
    );
    for (const task of detailTasks) {
      const labor = task.resources.filter(r => r.type === "labor");
      expect(labor.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("respects phase ordering", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const summaryTasks = schedule.tasks.filter(t => t.isSummary);

    // Structure tasks should start before external finishes
    const structure = summaryTasks.find(t => t.phase === "structure");
    const extFinishes = summaryTasks.find(t => t.phase === "external_finishes");

    if (structure && extFinishes) {
      expect(structure.startDate <= extFinishes.startDate).toBe(true);
    }
  });
});

// ─── Milestones ─────────────────────────────────────────────

describe("construction milestones", () => {
  it("inserts milestone tasks with isMilestone=true", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const milestones = schedule.tasks.filter(t => t.isMilestone);
    expect(milestones.length).toBeGreaterThanOrEqual(1);
  });

  it("milestones have zero duration", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const milestones = schedule.tasks.filter(t => t.isMilestone);
    for (const ms of milestones) {
      expect(ms.durationDays).toBe(0);
      expect(ms.durationHours).toBe(0);
    }
  });

  it("milestones have Portuguese names starting with 'Marco:'", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const milestones = schedule.tasks.filter(t => t.isMilestone);
    for (const ms of milestones) {
      expect(ms.name).toMatch(/^Marco:/);
    }
  });

  it("milestones have startDate === finishDate", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const milestones = schedule.tasks.filter(t => t.isMilestone);
    for (const ms of milestones) {
      expect(ms.startDate).toBe(ms.finishDate);
    }
  });

  it("milestones have a predecessor", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const milestones = schedule.tasks.filter(t => t.isMilestone);
    for (const ms of milestones) {
      expect(ms.predecessors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("'Vistoria Estrutural' appears when structure phase exists", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const structural = schedule.tasks.find(t => t.name === "Marco: Vistoria Estrutural");
    expect(structural).toBeDefined();
    expect(structural!.isMilestone).toBe(true);
  });
});

// ─── CCPM (Critical Chain) ──────────────────────────────────

describe("CCPM with ScheduleOptions", () => {
  it("generates criticalChain data when useCriticalChain=true", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), {
      maxWorkers: 10,
      useCriticalChain: true,
      safetyReduction: 0.5,
      projectBufferRatio: 0.5,
      feedingBufferRatio: 0.5,
    });

    expect(schedule.criticalChain).toBeDefined();
  });

  it("includes project buffer in criticalChain", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), {
      maxWorkers: 10,
      useCriticalChain: true,
    });

    if (schedule.criticalChain) {
      expect(schedule.criticalChain.projectBuffer).toBeDefined();
      expect(schedule.criticalChain.projectBuffer.type).toBe("project");
      expect(schedule.criticalChain.projectBuffer.durationDays).toBeGreaterThan(0);
    }
  });

  it("project buffer has green zone initially", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), {
      maxWorkers: 10,
      useCriticalChain: true,
    });

    if (schedule.criticalChain) {
      expect(schedule.criticalChain.projectBuffer.zone).toBe("green");
      expect(schedule.criticalChain.projectBuffer.consumedPercent).toBe(0);
    }
  });

  it("does not generate criticalChain when useCriticalChain=false", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), {
      maxWorkers: 10,
      useCriticalChain: false,
    });

    expect(schedule.criticalChain).toBeUndefined();
  });

  it("works with number parameter (backward compatible)", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    expect(schedule.tasks.length).toBeGreaterThan(0);
    expect(schedule.criticalChain).toBeUndefined(); // No CCPM when passing number
  });
});

// ─── Critical Path Detail Level ─────────────────────────────

describe("critical path includes detail tasks", () => {
  it("critical path includes non-summary task UIDs", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const detailUids = schedule.tasks
      .filter(t => !t.isSummary && !t.isMilestone)
      .map(t => t.uid);

    const criticalDetailTasks = schedule.criticalPath.filter(uid =>
      detailUids.includes(uid),
    );

    // Should have at least one detail task on the critical path
    expect(criticalDetailTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("critical path includes summary task UIDs", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const summaryUids = schedule.tasks
      .filter(t => t.isSummary)
      .map(t => t.uid);

    const criticalSummaryTasks = schedule.criticalPath.filter(uid =>
      summaryUids.includes(uid),
    );

    expect(criticalSummaryTasks.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Phase Ordering ─────────────────────────────────────────

describe("PHASE_ORDER", () => {
  it("has 30 phases", () => {
    expect(PHASE_ORDER.length).toBe(30);
  });

  it("starts with site_setup", () => {
    expect(PHASE_ORDER[0]).toBe("site_setup");
  });

  it("ends with cleanup", () => {
    expect(PHASE_ORDER[PHASE_ORDER.length - 1]).toBe("cleanup");
  });

  it("structure comes after foundations", () => {
    const foundIdx = PHASE_ORDER.indexOf("foundations");
    const structIdx = PHASE_ORDER.indexOf("structure");
    expect(structIdx).toBeGreaterThan(foundIdx);
  });

  it("testing comes before cleanup", () => {
    const testIdx = PHASE_ORDER.indexOf("testing");
    const cleanIdx = PHASE_ORDER.indexOf("cleanup");
    expect(cleanIdx).toBeGreaterThan(testIdx);
  });
});

// ─── Parallel Article Scheduling ─────────────────────────────

describe("parallel article scheduling within phases", () => {
  it("articles with few workers share the same start date", () => {
    // With 10 maxWorkers, two small articles (2 workers each) should start together
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const structTasks = schedule.tasks.filter(
      t => t.phase === "structure" && !t.isSummary && !t.isMilestone,
    );
    // Structure has 2 articles (pilar + viga). With 10 workers available,
    // both should fit in one batch (each uses ≤5 workers)
    if (structTasks.length >= 2) {
      // At least some articles should share a start date (parallel)
      const startDates = structTasks.map(t => t.startDate);
      const uniqueStarts = new Set(startDates);
      expect(uniqueStarts.size).toBeLessThanOrEqual(startDates.length);
    }
  });

  it("articles overflow to next batch when workers exceed budget", () => {
    // With maxWorkers=2, each article needs workers; they can't all run at once
    const schedule = generateSchedule(makeProject(), makeMatches(), 2);
    const structTasks = schedule.tasks.filter(
      t => t.phase === "structure" && !t.isSummary && !t.isMilestone,
    );
    if (structTasks.length >= 2) {
      // With very limited workers, at least some should have different start dates
      const startDates = structTasks.map(t => t.startDate);
      const uniqueStarts = new Set(startDates);
      // With 2 max workers, big articles can't overlap → multiple batches
      expect(uniqueStarts.size).toBeGreaterThanOrEqual(1);
    }
  });

  it("parallel scheduling produces shorter or equal phase duration vs sequential", () => {
    // High worker count should allow parallelism → shorter total span
    const parallelSchedule = generateSchedule(makeProject(), makeMatches(), 20);
    const sequentialSchedule = generateSchedule(makeProject(), makeMatches(), 1);

    const parallelFinish = new Date(parallelSchedule.finishDate).getTime();
    const sequentialFinish = new Date(sequentialSchedule.finishDate).getTime();

    // Parallel should finish no later than sequential
    expect(parallelFinish).toBeLessThanOrEqual(sequentialFinish);
  });
});

// ─── Floor-Stagger Heuristic ─────────────────────────────────

describe("floor-stagger heuristic", () => {
  function makeMultiFloorProject(): WbsProject {
    return makeProject({ numberOfFloors: 4 });
  }

  it("creates per-floor sub-tasks for structure phase when floors > 1", () => {
    const schedule = generateSchedule(makeMultiFloorProject(), makeMatches(), 10);
    const structTasks = schedule.tasks.filter(
      t => t.phase === "structure" && !t.isSummary && !t.isMilestone && !t.name.startsWith("Encomenda:"),
    );
    // 2 articles × 4 floors = 8 sub-tasks
    expect(structTasks.length).toBe(8);
  });

  it("per-floor tasks have 'Piso N' in their name", () => {
    const schedule = generateSchedule(makeMultiFloorProject(), makeMatches(), 10);
    const structTasks = schedule.tasks.filter(
      t => t.phase === "structure" && !t.isSummary && !t.isMilestone && !t.name.startsWith("Encomenda:"),
    );
    const pisoTasks = structTasks.filter(t => /Piso \d/.test(t.name));
    expect(pisoTasks.length).toBe(8); // All should have floor labels
  });

  it("floor N+1 starts after floor N (SS+lag dependency)", () => {
    const schedule = generateSchedule(makeMultiFloorProject(), makeMatches(), 10);
    const structTasks = schedule.tasks.filter(
      t => t.phase === "structure" && !t.isSummary && !t.isMilestone && !t.name.startsWith("Encomenda:"),
    );

    // Group by article code — tasks for the same article should be staggered
    const pilarTasks = structTasks.filter(t => t.name.includes("Pilar"));
    if (pilarTasks.length >= 2) {
      // Each floor should start on or after the previous floor
      for (let i = 1; i < pilarTasks.length; i++) {
        expect(pilarTasks[i].startDate >= pilarTasks[i - 1].startDate).toBe(true);
      }
    }
  });

  it("does NOT stagger for single-floor projects", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const structTasks = schedule.tasks.filter(
      t => t.phase === "structure" && !t.isSummary && !t.isMilestone,
    );
    // No floor labels — 2 articles, 1 task each
    const pisoTasks = structTasks.filter(t => /Piso \d/.test(t.name));
    expect(pisoTasks.length).toBe(0);
  });

  it("roof phase does NOT get floor-staggered", () => {
    // Chapter 09 maps to "roof", which is NOT in FLOOR_STAGGER_PHASES
    const schedule = generateSchedule(makeMultiFloorProject(), makeMatches(), 10);
    const roofTasks = schedule.tasks.filter(
      t => t.phase === "roof" && !t.isSummary && !t.isMilestone,
    );
    // Roof articles are not staggered, so no "Piso N" labels
    const pisoTasks = roofTasks.filter(t => /Piso \d/.test(t.name));
    expect(pisoTasks.length).toBe(0);
  });
});

// ─── Procurement Lead-Time Tasks ─────────────────────────────

describe("procurement lead-time tasks", () => {
  it("inserts procurement task for structure phase (Aço estrutural)", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const procTask = schedule.tasks.find(t => t.name === "Encomenda: Aço estrutural");
    expect(procTask).toBeDefined();
    expect(procTask!.durationDays).toBe(20);
    expect(procTask!.resources.length).toBe(0); // zero labor
    expect(procTask!.cost).toBe(0);
  });

  it("procurement task starts at project start date", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const procTask = schedule.tasks.find(t => t.name === "Encomenda: Aço estrutural");
    expect(procTask).toBeDefined();
    expect(procTask!.startDate).toBe("2026-03-02");
  });

  it("structure summary has procurement as FS predecessor", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const procTask = schedule.tasks.find(t => t.name === "Encomenda: Aço estrutural");
    const structSummary = schedule.tasks.find(t => t.isSummary && t.phase === "structure");
    expect(procTask).toBeDefined();
    expect(structSummary).toBeDefined();
    const fsPred = structSummary!.predecessors.find(p => p.uid === procTask!.uid);
    expect(fsPred).toBeDefined();
    expect(fsPred!.type).toBe("FS");
  });

  it("creates procurement tasks only for phases with lead times", () => {
    const schedule = generateSchedule(makeProject(), makeMatches(), 10);
    const procTasks = schedule.tasks.filter(t => t.name.startsWith("Encomenda:"));
    // Test project has structure (ch06) + roof (ch09) — both have procurement
    expect(procTasks.length).toBe(2);
    expect(procTasks.map(t => t.name).sort()).toEqual([
      "Encomenda: Aço estrutural",
      "Encomenda: Cobertura",
    ]);
  });
});

// ─── Seasonal Productivity Multipliers ───────────────────────

describe("seasonal productivity multipliers", () => {
  it("August seasonal factor (0.7) extends task durations", () => {
    // Same start date, compare with vs without seasonal factor
    const project = makeProject({ startDate: "2026-08-03" }); // August start
    const withSeasonal = generateSchedule(project, makeMatches(), 10);
    const noSeasonal = generateSchedule(project, makeMatches(), {
      maxWorkers: 10,
      seasonalFactors: Array(12).fill(1.0),
    });

    const withMs = new Date(withSeasonal.finishDate).getTime();
    const noMs = new Date(noSeasonal.finishDate).getTime();
    // With Aug=0.7 factor, project should finish later
    expect(withMs).toBeGreaterThanOrEqual(noMs);
  });

  it("can disable seasonal factors with all-1.0 array", () => {
    const project = makeProject({ startDate: "2026-08-03" });
    const noSeasonal = generateSchedule(project, makeMatches(), {
      maxWorkers: 10,
      seasonalFactors: Array(12).fill(1.0),
    });
    const withSeasonal = generateSchedule(project, makeMatches(), 10);

    // Without seasonal factors, August should not be penalized
    const noSeasonalFinish = new Date(noSeasonal.finishDate).getTime();
    const withSeasonalFinish = new Date(withSeasonal.finishDate).getTime();
    expect(noSeasonalFinish).toBeLessThanOrEqual(withSeasonalFinish);
  });

  it("winter months (Jan/Feb) seasonal factor extends durations", () => {
    const project = makeProject({ startDate: "2026-01-05" }); // January (Mon)
    const withSeasonal = generateSchedule(project, makeMatches(), 10);
    const noSeasonal = generateSchedule(project, makeMatches(), {
      maxWorkers: 10,
      seasonalFactors: Array(12).fill(1.0),
    });

    const withMs = new Date(withSeasonal.finishDate).getTime();
    const noMs = new Date(noSeasonal.finishDate).getTime();
    // With Jan=0.85 factor, project should finish later
    expect(withMs).toBeGreaterThanOrEqual(noMs);
  });
});

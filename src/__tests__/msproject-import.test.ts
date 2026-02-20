// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  parseMSProjectXML,
  isMSProjectXML,
  parsePTDuration,
} from "@/lib/msproject-import";
import { generateMSProjectXML } from "@/lib/msproject-export";
import type { ProjectSchedule, ScheduleTask, ProjectResource } from "@/lib/wbs-types";

// ── Helper: minimal schedule fixture ──────────────────────

function makeSchedule(): ProjectSchedule {
  const tasks: ScheduleTask[] = [
    {
      uid: 1,
      wbs: "01",
      name: "Estaleiro e Trabalhos Preparatórios",
      durationDays: 5,
      durationHours: 40,
      startDate: "2026-03-01",
      finishDate: "2026-03-07",
      predecessors: [],
      isSummary: true,
      phase: "site_setup",
      resources: [],
      cost: 5000,
      materialCost: 0,
      outlineLevel: 1,
      percentComplete: 0,
    },
    {
      uid: 2,
      wbs: "01.01",
      name: "Montagem de estaleiro",
      durationDays: 3,
      durationHours: 24,
      startDate: "2026-03-01",
      finishDate: "2026-03-05",
      predecessors: [],
      isSummary: false,
      phase: "site_setup",
      resources: [
        { name: "Pedreiro", type: "labor", units: 2, rate: 12, hours: 24 },
      ],
      cost: 2000,
      materialCost: 500,
      outlineLevel: 3,
      percentComplete: 0,
    },
    {
      uid: 3,
      wbs: "01.02",
      name: "Vedação de obra",
      durationDays: 2,
      durationHours: 16,
      startDate: "2026-03-05",
      finishDate: "2026-03-07",
      predecessors: [{ uid: 2, type: "FS" }],
      isSummary: false,
      phase: "site_setup",
      resources: [
        { name: "Pedreiro", type: "labor", units: 2, rate: 12, hours: 16 },
      ],
      cost: 3000,
      materialCost: 1000,
      outlineLevel: 3,
      percentComplete: 0,
    },
    {
      uid: 4,
      wbs: "06",
      name: "Estrutura",
      durationDays: 20,
      durationHours: 160,
      startDate: "2026-03-08",
      finishDate: "2026-04-04",
      predecessors: [{ uid: 1, type: "FS" }],
      isSummary: true,
      phase: "structure",
      resources: [],
      cost: 50000,
      materialCost: 0,
      outlineLevel: 1,
      percentComplete: 0,
    },
    {
      uid: 5,
      wbs: "06.01",
      name: "Pilares de betão armado",
      durationDays: 10,
      durationHours: 80,
      startDate: "2026-03-08",
      finishDate: "2026-03-21",
      predecessors: [{ uid: 3, type: "FS" }],
      isSummary: false,
      phase: "structure",
      resources: [
        { name: "Pedreiro", type: "labor", units: 4, rate: 12, hours: 80 },
        { name: "Betão C25/30", type: "material", units: 15, rate: 85, hours: 0 },
      ],
      cost: 25000,
      materialCost: 1275,
      outlineLevel: 3,
      percentComplete: 0,
    },
    {
      uid: 6,
      wbs: "06.02",
      name: "Vigas de betão armado",
      durationDays: 10,
      durationHours: 80,
      startDate: "2026-03-22",
      finishDate: "2026-04-04",
      predecessors: [{ uid: 5, type: "FS" }],
      isSummary: false,
      phase: "structure",
      resources: [
        { name: "Pedreiro", type: "labor", units: 4, rate: 12, hours: 80 },
      ],
      cost: 25000,
      materialCost: 0,
      outlineLevel: 3,
      percentComplete: 0,
    },
  ];

  const resources: ProjectResource[] = [
    { uid: 1, name: "Pedreiro", type: "labor", standardRate: 12, totalHours: 200, totalCost: 2400 },
    { uid: 2, name: "Betão C25/30", type: "material", standardRate: 85, totalHours: 0, totalCost: 1275 },
  ];

  return {
    projectName: "Projeto Teste Import",
    startDate: "2026-03-01",
    finishDate: "2026-04-04",
    totalDurationDays: 25,
    totalCost: 55000,
    tasks,
    resources,
    criticalPath: [2, 3, 5, 6],
    teamSummary: {
      maxWorkers: 4,
      averageWorkers: 3,
      totalManHours: 200,
      peakWeek: "2026-03-08",
    },
  };
}

// ── Tests ─────────────────────────────────────────────────

describe("isMSProjectXML", () => {
  it("returns true for MS Project XML", () => {
    const xml = generateMSProjectXML(makeSchedule());
    expect(isMSProjectXML(xml)).toBe(true);
  });

  it("returns false for non-MS-Project XML", () => {
    expect(isMSProjectXML("<html><body>Not XML project</body></html>")).toBe(false);
    expect(isMSProjectXML("<root><data>hello</data></root>")).toBe(false);
    expect(isMSProjectXML("not xml at all")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isMSProjectXML("")).toBe(false);
  });
});

describe("parsePTDuration", () => {
  it("parses hours", () => {
    expect(parsePTDuration("PT8H0M0S")).toBe(8);
    expect(parsePTDuration("PT80H0M0S")).toBe(80);
    expect(parsePTDuration("PT0H0M0S")).toBe(0);
  });

  it("parses days", () => {
    expect(parsePTDuration("PT5D")).toBe(40); // 5 days * 8h
  });

  it("parses weeks", () => {
    expect(parsePTDuration("PT2W")).toBe(80); // 2 weeks * 40h
  });

  it("returns 0 for invalid input", () => {
    expect(parsePTDuration("")).toBe(0);
    expect(parsePTDuration("invalid")).toBe(0);
  });
});

describe("parseMSProjectXML - round-trip", () => {
  it("preserves project name", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    expect(result.schedule.projectName).toBe("Projeto Teste Import");
  });

  it("preserves project dates", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    expect(result.schedule.startDate).toBe("2026-03-01");
    expect(result.schedule.finishDate).toBe("2026-04-04");
  });

  it("preserves task count (excluding project summary UID=0)", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    // Original has 6 tasks, export adds UID=0 project summary
    expect(result.schedule.tasks.length).toBe(original.tasks.length);
  });

  it("preserves task UIDs", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    const importedUids = result.schedule.tasks.map((t) => t.uid).sort();
    const originalUids = original.tasks.map((t) => t.uid).sort();
    expect(importedUids).toEqual(originalUids);
  });

  it("preserves task names", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    const importedNames = result.schedule.tasks.map((t) => t.name).sort();
    const originalNames = original.tasks.map((t) => t.name).sort();
    expect(importedNames).toEqual(originalNames);
  });

  it("preserves WBS codes", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    const importedWbs = result.schedule.tasks.map((t) => t.wbs).sort();
    const originalWbs = original.tasks.map((t) => t.wbs).sort();
    expect(importedWbs).toEqual(originalWbs);
  });

  it("preserves predecessor links", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    // Task UID=3 should have predecessor UID=2 (FS)
    const task3 = result.schedule.tasks.find((t) => t.uid === 3);
    expect(task3).toBeDefined();
    expect(task3!.predecessors.length).toBe(1);
    expect(task3!.predecessors[0].uid).toBe(2);
    expect(task3!.predecessors[0].type).toBe("FS");

    // Task UID=6 should have predecessor UID=5 (FS)
    const task6 = result.schedule.tasks.find((t) => t.uid === 6);
    expect(task6).toBeDefined();
    expect(task6!.predecessors.length).toBe(1);
    expect(task6!.predecessors[0].uid).toBe(5);
  });

  it("preserves summary flag", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    const summaryTasks = result.schedule.tasks.filter((t) => t.isSummary);
    expect(summaryTasks.length).toBe(2); // "Estaleiro" and "Estrutura"
  });

  it("preserves critical path", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    expect(result.schedule.criticalPath.length).toBeGreaterThan(0);
    // UIDs 2, 3, 5, 6 are marked critical in the original
    for (const uid of [2, 3, 5, 6]) {
      expect(result.schedule.criticalPath).toContain(uid);
    }
  });

  it("parses resources", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    expect(result.schedule.resources.length).toBe(2);

    const pedreiro = result.schedule.resources.find((r) => r.name === "Pedreiro");
    expect(pedreiro).toBeDefined();
    expect(pedreiro!.type).toBe("labor");

    const betao = result.schedule.resources.find((r) => r.name === "Betão C25/30");
    expect(betao).toBeDefined();
    expect(betao!.type).toBe("material");
  });

  it("assigns resources to tasks via assignments", () => {
    const original = makeSchedule();
    const xml = generateMSProjectXML(original);
    const result = parseMSProjectXML(xml);

    // Task 5 (Pilares) should have 2 resources: Pedreiro + Betão
    const pilares = result.schedule.tasks.find((t) => t.uid === 5);
    expect(pilares).toBeDefined();
    expect(pilares!.resources.length).toBe(2);

    const laborRes = pilares!.resources.find((r) => r.type === "labor");
    expect(laborRes).toBeDefined();
    expect(laborRes!.name).toBe("Pedreiro");
    expect(laborRes!.units).toBe(4);
  });
});

describe("parseMSProjectXML - WBS extraction", () => {
  it("extracts chapters from schedule hierarchy", () => {
    const xml = generateMSProjectXML(makeSchedule());
    const result = parseMSProjectXML(xml);

    expect(result.wbsProject.chapters.length).toBeGreaterThan(0);
    expect(result.wbsProject.name).toBe("Projeto Teste Import");
    expect(result.wbsProject.startDate).toBe("2026-03-01");
  });

  it("extracts articles from leaf tasks", () => {
    const xml = generateMSProjectXML(makeSchedule());
    const result = parseMSProjectXML(xml);

    const totalArticles = result.wbsProject.chapters.reduce(
      (sum, ch) => sum + ch.subChapters.reduce((s, sc) => s + sc.articles.length, 0),
      0,
    );
    // 4 leaf tasks (uid 2, 3, 5, 6)
    expect(totalArticles).toBe(4);
  });
});

describe("parseMSProjectXML - phase inference", () => {
  it("infers site_setup from 'Estaleiro'", () => {
    const xml = generateMSProjectXML(makeSchedule());
    const result = parseMSProjectXML(xml);

    const estaleiro = result.schedule.tasks.find((t) => t.name.includes("Estaleiro"));
    expect(estaleiro?.phase).toBe("site_setup");
  });

  it("infers structure from 'betão armado'", () => {
    const xml = generateMSProjectXML(makeSchedule());
    const result = parseMSProjectXML(xml);

    const pilares = result.schedule.tasks.find((t) => t.name.includes("betão armado"));
    expect(pilares?.phase).toBe("structure");
  });
});

describe("parseMSProjectXML - diagnostics", () => {
  it("generates info diagnostics", () => {
    const xml = generateMSProjectXML(makeSchedule());
    const result = parseMSProjectXML(xml);

    const infos = result.diagnostics.filter((d) => d.type === "info");
    expect(infos.length).toBeGreaterThan(0);
    // Should have an import summary diagnostic
    expect(infos.some((d) => d.message.includes("Importado:"))).toBe(true);
  });

  it("generates suggestion for missing phases", () => {
    const xml = generateMSProjectXML(makeSchedule());
    const result = parseMSProjectXML(xml);

    // The minimal fixture only has site_setup and structure phases
    // So it should suggest that other core phases are missing
    const suggestions = result.diagnostics.filter((d) => d.type === "suggestion");
    expect(suggestions.some((d) => d.message.includes("Fases de construção não identificadas"))).toBe(true);
  });
});

describe("parseMSProjectXML - minimal XML", () => {
  it("handles XML with no tasks gracefully", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Empty Project</Name>
  <StartDate>2026-01-01T08:00:00</StartDate>
  <FinishDate>2026-01-01T17:00:00</FinishDate>
  <Tasks></Tasks>
  <Resources></Resources>
  <Assignments></Assignments>
</Project>`;

    const result = parseMSProjectXML(xml);
    expect(result.schedule.tasks.length).toBe(0);
    expect(result.schedule.projectName).toBe("Empty Project");
  });

  it("handles XML with tasks but no assignments", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>No Assignments</Name>
  <StartDate>2026-01-01T08:00:00</StartDate>
  <FinishDate>2026-02-01T17:00:00</FinishDate>
  <Tasks>
    <Task>
      <UID>0</UID>
      <Name>Project Summary</Name>
      <Summary>1</Summary>
      <OutlineLevel>0</OutlineLevel>
    </Task>
    <Task>
      <UID>1</UID>
      <Name>Fundações</Name>
      <WBS>04</WBS>
      <Duration>PT40H0M0S</Duration>
      <Start>2026-01-01T08:00:00</Start>
      <Finish>2026-01-08T17:00:00</Finish>
      <Summary>0</Summary>
      <OutlineLevel>1</OutlineLevel>
      <PercentComplete>50</PercentComplete>
    </Task>
  </Tasks>
  <Resources></Resources>
  <Assignments></Assignments>
</Project>`;

    const result = parseMSProjectXML(xml);
    expect(result.schedule.tasks.length).toBe(1);
    expect(result.schedule.tasks[0].name).toBe("Fundações");
    expect(result.schedule.tasks[0].phase).toBe("foundations");
    expect(result.schedule.tasks[0].percentComplete).toBe(50);
    expect(result.schedule.tasks[0].durationDays).toBe(5);
  });
});

import { describe, it, expect } from "vitest";
import { generateMSProjectXML } from "@/lib/msproject-export";
import type { ProjectSchedule, ScheduleTask, TaskResource, ProjectResource } from "@/lib/wbs-types";

// ============================================================
// XML Helpers
// ============================================================

/** Extract all text values for a given XML tag */
function extractXmlValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    values.push(m[1]);
  }
  return values;
}

/** Count occurrences of an opening tag */
function countXmlTag(xml: string, tag: string): number {
  const re = new RegExp(`<${tag}>`, "g");
  return (xml.match(re) || []).length;
}

// ============================================================
// Factories
// ============================================================

function makeTaskResource(
  type: "labor" | "material" | "machinery" | "subcontractor",
  name: string, rate: number, units: number, hours: number,
  teamSize?: number,
): TaskResource {
  return { name, type, units, rate, hours, ...(teamSize !== undefined && { teamSize }) };
}

function makeTask(overrides: Partial<ScheduleTask> & { uid: number }): ScheduleTask {
  return {
    wbs: "06.01.001",
    name: "Pilares",
    durationDays: 10,
    durationHours: 80,
    startDate: "2026-03-02",
    finishDate: "2026-03-13",
    predecessors: [],
    phase: "structure",
    isSummary: false,
    resources: [
      makeTaskResource("material", "Betão C25/30", 72.5, 45, 0),
      makeTaskResource("labor", "Oficial Estruturista", 14.5, 2, 80),
    ],
    cost: 4418.5,
    materialCost: 3262.5,
    outlineLevel: 3,
    percentComplete: 0,
    ...overrides,
  };
}

function makeProjectResources(): ProjectResource[] {
  return [
    { uid: 1, name: "Betão C25/30", type: "material", standardRate: 72.5, totalHours: 0, totalCost: 3262.5 },
    { uid: 2, name: "Oficial Estruturista", type: "labor", standardRate: 14.5, totalHours: 160, totalCost: 2320 },
  ];
}

function makeSchedule(tasks?: ScheduleTask[], resources?: ProjectResource[]): ProjectSchedule {
  const t = tasks || [
    makeTask({ uid: 1 }),
    makeTask({ uid: 2, name: "Vigas", wbs: "06.02.001", startDate: "2026-03-16", finishDate: "2026-03-27", predecessors: [{ uid: 1, type: "FS" }] }),
  ];
  return {
    projectName: "Edifício Teste",
    startDate: "2026-03-02",
    finishDate: "2026-06-30",
    totalDurationDays: 85,
    totalCost: t.reduce((s, task) => s + task.cost, 0),
    tasks: t,
    resources: resources || makeProjectResources(),
    criticalPath: [1],
    teamSummary: { maxWorkers: 6, averageWorkers: 4, totalManHours: 480, peakWeek: "2026-W10" },
  };
}

// ============================================================
// Tests
// ============================================================

describe("MS Project XML Export", () => {
  describe("XML structure", () => {
    it("generates valid XML with correct declaration and namespace", () => {
      const xml = generateMSProjectXML(makeSchedule());
      expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"/);
      expect(xml).toContain('xmlns="http://schemas.microsoft.com/project"');
    });

    it("contains project properties", () => {
      const xml = generateMSProjectXML(makeSchedule());
      const names = extractXmlValues(xml, "Name");
      expect(names[0]).toBe("Edifício Teste"); // <Project><Name>
      expect(xml).toContain("<CurrencyCode>EUR</CurrencyCode>");
      expect(xml).toContain("<CurrencySymbol>€</CurrencySymbol>");

      const startDates = extractXmlValues(xml, "StartDate");
      expect(startDates[0]).toBe("2026-03-02T08:00:00");

      const finishDates = extractXmlValues(xml, "FinishDate");
      expect(finishDates[0]).toBe("2026-06-30T17:00:00");
    });

    it("sets correct work parameters", () => {
      const xml = generateMSProjectXML(makeSchedule());
      expect(extractXmlValues(xml, "MinutesPerDay")[0]).toBe("480");
      expect(extractXmlValues(xml, "MinutesPerWeek")[0]).toBe("2400");
      expect(extractXmlValues(xml, "DaysPerMonth")[0]).toBe("22");
    });
  });

  describe("Portuguese calendar", () => {
    it("defines Mon-Fri as working days with correct time periods", () => {
      const xml = generateMSProjectXML(makeSchedule());
      // DayType 2-6 (Mon-Fri) should have DayWorking=1
      for (let d = 2; d <= 6; d++) {
        const dayBlock = xml.match(new RegExp(`<WeekDay>[\\s\\S]*?<DayType>${d}</DayType>[\\s\\S]*?<DayWorking>1</DayWorking>[\\s\\S]*?</WeekDay>`));
        expect(dayBlock).not.toBeNull();
      }
      // Time periods: 08:00-12:00, 13:00-17:00
      expect(xml).toContain("<FromTime>08:00:00</FromTime>");
      expect(xml).toContain("<ToTime>12:00:00</ToTime>");
      expect(xml).toContain("<FromTime>13:00:00</FromTime>");
      expect(xml).toContain("<ToTime>17:00:00</ToTime>");
    });

    it("defines Saturday and Sunday as non-working", () => {
      const xml = generateMSProjectXML(makeSchedule());
      // DayType 7 (Saturday) and DayType 1 (Sunday)
      for (const d of [7, 1]) {
        const dayBlock = xml.match(new RegExp(`<WeekDay>[\\s\\S]*?<DayType>${d}</DayType>[\\s\\S]*?<DayWorking>0</DayWorking>[\\s\\S]*?</WeekDay>`));
        expect(dayBlock).not.toBeNull();
      }
    });

    it("includes all 13 Portuguese public holidays", () => {
      const xml = generateMSProjectXML(makeSchedule());
      // Count holiday WeekDays (DayType=0 with DayWorking=0)
      // 11 fixed holidays + Good Friday + Corpus Christi = 13
      const holidayMatches = xml.match(/<DayType>0<\/DayType>\s*<DayWorking>0<\/DayWorking>/g);
      expect(holidayMatches).not.toBeNull();
      expect(holidayMatches!.length).toBe(13);

      // Verify key holiday dates (year from schedule.startDate = 2026)
      expect(xml).toContain("2026-01-01T00:00:00"); // New Year
      expect(xml).toContain("2026-04-25T00:00:00"); // Liberty Day
      expect(xml).toContain("2026-05-01T00:00:00"); // Labour Day
      expect(xml).toContain("2026-06-10T00:00:00"); // Portugal Day
      expect(xml).toContain("2026-12-25T00:00:00"); // Christmas
    });
  });

  describe("Tasks", () => {
    it("includes task 0 (project summary) required by MS Project", () => {
      const xml = generateMSProjectXML(makeSchedule());
      // First Task should have UID=0 and Summary=1
      const taskBlock = xml.match(/<Task>\s*<UID>0<\/UID>\s*<ID>0<\/ID>[\s\S]*?<OutlineLevel>0<\/OutlineLevel>\s*<Summary>1<\/Summary>/);
      expect(taskBlock).not.toBeNull();
    });

    it("generates correct task count", () => {
      const schedule = makeSchedule();
      const xml = generateMSProjectXML(schedule);
      // Task 0 + 2 regular tasks = 3
      expect(countXmlTag(xml, "Task")).toBe(schedule.tasks.length + 1);
    });

    it("formats duration as PT{hours}H0M0S", () => {
      const schedule = makeSchedule([makeTask({ uid: 1, durationDays: 10 })]);
      const xml = generateMSProjectXML(schedule);
      // 10 days × 8 hours = 80 hours → PT80H0M0S
      const durations = extractXmlValues(xml, "Duration");
      // Task 0 duration + Task 1 duration — Task 1 should have PT80H0M0S
      expect(durations).toContain("PT80H0M0S");
    });

    it("generates predecessor links with correct type codes", () => {
      const schedule = makeSchedule([
        makeTask({ uid: 1 }),
        makeTask({ uid: 2, predecessors: [{ uid: 1, type: "FS" }] }),
        makeTask({ uid: 3, predecessors: [{ uid: 2, type: "SS", lag: 2 }] }),
      ]);
      const xml = generateMSProjectXML(schedule);

      // FS = type code 1
      expect(xml).toContain("<PredecessorUID>1</PredecessorUID>");
      expect(xml).toMatch(/<PredecessorUID>1<\/PredecessorUID>\s*<Type>1<\/Type>/);

      // SS = type code 3, lag 2 * 4800 = 9600
      expect(xml).toMatch(/<PredecessorUID>2<\/PredecessorUID>\s*<Type>3<\/Type>/);
      expect(xml).toContain("<LinkLag>9600</LinkLag>");
    });

    it("marks critical path tasks correctly", () => {
      const schedule = makeSchedule([
        makeTask({ uid: 1 }),
        makeTask({ uid: 2 }),
      ]);
      schedule.criticalPath = [1]; // Only task 1 is critical
      const xml = generateMSProjectXML(schedule);

      // Extract Critical values for tasks after task 0
      // Task 1 (UID=1) should have Critical=1, Task 2 (UID=2) should have Critical=0
      const task1Block = xml.match(/<UID>1<\/UID>[\s\S]*?<Critical>(\d)<\/Critical>/);
      expect(task1Block).not.toBeNull();
      expect(task1Block![1]).toBe("1");

      const task2Block = xml.match(/<UID>2<\/UID>[\s\S]*?<Critical>(\d)<\/Critical>/);
      expect(task2Block).not.toBeNull();
      expect(task2Block![1]).toBe("0");
    });
  });

  describe("Resources and assignments", () => {
    it("includes resource 0 (Unassigned) required by MS Project", () => {
      const xml = generateMSProjectXML(makeSchedule());
      const resourceBlock = xml.match(/<Resource>\s*<UID>0<\/UID>\s*<ID>0<\/ID>\s*<Name>Unassigned<\/Name>/);
      expect(resourceBlock).not.toBeNull();
    });

    it("generates assignments linking tasks to resources", () => {
      const schedule = makeSchedule(
        [makeTask({ uid: 1 })],
        makeProjectResources(),
      );
      const xml = generateMSProjectXML(schedule);

      // Task 1 has 2 resources → 2 assignments
      const assignmentCount = countXmlTag(xml, "Assignment");
      expect(assignmentCount).toBe(2);

      // Verify TaskUID and ResourceUID in assignments
      expect(xml).toMatch(/<TaskUID>1<\/TaskUID>\s*<ResourceUID>1<\/ResourceUID>/);
      expect(xml).toMatch(/<TaskUID>1<\/TaskUID>\s*<ResourceUID>2<\/ResourceUID>/);
    });

    it("skips assignments for summary tasks", () => {
      const schedule = makeSchedule(
        [makeTask({ uid: 1, isSummary: true })],
        makeProjectResources(),
      );
      const xml = generateMSProjectXML(schedule);

      // Summary tasks should produce no assignments
      const assignmentCount = countXmlTag(xml, "Assignment");
      expect(assignmentCount).toBe(0);
    });
  });

  describe("XML escaping and edge cases", () => {
    it("escapes special XML characters in task names", () => {
      const schedule = makeSchedule([
        makeTask({ uid: 1, name: 'Pilar "A" & Viga <B>' }),
      ]);
      const xml = generateMSProjectXML(schedule);

      expect(xml).toContain("Pilar &quot;A&quot; &amp; Viga &lt;B&gt;");
      expect(xml).not.toContain('Pilar "A"');
    });

    it("escapes special characters in project name", () => {
      const schedule = makeSchedule();
      schedule.projectName = "Edifício <Teste> & 'Proj'";
      const xml = generateMSProjectXML(schedule);

      expect(xml).toContain("Edifício &lt;Teste&gt; &amp; &apos;Proj&apos;");
    });
  });

  describe("Resource types and AccrueAt", () => {
    it("emits material resources as Type 0", () => {
      const xml = generateMSProjectXML(makeSchedule());
      const materialBlock = xml.match(/<Name>Betão C25\/30<\/Name>[\s\S]*?<Type>(\d)<\/Type>/);
      expect(materialBlock).not.toBeNull();
      expect(materialBlock![1]).toBe("0");
    });

    it("emits labor resources as Type 1", () => {
      const xml = generateMSProjectXML(makeSchedule());
      const laborBlock = xml.match(/<Name>Oficial Estruturista<\/Name>[\s\S]*?<Type>(\d)<\/Type>/);
      expect(laborBlock).not.toBeNull();
      expect(laborBlock![1]).toBe("1");
    });

    it("emits machinery resources as Type 2 (Cost)", () => {
      const machRes: ProjectResource = {
        uid: 3, name: "Grua Torre", type: "machinery",
        standardRate: 150, totalHours: 40, totalCost: 6000,
      };
      const task = makeTask({
        uid: 1,
        resources: [makeTaskResource("machinery", "Grua Torre", 150, 1, 40)],
      });
      const xml = generateMSProjectXML(makeSchedule([task], [...makeProjectResources(), machRes]));
      const gruaBlock = xml.match(/<Name>Grua Torre<\/Name>[\s\S]*?<Type>(\d)<\/Type>/);
      expect(gruaBlock).not.toBeNull();
      expect(gruaBlock![1]).toBe("2");
    });

    it("emits subcontractor resources as Type 2 (Cost)", () => {
      const subRes: ProjectResource = {
        uid: 3, name: "Subempreiteiro AVAC", type: "subcontractor",
        standardRate: 0, totalHours: 0, totalCost: 25000, teamSize: 5,
      };
      const task = makeTask({
        uid: 1,
        resources: [makeTaskResource("subcontractor", "Subempreiteiro AVAC", 25000, 1, 0, 5)],
      });
      const xml = generateMSProjectXML(makeSchedule([task], [subRes]));
      const subBlock = xml.match(/<Name>Subempreiteiro AVAC<\/Name>[\s\S]*?<Type>(\d)<\/Type>/);
      expect(subBlock).not.toBeNull();
      expect(subBlock![1]).toBe("2");
    });

    it("emits AccrueAt for material (Start=1) and labor (Prorated=2)", () => {
      const xml = generateMSProjectXML(makeSchedule());
      expect(xml).toContain("<AccrueAt>1</AccrueAt>"); // material: Start
      expect(xml).toContain("<AccrueAt>2</AccrueAt>"); // labor: Prorated
    });

    it("emits AccrueAt=3 (End) for subcontractor and machinery", () => {
      const resources: ProjectResource[] = [
        { uid: 1, name: "Grua", type: "machinery", standardRate: 0, totalHours: 0, totalCost: 5000 },
        { uid: 2, name: "Sub AVAC", type: "subcontractor", standardRate: 0, totalHours: 0, totalCost: 20000, teamSize: 4 },
      ];
      const task = makeTask({
        uid: 1,
        resources: [
          makeTaskResource("machinery", "Grua", 5000, 1, 0),
          makeTaskResource("subcontractor", "Sub AVAC", 20000, 1, 0, 4),
        ],
      });
      const xml = generateMSProjectXML(makeSchedule([task], resources));
      expect(xml).toContain("<AccrueAt>3</AccrueAt>"); // End
    });
  });

  describe("PhysicalPercentComplete", () => {
    it("emits PhysicalPercentComplete for all tasks including task 0", () => {
      const xml = generateMSProjectXML(makeSchedule());
      const ppc = extractXmlValues(xml, "PhysicalPercentComplete");
      // Task 0 (summary) + 2 regular tasks = at least 3
      expect(ppc.length).toBeGreaterThanOrEqual(3);
      expect(ppc.every(v => v === "0")).toBe(true);
    });

    it("uses physicalPercentComplete when provided", () => {
      const task = makeTask({ uid: 1, physicalPercentComplete: 35 });
      const xml = generateMSProjectXML(makeSchedule([task]));
      expect(xml).toContain("<PhysicalPercentComplete>35</PhysicalPercentComplete>");
    });

    it("falls back to percentComplete when physicalPercentComplete is absent", () => {
      const task = makeTask({ uid: 1, percentComplete: 50 });
      const xml = generateMSProjectXML(makeSchedule([task]));
      expect(xml).toContain("<PhysicalPercentComplete>50</PhysicalPercentComplete>");
    });
  });

  describe("Team size visibility", () => {
    it("includes team summary in project Notes", () => {
      const xml = generateMSProjectXML(makeSchedule());
      // Project notes should contain team info
      expect(xml).toContain("Equipa");
      expect(xml).toContain("trabalhadores");
      expect(xml).toContain("homens-hora");
    });

    it("emits team size ExtendedAttribute definition", () => {
      const xml = generateMSProjectXML(makeSchedule());
      expect(xml).toContain("<FieldID>188743731</FieldID>");
      expect(xml).toContain("<Alias>Equipa (trabalhadores)</Alias>");
    });

    it("emits team size as ExtendedAttribute value on tasks with labor", () => {
      const xml = generateMSProjectXML(makeSchedule());
      // Default task has 2 labor units → ExtendedAttribute Value=2
      const extAttr = xml.match(/<ExtendedAttribute>\s*<FieldID>188743731<\/FieldID>\s*<Value>(\d+)<\/Value>/);
      expect(extAttr).not.toBeNull();
      expect(Number(extAttr![1])).toBeGreaterThan(0);
    });

    it("includes subcontractor team size in resource Notes", () => {
      const subRes: ProjectResource = {
        uid: 1, name: "Sub Estruturas", type: "subcontractor",
        standardRate: 0, totalHours: 0, totalCost: 50000, teamSize: 8,
      };
      const task = makeTask({
        uid: 1,
        resources: [makeTaskResource("subcontractor", "Sub Estruturas", 50000, 1, 0, 8)],
      });
      const xml = generateMSProjectXML(makeSchedule([task], [subRes]));
      expect(xml).toContain("Equipa: 8 trabalhadores");
    });
  });

  describe("Cost resource handling", () => {
    it("omits StandardRate for Cost resources (machinery, subcontractor)", () => {
      const resources: ProjectResource[] = [
        { uid: 1, name: "Grua", type: "machinery", standardRate: 150, totalHours: 40, totalCost: 6000 },
      ];
      const task = makeTask({
        uid: 1,
        resources: [makeTaskResource("machinery", "Grua", 150, 1, 40)],
      });
      const xml = generateMSProjectXML(makeSchedule([task], resources));
      // The Grua resource block should NOT contain StandardRate
      const gruaSection = xml.match(/<Name>Grua<\/Name>[\s\S]*?<\/Resource>/);
      expect(gruaSection).not.toBeNull();
      expect(gruaSection![0]).not.toContain("<StandardRate>");
    });

    it("omits Units and Work for Cost resource assignments", () => {
      const resources: ProjectResource[] = [
        { uid: 1, name: "Sub AVAC", type: "subcontractor", standardRate: 0, totalHours: 0, totalCost: 20000, teamSize: 4 },
      ];
      const task = makeTask({
        uid: 1,
        resources: [makeTaskResource("subcontractor", "Sub AVAC", 20000, 1, 0, 4)],
      });
      const xml = generateMSProjectXML(makeSchedule([task], resources));
      // Find the assignment block
      const assignmentBlock = xml.match(/<Assignment>[\s\S]*?<ResourceUID>1<\/ResourceUID>[\s\S]*?<\/Assignment>/);
      expect(assignmentBlock).not.toBeNull();
      expect(assignmentBlock![0]).not.toContain("<Units>");
      expect(assignmentBlock![0]).not.toContain("<Work>");
      expect(assignmentBlock![0]).toContain("<Cost>20000.00</Cost>");
    });
  });

  describe("CCPM buffer enhancements", () => {
    function makeScheduleWithCCPM(): ProjectSchedule {
      const schedule = makeSchedule();
      schedule.criticalChain = {
        chainTaskUids: [1],
        projectBuffer: {
          uid: 9001, type: "project", name: "Buffer de Projeto",
          durationDays: 10, consumedPercent: 0, zone: "green",
          startDate: "2026-06-30", finishDate: "2026-07-14",
          feedingChain: [1],
        },
        feedingBuffers: [],
        buffers: [],
        originalDurationDays: 85, aggressiveDurationDays: 50,
        ccpmDurationDays: 60, safetyReductionPercent: 50, bufferRatio: 0.2,
      };
      schedule.criticalChain.buffers = [schedule.criticalChain.projectBuffer];
      return schedule;
    }

    it("emits PhysicalPercentComplete on buffer tasks", () => {
      const xml = generateMSProjectXML(makeScheduleWithCCPM());
      const bufferBlock = xml.match(/<UID>9001<\/UID>[\s\S]*?<\/Task>/);
      expect(bufferBlock).not.toBeNull();
      expect(bufferBlock![0]).toContain("<PhysicalPercentComplete>0</PhysicalPercentComplete>");
    });

    it("emits enhanced Goldratt buffer notes", () => {
      const xml = generateMSProjectXML(makeScheduleWithCCPM());
      const bufferBlock = xml.match(/<UID>9001<\/UID>[\s\S]*?<\/Task>/);
      expect(bufferBlock).not.toBeNull();
      expect(bufferBlock![0]).toContain("Goldratt Critical Chain");
      expect(bufferBlock![0]).toContain("Projeto");
      expect(bufferBlock![0]).toContain("Verde (OK)");
      expect(bufferBlock![0]).toContain("10 dias");
    });

    it("includes CCPM info in project notes", () => {
      const xml = generateMSProjectXML(makeScheduleWithCCPM());
      expect(xml).toContain("CCPM Goldratt");
      expect(xml).toContain("buffer projeto 10d");
    });
  });
});

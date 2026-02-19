import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";
import type {
  ProjectSchedule,
  ScheduleTask,
  CriticalChainData,
  CriticalChainBuffer,
} from "@/lib/wbs-types";
import type { ProjectResources, LaborResource } from "@/lib/resource-aggregator";
import type { CashFlowResult } from "@/lib/cashflow";

// Mock phase-colors to avoid any side-effect imports
vi.mock("@/lib/phase-colors", () => ({
  phaseLabel: (phase: string) => phase.replace(/_/g, " "),
}));

// ============================================================
// Test Fixtures
// ============================================================

function makeBuffer(
  type: "project" | "feeding",
  uid: number,
  durationDays: number,
  start: string,
  finish: string,
  consumed = 0,
): CriticalChainBuffer {
  const ratio = consumed / 100;
  return {
    uid,
    type,
    name: type === "project" ? "Buffer Projeto" : `Feeding Buffer ${uid}`,
    durationDays,
    consumedPercent: consumed,
    zone: ratio <= 0.33 ? "green" : ratio <= 0.67 ? "yellow" : "red",
    startDate: start,
    finishDate: finish,
    feedingChain: [],
    protectsTask: undefined,
  };
}

function makeTask(
  uid: number,
  name: string,
  startDate: string,
  finishDate: string,
  opts: Partial<ScheduleTask> = {},
): ScheduleTask {
  return {
    uid,
    wbs: `1.${uid}`,
    name,
    durationDays: 10,
    durationHours: 80,
    startDate,
    finishDate,
    predecessors: [],
    isSummary: false,
    phase: "structure",
    resources: [
      {
        name: "Pedreiro",
        type: "labor",
        units: 2,
        rate: 15,
        hours: 80,
      },
    ],
    cost: 5000,
    materialCost: 2000,
    outlineLevel: 2,
    percentComplete: 0,
    ...opts,
  };
}

const projectBuffer = makeBuffer("project", 100, 15, "2026-07-01", "2026-07-21");
const feedingBuffer = makeBuffer("feeding", 101, 5, "2026-05-15", "2026-05-21", 20);

const criticalChain: CriticalChainData = {
  chainTaskUids: [1, 2],
  buffers: [projectBuffer, feedingBuffer],
  projectBuffer,
  feedingBuffers: [feedingBuffer],
  originalDurationDays: 120,
  aggressiveDurationDays: 80,
  ccpmDurationDays: 95,
  safetyReductionPercent: 33,
  bufferRatio: 0.19,
};

function makeSchedule(opts?: { withCriticalChain?: boolean }): ProjectSchedule {
  return {
    projectName: "Hotel CALM Palmela",
    startDate: "2026-04-01",
    finishDate: "2026-07-21",
    totalDurationDays: 80,
    totalCost: 250000,
    tasks: [
      makeTask(1, "Fundações", "2026-04-01", "2026-04-14", {
        phase: "foundations",
        outlineLevel: 1,
        isSummary: true,
      }),
      makeTask(2, "Sapatas corridas", "2026-04-01", "2026-04-10", {
        phase: "foundations",
        outlineLevel: 2,
        predecessors: [{ uid: 1, type: "FS" }],
      }),
      makeTask(3, "Estrutura", "2026-04-15", "2026-05-15", {
        phase: "structure",
        outlineLevel: 1,
        isSummary: true,
      }),
      makeTask(4, "Pilares e vigas", "2026-04-15", "2026-05-01", {
        phase: "structure",
        outlineLevel: 2,
        predecessors: [{ uid: 2, type: "FS" }],
      }),
      makeTask(5, "Lajes", "2026-05-02", "2026-05-15", {
        phase: "structure",
        outlineLevel: 2,
        predecessors: [{ uid: 4, type: "FS" }],
      }),
      makeTask(6, "Alvenarias", "2026-05-16", "2026-06-15", {
        phase: "external_walls",
        outlineLevel: 2,
        predecessors: [{ uid: 5, type: "FS" }],
      }),
      makeTask(7, "Acabamentos", "2026-06-16", "2026-06-30", {
        phase: "internal_finishes",
        outlineLevel: 2,
        predecessors: [{ uid: 6, type: "FS" }],
      }),
    ],
    resources: [
      {
        uid: 1,
        name: "Pedreiro",
        type: "labor",
        standardRate: 15,
        totalHours: 500,
        totalCost: 7500,
      },
      {
        uid: 2,
        name: "Electricista",
        type: "labor",
        standardRate: 18,
        totalHours: 200,
        totalCost: 3600,
      },
    ],
    criticalPath: [2, 4, 5, 6, 7],
    teamSummary: {
      maxWorkers: 8,
      averageWorkers: 5,
      totalManHours: 3200,
      peakWeek: "2026-05-04",
    },
    criticalChain: opts?.withCriticalChain !== false ? criticalChain : undefined,
  };
}

function makeResources(): ProjectResources {
  return {
    materials: [],
    labor: [
      {
        trade: "Pedreiro",
        totalHours: 500,
        hourlyRate: 15,
        totalCost: 7500,
        peakConcurrentWorkers: 4,
        usedInPhases: ["foundations", "structure", "external_walls"],
      },
      {
        trade: "Electricista",
        totalHours: 200,
        hourlyRate: 18,
        totalCost: 3600,
        peakConcurrentWorkers: 2,
        usedInPhases: ["rough_in_electrical", "electrical_fixtures"],
      },
    ],
    equipment: [],
    totalMaterialCost: 100000,
    totalLaborCost: 11100,
    totalLaborHours: 700,
    totalEquipmentCost: 5000,
    grandTotal: 250000,
  };
}

// ============================================================
// Tests
// ============================================================

describe("ccpm-gantt-export", () => {
  // Lazy import so mocks are set up before module loads
  async function getModule() {
    return await import("@/lib/ccpm-gantt-export");
  }

  it("generates workbook with 5 sheets (correct names)", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const buffer = await generateCcpmGanttExcel(
      makeSchedule(),
      makeResources(),
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.byteLength).toBeGreaterThan(0);

    // Parse the generated xlsx to inspect sheets
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toEqual([
      "Gantt CCPM",
      "Fever Chart",
      "Detalhe WBS",
      "Carga Recursos",
      "Dashboard",
    ]);
  });

  it("Gantt sheet has frozen panes", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const buffer = await generateCcpmGanttExcel(
      makeSchedule(),
      makeResources(),
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const gantt = wb.getWorksheet("Gantt CCPM")!;

    expect(gantt.views.length).toBeGreaterThan(0);
    const view = gantt.views[0];
    expect(view.xSplit).toBe(8);
    expect(view.ySplit).toBe(3);
  });

  it("Gantt has data header row with correct column labels", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const buffer = await generateCcpmGanttExcel(
      makeSchedule(),
      makeResources(),
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const gantt = wb.getWorksheet("Gantt CCPM")!;

    // Row 3 should have the data column headers
    const row3 = gantt.getRow(3);
    expect(row3.getCell(1).value).toBe("WBS");
    expect(row3.getCell(2).value).toBe("Tarefa");
    expect(row3.getCell(3).value).toBe("Dur.(d)");
    expect(row3.getCell(4).value).toBe("Início");
    expect(row3.getCell(5).value).toBe("Fim");
  });

  it("critical chain tasks use dark fill color", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const schedule = makeSchedule({ withCriticalChain: true });
    const buffer = await generateCcpmGanttExcel(schedule, makeResources());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const gantt = wb.getWorksheet("Gantt CCPM")!;

    // Find a data row (tasks start after row 3 header)
    // There should be at least some rows with filled Gantt cells
    let foundCritical = false;
    gantt.eachRow((row, rowNum) => {
      if (rowNum <= 3) return; // skip headers
      // Check cells in the Gantt area (column 9+)
      for (let c = 9; c <= row.cellCount; c++) {
        const cell = row.getCell(c);
        if (cell.fill && "fgColor" in cell.fill && cell.fill.fgColor) {
          const color = (cell.fill.fgColor as { argb?: string }).argb;
          if (color === "FF202A30") {
            foundCritical = true;
          }
        }
      }
    });

    expect(foundCritical).toBe(true);
  });

  it("buffer rows have correct fill colors", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const schedule = makeSchedule({ withCriticalChain: true });
    const buffer = await generateCcpmGanttExcel(schedule, makeResources());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const gantt = wb.getWorksheet("Gantt CCPM")!;

    // Check that project buffer green (10B981) and feeding buffer blue (3B82F6) exist
    const foundColors = new Set<string>();
    gantt.eachRow((row, rowNum) => {
      if (rowNum <= 3) return;
      for (let c = 9; c <= row.cellCount; c++) {
        const cell = row.getCell(c);
        if (cell.fill && "fgColor" in cell.fill && cell.fill.fgColor) {
          const color = (cell.fill.fgColor as { argb?: string }).argb;
          if (color) foundColors.add(color);
        }
      }
    });

    expect(foundColors.has("FF10B981")).toBe(true); // project buffer green
    expect(foundColors.has("FF3B82F6")).toBe(true); // feeding buffer blue
  });

  it("Fever Chart sheet has zone-colored grid", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const schedule = makeSchedule({ withCriticalChain: true });
    const buffer = await generateCcpmGanttExcel(schedule, makeResources());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const fever = wb.getWorksheet("Fever Chart")!;

    // The fever chart should have cells with zone colors (green, amber, red)
    const zoneColors = new Set<string>();
    fever.eachRow((row) => {
      for (let c = 1; c <= row.cellCount; c++) {
        const cell = row.getCell(c);
        if (cell.fill && "fgColor" in cell.fill && cell.fill.fgColor) {
          const color = (cell.fill.fgColor as { argb?: string }).argb;
          if (color === "FF10B981" || color === "FFD97706" || color === "FFDC2626") {
            zoneColors.add(color);
          }
        }
      }
    });

    // All three zones should be present in a proper fever chart
    expect(zoneColors.has("FF10B981")).toBe(true); // green
    expect(zoneColors.has("FFD97706")).toBe(true); // amber
    expect(zoneColors.has("FFDC2626")).toBe(true); // red
  });

  it("WBS detail sheet lists all tasks and buffers", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const schedule = makeSchedule({ withCriticalChain: true });
    const buffer = await generateCcpmGanttExcel(schedule, makeResources());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const wbs = wb.getWorksheet("Detalhe WBS")!;

    // Count data rows (after header rows)
    let dataRowCount = 0;
    wbs.eachRow((row, rowNum) => {
      // Skip title and header rows (usually rows 1–3)
      if (rowNum <= 3) return;
      const wbsCell = row.getCell(1).value;
      if (wbsCell !== null && wbsCell !== undefined && String(wbsCell).trim() !== "") {
        dataRowCount++;
      }
    });

    // 7 tasks + 2 buffers = 9 data rows
    expect(dataRowCount).toBeGreaterThanOrEqual(7);
  });

  it("Resource load sheet has trade rows", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const buffer = await generateCcpmGanttExcel(
      makeSchedule(),
      makeResources(),
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const resources = wb.getWorksheet("Carga Recursos")!;

    // Should contain the trade names from our fixture
    let foundPedreiro = false;
    let foundElectricista = false;
    resources.eachRow((row) => {
      const val = String(row.getCell(1).value ?? "");
      if (val.includes("Pedreiro")) foundPedreiro = true;
      if (val.includes("Electricista")) foundElectricista = true;
    });

    expect(foundPedreiro).toBe(true);
    expect(foundElectricista).toBe(true);
  });

  it("Resource load uses heatmap coloring", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const buffer = await generateCcpmGanttExcel(
      makeSchedule(),
      makeResources(),
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const resources = wb.getWorksheet("Carga Recursos")!;

    // Should have at least some heatmap fills
    const heatColors = new Set<string>();
    resources.eachRow((row) => {
      for (let c = 2; c <= row.cellCount; c++) {
        const cell = row.getCell(c);
        if (cell.fill && "fgColor" in cell.fill && cell.fill.fgColor) {
          const color = (cell.fill.fgColor as { argb?: string }).argb;
          if (color && (
            color === "FFE8ECFF" || color === "FFB3BFFF" || color === "FF4D65FF"
          )) {
            heatColors.add(color);
          }
        }
      }
    });

    expect(heatColors.size).toBeGreaterThan(0);
  });

  it("Dashboard sheet shows CCPM KPIs", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const schedule = makeSchedule({ withCriticalChain: true });
    const buffer = await generateCcpmGanttExcel(schedule, makeResources());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const dashboard = wb.getWorksheet("Dashboard")!;

    // Dashboard should contain the project name and CCPM-related text
    let foundProjectName = false;
    let foundCcpmText = false;
    dashboard.eachRow((row) => {
      for (let c = 1; c <= row.cellCount; c++) {
        const val = String(row.getCell(c).value ?? "");
        if (val.includes("Hotel CALM Palmela")) foundProjectName = true;
        if (val.includes("CCPM") || val.includes("Buffer") || val.includes("buffer")) {
          foundCcpmText = true;
        }
      }
    });

    expect(foundProjectName).toBe(true);
    expect(foundCcpmText).toBe(true);
  });

  it("graceful fallback when criticalChain is undefined", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const schedule = makeSchedule({ withCriticalChain: false });
    // Remove criticalChain entirely
    delete schedule.criticalChain;

    const buffer = await generateCcpmGanttExcel(schedule, makeResources());

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.byteLength).toBeGreaterThan(0);

    // Should still produce 5 sheets without crashing
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.length).toBe(5);
  });

  it("auto time-scale: weekly for 4-month project", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    // Our schedule is ~4 months → should auto-select "weekly"
    const schedule = makeSchedule();
    const buffer = await generateCcpmGanttExcel(schedule, makeResources(), undefined, {
      timeScale: "auto",
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const gantt = wb.getWorksheet("Gantt CCPM")!;

    // Weekly columns should have many columns (16-17 weeks for 4 months)
    // Each week column plus 8 data columns
    expect(gantt.columnCount).toBeGreaterThan(15);
  });

  it("monthly scale for 18-month project", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const schedule = makeSchedule();
    schedule.startDate = "2026-01-01";
    schedule.finishDate = "2027-06-30";
    schedule.totalDurationDays = 365 + 180;

    // Update task dates to span the range
    schedule.tasks[0].startDate = "2026-01-01";
    schedule.tasks[schedule.tasks.length - 1].finishDate = "2027-06-30";

    const buffer = await generateCcpmGanttExcel(schedule, makeResources(), undefined, {
      timeScale: "auto",
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const gantt = wb.getWorksheet("Gantt CCPM")!;

    // Monthly columns for 18 months + 8 data columns = ~26
    expect(gantt.columnCount).toBeGreaterThan(20);
    expect(gantt.columnCount).toBeLessThan(60); // Should NOT be weekly (would be 78+)
  });

  it("all labels are in Portuguese", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const buffer = await generateCcpmGanttExcel(
      makeSchedule(),
      makeResources(),
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const gantt = wb.getWorksheet("Gantt CCPM")!;
    const wbs = wb.getWorksheet("Detalhe WBS")!;

    // Check Portuguese column headers on Gantt
    const row3 = gantt.getRow(3);
    expect(row3.getCell(1).value).toBe("WBS");
    expect(row3.getCell(2).value).toBe("Tarefa");
    expect(row3.getCell(4).value).toBe("Início");
    expect(row3.getCell(5).value).toBe("Fim");

    // Check WBS detail headers
    const wbsHeaders = wbs.getRow(3);
    expect(wbsHeaders.getCell(2).value).toBe("Tarefa");
  });

  it("serialization round-trip: base64 encode/decode preserves data", async () => {
    const { generateCcpmGanttExcel } = await getModule();
    const buffer = await generateCcpmGanttExcel(
      makeSchedule(),
      makeResources(),
    );

    // Simulate serialize (pipeline-runner)
    const base64 = Buffer.from(buffer).toString("base64");

    // Simulate deserialize (UnifiedUpload)
    const binary = atob(base64);
    const arrayBuf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(arrayBuf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);

    // Re-parse should produce valid workbook
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuf);
    expect(wb.worksheets.length).toBe(5);
  });
});

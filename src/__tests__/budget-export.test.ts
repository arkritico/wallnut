import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { generateBudgetExcel } from "@/lib/budget-export";
import type { BudgetExportOptions } from "@/lib/budget-export";
import type { WbsProject, ProjectSchedule, ScheduleTask, TaskResource, ProjectResource } from "@/lib/wbs-types";
import type { ProjectResources } from "@/lib/resource-aggregator";
import type { CashFlowResult } from "@/lib/cashflow";

// ============================================================
// Helpers
// ============================================================

/** Parse Excel buffer back into sheet-name-keyed 2D arrays */
function parseExcel(buffer: Buffer): { sheetNames: string[]; sheets: Record<string, unknown[][]> } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheets: Record<string, unknown[][]> = {};
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
  }
  return { sheetNames: wb.SheetNames, sheets };
}

/** Find first row index containing a given string value in any cell */
function findRow(rows: unknown[][], text: string): number {
  return rows.findIndex((row) => row.some((cell) => typeof cell === "string" && cell.includes(text)));
}

// ============================================================
// Factories
// ============================================================

function makeTaskResource(type: "labor" | "material" | "machinery", rate: number, units: number, hours: number): TaskResource {
  return { name: `${type}-resource`, type, units, rate, hours };
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
      makeTaskResource("material", 50, 20, 0),
      makeTaskResource("labor", 15, 2, 80),
    ],
    cost: 2200,
    materialCost: 1000,
    outlineLevel: 3,
    percentComplete: 0,
    ...overrides,
  };
}

function makeProject(overrides: Partial<WbsProject> = {}): WbsProject {
  return {
    id: "proj-1",
    name: "Edifício Teste",
    classification: "ProNIC",
    startDate: "2026-03-02",
    district: "Lisboa",
    buildingType: "residential",
    grossFloorArea: 500,
    chapters: [{
      code: "06",
      name: "Estruturas de betão armado",
      subChapters: [{
        code: "06.01",
        name: "Pilares",
        articles: [{ code: "06.01.001", description: "Pilar 250x450", unit: "m", quantity: 114 }],
      }],
    }],
    ...overrides,
  };
}

function makeSchedule(tasks?: ScheduleTask[]): ProjectSchedule {
  const t = tasks || [makeTask({ uid: 1 }), makeTask({ uid: 2, name: "Vigas", wbs: "06.02.001", startDate: "2026-04-01", finishDate: "2026-04-15" })];
  const resources: ProjectResource[] = [
    { uid: 1, name: "material-resource", type: "material", standardRate: 50, totalHours: 0, totalCost: 2000 },
    { uid: 2, name: "labor-resource", type: "labor", standardRate: 15, totalHours: 160, totalCost: 2400 },
  ];
  return {
    projectName: "Edifício Teste",
    startDate: "2026-03-02",
    finishDate: "2026-06-30",
    totalDurationDays: 85,
    totalCost: t.reduce((s, task) => s + task.cost, 0),
    tasks: t,
    resources,
    criticalPath: [1],
    teamSummary: { maxWorkers: 6, averageWorkers: 4, totalManHours: 480, peakWeek: "2026-W10" },
  };
}

function makeResources(): ProjectResources {
  return {
    materials: [
      { code: "mt08aaa010a", description: "Betão C25/30", unit: "m³", totalQuantity: 45.5, unitCost: 72.5, totalCost: 3298.75, usedInArticles: ["06.01.001"] },
      { code: "mt07aco010a", description: "Aço A500 NR", unit: "kg", totalQuantity: 2500, unitCost: 0.85, totalCost: 2125, usedInArticles: ["06.01.001", "06.01.002"] },
    ],
    labor: [
      { trade: "Oficial Estruturista", totalHours: 320, hourlyRate: 14.5, totalCost: 4640, peakConcurrentWorkers: 4, usedInPhases: ["structure"] },
      { trade: "Servente", totalHours: 240, hourlyRate: 10.2, totalCost: 2448, peakConcurrentWorkers: 3, usedInPhases: ["structure", "foundations"] },
    ],
    equipment: [
      { code: "mq06vib020", description: "Vibrador de betão", unit: "h", totalQuantity: 48, unitCost: 3.5, totalCost: 168, usedInPhases: ["structure"] },
    ],
    totalMaterialCost: 5423.75,
    totalLaborCost: 7088,
    totalLaborHours: 560,
    totalEquipmentCost: 168,
    grandTotal: 12679.75,
  };
}

function makeCashFlow(): CashFlowResult {
  return {
    periods: [
      { key: "2026-03", label: "Mar 2026", startDate: "2026-03-02", endDate: "2026-03-31", materials: 2000, labor: 3000, equipment: 100, total: 5100, dominantPhase: "structure", activeTaskCount: 2 },
      { key: "2026-04", label: "Abr 2026", startDate: "2026-04-01", endDate: "2026-04-30", materials: 3000, labor: 4000, equipment: 68, total: 7068, dominantPhase: "structure", activeTaskCount: 3 },
    ],
    sCurve: [
      { periodKey: "2026-03", cumulativeCost: 5100, cumulativePercent: 40.2, periodSpend: 5100 },
      { periodKey: "2026-04", cumulativeCost: 12168, cumulativePercent: 95.9, periodSpend: 7068 },
    ],
    milestones: [
      { number: 1, date: "2026-03-31", periodKey: "2026-03", cumulativePercent: 40.2, amount: 5100, label: "Pagamento 1" },
      { number: 2, date: "2026-04-30", periodKey: "2026-04", cumulativePercent: 95.9, amount: 7068, label: "Pagamento 2" },
    ],
    workingCapital: { maxExposure: 7068, maxExposurePeriod: "2026-04", recommendedWorkingCapital: 8500, averageMonthlyBurn: 6084, peakMonthlySpend: 7068, peakMonth: "2026-04" },
    contingency: { percent: 10, amount: 1268, rationale: "Padrão 10%" },
    totalCost: 12679.75,
    totalWithContingency: 13947.73,
    startDate: "2026-03-02",
    finishDate: "2026-04-30",
    totalMonths: 2,
  };
}

// ============================================================
// Tests
// ============================================================

describe("Budget Excel Export", () => {
  const project = makeProject();
  const schedule = makeSchedule();
  const resources = makeResources();

  describe("Sheet structure", () => {
    it("returns a valid Buffer", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("generates 6 sheets in correct order", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      const { sheetNames } = parseExcel(buffer);
      expect(sheetNames).toEqual([
        "Resumo",
        "Materiais",
        "Mão de Obra",
        "Equipamentos",
        "Fluxo de Caixa",
        "Por Fase",
      ]);
    });
  });

  describe("Resumo (Summary) sheet", () => {
    it("contains project header and name", () => {
      const buffer = generateBudgetExcel(project, schedule, resources, { projectName: "Edifício Teste" });
      const { sheets } = parseExcel(buffer);
      const resumo = sheets["Resumo"];

      expect(resumo[0][0]).toBe("ORÇAMENTO DO PROJETO");
      expect(resumo[2][1]).toBe("Edifício Teste");
    });

    it("shows correct cost categories and percentages", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      const { sheets } = parseExcel(buffer);
      const resumo = sheets["Resumo"];

      // Row 11 = Materials (index 11 in the original array, but XLSX may skip empty rows)
      const matRow = findRow(resumo, "Materiais");
      expect(matRow).toBeGreaterThan(-1);
      expect(resumo[matRow][1]).toBeCloseTo(5423.75, 2);

      const laborRow = findRow(resumo, "Mão de Obra");
      expect(laborRow).toBeGreaterThan(-1);
      expect(resumo[laborRow][1]).toBeCloseTo(7088, 2);

      const eqRow = findRow(resumo, "Equipamentos");
      expect(eqRow).toBeGreaterThan(-1);
      expect(resumo[eqRow][1]).toBeCloseTo(168, 2);
    });

    it("calculates VAT correctly when enabled", () => {
      const buffer = generateBudgetExcel(project, schedule, resources, { includeVAT: true, vatRate: 0.23 });
      const { sheets } = parseExcel(buffer);
      const resumo = sheets["Resumo"];

      const subtotalRow = findRow(resumo, "Subtotal");
      expect(subtotalRow).toBeGreaterThan(-1);
      expect(resumo[subtotalRow][1]).toBeCloseTo(12679.75, 2);

      const ivaRow = findRow(resumo, "IVA");
      expect(ivaRow).toBeGreaterThan(-1);
      expect(resumo[ivaRow][1]).toBeCloseTo(12679.75 * 0.23, 2);

      const totalRow = findRow(resumo, "TOTAL (com IVA)");
      expect(totalRow).toBeGreaterThan(-1);
      expect(resumo[totalRow][1]).toBeCloseTo(12679.75 * 1.23, 2);
    });

    it("omits VAT row when disabled", () => {
      const buffer = generateBudgetExcel(project, schedule, resources, { includeVAT: false });
      const { sheets } = parseExcel(buffer);
      const resumo = sheets["Resumo"];

      const ivaRow = findRow(resumo, "IVA");
      expect(ivaRow).toBe(-1);

      const totalRow = findRow(resumo, "TOTAL");
      expect(totalRow).toBeGreaterThan(-1);
      expect(resumo[totalRow][1]).toBeCloseTo(12679.75, 2);
    });
  });

  describe("Materiais sheet", () => {
    it("has correct column headers", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      const { sheets } = parseExcel(buffer);
      const mat = sheets["Materiais"];

      const headerRow = findRow(mat, "Código Preço");
      expect(headerRow).toBeGreaterThan(-1);
      expect(mat[headerRow]).toEqual(
        expect.arrayContaining(["Código Preço", "Descrição", "Unidade", "Quantidade", "Preço Unit. (€)", "Total (€)", "Artigos WBS"])
      );
    });

    it("lists all materials with correct values", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      const { sheets } = parseExcel(buffer);
      const mat = sheets["Materiais"];

      const headerRow = findRow(mat, "Código Preço");
      const firstData = mat[headerRow + 1];
      expect(firstData[0]).toBe("mt08aaa010a");
      expect(firstData[1]).toBe("Betão C25/30");
      expect(firstData[2]).toBe("m³");
      expect(firstData[3]).toBeCloseTo(45.5, 2);
      expect(firstData[4]).toBeCloseTo(72.5, 2);
      expect(firstData[5]).toBeCloseTo(3298.75, 2);
    });

    it("materials total row matches sum", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      const { sheets } = parseExcel(buffer);
      const mat = sheets["Materiais"];

      const totalRow = findRow(mat, "TOTAL:");
      expect(totalRow).toBeGreaterThan(-1);
      // Sum of 3298.75 + 2125 = 5423.75
      expect(mat[totalRow][5]).toBeCloseTo(5423.75, 2);
    });
  });

  describe("Mão de Obra (Labor) sheet", () => {
    it("has correct headers and data rows", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      const { sheets } = parseExcel(buffer);
      const labor = sheets["Mão de Obra"];

      const headerRow = findRow(labor, "Especialidade");
      expect(headerRow).toBeGreaterThan(-1);
      expect(labor[headerRow]).toEqual(
        expect.arrayContaining(["Especialidade", "Horas Totais", "Taxa Horária (€/h)", "Custo Total (€)", "Pico Trabalhadores"])
      );

      // First labor entry
      const firstData = labor[headerRow + 1];
      expect(firstData[0]).toBe("Oficial Estruturista");
      expect(firstData[1]).toBeCloseTo(320, 1);
      expect(firstData[2]).toBeCloseTo(14.5, 2);
      expect(firstData[3]).toBeCloseTo(4640, 2);
      expect(firstData[4]).toBe(4);
    });
  });

  describe("Fluxo de Caixa (Cashflow) sheet", () => {
    it("renders cashflow periods with accumulation when CashFlowResult provided", () => {
      const cashFlow = makeCashFlow();
      const buffer = generateBudgetExcel(project, schedule, resources, {}, cashFlow);
      const { sheets } = parseExcel(buffer);
      const cf = sheets["Fluxo de Caixa"];

      const headerRow = findRow(cf, "Mês");
      expect(headerRow).toBeGreaterThan(-1);

      // First period: Mar 2026, total 5100, accumulated 5100
      const row1 = cf[headerRow + 1];
      expect(row1[0]).toBe("Mar 2026");
      expect(row1[5]).toBeCloseTo(5100, 2);
      expect(row1[6]).toBeCloseTo(5100, 2);

      // Second period: Abr 2026, total 7068, accumulated 12168
      const row2 = cf[headerRow + 2];
      expect(row2[0]).toBe("Abr 2026");
      expect(row2[5]).toBeCloseTo(7068, 2);
      expect(row2[6]).toBeCloseTo(12168, 2);

      // Working capital section
      const capRow = findRow(cf, "CAPITAL DE GIRO");
      expect(capRow).toBeGreaterThan(-1);
    });

    it("falls back to naive monthly grouping without CashFlowResult", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      const { sheets } = parseExcel(buffer);
      const cf = sheets["Fluxo de Caixa"];

      // Fallback header has 7 columns (no "% Acumulado" or "Marco")
      const headerRow = findRow(cf, "Mês");
      expect(headerRow).toBeGreaterThan(-1);
      expect(cf[headerRow].length).toBeLessThanOrEqual(7);

      // Should have at least one period row
      expect(cf.length).toBeGreaterThan(headerRow + 1);
    });
  });

  describe("Por Fase (By Phase) sheet", () => {
    it("groups tasks by phase with cost and percentage", () => {
      const buffer = generateBudgetExcel(project, schedule, resources);
      const { sheets } = parseExcel(buffer);
      const phase = sheets["Por Fase"];

      const headerRow = findRow(phase, "Fase");
      expect(headerRow).toBeGreaterThan(-1);
      expect(phase[headerRow]).toEqual(
        expect.arrayContaining(["Fase", "Duração (dias)", "Data Início", "Data Fim", "Custo (€)", "% do Total"])
      );

      // Should have at least one phase row (both tasks are "structure")
      const structureRow = findRow(phase, "structure");
      expect(structureRow).toBeGreaterThan(-1);
      // Percentage column should contain a % string
      const pctCell = phase[structureRow][5];
      expect(typeof pctCell).toBe("string");
      expect(pctCell).toContain("%");
    });
  });

  describe("Edge cases", () => {
    it("handles empty resources gracefully", () => {
      const emptyResources: ProjectResources = {
        materials: [],
        labor: [],
        equipment: [],
        totalMaterialCost: 0,
        totalLaborCost: 0,
        totalLaborHours: 0,
        totalEquipmentCost: 0,
        grandTotal: 0,
      };

      const buffer = generateBudgetExcel(project, schedule, emptyResources);
      const { sheetNames, sheets } = parseExcel(buffer);
      expect(sheetNames.length).toBe(6);

      // Materials sheet should still have header row
      const mat = sheets["Materiais"];
      const headerRow = findRow(mat, "Código Preço");
      expect(headerRow).toBeGreaterThan(-1);
    });
  });
});

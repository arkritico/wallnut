/**
 * Budget Excel Export
 *
 * Generates professional multi-sheet Excel budget files using XLSX library.
 * Portuguese construction standards with 6 sheets:
 * 1. Resumo (Summary)
 * 2. Materiais (Materials)
 * 3. Mão de Obra (Labor)
 * 4. Equipamentos (Equipment)
 * 5. Fluxo de Caixa (Cashflow)
 * 6. Por Fase (By Phase)
 */

import * as XLSX from 'xlsx';
import type { WbsProject, ProjectSchedule, ScheduleTask } from "./wbs-types";
import type { ProjectResources, MaterialResource, LaborResource, EquipmentResource } from "./resource-aggregator";
import { formatCost } from "./cost-estimation";
import type { CashFlowResult } from "./cashflow";
import type { ReconciledBoq } from "./boq-reconciliation";

// ============================================================
// Export Options
// ============================================================

export interface BudgetExportOptions {
  projectName?: string;
  projectLocation?: string;
  projectOwner?: string;
  contractor?: string;
  includeVAT?: boolean;
  vatRate?: number;        // Default: 0.23 (23% in Portugal)
}

// ============================================================
// Sheet 1: Summary (Resumo)
// ============================================================

function buildSummarySheet(
  project: WbsProject,
  resources: ProjectResources,
  options: BudgetExportOptions
): XLSX.WorkSheet {
  const vatRate = options.includeVAT ? (options.vatRate || 0.23) : 0;
  const subtotal = resources.grandTotal;
  const vat = subtotal * vatRate;
  const total = subtotal + vat;

  const rows: any[][] = [
    ["ORÇAMENTO DO PROJETO"],
    [""],
    ["Projeto:", options.projectName || project.name || "Sem nome"],
    ["Localização:", options.projectLocation || "Portugal"],
    ["Dono de Obra:", options.projectOwner || ""],
    ["Empreiteiro:", options.contractor || ""],
    ["Data:", new Date().toLocaleDateString('pt-PT')],
    [""],
    ["RESUMO DE CUSTOS"],
    [""],
    ["Categoria", "Valor (€)", "% do Total"],
    ["Materiais", resources.totalMaterialCost, ((resources.totalMaterialCost / subtotal) * 100).toFixed(1) + "%"],
    ["Mão de Obra", resources.totalLaborCost, ((resources.totalLaborCost / subtotal) * 100).toFixed(1) + "%"],
    ["Equipamentos", resources.totalEquipmentCost, ((resources.totalEquipmentCost / subtotal) * 100).toFixed(1) + "%"],
    [""],
    ["Subtotal", subtotal, ""],
  ];

  if (options.includeVAT) {
    rows.push(
      ["IVA (23%)", vat, ""],
      [""],
      ["TOTAL (com IVA)", total, ""]
    );
  } else {
    rows.push(
      [""],
      ["TOTAL", subtotal, ""]
    );
  }

  rows.push(
    [""],
    [""],
    ["DETALHES"],
    ["Total de Materiais:", resources.materials.length + " itens"],
    ["Especialidades de M.O.:", resources.labor.length + " especialidades"],
    ["Total de Horas M.O.:", resources.totalLaborHours.toFixed(0) + " h"],
    ["Equipamentos:", resources.equipment.length + " itens"]
  );

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  sheet['!cols'] = [
    { wch: 25 },  // Category/Description
    { wch: 15 },  // Value
    { wch: 12 },  // Percentage
  ];

  return sheet;
}

// ============================================================
// Sheet 2: Materials (Materiais)
// ============================================================

function buildMaterialsSheet(materials: MaterialResource[]): XLSX.WorkSheet {
  const rows: any[][] = [
    ["MATERIAIS"],
    [""],
    ["Código CYPE", "Descrição", "Unidade", "Quantidade", "Preço Unit. (€)", "Total (€)", "Artigos WBS"],
  ];

  for (const material of materials) {
    rows.push([
      material.code,
      material.description,
      material.unit,
      parseFloat(material.totalQuantity.toFixed(2)),
      parseFloat(material.unitCost.toFixed(2)),
      parseFloat(material.totalCost.toFixed(2)),
      material.usedInArticles.join(", "),
    ]);
  }

  // Add total row
  const totalCost = materials.reduce((sum, m) => sum + m.totalCost, 0);
  rows.push(
    [""],
    ["", "", "", "", "TOTAL:", totalCost, ""]
  );

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  sheet['!cols'] = [
    { wch: 15 },  // Code
    { wch: 50 },  // Description
    { wch: 8 },   // Unit
    { wch: 12 },  // Quantity
    { wch: 12 },  // Unit Price
    { wch: 12 },  // Total
    { wch: 20 },  // WBS Articles
  ];

  return sheet;
}

// ============================================================
// Sheet 3: Labor (Mão de Obra)
// ============================================================

function buildLaborSheet(labor: LaborResource[]): XLSX.WorkSheet {
  const rows: any[][] = [
    ["MÃO DE OBRA"],
    [""],
    ["Especialidade", "Horas Totais", "Taxa Horária (€/h)", "Custo Total (€)", "Pico Trabalhadores"],
  ];

  for (const l of labor) {
    rows.push([
      l.trade,
      parseFloat(l.totalHours.toFixed(1)),
      parseFloat(l.hourlyRate.toFixed(2)),
      parseFloat(l.totalCost.toFixed(2)),
      l.peakConcurrentWorkers,
    ]);
  }

  // Add total row
  const totalHours = labor.reduce((sum, l) => sum + l.totalHours, 0);
  const totalCost = labor.reduce((sum, l) => sum + l.totalCost, 0);
  rows.push(
    [""],
    ["TOTAL", totalHours.toFixed(1) + " h", "", totalCost.toFixed(2), ""]
  );

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  sheet['!cols'] = [
    { wch: 30 },  // Trade
    { wch: 12 },  // Total Hours
    { wch: 15 },  // Hourly Rate
    { wch: 15 },  // Total Cost
    { wch: 18 },  // Peak Workers
  ];

  return sheet;
}

// ============================================================
// Sheet 4: Equipment (Equipamentos)
// ============================================================

function buildEquipmentSheet(equipment: EquipmentResource[]): XLSX.WorkSheet {
  const rows: any[][] = [
    ["EQUIPAMENTOS"],
    [""],
    ["Código CYPE", "Descrição", "Unidade", "Quantidade", "Preço Unit. (€)", "Total (€)"],
  ];

  for (const eq of equipment) {
    rows.push([
      eq.code,
      eq.description,
      eq.unit,
      parseFloat(eq.totalQuantity.toFixed(2)),
      parseFloat(eq.unitCost.toFixed(2)),
      parseFloat(eq.totalCost.toFixed(2)),
    ]);
  }

  // Add total row
  const totalCost = equipment.reduce((sum, e) => sum + e.totalCost, 0);
  rows.push(
    [""],
    ["", "", "", "", "TOTAL:", totalCost.toFixed(2)]
  );

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  sheet['!cols'] = [
    { wch: 15 },  // Code
    { wch: 50 },  // Description
    { wch: 8 },   // Unit
    { wch: 12 },  // Quantity
    { wch: 12 },  // Unit Price
    { wch: 12 },  // Total
  ];

  return sheet;
}

// ============================================================
// Sheet 5: Cashflow (Fluxo de Caixa)
// ============================================================

function buildCashflowSheet(
  schedule: ProjectSchedule,
  resources: ProjectResources,
  cashFlow?: CashFlowResult,
): XLSX.WorkSheet {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];

  if (cashFlow && cashFlow.periods.length > 0) {
    // ── Enhanced: use pre-computed CashFlowResult ──
    rows.push(
      ["FLUXO DE CAIXA E CURVA S"],
      [""],
      ["Mês", "Fase Dominante", "Materiais (€)", "Mão de Obra (€)", "Equipamentos (€)", "Total Mês (€)", "Acumulado (€)", "% Acumulado", "Marco"],
    );

    let accumulated = 0;
    for (const period of cashFlow.periods) {
      accumulated += period.total;
      const pct = cashFlow.totalCost > 0
        ? parseFloat(((accumulated / cashFlow.totalCost) * 100).toFixed(1))
        : 0;

      const milestone = cashFlow.milestones.find((m) => m.periodKey === period.key);

      rows.push([
        period.label,
        period.dominantPhase,
        parseFloat(period.materials.toFixed(2)),
        parseFloat(period.labor.toFixed(2)),
        parseFloat(period.equipment.toFixed(2)),
        parseFloat(period.total.toFixed(2)),
        parseFloat(accumulated.toFixed(2)),
        pct,
        milestone ? milestone.label : "",
      ]);
    }

    // Working capital section
    rows.push(
      [""],
      ["CAPITAL DE GIRO"],
      ["Exposição máxima", formatCost(cashFlow.workingCapital.maxExposure)],
      ["Mês de pico", cashFlow.workingCapital.peakMonth],
      ["Gasto mensal médio", formatCost(cashFlow.workingCapital.averageMonthlyBurn)],
      ["Gasto mensal máximo", formatCost(cashFlow.workingCapital.peakMonthlySpend)],
      ["Contingência", `${cashFlow.contingency.percent}% — ${cashFlow.contingency.rationale}`],
      ["Capital recomendado", formatCost(cashFlow.workingCapital.recommendedWorkingCapital)],
    );

    // Milestones section
    rows.push(
      [""],
      ["MARCOS DE PAGAMENTO"],
      ["#", "Data", "% Acumulado", "Valor (€)", "Descrição"],
    );

    for (const m of cashFlow.milestones) {
      rows.push([
        m.number,
        m.date,
        parseFloat(m.cumulativePercent.toFixed(1)),
        parseFloat(m.amount.toFixed(2)),
        m.label,
      ]);
    }
  } else {
    // ── Fallback: naive grouping by start month ──
    rows.push(
      ["FLUXO DE CAIXA"],
      [""],
      ["Mês", "Fase Dominante", "Materiais (€)", "Mão de Obra (€)", "Equipamentos (€)", "Total Mês (€)", "Acumulado (€)"],
    );

    const monthlyData = new Map<string, { materials: number; labor: number; equipment: number; phase: string }>();

    for (const task of schedule.tasks) {
      const startDate = new Date(task.startDate);
      const month = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData.has(month)) {
        monthlyData.set(month, { materials: 0, labor: 0, equipment: 0, phase: task.phase || "Geral" });
      }

      const data = monthlyData.get(month)!;
      for (const resource of task.resources) {
        const cost = resource.type === "labor"
          ? resource.rate * resource.hours
          : resource.rate * resource.units;

        if (resource.type === "material") data.materials += cost;
        else if (resource.type === "labor" || resource.type === "subcontractor") data.labor += cost;
        else if (resource.type === "machinery") data.equipment += cost;
      }
    }

    let accumulated = 0;
    const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [month, costs] of sortedMonths) {
      const total = costs.materials + costs.labor + costs.equipment;
      accumulated += total;
      rows.push([
        month, costs.phase,
        parseFloat(costs.materials.toFixed(2)),
        parseFloat(costs.labor.toFixed(2)),
        parseFloat(costs.equipment.toFixed(2)),
        parseFloat(total.toFixed(2)),
        parseFloat(accumulated.toFixed(2)),
      ]);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  sheet['!cols'] = [
    { wch: 12 },  // Month/label
    { wch: 30 },  // Phase/description
    { wch: 15 },  // Materials
    { wch: 15 },  // Labor
    { wch: 15 },  // Equipment
    { wch: 15 },  // Total Month
    { wch: 15 },  // Accumulated
    { wch: 12 },  // % Accumulated
    { wch: 35 },  // Milestone
  ];

  return sheet;
}

// ============================================================
// Sheet 6: By Phase (Por Fase)
// ============================================================

function buildPhaseSheet(
  schedule: ProjectSchedule,
  resources: ProjectResources
): XLSX.WorkSheet {
  // Group tasks by phase
  const phaseData = new Map<string, { duration: number; cost: number; startDate: Date; endDate: Date }>();

  for (const task of schedule.tasks) {
    const phase = task.phase || "Geral";
    const taskStartDate = new Date(task.startDate);
    const taskEndDate = new Date(task.finishDate);

    if (!phaseData.has(phase)) {
      phaseData.set(phase, {
        duration: 0,
        cost: 0,
        startDate: taskStartDate,
        endDate: taskEndDate,
      });
    }

    const data = phaseData.get(phase)!;
    data.duration += task.durationDays;
    data.cost += task.resources.reduce((sum, r) => {
      const cost = r.type === "labor" ? r.rate * r.hours : r.rate * r.units;
      return sum + cost;
    }, 0);

    // Update date range
    if (taskStartDate < data.startDate) data.startDate = taskStartDate;
    if (taskEndDate > data.endDate) data.endDate = taskEndDate;
  }

  // Build sheet rows
  const rows: any[][] = [
    ["CUSTOS POR FASE"],
    [""],
    ["Fase", "Duração (dias)", "Data Início", "Data Fim", "Custo (€)", "% do Total"],
  ];

  const totalCost = resources.grandTotal;

  for (const [phase, data] of phaseData.entries()) {
    rows.push([
      phase,
      data.duration,
      data.startDate.toLocaleDateString('pt-PT'),
      data.endDate.toLocaleDateString('pt-PT'),
      parseFloat(data.cost.toFixed(2)),
      ((data.cost / totalCost) * 100).toFixed(1) + "%",
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  sheet['!cols'] = [
    { wch: 40 },  // Phase
    { wch: 15 },  // Duration
    { wch: 12 },  // Start Date
    { wch: 12 },  // End Date
    { wch: 15 },  // Cost
    { wch: 12 },  // Percentage
  ];

  return sheet;
}

// ============================================================
// Main Export Function
// ============================================================

/**
 * Generate a complete multi-sheet Excel budget file.
 *
 * @param project - WBS project structure
 * @param schedule - Generated project schedule
 * @param resources - Aggregated project resources
 * @param options - Export options (project info, VAT, etc.)
 * @returns Buffer containing the Excel file
 */
export function generateBudgetExcel(
  project: WbsProject,
  schedule: ProjectSchedule,
  resources: ProjectResources,
  options: BudgetExportOptions = {},
  cashFlow?: CashFlowResult,
  reconciledBoq?: ReconciledBoq,
): Buffer {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summarySheet = buildSummarySheet(project, resources, options);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");

  // Sheet 2: Materials
  const materialsSheet = buildMaterialsSheet(resources.materials);
  XLSX.utils.book_append_sheet(workbook, materialsSheet, "Materiais");

  // Sheet 3: Labor
  const laborSheet = buildLaborSheet(resources.labor);
  XLSX.utils.book_append_sheet(workbook, laborSheet, "Mão de Obra");

  // Sheet 4: Equipment
  const equipmentSheet = buildEquipmentSheet(resources.equipment);
  XLSX.utils.book_append_sheet(workbook, equipmentSheet, "Equipamentos");

  // Sheet 5: Cashflow
  const cashflowSheet = buildCashflowSheet(schedule, resources, cashFlow);
  XLSX.utils.book_append_sheet(workbook, cashflowSheet, "Fluxo de Caixa");

  // Sheet 6: By Phase
  const phaseSheet = buildPhaseSheet(schedule, resources);
  XLSX.utils.book_append_sheet(workbook, phaseSheet, "Por Fase");

  // Sheet 7: IFC Additions (if reconciliation was performed)
  if (reconciledBoq && reconciledBoq.additionArticles.length > 0) {
    const additionsSheet = buildAdditionsSheet(reconciledBoq);
    XLSX.utils.book_append_sheet(workbook, additionsSheet, "Adições IFC");
  }

  // Generate buffer
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Download budget Excel file (browser-side).
 */
// ============================================================
// Sheet 7: IFC Additions (Adições IFC)
// ============================================================

function buildAdditionsSheet(reconciledBoq: ReconciledBoq): XLSX.WorkSheet {
  const { additionArticles, executionArticles, stats } = reconciledBoq;

  const rows: unknown[][] = [
    ["ADIÇÕES IDENTIFICADAS NO MODELO IFC"],
    [""],
    ["Resumo da Reconciliação"],
    ["Artigos de execução:", stats.totalExecution],
    ["Confirmados pelo IFC:", stats.corroboratedByIfc],
    ["Com desvio de quantidade:", stats.withQuantityDelta],
    ["Adições IFC:", stats.totalAdditions],
    ["Custo execução:", stats.executionCost],
    ["Custo estimado adições:", stats.additionCost],
    ["Confiança média:", `${stats.avgConfidence}%`],
    [""],
    ["ARTIGOS ADICIONAIS (encontrados no IFC, ausentes no mapa de quantidades)"],
    [""],
    ["Código", "Descrição", "Unidade", "Quantidade IFC", "Código CYPE", "Custo Unitário (€)", "Custo Estimado (€)", "Elementos IFC", "Observação"],
  ];

  for (const art of additionArticles) {
    rows.push([
      art.articleCode,
      art.description,
      art.unit,
      art.ifcQuantity,
      art.cypeCode ?? "",
      art.cypeCost ?? "",
      art.estimatedCost ?? "",
      art.ifcElementIds.length,
      art.additionReason,
    ]);
  }

  // Add total row
  const totalEstimated = additionArticles.reduce(
    (sum, a) => sum + (a.estimatedCost ?? 0),
    0,
  );
  rows.push(
    [""],
    ["", "", "", "", "", "TOTAL", totalEstimated, "", ""],
  );

  // Add reconciled execution articles with IFC comparison
  rows.push(
    [""],
    [""],
    ["ARTIGOS DE EXECUÇÃO COM COMPARAÇÃO IFC"],
    [""],
    ["Código", "Descrição (Original)", "Unidade", "Qtd. Execução", "Qtd. IFC", "Delta", "Confiança", "Método", "Código CYPE"],
  );

  for (const art of executionArticles) {
    if (!art.ifcCorroborated) continue;
    rows.push([
      art.articleCode,
      art.originalDescription,
      art.unit,
      art.executionQuantity,
      art.ifcQuantity ?? "",
      art.quantityDelta ?? "",
      `${art.matchConfidence}%`,
      art.matchMethod,
      art.cypeCode ?? "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 12 }, // Code
    { wch: 50 }, // Description
    { wch: 8 },  // Unit
    { wch: 14 }, // Qty IFC
    { wch: 12 }, // CYPE code
    { wch: 14 }, // Unit cost
    { wch: 14 }, // Estimated cost
    { wch: 12 }, // Elements
    { wch: 50 }, // Observation
  ];

  return ws;
}

export function downloadBudgetExcel(
  project: WbsProject,
  schedule: ProjectSchedule,
  resources: ProjectResources,
  options: BudgetExportOptions = {},
  cashFlow?: CashFlowResult,
): void {
  const buffer = generateBudgetExcel(project, schedule, resources, options, cashFlow);
  // Convert Buffer to Uint8Array for browser compatibility
  const uint8Array = new Uint8Array(buffer);
  const blob = new Blob([uint8Array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);

  const projectName = options.projectName || project.name || "projeto";
  const filename = `orcamento_${projectName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

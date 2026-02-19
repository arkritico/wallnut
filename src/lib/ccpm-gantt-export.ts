/**
 * CCPM Gantt Chart Excel Export
 *
 * Generates a beautifully styled multi-sheet Excel workbook implementing
 * Goldratt's Critical Chain Project Management (CCPM) methodology.
 * Uses ExcelJS for full cell styling support (fills, fonts, borders, merged cells).
 *
 * Sheets:
 * 1. Gantt CCPM — Visual Gantt chart with critical chain bars and buffers
 * 2. Fever Chart — Buffer management dashboard (10×10 zone grid)
 * 3. Detalhe WBS — Full task list with CCPM annotations
 * 4. Carga Recursos — Resource load heatmap by trade × month
 * 5. Dashboard — CCPM project health KPIs
 *
 * Styled to match Wallnut Design+Build's dark minimalist luxury aesthetic.
 */

import ExcelJS from "exceljs";
import type {
  ProjectSchedule,
  ScheduleTask,
  CriticalChainData,
  CriticalChainBuffer,
  ConstructionPhase,
} from "./wbs-types";
import type { ProjectResources } from "./resource-aggregator";
import type { CashFlowResult } from "./cashflow";
import { phaseLabel } from "./phase-colors";

// ============================================================
// Design Tokens (Wallnut Brand)
// ============================================================

const C = {
  headerBg: "FF202A30",
  headerText: "FFFFFFFF",
  accent: "FF4D65FF",
  bodyText: "FF202A30",
  muted: "FF6B7280",
  sectionBg: "FFF9FAFB",
  border: "FFE5E7EB",
  summaryBg: "FFF3F4F6",
  criticalBar: "FF202A30",
  nonCriticalBar: "FF4D65FF",
  projectBuffer: "FF10B981",
  feedingBuffer: "FF3B82F6",
  zoneGreen: "FF10B981",
  zoneAmber: "FFD97706",
  zoneRed: "FFDC2626",
  todayBg: "FFEEF0FF",
  white: "FFFFFFFF",
  heatLight: "FFE8ECFF",
  heatMedium: "FFB3BFFF",
  heatDark: "FF4D65FF",
} as const;

const FONT = "Calibri";

// ============================================================
// Types
// ============================================================

export interface CcpmGanttExportOptions {
  projectName?: string;
  projectLocation?: string;
  /** Time scale: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'auto' */
  timeScale?: "daily" | "weekly" | "biweekly" | "monthly" | "auto";
  showToday?: boolean;
}

interface TimeColumn {
  start: Date;
  end: Date;
  label: string;
  monthLabel: string;
}

interface GanttRow {
  type: "task" | "buffer";
  task?: ScheduleTask;
  buffer?: CriticalChainBuffer;
  isCritical?: boolean;
}

// ============================================================
// Shared Utilities
// ============================================================

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = {
    style: "thin",
    color: { argb: C.border },
  };
  return { top: side, bottom: side, left: side, right: side };
}

function headerFill(): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: C.headerBg } };
}

function headerFont(
  size = 10,
  bold = true,
): Partial<ExcelJS.Font> {
  return { name: FONT, size, bold, color: { argb: C.headerText } };
}

function bodyFont(size = 10, bold = false): Partial<ExcelJS.Font> {
  return { name: FONT, size, bold, color: { argb: C.bodyText } };
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function applyHeaderRow(
  row: ExcelJS.Row,
  colCount: number,
): void {
  row.height = 26;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = headerFill();
    cell.font = headerFont();
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder();
  }
}

function sectionTitle(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  text: string,
  colSpan: number,
): void {
  sheet.mergeCells(rowNum, 1, rowNum, colSpan);
  const cell = sheet.getCell(rowNum, 1);
  cell.value = text;
  cell.font = headerFont(13);
  cell.fill = headerFill();
  cell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(rowNum).height = 30;
}

/** Project date range including buffers */
function dateRange(schedule: ProjectSchedule): {
  start: Date;
  finish: Date;
  totalDays: number;
} {
  const start = new Date(schedule.startDate);
  let finish = new Date(schedule.finishDate);

  if (schedule.criticalChain) {
    const pb = new Date(schedule.criticalChain.projectBuffer.finishDate);
    if (pb > finish) finish = pb;
    for (const fb of schedule.criticalChain.feedingBuffers) {
      const fbEnd = new Date(fb.finishDate);
      if (fbEnd > finish) finish = fbEnd;
    }
  }

  const totalDays = Math.ceil(
    (finish.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return { start, finish, totalDays };
}

/** Auto-select time scale based on project duration */
function resolveScale(
  totalDays: number,
  override?: string,
): "daily" | "weekly" | "biweekly" | "monthly" {
  if (override && override !== "auto")
    return override as "daily" | "weekly" | "biweekly" | "monthly";
  if (totalDays <= 60) return "daily";
  if (totalDays <= 180) return "weekly";
  if (totalDays <= 365) return "biweekly";
  return "monthly";
}

/** Generate time column definitions */
function generateTimeColumns(
  start: Date,
  finish: Date,
  scale: "daily" | "weekly" | "biweekly" | "monthly",
): TimeColumn[] {
  const cols: TimeColumn[] = [];
  const ptMonths = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];

  if (scale === "daily") {
    const d = new Date(start);
    while (d <= finish) {
      // Skip weekends
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        const end = new Date(d);
        end.setHours(23, 59, 59);
        cols.push({
          start: new Date(d),
          end,
          label: `${d.getDate()}`,
          monthLabel: `${ptMonths[d.getMonth()]} ${d.getFullYear()}`,
        });
      }
      d.setDate(d.getDate() + 1);
    }
  } else if (scale === "weekly" || scale === "biweekly") {
    const weeks = scale === "biweekly" ? 2 : 1;
    // Start at Monday on or before start date
    const d = new Date(start);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));

    let weekNum = 1;
    while (d <= finish) {
      const end = new Date(d);
      end.setDate(end.getDate() + weeks * 7 - 1);
      end.setHours(23, 59, 59);
      cols.push({
        start: new Date(d),
        end,
        label: `S${weekNum}`,
        monthLabel: `${ptMonths[d.getMonth()]} ${d.getFullYear()}`,
      });
      d.setDate(d.getDate() + weeks * 7);
      weekNum++;
    }
  } else {
    // Monthly
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    while (d <= finish) {
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      cols.push({
        start: new Date(d),
        end,
        label: ptMonths[d.getMonth()],
        monthLabel: `${d.getFullYear()}`,
      });
      d.setMonth(d.getMonth() + 1);
    }
  }

  return cols;
}

/** Format date as DD/MM/YYYY */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Format cost as €X,XXX.XX */
function fmtCost(n: number): string {
  return n.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
}

/** Get zone color ARGB for a buffer zone */
function zoneColor(zone: "green" | "yellow" | "red"): string {
  return zone === "green" ? C.zoneGreen : zone === "yellow" ? C.zoneAmber : C.zoneRed;
}

// ============================================================
// Sheet 1: CCPM Gantt
// ============================================================

function buildGanttSheet(
  wb: ExcelJS.Workbook,
  schedule: ProjectSchedule,
  opts: Required<CcpmGanttExportOptions>,
): void {
  const { start, finish, totalDays } = dateRange(schedule);
  const scale = resolveScale(totalDays, opts.timeScale);
  const timeCols = generateTimeColumns(start, finish, scale);
  const LEFT_COLS = 8;
  const totalColumns = LEFT_COLS + timeCols.length;

  const sheet = wb.addWorksheet("Gantt CCPM", {
    views: [{ state: "frozen", xSplit: LEFT_COLS, ySplit: 3 }],
    pageSetup: {
      paperSize: 8 as ExcelJS.PaperSize, // A3 (valid OOXML value, missing from ExcelJS enum)
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  // Row 1: Title
  sectionTitle(
    sheet, 1,
    `  CRONOGRAMA CCPM — ${opts.projectName || schedule.projectName}`,
    totalColumns,
  );

  // Row 2: Month/year header groups
  let curMonth = "";
  let mergeStart = LEFT_COLS + 1;
  for (let i = 0; i < timeCols.length; i++) {
    const col = LEFT_COLS + 1 + i;
    const ml = timeCols[i].monthLabel;
    if (ml !== curMonth) {
      if (curMonth !== "" && col - 1 >= mergeStart) {
        if (col - 1 > mergeStart) {
          sheet.mergeCells(2, mergeStart, 2, col - 1);
        }
        sheet.getCell(2, mergeStart).value = curMonth;
      }
      curMonth = ml;
      mergeStart = col;
    }
    if (i === timeCols.length - 1) {
      if (col > mergeStart) {
        sheet.mergeCells(2, mergeStart, 2, col);
      }
      sheet.getCell(2, mergeStart).value = curMonth;
    }
  }
  // Left side of row 2
  sheet.mergeCells(2, 1, 2, LEFT_COLS);
  sheet.getCell(2, 1).value = "";
  applyHeaderRow(sheet.getRow(2), totalColumns);

  // Row 3: Column headers
  const taskHeaders = [
    "WBS", "Tarefa", "Dur.(d)", "Início", "Fim",
    "Predecessores", "Recursos", "Custo (€)",
  ];
  for (let c = 0; c < taskHeaders.length; c++) {
    sheet.getCell(3, c + 1).value = taskHeaders[c];
  }
  for (let i = 0; i < timeCols.length; i++) {
    sheet.getCell(3, LEFT_COLS + 1 + i).value = timeCols[i].label;
  }
  applyHeaderRow(sheet.getRow(3), totalColumns);

  // Build item list (tasks + buffers)
  const cc = schedule.criticalChain;
  const criticalUids = new Set(cc?.chainTaskUids ?? schedule.criticalPath);

  const items: GanttRow[] = schedule.tasks.map((task) => ({
    type: "task" as const,
    task,
    isCritical: criticalUids.has(task.uid),
  }));

  if (cc) {
    items.push({ type: "buffer", buffer: cc.projectBuffer });
    for (const fb of cc.feedingBuffers) {
      items.push({ type: "buffer", buffer: fb });
    }
  }

  // Data rows
  let rowNum = 4;
  for (const item of items) {
    const row = sheet.getRow(rowNum);
    row.height = 20;

    if (item.type === "task" && item.task) {
      const t = item.task;

      // Left columns
      row.getCell(1).value = t.wbs;
      row.getCell(1).font = bodyFont(9);
      row.getCell(2).value = t.name;
      row.getCell(2).font = bodyFont(10, t.isSummary);
      row.getCell(2).alignment = {
        indent: Math.max(0, (t.outlineLevel - 1) * 2),
        vertical: "middle",
      };
      row.getCell(3).value = t.durationDays;
      row.getCell(4).value = fmtDate(t.startDate);
      row.getCell(5).value = fmtDate(t.finishDate);
      row.getCell(6).value = t.predecessors
        .map((p) => `${p.uid}${p.type}${p.lag ? `+${p.lag}d` : ""}`)
        .join(", ");
      row.getCell(6).font = bodyFont(8);
      row.getCell(7).value = t.resources
        .filter((r) => r.type === "labor" || r.type === "subcontractor")
        .map((r) => r.name)
        .slice(0, 3)
        .join(", ");
      row.getCell(7).font = bodyFont(8);
      row.getCell(8).value = t.cost;
      row.getCell(8).numFmt = '#,##0.00" €"';

      // Summary row styling
      if (t.isSummary) {
        for (let c = 1; c <= LEFT_COLS; c++) {
          row.getCell(c).fill = fill(C.summaryBg);
          row.getCell(c).font = bodyFont(10, true);
        }
      }

      // Gantt bars
      const ts = new Date(t.startDate);
      const tf = new Date(t.finishDate);
      const barColor = t.isSummary ? C.muted : item.isCritical ? C.criticalBar : C.nonCriticalBar;

      for (let i = 0; i < timeCols.length; i++) {
        const col = LEFT_COLS + 1 + i;
        if (ts <= timeCols[i].end && tf >= timeCols[i].start) {
          row.getCell(col).fill = fill(barColor);
        }
        row.getCell(col).border = thinBorder();
      }
    } else if (item.buffer) {
      const b = item.buffer;
      row.getCell(1).value = "";
      row.getCell(2).value = `  ▸ ${b.name}`;
      row.getCell(2).font = { name: FONT, size: 10, italic: true, color: { argb: C.bodyText } };
      row.getCell(3).value = b.durationDays;
      row.getCell(4).value = fmtDate(b.startDate);
      row.getCell(5).value = fmtDate(b.finishDate);
      row.getCell(6).value = "";
      row.getCell(7).value = `${b.consumedPercent.toFixed(0)}% consumido`;
      row.getCell(7).font = bodyFont(8);
      row.getCell(8).value = "";

      // Zone-colored left indicator
      const zc = zoneColor(b.zone);
      row.getCell(1).fill = fill(zc);

      const bufColor = b.type === "project" ? C.projectBuffer : C.feedingBuffer;
      const bs = new Date(b.startDate);
      const bf = new Date(b.finishDate);

      for (let i = 0; i < timeCols.length; i++) {
        const col = LEFT_COLS + 1 + i;
        if (bs <= timeCols[i].end && bf >= timeCols[i].start) {
          row.getCell(col).fill = fill(bufColor);
        }
        row.getCell(col).border = thinBorder();
      }
    }

    // Left column borders
    for (let c = 1; c <= LEFT_COLS; c++) {
      row.getCell(c).border = thinBorder();
      if (!row.getCell(c).font) row.getCell(c).font = bodyFont();
    }

    rowNum++;
  }

  // Today marker
  if (opts.showToday) {
    const today = new Date();
    for (let i = 0; i < timeCols.length; i++) {
      if (today >= timeCols[i].start && today <= timeCols[i].end) {
        const col = LEFT_COLS + 1 + i;
        for (let r = 4; r < rowNum; r++) {
          const cell = sheet.getCell(r, col);
          const currentFill = cell.fill as ExcelJS.FillPattern | undefined;
          if (!currentFill || !currentFill.fgColor?.argb || currentFill.fgColor.argb === C.border) {
            cell.fill = fill(C.todayBg);
          }
        }
        sheet.getCell(3, col).font = {
          name: FONT, size: 10, bold: true,
          color: { argb: C.accent },
        };
        break;
      }
    }
  }

  // Legend
  const legendRow = rowNum + 2;
  sheet.getCell(legendRow, 2).value = "Legenda:";
  sheet.getCell(legendRow, 2).font = bodyFont(9, true);
  const legends: { col: number; label: string; color: string; textWhite: boolean }[] = [
    { col: 3, label: "Cadeia Crítica", color: C.criticalBar, textWhite: true },
    { col: 4, label: "Não Crítica", color: C.nonCriticalBar, textWhite: true },
    { col: 5, label: "Buffer Projeto", color: C.projectBuffer, textWhite: true },
    { col: 6, label: "Buffer Alimentação", color: C.feedingBuffer, textWhite: true },
  ];
  for (const leg of legends) {
    const cell = sheet.getCell(legendRow, leg.col);
    cell.value = leg.label;
    cell.fill = fill(leg.color);
    cell.font = { name: FONT, size: 8, bold: true, color: { argb: leg.textWhite ? C.white : C.bodyText } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
  }

  // Column widths
  sheet.getColumn(1).width = 10;
  sheet.getColumn(2).width = 38;
  sheet.getColumn(3).width = 8;
  sheet.getColumn(4).width = 11;
  sheet.getColumn(5).width = 11;
  sheet.getColumn(6).width = 13;
  sheet.getColumn(7).width = 20;
  sheet.getColumn(8).width = 12;
  const colW = scale === "daily" ? 3 : scale === "weekly" ? 4.5 : scale === "biweekly" ? 6 : 9;
  for (let i = LEFT_COLS + 1; i <= LEFT_COLS + timeCols.length; i++) {
    sheet.getColumn(i).width = colW;
  }

  // Header/footer
  sheet.headerFooter.oddHeader =
    '&L&"Calibri,Bold"&10Wallnut Design+Build&R&D';
  sheet.headerFooter.oddFooter =
    '&L&"Calibri"&8Cronograma CCPM (Goldratt)&R&P/&N';
}

// ============================================================
// Sheet 2: Fever Chart
// ============================================================

function buildFeverChartSheet(
  wb: ExcelJS.Workbook,
  schedule: ProjectSchedule,
): void {
  const sheet = wb.addWorksheet("Fever Chart");
  const cc = schedule.criticalChain;

  if (!cc) {
    sectionTitle(sheet, 1, "  FEVER CHART — GESTÃO DE BUFFERS", 10);
    sheet.getCell(3, 1).value = "Dados CCPM não disponíveis para este projeto.";
    sheet.getCell(3, 1).font = bodyFont(11);
    return;
  }

  sectionTitle(sheet, 1, "  FEVER CHART — GESTÃO DE BUFFERS", 14);

  // KPI section (rows 3-8)
  const kpis: [string, string, string?][] = [
    ["Buffer de Projeto", `${cc.projectBuffer.durationDays} dias`, cc.projectBuffer.zone],
    ["Consumo do Buffer", `${cc.projectBuffer.consumedPercent.toFixed(0)}%`, cc.projectBuffer.zone],
    ["Feeding Buffers", `${cc.feedingBuffers.length}`],
    ["Duração Original", `${cc.originalDurationDays} dias`],
    ["Duração Agressiva", `${cc.aggressiveDurationDays} dias (-${cc.safetyReductionPercent}%)`],
    ["Duração CCPM", `${cc.ccpmDurationDays} dias`],
    ["Rácio Buffer", `${(cc.bufferRatio * 100).toFixed(0)}%`],
  ];

  for (let i = 0; i < kpis.length; i++) {
    const r = 3 + i;
    sheet.getCell(r, 2).value = kpis[i][0];
    sheet.getCell(r, 2).font = bodyFont(10, true);
    sheet.getCell(r, 3).value = kpis[i][1];
    sheet.getCell(r, 3).font = bodyFont(10);
    if (kpis[i][2]) {
      sheet.getCell(r, 4).fill = fill(zoneColor(kpis[i][2] as "green" | "yellow" | "red"));
      sheet.getCell(r, 4).border = thinBorder();
    }
  }

  // 10×10 Fever Chart Grid
  const GRID_SIZE = 10;
  const GRID_ROW = 12;
  const GRID_COL = 3;

  // Title
  sheet.getCell(11, 2).value = "% Buffer Consumido ↑";
  sheet.getCell(11, 2).font = bodyFont(9, true);

  // Y-axis labels
  for (let r = 0; r < GRID_SIZE; r++) {
    const pct = (GRID_SIZE - r) * 10;
    sheet.getCell(GRID_ROW + r, GRID_COL - 1).value = `${pct}%`;
    sheet.getCell(GRID_ROW + r, GRID_COL - 1).font = bodyFont(8);
    sheet.getCell(GRID_ROW + r, GRID_COL - 1).alignment = { horizontal: "right", vertical: "middle" };
  }
  // X-axis labels
  for (let c = 0; c < GRID_SIZE; c++) {
    const pct = (c + 1) * 10;
    sheet.getCell(GRID_ROW + GRID_SIZE, GRID_COL + c).value = `${pct}%`;
    sheet.getCell(GRID_ROW + GRID_SIZE, GRID_COL + c).font = bodyFont(8);
    sheet.getCell(GRID_ROW + GRID_SIZE, GRID_COL + c).alignment = { horizontal: "center" };
  }
  sheet.getCell(GRID_ROW + GRID_SIZE + 1, GRID_COL + 4).value = "% Cadeia Completa →";
  sheet.getCell(GRID_ROW + GRID_SIZE + 1, GRID_COL + 4).font = bodyFont(9, true);

  // Grid cells
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const bufConsumed = (GRID_SIZE - r) * 10;
      const chainComplete = (c + 1) * 10;
      const ratio = chainComplete > 0 ? bufConsumed / chainComplete : 99;
      let zc: string;
      if (ratio <= 1 / 3) zc = C.zoneGreen;
      else if (ratio <= 2 / 3) zc = C.zoneAmber;
      else zc = C.zoneRed;

      const cell = sheet.getCell(GRID_ROW + r, GRID_COL + c);
      cell.fill = fill(zc);
      cell.border = thinBorder();
    }
    sheet.getRow(GRID_ROW + r).height = 22;
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    sheet.getColumn(GRID_COL + c).width = 7;
  }

  // Plot buffer positions
  const allBuffers = [cc.projectBuffer, ...cc.feedingBuffers];
  for (let b = 0; b < allBuffers.length; b++) {
    const buf = allBuffers[b];
    // Calculate chain complete %
    const chainTasks = schedule.tasks.filter((t) =>
      buf.feedingChain.includes(t.uid),
    );
    const totalDur = chainTasks.reduce((s, t) => s + t.durationDays, 0);
    const completeDur = chainTasks.reduce(
      (s, t) => s + t.durationDays * (t.percentComplete / 100),
      0,
    );
    const chainPct = totalDur > 0 ? (completeDur / totalDur) * 100 : 0;

    const gc = Math.min(GRID_SIZE - 1, Math.floor(chainPct / 10));
    const gr = Math.min(
      GRID_SIZE - 1,
      GRID_SIZE - 1 - Math.floor(buf.consumedPercent / 10),
    );

    const marker = sheet.getCell(GRID_ROW + gr, GRID_COL + gc);
    marker.value = buf.type === "project" ? "PB" : `FB${b}`;
    marker.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
    marker.alignment = { horizontal: "center", vertical: "middle" };
  }

  // Buffer detail table
  const tableRow = GRID_ROW + GRID_SIZE + 4;
  const bHeaders = ["Buffer", "Tipo", "Duração (d)", "% Consumido", "Zona", "Cadeia (tarefas)"];
  for (let c = 0; c < bHeaders.length; c++) {
    sheet.getCell(tableRow, 2 + c).value = bHeaders[c];
  }
  applyHeaderRow(sheet.getRow(tableRow), 7);
  // Clear first col header style
  sheet.getCell(tableRow, 1).fill = fill(C.white);

  for (let b = 0; b < allBuffers.length; b++) {
    const buf = allBuffers[b];
    const r = tableRow + 1 + b;
    sheet.getCell(r, 2).value = buf.name;
    sheet.getCell(r, 2).font = bodyFont(10);
    sheet.getCell(r, 3).value = buf.type === "project" ? "Projeto" : "Alimentação";
    sheet.getCell(r, 3).font = bodyFont(9);
    sheet.getCell(r, 4).value = buf.durationDays;
    sheet.getCell(r, 5).value = `${buf.consumedPercent.toFixed(0)}%`;
    sheet.getCell(r, 6).value = buf.zone === "green" ? "Verde" : buf.zone === "yellow" ? "Amarelo" : "Vermelho";
    sheet.getCell(r, 6).fill = fill(zoneColor(buf.zone));
    sheet.getCell(r, 6).font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
    sheet.getCell(r, 6).alignment = { horizontal: "center" };
    sheet.getCell(r, 7).value = buf.feedingChain.length;
    for (let c = 2; c <= 7; c++) {
      sheet.getCell(r, c).border = thinBorder();
    }
  }

  // Column widths
  sheet.getColumn(1).width = 4;
  sheet.getColumn(2).width = 22;
}

// ============================================================
// Sheet 3: WBS Detail
// ============================================================

function buildWbsDetailSheet(
  wb: ExcelJS.Workbook,
  schedule: ProjectSchedule,
): void {
  const sheet = wb.addWorksheet("Detalhe WBS");
  const cc = schedule.criticalChain;
  const criticalUids = new Set(cc?.chainTaskUids ?? schedule.criticalPath);

  const COLS = 13;
  sectionTitle(sheet, 1, "  DETALHE WBS — TAREFAS DO PROJETO", COLS);

  // Headers (row 3)
  const headers = [
    "WBS", "Tarefa", "Fase", "Dur. Original (d)", "Dur. Agressiva (d)",
    "Proteção Removida", "Início", "Fim", "Predecessores",
    "Recursos", "Custo (€)", "Cadeia Crítica", "Tipo Buffer",
  ];
  for (let c = 0; c < headers.length; c++) {
    sheet.getCell(3, c + 1).value = headers[c];
  }
  applyHeaderRow(sheet.getRow(3), COLS);

  // Data rows
  let rowNum = 4;

  // Tasks
  for (const t of schedule.tasks) {
    const isCritical = criticalUids.has(t.uid);
    const row = sheet.getRow(rowNum);
    row.height = 18;

    row.getCell(1).value = t.wbs;
    row.getCell(1).font = bodyFont(9);
    row.getCell(2).value = t.name;
    row.getCell(2).font = bodyFont(10, t.isSummary);
    row.getCell(2).alignment = { indent: Math.max(0, (t.outlineLevel - 1) * 2) };
    row.getCell(3).value = phaseLabel(t.phase as ConstructionPhase);
    row.getCell(3).font = bodyFont(9);

    // Duration columns: original = aggressive * (1 / (1 - safetyReduction))
    const safetyPct = cc?.safetyReductionPercent ?? 0;
    const aggDur = t.durationDays;
    const origDur = safetyPct > 0 ? Math.round(aggDur / (1 - safetyPct / 100)) : aggDur;
    row.getCell(4).value = origDur;
    row.getCell(5).value = aggDur;
    row.getCell(6).value = safetyPct > 0 ? `${origDur - aggDur}d (${safetyPct}%)` : "—";
    row.getCell(6).font = bodyFont(9);

    row.getCell(7).value = fmtDate(t.startDate);
    row.getCell(8).value = fmtDate(t.finishDate);
    row.getCell(9).value = t.predecessors.map((p) => `${p.uid}${p.type}`).join(", ");
    row.getCell(9).font = bodyFont(8);
    row.getCell(10).value = t.resources
      .filter((r) => r.type === "labor" || r.type === "subcontractor")
      .map((r) => r.name)
      .slice(0, 3)
      .join(", ");
    row.getCell(10).font = bodyFont(8);
    row.getCell(11).value = t.cost;
    row.getCell(11).numFmt = '#,##0.00" €"';
    row.getCell(12).value = isCritical ? "✓" : "";
    row.getCell(12).alignment = { horizontal: "center" };
    if (isCritical) {
      row.getCell(12).font = { name: FONT, size: 10, bold: true, color: { argb: C.criticalBar } };
    }
    row.getCell(13).value = "";

    // Summary row styling
    if (t.isSummary) {
      for (let c = 1; c <= COLS; c++) {
        row.getCell(c).fill = fill(C.summaryBg);
        row.getCell(c).font = bodyFont(10, true);
      }
    }

    // Critical chain left accent
    if (isCritical && !t.isSummary) {
      row.getCell(1).border = {
        ...thinBorder(),
        left: { style: "medium", color: { argb: C.accent } },
      };
    }

    for (let c = 1; c <= COLS; c++) {
      if (!row.getCell(c).border) row.getCell(c).border = thinBorder();
    }

    rowNum++;
  }

  // Buffers
  if (cc) {
    const allBufs = [cc.projectBuffer, ...cc.feedingBuffers];
    for (const buf of allBufs) {
      const row = sheet.getRow(rowNum);
      row.height = 18;
      row.getCell(1).value = "";
      row.getCell(1).fill = fill(
        buf.type === "project" ? C.projectBuffer : C.feedingBuffer,
      );
      row.getCell(2).value = buf.name;
      row.getCell(2).font = { name: FONT, size: 10, italic: true, color: { argb: C.bodyText } };
      row.getCell(3).value = "";
      row.getCell(4).value = "";
      row.getCell(5).value = buf.durationDays;
      row.getCell(6).value = "";
      row.getCell(7).value = fmtDate(buf.startDate);
      row.getCell(8).value = fmtDate(buf.finishDate);
      row.getCell(9).value = "";
      row.getCell(10).value = `${buf.consumedPercent.toFixed(0)}% consumido`;
      row.getCell(10).font = bodyFont(9);
      row.getCell(11).value = "";
      row.getCell(12).value = buf.type === "project" ? "✓" : "";
      row.getCell(12).alignment = { horizontal: "center" };
      row.getCell(13).value = buf.type === "project" ? "Projeto" : "Alimentação";
      row.getCell(13).font = bodyFont(9);
      row.getCell(13).fill = fill(zoneColor(buf.zone));
      row.getCell(13).font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };

      for (let c = 1; c <= COLS; c++) {
        if (!row.getCell(c).border) row.getCell(c).border = thinBorder();
      }
      rowNum++;
    }
  }

  // Column widths
  const widths = [10, 38, 16, 12, 12, 14, 11, 11, 13, 22, 12, 10, 12];
  for (let i = 0; i < widths.length; i++) {
    sheet.getColumn(i + 1).width = widths[i];
  }

  sheet.headerFooter.oddFooter =
    '&L&"Calibri"&8Detalhe WBS — Wallnut&R&P/&N';
}

// ============================================================
// Sheet 4: Resource Load
// ============================================================

function buildResourceLoadSheet(
  wb: ExcelJS.Workbook,
  schedule: ProjectSchedule,
  resources: ProjectResources,
): void {
  const sheet = wb.addWorksheet("Carga Recursos");

  // Build month list
  const { start, finish } = dateRange(schedule);
  const ptMonths = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= finish) {
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${ptMonths[d.getMonth()]} ${d.getFullYear()}`,
      start: new Date(d),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
    });
    d.setMonth(d.getMonth() + 1);
  }

  const trades = resources.labor.map((l) => l.trade);
  const LEFT = 2;
  const totalCols = LEFT + months.length;

  sectionTitle(sheet, 1, "  CARGA DE RECURSOS — PERFIL DE EQUIPA", totalCols);

  // Headers
  sheet.getCell(3, 1).value = "Especialidade";
  sheet.getCell(3, 2).value = "Total (h)";
  for (let m = 0; m < months.length; m++) {
    sheet.getCell(3, LEFT + 1 + m).value = months[m].label;
  }
  applyHeaderRow(sheet.getRow(3), totalCols);

  // Build trade×month matrix
  const matrix: Map<string, number[]> = new Map();
  for (const trade of trades) {
    matrix.set(trade, new Array(months.length).fill(0));
  }

  for (const task of schedule.tasks) {
    if (task.isSummary) continue;
    const ts = new Date(task.startDate);
    const tf = new Date(task.finishDate);
    for (const res of task.resources) {
      if (res.type !== "labor" && res.type !== "subcontractor") continue;
      const tradeName = res.name;
      const arr = matrix.get(tradeName);
      if (!arr) continue;
      for (let m = 0; m < months.length; m++) {
        if (ts <= months[m].end && tf >= months[m].start) {
          arr[m] += res.units;
        }
      }
    }
  }

  // Render matrix
  let rowNum = 4;
  let peakCol = 0;
  let peakVal = 0;

  // Track column totals for peak detection
  const colTotals = new Array(months.length).fill(0);

  for (const trade of trades) {
    const arr = matrix.get(trade)!;
    const row = sheet.getRow(rowNum);
    row.height = 20;
    row.getCell(1).value = trade;
    row.getCell(1).font = bodyFont(10);
    const laborInfo = resources.labor.find((l) => l.trade === trade);
    row.getCell(2).value = laborInfo ? Math.round(laborInfo.totalHours) : 0;
    row.getCell(2).font = bodyFont(9);

    for (let m = 0; m < months.length; m++) {
      const val = Math.round(arr[m]);
      colTotals[m] += val;
      const cell = row.getCell(LEFT + 1 + m);
      cell.value = val || "";
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder();

      // Heatmap coloring
      if (val >= 6) {
        cell.fill = fill(C.heatDark);
        cell.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
      } else if (val >= 3) {
        cell.fill = fill(C.heatMedium);
        cell.font = bodyFont(9);
      } else if (val >= 1) {
        cell.fill = fill(C.heatLight);
        cell.font = bodyFont(9);
      } else {
        cell.font = bodyFont(9);
      }
    }

    for (let c = 1; c <= LEFT; c++) {
      row.getCell(c).border = thinBorder();
    }
    rowNum++;
  }

  // Total row
  const totalRow = sheet.getRow(rowNum);
  totalRow.height = 22;
  totalRow.getCell(1).value = "TOTAL";
  totalRow.getCell(1).font = bodyFont(10, true);
  totalRow.getCell(2).value = Math.round(resources.totalLaborHours);
  totalRow.getCell(2).font = bodyFont(9, true);

  for (let m = 0; m < months.length; m++) {
    const cell = totalRow.getCell(LEFT + 1 + m);
    cell.value = colTotals[m] || "";
    cell.font = bodyFont(9, true);
    cell.alignment = { horizontal: "center" };
    cell.border = thinBorder();
    cell.fill = fill(C.sectionBg);

    if (colTotals[m] > peakVal) {
      peakVal = colTotals[m];
      peakCol = m;
    }
  }
  for (let c = 1; c <= LEFT; c++) {
    totalRow.getCell(c).border = thinBorder();
    totalRow.getCell(c).fill = fill(C.sectionBg);
  }

  // Highlight peak column
  if (peakVal > 0) {
    const pc = LEFT + 1 + peakCol;
    for (let r = 3; r <= rowNum; r++) {
      const cell = sheet.getCell(r, pc);
      cell.border = {
        top: { style: "medium", color: { argb: C.accent } },
        bottom: { style: "medium", color: { argb: C.accent } },
        left: { style: "medium", color: { argb: C.accent } },
        right: { style: "medium", color: { argb: C.accent } },
      };
    }
  }

  // Column widths
  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 10;
  for (let m = 0; m < months.length; m++) {
    sheet.getColumn(LEFT + 1 + m).width = 10;
  }

  // Constraint note
  const noteRow = rowNum + 2;
  sheet.getCell(noteRow, 1).value = "Restrição (TOC):";
  sheet.getCell(noteRow, 1).font = bodyFont(9, true);
  if (peakVal > 0) {
    sheet.getCell(noteRow, 2).value =
      `Pico de ${peakVal} trabalhadores em ${months[peakCol].label}`;
    sheet.getCell(noteRow, 2).font = bodyFont(9);
  }

  sheet.headerFooter.oddFooter =
    '&L&"Calibri"&8Carga Recursos — Wallnut&R&P/&N';
}

// ============================================================
// Sheet 5: Dashboard
// ============================================================

function buildDashboardSheet(
  wb: ExcelJS.Workbook,
  schedule: ProjectSchedule,
  resources: ProjectResources,
  cashFlow: CashFlowResult | undefined,
  opts: Required<CcpmGanttExportOptions>,
): void {
  const sheet = wb.addWorksheet("Dashboard");
  const cc = schedule.criticalChain;

  sectionTitle(sheet, 1, "  WALLNUT — DASHBOARD CCPM", 8);

  // Project info (rows 3-7)
  const info: [string, string][] = [
    ["Projeto", opts.projectName || schedule.projectName],
    ["Localização", opts.projectLocation || "Portugal"],
    ["Data", new Date().toLocaleDateString("pt-PT")],
    ["Início", fmtDate(schedule.startDate)],
    ["Conclusão", fmtDate(schedule.finishDate)],
  ];
  for (let i = 0; i < info.length; i++) {
    sheet.getCell(3 + i, 2).value = info[i][0];
    sheet.getCell(3 + i, 2).font = bodyFont(10, true);
    sheet.getCell(3 + i, 3).value = info[i][1];
    sheet.getCell(3 + i, 3).font = bodyFont(10);
  }

  // Schedule comparison (row 10+)
  sheet.getCell(9, 2).value = "COMPARAÇÃO DE CRONOGRAMA";
  sheet.getCell(9, 2).font = headerFont(11);
  sheet.getCell(9, 2).fill = headerFill();
  sheet.mergeCells(9, 2, 9, 8);
  applyHeaderRow(sheet.getRow(9), 8);
  // Clear col 1
  sheet.getCell(9, 1).fill = fill(C.white);

  const origDays = cc?.originalDurationDays ?? schedule.totalDurationDays;
  const aggDays = cc?.aggressiveDurationDays ?? schedule.totalDurationDays;
  const ccpmDays = cc?.ccpmDurationDays ?? schedule.totalDurationDays;
  const maxDays = Math.max(origDays, aggDays, ccpmDays);

  const barItems: [string, number, string][] = [
    ["Original (com proteção)", origDays, C.muted],
    ["Agressiva (sem proteção)", aggDays, C.nonCriticalBar],
    ["CCPM (agress. + buffer)", ccpmDays, C.criticalBar],
  ];

  const BAR_START = 4;
  const BAR_WIDTH = 4; // columns 4-7 for proportional bars

  for (let i = 0; i < barItems.length; i++) {
    const r = 11 + i;
    sheet.getCell(r, 2).value = barItems[i][0];
    sheet.getCell(r, 2).font = bodyFont(10);
    sheet.getCell(r, 3).value = `${barItems[i][1]}d`;
    sheet.getCell(r, 3).font = bodyFont(10, true);

    // Proportional bar
    const proportion = barItems[i][1] / maxDays;
    const filledCols = Math.max(1, Math.round(proportion * BAR_WIDTH));
    for (let c = 0; c < filledCols; c++) {
      sheet.getCell(r, BAR_START + c).fill = fill(barItems[i][2]);
      sheet.getCell(r, BAR_START + c).border = thinBorder();
    }
    for (let c = filledCols; c < BAR_WIDTH; c++) {
      sheet.getCell(r, BAR_START + c).fill = fill(C.sectionBg);
      sheet.getCell(r, BAR_START + c).border = thinBorder();
    }
  }

  // Buffer status section (row 16+)
  let rowNum = 16;
  sheet.getCell(rowNum, 2).value = "ESTADO DOS BUFFERS";
  sheet.getCell(rowNum, 2).font = headerFont(11);
  sheet.getCell(rowNum, 2).fill = headerFill();
  sheet.mergeCells(rowNum, 2, rowNum, 8);
  applyHeaderRow(sheet.getRow(rowNum), 8);
  sheet.getCell(rowNum, 1).fill = fill(C.white);

  rowNum += 2;
  if (cc) {
    const bHeaders = ["Buffer", "Tipo", "Duração", "Consumo", "Zona"];
    for (let c = 0; c < bHeaders.length; c++) {
      sheet.getCell(rowNum, 2 + c).value = bHeaders[c];
      sheet.getCell(rowNum, 2 + c).font = bodyFont(9, true);
      sheet.getCell(rowNum, 2 + c).fill = fill(C.sectionBg);
      sheet.getCell(rowNum, 2 + c).border = thinBorder();
    }
    rowNum++;

    const allBufs = [cc.projectBuffer, ...cc.feedingBuffers];
    for (const buf of allBufs) {
      sheet.getCell(rowNum, 2).value = buf.name;
      sheet.getCell(rowNum, 2).font = bodyFont(10);
      sheet.getCell(rowNum, 3).value = buf.type === "project" ? "Projeto" : "Alimentação";
      sheet.getCell(rowNum, 3).font = bodyFont(9);
      sheet.getCell(rowNum, 4).value = `${buf.durationDays}d`;
      sheet.getCell(rowNum, 5).value = `${buf.consumedPercent.toFixed(0)}%`;
      sheet.getCell(rowNum, 6).value = buf.zone === "green" ? "Verde" : buf.zone === "yellow" ? "Amarelo" : "Vermelho";
      sheet.getCell(rowNum, 6).fill = fill(zoneColor(buf.zone));
      sheet.getCell(rowNum, 6).font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
      sheet.getCell(rowNum, 6).alignment = { horizontal: "center" };
      for (let c = 2; c <= 6; c++) {
        sheet.getCell(rowNum, c).border = thinBorder();
      }
      rowNum++;
    }
  } else {
    sheet.getCell(rowNum, 2).value = "Dados CCPM não disponíveis.";
    sheet.getCell(rowNum, 2).font = bodyFont(10);
    rowNum++;
  }

  // Cost section
  rowNum += 2;
  sheet.getCell(rowNum, 2).value = "CUSTOS DO PROJETO";
  sheet.getCell(rowNum, 2).font = headerFont(11);
  sheet.getCell(rowNum, 2).fill = headerFill();
  sheet.mergeCells(rowNum, 2, rowNum, 8);
  applyHeaderRow(sheet.getRow(rowNum), 8);
  sheet.getCell(rowNum, 1).fill = fill(C.white);

  rowNum += 2;
  const costs: [string, string][] = [
    ["Custo Total", fmtCost(schedule.totalCost)],
    ["Materiais", fmtCost(resources.totalMaterialCost)],
    ["Mão de Obra", fmtCost(resources.totalLaborCost)],
    ["Equipamentos", fmtCost(resources.totalEquipmentCost)],
  ];
  if (cashFlow) {
    costs.push(
      ["Capital Giro (pico)", fmtCost(cashFlow.workingCapital.maxExposure)],
      ["Gasto Mensal Máx.", fmtCost(cashFlow.workingCapital.peakMonthlySpend)],
    );
  }
  for (const [label, val] of costs) {
    sheet.getCell(rowNum, 2).value = label;
    sheet.getCell(rowNum, 2).font = bodyFont(10);
    sheet.getCell(rowNum, 3).value = val;
    sheet.getCell(rowNum, 3).font = bodyFont(10, true);
    sheet.getCell(rowNum, 2).border = thinBorder();
    sheet.getCell(rowNum, 3).border = thinBorder();
    rowNum++;
  }

  // Team summary
  rowNum += 2;
  sheet.getCell(rowNum, 2).value = "EQUIPA";
  sheet.getCell(rowNum, 2).font = headerFont(11);
  sheet.getCell(rowNum, 2).fill = headerFill();
  sheet.mergeCells(rowNum, 2, rowNum, 8);
  applyHeaderRow(sheet.getRow(rowNum), 8);
  sheet.getCell(rowNum, 1).fill = fill(C.white);

  rowNum += 2;
  const team: [string, string][] = [
    ["Máx. Trabalhadores", `${schedule.teamSummary.maxWorkers}`],
    ["Média Trabalhadores", `${schedule.teamSummary.averageWorkers}`],
    ["Total Homens-Hora", `${schedule.teamSummary.totalManHours.toLocaleString("pt-PT")} h`],
    ["Semana de Pico", schedule.teamSummary.peakWeek],
  ];
  for (const [label, val] of team) {
    sheet.getCell(rowNum, 2).value = label;
    sheet.getCell(rowNum, 2).font = bodyFont(10);
    sheet.getCell(rowNum, 3).value = val;
    sheet.getCell(rowNum, 3).font = bodyFont(10, true);
    sheet.getCell(rowNum, 2).border = thinBorder();
    sheet.getCell(rowNum, 3).border = thinBorder();
    rowNum++;
  }

  // Footer branding
  rowNum += 3;
  sheet.getCell(rowNum, 2).value = "Gerado por Wallnut Design+Build";
  sheet.getCell(rowNum, 2).font = { name: FONT, size: 9, italic: true, color: { argb: C.muted } };
  sheet.getCell(rowNum + 1, 2).value = "www.wallnut.pt";
  sheet.getCell(rowNum + 1, 2).font = { name: FONT, size: 9, italic: true, color: { argb: C.accent } };

  // Column widths
  sheet.getColumn(1).width = 4;
  sheet.getColumn(2).width = 26;
  sheet.getColumn(3).width = 20;
  for (let c = 4; c <= 8; c++) {
    sheet.getColumn(c).width = 12;
  }

  sheet.headerFooter.oddHeader =
    '&L&"Calibri,Bold"&10Wallnut Design+Build&R&D';
  sheet.headerFooter.oddFooter =
    '&L&"Calibri"&8Dashboard CCPM (Goldratt)&R&P/&N';
}

// ============================================================
// Main Export Function
// ============================================================

/**
 * Generate a CCPM Gantt Chart Excel workbook with 5 sheets.
 * Uses ExcelJS for full cell styling.
 *
 * @returns Buffer containing the .xlsx file
 */
export async function generateCcpmGanttExcel(
  schedule: ProjectSchedule,
  resources: ProjectResources,
  cashFlow?: CashFlowResult,
  options?: CcpmGanttExportOptions,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wallnut Design+Build";
  wb.created = new Date();
  wb.properties.date1904 = false;

  const opts: Required<CcpmGanttExportOptions> = {
    projectName: options?.projectName || schedule.projectName || "Projeto",
    projectLocation: options?.projectLocation || "Portugal",
    timeScale: options?.timeScale || "auto",
    showToday: options?.showToday ?? true,
  };

  buildGanttSheet(wb, schedule, opts);
  buildFeverChartSheet(wb, schedule);
  buildWbsDetailSheet(wb, schedule);
  buildResourceLoadSheet(wb, schedule, resources);
  buildDashboardSheet(wb, schedule, resources, cashFlow, opts);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Download CCPM Gantt Excel file (browser-side).
 */
export async function downloadCcpmGanttExcel(
  schedule: ProjectSchedule,
  resources: ProjectResources,
  cashFlow?: CashFlowResult,
  options?: CcpmGanttExportOptions,
): Promise<void> {
  const buffer = await generateCcpmGanttExcel(schedule, resources, cashFlow, options);
  const uint8 = new Uint8Array(buffer);
  const blob = new Blob([uint8], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const name = options?.projectName || schedule.projectName || "projeto";
  const filename = `ccpm_gantt_${name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

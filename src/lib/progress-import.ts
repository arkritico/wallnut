/**
 * Progress Import — parse actual construction progress from
 * MS Project CSV or XML exports and match to schedule tasks.
 *
 * Supports:
 *   - CSV: "Task Usage" export with WBS, % Complete, Actual Start/Finish/Cost
 *   - XML: MS Project XML with <Task> elements
 *
 * Matching strategy (fallback chain):
 *   1. WBS code exact match
 *   2. Task UID exact match
 *   3. Task name fuzzy match (Levenshtein distance ≤ 3)
 */

import type { ProjectSchedule, ScheduleTask } from "./wbs-types";
import type { TaskProgress } from "./earned-value";

// ============================================================
// Types
// ============================================================

export interface ProgressImportResult {
  entries: TaskProgress[];
  matched: number;
  unmatched: string[];
  source: "csv" | "mpp_xml";
}

// ============================================================
// CSV Parser
// ============================================================

/**
 * Parse progress from a CSV exported from MS Project.
 *
 * Expected columns (flexible ordering, matched by header):
 *   WBS | Task Name | % Complete | Actual Start | Actual Finish | Actual Cost
 *
 * Portuguese variants accepted:
 *   WBS | Nome da Tarefa | % Concluída | Início Real | Conclusão Real | Custo Real
 */
export function parseProgressCSV(
  csv: string,
  schedule: ProjectSchedule,
): ProgressImportResult {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { entries: [], matched: 0, unmatched: [], source: "csv" };

  // Parse header
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const colIdx = resolveCSVColumns(headers);

  if (colIdx.wbs < 0 && colIdx.name < 0) {
    return { entries: [], matched: 0, unmatched: ["No WBS or Task Name column found"], source: "csv" };
  }

  // Build lookup maps
  const taskByWbs = new Map<string, ScheduleTask>();
  const taskByName = new Map<string, ScheduleTask>();
  for (const t of schedule.tasks) {
    if (t.wbs) taskByWbs.set(t.wbs.toLowerCase(), t);
    taskByName.set(t.name.toLowerCase(), t);
  }

  const entries: TaskProgress[] = [];
  const unmatched: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length === 0) continue;

    const wbs = colIdx.wbs >= 0 ? cols[colIdx.wbs]?.trim() ?? "" : "";
    const name = colIdx.name >= 0 ? cols[colIdx.name]?.trim() ?? "" : "";
    const pctStr = colIdx.percent >= 0 ? cols[colIdx.percent]?.trim() ?? "" : "";
    const actualStart = colIdx.actualStart >= 0 ? cols[colIdx.actualStart]?.trim() ?? "" : "";
    const actualFinish = colIdx.actualFinish >= 0 ? cols[colIdx.actualFinish]?.trim() ?? "" : "";
    const actualCostStr = colIdx.actualCost >= 0 ? cols[colIdx.actualCost]?.trim() ?? "" : "";

    // Skip empty or summary rows
    if (!wbs && !name) continue;
    const pct = parsePercent(pctStr);
    if (pct === null) continue;

    // Match to schedule task
    const task =
      (wbs ? taskByWbs.get(wbs.toLowerCase()) : undefined) ??
      (name ? taskByName.get(name.toLowerCase()) : undefined) ??
      (name ? fuzzyMatch(name, schedule.tasks) : undefined);

    if (!task) {
      unmatched.push(name || wbs);
      continue;
    }

    const entry: TaskProgress = {
      taskUid: task.uid,
      percentComplete: pct,
    };

    const parsedStart = parseDate(actualStart);
    if (parsedStart) entry.actualStart = parsedStart;

    const parsedFinish = parseDate(actualFinish);
    if (parsedFinish) entry.actualFinish = parsedFinish;

    const actualCost = parseNumber(actualCostStr);
    if (actualCost !== null) entry.actualCost = actualCost;

    entries.push(entry);
  }

  return { entries, matched: entries.length, unmatched, source: "csv" };
}

// ============================================================
// MS Project XML Parser
// ============================================================

/**
 * Parse progress from MS Project XML export.
 *
 * Looks for <Task> elements with:
 *   <WBS>, <Name>, <PercentComplete>, <ActualStart>, <ActualFinish>, <ActualCost>
 */
export function parseProgressXML(
  xml: string,
  schedule: ProjectSchedule,
): ProgressImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const taskElements = doc.querySelectorAll("Task");
  if (taskElements.length === 0) {
    return { entries: [], matched: 0, unmatched: ["No <Task> elements found"], source: "mpp_xml" };
  }

  // Build lookup maps
  const taskByWbs = new Map<string, ScheduleTask>();
  const taskByName = new Map<string, ScheduleTask>();
  for (const t of schedule.tasks) {
    if (t.wbs) taskByWbs.set(t.wbs.toLowerCase(), t);
    taskByName.set(t.name.toLowerCase(), t);
  }

  const entries: TaskProgress[] = [];
  const unmatched: string[] = [];

  taskElements.forEach((el) => {
    const wbs = getXmlText(el, "WBS");
    const name = getXmlText(el, "Name");
    const pctStr = getXmlText(el, "PercentComplete");
    const actualStart = getXmlText(el, "ActualStart");
    const actualFinish = getXmlText(el, "ActualFinish");
    const actualCostStr = getXmlText(el, "ActualCost");

    if (!wbs && !name) return;
    const pct = pctStr ? parseInt(pctStr, 10) : null;
    if (pct === null || isNaN(pct)) return;

    // Match to schedule task
    const task =
      (wbs ? taskByWbs.get(wbs.toLowerCase()) : undefined) ??
      (name ? taskByName.get(name.toLowerCase()) : undefined) ??
      (name ? fuzzyMatch(name, schedule.tasks) : undefined);

    if (!task) {
      unmatched.push(name || wbs || "Unknown");
      return;
    }

    const entry: TaskProgress = {
      taskUid: task.uid,
      percentComplete: Math.min(100, Math.max(0, pct)),
    };

    const parsedStart = parseDate(actualStart);
    if (parsedStart) entry.actualStart = parsedStart;

    const parsedFinish = parseDate(actualFinish);
    if (parsedFinish) entry.actualFinish = parsedFinish;

    const actualCost = parseNumber(actualCostStr);
    if (actualCost !== null) entry.actualCost = actualCost;

    entries.push(entry);
  });

  return { entries, matched: entries.length, unmatched, source: "mpp_xml" };
}

// ============================================================
// Helpers
// ============================================================

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // RFC 4180: escaped double-quote ("") → literal "
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

interface CSVColumnMap {
  wbs: number;
  name: number;
  percent: number;
  actualStart: number;
  actualFinish: number;
  actualCost: number;
}

function resolveCSVColumns(headers: string[]): CSVColumnMap {
  const map: CSVColumnMap = {
    wbs: -1,
    name: -1,
    percent: -1,
    actualStart: -1,
    actualFinish: -1,
    actualCost: -1,
  };

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h === "wbs" || h === "edt") map.wbs = i;
    else if (h.includes("task name") || h.includes("nome da tarefa") || h.includes("nome")) map.name = i;
    else if (h.includes("% complete") || h.includes("% conclu") || h.includes("percent")) map.percent = i;
    else if (h.includes("actual start") || h.includes("início real") || h.includes("inicio real")) map.actualStart = i;
    else if (h.includes("actual finish") || h.includes("conclusão real") || h.includes("conclusao real")) map.actualFinish = i;
    else if (h.includes("actual cost") || h.includes("custo real")) map.actualCost = i;
  }

  return map;
}

function parsePercent(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[%\s]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function parseNumber(s: string): number | null {
  if (!s) return null;
  // Handle European number format (1.234,56) and standard (1,234.56)
  const cleaned = s.replace(/[€$\s]/g, "");
  // If has comma after last period → European format
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    // European: periods are thousands, comma is decimal
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Standard: commas are thousands, period is decimal
    normalized = cleaned.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function getXmlText(parent: Element, tag: string): string {
  return parent.querySelector(tag)?.textContent?.trim() ?? "";
}

/** Simple Levenshtein distance for fuzzy task name matching */
function levenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  const dp: number[][] = Array.from({ length: al + 1 }, (_, i) =>
    Array.from({ length: bl + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[al][bl];
}

function fuzzyMatch(name: string, tasks: ScheduleTask[]): ScheduleTask | undefined {
  const lower = name.toLowerCase();
  let best: ScheduleTask | undefined;
  let bestDist = Infinity;

  for (const t of tasks) {
    if (t.isSummary) continue;
    const dist = levenshtein(lower, t.name.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

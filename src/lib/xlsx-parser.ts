/**
 * Excel (XLS/XLSX) parser for BOQ and technical documents.
 *
 * Handles:
 * 1. Bill of Quantities (Mapa de Quantidades) parsing
 * 2. Budget/cost data extraction
 * 3. WBS structure detection from Excel files
 * 4. Generic tabular data extraction
 */

import * as XLSX from "xlsx";

// ============================================================
// Types
// ============================================================

export interface BoqItem {
  /** Article code (e.g., "01.02.003" or ProNIC code) */
  code: string;
  /** Description of the work item */
  description: string;
  /** Unit of measurement (m², m, kg, Ud, vg, etc.) */
  unit: string;
  /** Quantity */
  quantity: number;
  /** Unit price in EUR */
  unitPrice: number;
  /** Total price (quantity × unitPrice) */
  totalPrice: number;
  /** Chapter/section this belongs to */
  chapter?: string;
  /** Sub-chapter */
  subChapter?: string;
  /** Notes / remarks */
  notes?: string;
  /** Row number in the original spreadsheet */
  sourceRow: number;
}

export interface BoqChapter {
  /** Chapter code */
  code: string;
  /** Chapter title */
  title: string;
  /** Sub-chapters */
  subChapters: BoqSubChapter[];
  /** Total cost of this chapter */
  totalCost: number;
}

export interface BoqSubChapter {
  /** Sub-chapter code */
  code: string;
  /** Sub-chapter title */
  title: string;
  /** Work items */
  items: BoqItem[];
  /** Total cost */
  totalCost: number;
}

export interface ParsedBoq {
  /** Parsed BOQ items (flat list) */
  items: BoqItem[];
  /** Structured chapters (if WBS detected) */
  chapters: BoqChapter[];
  /** Whether a WBS structure was detected */
  hasWbs: boolean;
  /** Whether the WBS follows ISO 12006-2 / ProNIC */
  isIsoWbs: boolean;
  /** Total cost from the BOQ */
  totalCost: number;
  /** Currency (detected or assumed) */
  currency: string;
  /** Sheet name the data came from */
  sheetName: string;
  /** Warnings during parsing */
  warnings: string[];
  /** Number of rows that couldn't be parsed */
  skippedRows: number;
}

export interface XlsxParseResult {
  /** All parsed BOQs (one per relevant sheet) */
  boqs: ParsedBoq[];
  /** Raw data from all sheets (for non-BOQ sheets) */
  sheets: { name: string; data: Record<string, unknown>[] }[];
  /** Overall warnings */
  warnings: string[];
}

// ============================================================
// Column detection patterns
// ============================================================

interface ColumnMapping {
  code: number | null;
  description: number | null;
  unit: number | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

const CODE_PATTERNS = /^(art|c[oó]d|code|ref|n[uú]m|item|#|artigo)/i;
const DESC_PATTERNS = /^(desc|designa|trabalho|work|item|servi[çc]o|natureza)/i;
const UNIT_PATTERNS = /^(un|unit|ud|medida)/i;
const QTY_PATTERNS = /^(qtd|quant|qty|med|quantity|quantidade)/i;
const UPRICE_PATTERNS = /^(pre[çc]o.*un|p\.?\s?u|unit.*price|custo.*un|valor.*un)/i;
const TOTAL_PATTERNS = /^(total|import|valor|amount|pre[çc]o.*total|parcial)/i;

function detectColumns(headerRow: unknown[]): ColumnMapping {
  const mapping: ColumnMapping = {
    code: null,
    description: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    totalPrice: null,
  };

  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] ?? "").trim();
    if (!cell) continue;

    if (CODE_PATTERNS.test(cell) && mapping.code === null) {
      mapping.code = i;
    } else if (DESC_PATTERNS.test(cell) && mapping.description === null) {
      mapping.description = i;
    } else if (UNIT_PATTERNS.test(cell) && mapping.unit === null) {
      mapping.unit = i;
    } else if (QTY_PATTERNS.test(cell) && mapping.quantity === null) {
      mapping.quantity = i;
    } else if (UPRICE_PATTERNS.test(cell) && mapping.unitPrice === null) {
      mapping.unitPrice = i;
    } else if (TOTAL_PATTERNS.test(cell) && mapping.totalPrice === null) {
      mapping.totalPrice = i;
    }
  }

  return mapping;
}

function isBoqSheet(mapping: ColumnMapping): boolean {
  // A BOQ sheet must have at minimum description + quantity + some price
  return (
    mapping.description !== null &&
    mapping.quantity !== null &&
    (mapping.unitPrice !== null || mapping.totalPrice !== null)
  );
}

// ============================================================
// Chapter/WBS detection
// ============================================================

const PRONIC_CHAPTER_PATTERN = /^(\d{1,2})(?:\.\s|$)/;
const PRONIC_SUBCHAPTER_PATTERN = /^(\d{1,2})\.(\d{1,2})(?:\.\s|$)/;
const PRONIC_ARTICLE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{1,3})/;
const ISO_WBS_INDICATORS = [
  /pronic/i,
  /iso.*12006/i,
  /cap[ií]tulo.*0?1.*estaleiro/i,
  /cap[ií]tulo.*0?2.*demoli/i,
  /trabalhos.*preparat/i,
  /funda[çc][oõ]es/i,
];

function isChapterRow(code: string, description: string): boolean {
  return (
    PRONIC_CHAPTER_PATTERN.test(code) &&
    !PRONIC_SUBCHAPTER_PATTERN.test(code) &&
    description.length > 2
  );
}

function isSubChapterRow(code: string): boolean {
  return PRONIC_SUBCHAPTER_PATTERN.test(code) && !PRONIC_ARTICLE_PATTERN.test(code);
}

function detectIsoWbs(items: BoqItem[]): boolean {
  // Check if any description/code matches ISO/ProNIC patterns
  const allText = items.map(i => `${i.code} ${i.description}`).join(" ");
  return ISO_WBS_INDICATORS.some(p => p.test(allText));
}

// ============================================================
// Main parser
// ============================================================

/**
 * Parse an Excel file (XLS or XLSX) and extract BOQ data.
 */
export function parseExcelFile(data: ArrayBuffer): XlsxParseResult {
  const workbook = XLSX.read(data, { type: "array" });
  const result: XlsxParseResult = {
    boqs: [],
    sheets: [],
    warnings: [],
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    if (rows.length < 2) continue;

    // Try to find header row (search first 10 rows)
    let headerRowIndex = -1;
    let columnMapping: ColumnMapping | null = null;

    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i] as unknown[];
      const mapping = detectColumns(row);
      if (isBoqSheet(mapping)) {
        headerRowIndex = i;
        columnMapping = mapping;
        break;
      }
    }

    if (headerRowIndex === -1 || !columnMapping) {
      // Not a BOQ sheet — store as generic data
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      result.sheets.push({ name: sheetName, data: jsonData });
      continue;
    }

    // Parse BOQ data rows
    const items: BoqItem[] = [];
    const warnings: string[] = [];
    let skippedRows = 0;
    let currentChapter = "";
    let currentSubChapter = "";

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const code = String(row[columnMapping.code ?? 0] ?? "").trim();
      const description = String(row[columnMapping.description ?? 1] ?? "").trim();

      // Skip empty rows
      if (!description && !code) continue;

      // Detect chapter/sub-chapter rows
      if (code && isChapterRow(code, description)) {
        currentChapter = `${code} ${description}`;
        continue;
      }
      if (code && isSubChapterRow(code)) {
        currentSubChapter = `${code} ${description}`;
        continue;
      }

      // Parse numeric values
      const quantity = parseNumber(row[columnMapping.quantity ?? -1]);
      const unitPrice = columnMapping.unitPrice !== null
        ? parseNumber(row[columnMapping.unitPrice])
        : 0;
      const totalPrice = columnMapping.totalPrice !== null
        ? parseNumber(row[columnMapping.totalPrice])
        : quantity * unitPrice;
      const unit = columnMapping.unit !== null
        ? String(row[columnMapping.unit] ?? "").trim()
        : "";

      // Skip rows without quantities (likely subtotal or notes)
      if (quantity === 0 && totalPrice === 0) {
        if (description) skippedRows++;
        continue;
      }

      items.push({
        code,
        description,
        unit,
        quantity,
        unitPrice: unitPrice || (quantity > 0 ? totalPrice / quantity : 0),
        totalPrice: totalPrice || quantity * unitPrice,
        chapter: currentChapter || undefined,
        subChapter: currentSubChapter || undefined,
        sourceRow: i + 1, // 1-based for user display
      });
    }

    if (items.length === 0) {
      warnings.push(`Folha "${sheetName}": nenhum item de BOQ encontrado.`);
      continue;
    }

    // Build chapter structure
    const chapters = buildChapterStructure(items);
    const hasWbs = chapters.length > 0;
    const isIsoWbs = hasWbs && detectIsoWbs(items);
    const totalCost = items.reduce((sum, item) => sum + item.totalPrice, 0);

    result.boqs.push({
      items,
      chapters,
      hasWbs,
      isIsoWbs,
      totalCost,
      currency: "EUR",
      sheetName,
      warnings,
      skippedRows,
    });
  }

  return result;
}

function buildChapterStructure(items: BoqItem[]): BoqChapter[] {
  const chapterMap = new Map<string, BoqChapter>();

  for (const item of items) {
    if (!item.chapter) continue;

    const chapterCode = item.chapter.split(" ")[0] || item.chapter;
    if (!chapterMap.has(chapterCode)) {
      chapterMap.set(chapterCode, {
        code: chapterCode,
        title: item.chapter.replace(chapterCode, "").trim(),
        subChapters: [],
        totalCost: 0,
      });
    }

    const chapter = chapterMap.get(chapterCode)!;
    chapter.totalCost += item.totalPrice;

    if (item.subChapter) {
      const subCode = item.subChapter.split(" ")[0] || item.subChapter;
      let sub = chapter.subChapters.find(s => s.code === subCode);
      if (!sub) {
        sub = {
          code: subCode,
          title: item.subChapter.replace(subCode, "").trim(),
          items: [],
          totalCost: 0,
        };
        chapter.subChapters.push(sub);
      }
      sub.items.push(item);
      sub.totalCost += item.totalPrice;
    }
  }

  return Array.from(chapterMap.values());
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  if (typeof value === "string") {
    // Handle Portuguese number format (1.234,56 → 1234.56)
    const cleaned = value
      .replace(/\s/g, "")
      .replace(/€/g, "")
      .replace(/EUR/gi, "")
      .trim();

    // Check if it uses comma as decimal separator
    if (/^\d{1,3}(\.\d{3})*,\d+$/.test(cleaned)) {
      return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
    }
    return parseFloat(cleaned.replace(",", ".")) || 0;
  }
  return 0;
}

/**
 * Extract text content from an Excel file for AI parsing.
 * Returns a string representation of all sheets.
 */
export function extractTextFromExcel(data: ArrayBuffer): string {
  const workbook = XLSX.read(data, { type: "array" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const text = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
    parts.push(`=== ${sheetName} ===\n${text}`);
  }

  return parts.join("\n\n");
}

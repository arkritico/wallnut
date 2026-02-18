/**
 * WBS Parser
 *
 * Reusable parsers for BOQ/WBS files in various formats:
 * - CSV/TSV (comma or tab separated)
 * - JSON (native format)
 * - Excel (future: XLSX parsing)
 */

import type { WbsProject, WbsChapter, WbsSubChapter, WbsArticle } from "./wbs-types";

// ============================================================
// CSV/TSV Parser
// ============================================================

/**
 * Parse CSV or TSV text into WBS project structure.
 *
 * Expected format (header row + data rows):
 * Code, Description, Unit, Quantity, Keynote
 *
 * @param text - CSV/TSV file content
 * @param separator - "," for CSV, "\t" for TSV
 * @returns Parsed WBS project
 */
export function parseCsvWbs(text: string, separator: string = ","): WbsProject {
  const lines = text.split("\n").filter(l => l.trim());
  const chapters = new Map<string, WbsChapter>();

  // Skip header row (first line)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 4) continue; // Need at least code, description, unit, quantity

    const [code, description, unit, qtyStr, keynote] = cols;

    // Parse code hierarchy (e.g., "01.02.03" → chapter="01", subchapter="01.02")
    const parts = code.split(".");
    const chCode = parts[0] ?? "00";
    const subCode = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : `${chCode}.01`;

    // Create chapter if needed
    if (!chapters.has(chCode)) {
      chapters.set(chCode, {
        code: chCode,
        name: `Capítulo ${chCode}`,
        subChapters: [],
      });
    }

    // Get chapter
    const ch = chapters.get(chCode)!;

    // Create subchapter if needed
    let sub = ch.subChapters.find(s => s.code === subCode);
    if (!sub) {
      sub = {
        code: subCode,
        name: `Sub-capítulo ${subCode}`,
        articles: [],
      };
      ch.subChapters.push(sub);
    }

    // Add article
    sub.articles.push({
      code,
      description,
      unit,
      quantity: parseFloat(qtyStr) || 0,
      keynote: keynote || undefined,
    });
  }

  return {
    id: `csv-${Date.now()}`,
    name: "Projeto Importado (CSV)",
    classification: "ProNIC",
    startDate: new Date().toISOString().split("T")[0],
    chapters: Array.from(chapters.values()).sort((a, b) => a.code.localeCompare(b.code)),
  };
}

// ============================================================
// JSON Parser
// ============================================================

/**
 * Parse JSON text into WBS project structure.
 * Validates structure and ensures all required fields exist.
 *
 * @param text - JSON file content
 * @returns Parsed WBS project
 */
export function parseJsonWbs(text: string): WbsProject {
  try {
    const data = JSON.parse(text) as WbsProject;

    // Basic validation
    if (!data.chapters || !Array.isArray(data.chapters)) {
      throw new Error("Invalid WBS structure: missing chapters array");
    }

    // Ensure all required fields
    return {
      id: data.id || `json-${Date.now()}`,
      name: data.name || (data as any).projectName || "Projeto Importado (JSON)",
      classification: data.classification || "ProNIC",
      startDate: data.startDate || new Date().toISOString().split("T")[0],
      chapters: data.chapters,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Erro ao analisar JSON: ${error.message}`);
    }
    throw new Error("Erro desconhecido ao analisar JSON");
  }
}

// ============================================================
// Excel Parser
// ============================================================

import * as XLSX from 'xlsx';

/**
 * Parse Excel .xlsx file into WBS project structure.
 * Expected format: Same as CSV (Code, Description, Unit, Quantity, Keynote)
 *
 * @param buffer - Excel file buffer
 * @returns Parsed WBS project
 */
export async function parseExcelWbs(buffer: ArrayBuffer): Promise<WbsProject> {
  try {
    // Read workbook from buffer
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("Excel file has no sheets");
    }

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    // Convert sheet to array of arrays
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    if (rows.length < 2) {
      throw new Error("Excel file must have at least a header row and one data row");
    }

    // Build WBS structure
    const chapters = new Map<string, WbsChapter>();

    // Skip header row (first row)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 4) continue; // Need at least code, description, unit, quantity

      const code = String(row[0] || "").trim();
      const description = String(row[1] || "").trim();
      const unit = String(row[2] || "").trim();
      const qtyStr = String(row[3] || "0").trim();
      const keynote = row[4] ? String(row[4]).trim() : undefined;

      if (!code || !description) continue; // Skip empty rows

      // Parse code hierarchy (e.g., "01.02.03" → chapter="01", subchapter="01.02")
      const parts = code.split(".");
      const chCode = parts[0] ?? "00";
      const subCode = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : `${chCode}.01`;

      // Create chapter if needed
      if (!chapters.has(chCode)) {
        chapters.set(chCode, {
          code: chCode,
          name: `Capítulo ${chCode}`,
          subChapters: [],
        });
      }

      // Get chapter
      const ch = chapters.get(chCode)!;

      // Create subchapter if needed
      let sub = ch.subChapters.find(s => s.code === subCode);
      if (!sub) {
        sub = {
          code: subCode,
          name: `Sub-capítulo ${subCode}`,
          articles: [],
        };
        ch.subChapters.push(sub);
      }

      // Add article
      sub.articles.push({
        code,
        description,
        unit,
        quantity: parseFloat(qtyStr) || 0,
        keynote,
      });
    }

    if (chapters.size === 0) {
      throw new Error("No valid WBS data found in Excel file");
    }

    return {
      id: `excel-${Date.now()}`,
      name: sheetName || "Projeto Importado (Excel)",
      classification: "ProNIC",
      startDate: new Date().toISOString().split("T")[0],
      chapters: Array.from(chapters.values()).sort((a, b) => a.code.localeCompare(b.code)),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Erro ao analisar Excel: ${error.message}`);
    }
    throw new Error("Erro desconhecido ao analisar Excel");
  }
}

// ============================================================
// File Type Detection
// ============================================================

/**
 * Detect file type from filename or content.
 */
export function detectWbsFileType(filename: string): "csv" | "tsv" | "json" | "excel" | "unknown" {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case "csv":
      return "csv";
    case "tsv":
      return "tsv";
    case "json":
      return "json";
    case "xlsx":
    case "xls":
      return "excel";
    default:
      return "unknown";
  }
}

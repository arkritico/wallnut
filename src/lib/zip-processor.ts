/**
 * ZIP file processor for Wallnut.
 *
 * Handles:
 * 1. Extracting files from ZIP archives
 * 2. Auto-classifying documents by type (AI + heuristic)
 * 3. Grouping into project document categories
 */

import JSZip from "jszip";

// ============================================================
// Document categories for Portuguese building projects
// ============================================================

export type DocumentCategory =
  | "memoria_descritiva"       // Written description
  | "caderneta_predial"        // Property registration
  | "certidao_registo"         // Registry certificate
  | "planta_localizacao"       // Location plan (has coordinates)
  | "levantamento_topografico" // Topographic survey (has coordinates)
  | "planta_implantacao"       // Implantation plan
  | "plantas_arquitetura"      // Architecture floor plans
  | "alcados"                  // Elevations
  | "cortes"                   // Sections
  | "pormenores"               // Construction details
  | "projeto_estruturas"       // Structural project
  | "projeto_scie"             // Fire safety project
  | "projeto_avac"             // HVAC project
  | "projeto_aguas"            // Water/drainage project
  | "projeto_gas"              // Gas project
  | "projeto_eletrico"         // Electrical project
  | "projeto_ited"             // Telecom project
  | "projeto_acustico"         // Acoustic project
  | "projeto_termico"          // Thermal/energy project
  | "boq"                      // Bill of Quantities / Mapa de Quantidades
  | "orcamento"                // Budget
  | "regulamento_municipal"    // Municipal regulation
  | "parecer_entidade"         // Entity opinion/response
  | "fotografias"              // Photographs
  | "other";                   // Unclassified

export interface ExtractedFile {
  /** Original filename (without path) */
  name: string;
  /** Full path inside ZIP */
  path: string;
  /** File extension (lowercase, no dot) */
  extension: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Raw file data */
  data: ArrayBuffer;
  /** Auto-detected category */
  category: DocumentCategory;
  /** Confidence of classification (0-1) */
  categoryConfidence: number;
  /** Whether this file likely contains coordinates */
  hasCoordinates: boolean;
  /** Document type group */
  group: "written" | "drawings" | "budget" | "regulations" | "other";
}

export interface ZipProcessResult {
  /** All extracted files */
  files: ExtractedFile[];
  /** Files grouped by category */
  byCategory: Record<DocumentCategory, ExtractedFile[]>;
  /** Summary statistics */
  stats: {
    totalFiles: number;
    totalSize: number;
    writtenDocs: number;
    drawings: number;
    budgetDocs: number;
    regulationDocs: number;
    otherDocs: number;
    skippedFiles: string[]; // filenames that were skipped (e.g., OS metadata)
  };
  /** Warnings about the archive */
  warnings: string[];
}

// ============================================================
// File extension mappings
// ============================================================

const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "odt", "rtf", "txt"]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "ods", "csv"]);
const DRAWING_EXTENSIONS = new Set(["dwg", "dwfx", "dxf", "dgn", "ifc"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "tif", "tiff", "bmp"]);
const SKIP_PATTERNS = [
  /^__MACOSX\//i,
  /\.DS_Store$/i,
  /Thumbs\.db$/i,
  /desktop\.ini$/i,
  /^\./, // hidden files
];

// ============================================================
// Classification heuristics (filename patterns)
// ============================================================

interface ClassificationRule {
  patterns: RegExp[];
  category: DocumentCategory;
  confidence: number;
  hasCoordinates?: boolean;
  group: ExtractedFile["group"];
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  // Location documents (likely contain coordinates)
  {
    patterns: [/planta.*localiza/i, /localiza[çc][aã]o/i, /location.*plan/i],
    category: "planta_localizacao",
    confidence: 0.95,
    hasCoordinates: true,
    group: "drawings",
  },
  {
    patterns: [/levantamento.*topo/i, /topogr[aá]f/i, /survey/i],
    category: "levantamento_topografico",
    confidence: 0.95,
    hasCoordinates: true,
    group: "drawings",
  },
  // Written documents
  {
    patterns: [/mem[oó]ria.*descritiva/i, /m\.?\s?d\.?/i, /memoria.*desc/i],
    category: "memoria_descritiva",
    confidence: 0.9,
    group: "written",
  },
  {
    patterns: [/caderneta.*predial/i, /caderneta/i],
    category: "caderneta_predial",
    confidence: 0.9,
    group: "written",
  },
  {
    patterns: [/certid[aã]o.*registo/i, /conservat[oó]ria/i, /registo.*predial/i],
    category: "certidao_registo",
    confidence: 0.9,
    group: "written",
  },
  // Architectural drawings
  {
    patterns: [/implanta[çc][aã]o/i, /implantation/i],
    category: "planta_implantacao",
    confidence: 0.85,
    group: "drawings",
  },
  {
    patterns: [/planta.*piso/i, /planta.*r[\/_]?c/i, /planta.*cave/i, /floor.*plan/i, /piso/i],
    category: "plantas_arquitetura",
    confidence: 0.8,
    group: "drawings",
  },
  {
    patterns: [/al[çc]ado/i, /eleva[çc][aã]o/i, /elevation/i, /facade/i, /fachada/i],
    category: "alcados",
    confidence: 0.85,
    group: "drawings",
  },
  {
    patterns: [/corte/i, /sec[çc][aã]o/i, /section/i, /cross.*sect/i],
    category: "cortes",
    confidence: 0.85,
    group: "drawings",
  },
  {
    patterns: [/pormenor/i, /detalhe/i, /detail/i],
    category: "pormenores",
    confidence: 0.85,
    group: "drawings",
  },
  // Specialty projects
  {
    patterns: [/estrutur/i, /structural/i, /betão/i, /a[çc]o.*estrut/i],
    category: "projeto_estruturas",
    confidence: 0.85,
    group: "written",
  },
  {
    patterns: [/inc[eê]ndio/i, /scie/i, /fire.*safe/i, /seguran[çc]a.*inc/i],
    category: "projeto_scie",
    confidence: 0.85,
    group: "written",
  },
  {
    patterns: [/avac/i, /hvac/i, /climatiza/i, /ventila[çc]/i],
    category: "projeto_avac",
    confidence: 0.85,
    group: "written",
  },
  {
    patterns: [/[aá]gua/i, /drenagem/i, /water/i, /drainage/i, /saneamento/i],
    category: "projeto_aguas",
    confidence: 0.8,
    group: "written",
  },
  {
    patterns: [/g[aá]s/i, /gas.*install/i],
    category: "projeto_gas",
    confidence: 0.85,
    group: "written",
  },
  {
    patterns: [/el[eé][ct]ric/i, /rtiebt/i, /instala[çc].*el/i],
    category: "projeto_eletrico",
    confidence: 0.85,
    group: "written",
  },
  {
    patterns: [/ited/i, /itur/i, /telecomunica/i, /telecom/i],
    category: "projeto_ited",
    confidence: 0.85,
    group: "written",
  },
  {
    patterns: [/ac[uú]stic/i, /acoustic/i, /rrae/i, /ru[ií]do/i],
    category: "projeto_acustico",
    confidence: 0.85,
    group: "written",
  },
  {
    patterns: [/t[eé]rmic/i, /thermal/i, /reh\b/i, /energ[eé]tic/i, /energi/i, /sce\b/i],
    category: "projeto_termico",
    confidence: 0.85,
    group: "written",
  },
  // Budget / BOQ
  {
    patterns: [/mapa.*quantid/i, /boq/i, /bill.*quant/i, /quantid/i, /medic/i],
    category: "boq",
    confidence: 0.9,
    group: "budget",
  },
  {
    patterns: [/or[çc]amento/i, /budget/i, /estimat.*custo/i, /cost.*estimat/i],
    category: "orcamento",
    confidence: 0.85,
    group: "budget",
  },
  // Municipal / regulations
  {
    patterns: [/pdm/i, /regulamento.*munic/i, /municipal.*regul/i],
    category: "regulamento_municipal",
    confidence: 0.85,
    group: "regulations",
  },
  {
    patterns: [/parecer/i, /consulta/i, /opinion/i, /entidade/i],
    category: "parecer_entidade",
    confidence: 0.75,
    group: "regulations",
  },
  // Photos
  {
    patterns: [/foto/i, /photo/i, /imagem/i, /image/i],
    category: "fotografias",
    confidence: 0.7,
    group: "other",
  },
];

// ============================================================
// Core functions
// ============================================================

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
    dwg: "application/acad",
    dwfx: "application/x-dwfx",
    dxf: "application/dxf",
    ifc: "application/x-step",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    tif: "image/tiff",
    tiff: "image/tiff",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(path));
}

function classifyFile(filename: string, ext: string): {
  category: DocumentCategory;
  confidence: number;
  hasCoordinates: boolean;
  group: ExtractedFile["group"];
} {
  // Try classification rules against filename
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.patterns.some(p => p.test(filename))) {
      return {
        category: rule.category,
        confidence: rule.confidence,
        hasCoordinates: rule.hasCoordinates ?? false,
        group: rule.group,
      };
    }
  }

  // Fallback classification by extension
  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    return { category: "boq", confidence: 0.5, hasCoordinates: false, group: "budget" };
  }
  if (DRAWING_EXTENSIONS.has(ext)) {
    return { category: "plantas_arquitetura", confidence: 0.4, hasCoordinates: false, group: "drawings" };
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { category: "fotografias", confidence: 0.5, hasCoordinates: false, group: "other" };
  }

  return { category: "other", confidence: 0.3, hasCoordinates: false, group: "other" };
}

/**
 * Process a ZIP file: extract all files and auto-classify them.
 */
export async function processZipFile(zipFile: File): Promise<ZipProcessResult> {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const files: ExtractedFile[] = [];
  const warnings: string[] = [];
  const skippedFiles: string[] = [];

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per file
  const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500 MB total
  let totalSize = 0;

  const entries = Object.entries(zip.files).filter(([, file]) => !file.dir);

  for (const [path, zipEntry] of entries) {
    // Skip OS metadata and hidden files
    if (shouldSkip(path)) {
      skippedFiles.push(path);
      continue;
    }

    const filename = path.split("/").pop() ?? path;
    const ext = getExtension(filename);

    // Skip unsupported extensions
    if (!DOCUMENT_EXTENSIONS.has(ext) && !SPREADSHEET_EXTENSIONS.has(ext) &&
        !DRAWING_EXTENSIONS.has(ext) && !IMAGE_EXTENSIONS.has(ext)) {
      skippedFiles.push(path);
      continue;
    }

    const data = await zipEntry.async("arraybuffer");

    // Size check
    if (data.byteLength > MAX_FILE_SIZE) {
      warnings.push(`Ficheiro ${filename} excede 100 MB — ignorado.`);
      skippedFiles.push(path);
      continue;
    }
    totalSize += data.byteLength;

    if (totalSize > MAX_TOTAL_SIZE) {
      warnings.push("Total excede 500 MB — restantes ficheiros ignorados.");
      break;
    }

    const classification = classifyFile(filename, ext);

    files.push({
      name: filename,
      path,
      extension: ext,
      mimeType: getMimeType(ext),
      size: data.byteLength,
      data,
      category: classification.category,
      categoryConfidence: classification.confidence,
      hasCoordinates: classification.hasCoordinates,
      group: classification.group,
    });
  }

  // Build category map
  const byCategory = {} as Record<DocumentCategory, ExtractedFile[]>;
  for (const file of files) {
    if (!byCategory[file.category]) {
      byCategory[file.category] = [];
    }
    byCategory[file.category].push(file);
  }

  // Stats
  const stats = {
    totalFiles: files.length,
    totalSize,
    writtenDocs: files.filter(f => f.group === "written").length,
    drawings: files.filter(f => f.group === "drawings").length,
    budgetDocs: files.filter(f => f.group === "budget").length,
    regulationDocs: files.filter(f => f.group === "regulations").length,
    otherDocs: files.filter(f => f.group === "other").length,
    skippedFiles,
  };

  return { files, byCategory, stats, warnings };
}

/**
 * Refine classification using AI (send first page text to Claude).
 * Call this optionally after initial heuristic classification.
 */
export async function refineClassificationWithAI(
  files: ExtractedFile[],
): Promise<ExtractedFile[]> {
  // Only refine files with low confidence or "other" category
  const needsRefinement = files.filter(
    f => f.categoryConfidence < 0.7 || f.category === "other",
  );

  if (needsRefinement.length === 0) return files;

  // Build a summary for the AI
  const fileSummary = needsRefinement.map(f => ({
    name: f.name,
    extension: f.extension,
    size: f.size,
    currentCategory: f.category,
  }));

  try {
    const response = await fetch("/api/ai-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `Classifica os seguintes ficheiros de um projeto de construção português nas categorias disponíveis. Retorna JSON com array de {name, category, confidence}.

Categorias: memoria_descritiva, caderneta_predial, certidao_registo, planta_localizacao, levantamento_topografico, planta_implantacao, plantas_arquitetura, alcados, cortes, pormenores, projeto_estruturas, projeto_scie, projeto_avac, projeto_aguas, projeto_gas, projeto_eletrico, projeto_ited, projeto_acustico, projeto_termico, boq, orcamento, regulamento_municipal, parecer_entidade, fotografias, other

Ficheiros:
${JSON.stringify(fileSummary, null, 2)}`,
        regulationArea: "general",
      }),
    });

    if (!response.ok) return files;

    const aiResult = await response.json();
    const answer = aiResult.answer ?? "";

    // Try to parse JSON from AI response
    const jsonMatch = answer.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const classifications = JSON.parse(jsonMatch[0]) as Array<{
        name: string;
        category: DocumentCategory;
        confidence: number;
      }>;

      // Apply AI classifications
      return files.map(f => {
        const aiClass = classifications.find(c => c.name === f.name);
        if (aiClass && aiClass.confidence > f.categoryConfidence) {
          return {
            ...f,
            category: aiClass.category,
            categoryConfidence: aiClass.confidence,
          };
        }
        return f;
      });
    }
  } catch {
    // AI classification failed — keep heuristic results
  }

  return files;
}

/**
 * Category display names in Portuguese and English.
 */
export const CATEGORY_LABELS: Record<DocumentCategory, { pt: string; en: string }> = {
  memoria_descritiva: { pt: "Memória Descritiva", en: "Descriptive Memoir" },
  caderneta_predial: { pt: "Caderneta Predial", en: "Property Registration" },
  certidao_registo: { pt: "Certidão de Registo", en: "Registry Certificate" },
  planta_localizacao: { pt: "Planta de Localização", en: "Location Plan" },
  levantamento_topografico: { pt: "Levantamento Topográfico", en: "Topographic Survey" },
  planta_implantacao: { pt: "Planta de Implantação", en: "Site Plan" },
  plantas_arquitetura: { pt: "Plantas de Arquitetura", en: "Architecture Plans" },
  alcados: { pt: "Alçados", en: "Elevations" },
  cortes: { pt: "Cortes", en: "Sections" },
  pormenores: { pt: "Pormenores", en: "Construction Details" },
  projeto_estruturas: { pt: "Projeto de Estruturas", en: "Structural Project" },
  projeto_scie: { pt: "Projeto de SCIE", en: "Fire Safety Project" },
  projeto_avac: { pt: "Projeto de AVAC", en: "HVAC Project" },
  projeto_aguas: { pt: "Projeto de Águas", en: "Water/Drainage Project" },
  projeto_gas: { pt: "Projeto de Gás", en: "Gas Project" },
  projeto_eletrico: { pt: "Projeto Elétrico", en: "Electrical Project" },
  projeto_ited: { pt: "Projeto ITED/ITUR", en: "Telecom Project" },
  projeto_acustico: { pt: "Projeto de Acústica", en: "Acoustic Project" },
  projeto_termico: { pt: "Projeto Térmico / Energético", en: "Thermal/Energy Project" },
  boq: { pt: "Mapa de Quantidades", en: "Bill of Quantities" },
  orcamento: { pt: "Orçamento", en: "Budget" },
  regulamento_municipal: { pt: "Regulamento Municipal", en: "Municipal Regulation" },
  parecer_entidade: { pt: "Parecer de Entidade", en: "Entity Opinion" },
  fotografias: { pt: "Fotografias", en: "Photographs" },
  other: { pt: "Outros", en: "Other" },
};

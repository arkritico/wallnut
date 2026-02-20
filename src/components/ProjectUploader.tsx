/**
 * Unified Project Uploader
 *
 * Single entry point for all project files with drag & drop support.
 * Replaces separate upload buttons throughout the app.
 *
 * Supported formats:
 * - BOQ: CSV, TSV, JSON, Excel (.xlsx)
 * - BIM: IFC (multiple files per specialty)
 * - Drawings: PDF, DWFx (future)
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";
import type { WbsProject } from "@/lib/wbs-types";
import { parseCsvWbs, parseJsonWbs, parseExcelWbs, detectWbsFileType } from "@/lib/wbs-parser";
import { analyzeIfcSpecialty, createWbsFromIfc, type SpecialtyAnalysisResult, type IfcQuantityData } from "@/lib/ifc-specialty-analyzer";
import type { WbsArticle } from "@/lib/wbs-types";

// ============================================================
// Types
// ============================================================

export type FileType =
  | "boq_csv"
  | "boq_tsv"
  | "boq_json"
  | "boq_excel"
  | "ifc"
  | "pdf_drawings"
  | "dwfx_drawings"
  | "unknown";

export type FileStatus = "pending" | "parsing" | "success" | "error";

export interface UploadedFile {
  file: File;
  type: FileType;
  status: FileStatus;
  progress: number;
  result?: ParseResult;
  error?: string;
}

export type ParseResult =
  | { type: "wbs"; data: WbsProject }
  | { type: "ifc"; data: SpecialtyAnalysisResult }
  | { type: "drawings"; data: any };

export interface UnifiedProject {
  wbsProject: WbsProject;
  ifcAnalyses: SpecialtyAnalysisResult[];
  drawings: any[];
  mergedStats: {
    totalArticles: number;
    ifcEnrichedArticles: number;
    drawingAnnotations: number;
  };
}

interface ProjectUploaderProps {
  onProjectReady: (project: UnifiedProject) => void;
}

// ============================================================
// File Type Detection
// ============================================================

function detectFileType(file: File): FileType {
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop();

  switch (ext) {
    case "csv":
      return "boq_csv";
    case "tsv":
      return "boq_tsv";
    case "json":
      return "boq_json";
    case "xlsx":
    case "xls":
      return "boq_excel";
    case "ifc":
      return "ifc";
    case "pdf":
      return "pdf_drawings";
    case "dwfx":
      return "dwfx_drawings";
    default:
      return "unknown";
  }
}

// ============================================================
// File Parsing
// ============================================================

async function parseFile(uploadedFile: UploadedFile): Promise<ParseResult> {
  const { file, type } = uploadedFile;

  try {
    switch (type) {
      case "boq_csv": {
        const text = await file.text();
        const data = parseCsvWbs(text, ",");
        return { type: "wbs", data };
      }

      case "boq_tsv": {
        const text = await file.text();
        const data = parseCsvWbs(text, "\t");
        return { type: "wbs", data };
      }

      case "boq_json": {
        const text = await file.text();
        const data = parseJsonWbs(text);
        return { type: "wbs", data };
      }

      case "boq_excel": {
        const buffer = await file.arrayBuffer();
        const data = await parseExcelWbs(buffer);
        return { type: "wbs", data };
      }

      case "ifc": {
        const text = await file.text();
        const data = analyzeIfcSpecialty(text);
        return { type: "ifc", data };
      }

      case "pdf_drawings":
      case "dwfx_drawings": {
        // TODO: Implement drawing parsing
        throw new Error("Drawing parsing not yet implemented.");
      }

      default:
        throw new Error(`Unsupported file type: ${file.name}`);
    }
  } catch (error) {
    throw error;
  }
}

// ============================================================
// BOQ + IFC Enrichment
// ============================================================

/** Mapping of chapter code prefixes to IFC entity types for matching */
const CHAPTER_IFC_MAP: Record<string, string[]> = {
  "06": ["IFCCOLUMN", "IFCBEAM", "IFCSLAB", "IFCFOOTING", "IFCPILE"],   // Structural
  "05": ["IFCWALL", "IFCWALLSTANDARDCASE"],                               // Masonry/Walls
  "07": ["IFCROOF"],                                                       // Roofing
  "08": ["IFCWINDOW", "IFCDOOR"],                                        // Carpentry
  "20": ["IFCPIPESEGMENT", "IFCPIPEFITTING", "IFCSANITARYTERMINAL"],     // Plumbing
  "21": ["IFCDUCTSEGMENT", "IFCAIRTERMINAL", "IFCUNITARYEQUIPMENT"],     // HVAC
  "22": ["IFCCABLESEGMENT", "IFCELECTRICDISTRIBUTIONBOARD", "IFCLIGHTFIXTURE", "IFCOUTLET"], // Electrical
};

/** Keywords that help match BOQ article descriptions to IFC element types */
const KEYWORD_IFC_MAP: Array<{ keywords: string[]; ifcTypes: string[] }> = [
  { keywords: ["pilar", "pilares", "column"], ifcTypes: ["IFCCOLUMN"] },
  { keywords: ["viga", "vigas", "beam"], ifcTypes: ["IFCBEAM"] },
  { keywords: ["laje", "lajes", "slab"], ifcTypes: ["IFCSLAB"] },
  { keywords: ["sapata", "fundacao", "footing"], ifcTypes: ["IFCFOOTING"] },
  { keywords: ["parede", "paredes", "wall", "alvenaria"], ifcTypes: ["IFCWALL", "IFCWALLSTANDARDCASE"] },
  { keywords: ["janela", "janelas", "window", "caixilharia"], ifcTypes: ["IFCWINDOW"] },
  { keywords: ["porta", "portas", "door"], ifcTypes: ["IFCDOOR"] },
  { keywords: ["tubagem", "tubo", "pipe", "canalizacao"], ifcTypes: ["IFCPIPESEGMENT"] },
  { keywords: ["conduta", "duct"], ifcTypes: ["IFCDUCTSEGMENT"] },
  { keywords: ["luminaria", "iluminacao", "light"], ifcTypes: ["IFCLIGHTFIXTURE"] },
  { keywords: ["tomada", "outlet"], ifcTypes: ["IFCOUTLET"] },
  { keywords: ["escada", "stair"], ifcTypes: ["IFCSTAIR", "IFCSTAIRFLIGHT"] },
  { keywords: ["cobertura", "telhado", "roof"], ifcTypes: ["IFCROOF"] },
];

/**
 * Enrich a user-uploaded BOQ with measured quantities from IFC models.
 * Matches articles to IFC elements by chapter code and description keywords,
 * then updates quantities and adds element traceability.
 */
function enrichBoqWithIfc(
  wbs: import("@/lib/wbs-types").WbsProject,
  analyses: SpecialtyAnalysisResult[]
): void {
  const allQuantities = analyses.flatMap(a => a.quantities);

  for (const chapter of wbs.chapters) {
    // Try to match by chapter code prefix
    const chapterPrefix = chapter.code.split(".")[0];
    const chapterIfcTypes = CHAPTER_IFC_MAP[chapterPrefix];

    for (const sub of chapter.subChapters) {
      for (const article of sub.articles) {
        const matched = matchArticleToIfc(article, allQuantities, chapterIfcTypes);
        if (matched.length > 0) {
          // Update quantity from IFC measurements
          const ifcQuantity = computeIfcQuantity(matched, article.unit);
          if (ifcQuantity > 0) {
            article.quantity = ifcQuantity;
          }
          // Add element traceability
          article.elementIds = matched
            .map(q => q.globalId)
            .filter((id): id is string => id !== undefined);
        }
      }
    }
  }
}

/** Match a single BOQ article to IFC elements */
function matchArticleToIfc(
  article: WbsArticle,
  allQuantities: IfcQuantityData[],
  chapterIfcTypes?: string[]
): IfcQuantityData[] {
  const desc = article.description.toLowerCase();

  // Strategy 1: Match by description keywords
  for (const { keywords, ifcTypes } of KEYWORD_IFC_MAP) {
    if (keywords.some(kw => desc.includes(kw))) {
      const matched = allQuantities.filter(q =>
        ifcTypes.some(t => q.entityType.startsWith(t))
      );
      if (matched.length > 0) return matched;
    }
  }

  // Strategy 2: Match by chapter code
  if (chapterIfcTypes) {
    const matched = allQuantities.filter(q =>
      chapterIfcTypes.some(t => q.entityType.startsWith(t))
    );
    if (matched.length > 0) return matched;
  }

  return [];
}

/** Compute total IFC quantity in the article's unit */
function computeIfcQuantity(items: IfcQuantityData[], unit: string): number {
  const u = unit.toLowerCase();
  if (u === "m" || u === "ml") {
    // Linear meters: sum lengths, or estimate from count * typical length
    const totalLength = items.reduce((sum, q) => sum + (q.quantities.length ?? 0), 0);
    if (totalLength > 0) return Math.round(totalLength * 100) / 100;
    // Fallback: count * 3m (typical storey height for columns, 5m for beams)
    return items.length * 3.0;
  }
  if (u === "m2" || u === "m²") {
    return Math.round(items.reduce((sum, q) => sum + (q.quantities.area ?? 0), 0) * 100) / 100;
  }
  if (u === "m3" || u === "m³") {
    return Math.round(items.reduce((sum, q) => sum + (q.quantities.volume ?? 0), 0) * 1000) / 1000;
  }
  if (u === "kg") {
    return Math.round(items.reduce((sum, q) => sum + (q.quantities.weight ?? 0), 0) * 100) / 100;
  }
  if (u === "ud" || u === "un" || u === "und") {
    return items.length;
  }
  // Default: count
  return items.length;
}

// ============================================================
// Data Merging
// ============================================================

function mergeAllData(uploadedFiles: UploadedFile[]): UnifiedProject {
  const boqResults = uploadedFiles.filter(f => f.result?.type === "wbs" && f.status === "success");
  const ifcResults = uploadedFiles.filter(f => f.result?.type === "ifc" && f.status === "success");
  const drawingResults = uploadedFiles.filter(f => f.result?.type === "drawings" && f.status === "success");

  let baseWbs: WbsProject;

  if (boqResults.length > 0) {
    // Priority: User-uploaded BOQ
    baseWbs = (boqResults[0].result as { type: "wbs"; data: WbsProject }).data;
    baseWbs.name = boqResults[0].file.name.replace(/\.[^/.]+$/, "");

    // Enrich BOQ articles with IFC quantities
    if (ifcResults.length > 0) {
      const analyses = ifcResults.map(r => (r.result as { type: "ifc"; data: SpecialtyAnalysisResult }).data);
      enrichBoqWithIfc(baseWbs, analyses);
    }
  } else if (ifcResults.length > 0) {
    // ✅ Generate WBS from IFC if no BOQ provided (IFC-only workflow)
    const ifcAnalyses = ifcResults.map(r => (r.result as { type: "ifc"; data: SpecialtyAnalysisResult }).data);
    baseWbs = createWbsFromIfc(ifcAnalyses);
  } else {
    throw new Error("No valid BOQ or IFC files uploaded. Please upload at least one BOQ (CSV, TSV, JSON, Excel) or IFC file.");
  }

  // Extract IFC analyses
  const ifcAnalyses = ifcResults.map(r => (r.result as { type: "ifc"; data: SpecialtyAnalysisResult }).data);

  // Calculate stats
  const totalArticles = baseWbs.chapters.reduce((sum, ch) =>
    sum + ch.subChapters.reduce((s2, sub) => s2 + sub.articles.length, 0), 0
  );

  // Count IFC-enriched articles (those with elementIds or from IFC-only workflow)
  const ifcEnrichedArticles = baseWbs.chapters.reduce((sum, ch) =>
    sum + ch.subChapters.reduce((s2, sub) =>
      s2 + sub.articles.filter(a => a.elementIds && a.elementIds.length > 0).length, 0
    ), 0
  );

  return {
    wbsProject: baseWbs,
    ifcAnalyses,
    drawings: [],
    mergedStats: {
      totalArticles,
      ifcEnrichedArticles,
      drawingAnnotations: 0,
    },
  };
}

// ============================================================
// Component
// ============================================================

export default function ProjectUploader({ onProjectReady }: ProjectUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [unifiedProject, setUnifiedProject] = useState<UnifiedProject | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFilesSelected = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const uploadedFiles: UploadedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      uploadedFiles.push({
        file,
        type: detectFileType(file),
        status: "pending",
        progress: 0,
      });
    }

    setFiles(uploadedFiles);
    setUnifiedProject(null);

    // Parse all files in parallel
    await Promise.all(
      uploadedFiles.map(async (uploadedFile, index) => {
        setFiles(prev => {
          const updated = [...prev];
          updated[index].status = "parsing";
          updated[index].progress = 50;
          return updated;
        });

        try {
          const result = await parseFile(uploadedFile);

          setFiles(prev => {
            const updated = [...prev];
            updated[index].status = "success";
            updated[index].result = result;
            updated[index].progress = 100;
            return updated;
          });
        } catch (error) {
          setFiles(prev => {
            const updated = [...prev];
            updated[index].status = "error";
            updated[index].error = error instanceof Error ? error.message : "Unknown error";
            updated[index].progress = 0;
            return updated;
          });
        }
      })
    );

    // Merge results
    try {
      const merged = mergeAllData(uploadedFiles);
      setUnifiedProject(merged);
    } catch (error) {
      console.error("Merge error:", error);
      alert(error instanceof Error ? error.message : "Error merging files");
    }
  }, []);

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    handleFilesSelected(droppedFiles);
  }, [handleFilesSelected]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelected(e.target.files);
  }, [handleFilesSelected]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      {/* Drag & Drop Upload Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 transition-all ${
          isDragging
            ? "border-accent bg-accent-light"
            : "border-gray-300 hover:border-accent hover:bg-gray-50"
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="flex flex-col items-center cursor-pointer">
          <Upload className={`w-12 h-12 mb-3 ${isDragging ? "text-accent" : "text-gray-400"}`} />
          <p className="text-lg font-medium text-gray-700 mb-2">
            {isDragging ? "Solte os ficheiros aqui" : "Drag & Drop ou Clique para Carregar"}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            BOQ (CSV, TSV, JSON, Excel), IFC, Desenhos (PDF, DWFx)
          </p>
          <div className="flex flex-wrap gap-2 justify-center text-xs text-gray-400">
            <span className="px-2 py-1 bg-gray-100 rounded">.csv</span>
            <span className="px-2 py-1 bg-gray-100 rounded">.tsv</span>
            <span className="px-2 py-1 bg-gray-100 rounded">.json</span>
            <span className="px-2 py-1 bg-gray-100 rounded">.xlsx</span>
            <span className="px-2 py-1 bg-gray-100 rounded">.ifc</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.tsv,.json,.xlsx,.xls,.ifc,.pdf,.dwfx"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((uploadedFile, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-4 rounded-lg border ${
                uploadedFile.status === "success"
                  ? "bg-green-50 border-green-200"
                  : uploadedFile.status === "error"
                  ? "bg-red-50 border-red-200"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex-shrink-0">
                {uploadedFile.status === "success" && <CheckCircle className="w-5 h-5 text-green-600" />}
                {uploadedFile.status === "error" && <XCircle className="w-5 h-5 text-red-600" />}
                {uploadedFile.status === "parsing" && <Loader2 className="w-5 h-5 text-accent animate-spin" />}
                {uploadedFile.status === "pending" && <FileText className="w-5 h-5 text-gray-400" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{uploadedFile.file.name}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="capitalize">{uploadedFile.type.replace(/_/g, " ")}</span>
                  <span>•</span>
                  <span>{(uploadedFile.file.size / 1024).toFixed(0)} KB</span>
                  {uploadedFile.error && (
                    <>
                      <span>•</span>
                      <span className="text-red-600">{uploadedFile.error}</span>
                    </>
                  )}
                </div>
              </div>

              {uploadedFile.status === "parsing" && (
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${uploadedFile.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Merged Project Summary */}
      {unifiedProject && (
        <div className="bg-gradient-to-r from-green-50 to-accent-light border border-green-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-2">✅ Projeto Pronto para Análise!</h4>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-accent">{unifiedProject.mergedStats.totalArticles}</p>
                  <p className="text-xs text-gray-600">Artigos WBS</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">{unifiedProject.ifcAnalyses.length}</p>
                  <p className="text-xs text-gray-600">Ficheiros IFC</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {files.filter(f => f.status === "success").length}/{files.length}
                  </p>
                  <p className="text-xs text-gray-600">Ficheiros OK</p>
                </div>
              </div>
              <button
                onClick={() => onProjectReady(unifiedProject)}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Continuar para Correspondência de Preços →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

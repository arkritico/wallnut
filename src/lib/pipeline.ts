/**
 * End-to-end pipeline controller for Wallnut.
 *
 * Orchestrates the full workflow:
 *   ZIP upload -> parse -> classify -> extract coordinates -> geo lookup
 *   -> analyze -> generate outputs
 *
 * Each stage reports progress via an optional callback with Portuguese
 * human-readable messages. The pipeline is resilient: failures in optional
 * stages (geo lookup, cost estimation, extrapolation) produce warnings
 * rather than aborting the entire run.
 */

import type { BuildingProject, AnalysisResult } from "./types";
import type { ExtractedFile, ZipProcessResult } from "./zip-processor";
import type { ChecklistResult } from "./document-checklist";
import type { GeoLookupResult } from "./geospatial";
import type { CostSummary } from "./cost-estimation";
import type { ExtrapolationResult } from "./project-extrapolator";
import type { WbsArticle, ScheduleTask } from "./wbs-types";
import type { ParsedBoq } from "./xlsx-parser";
import type { ExtractedCoordinates } from "./coordinate-extractor";

// ============================================================
// Types
// ============================================================

export type PipelineStage =
  | "upload"       // ZIP received
  | "classify"     // Files classified
  | "parse"        // Documents parsed, fields extracted
  | "locate"       // Coordinates extracted, geo lookup done
  | "checklist"    // Document completeness evaluated
  | "analyze"      // Regulatory analysis done
  | "extrapolate"  // Project stage detected, costs/schedule extrapolated
  | "complete";    // All outputs ready

export interface PipelineProgress {
  stage: PipelineStage;
  percent: number;        // 0-100
  message: string;        // Human-readable Portuguese message
  stagesCompleted: PipelineStage[];
}

export interface PipelineOptions {
  /** Skip AI-assisted classification refinement */
  skipAIClassification?: boolean;
  /** Skip geo lookup (if coordinates not found) */
  skipGeoLookup?: boolean;
  /** Include cost estimation in output */
  includeCostEstimation?: boolean;
  /** Include MS Project schedule in output */
  includeSchedule?: boolean;
  /** Include project extrapolation */
  includeExtrapolation?: boolean;
  /** Existing partial project data to merge with */
  existingProject?: Partial<BuildingProject>;
  /** Progress callback */
  onProgress?: (progress: PipelineProgress) => void;
}

export interface PipelineResult {
  /** The assembled BuildingProject */
  project: BuildingProject;
  /** ZIP processing result */
  zipResult: ZipProcessResult;
  /** Document completeness checklist */
  checklist: ChecklistResult;
  /** Regulatory analysis result */
  analysis: AnalysisResult;
  /** Extracted coordinates (if found) */
  coordinates?: ExtractedCoordinates;
  /** Geo lookup result (if coordinates found) */
  geoLookup?: GeoLookupResult;
  /** Cost estimation (if requested) */
  costEstimation?: CostSummary;
  /** Project extrapolation (if requested) */
  extrapolation?: ExtrapolationResult;
  /** WBS remediation articles */
  wbsArticles?: WbsArticle[];
  /** Licensing phase schedule tasks (pre-construction + post-construction) */
  licensingPhases?: ScheduleTask[];
  /** Parsed BOQ from uploaded Excel files */
  parsedBoq?: ParsedBoq;
  /** Warnings from all stages */
  warnings: string[];
  /** Processing time in ms */
  processingTimeMs: number;
}

// ============================================================
// Stage weights for progress calculation
// ============================================================

const STAGE_WEIGHTS: Record<PipelineStage, number> = {
  upload: 15,
  classify: 5,
  parse: 30,
  locate: 10,
  checklist: 5,
  analyze: 15,
  extrapolate: 15,
  complete: 5,
};

// ============================================================
// Progress helper
// ============================================================

function createProgressReporter(onProgress?: (progress: PipelineProgress) => void) {
  const stagesCompleted: PipelineStage[] = [];
  let cumulativePercent = 0;

  return {
    report(stage: PipelineStage, message: string) {
      if (!onProgress) return;
      onProgress({
        stage,
        percent: Math.min(100, Math.round(cumulativePercent)),
        message,
        stagesCompleted: [...stagesCompleted],
      });
    },

    completeStage(stage: PipelineStage) {
      stagesCompleted.push(stage);
      cumulativePercent += STAGE_WEIGHTS[stage];
    },

    /** Report progress within a stage (fractional advancement). */
    reportPartial(stage: PipelineStage, fraction: number, message: string) {
      if (!onProgress) return;
      const partial = cumulativePercent + STAGE_WEIGHTS[stage] * Math.min(1, fraction);
      onProgress({
        stage,
        percent: Math.min(100, Math.round(partial)),
        message,
        stagesCompleted: [...stagesCompleted],
      });
    },
  };
}

// ============================================================
// Pipeline runner
// ============================================================

/**
 * Run the full analysis pipeline from a ZIP file upload to final outputs.
 *
 * Stages:
 *   1. Upload     — extract and classify files from ZIP
 *   2. Classify   — optionally refine classification with AI
 *   3. Parse      — extract text, parse documents, extract BOQ data
 *   4. Locate     — extract coordinates, geo lookup
 *   5. Checklist  — evaluate document completeness
 *   6. Analyze    — run regulatory analysis
 *   7. Extrapolate — cost/schedule/WBS extrapolation (if enabled)
 *   8. Complete   — assemble final result
 *
 * @param zipFile - The uploaded ZIP file
 * @param options - Pipeline configuration
 * @returns Full pipeline result with all outputs
 */
export async function runPipeline(
  zipFile: File,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const startTime = performance.now();
  const opts = options ?? {};
  const warnings: string[] = [];
  const progress = createProgressReporter(opts.onProgress);

  // Lazy-load all modules to avoid circular imports and reduce initial bundle
  const [
    { processZipFile, refineClassificationWithAI },
    { extractTextFromFile, parseDocumentWithAI, mergeExtractedData },
    { evaluateChecklist, contextFromProject },
    { extractCoordinatesFromText, validatePortugalCoordinates },
    { lookupLocation, suggestWaterUtility },
    { analyzeProject },
    { extrapolateProject, fromBuildingProject },
    { estimateCosts },
    { findingsToWbs },
    { parseExcelFile },
    { DEFAULT_PROJECT },
  ] = await Promise.all([
    import("./zip-processor"),
    import("./document-parser"),
    import("./document-checklist"),
    import("./coordinate-extractor"),
    import("./geospatial"),
    import("./analyzer"),
    import("./project-extrapolator"),
    import("./cost-estimation"),
    import("./findings-to-wbs"),
    import("./xlsx-parser"),
    import("./defaults"),
  ]);

  // Start with default project, optionally merged with existing data
  let project: BuildingProject = { ...DEFAULT_PROJECT };
  if (opts.existingProject) {
    project = deepMerge(
      project as unknown as Record<string, unknown>,
      opts.existingProject as unknown as Record<string, unknown>,
    ) as unknown as BuildingProject;
  }

  // ─── Stage 1: Upload ──────────────────────────────────────
  progress.report("upload", "A processar ficheiro ZIP...");

  let zipResult: ZipProcessResult;
  try {
    zipResult = await processZipFile(zipFile);
    warnings.push(...zipResult.warnings);
  } catch (err) {
    throw new PipelineError(
      "upload",
      `Falha ao processar o ficheiro ZIP: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (zipResult.files.length === 0) {
    throw new PipelineError("upload", "O ficheiro ZIP não contém documentos suportados.");
  }

  progress.completeStage("upload");

  // ─── Stage 2: Classify ────────────────────────────────────
  progress.report("classify", "A classificar documentos...");

  let classifiedFiles = zipResult.files;
  if (!opts.skipAIClassification) {
    try {
      classifiedFiles = await refineClassificationWithAI(classifiedFiles);
      // Update the zipResult with refined classifications
      zipResult = {
        ...zipResult,
        files: classifiedFiles,
        byCategory: buildCategoryMap(classifiedFiles),
      };
    } catch {
      warnings.push("Classificação por IA indisponível — utilizada classificação heurística.");
    }
  }

  progress.completeStage("classify");

  // ─── Stage 3: Parse ───────────────────────────────────────
  progress.report("parse", "A analisar documentos...");

  // Identify parseable documents (written docs + specialty projects)
  const parseableCategories = new Set([
    "memoria_descritiva",
    "projeto_estruturas",
    "projeto_scie",
    "projeto_avac",
    "projeto_aguas",
    "projeto_gas",
    "projeto_eletrico",
    "projeto_ited",
    "projeto_acustico",
    "projeto_termico",
  ]);

  const parseableFiles = classifiedFiles.filter(
    f => parseableCategories.has(f.category) && isPdfOrTextFile(f),
  );

  // Parse each document and merge extracted data
  let parsedCount = 0;
  for (const file of parseableFiles) {
    try {
      progress.reportPartial(
        "parse",
        parsedCount / Math.max(1, parseableFiles.length),
        `A analisar ${file.name}...`,
      );

      const fileObj = extractedFileToFile(file);
      const text = await extractTextFromFile(fileObj);

      if (text.trim().length > 50) {
        const parsed = await parseDocumentWithAI(text, project);
        project = mergeExtractedData(project, parsed);
        warnings.push(...parsed.warnings);
      }
    } catch (err) {
      warnings.push(
        `Erro ao analisar ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    parsedCount++;
  }

  // Parse BOQ/budget Excel files
  let parsedBoq: ParsedBoq | undefined;
  const boqFiles = classifiedFiles.filter(
    f => (f.category === "boq" || f.category === "orcamento") && isSpreadsheetFile(f),
  );

  if (boqFiles.length > 0) {
    try {
      progress.reportPartial("parse", 0.9, "A processar mapa de quantidades...");
      const xlsResult = parseExcelFile(boqFiles[0].data);
      if (xlsResult.boqs.length > 0) {
        parsedBoq = xlsResult.boqs[0];
        warnings.push(...xlsResult.warnings);
      }
    } catch (err) {
      warnings.push(
        `Erro ao processar BOQ: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  progress.completeStage("parse");

  // ─── Stage 4: Locate ──────────────────────────────────────
  progress.report("locate", "A extrair coordenadas...");

  let bestCoordinates: ExtractedCoordinates | undefined;
  let geoLookup: GeoLookupResult | undefined;

  // Find files with hasCoordinates flag
  const coordinateFiles = classifiedFiles.filter(f => f.hasCoordinates && isPdfOrTextFile(f));

  for (const file of coordinateFiles) {
    try {
      const fileObj = extractedFileToFile(file);
      const text = await extractTextFromFile(fileObj);
      const coords = extractCoordinatesFromText(text, file.name);

      if (coords.length > 0) {
        // Use the highest-confidence result
        const best = coords[0];

        if (!bestCoordinates || confidenceRank(best.confidence) > confidenceRank(bestCoordinates.confidence)) {
          bestCoordinates = best;
        }
      }
    } catch (err) {
      warnings.push(
        `Erro ao extrair coordenadas de ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // If coordinates found, do geo lookup and merge into project
  if (bestCoordinates && validatePortugalCoordinates(bestCoordinates.latitude, bestCoordinates.longitude)) {
    // Merge coordinates into project location
    project.location = {
      ...project.location,
      latitude: bestCoordinates.latitude,
      longitude: bestCoordinates.longitude,
    };

    if (!opts.skipGeoLookup) {
      try {
        progress.reportPartial("locate", 0.5, "A consultar serviços geoespaciais...");
        geoLookup = await lookupLocation({
          latitude: bestCoordinates.latitude,
          longitude: bestCoordinates.longitude,
        });

        // Merge geo lookup into project
        if (geoLookup.parish && !project.location.parish) {
          project.location.parish = geoLookup.parish;
        }
        if (geoLookup.seismicZone) {
          project.structural = {
            ...project.structural,
            seismicZone: geoLookup.seismicZone as BuildingProject["structural"]["seismicZone"],
          };
        }
        if (geoLookup.isInARU) {
          project.licensing = {
            ...project.licensing,
            isInARU: true,
          };
        }
        if (geoLookup.isInRAN || geoLookup.isInREN || geoLookup.isInNatura2000) {
          project.licensing = {
            ...project.licensing,
            isProtectedArea: true,
          };
        }
        if (geoLookup.pdmZoning) {
          project.localRegulations = {
            ...project.localRegulations,
            pdmZoning: geoLookup.pdmZoning,
          };
        }

        if (geoLookup.error) {
          warnings.push(geoLookup.error);
        }
      } catch (err) {
        warnings.push(
          `Consulta geoespacial falhou: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Suggest water utility
    if (project.location.municipality) {
      const waterUtility = suggestWaterUtility(project.location.municipality);
      if (waterUtility && !project.localRegulations.waterUtilityProvider) {
        project.localRegulations = {
          ...project.localRegulations,
          waterUtilityProvider: waterUtility,
        };
      }
    }
  } else if (coordinateFiles.length > 0) {
    warnings.push("Não foram encontradas coordenadas válidas nos documentos de localização.");
  }

  progress.completeStage("locate");

  // ─── Stage 5: Checklist ───────────────────────────────────
  progress.report("checklist", "A avaliar completude documental...");

  const checklistCtx = contextFromProject(project);
  const uploadedCategories = classifiedFiles.map(f => f.category);
  const checklist = evaluateChecklist(checklistCtx, uploadedCategories);

  if (checklist.summary.missing > 0) {
    const missingNames = checklist.missingMandatory
      .map(item => item.document.namePt)
      .join(", ");
    if (missingNames) {
      warnings.push(`Documentos obrigatórios em falta: ${missingNames}`);
    }
  }

  progress.completeStage("checklist");

  // ─── Stage 6: Analyze ─────────────────────────────────────
  progress.report("analyze", "A executar análise regulamentar...");

  let analysis: AnalysisResult;
  try {
    analysis = await analyzeProject(project);
  } catch (err) {
    throw new PipelineError(
      "analyze",
      `Análise regulamentar falhou: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  progress.completeStage("analyze");

  // ─── Stage 7: Extrapolate ─────────────────────────────────
  progress.report("extrapolate", "A extrapolar custos e calendarização...");

  let costEstimation: CostSummary | undefined;
  let extrapolation: ExtrapolationResult | undefined;
  let wbsArticles: WbsArticle[] | undefined;
  let licensingPhases: ScheduleTask[] | undefined;

  // Cost estimation (from findings)
  if (opts.includeCostEstimation !== false) {
    try {
      progress.reportPartial("extrapolate", 0.2, "A estimar custos de remediação...");
      costEstimation = estimateCosts(analysis.findings, project);
    } catch (err) {
      warnings.push(
        `Estimativa de custos falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Project extrapolation
  if (opts.includeExtrapolation !== false) {
    try {
      progress.reportPartial("extrapolate", 0.5, "A extrapolar projeto...");
      const extInput = fromBuildingProject(project);
      extrapolation = extrapolateProject(extInput);
      warnings.push(...extrapolation.warnings);
    } catch (err) {
      warnings.push(
        `Extrapolação falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // WBS remediation articles
  try {
    progress.reportPartial("extrapolate", 0.8, "A gerar artigos de remediação...");
    const articles = findingsToWbs(analysis.findings);
    if (articles.length > 0) {
      wbsArticles = articles;
    }
  } catch (err) {
    warnings.push(
      `Geração de WBS falhou: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Licensing phases (DL 10/2024 timeline bridge)
  try {
    progress.reportPartial("extrapolate", 0.9, "A gerar fases de licenciamento...");
    const { generateLicensingPhases } = await import("./licensing-phases");
    const licensingResult = generateLicensingPhases(project, analysis.findings, {
      includePostConstruction: true,
      startingUid: 8000,
    });
    if (licensingResult.allTasks.length > 0) {
      licensingPhases = licensingResult.allTasks;
    }
  } catch (err) {
    warnings.push(
      `Geração de fases de licenciamento falhou: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  progress.completeStage("extrapolate");

  // ─── Stage 8: Complete ────────────────────────────────────
  progress.report("complete", "Pipeline concluída.");
  progress.completeStage("complete");

  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    project,
    zipResult,
    checklist,
    analysis,
    coordinates: bestCoordinates,
    geoLookup,
    costEstimation,
    extrapolation,
    wbsArticles,
    licensingPhases,
    parsedBoq,
    warnings,
    processingTimeMs,
  };
}

// ============================================================
// Pipeline error
// ============================================================

export class PipelineError extends Error {
  constructor(
    public readonly stage: PipelineStage,
    message: string,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert an ExtractedFile (with ArrayBuffer data) into a File object
 * suitable for document-parser functions.
 */
function extractedFileToFile(ef: ExtractedFile): File {
  return new File([ef.data], ef.name, { type: ef.mimeType });
}

/**
 * Check if a file is a PDF or text-based document that can be text-extracted.
 */
function isPdfOrTextFile(f: ExtractedFile): boolean {
  const textExts = new Set(["pdf", "doc", "docx", "odt", "rtf", "txt"]);
  return textExts.has(f.extension);
}

/**
 * Check if a file is a spreadsheet.
 */
function isSpreadsheetFile(f: ExtractedFile): boolean {
  const exts = new Set(["xls", "xlsx", "ods", "csv"]);
  return exts.has(f.extension);
}

/**
 * Rebuild the byCategory map from a list of classified files.
 */
function buildCategoryMap(
  files: ExtractedFile[],
): Record<string, ExtractedFile[]> {
  const map: Record<string, ExtractedFile[]> = {};
  for (const file of files) {
    if (!map[file.category]) {
      map[file.category] = [];
    }
    map[file.category].push(file);
  }
  return map;
}

/**
 * Map confidence string to a numeric rank for comparison.
 */
function confidenceRank(c: "high" | "medium" | "low"): number {
  const ranks: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return ranks[c] ?? 0;
}

/**
 * Deep merge two objects. Arrays are replaced, not concatenated.
 * The second object's values take precedence over the first.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === "object" &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}

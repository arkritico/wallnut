/**
 * Unified Multi-File Pipeline
 *
 * Accepts individual files (IFC, PDF, XLS/XLSX, CSV) and orchestrates
 * the full analysis workflow, generating:
 *   - Budget Excel
 *   - MS Project XML
 *   - Compliance Excel
 *
 * Unlike pipeline.ts (ZIP-oriented), this accepts loose files and auto-detects
 * the right processing path:
 *   - IFC only → auto-generate BOQ from IFC, then cost/schedule/compliance
 *   - BOQ only → skip IFC enrichment, cost/schedule/compliance
 *   - IFC + BOQ → use uploaded BOQ, enrich with IFC data
 *   - XML → import MS Project schedule, apply optimizations
 *   - PDF only → extract text, AI parse, compliance
 *   - Any combination → combine all available data
 */

import type { BuildingProject, AnalysisResult } from "./types";
import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
import type { WbsProject, WbsArticle, PriceMatch, MatchReport, ProjectSchedule } from "./wbs-types";
import type { ProjectResources } from "./resource-aggregator";
import type { LaborConstraint } from "./labor-constraints";
import type { GeneratedBoq } from "./keynote-resolver";
import type { CostSummary } from "./cost-estimation";
import type { ElementTaskMappingResult } from "./element-task-mapper";
import type { CashFlowResult } from "./cashflow";
import type { ReconciledBoq } from "./boq-reconciliation";
import type { ParsedBoq } from "./xlsx-parser";
import type { ScheduleDiagnostic } from "./msproject-import";
import type { AIEstimateResult, ReconciliationReport } from "./ai-estimate-types";
import type { AIReviewResult } from "./ai-feedback-types";
import { resolveUrl } from "./resolve-url";
import type { AiSequenceResult } from "./ai-construction-sequencer";
import type { ReviewedFinding } from "./ai-deep-analyzer";

// ============================================================
// Types
// ============================================================

/**
 * Analysis depth controls how much AI investment is made per pipeline run.
 *
 * - `quick`    — Fast preliminary. Sonnet for sequencing, skip AI PDF parsing.
 *                Good for initial scoping. (~€0.10-0.50)
 * - `standard` — Balanced. Opus single-pass, AI PDF parsing. (~€2-8)
 * - `deep`     — Multi-pass. Opus + extended thinking always on.
 *                PDFs parsed first, enriched context fed to sequencer,
 *                validation + refinement passes, regulatory double-check.
 *                For bid preparation. (~€15-40)
 */
export type AnalysisDepth = "quick" | "standard" | "deep";

export type UnifiedStage =
  | "classify"
  | "parse_ifc"
  | "ai_sequence"
  | "parse_boq"
  | "parse_pdf"
  | "analyze"
  | "ai_estimate"
  | "estimate"
  | "reconcile"
  | "schedule"
  | "export";

export interface UnifiedProgress {
  stage: UnifiedStage;
  percent: number;
  message: string;
  stagesCompleted: UnifiedStage[];
}

export interface UnifiedPipelineInput {
  files: File[];
  options: {
    includeCosts?: boolean;
    includeSchedule?: boolean;
    includeCompliance?: boolean;
    /** Enable AI-first estimation (default: true). Falls back to algorithmic if API unavailable. */
    includeAIEstimate?: boolean;
    existingProject?: Partial<BuildingProject>;
    /** Pre-parsed IFC analyses from client-side Web Worker. Skips server parse_ifc stage. */
    ifcAnalyses?: SpecialtyAnalysisResult[];
    /** Analysis depth: quick (preliminary) | standard (default) | deep (bid-ready). */
    analysisDepth?: AnalysisDepth;
    onProgress?: (progress: UnifiedProgress) => void;
  };
}

export interface UnifiedPipelineResult {
  project: BuildingProject;
  wbsProject?: WbsProject;
  analysis?: AnalysisResult;
  matchReport?: MatchReport;
  schedule?: ProjectSchedule;
  laborConstraint?: LaborConstraint;
  resources?: ProjectResources;
  generatedBoq?: GeneratedBoq;
  ifcAnalyses?: SpecialtyAnalysisResult[];
  budgetExcel?: ArrayBuffer;
  msProjectXml?: string;
  ccpmGanttExcel?: ArrayBuffer;
  elementMapping?: ElementTaskMappingResult;
  cashFlow?: CashFlowResult;
  reconciledBoq?: ReconciledBoq;
  parsedBoq?: ParsedBoq;
  complianceExcel?: ArrayBuffer;
  /** AI-driven cost estimate (work packages, risks, assumptions) */
  aiEstimate?: AIEstimateResult;
  /** Reconciliation between AI and algorithmic estimates */
  reconciliation?: ReconciliationReport;
  /** AI review of algorithmic matches (Pass 3 — THE JUDGE) */
  aiReview?: AIReviewResult;
  /** Imported schedule from MS Project XML (before optimization) */
  importedSchedule?: ProjectSchedule;
  /** Import diagnostics/suggestions from XML schedule */
  scheduleDiagnostics?: ScheduleDiagnostic[];
  /** AI-generated construction sequence (when available) */
  aiSequence?: AiSequenceResult;
  /** AI regulatory review of findings — ranked by severity and relevance (deep mode) */
  regulatoryReview?: ReviewedFinding[];
  /** Analysis depth used for this run */
  analysisDepth?: AnalysisDepth;
  /** Raw IFC file bytes for 4D viewer (client-side only, not serialized to server) */
  ifcFileData?: Uint8Array;
  /** Original IFC file name */
  ifcFileName?: string;
  warnings: string[];
  processingTimeMs: number;
}

// ============================================================
// Classified file groups
// ============================================================

interface ClassifiedFiles {
  ifc: File[];
  boq: File[];  // xls, xlsx, csv
  pdf: File[];
  schedule: File[];  // xml (MS Project)
  other: File[];
}

// ============================================================
// Stage weights for progress
// ============================================================

const STAGE_WEIGHTS: Record<UnifiedStage, number> = {
  classify: 5,
  parse_ifc: 15,
  parse_boq: 10,
  parse_pdf: 15,
  analyze: 7,
  ai_estimate: 12,
  ai_sequence: 8,
  estimate: 5,
  reconcile: 3,
  schedule: 7,
  export: 10,
};

// ============================================================
// Progress helper
// ============================================================

function createProgressReporter(onProgress?: (progress: UnifiedProgress) => void) {
  const stagesCompleted: UnifiedStage[] = [];
  let cumulativePercent = 0;

  return {
    report(stage: UnifiedStage, message: string) {
      if (!onProgress) return;
      onProgress({
        stage,
        percent: Math.min(100, Math.round(cumulativePercent)),
        message,
        stagesCompleted: [...stagesCompleted],
      });
    },

    completeStage(stage: UnifiedStage) {
      stagesCompleted.push(stage);
      cumulativePercent += STAGE_WEIGHTS[stage];
    },

    reportPartial(stage: UnifiedStage, fraction: number, message: string) {
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
// File classification
// ============================================================

function classifyFiles(files: File[]): ClassifiedFiles {
  const result: ClassifiedFiles = { ifc: [], boq: [], pdf: [], schedule: [], other: [] };

  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (ext === "ifc") {
      result.ifc.push(file);
    } else if (["xls", "xlsx", "csv"].includes(ext)) {
      result.boq.push(file);
    } else if (ext === "pdf") {
      result.pdf.push(file);
    } else if (ext === "xml") {
      result.schedule.push(file);
    } else {
      result.other.push(file);
    }
  }

  return result;
}

// ============================================================
// Pipeline runner
// ============================================================

/**
 * Run the unified multi-file pipeline.
 *
 * Stages:
 *   1. Classify — sort files by type (IFC/BOQ/PDF/XML)
 *   2. Parse IFC — analyze IFC files, extract quantities, enrich project
 *   3. Parse BOQ — parse uploaded spreadsheet OR generate from IFC
 *   3b. Parse XML — import MS Project schedule (if provided)
 *   4. Parse PDF — split large PDFs, extract text, AI parse
 *   5. Analyze — regulatory compliance analysis
 *   6. Estimate — CYPE match + cost + labor constraints
 *   7. Schedule — use imported schedule OR generate with CCPM
 *   8. Export — generate downloadable outputs
 */
export async function runUnifiedPipeline(
  input: UnifiedPipelineInput,
): Promise<UnifiedPipelineResult> {
  const startTime = performance.now();
  const opts = input.options;
  const warnings: string[] = [];
  const progress = createProgressReporter(opts.onProgress);

  // ─── Stage 1: Classify ─────────────────────────────────────
  progress.report("classify", "A classificar ficheiros...");
  const classified = classifyFiles(input.files);

  if (classified.ifc.length === 0 && classified.boq.length === 0 && classified.pdf.length === 0 && classified.schedule.length === 0) {
    warnings.push("Nenhum ficheiro reconhecido (IFC, XLS/XLSX, PDF, XML).");
  }

  progress.completeStage("classify");

  // Lazy-load modules as needed
  const { DEFAULT_PROJECT } = await import("./defaults");
  let project: BuildingProject = { ...DEFAULT_PROJECT };
  if (opts.existingProject) {
    project = deepMerge(project, opts.existingProject as Partial<BuildingProject>);
  }

  let wbsProject: WbsProject | undefined;
  let ifcAnalyses: SpecialtyAnalysisResult[] | undefined;
  let generatedBoq: GeneratedBoq | undefined;
  let matchReport: MatchReport | undefined;
  let schedule: ProjectSchedule | undefined;
  let laborConstraint: LaborConstraint | undefined;
  let resources: ProjectResources | undefined;
  let analysis: AnalysisResult | undefined;
  let budgetExcel: ArrayBuffer | undefined;
  let msProjectXml: string | undefined;
  let complianceExcel: ArrayBuffer | undefined;
  let ccpmGanttExcel: ArrayBuffer | undefined;
  let parsedBoq: ParsedBoq | undefined;
  let reconciledBoq: ReconciledBoq | undefined;
  let importedSchedule: ProjectSchedule | undefined;
  let scheduleDiagnostics: ScheduleDiagnostic[] | undefined;
  let aiEstimate: AIEstimateResult | undefined;
  let reconciliation: ReconciliationReport | undefined;
  let aiReview: AIReviewResult | undefined;
  const collectedPdfTexts: string[] = [];
  let aiSequence: AiSequenceResult | undefined;
  let regulatoryReview: ReviewedFinding[] | undefined;
  let pdfTexts: string[] = [];
  const depth: AnalysisDepth = opts.analysisDepth ?? "standard";

  // ─── Stage 2: Parse IFC ────────────────────────────────────
  progress.report("parse_ifc", "A analisar ficheiros IFC...");

  if (opts.ifcAnalyses && opts.ifcAnalyses.length > 0) {
    // Client already parsed IFC in the browser — use pre-parsed results
    ifcAnalyses = opts.ifcAnalyses;
    progress.reportPartial("parse_ifc", 0.5, "IFC pré-analisado no browser.");

    try {
      const { specialtyAnalysisToProjectFields } = await import("./ifc-enrichment");
      const enrichment = specialtyAnalysisToProjectFields(ifcAnalyses);
      for (const [key, value] of Object.entries(enrichment.fields)) {
        setNestedField(project, key, value);
      }
      if (enrichment.report.populatedFields.length > 0) {
        const fieldCount = enrichment.report.populatedFields.length;
        warnings.push(`IFC enriqueceu ${fieldCount} campos do projeto.`);
      }
    } catch (err) {
      warnings.push(`Erro ao enriquecer projeto com IFC: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (classified.ifc.length > 0) {
    // Backward compatibility: server-side parsing for raw IFC files
    try {
      const { analyzeIfcSpecialty } = await import("./ifc-specialty-analyzer");
      const { specialtyAnalysisToProjectFields } = await import("./ifc-enrichment");

      const analyses: SpecialtyAnalysisResult[] = [];
      for (let i = 0; i < classified.ifc.length; i++) {
        progress.reportPartial(
          "parse_ifc",
          i / classified.ifc.length,
          `A analisar ${classified.ifc[i].name}...`,
        );
        const content = await classified.ifc[i].text();
        const result = analyzeIfcSpecialty(content);
        analyses.push(result);
      }

      ifcAnalyses = analyses;

      // Enrich BuildingProject from IFC data
      const enrichment = specialtyAnalysisToProjectFields(analyses);
      for (const [key, value] of Object.entries(enrichment.fields)) {
        setNestedField(project, key, value);
      }

      // Report enriched field count
      if (enrichment.report.populatedFields.length > 0) {
        const fieldCount = enrichment.report.populatedFields.length;
        warnings.push(`IFC enriqueceu ${fieldCount} campos do projeto.`);
      }
    } catch (err) {
      warnings.push(`Erro ao analisar IFC: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  progress.completeStage("parse_ifc");

  // ─── Deep mode: parse BOQ + PDF BEFORE AI sequencing ─────────
  // In deep mode we reorder stages so the AI sequencer has full context
  // from all documents. In standard/quick mode, the original order is kept.
  const isDeep = depth === "deep";

  if (isDeep) {
    // Deep mode: parse BOQ first (Stage 3 early)
    progress.report("parse_boq", "A processar mapa de quantidades...");
    const boqResult = await parseBoqStage(classified, ifcAnalyses, project, warnings, progress);
    wbsProject = boqResult.wbsProject;
    generatedBoq = boqResult.generatedBoq;
    parsedBoq = boqResult.parsedBoq;
    progress.completeStage("parse_boq");

    // Deep mode: parse PDFs next (Stage 4 early)
    progress.report("parse_pdf", "A extrair texto de documentos PDF...");
    const pdfResult = await parsePdfStage(classified, project, warnings, progress, depth);
    project = pdfResult.project;
    pdfTexts = pdfResult.pdfTexts;
    progress.completeStage("parse_pdf");
  }

  // ─── Stage 2b: AI Construction Sequence ──────────────────────
  if (ifcAnalyses && ifcAnalyses.length > 0 && process.env.ANTHROPIC_API_KEY) {
    progress.report("ai_sequence", "IA a analisar sequência construtiva...");
    try {
      const { generateAiSequence } = await import("./ai-construction-sequencer");

      // In deep mode, assemble enriched context from all parsed data
      let enrichedContext: string | undefined;
      if (isDeep) {
        progress.reportPartial("ai_sequence", 0.05, "IA: Montando contexto do projeto...");
        const { assembleEnrichedContext } = await import("./ai-deep-analyzer");
        enrichedContext = assembleEnrichedContext({
          project,
          ifcAnalyses,
          wbsProject,
          pdfTexts,
          apiKey: process.env.ANTHROPIC_API_KEY!,
        });
      }

      progress.reportPartial("ai_sequence", 0.1, "IA: Gerando sequência construtiva...");
      aiSequence = await generateAiSequence(ifcAnalyses, project, {
        analysisDepth: depth,
        enrichedContext,
      });

      const aiCoverage = aiSequence.elementMapping.size;
      const aiTotal = aiCoverage + aiSequence.unmappedElements.length;

      // Deep mode: validate + refine the sequence
      if (isDeep && aiSequence.steps.length > 0) {
        try {
          progress.reportPartial("ai_sequence", 0.5, "IA: Validando sequência...");
          const { validateSequence, refineSequence } = await import("./ai-deep-analyzer");
          const validation = await validateSequence(
            aiSequence,
            enrichedContext ?? "",
            process.env.ANTHROPIC_API_KEY!,
          );

          aiSequence.tokenUsage.input += validation.tokenUsage.input;
          aiSequence.tokenUsage.output += validation.tokenUsage.output;

          const actionableFindings = validation.findings.filter(f => f.severity !== "info");
          if (actionableFindings.length > 0) {
            progress.reportPartial("ai_sequence", 0.7, "IA: Refinando sequência...");

            // Collect all element IDs for validation
            const allElementIds = new Set<string>();
            for (const step of aiSequence.steps) {
              for (const id of step.elementIds) allElementIds.add(id);
            }
            for (const id of aiSequence.unmappedElements) allElementIds.add(id);

            try {
              const refined = await refineSequence(
                aiSequence,
                validation.findings,
                enrichedContext ?? "",
                allElementIds,
                process.env.ANTHROPIC_API_KEY!,
              );

              // Rebuild element mapping from refined steps
              const newMapping = new Map<string, { stepId: string; phase: import("./wbs-types").ConstructionPhase; confidence: number }>();
              const newMappedIds = new Set<string>();
              for (const step of refined.steps) {
                for (const elementId of step.elementIds) {
                  newMapping.set(elementId, { stepId: step.stepId, phase: step.phase, confidence: 92 });
                  newMappedIds.add(elementId);
                }
              }

              aiSequence = {
                ...aiSequence,
                steps: refined.steps,
                aiRationale: refined.rationale,
                elementMapping: newMapping,
                unmappedElements: Array.from(allElementIds).filter(id => !newMappedIds.has(id)),
                tokenUsage: {
                  input: aiSequence.tokenUsage.input + refined.tokenUsage.input,
                  output: aiSequence.tokenUsage.output + refined.tokenUsage.output,
                },
              };

              warnings.push(
                `IA profunda: ${validation.findings.length} constatações na validação → ` +
                `sequência refinada (${actionableFindings.length} problemas corrigidos).`,
              );
            } catch (refineErr) {
              warnings.push(
                `Refinamento IA falhou: ${refineErr instanceof Error ? refineErr.message : String(refineErr)}. ` +
                `Sequência original mantida.`,
              );
            }
          } else {
            warnings.push(
              `Validação IA: sequência aprovada sem problemas significativos ` +
              `(${validation.findings.length} observações informativas).`,
            );
          }
        } catch (valErr) {
          warnings.push(
            `Validação IA indisponível: ${valErr instanceof Error ? valErr.message : String(valErr)}.`,
          );
        }
      }

      if (aiSequence.unmappedElements.length > 0) {
        warnings.push(
          `IA sequenciou ${aiCoverage}/${aiTotal} elementos ` +
          `(cobertura: ${aiTotal > 0 ? Math.round((aiCoverage / aiTotal) * 100) : 0}%).`,
        );
      } else {
        warnings.push(`IA sequenciou ${aiCoverage} elementos com sucesso.`);
      }
    } catch (err) {
      warnings.push(
        `Sequenciamento IA indisponível: ${err instanceof Error ? err.message : String(err)}. ` +
        `A usar sequência padrão.`,
      );
    }
  }
  progress.completeStage("ai_sequence");

  // ─── Stage 3: Parse BOQ (standard/quick — already done in deep) ──
  if (!isDeep) {
    progress.report("parse_boq", "A processar mapa de quantidades...");
    const boqResult = await parseBoqStage(classified, ifcAnalyses, project, warnings, progress);
    wbsProject = boqResult.wbsProject;
    generatedBoq = boqResult.generatedBoq;
    parsedBoq = boqResult.parsedBoq;
    progress.completeStage("parse_boq");

    // ─── Stage 4: Parse PDF (standard/quick — already done in deep) ──
    progress.report("parse_pdf", "A extrair texto de documentos PDF...");
    const pdfResult = await parsePdfStage(classified, project, warnings, progress, depth);
    project = pdfResult.project;
    pdfTexts = pdfResult.pdfTexts;
    progress.completeStage("parse_pdf");
  }

  // ─── Stage 3b: Parse Schedule XML ──────────────────────────
  if (classified.schedule.length > 0) {
    progress.reportPartial("parse_boq", 0.9, "A importar cronograma MS Project...");

    try {
      const { parseMSProjectXML, isMSProjectXML } = await import("./msproject-import");

      for (const file of classified.schedule) {
        const text = await file.text();
        if (!isMSProjectXML(text)) {
          warnings.push(`${file.name} não é um ficheiro MS Project XML válido.`);
          continue;
        }

        const importResult = parseMSProjectXML(text);
        importedSchedule = importResult.schedule;
        scheduleDiagnostics = importResult.diagnostics;

        // If no WBS from BOQ, use the schedule's extracted WBS
        if (!wbsProject) {
          wbsProject = importResult.wbsProject;
          warnings.push(
            `WBS extraído do cronograma ${file.name} (${importResult.wbsProject.chapters.length} capítulos).`,
          );
        }

        // Set project name from imported schedule if not already set
        if (importedSchedule.projectName && !project.name) {
          project.name = importedSchedule.projectName;
        }

        // Collect warning-level diagnostics
        for (const d of importResult.diagnostics.filter((d) => d.type === "warning")) {
          warnings.push(d.message);
        }

        if (classified.schedule.length > 1) {
          warnings.push(
            `Múltiplos ficheiros XML enviados. Apenas o primeiro (${file.name}) foi utilizado.`,
          );
        }
        break; // Use first valid XML only
      }
    } catch (err) {
      warnings.push(
        `Erro ao importar cronograma XML: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Stage 5: Analyze ──────────────────────────────────────
  if (opts.includeCompliance !== false) {
    progress.report("analyze", "A executar análise regulamentar...");

    try {
      const { analyzeProject } = await import("./analyzer");
      analysis = await analyzeProject(project);
    } catch (err) {
      warnings.push(
        `Análise regulamentar falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Deep mode: AI double-check of regulatory findings
  if (isDeep && analysis && analysis.findings.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const { reviewRegulatoryFindings } = await import("./ai-deep-analyzer");
      const findingsForReview = analysis.findings.map(f => ({
        id: f.id,
        area: f.area,
        description: f.description,
        severity: f.severity,
        regulation: f.regulation,
        article: f.article,
        currentValue: f.currentValue,
        requiredValue: f.requiredValue,
      }));

      const review = await reviewRegulatoryFindings(
        findingsForReview,
        project,
        pdfTexts,
        process.env.ANTHROPIC_API_KEY!,
      );

      regulatoryReview = review.reviewedFindings;
      const falsePositives = regulatoryReview.filter(r => !r.verified).length;
      if (falsePositives > 0) {
        warnings.push(
          `Revisão IA: ${falsePositives}/${regulatoryReview.length} constatações identificadas como possíveis falsos positivos.`,
        );
      }
      warnings.push(
        `Revisão regulamentar IA: ${regulatoryReview.length} constatações revistas e priorizadas por relevância.`,
      );
    } catch (err) {
      warnings.push(
        `Revisão regulamentar IA indisponível: ${err instanceof Error ? err.message : String(err)}.`,
      );
    }
  }

  progress.completeStage("analyze");

  // ─── Stage 5.5: AI Estimate ──────────────────────────────────
  if (opts.includeAIEstimate !== false) {
    progress.report("ai_estimate", "A gerar estimativa inteligente...");

    try {
      const { buildProjectSummaryForAI } = await import("./ai-estimate-prompts");
      const pdfText = collectedPdfTexts.join("\n\n");
      let summary = buildProjectSummaryForAI(project, ifcAnalyses, wbsProject, pdfText || undefined);

      // Inject few-shot examples from match history (compounding learning)
      try {
        const { getTopPatterns, formatPatternsForPrompt } = await import("./ai-feedback-store");
        const patterns = await getTopPatterns(10, project.buildingType);
        if (patterns.length > 0) {
          summary += "\n" + formatPatternsForPrompt(patterns);
        }
      } catch {
        // Non-critical: no historical patterns available yet
      }

      const apiUrl = resolveUrl("/api/ai-estimate");
      console.log(`[wallnut] AI estimate → ${apiUrl} (summary: ${summary.length} chars)`);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSummary: summary }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.available !== false) {
          aiEstimate = data as AIEstimateResult;
          console.log(`[wallnut] AI estimate complete: ${aiEstimate.workPackages?.length ?? 0} work packages, €${aiEstimate.totalEstimate?.min}-${aiEstimate.totalEstimate?.max}`);

          // If no BOQ was uploaded, use AI work packages as the WBS
          if (!wbsProject && aiEstimate) {
            const { aiEstimateToWbs } = await import("./ai-estimate-converter");
            wbsProject = aiEstimateToWbs(aiEstimate);
          }
        } else {
          // API returned available: false (likely missing ANTHROPIC_API_KEY)
          const reason = data.fallbackReason || "API indisponível";
          console.warn(`[wallnut] AI estimate skipped: ${reason}`);
          warnings.push(`Estimativa AI não disponível: ${reason}`);
        }
      } else {
        console.warn(`[wallnut] AI estimate HTTP ${response.status}`);
        warnings.push(`Estimativa AI falhou (HTTP ${response.status}). A continuar com estimativa algorítmica.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[wallnut] AI estimate error:`, msg);
      warnings.push(`Estimativa AI indisponível: ${msg}`);
    }
  }

  progress.completeStage("ai_estimate");

  // ─── Stage 6: Estimate (algorithmic) ─────────────────────────
  if (opts.includeCosts !== false && wbsProject) {
    progress.report("estimate", "A enriquecer com base de preços...");

    try {
      const { matchWbsToPrice } = await import("./price-matcher");
      const { inferMaxWorkers } = await import("./labor-constraints");

      matchReport = await matchWbsToPrice(wbsProject);

      // Infer labor constraint from total estimated cost
      const totalCost = matchReport.stats.totalEstimatedCost ?? 0;
      laborConstraint = inferMaxWorkers(totalCost);

      // Deep mode: AI-powered price estimation for unmatched articles
      // Uses the 8,500+ scraped prices/variants as reference context,
      // with AI filling gaps and providing procurement suggestions
      if (isDeep && matchReport.unmatched.length > 0 && process.env.ANTHROPIC_API_KEY) {
        try {
          progress.reportPartial("estimate", 0.6,
            `IA: Estimando preços para ${matchReport.unmatched.length} artigos sem correspondência ` +
            `(referência: ${matchReport.stats.matched} artigos da base de ${(await import("./price-matcher")).getPriceDatabase().then(db => db.length).catch(() => "8500+")} preços)...`,
          );
          const { estimateUnmatchedPrices, estimatesToPriceMatches } = await import("./ai-price-estimator");

          // Build article quantities map
          const articleQuantities = new Map<string, { quantity: number; unit: string }>();
          for (const ch of wbsProject.chapters) {
            for (const sc of ch.subChapters) {
              for (const art of sc.articles) {
                articleQuantities.set(art.code, { quantity: art.quantity, unit: art.unit });
              }
            }
          }

          const estimation = await estimateUnmatchedPrices(
            matchReport.unmatched,
            {
              buildingType: project.buildingType,
              location: project.location?.municipality ?? "Portugal",
              area: project.grossFloorArea,
              isRehabilitation: project.isRehabilitation,
            },
            process.env.ANTHROPIC_API_KEY!,
          );

          if (estimation.estimates.length > 0) {
            const aiMatches = estimatesToPriceMatches(estimation.estimates, articleQuantities);
            matchReport.matches.push(...aiMatches);

            // Remove AI-estimated articles from unmatched
            const estimatedCodes = new Set(estimation.estimates.map(e => e.articleCode));
            matchReport.unmatched = matchReport.unmatched.filter(u => !estimatedCodes.has(u.articleCode));

            // Recalculate stats
            const newTotal = matchReport.matches.reduce((sum, m) => sum + (m.estimatedCost ?? 0), 0);
            matchReport.stats.matched = matchReport.matches.length;
            matchReport.stats.unmatched = matchReport.unmatched.length;
            matchReport.stats.totalEstimatedCost = newTotal;
            matchReport.stats.coveragePercent = Math.round(
              (matchReport.stats.matched / matchReport.stats.totalArticles) * 100,
            );

            warnings.push(
              `IA estimou preços para ${estimation.estimates.length} artigos sem correspondência CYPE ` +
              `(${estimation.referenceGrounded} calibrados com preços reais da base, ` +
              `${estimation.unestimable.length} não estimáveis).`,
            );
          }
        } catch (err) {
          warnings.push(
            `Estimativa de preços IA falhou: ${err instanceof Error ? err.message : String(err)}.`,
          );
        }
      }

      if (matchReport.unmatched.length > 0) {
        warnings.push(
          `${matchReport.unmatched.length} artigos sem correspondência de preços (cobertura: ${matchReport.stats.coveragePercent}%).`,
        );
      }
    } catch (err) {
      warnings.push(
        `Estimativa de custos falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  progress.completeStage("estimate");

  // ─── Stage 6.5: Reconcile ────────────────────────────────────
  if (aiEstimate && matchReport) {
    progress.report("reconcile", "A reconciliar estimativas...");

    try {
      const { reconcileEstimates } = await import("./ai-estimate-reconciler");
      reconciliation = reconcileEstimates(aiEstimate, matchReport, wbsProject);

      if (reconciliation.verdict === "major_divergence") {
        warnings.push(
          `Divergência significativa (${reconciliation.overallDivergencePercent}%) entre estimativa AI e algorítmica.`,
        );
      }
    } catch (err) {
      warnings.push(
        `Reconciliação falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  progress.completeStage("reconcile");

  // ─── Pass 3: AI Review (fire-and-forget feedback loop) ────
  // Runs in parallel with remaining stages. Records match quality
  // for the compounding learning loop (few-shot examples in future runs).
  let aiReviewPromise: Promise<void> | undefined;
  if (aiEstimate && matchReport && reconciliation && opts.includeAIEstimate !== false) {
    aiReviewPromise = (async () => {
      try {
        const response = await fetch(resolveUrl("/api/ai-review"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiEstimate, matchReport, reconciliation }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.matchReviews) {
            aiReview = data as AIReviewResult;

            // Store feedback for future learning
            try {
              const { recordMatchFeedback } = await import("./ai-feedback-store");
              await recordMatchFeedback(
                project.name || "unknown",
                project.buildingType || "residential",
                project.isRehabilitation || false,
                matchReport.matches,
                aiReview.matchReviews,
              );
            } catch {
              // Non-critical: feedback store failure doesn't affect pipeline
            }
          }
        }
      } catch {
        // Non-critical: AI review failure doesn't affect pipeline
      }
    })();
  }

  // ─── Stage 6b: BOQ Reconciliation ──────────────────────────
  // When both an uploaded BOQ and IFC analysis exist, reconcile them
  if (parsedBoq && ifcAnalyses && ifcAnalyses.length > 0 && generatedBoq) {
    try {
      const { reconcileBoqs } = await import("./boq-reconciliation");

      // Flatten IFC-generated WBS articles for reconciliation
      const ifcArticles: WbsArticle[] = [];
      for (const ch of generatedBoq.project.chapters) {
        for (const sc of ch.subChapters) {
          for (const art of sc.articles) {
            ifcArticles.push(art);
          }
        }
      }

      // Collect raw IFC elements for direct keynote matching (Pass 0)
      const allIfcElements = ifcAnalyses.flatMap((a) => a.quantities);

      reconciledBoq = reconcileBoqs(parsedBoq, ifcArticles, {
        executionPriceMatches: matchReport?.matches,
        ifcPriceMatches: matchReport?.matches,
        ifcElements: allIfcElements,
      });

      if (reconciledBoq.stats.totalAdditions > 0) {
        warnings.push(
          `Reconciliação BOQ: ${reconciledBoq.stats.corroboratedByIfc}/${reconciledBoq.stats.totalExecution} ` +
          `artigos confirmados pelo IFC, ${reconciledBoq.stats.totalAdditions} adições identificadas.`,
        );
      }
    } catch (err) {
      warnings.push(
        `Reconciliação BOQ falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Stage 7: Schedule ─────────────────────────────────────
  if (opts.includeSchedule !== false) {
    progress.report("schedule", "A gerar cronograma de obra...");

    if (importedSchedule) {
      // User provided a MS Project XML schedule — use it as base
      schedule = importedSchedule;
      warnings.push(
        `Cronograma importado: ${schedule.tasks.length} tarefas, duração ${schedule.totalDurationDays} dias.`,
      );

      // Aggregate resources from the imported schedule if we have WBS + match data
      if (wbsProject && matchReport) {
        try {
          const { aggregateProjectResources } = await import("./resource-aggregator");
          resources = aggregateProjectResources(wbsProject, matchReport.matches, schedule);
        } catch {
          // Non-critical: resource aggregation from imported schedule
        }
      }

      // Apply resource optimization on imported schedule
      if (resources) {
        try {
          const { optimizeSchedule } = await import("./site-capacity-optimizer");
          const optimized = optimizeSchedule(schedule, resources);
          const optimizedFinish = optimized.optimizedTasks
            .filter(t => !t.isSummary)
            .reduce((latest, t) => t.finishDate > latest ? t.finishDate : latest, schedule.startDate);
          schedule = {
            ...schedule,
            tasks: optimized.optimizedTasks,
            finishDate: optimizedFinish,
          };
        } catch (optErr) {
          warnings.push(
            `Otimização de recursos falhou (cronograma importado mantido): ${optErr instanceof Error ? optErr.message : String(optErr)}`,
          );
        }
      }
    } else if (wbsProject && matchReport) {
      // No imported schedule — generate from scratch
      try {
        const { generateSchedule } = await import("./construction-sequencer");
        const { aggregateProjectResources } = await import("./resource-aggregator");

        const maxWorkers = laborConstraint?.maxWorkers ?? 10;
        const scheduleOpts = {
          maxWorkers,
          useCriticalChain: true,
          safetyReduction: 0.5,
          projectBufferRatio: 0.5,
          feedingBufferRatio: 0.5,
        };
        schedule = generateSchedule(wbsProject, matchReport.matches, scheduleOpts);
        resources = aggregateProjectResources(wbsProject, matchReport.matches, schedule);

        // Post-optimization: resource leveling + equipment conflict resolution
        try {
          const { optimizeSchedule } = await import("./site-capacity-optimizer");
          const optimized = optimizeSchedule(schedule, resources);
          const optimizedFinish = optimized.optimizedTasks
            .filter(t => !t.isSummary)
            .reduce((latest, t) => t.finishDate > latest ? t.finishDate : latest, schedule.startDate);
          schedule = {
            ...schedule,
            tasks: optimized.optimizedTasks,
            finishDate: optimizedFinish,
          };
        } catch (optErr) {
          warnings.push(
            `Otimização de recursos falhou (cronograma base mantido): ${optErr instanceof Error ? optErr.message : String(optErr)}`,
          );
        }
      } catch (err) {
        warnings.push(
          `Geração de cronograma falhou: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  progress.completeStage("schedule");

  // ─── Stage 7b: Element→Task Mapping (for 4D) ──────────────
  let elementMapping: ElementTaskMappingResult | undefined;
  if (schedule && ifcAnalyses && ifcAnalyses.length > 0) {
    try {
      const { mapElementsToTasks } = await import("./element-task-mapper");
      elementMapping = mapElementsToTasks(ifcAnalyses, schedule, {
        boq: generatedBoq,
        aiSequence,
      });
    } catch (err) {
      warnings.push(
        `Mapeamento elemento→tarefa falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Stage 8: Export ───────────────────────────────────────
  progress.report("export", "A gerar ficheiros de exportação...");

  // Cash Flow & S-Curve
  let cashFlow: CashFlowResult | undefined;
  if (schedule && resources) {
    try {
      const { calculateCashFlow } = await import("./cashflow");
      cashFlow = calculateCashFlow(schedule, resources);
    } catch (err) {
      warnings.push(
        `Fluxo de caixa falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Budget Excel
  if (wbsProject && schedule && resources) {
    try {
      const { generateBudgetExcel } = await import("./budget-export");
      const buffer = generateBudgetExcel(wbsProject, schedule, resources, {
        projectName: project.name,
        projectLocation: project.location?.municipality,
      }, cashFlow);
      budgetExcel = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(budgetExcel).set(buffer);
    } catch (err) {
      warnings.push(
        `Exportação de orçamento falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // MS Project XML
  if (schedule) {
    try {
      const { generateMSProjectXML } = await import("./msproject-export");
      msProjectXml = generateMSProjectXML(schedule);
    } catch (err) {
      warnings.push(
        `Exportação MS Project falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Compliance Excel
  if (analysis) {
    try {
      const { generateComplianceExcel } = await import("./compliance-export");
      complianceExcel = generateComplianceExcel(analysis, {
        projectName: project.name,
        projectLocation: project.location?.municipality,
      });
    } catch (err) {
      warnings.push(
        `Exportação de conformidade falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // CCPM Gantt Excel
  if (schedule && resources) {
    try {
      const { generateCcpmGanttExcel } = await import("./ccpm-gantt-export");
      const buffer = await generateCcpmGanttExcel(schedule, resources, cashFlow, {
        projectName: project.name,
        projectLocation: project.location?.municipality,
      });
      ccpmGanttExcel = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(ccpmGanttExcel).set(buffer);
    } catch (err) {
      warnings.push(
        `Exportação CCPM Gantt falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  progress.completeStage("export");

  // Await AI review if it was launched (non-blocking during scheduling/export)
  if (aiReviewPromise) {
    try { await aiReviewPromise; } catch { /* already handled inside */ }
  }

  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    project,
    wbsProject,
    analysis,
    matchReport,
    schedule,
    laborConstraint,
    resources,
    generatedBoq,
    ifcAnalyses,
    elementMapping,
    aiSequence,
    regulatoryReview,
    analysisDepth: depth,
    cashFlow,
    reconciledBoq,
    parsedBoq,
    budgetExcel,
    msProjectXml,
    ccpmGanttExcel,
    complianceExcel,
    aiEstimate,
    reconciliation,
    aiReview,
    importedSchedule,
    scheduleDiagnostics,
    warnings,
    processingTimeMs,
  };
}

// ============================================================
// Extracted stage helpers (for depth-aware reordering)
// ============================================================

type ProgressReporter = ReturnType<typeof createProgressReporter>;

async function parseBoqStage(
  classified: ClassifiedFiles,
  ifcAnalyses: SpecialtyAnalysisResult[] | undefined,
  project: BuildingProject,
  warnings: string[],
  progress: ProgressReporter,
): Promise<{ wbsProject?: WbsProject; generatedBoq?: GeneratedBoq; parsedBoq?: ParsedBoq }> {
  let wbsProject: WbsProject | undefined;
  let generatedBoq: GeneratedBoq | undefined;
  let parsedBoq: ParsedBoq | undefined;

  if (classified.boq.length > 0) {
    try {
      const file = classified.boq[0];
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "csv") {
        const { parseCsvWbs } = await import("./wbs-parser");
        const text = await file.text();
        wbsProject = parseCsvWbs(text);
      } else {
        const { parseExcelWbs } = await import("./wbs-parser");
        const buffer = await file.arrayBuffer();
        wbsProject = await parseExcelWbs(buffer);

        try {
          const { parseExcelFile } = await import("./xlsx-parser");
          const xlsResult = parseExcelFile(buffer);
          if (xlsResult.boqs.length > 0) {
            parsedBoq = xlsResult.boqs[0];
          }
        } catch {
          // Non-critical
        }
      }

      if (wbsProject.name && !project.name) {
        project.name = wbsProject.name;
      }

      if (classified.boq.length > 1) {
        warnings.push(
          `Múltiplos ficheiros BOQ enviados. Apenas o primeiro (${file.name}) foi utilizado.`,
        );
      }
    } catch (err) {
      warnings.push(`Erro ao processar BOQ: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (ifcAnalyses && ifcAnalyses.length > 0) {
    try {
      const { generateBoqFromIfc } = await import("./keynote-resolver");
      const projectName = project.name || "Projeto IFC";
      const startDate = new Date().toISOString().slice(0, 10);
      generatedBoq = generateBoqFromIfc(ifcAnalyses, projectName, startDate);
      wbsProject = generatedBoq.project;

      if (generatedBoq.stats.unresolved > 0) {
        warnings.push(
          `${generatedBoq.stats.unresolved} elementos IFC sem mapeamento ProNIC ` +
          `(cobertura: ${generatedBoq.stats.coveragePercent}%).`,
        );
      }
    } catch (err) {
      warnings.push(
        `Erro ao gerar BOQ a partir do IFC: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // When both uploaded BOQ and IFC exist, also generate IFC-based BOQ for reconciliation
  if (classified.boq.length > 0 && ifcAnalyses && ifcAnalyses.length > 0 && !generatedBoq) {
    try {
      const { generateBoqFromIfc } = await import("./keynote-resolver");
      const projectName = project.name || "Projeto IFC";
      const startDate = new Date().toISOString().slice(0, 10);
      generatedBoq = generateBoqFromIfc(ifcAnalyses, projectName, startDate);
    } catch {
      // Non-critical
    }
  }

  return { wbsProject, generatedBoq, parsedBoq };
}

async function parsePdfStage(
  classified: ClassifiedFiles,
  project: BuildingProject,
  warnings: string[],
  progress: ProgressReporter,
  depth: AnalysisDepth,
): Promise<{ project: BuildingProject; pdfTexts: string[] }> {
  const pdfTexts: string[] = [];

  if (classified.pdf.length > 0) {
    try {
      const { splitAndExtract } = await import("./pdf-splitter");

      for (let i = 0; i < classified.pdf.length; i++) {
        progress.reportPartial(
          "parse_pdf",
          i / classified.pdf.length,
          `A processar ${classified.pdf[i].name}...`,
        );

        try {
          const buffer = await classified.pdf[i].arrayBuffer();
          const extraction = await splitAndExtract(buffer);

          let enrichedText = extraction.text;
          const scannedPages = extraction.pageTexts.filter(
            (pt) => pt.text.trim().length < 50,
          );

          if (scannedPages.length > 0) {
            try {
              const { ocrPdfPages } = await import("./server-ocr");
              const ocrResults = await ocrPdfPages(
                new Uint8Array(buffer),
                scannedPages.map((p) => p.page),
                {
                  language: "por",
                  onProgress: (current, total) => {
                    progress.reportPartial(
                      "parse_pdf",
                      (i + current / total) / classified.pdf.length,
                      `OCR página ${current}/${total} de ${classified.pdf[i].name}`,
                    );
                  },
                },
              );

              for (const ocr of ocrResults) {
                const pageText = extraction.pageTexts.find(
                  (pt) => pt.page === ocr.pageNumber,
                );
                if (pageText && ocr.text.length > pageText.text.length) {
                  pageText.text = ocr.text;
                }
              }

              enrichedText = extraction.pageTexts
                .map((pt) => `--- Página ${pt.page} ---\n${pt.text}`)
                .join("\n\n");

              const ocrCount = ocrResults.filter((r) => r.text.length > 0).length;
              if (ocrCount > 0) {
                warnings.push(
                  `OCR aplicado a ${ocrCount} página(s) digitalizada(s) de ${classified.pdf[i].name}.`,
                );
              }
            } catch {
              warnings.push(
                `OCR indisponível para ${scannedPages.length} página(s) digitalizada(s) de ${classified.pdf[i].name}.`,
              );
            }
          }

          // Collect PDF text for deep mode context assembly
          if (enrichedText.trim().length > 50) {
            pdfTexts.push(enrichedText);
          }

          // Quick mode skips AI PDF parsing (just extracts text)
          if (depth !== "quick" && enrichedText.trim().length > 50) {
            try {
              const { parseDocumentWithAI, mergeExtractedData } = await import("./document-parser");
              const parsed = await parseDocumentWithAI(enrichedText, project, depth);
              project = mergeExtractedData(project, parsed);
              warnings.push(...parsed.warnings);
            } catch {
              warnings.push(
                `Análise AI indisponível para ${classified.pdf[i].name} — texto extraído mas não interpretado.`,
              );
            }
          }
        } catch (err) {
          warnings.push(
            `Erro ao processar ${classified.pdf[i].name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      warnings.push(`Erro no módulo PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { project, pdfTexts };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Set a nested field on an object using dot notation.
 * e.g. setNestedField(obj, "structural.columnCount", 38)
 */
function setNestedField(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Shallow deep merge for BuildingProject. Source values overwrite target.
 * Objects are merged recursively, primitives and arrays are replaced.
 */
function deepMerge(
  target: BuildingProject,
  source: Partial<BuildingProject>,
): BuildingProject {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const sourceVal = (source as Record<string, unknown>)[key];
    const targetVal = result[key];

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
        targetVal as BuildingProject,
        sourceVal as Partial<BuildingProject>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result as BuildingProject;
}

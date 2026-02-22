"use client";

/**
 * Unified multi-file upload component.
 *
 * Accepts individual files (IFC, PDF, XLS/XLSX, CSV) and runs
 * the unified pipeline to produce Budget Excel, MS Project XML,
 * and Compliance Excel outputs.
 *
 * Features:
 * - Pre-warmed Pipeline Worker with price database prefetch
 * - Result caching (IndexedDB) — same files = instant results
 * - Cancel button for in-flight processing
 * - Elapsed timer + granular stage progress
 * - File deduplication
 * - Graceful worker crash recovery
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import type { UnifiedPipelineResult, UnifiedStage } from "@/lib/unified-pipeline";
import type { BuildingProject } from "@/lib/types";
import type { ClientIfcProgress } from "@/lib/client-ifc-parser";
import type { ClientPipelineHandle } from "@/lib/client-pipeline";
import {
  Upload,
  Loader2,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  RotateCcw,
  X,
  FileText,
  FileSpreadsheet,
  Download,
  Box,
  Zap,
} from "lucide-react";

// ============================================================
// Props
// ============================================================

interface UnifiedUploadProps {
  existingProject?: Partial<BuildingProject>;
  onComplete: (result: UnifiedPipelineResult) => void;
  onCancel?: () => void;
}

// ============================================================
// Stage labels
// ============================================================

const STAGE_LABELS_PT: Record<UnifiedStage, string> = {
  classify: "Classificação",
  parse_ifc: "Análise IFC",
  ai_sequence: "Sequência IA",
  parse_boq: "Mapa de Quantidades",
  parse_pdf: "Documentos PDF",
  analyze: "Análise Regulamentar",
  ai_estimate: "Estimativa Inteligente",
  estimate: "Base de Preços",
  reconcile: "Reconciliação",
  schedule: "Cronograma",
  export: "Exportação",
};

const STAGE_LABELS_EN: Record<UnifiedStage, string> = {
  classify: "Classification",
  parse_ifc: "IFC Analysis",
  ai_sequence: "AI Sequencing",
  parse_boq: "Bill of Quantities",
  parse_pdf: "PDF Documents",
  analyze: "Regulatory Analysis",
  ai_estimate: "AI Estimate",
  estimate: "Price Database",
  reconcile: "Reconciliation",
  schedule: "Scheduling",
  export: "Export",
};

// ============================================================
// File type badge
// ============================================================

function fileBadge(name: string): { label: string; className: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ifc") return { label: "IFC", className: "bg-purple-100 text-purple-700" };
  if (ext === "pdf") return { label: "PDF", className: "bg-blue-100 text-blue-700" };
  if (["xls", "xlsx", "csv"].includes(ext))
    return { label: ext.toUpperCase(), className: "bg-green-100 text-green-700" };
  if (ext === "xml") return { label: "XML", className: "bg-orange-100 text-orange-700" };
  return { label: ext.toUpperCase() || "?", className: "bg-gray-100 text-gray-500" };
}

// ============================================================
// Component
// ============================================================

export default function UnifiedUpload({
  existingProject,
  onComplete,
  onCancel,
}: UnifiedUploadProps) {
  const { lang } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{
    stage: UnifiedStage;
    percent: number;
    message: string;
    stagesCompleted: UnifiedStage[];
  } | null>(null);
  const [result, setResult] = useState<UnifiedPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ifcBytesRef = useRef<{ data: Uint8Array; name: string } | null>(null);
  const [ifcParsingProgress, setIfcParsingProgress] = useState<ClientIfcProgress | null>(null);

  // Output toggles
  const [includeCosts, setIncludeCosts] = useState(true);
  const [includeSchedule, setIncludeSchedule] = useState(true);
  const [includeCompliance, setIncludeCompliance] = useState(true);

  // Analysis depth
  const [analysisDepth, setAnalysisDepth] = useState<"quick" | "standard" | "deep">("standard");

  // File validation warnings (IFC size, PDF pages)
  const [fileWarnings, setFileWarnings] = useState<Map<string, { type: "warn" | "block"; message: string }>>(new Map());

  // Dedup warning
  const [dedupWarning, setDedupWarning] = useState<string | null>(null);

  // New: cached result indicator
  const [isCachedResult, setIsCachedResult] = useState(false);

  // New: elapsed timer
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // New: pre-warmed pipeline handle
  const pipelineRef = useRef<ClientPipelineHandle | null>(null);

  const stageLabels = lang === "pt" ? STAGE_LABELS_PT : STAGE_LABELS_EN;

  const txt = {
    title: lang === "pt" ? "Pipeline Unificada" : "Unified Pipeline",
    subtitle: lang === "pt"
      ? "Carregue ficheiros IFC, PDF ou Excel para gerar orçamento, cronograma e relatório de conformidade."
      : "Upload IFC, PDF or Excel files to generate budget, schedule and compliance report.",
    dropHere: lang === "pt"
      ? "Arraste ficheiros ou clique para selecionar"
      : "Drop files or click to select",
    acceptedTypes: ".ifc, .pdf, .xls, .xlsx, .csv, .xml",
    processing: lang === "pt" ? "A processar..." : "Processing...",
    process: lang === "pt" ? "Processar Projeto" : "Process Project",
    budget: lang === "pt" ? "Orçamento (Budget Excel)" : "Budget Excel",
    schedule: lang === "pt" ? "Cronograma (MS Project XML)" : "Schedule (MS Project XML)",
    compliance: lang === "pt" ? "Conformidade Regulamentar" : "Regulatory Compliance",
    warningsLabel: lang === "pt" ? "avisos" : "warnings",
    processingTime: lang === "pt" ? "Tempo de processamento" : "Processing time",
    viewResults: lang === "pt" ? "Ver Resultados" : "View Results",
    retry: lang === "pt" ? "Tentar Novamente" : "Try Again",
    cancel: lang === "pt" ? "Cancelar" : "Cancel",
    cancelProcessing: lang === "pt" ? "Cancelar processamento" : "Cancel processing",
    success: lang === "pt" ? "Pipeline concluída com sucesso" : "Pipeline completed successfully",
    downloadBudget: lang === "pt" ? "Descarregar Orçamento" : "Download Budget",
    downloadSchedule: lang === "pt" ? "Descarregar Cronograma" : "Download Schedule",
    downloadCompliance: lang === "pt" ? "Descarregar Conformidade" : "Download Compliance",
    outputs: lang === "pt" ? "Saídas" : "Outputs",
    analysisDepthLabel: lang === "pt" ? "Profundidade de Análise" : "Analysis Depth",
    depthQuick: lang === "pt" ? "Rápido" : "Quick",
    depthQuickDesc: lang === "pt" ? "Preliminar" : "Preliminary",
    depthStandard: lang === "pt" ? "Padrão" : "Standard",
    depthStandardDesc: lang === "pt" ? "Análise completa" : "Full analysis",
    depthDeep: lang === "pt" ? "Profundo" : "Deep",
    depthDeepDesc: lang === "pt" ? "Para concurso" : "Bid-ready",
    costEstimate: lang === "pt" ? "Custo Estimado" : "Estimated Cost",
    duration: lang === "pt" ? "Duração" : "Duration",
    days: lang === "pt" ? "dias" : "days",
    workforce: lang === "pt" ? "Equipa máx." : "Max. workforce",
    workers: lang === "pt" ? "trabalhadores" : "workers",
    noFiles: lang === "pt" ? "Adicione pelo menos 1 ficheiro" : "Add at least 1 file",
    cachedResult: lang === "pt" ? "Resultado em cache (instantâneo)" : "Cached result (instant)",
    crashHint: lang === "pt"
      ? "O processamento falhou — tente remover ficheiros grandes."
      : "Processing failed — try removing large files.",
  };

  // ── Pre-warm pipeline worker + prefetch price DB ──────────

  useEffect(() => {
    let cancelled = false;

    import("@/lib/client-pipeline").then(({ createClientPipeline }) => {
      if (cancelled) return;
      const handle = createClientPipeline();
      handle.prefetch();
      pipelineRef.current = handle;
    });

    return () => {
      cancelled = true;
      pipelineRef.current?.terminate();
      pipelineRef.current = null;
    };
  }, []);

  // ── Timer cleanup on unmount ──────────────────────────────

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── File size / page limits ─────────────────────────────

  const IFC_WARN_MB = 200;
  const IFC_BLOCK_MB = 1024;
  const PDF_WARN_PAGES = 50;
  const PDF_BLOCK_PAGES = 200;

  // Validate files when the list changes (async for PDF page count)
  useEffect(() => {
    let cancelled = false;

    async function validate() {
      const warnings = new Map<string, { type: "warn" | "block"; message: string }>();

      for (const f of files) {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        const key = `${f.name}:${f.size}`;
        const sizeMB = f.size / (1024 * 1024);

        if (ext === "ifc") {
          if (sizeMB > IFC_BLOCK_MB) {
            warnings.set(key, {
              type: "block",
              message: lang === "pt"
                ? `IFC demasiado grande (${sizeMB.toFixed(0)} MB). Máximo: ${IFC_BLOCK_MB} MB.`
                : `IFC too large (${sizeMB.toFixed(0)} MB). Maximum: ${IFC_BLOCK_MB} MB.`,
            });
          } else if (sizeMB > IFC_WARN_MB) {
            warnings.set(key, {
              type: "warn",
              message: lang === "pt"
                ? `IFC grande (${sizeMB.toFixed(0)} MB) — processamento pode ser lento.`
                : `Large IFC (${sizeMB.toFixed(0)} MB) — processing may be slow.`,
            });
          }
        }

        if (ext === "pdf") {
          try {
            const { getPageCount } = await import("@/lib/pdf-splitter");
            const buffer = await f.arrayBuffer();
            if (cancelled) return;
            const pages = await getPageCount(buffer);
            if (cancelled) return;

            if (pages > PDF_BLOCK_PAGES) {
              warnings.set(key, {
                type: "block",
                message: lang === "pt"
                  ? `PDF demasiado longo (${pages} páginas). Máximo: ${PDF_BLOCK_PAGES} páginas.`
                  : `PDF too long (${pages} pages). Maximum: ${PDF_BLOCK_PAGES} pages.`,
              });
            } else if (pages > PDF_WARN_PAGES) {
              warnings.set(key, {
                type: "warn",
                message: lang === "pt"
                  ? `PDF longo (${pages} páginas) — processamento pode ser lento.`
                  : `Long PDF (${pages} pages) — processing may be slow.`,
              });
            }
          } catch {
            // Page count detection failed — skip warning
          }
        }
      }

      if (!cancelled) setFileWarnings(warnings);
    }

    if (files.length > 0) {
      validate();
    } else {
      setFileWarnings(new Map());
    }

    return () => { cancelled = true; };
  }, [files, lang]);

  const hasBlockedFiles = [...fileWarnings.values()].some((w) => w.type === "block");

  // ── File handling ─────────────────────────────────────────

  const ACCEPTED_EXTENSIONS = new Set(["ifc", "pdf", "xls", "xlsx", "csv", "xml"]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted: File[] = [];
    const skipped: string[] = [];

    setFiles((prev) => {
      for (const f of Array.from(newFiles)) {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ACCEPTED_EXTENSIONS.has(ext)) continue;

        // Dedup: same name + same size = duplicate
        const isDuplicate = prev.some(
          (existing) => existing.name === f.name && existing.size === f.size,
        ) || accepted.some(
          (existing) => existing.name === f.name && existing.size === f.size,
        );

        if (isDuplicate) {
          skipped.push(f.name);
        } else {
          accepted.push(f);
        }
      }

      return accepted.length > 0 ? [...prev, ...accepted] : prev;
    });

    if (skipped.length > 0) {
      const msg = lang === "pt"
        ? `Ficheiro(s) duplicado(s) ignorado(s): ${skipped.join(", ")}`
        : `Duplicate file(s) skipped: ${skipped.join(", ")}`;
      setDedupWarning(msg);
      setTimeout(() => setDedupWarning(null), 4000);
    }
    setError(null);
  }, [lang]);

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  }

  // ── Timer helpers ─────────────────────────────────────────

  function startTimer() {
    startTimeRef.current = performance.now();
    setElapsedMs(0);
    timerRef.current = setInterval(() => {
      setElapsedMs(performance.now() - startTimeRef.current);
    }, 100);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // ── Process ───────────────────────────────────────────────

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setProgress(null);
    setResult(null);
    setIfcParsingProgress(null);
    setIsCachedResult(false);
    startTimer();

    try {
      // Check cache first
      const { computeFingerprint, getCachedResult } = await import("@/lib/pipeline-cache");
      const fingerprint = await computeFingerprint(files, {
        includeCosts, includeSchedule, includeCompliance, analysisDepth,
      });
      const cached = await getCachedResult(fingerprint);

      if (cached) {
        // Re-read IFC bytes from File objects (not cached — too large)
        const firstIfc = files.find((f) => f.name.toLowerCase().endsWith(".ifc"));
        if (firstIfc) {
          const rawBuffer = await firstIfc.arrayBuffer();
          cached.ifcFileData = new Uint8Array(rawBuffer);
          cached.ifcFileName = firstIfc.name;
        }
        setResult(cached);
        setIsCachedResult(true);
        return;
      }

      // Use pre-warmed pipeline handle (or create on-demand)
      let handle = pipelineRef.current;
      if (!handle) {
        const { createClientPipeline } = await import("@/lib/client-pipeline");
        handle = createClientPipeline();
        handle.prefetch();
        pipelineRef.current = handle;
      }

      // Preserve raw IFC bytes for 4D viewer
      const firstIfc = files.find((f) => f.name.toLowerCase().endsWith(".ifc"));
      if (firstIfc) {
        const rawBuffer = await firstIfc.arrayBuffer();
        ifcBytesRef.current = { data: new Uint8Array(rawBuffer), name: firstIfc.name };
      }

      const pipelineResult = await handle.run(files, {
        includeCosts,
        includeSchedule,
        includeCompliance,
        analysisDepth,
        existingProject,
        onProgress: (p) => {
          if (p.phase === "ifc_parse" && p.ifcProgress) {
            setIfcParsingProgress(p.ifcProgress);
          } else if (p.phase === "pipeline" && p.pipelineProgress) {
            setIfcParsingProgress(null);
            setProgress(p.pipelineProgress);
          }
        },
      });

      // Attach raw IFC bytes for 4D viewer
      if (ifcBytesRef.current) {
        pipelineResult.ifcFileData = ifcBytesRef.current.data;
        pipelineResult.ifcFileName = ifcBytesRef.current.name;
      }

      setResult(pipelineResult);

      // Cache result (without large IFC bytes)
      const { cacheResult } = await import("@/lib/pipeline-cache");
      const summary = files.map((f) => f.name).join(", ");
      cacheResult(fingerprint, pipelineResult, summary).catch(() => {
        // Cache failure is non-fatal
      });
    } catch (err) {
      // Don't show error for user-initiated cancel
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "Pipeline cancelled") {
        setError(
          err instanceof Error
            ? err.message
            : lang === "pt"
              ? "Erro ao processar os ficheiros."
              : "Error processing files.",
        );
      }
    } finally {
      setIsProcessing(false);
      setIfcParsingProgress(null);
      stopTimer();
    }
  }, [files, includeCosts, includeSchedule, includeCompliance, analysisDepth, existingProject, lang]);

  // ── Cancel ────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    pipelineRef.current?.cancel();
    setIsProcessing(false);
    setProgress(null);
    setIfcParsingProgress(null);
    stopTimer();
  }, []);

  // ── Reset ─────────────────────────────────────────────────

  function handleReset() {
    setIsProcessing(false);
    setProgress(null);
    setResult(null);
    setError(null);
    setFiles([]);
    setIfcParsingProgress(null);
    setIsCachedResult(false);
    setElapsedMs(0);
    setDedupWarning(null);
    setFileWarnings(new Map());
    ifcBytesRef.current = null;
    stopTimer();
  }

  // ── Download helpers ──────────────────────────────────────

  function downloadBlob(data: ArrayBuffer | string, filename: string, type: string) {
    const blob = typeof data === "string"
      ? new Blob([data], { type })
      : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ═════════════════════════════════════════════════════════
  // RENDER: Upload area (no files yet or adding more files)
  // ═════════════════════════════════════════════════════════
  if (!isProcessing && !result) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{txt.title}</h3>
          <p className="text-sm text-gray-500 mt-1">{txt.subtitle}</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors border-gray-300 hover:border-accent hover:bg-gray-50"
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto" />
          <p className="text-sm text-gray-600 font-medium mt-2">{txt.dropHere}</p>
          <p className="text-xs text-gray-400 mt-1">{txt.acceptedTypes}</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".ifc,.pdf,.xls,.xlsx,.csv,.xml"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, idx) => {
              const badge = fileBadge(file.name);
              const warningKey = `${file.name}:${file.size}`;
              const warning = fileWarnings.get(warningKey);

              return (
                <div key={`${file.name}-${idx}`}>
                  <div
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      warning?.type === "block"
                        ? "bg-red-50 border border-red-200"
                        : warning?.type === "warn"
                          ? "bg-amber-50 border border-amber-200"
                          : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <span className="text-xs text-gray-400">
                        {file.size > 1024 * 1024
                          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                          : `${(file.size / 1024).toFixed(0)} KB`}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                  {warning && (
                    <p className={`text-xs mt-0.5 ml-2 flex items-center gap-1 ${
                      warning.type === "block" ? "text-red-600" : "text-amber-600"
                    }`}>
                      {warning.type === "block"
                        ? <XCircle className="w-3 h-3 flex-shrink-0" />
                        : <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                      {warning.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Dedup warning */}
        {dedupWarning && (
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {dedupWarning}
          </div>
        )}

        {/* Output toggles */}
        {files.length > 0 && (
          <div className="space-y-2 bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {txt.outputs}
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCosts}
                onChange={(e) => setIncludeCosts(e.target.checked)}
                className="rounded border-gray-300"
              />
              {txt.budget}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSchedule}
                onChange={(e) => setIncludeSchedule(e.target.checked)}
                className="rounded border-gray-300"
              />
              {txt.schedule}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCompliance}
                onChange={(e) => setIncludeCompliance(e.target.checked)}
                className="rounded border-gray-300"
              />
              {txt.compliance}
            </label>

            {/* Analysis depth selector */}
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                {txt.analysisDepthLabel}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(["quick", "standard", "deep"] as const).map((level) => {
                  const labels = {
                    quick: { name: txt.depthQuick, desc: txt.depthQuickDesc, cost: "~€0.20" },
                    standard: { name: txt.depthStandard, desc: txt.depthStandardDesc, cost: "~€5" },
                    deep: { name: txt.depthDeep, desc: txt.depthDeepDesc, cost: "~€25" },
                  };
                  const l = labels[level];
                  const isActive = analysisDepth === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setAnalysisDepth(level)}
                      className={`flex flex-col items-center px-2 py-2 rounded-lg border text-xs transition-colors ${
                        isActive
                          ? "border-accent bg-accent/10 text-accent font-semibold"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span>{l.name}</span>
                      <span className="text-[10px] opacity-70">{l.desc}</span>
                      <span className="text-[10px] opacity-50 mt-0.5">{l.cost}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 space-y-1">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
            {error.includes("crashed") && (
              <p className="text-xs text-red-500">{txt.crashHint}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleProcess}
            disabled={files.length === 0 || hasBlockedFiles}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white font-semibold rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {txt.process}
            <ChevronRight className="w-5 h-5" />
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-3 text-sm text-gray-500 hover:text-gray-700"
            >
              {txt.cancel}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════
  // RENDER: Processing state
  // ═════════════════════════════════════════════════════════
  if (isProcessing && !result) {
    const stages: UnifiedStage[] = [
      "classify", "parse_ifc", "parse_boq", "parse_pdf",
      "analyze", "estimate", "schedule", "export",
    ];

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{txt.title}</h3>
          <p className="text-sm text-accent font-medium mt-1">
            {ifcParsingProgress
              ? (lang === "pt" ? "A analisar IFC no browser..." : "Parsing IFC in browser...")
              : (progress?.message ?? txt.processing)}
          </p>
        </div>

        {/* Client-side IFC parsing progress */}
        {ifcParsingProgress && (
          <div className="p-3 bg-purple-900/30 border border-purple-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-purple-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="font-medium">
                {ifcParsingProgress.fileName}
              </span>
            </div>
            <div className="text-xs text-purple-400 mt-1">
              {ifcParsingProgress.phase === "reading"
                ? (lang === "pt" ? "A ler ficheiro..." : "Reading file...")
                : (lang === "pt" ? "A extrair quantidades e propriedades..." : "Extracting quantities and properties...")}
              {ifcParsingProgress.totalFiles > 1 &&
                ` (${ifcParsingProgress.fileIndex + 1}/${ifcParsingProgress.totalFiles})`}
            </div>
          </div>
        )}

        {/* Progress bar with elapsed timer */}
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{progress ? stageLabels[progress.stage] : txt.processing}</span>
            <span className="flex items-center gap-2">
              <span className="text-gray-400">
                {(elapsedMs / 1000).toFixed(1)}s
              </span>
              <span>{progress?.percent ?? 0}%</span>
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
        </div>

        {/* Stage indicators */}
        <div className="grid grid-cols-4 gap-2">
          {stages.map((stage) => {
            const isCompleted = progress?.stagesCompleted.includes(stage) ?? false;
            const isCurrent = progress?.stage === stage;

            return (
              <div
                key={stage}
                className={`flex items-center gap-1.5 p-2 rounded text-xs ${
                  isCompleted
                    ? "bg-green-50 text-green-700"
                    : isCurrent
                      ? "bg-accent-light text-accent"
                      : "bg-gray-50 text-gray-400"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : isCurrent ? (
                  <Loader2 className="w-3 h-3 animate-spin text-accent" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-gray-300" />
                )}
                <span className="truncate">{stageLabels[stage]}</span>
              </div>
            );
          })}
        </div>

        {/* File list summary */}
        <div className="flex flex-wrap gap-2">
          {files.map((file, idx) => {
            const badge = fileBadge(file.name);
            return (
              <span
                key={`${file.name}-${idx}`}
                className={`text-xs px-2 py-1 rounded ${badge.className}`}
              >
                {file.name}
              </span>
            );
          })}
        </div>

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 font-medium rounded-xl border border-red-200 hover:bg-red-100 transition-colors"
        >
          <XCircle className="w-4 h-4" />
          {txt.cancelProcessing}
        </button>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════
  // RENDER: Result summary
  // ═════════════════════════════════════════════════════════
  if (result) {
    const totalCost = result.matchReport?.stats.totalEstimatedCost;
    const totalDays = result.schedule?.totalDurationDays;
    const maxWorkers = result.laborConstraint?.maxWorkers;
    const score = result.analysis?.overallScore;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cf = result.cashFlow as Record<string, any> | undefined;
    const peakMonthlySpend = cf?.workingCapital?.peakMonthlySpend as number | undefined;
    const workingCapital = cf?.workingCapital?.recommendedWorkingCapital as number | undefined;

    return (
      <div className="space-y-5">
        {/* Success header */}
        <div className="flex items-center gap-3 bg-green-50 rounded-xl p-4 border border-green-200">
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-green-800">{txt.success}</p>
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {txt.processingTime}: {(result.processingTimeMs / 1000).toFixed(1)}s
            </p>
          </div>
          {isCachedResult && (
            <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 rounded-full px-2.5 py-1 border border-blue-200">
              <Zap className="w-3 h-3" />
              {txt.cachedResult}
            </span>
          )}
          {result.importedSchedule && (
            <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 rounded-full px-2.5 py-1 border border-orange-200">
              <Clock className="w-3 h-3" />
              {lang === "pt" ? "Cronograma importado" : "Imported schedule"}
            </span>
          )}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {totalCost !== undefined && totalCost > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-xl font-bold text-gray-900">
                {Math.round(totalCost).toLocaleString("pt-PT")} &euro;
              </p>
              <p className="text-xs text-gray-500">{txt.costEstimate}</p>
            </div>
          )}
          {totalDays !== undefined && totalDays > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{totalDays}</p>
              <p className="text-xs text-gray-500">{txt.duration} ({txt.days})</p>
            </div>
          )}
          {maxWorkers !== undefined && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{maxWorkers}</p>
              <p className="text-xs text-gray-500">{txt.workforce}</p>
            </div>
          )}
          {score !== undefined && (
            <div className={`rounded-xl p-3 text-center text-white font-bold ${
              score >= 80 ? "bg-green-600" : score >= 60 ? "bg-amber-500" : "bg-red-500"
            }`}>
              <p className="text-xl">{score}/100</p>
              <p className="text-xs opacity-80">{txt.compliance}</p>
            </div>
          )}
          {peakMonthlySpend !== undefined && peakMonthlySpend > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-xl font-bold text-gray-900">
                {Math.round(peakMonthlySpend).toLocaleString("pt-PT")} &euro;
              </p>
              <p className="text-xs text-gray-500">
                {lang === "pt" ? "Pico mensal" : "Peak month"}
              </p>
            </div>
          )}
          {workingCapital !== undefined && workingCapital > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-xl font-bold text-gray-900">
                {Math.round(workingCapital).toLocaleString("pt-PT")} &euro;
              </p>
              <p className="text-xs text-gray-500">
                {lang === "pt" ? "Capital de giro" : "Working capital"}
              </p>
            </div>
          )}
        </div>

        {/* Download buttons */}
        <div className="space-y-2">
          {result.budgetExcel && (
            <button
              onClick={() =>
                downloadBlob(
                  result.budgetExcel!,
                  `orcamento_${result.project.name || "projeto"}.xlsx`,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
              }
              className="w-full flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 hover:bg-green-100 transition-colors"
            >
              <FileSpreadsheet className="w-5 h-5" />
              <span className="flex-1 text-left font-medium">{txt.downloadBudget}</span>
              <Download className="w-4 h-4" />
            </button>
          )}
          {result.msProjectXml && (
            <button
              onClick={() =>
                downloadBlob(
                  result.msProjectXml!,
                  `cronograma_${result.project.name || "projeto"}.xml`,
                  "application/xml",
                )
              }
              className="w-full flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Box className="w-5 h-5" />
              <span className="flex-1 text-left font-medium">{txt.downloadSchedule}</span>
              <Download className="w-4 h-4" />
            </button>
          )}
          {result.complianceExcel && (
            <button
              onClick={() =>
                downloadBlob(
                  result.complianceExcel!,
                  `conformidade_${result.project.name || "projeto"}.xlsx`,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
              }
              className="w-full flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <FileText className="w-5 h-5" />
              <span className="flex-1 text-left font-medium">{txt.downloadCompliance}</span>
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700 space-y-1">
            <p className="font-medium flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              {result.warnings.length} {txt.warningsLabel}
            </p>
            {result.warnings.slice(0, 5).map((w, i) => (
              <p key={i} className="text-xs">{w}</p>
            ))}
            {result.warnings.length > 5 && (
              <p className="text-xs text-yellow-600">
                +{result.warnings.length - 5} {lang === "pt" ? "mais" : "more"}
              </p>
            )}
          </div>
        )}

        {/* Schedule diagnostics (suggestions from imported XML) */}
        {result.scheduleDiagnostics && result.scheduleDiagnostics.filter((d) => d.type === "suggestion").length > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 space-y-1">
            <p className="font-medium flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              {lang === "pt" ? "Sugestões de melhoria" : "Improvement suggestions"}
            </p>
            {result.scheduleDiagnostics.filter((d) => d.type === "suggestion").map((d, i) => (
              <p key={i} className="text-xs">{d.message}</p>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onComplete(result)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white font-semibold rounded-xl hover:bg-accent-hover transition-colors"
          >
            {txt.viewResults}
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {txt.retry}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

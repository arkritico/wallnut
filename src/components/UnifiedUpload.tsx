"use client";

/**
 * Unified multi-file upload component.
 *
 * Accepts individual files (IFC, PDF, XLS/XLSX, CSV) and runs
 * the unified pipeline to produce Budget Excel, MS Project XML,
 * and Compliance Excel outputs.
 *
 * Follows PipelineUpload.tsx patterns — Tailwind, lucide icons, useI18n().
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import type { UnifiedPipelineResult, UnifiedStage } from "@/lib/unified-pipeline";
import type { BuildingProject } from "@/lib/types";
import type { JobStatus } from "@/lib/job-store";
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
  parse_boq: "Mapa de Quantidades",
  parse_pdf: "Documentos PDF",
  analyze: "Análise Regulamentar",
  estimate: "Estimativa de Custos",
  schedule: "Cronograma",
  export: "Exportação",
};

const STAGE_LABELS_EN: Record<UnifiedStage, string> = {
  classify: "Classification",
  parse_ifc: "IFC Analysis",
  parse_boq: "Bill of Quantities",
  parse_pdf: "PDF Documents",
  analyze: "Regulatory Analysis",
  estimate: "Cost Estimation",
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Output toggles
  const [includeCosts, setIncludeCosts] = useState(true);
  const [includeSchedule, setIncludeSchedule] = useState(true);
  const [includeCompliance, setIncludeCompliance] = useState(true);

  const stageLabels = lang === "pt" ? STAGE_LABELS_PT : STAGE_LABELS_EN;

  const txt = {
    title: lang === "pt" ? "Pipeline Unificada" : "Unified Pipeline",
    subtitle: lang === "pt"
      ? "Carregue ficheiros IFC, PDF ou Excel para gerar orçamento, cronograma e relatório de conformidade."
      : "Upload IFC, PDF or Excel files to generate budget, schedule and compliance report.",
    dropHere: lang === "pt"
      ? "Arraste ficheiros ou clique para selecionar"
      : "Drop files or click to select",
    acceptedTypes: ".ifc, .pdf, .xls, .xlsx, .csv",
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
    success: lang === "pt" ? "Pipeline concluída com sucesso" : "Pipeline completed successfully",
    downloadBudget: lang === "pt" ? "Descarregar Orçamento" : "Download Budget",
    downloadSchedule: lang === "pt" ? "Descarregar Cronograma" : "Download Schedule",
    downloadCompliance: lang === "pt" ? "Descarregar Conformidade" : "Download Compliance",
    outputs: lang === "pt" ? "Saídas" : "Outputs",
    costEstimate: lang === "pt" ? "Custo Estimado" : "Estimated Cost",
    duration: lang === "pt" ? "Duração" : "Duration",
    days: lang === "pt" ? "dias" : "days",
    workforce: lang === "pt" ? "Equipa máx." : "Max. workforce",
    workers: lang === "pt" ? "trabalhadores" : "workers",
    noFiles: lang === "pt" ? "Adicione pelo menos 1 ficheiro" : "Add at least 1 file",
  };

  // ── File handling ─────────────────────────────────────────

  const ACCEPTED_EXTENSIONS = new Set(["ifc", "pdf", "xls", "xlsx", "csv"]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted: File[] = [];
    for (const f of Array.from(newFiles)) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (ACCEPTED_EXTENSIONS.has(ext)) {
        accepted.push(f);
      }
    }
    setFiles((prev) => [...prev, ...accepted]);
    setError(null);
  }, []);

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

  // ── Cleanup polling on unmount ──────────────────────────

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Process ───────────────────────────────────────────────

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function base64ToArrayBuffer(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    return buf;
  }

  function deserializeResult(json: Record<string, unknown>): UnifiedPipelineResult {
    return {
      project: json.project,
      wbsProject: json.wbsProject,
      analysis: json.analysis,
      matchReport: json.matchReport,
      schedule: json.schedule,
      laborConstraint: json.laborConstraint,
      resources: json.resources,
      generatedBoq: json.generatedBoq,
      cashFlow: json.cashFlow,
      budgetExcel: json.budgetExcelBase64
        ? base64ToArrayBuffer(json.budgetExcelBase64 as string)
        : undefined,
      msProjectXml: json.msProjectXml as string | undefined,
      complianceExcel: json.complianceExcelBase64
        ? base64ToArrayBuffer(json.complianceExcelBase64 as string)
        : undefined,
      warnings: (json.warnings as string[]) ?? [],
      processingTimeMs: (json.processingTimeMs as number) ?? 0,
    } as UnifiedPipelineResult;
  }

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setProgress(null);
    setResult(null);

    try {
      // 1. Submit job
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      formData.append("options", JSON.stringify({
        includeCosts,
        includeSchedule,
        includeCompliance,
      }));

      const response = await fetch("/api/pipeline", { method: "POST", body: formData });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? `HTTP ${response.status}`);
      }

      const jobId = json.jobId as string;

      // 2. Poll for progress
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/pipeline/${jobId}`);
          if (!pollRes.ok) return;

          const job = await pollRes.json();
          const status = job.status as JobStatus;

          // Update progress display
          if (job.stage) {
            setProgress({
              stage: job.stage as UnifiedStage,
              percent: job.progress ?? 0,
              message:
                job.stageProgress?.[job.stage]?.message ??
                (lang === "pt" ? "A processar..." : "Processing..."),
              stagesCompleted: job.stagesCompleted ?? [],
            });
          }

          if (status === "completed" && job.result) {
            stopPolling();
            const pipelineResult = deserializeResult(job.result);
            setResult(pipelineResult);
            setIsProcessing(false);
          } else if (status === "failed") {
            stopPolling();
            setError(
              job.error ??
                (lang === "pt"
                  ? "Erro ao processar os ficheiros."
                  : "Error processing files."),
            );
            setIsProcessing(false);
          }
        } catch {
          // Silently retry on network blips
        }
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === "pt"
            ? "Erro ao processar os ficheiros."
            : "Error processing files.",
      );
      setIsProcessing(false);
    }
  }, [files, includeCosts, includeSchedule, includeCompliance, lang]);

  function handleReset() {
    stopPolling();
    setIsProcessing(false);
    setProgress(null);
    setResult(null);
    setError(null);
    setFiles([]);
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
          accept=".ifc,.pdf,.xls,.xlsx,.csv"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, idx) => {
              const badge = fileBadge(file.name);
              return (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-sm text-gray-700 truncate">{file.name}</span>
                    <span className="text-xs text-gray-400">
                      {(file.size / 1024).toFixed(0)} KB
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
              );
            })}
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
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleProcess}
            disabled={files.length === 0}
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
            {progress?.message ?? txt.processing}
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{progress ? stageLabels[progress.stage] : txt.processing}</span>
            <span>{progress?.percent ?? 0}%</span>
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
          <div>
            <p className="font-semibold text-green-800">{txt.success}</p>
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {txt.processingTime}: {(result.processingTimeMs / 1000).toFixed(1)}s
            </p>
          </div>
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

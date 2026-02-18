"use client";

/**
 * Pipeline Upload component — replaces the basic ZipUpload with
 * the full runPipeline() orchestration from src/lib/pipeline.ts.
 *
 * Features:
 *   - Drag & drop ZIP upload
 *   - Multi-stage progress bar with Portuguese messages
 *   - Document checklist preview
 *   - Coordinate / geo lookup status
 *   - Final result summary before navigating to analysis
 */

import { useState, useRef, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import type { PipelineProgress, PipelineResult, PipelineStage } from "@/lib/pipeline";
import type { BuildingProject } from "@/lib/types";
import {
  FileArchive,
  Loader2,
  XCircle,
  CheckCircle2,
  MapPin,
  AlertTriangle,
  Clock,
  ChevronRight,
  RotateCcw,
  FileText,
  PenTool,
  FileSpreadsheet,
} from "lucide-react";

interface PipelineUploadProps {
  existingProject?: Partial<BuildingProject>;
  onComplete: (result: PipelineResult) => void;
  onCancel?: () => void;
}

const STAGE_LABELS_PT: Record<PipelineStage, string> = {
  upload: "Extração do ZIP",
  classify: "Classificação",
  parse: "Análise documental",
  locate: "Geolocalização",
  checklist: "Completude",
  analyze: "Análise regulamentar",
  extrapolate: "Extrapolação",
  complete: "Concluído",
};

const STAGE_LABELS_EN: Record<PipelineStage, string> = {
  upload: "ZIP Extraction",
  classify: "Classification",
  parse: "Document Parsing",
  locate: "Geolocation",
  checklist: "Completeness",
  analyze: "Regulatory Analysis",
  extrapolate: "Extrapolation",
  complete: "Complete",
};

export default function PipelineUpload({
  existingProject,
  onComplete,
  onCancel,
}: PipelineUploadProps) {
  const { lang } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stageLabels = lang === "pt" ? STAGE_LABELS_PT : STAGE_LABELS_EN;

  const txt = {
    title: lang === "pt" ? "Pipeline de Análise Automática" : "Automatic Analysis Pipeline",
    subtitle: lang === "pt"
      ? "Carregue um ZIP e a pipeline extrai, classifica, analisa e gera o relatório completo."
      : "Upload a ZIP and the pipeline extracts, classifies, analyzes and generates the full report.",
    dropHere: lang === "pt" ? "Arraste o ZIP ou clique para selecionar" : "Drop ZIP or click to select",
    processing: lang === "pt" ? "A processar..." : "Processing...",
    stageOf: lang === "pt" ? "de" : "of",
    filesFound: lang === "pt" ? "ficheiros encontrados" : "files found",
    warningsLabel: lang === "pt" ? "avisos" : "warnings",
    processingTime: lang === "pt" ? "Tempo de processamento" : "Processing time",
    coordinatesDetected: lang === "pt" ? "Coordenadas detetadas" : "Coordinates detected",
    complianceScore: lang === "pt" ? "Pontuação de conformidade" : "Compliance score",
    viewResults: lang === "pt" ? "Ver Resultados Completos" : "View Full Results",
    retry: lang === "pt" ? "Tentar Novamente" : "Try Again",
    cancel: lang === "pt" ? "Cancelar" : "Cancel",
    pipelineComplete: lang === "pt" ? "Pipeline concluída com sucesso" : "Pipeline completed successfully",
    summary: lang === "pt" ? "Resumo" : "Summary",
    written: lang === "pt" ? "Documentos escritos" : "Written documents",
    drawings: lang === "pt" ? "Desenhos" : "Drawings",
    budgetDocs: lang === "pt" ? "Orçamento/Medições" : "Budget/Quantities",
  };

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setError(
          lang === "pt"
            ? "Por favor selecione um ficheiro ZIP."
            : "Please select a ZIP file.",
        );
        return;
      }

      setIsProcessing(true);
      setError(null);
      setProgress(null);
      setResult(null);

      try {
        const { runPipeline } = await import("@/lib/pipeline");

        const pipelineResult = await runPipeline(file, {
          existingProject,
          includeCostEstimation: true,
          includeExtrapolation: true,
          includeSchedule: true,
          onProgress: (p) => setProgress(p),
        });

        setResult(pipelineResult);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : lang === "pt"
              ? "Erro ao processar o ficheiro."
              : "Error processing file.",
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [existingProject, lang],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleReset() {
    setIsProcessing(false);
    setProgress(null);
    setResult(null);
    setError(null);
  }

  // ── Upload area ────────────────────────────────────────
  if (!isProcessing && !result) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{txt.title}</h3>
          <p className="text-sm text-gray-500 mt-1">{txt.subtitle}</p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors border-gray-300 hover:border-accent hover:bg-gray-50"
        >
          <FileArchive className="w-10 h-10 text-gray-400 mx-auto" />
          <p className="text-sm text-gray-600 font-medium mt-3">{txt.dropHere}</p>
          <p className="text-xs text-gray-400 mt-1">.zip (PDF, XLS, XLSX, DWG, DWFx)</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleInputChange}
          className="hidden"
        />

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {txt.cancel}
          </button>
        )}
      </div>
    );
  }

  // ── Processing state ───────────────────────────────────
  if (isProcessing && !result) {
    const stages: PipelineStage[] = [
      "upload", "classify", "parse", "locate",
      "checklist", "analyze", "extrapolate", "complete",
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
      </div>
    );
  }

  // ── Result summary ─────────────────────────────────────
  if (result) {
    const stats = result.zipResult.stats;
    const checklistPercent = result.checklist.summary.completenessPercent;
    const missingCount = result.checklist.missingMandatory.length;
    const score = result.analysis.overallScore;
    const energyClass = result.analysis.energyClass;

    return (
      <div className="space-y-5">
        {/* Success header */}
        <div className="flex items-center gap-3 bg-green-50 rounded-xl p-4 border border-green-200">
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-800">{txt.pipelineComplete}</p>
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {txt.processingTime}: {(result.processingTimeMs / 1000).toFixed(1)}s
            </p>
          </div>
        </div>

        {/* File summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">{txt.summary}</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="w-4 h-4" />
              <span>{stats.writtenDocs} {txt.written}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <PenTool className="w-4 h-4" />
              <span>{stats.drawings} {txt.drawings}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <FileSpreadsheet className="w-4 h-4" />
              <span>{stats.budgetDocs} {txt.budgetDocs}</span>
            </div>
          </div>
        </div>

        {/* Score + Energy */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{score}</p>
            <p className="text-xs text-gray-500">{txt.complianceScore}</p>
          </div>
          <div className={`rounded-xl p-4 text-center text-white font-bold ${
            score >= 80 ? "bg-green-600" : score >= 60 ? "bg-amber-500" : "bg-red-500"
          }`}>
            <p className="text-3xl">{energyClass}</p>
            <p className="text-xs opacity-80">
              {lang === "pt" ? "Classe Energética" : "Energy Class"}
            </p>
          </div>
        </div>

        {/* Checklist summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {lang === "pt" ? "Completude Documental" : "Document Completeness"}
            </span>
            <span className="text-sm font-bold text-gray-900">{checklistPercent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                checklistPercent >= 80
                  ? "bg-green-500"
                  : checklistPercent >= 50
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${checklistPercent}%` }}
            />
          </div>
          {missingCount > 0 && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {missingCount} {lang === "pt" ? "documento(s) obrigatório(s) em falta" : "mandatory document(s) missing"}
            </p>
          )}
        </div>

        {/* Coordinates */}
        {result.coordinates && (
          <div className="flex items-center gap-2 p-3 bg-accent-light border border-accent rounded-lg text-sm text-accent">
            <MapPin className="w-4 h-4" />
            {txt.coordinatesDetected}: {result.coordinates.latitude.toFixed(5)}, {result.coordinates.longitude.toFixed(5)}
          </div>
        )}

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

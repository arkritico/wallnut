"use client";

/**
 * ZIP Upload component with auto-classification and document checklist.
 *
 * Flow:
 * 1. User uploads a ZIP file
 * 2. Files are extracted and auto-classified
 * 3. Document completeness checklist is shown
 * 4. PDF/XLS documents are parsed for project data
 * 5. User confirms and continues to analysis
 */

import { useState, useRef, useCallback } from "react";
import { processZipFile, CATEGORY_LABELS, type ZipProcessResult, type ExtractedFile } from "@/lib/zip-processor";
import { evaluateChecklist, contextFromProject, type ChecklistResult } from "@/lib/document-checklist";
import { extractTextFromFile } from "@/lib/document-parser";
import { parseExcelFile, type ParsedBoq } from "@/lib/xlsx-parser";
import { useI18n } from "@/lib/i18n";
import type { BuildingProject } from "@/lib/types";
import {
  FileArchive,
  FileText,
  FileSpreadsheet,
  Image,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  PenTool,
} from "lucide-react";

interface ZipUploadProps {
  project: BuildingProject;
  onFilesProcessed: (result: {
    extractedTexts: string[];
    boqs: ParsedBoq[];
    checklist: ChecklistResult;
    files: ExtractedFile[];
  }) => void;
}

export default function ZipUpload({ project, onFilesProcessed }: ZipUploadProps) {
  const { lang } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [zipResult, setZipResult] = useState<ZipProcessResult | null>(null);
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const txt = {
    title: lang === "pt" ? "Carregar Ficheiro ZIP do Projeto" : "Upload Project ZIP File",
    subtitle: lang === "pt"
      ? "Carregue um ZIP com os documentos do projeto (PDFs, XLS, desenhos)"
      : "Upload a ZIP with project documents (PDFs, XLS, drawings)",
    dropHere: lang === "pt" ? "Arraste o ZIP ou clique para selecionar" : "Drop ZIP or click to select",
    processing: lang === "pt" ? "A processar..." : "Processing...",
    extracting: lang === "pt" ? "A extrair ficheiros..." : "Extracting files...",
    classifying: lang === "pt" ? "A classificar documentos..." : "Classifying documents...",
    parsingDocs: lang === "pt" ? "A analisar documentos..." : "Parsing documents...",
    filesFound: lang === "pt" ? "ficheiros encontrados" : "files found",
    docChecklist: lang === "pt" ? "Lista de Verificação de Documentos" : "Document Checklist",
    complete: lang === "pt" ? "completo" : "complete",
    present: lang === "pt" ? "Presente" : "Present",
    missing: lang === "pt" ? "Em Falta" : "Missing",
    notRequired: lang === "pt" ? "Não Aplicável" : "Not Required",
    continueAnalysis: lang === "pt" ? "Continuar para Análise" : "Continue to Analysis",
    coordinatesDetected: lang === "pt" ? "Coordenadas detetadas" : "Coordinates detected",
    written: lang === "pt" ? "Documentos Escritos" : "Written Documents",
    drawings: lang === "pt" ? "Desenhos" : "Drawings",
    budget: lang === "pt" ? "Orçamento / Medições" : "Budget / Quantities",
    regulations: lang === "pt" ? "Regulamentos" : "Regulations",
    other: lang === "pt" ? "Outros" : "Other",
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError(lang === "pt" ? "Por favor selecione um ficheiro ZIP." : "Please select a ZIP file.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(txt.extracting);

    try {
      // 1. Extract ZIP
      const result = await processZipFile(file);
      setZipResult(result);
      setProgress(txt.classifying);

      // 2. Evaluate document checklist
      const ctx = contextFromProject(project);
      const categories = result.files.map(f => f.category);
      const checklistResult = evaluateChecklist(ctx, categories);
      setChecklist(checklistResult);

      // 3. Parse PDFs and Excel files for text/data
      setProgress(txt.parsingDocs);
      const extractedTexts: string[] = [];
      const boqs: ParsedBoq[] = [];

      for (const extractedFile of result.files) {
        try {
          if (extractedFile.extension === "pdf") {
            const blob = new Blob([extractedFile.data], { type: "application/pdf" });
            const fileObj = new File([blob], extractedFile.name, { type: "application/pdf" });
            const text = await extractTextFromFile(fileObj);
            if (text.trim()) extractedTexts.push(text);
          } else if (["xls", "xlsx"].includes(extractedFile.extension)) {
            const parseResult = parseExcelFile(extractedFile.data);
            boqs.push(...parseResult.boqs);
            // Also extract text for AI parsing
            const { extractTextFromExcel } = await import("@/lib/xlsx-parser");
            const text = extractTextFromExcel(extractedFile.data);
            if (text.trim()) extractedTexts.push(text);
          }
        } catch {
          // Individual file parse failure — continue with others
        }
      }

      setProgress("");

      // 4. Notify parent
      onFilesProcessed({
        extractedTexts,
        boqs,
        checklist: checklistResult,
        files: result.files,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error processing ZIP");
    } finally {
      setIsProcessing(false);
    }
  }, [project, lang, onFilesProcessed, txt.extracting, txt.classifying, txt.parsingDocs]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  const groupIcon = (group: string) => {
    switch (group) {
      case "written": return <FileText className="w-4 h-4" />;
      case "drawings": return <PenTool className="w-4 h-4" />;
      case "budget": return <FileSpreadsheet className="w-4 h-4" />;
      case "regulations": return <FileText className="w-4 h-4" />;
      default: return <Image className="w-4 h-4" />;
    }
  };

  const groupLabel = (group: string) => {
    const labels: Record<string, string> = {
      written: txt.written,
      drawings: txt.drawings,
      budget: txt.budget,
      regulations: txt.regulations,
      other: txt.other,
    };
    return labels[group] ?? group;
  };

  // ── Upload area (before processing) ─────────────────────
  if (!zipResult) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{txt.title}</h3>
          <p className="text-sm text-gray-500 mt-1">{txt.subtitle}</p>
        </div>

        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
            ${isProcessing ? "border-accent bg-accent-light" : "border-gray-300 hover:border-accent hover:bg-gray-50"}
          `}
        >
          {isProcessing ? (
            <div className="space-y-3">
              <Loader2 className="w-10 h-10 text-accent mx-auto animate-spin" />
              <p className="text-sm font-medium text-accent">{progress || txt.processing}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <FileArchive className="w-10 h-10 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-600 font-medium">{txt.dropHere}</p>
              <p className="text-xs text-gray-400">.zip (PDF, XLS, XLSX, DWG, DWFx)</p>
            </div>
          )}
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
      </div>
    );
  }

  // ── Results view (after processing) ─────────────────────
  const groups = ["written", "drawings", "budget", "regulations", "other"] as const;
  const filesByGroup = groups.reduce((acc, g) => {
    acc[g] = zipResult.files.filter(f => f.group === g);
    return acc;
  }, {} as Record<string, ExtractedFile[]>);

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center justify-between bg-accent-light rounded-xl p-4">
        <div className="flex items-center gap-3">
          <FileArchive className="w-6 h-6 text-accent" />
          <div>
            <p className="font-medium text-accent">
              {zipResult.stats.totalFiles} {txt.filesFound}
            </p>
            <p className="text-xs text-accent">
              {(zipResult.stats.totalSize / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        </div>

        {/* File type breakdown */}
        <div className="flex items-center gap-4 text-xs text-gray-600">
          {zipResult.stats.writtenDocs > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" /> {zipResult.stats.writtenDocs}
            </span>
          )}
          {zipResult.stats.drawings > 0 && (
            <span className="flex items-center gap-1">
              <PenTool className="w-3 h-3" /> {zipResult.stats.drawings}
            </span>
          )}
          {zipResult.stats.budgetDocs > 0 && (
            <span className="flex items-center gap-1">
              <FileSpreadsheet className="w-3 h-3" /> {zipResult.stats.budgetDocs}
            </span>
          )}
        </div>
      </div>

      {/* Coordinate detection alert */}
      {zipResult.files.some(f => f.hasCoordinates) && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <MapPin className="w-4 h-4" />
          {txt.coordinatesDetected}: {zipResult.files.filter(f => f.hasCoordinates).map(f => f.name).join(", ")}
        </div>
      )}

      {/* File groups (collapsible) */}
      <div className="space-y-2">
        {groups.map(group => {
          const groupFiles = filesByGroup[group];
          if (groupFiles.length === 0) return null;

          const isExpanded = expandedGroup === group;

          return (
            <div key={group} className="border border-gray-200 rounded-lg">
              <button
                onClick={() => setExpandedGroup(isExpanded ? null : group)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  {groupIcon(group)}
                  {groupLabel(group)}
                  <span className="text-gray-400 font-normal">({groupFiles.length})</span>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 p-3 space-y-1">
                  {groupFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-gray-700">{file.name}</span>
                        {file.hasCoordinates && (
                          <MapPin className="w-3 h-3 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-xs text-gray-400">
                          {CATEGORY_LABELS[file.category]?.[lang] ?? file.category}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          file.categoryConfidence >= 0.8
                            ? "bg-green-100 text-green-700"
                            : file.categoryConfidence >= 0.5
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {Math.round(file.categoryConfidence * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Document Checklist */}
      {checklist && (
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900">{txt.docChecklist}</h4>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${checklist.summary.completenessPercent}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">
                {checklist.summary.completenessPercent}% {txt.complete}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            {checklist.items
              .filter(item => item.isRequired)
              .map(item => (
                <div key={item.document.id} className="flex items-center justify-between py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    {item.isPresent ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className={item.isPresent ? "text-gray-700" : "text-red-700 font-medium"}>
                      {lang === "pt" ? item.document.namePt : item.document.nameEn}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{item.document.legalBasis}</span>
                </div>
              ))}

            {/* Show non-required items separately */}
            {checklist.items.filter(i => !i.isRequired && i.isPresent).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">{txt.notRequired}:</p>
                {checklist.items
                  .filter(i => !i.isRequired && i.isPresent)
                  .map(item => (
                    <div key={item.document.id} className="flex items-center gap-2 py-1 text-sm text-gray-500">
                      <CheckCircle2 className="w-3 h-3 text-gray-400" />
                      {lang === "pt" ? item.document.namePt : item.document.nameEn}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Missing mandatory warnings */}
          {checklist.missingMandatory.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-1">
                <AlertTriangle className="w-4 h-4" />
                {lang === "pt"
                  ? `${checklist.missingMandatory.length} documento(s) obrigatório(s) em falta`
                  : `${checklist.missingMandatory.length} mandatory document(s) missing`}
              </div>
              <ul className="text-xs text-amber-700 ml-6 list-disc">
                {checklist.missingMandatory.map(item => (
                  <li key={item.document.id}>
                    {lang === "pt" ? item.document.namePt : item.document.nameEn}
                    <span className="text-amber-500 ml-1">({item.document.legalBasis})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {zipResult.warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          {zipResult.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

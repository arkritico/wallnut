"use client";

import { useState, useRef } from "react";
import type { BuildingProject, BuildingType } from "@/lib/types";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "@/lib/templates";
import { PORTUGAL_DISTRICTS, CLIMATE_DATA } from "@/lib/regulations";
import { extractTextFromFile, parseDocumentWithAI, mergeExtractedData, type ParsedProjectData } from "@/lib/document-parser";
import { analyzeIfcSpecialty, type SpecialtyAnalysisResult } from "@/lib/ifc-specialty-analyzer";
import { mergeIfcFieldsIntoProject, type IfcEnrichmentReport } from "@/lib/ifc-enrichment";
import type { IfcAnalyzeResponse } from "@/app/api/ifc-analyze/route";
import ZipUpload from "@/components/ZipUpload";
import { useI18n } from "@/lib/i18n";
import type { ChecklistResult } from "@/lib/document-checklist";
import type { ParsedBoq } from "@/lib/xlsx-parser";
import type { ExtractedFile } from "@/lib/zip-processor";
import {
  ChevronRight,
  ChevronLeft,
  FileUp,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Box,
} from "lucide-react";

interface ProjectWizardProps {
  onComplete: (project: BuildingProject) => void;
  onCancel: () => void;
}

type WizardStep = "start" | "template" | "upload" | "upload-zip" | "basics" | "location" | "review";

const STEPS: WizardStep[] = ["start", "template", "basics", "location", "review"];

export default function ProjectWizard({ onComplete, onCancel }: ProjectWizardProps) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState<WizardStep>("start");
  const [project, setProject] = useState<BuildingProject>(DEFAULT_PROJECT);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParsedProjectData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ZIP upload state
  const [zipChecklist, setZipChecklist] = useState<ChecklistResult | null>(null);
  const [zipBoqs, setZipBoqs] = useState<ParsedBoq[]>([]);
  const [zipFiles, setZipFiles] = useState<ExtractedFile[]>([]);

  // IFC upload state
  const [ifcAnalyses, setIfcAnalyses] = useState<SpecialtyAnalysisResult[]>([]);
  const [ifcReport, setIfcReport] = useState<IfcEnrichmentReport | null>(null);
  const [ifcFileNames, setIfcFileNames] = useState<string[]>([]);
  const ifcInputRef = useRef<HTMLInputElement>(null);

  const stepIndex = STEPS.indexOf(step);

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]);
    }
  }

  function goBack() {
    if (step === "upload") {
      setStep("start");
    } else if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1]);
    }
  }

  function selectTemplate(tmpl: ProjectTemplate) {
    setSelectedTemplate(tmpl.id);
    setProject({ ...tmpl.project });
    goNext();
  }

  function startBlank() {
    setSelectedTemplate(null);
    setProject({ ...DEFAULT_PROJECT });
    // Skip template step, go to basics
    setStep("basics");
  }

  function startWithUpload() {
    setStep("upload");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadedFileName(file.name);

    try {
      const text = await extractTextFromFile(file);
      const parsed = await parseDocumentWithAI(text, project);
      setParseResult(parsed);

      // Auto-merge extracted data
      const merged = mergeExtractedData(project, parsed, "medium");
      setProject(merged);

      // Go to basics to review
      setStep("basics");
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : lang === "pt" ? "Erro ao processar o documento" : "Error processing document",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleIfcUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      let newAnalyses: SpecialtyAnalysisResult[];
      let names: string[];

      // Delegate to server for large files (> 2MB total) to avoid blocking the UI
      const totalSize = Array.from(files).reduce((sum, f) => sum + f.size, 0);
      const useServer = totalSize > 2 * 1024 * 1024;

      if (useServer) {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
          formData.append("files", files[i]);
        }

        const response = await fetch("/api/ifc-analyze", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Erro de servidor" }));
          throw new Error(err.error || "Erro ao processar ficheiros IFC no servidor");
        }

        const result: IfcAnalyzeResponse = await response.json();
        newAnalyses = result.analyses;
        names = result.fileNames;
      } else {
        // Client-side path for small files (no network round-trip)
        newAnalyses = [];
        names = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          names.push(file.name);
          const content = await file.text();
          newAnalyses.push(analyzeIfcSpecialty(content));
        }
      }

      setIfcAnalyses(newAnalyses);
      setIfcFileNames(names);

      // Merge IFC data into project
      const { project: enriched, report } = mergeIfcFieldsIntoProject(project, newAnalyses);
      setProject(enriched);
      setIfcReport(report);

      // Go to basics to review
      setStep("basics");
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : lang === "pt" ? "Erro ao processar ficheiro IFC" : "Error processing IFC file",
      );
    } finally {
      setIsUploading(false);
    }
  }

  function handleFinish() {
    onComplete(project);
  }

  function updateField<K extends keyof BuildingProject>(key: K, value: BuildingProject[K]) {
    setProject(prev => ({ ...prev, [key]: value }));
  }

  function updateLocation(field: string, value: string | number) {
    setProject(prev => {
      const newLocation = { ...prev.location, [field]: value };
      if (field === "district" && typeof value === "string" && CLIMATE_DATA[value]) {
        const climate = CLIMATE_DATA[value];
        newLocation.climateZoneWinter = climate.winter;
        newLocation.climateZoneSummer = climate.summer;
      }
      return { ...prev, location: newLocation };
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress bar */}
      {step !== "upload" && (
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  i <= stepIndex
                    ? "bg-accent text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {i < stepIndex ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${i < stepIndex ? "bg-accent" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Step: Start ── */}
      {step === "start" && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {lang === "pt" ? "Como deseja começar?" : "How would you like to start?"}
            </h2>
            <p className="text-gray-500">
              {lang === "pt"
                ? "Escolha um modelo pré-definido, carregue um documento ou comece do zero."
                : "Choose a pre-defined template, upload a document, or start from scratch."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ZIP upload option (primary) */}
            <button
              onClick={() => setStep("upload-zip")}
              className="p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-emerald-400 transition-colors text-left group md:col-span-2"
            >
              <div className="flex items-start gap-4">
                <FileArchive className="w-10 h-10 text-emerald-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-emerald-600 mb-1">
                    {lang === "pt" ? "Carregar ZIP do Projeto" : "Upload Project ZIP"}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {lang === "pt"
                      ? "Carregue um ZIP com todos os documentos (PDFs, XLS, desenhos). Auto-classificação, verificação de completude e extração de dados."
                      : "Upload a ZIP with all documents (PDFs, XLS, drawings). Auto-classification, completeness check and data extraction."}
                  </p>
                </div>
              </div>
            </button>

            {/* Template option */}
            <button
              onClick={() => setStep("template")}
              className="p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-accent transition-colors text-left group"
            >
              <div className="text-3xl mb-3">📋</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-accent mb-1">
                {lang === "pt" ? "Usar Modelo" : "Use Template"}
              </h3>
              <p className="text-sm text-gray-500">
                {lang === "pt"
                  ? "Moradia T3, Apartamento T2, Loja ou Edifício. Campos pré-preenchidos."
                  : "T3 House, T2 Apartment, Shop or Building. Pre-filled fields."}
              </p>
            </button>

            {/* Upload single doc option */}
            <button
              onClick={startWithUpload}
              className="p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-green-400 transition-colors text-left group"
            >
              <div className="text-3xl mb-3">📄</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-green-600 mb-1">
                {lang === "pt" ? "Carregar Documento" : "Upload Document"}
              </h3>
              <p className="text-sm text-gray-500">
                {lang === "pt"
                  ? "Memória descritiva ou projeto de especialidade. IA auto-preenchimento."
                  : "Descriptive report or specialty project. AI auto-fill."}
              </p>
            </button>

            {/* Upload IFC option */}
            <button
              onClick={() => ifcInputRef.current?.click()}
              className="p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-purple-400 transition-colors text-left group"
            >
              <input
                ref={ifcInputRef}
                type="file"
                accept=".ifc"
                multiple
                onChange={handleIfcUpload}
                className="hidden"
              />
              <div className="flex items-center gap-2 mb-3">
                <Box className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="font-semibold text-gray-900 group-hover:text-purple-600 mb-1">
                {lang === "pt" ? "Carregar Modelo IFC" : "Upload IFC Model"}
              </h3>
              <p className="text-sm text-gray-500">
                {lang === "pt"
                  ? "Modelo BIM (Revit, ArchiCAD). Auto-preenchimento de elementos, pisos e materiais."
                  : "BIM model (Revit, ArchiCAD). Auto-fill elements, floors and materials."}
              </p>
            </button>

            {/* Blank option */}
            <button
              onClick={startBlank}
              className="p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-gray-400 transition-colors text-left group md:col-span-2"
            >
              <div className="text-3xl mb-3">✏️</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-gray-600 mb-1">
                {lang === "pt" ? "Começar do Zero" : "Start from Scratch"}
              </h3>
              <p className="text-sm text-gray-500">
                {lang === "pt"
                  ? "Preencher todos os campos manualmente."
                  : "Fill in all fields manually."}
              </p>
            </button>
          </div>

          {/* IFC loading state */}
          {isUploading && (
            <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
              <p className="text-sm text-purple-700">
                {lang === "pt" ? "A analisar modelo IFC..." : "Analyzing IFC model..."}
              </p>
            </div>
          )}

          {uploadError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {uploadError}
            </div>
          )}

          <div className="text-center mt-4">
            <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Template Selection ── */}
      {step === "template" && (
        <div className="space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {lang === "pt" ? "Escolha um modelo" : "Choose a template"}
            </h2>
            <p className="text-gray-500">
              {lang === "pt"
                ? "Todos os campos serão pré-preenchidos. Pode editar depois."
                : "All fields will be pre-filled. You can edit later."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PROJECT_TEMPLATES.map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => selectTemplate(tmpl)}
                className={`p-5 bg-white border-2 rounded-xl hover:border-accent transition-colors text-left ${
                  selectedTemplate === tmpl.id ? "border-accent bg-accent-light" : "border-gray-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{tmpl.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {t[tmpl.nameKey as keyof typeof t] || tmpl.project.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {t[tmpl.descriptionKey as keyof typeof t] || ""}
                    </p>
                    <div className="flex gap-3 mt-2 text-xs text-gray-400">
                      <span>{tmpl.project.grossFloorArea}m²</span>
                      <span>{tmpl.project.numberOfFloors} {lang === "pt" ? "pisos" : "floors"}</span>
                      <span>{tmpl.project.numberOfDwellings || 1} {lang === "pt" ? "fogos" : "dwellings"}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> {t.back}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Upload ZIP ── */}
      {step === "upload-zip" && (
        <div className="space-y-6">
          <ZipUpload
            project={project}
            onFilesProcessed={async ({ extractedTexts, boqs, checklist, files }) => {
              setZipChecklist(checklist);
              setZipBoqs(boqs);
              setZipFiles(files);

              // Try AI parsing of the combined extracted texts
              if (extractedTexts.length > 0) {
                setIsUploading(true);
                try {
                  const combinedText = extractedTexts.join("\n\n---\n\n").slice(0, 30000);
                  const parsed = await parseDocumentWithAI(combinedText, project);
                  setParseResult(parsed);
                  const merged = mergeExtractedData(project, parsed, "medium");
                  setProject(merged);
                } catch {
                  // AI parsing failed — continue with whatever we have
                }
                setIsUploading(false);
              }

              setStep("basics");
            }}
          />

          <div className="flex justify-between mt-6">
            <button onClick={() => setStep("start")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> {t.back}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Upload ── */}
      {step === "upload" && (
        <div className="space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {lang === "pt" ? "Carregar Documento" : "Upload Document"}
            </h2>
            <p className="text-gray-500">
              {lang === "pt"
                ? "Carregue uma memória descritiva, projeto de especialidade ou documento técnico em PDF ou texto."
                : "Upload a descriptive report, specialty project, or technical document in PDF or text format."}
            </p>
          </div>

          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-accent transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
            />

            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-12 h-12 text-accent animate-spin" />
                <p className="text-gray-600 font-medium">
                  {lang === "pt" ? "A analisar documento..." : "Analyzing document..."}
                </p>
                <p className="text-sm text-gray-400">
                  {lang === "pt" ? "Extração de texto e análise por IA" : "Text extraction and AI analysis"}
                </p>
              </div>
            ) : uploadedFileName ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <p className="text-gray-600 font-medium">{uploadedFileName}</p>
                <p className="text-sm text-green-600">
                  {lang === "pt" ? "Documento analisado com sucesso!" : "Document analyzed successfully!"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FileUp className="w-12 h-12 text-gray-400" />
                <p className="text-gray-600 font-medium">
                  {lang === "pt"
                    ? "Clique para selecionar ou arraste o ficheiro"
                    : "Click to select or drag the file"}
                </p>
                <p className="text-sm text-gray-400">PDF, TXT (max 20MB)</p>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {uploadError}
            </div>
          )}

          {parseResult && parseResult.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800 mb-1">
                {lang === "pt" ? "Avisos da extração:" : "Extraction warnings:"}
              </p>
              <ul className="text-sm text-amber-700 list-disc list-inside">
                {parseResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> {t.back}
            </button>
            {parseResult && (
              <button
                onClick={() => setStep("basics")}
                className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium"
              >
                {lang === "pt" ? "Continuar" : "Continue"} <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step: Basics ── */}
      {step === "basics" && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">
            {lang === "pt" ? "Dados Básicos" : "Basic Data"}
          </h2>

          {parseResult && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {lang === "pt"
                ? "Campos preenchidos automaticamente a partir do documento. Verifique e ajuste os valores."
                : "Fields auto-filled from document. Please verify and adjust values."}
            </div>
          )}

          {zipChecklist && (
            <div className="p-3 bg-accent-light border border-accent rounded-lg text-sm text-accent">
              <span className="font-medium">
                {lang === "pt" ? "Documentos:" : "Documents:"}
              </span>{" "}
              {zipChecklist.summary.present}/{zipChecklist.summary.totalRequired}{" "}
              {lang === "pt" ? "presentes" : "present"}
              {" "}({zipChecklist.summary.completenessPercent}%)
              {zipFiles.length > 0 && (
                <span className="text-accent ml-2">
                  | {zipFiles.length} {lang === "pt" ? "ficheiros processados" : "files processed"}
                  {zipBoqs.length > 0 && ` | ${zipBoqs.length} BOQ`}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.projectName}</label>
              <input
                type="text"
                value={project.name}
                onChange={e => updateField("name", e.target.value)}
                placeholder={t.projectNamePlaceholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.buildingType}</label>
              <select
                value={project.buildingType}
                onChange={e => updateField("buildingType", e.target.value as BuildingType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              >
                <option value="residential">{t.residential}</option>
                <option value="commercial">{t.commercial}</option>
                <option value="mixed">{t.mixed}</option>
                <option value="industrial">{t.industrial}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.rehabilitation}</label>
              <select
                value={project.isRehabilitation ? "yes" : "no"}
                onChange={e => updateField("isRehabilitation", e.target.value === "yes")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              >
                <option value="no">{lang === "pt" ? "Construção nova" : "New construction"}</option>
                <option value="yes">{lang === "pt" ? "Reabilitação" : "Rehabilitation"}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.grossArea}</label>
              <input
                type="number"
                value={project.grossFloorArea}
                onChange={e => updateField("grossFloorArea", parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.usableArea}</label>
              <input
                type="number"
                value={project.usableFloorArea}
                onChange={e => updateField("usableFloorArea", parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.numberOfFloors}</label>
              <input
                type="number"
                value={project.numberOfFloors}
                onChange={e => updateField("numberOfFloors", parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.buildingHeight}</label>
              <input
                type="number"
                step="0.1"
                value={project.buildingHeight}
                onChange={e => updateField("buildingHeight", parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.numberOfDwellings}</label>
              <input
                type="number"
                value={project.numberOfDwellings ?? 1}
                onChange={e => updateField("numberOfDwellings", parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> {t.back}
            </button>
            <button
              onClick={goNext}
              className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium"
            >
              {lang === "pt" ? "Continuar" : "Continue"} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Location ── */}
      {step === "location" && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">
            {lang === "pt" ? "Localização" : "Location"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.district}</label>
              <select
                value={project.location.district}
                onChange={e => {
                  updateLocation("district", e.target.value);
                  updateLocation("municipality", e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              >
                {PORTUGAL_DISTRICTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.municipality}</label>
              <input
                type="text"
                value={project.location.municipality}
                onChange={e => updateLocation("municipality", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.parish}</label>
              <input
                type="text"
                value={project.location.parish ?? ""}
                onChange={e => updateLocation("parish", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.altitude}</label>
              <input
                type="number"
                value={project.location.altitude}
                onChange={e => updateLocation("altitude", parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.distanceToCoast}</label>
              <input
                type="number"
                value={project.location.distanceToCoast}
                onChange={e => updateLocation("distanceToCoast", parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {lang === "pt" ? "Zona Climática Inverno" : "Winter Climate Zone"}
              </label>
              <select
                value={project.location.climateZoneWinter}
                onChange={e => updateLocation("climateZoneWinter", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              >
                <option value="I1">I1</option>
                <option value="I2">I2</option>
                <option value="I3">I3</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {lang === "pt" ? "Zona Climática Verão" : "Summer Climate Zone"}
              </label>
              <select
                value={project.location.climateZoneSummer}
                onChange={e => updateLocation("climateZoneSummer", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
              >
                <option value="V1">V1</option>
                <option value="V2">V2</option>
                <option value="V3">V3</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> {t.back}
            </button>
            <button
              onClick={goNext}
              className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium"
            >
              {lang === "pt" ? "Continuar" : "Continue"} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Review ── */}
      {step === "review" && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">
            {lang === "pt" ? "Revisão" : "Review"}
          </h2>

          <div className="bg-gray-50 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <span className="text-gray-500">{t.projectName}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.name || "—"}</span>
              </div>
              <div>
                <span className="text-gray-500">{t.buildingType}:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {project.buildingType === "residential" ? t.residential :
                   project.buildingType === "commercial" ? t.commercial :
                   project.buildingType === "mixed" ? t.mixed : t.industrial}
                </span>
              </div>
              <div>
                <span className="text-gray-500">{t.grossArea}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.grossFloorArea} m²</span>
              </div>
              <div>
                <span className="text-gray-500">{t.usableArea}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.usableFloorArea} m²</span>
              </div>
              <div>
                <span className="text-gray-500">{t.numberOfFloors}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.numberOfFloors}</span>
              </div>
              <div>
                <span className="text-gray-500">{t.buildingHeight}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.buildingHeight} m</span>
              </div>
              <div>
                <span className="text-gray-500">{t.numberOfDwellings}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.numberOfDwellings}</span>
              </div>
              <div>
                <span className="text-gray-500">{t.rehabilitation}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.isRehabilitation ? t.yes : t.no}</span>
              </div>
              <div>
                <span className="text-gray-500">{t.district}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.location.district}</span>
              </div>
              <div>
                <span className="text-gray-500">{t.municipality}:</span>
                <span className="ml-2 font-medium text-gray-900">{project.location.municipality}</span>
              </div>
            </div>

            {selectedTemplate && (
              <div className="pt-3 border-t border-gray-200">
                <p className="text-sm text-accent">
                  {lang === "pt"
                    ? `Baseado no modelo: ${PROJECT_TEMPLATES.find(t => t.id === selectedTemplate)?.project.name}`
                    : `Based on template: ${PROJECT_TEMPLATES.find(t => t.id === selectedTemplate)?.project.name}`}
                </p>
              </div>
            )}

            {uploadedFileName && (
              <div className="pt-3 border-t border-gray-200">
                <p className="text-sm text-green-600">
                  {lang === "pt"
                    ? `Dados extraídos de: ${uploadedFileName}`
                    : `Data extracted from: ${uploadedFileName}`}
                </p>
              </div>
            )}

            {ifcReport && ifcReport.populatedFields.length > 0 && (
              <div className="pt-3 border-t border-gray-200">
                <p className="text-sm text-purple-600 font-medium">
                  {lang === "pt"
                    ? `IFC: ${ifcReport.populatedFields.length} campos auto-preenchidos de ${ifcFileNames.join(", ")}`
                    : `IFC: ${ifcReport.populatedFields.length} fields auto-populated from ${ifcFileNames.join(", ")}`}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {ifcReport.totalElements} {lang === "pt" ? "elementos" : "elements"}
                  {ifcReport.storeys.length > 0 && ` | ${ifcReport.storeys.length} ${lang === "pt" ? "pisos" : "floors"}`}
                  {ifcReport.materials.length > 0 && ` | ${ifcReport.materials.length} ${lang === "pt" ? "materiais" : "materials"}`}
                </p>
              </div>
            )}
          </div>

          <div className="bg-accent-light border border-accent rounded-lg p-4 text-sm text-accent">
            {lang === "pt"
              ? "Após concluir, pode editar todos os campos detalhados no formulário completo antes de analisar."
              : "After finishing, you can edit all detailed fields in the full form before analyzing."}
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> {t.back}
            </button>
            <button
              onClick={handleFinish}
              className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover font-semibold transition-colors"
            >
              {lang === "pt" ? "Continuar para Formulário Completo" : "Continue to Full Form"}
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

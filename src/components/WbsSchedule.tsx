"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Upload,
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Users,
  Euro,
  Calendar,
  FileText,
  ArrowLeft,
  Play,
  BarChart3,
} from "lucide-react";
import type { WbsProject, WbsChapter, WbsSubChapter, WbsArticle, MatchReport, ProjectSchedule, CriticalChainBuffer } from "@/lib/wbs-types";
import type { CypeWorkItem } from "@/lib/cost-estimation";
import { generateSchedule, type ScheduleOptions } from "@/lib/construction-sequencer";
import { downloadMSProjectXML, generateScheduleSummary } from "@/lib/msproject-export";
import { formatCost } from "@/lib/cost-estimation";
import { aggregateProjectResources, type ProjectResources } from "@/lib/resource-aggregator";
import { downloadBudgetExcel } from "@/lib/budget-export";
import { optimizeSchedule, getDefaultConstraints, type OptimizedSchedule, type SiteCapacityConstraints } from "@/lib/site-capacity-optimizer";
import { parseCsvWbs, parseJsonWbs } from "@/lib/wbs-parser";
import ProjectUploader, { type UnifiedProject } from "@/components/ProjectUploader";
import {
  parseCypeExport, importCypePrices, getImportedCount,
  getAllParametricItems, calculateParametricPrice,
  type PriceResult, type ParametricItem,
} from "@/lib/cype-parametric";
import {
  analyzeIfcSpecialty, detectSpecialty,
  type SpecialtyAnalysisResult, type IfcSpecialty,
} from "@/lib/ifc-specialty-analyzer";
import {
  extrapolateProject,
  type ExtrapolationInput, type ExtrapolationResult, type ProjectStage,
} from "@/lib/project-extrapolator";
import type { BuildingType } from "@/lib/types";

interface WbsScheduleProps {
  onBack: () => void;
}

type Step = "import" | "match" | "schedule";

export default function WbsSchedule({ onBack }: WbsScheduleProps) {
  const [step, setStep] = useState<Step>("import");
  const [wbsProject, setWbsProject] = useState<WbsProject | null>(null);
  const [matchReport, setMatchReport] = useState<MatchReport | null>(null);
  const [schedule, setSchedule] = useState<ProjectSchedule | null>(null);
  const [resources, setResources] = useState<ProjectResources | null>(null);
  const [optimizedSchedule, setOptimizedSchedule] = useState<OptimizedSchedule | null>(null);
  const [maxWorkers, setMaxWorkers] = useState(10);
  const [maxWorkersPerFloor, setMaxWorkersPerFloor] = useState(20);
  const [showCapacityConfig, setShowCapacityConfig] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // IFC specialty analysis
  const [ifcAnalyses, setIfcAnalyses] = useState<SpecialtyAnalysisResult[]>([]);
  const [importedCypeCount, setImportedCypeCount] = useState(0);

  // Parametric configurator
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [configItem, setConfigItem] = useState<ParametricItem | null>(null);
  const [configParams, setConfigParams] = useState<Record<string, string | number>>({});
  const [configResult, setConfigResult] = useState<PriceResult | null>(null);

  // Critical Chain (Goldratt)
  const [useCriticalChain, setUseCriticalChain] = useState(true);
  const [safetyReduction, setSafetyReduction] = useState(50); // percentage

  // Project Stage Extrapolation
  const [showExtrapolation, setShowExtrapolation] = useState(false);
  const [extrapolation, setExtrapolation] = useState<ExtrapolationResult | null>(null);
  const [extrapolationGfa, setExtrapolationGfa] = useState(200);
  const [extrapolationType, setExtrapolationType] = useState<BuildingType>("residential");
  const [extrapolationFloors, setExtrapolationFloors] = useState(2);
  const [extrapolationDistrict, setExtrapolationDistrict] = useState("Lisboa");
  const [extrapolationIsRehab, setExtrapolationIsRehab] = useState(false);
  const [extrapolationStage, setExtrapolationStage] = useState<ProjectStage>("architecture");

  // ── IFC Import ───────────────────────────────────────────────
  const handleIfcImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAnalyses: SpecialtyAnalysisResult[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const text = await files[i].text();
        const result = analyzeIfcSpecialty(text);
        newAnalyses.push(result);
      } catch {
        // skip invalid files
      }
    }
    setIfcAnalyses(prev => [...prev, ...newAnalyses]);

    // Auto-merge IFC chapters into WBS project
    if (wbsProject && newAnalyses.length > 0) {
      const merged = mergeIfcIntoWbs(wbsProject, newAnalyses);
      setWbsProject(merged);
    }
  }, [wbsProject]);

  // ── CYPE Export Import ───────────────────────────────────────
  const handleCypeImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCypeExport(text);
      const count = importCypePrices(rows);
      setImportedCypeCount(prev => prev + count);
      alert(`Importados ${count} preços do CYPE Gerador de Preços.`);
    } catch {
      alert("Erro ao importar ficheiro CYPE.");
    }
  }, []);

  // ── Parametric Configurator ──────────────────────────────────
  const handleOpenConfigurator = useCallback((item: ParametricItem) => {
    setConfigItem(item);
    setConfigParams({ ...item.defaults });
    const result = item.calculatePrice({ ...item.defaults });
    setConfigResult(result);
    setShowConfigurator(true);
  }, []);

  const handleConfigChange = useCallback((key: string, value: string | number) => {
    if (!configItem) return;
    const newParams = { ...configParams, [key]: value };
    setConfigParams(newParams);
    setConfigResult(configItem.calculatePrice(newParams));
  }, [configItem, configParams]);

  // ── Import Step ──────────────────────────────────────────────
  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith(".json")) {
        const text = await file.text();
        const data = JSON.parse(text) as WbsProject;
        setWbsProject(data);
      } else if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) {
        const text = await file.text();
        const parsed = parseCsvWbs(text, file.name.endsWith(".tsv") ? "\t" : ",");
        setWbsProject(parsed);
      } else {
        alert("Formato não suportado. Use JSON ou CSV.");
      }
    } catch (err) {
      alert(`Erro ao importar: ${err instanceof Error ? err.message : "ficheiro inválido"}`);
    }
  }, []);

  const handleDemoProject = useCallback(() => {
    setWbsProject(DEMO_WBS);
  }, []);

  const handleProjectReady = useCallback((unifiedProject: UnifiedProject) => {
    setWbsProject(unifiedProject.wbsProject);
    setIfcAnalyses(unifiedProject.ifcAnalyses);
  }, []);

  // ── Match Step ───────────────────────────────────────────────
  const handleRunMatch = useCallback(async () => {
    if (!wbsProject) return;
    setIsMatching(true);
    try {
      const response = await fetch('/api/cype/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wbsProject),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      const report: MatchReport = await response.json();
      setMatchReport(report);
      setStep("match");
    } catch (error) {
      console.error('Matching error:', error);
      alert(`Erro ao fazer correspondência CYPE: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setIsMatching(false);
    }
  }, [wbsProject]);

  // ── Schedule Step ────────────────────────────────────────────
  const handleGenerateSchedule = useCallback(() => {
    if (!wbsProject || !matchReport) return;
    const opts: ScheduleOptions = {
      maxWorkers,
      useCriticalChain,
      safetyReduction: safetyReduction / 100,
      projectBufferRatio: 0.5,
      feedingBufferRatio: 0.5,
    };
    const sched = generateSchedule(wbsProject, matchReport.matches, opts);
    setSchedule(sched);

    // Aggregate project resources
    const projectResources = aggregateProjectResources(wbsProject, matchReport.matches, sched);
    setResources(projectResources);

    setStep("schedule");
  }, [wbsProject, matchReport, maxWorkers, useCriticalChain, safetyReduction]);

  // ── Extrapolation ─────────────────────────────────────────────
  const handleExtrapolate = useCallback(() => {
    const input: ExtrapolationInput = {
      stage: extrapolationStage,
      buildingType: extrapolationType,
      grossFloorArea: extrapolationGfa,
      numberOfFloors: extrapolationFloors,
      district: extrapolationDistrict,
      isRehabilitation: extrapolationIsRehab,
    };
    const result = extrapolateProject(input);
    setExtrapolation(result);

    // Optionally use the extrapolated WBS as the project
    if (!wbsProject) {
      setWbsProject(result.extrapolatedWbs);
    }
  }, [extrapolationStage, extrapolationType, extrapolationGfa, extrapolationFloors, extrapolationDistrict, extrapolationIsRehab, wbsProject]);

  const handleExportXML = useCallback(() => {
    if (!schedule) return;
    downloadMSProjectXML(schedule);
  }, [schedule]);

  const handleExportBudget = useCallback(() => {
    if (!wbsProject || !schedule || !resources) return;
    downloadBudgetExcel(wbsProject, schedule, resources, {
      projectName: wbsProject.name,
      includeVAT: true,
      vatRate: 0.23,
    });
  }, [wbsProject, schedule, resources]);

  const handleOptimize = useCallback(() => {
    if (!schedule || !resources) return;
    const constraints = getDefaultConstraints();
    constraints.maxWorkersPerFloor = maxWorkersPerFloor;
    const optimized = optimizeSchedule(schedule, resources, constraints);
    setOptimizedSchedule(optimized);
  }, [schedule, resources, maxWorkersPerFloor]);

  // ── CYPE Search ──────────────────────────────────────────────
  const [searchResults, setSearchResults] = useState<CypeWorkItem[]>([]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    fetch(`/api/cype/search?q=${encodeURIComponent(searchQuery)}&limit=8`, {
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(data => {
        if (data.results) {
          setSearchResults(data.results);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Search error:', err);
        }
      })
      .finally(() => setIsSearching(false));

    return () => controller.abort();
  }, [searchQuery]);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold text-gray-900">WBS → Orçamento → Planeamento</h2>
        </div>
        <StepIndicator current={step} />
      </div>

      {/* Step 1: Import */}
      {step === "import" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">1. Importar WBS do Projeto</h3>
          <p className="text-sm text-gray-500 mb-6">
            Importe a estrutura WBS (Work Breakdown Structure) do projeto de execução.
            Cada artigo pode incluir um keynote que corresponde aos elementos do modelo BIM.
          </p>

          {/* Unified Project Uploader */}
          <ProjectUploader onProjectReady={handleProjectReady} />

          {/* Demo Project Option */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleDemoProject}
              className="inline-flex items-center gap-2 px-6 py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-green-400 transition-colors"
            >
              <FileText className="w-5 h-5 text-gray-400" />
              <div className="text-left">
                <p className="font-medium text-gray-700">Projeto Demo</p>
                <p className="text-xs text-gray-500">Moradia T3 (ProNIC)</p>
              </div>
            </button>
          </div>

          {/* Project Stage Extrapolation */}
          <div className="border-t border-gray-200 pt-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-800">Extrapolação por Fase de Projeto</h4>
              <button
                onClick={() => setShowExtrapolation(!showExtrapolation)}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-xs font-medium border border-indigo-200"
              >
                {showExtrapolation ? "Fechar" : "Estimar Custos"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Mesmo com apenas o projeto de arquitetura, obtenha uma estimativa completa de custos,
              prazos e impactos por especialidade. A precisão melhora com mais dados.
            </p>

            {showExtrapolation && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fase do Projeto</label>
                    <select
                      value={extrapolationStage}
                      onChange={e => setExtrapolationStage(e.target.value as ProjectStage)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    >
                      <option value="pip">Informação Prévia</option>
                      <option value="architecture">Projeto de Arquitetura</option>
                      <option value="specialties">Projetos de Especialidades</option>
                      <option value="execution">Projeto de Execução</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                    <select
                      value={extrapolationType}
                      onChange={e => setExtrapolationType(e.target.value as BuildingType)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    >
                      <option value="residential">Residencial</option>
                      <option value="commercial">Comercial</option>
                      <option value="mixed">Misto</option>
                      <option value="industrial">Industrial</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Área Bruta (m²)</label>
                    <input
                      type="number"
                      value={extrapolationGfa}
                      min={20}
                      max={50000}
                      onChange={e => setExtrapolationGfa(Math.max(20, Number(e.target.value)))}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">N.º Pisos</label>
                    <input
                      type="number"
                      value={extrapolationFloors}
                      min={1}
                      max={30}
                      onChange={e => setExtrapolationFloors(Math.max(1, Number(e.target.value)))}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Distrito</label>
                    <select
                      value={extrapolationDistrict}
                      onChange={e => setExtrapolationDistrict(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    >
                      {["Lisboa", "Porto", "Setúbal", "Faro", "Braga", "Aveiro", "Coimbra", "Leiria",
                        "Santarém", "Viseu", "Viana do Castelo", "Vila Real", "Bragança", "Guarda",
                        "Castelo Branco", "Portalegre", "Évora", "Beja", "R.A. Madeira", "R.A. Açores",
                      ].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 pb-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={extrapolationIsRehab}
                        onChange={e => setExtrapolationIsRehab(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="text-sm text-gray-700">Reabilitação</span>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleExtrapolate}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                >
                  Extrapolar Custos
                </button>

                {extrapolation && <ExtrapolationPanel result={extrapolation} />}
              </div>
            )}
          </div>

          {/* IFC Analysis Results */}
          {ifcAnalyses.length > 0 && (
            <div className="border-t border-gray-200 pt-4 mb-4">
              <h4 className="font-medium text-purple-800 mb-3">Análise IFC por Especialidade</h4>
              <div className="space-y-3">
                {ifcAnalyses.map((analysis, idx) => {
                  const specialtyLabels: Record<IfcSpecialty, string> = {
                    architecture: "Arquitetura", structure: "Estrutura",
                    plumbing: "Águas e Drenagem", electrical: "Eletricidade",
                    hvac: "AVAC", fire_safety: "SCIE",
                    telecom: "ITED/ITUR", gas: "Gás", unknown: "Desconhecida",
                  };
                  return (
                    <div key={idx} className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-purple-900">
                          {specialtyLabels[analysis.specialty]} - {analysis.summary.totalElements} elementos
                        </span>
                        <span className="text-xs text-purple-600">
                          {analysis.chapters.length} cap. | {analysis.optimizations.length} otimizações
                        </span>
                      </div>
                      {/* Element breakdown */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {Object.entries(analysis.summary.elementsByType).map(([type, count]) => (
                          <span key={type} className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                            {type.replace("IFC", "")}: {count}
                          </span>
                        ))}
                      </div>
                      {/* Storeys */}
                      {analysis.summary.storeys.length > 0 && (
                        <p className="text-xs text-purple-600">Pisos: {analysis.summary.storeys.join(", ")}</p>
                      )}
                      {/* Optimizations */}
                      {analysis.optimizations.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {analysis.optimizations.map((opt, oi) => (
                            <div key={oi} className={`text-xs p-2 rounded ${
                              opt.severity === "warning" ? "bg-amber-50 text-amber-800" :
                              opt.severity === "suggestion" ? "bg-accent-light text-accent" :
                              "bg-gray-50 text-gray-700"
                            }`}>
                              <p className="font-medium">{opt.title}</p>
                              <p className="mt-0.5">{opt.description}</p>
                              {opt.potentialSavings && (
                                <p className="mt-0.5 font-medium">Poupança potencial: {opt.potentialSavings}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!wbsProject && ifcAnalyses.length > 0 && (
                <button
                  onClick={() => {
                    const merged: WbsProject = {
                      id: `ifc-${Date.now()}`,
                      name: "Projeto IFC",
                      classification: "ProNIC",
                      startDate: new Date().toISOString().split("T")[0],
                      chapters: ifcAnalyses.flatMap(a => a.chapters),
                    };
                    setWbsProject(merged);
                  }}
                  className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                >
                  Criar WBS a partir dos IFC
                </button>
              )}
            </div>
          )}

          {/* CYPE Import & Parametric Configurator */}
          <div className="border-t border-gray-200 pt-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-800">Preços CYPE</h4>
              <div className="flex items-center gap-2">
                {importedCypeCount > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                    {importedCypeCount} preços importados
                  </span>
                )}
                <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 cursor-pointer text-xs font-medium border border-amber-200">
                  <Upload className="w-3 h-3" /> Importar export CYPE
                  <input type="file" accept=".csv,.tsv,.txt,.xls" onChange={handleCypeImport} className="hidden" />
                </label>
                <button
                  onClick={() => setShowConfigurator(!showConfigurator)}
                  className="px-3 py-1.5 bg-accent-light text-accent rounded-lg hover:bg-accent-medium text-xs font-medium border border-accent"
                >
                  Configurador Paramétrico
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Os preços estáticos são estimativas. Importe um export do CYPE Gerador de Preços (.csv) para usar preços reais, ou use o configurador para ajustar parâmetros (tipo de abertura, vidro, espessura, etc.).
            </p>

            {/* Parametric Configurator */}
            {showConfigurator && (
              <div className="bg-accent-light border border-accent rounded-lg p-4 mb-4">
                <h5 className="font-medium text-accent mb-3">Configurador de Preços Paramétricos</h5>
                <div className="flex flex-wrap gap-2 mb-4">
                  {getAllParametricItems().map(item => (
                    <button
                      key={item.code}
                      onClick={() => handleOpenConfigurator(item)}
                      className={`px-3 py-1.5 rounded text-xs font-medium ${
                        configItem?.code === item.code
                          ? "bg-accent text-white"
                          : "bg-white text-accent border border-accent hover:bg-accent-medium"
                      }`}
                    >
                      {item.description}
                    </button>
                  ))}
                </div>

                {configItem && (
                  <div className="bg-white rounded-lg p-4 border border-accent">
                    <h6 className="font-medium text-gray-900 mb-3">{configItem.description} ({configItem.code})</h6>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      {configItem.parameters.map(param => (
                        <div key={param.key}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {param.label} {param.unit ? `(${param.unit})` : ""}
                          </label>
                          {param.type === "select" && param.options ? (
                            <select
                              value={String(configParams[param.key] ?? "")}
                              onChange={e => handleConfigChange(param.key, e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            >
                              {param.options.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : param.type === "number" ? (
                            <input
                              type="number"
                              value={Number(configParams[param.key] ?? 0)}
                              min={param.min}
                              max={param.max}
                              step={0.01}
                              onChange={e => handleConfigChange(param.key, parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          ) : (
                            <select
                              value={String(configParams[param.key] ?? "true")}
                              onChange={e => handleConfigChange(param.key, e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            >
                              <option value="true">Sim</option>
                              <option value="false">Não</option>
                            </select>
                          )}
                        </div>
                      ))}
                    </div>

                    {configResult && (
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            {formatCost(configResult.unitCost)} / {configResult.unit}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            configResult.source === "imported"
                              ? "bg-green-100 text-green-700"
                              : "bg-accent-medium text-accent"
                          }`}>
                            {configResult.source === "imported" ? "CYPE importado" : "Paramétrico"}
                          </span>
                        </div>
                        <code className="text-xs text-gray-500">{configResult.variantCode}</code>
                        <p className="text-xs text-gray-700 mt-1">{configResult.fullDescription}</p>
                        <div className="flex gap-4 mt-2 text-xs text-gray-600">
                          <span>Mat. {formatCost(configResult.breakdown.materials)}</span>
                          <span>MO {formatCost(configResult.breakdown.labor)}</span>
                          <span>Eq. {formatCost(configResult.breakdown.machinery)}</span>
                        </div>
                        {configResult.notes.length > 0 && (
                          <ul className="mt-2 text-xs text-gray-500 space-y-0.5">
                            {configResult.notes.map((n, i) => (
                              <li key={i}>- {n}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CYPE Search */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
              <Search className="w-4 h-4" /> Pesquisar Base de Dados CYPE
            </h4>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Ex: alvenaria tijolo, caixilharia alumínio, betão C25/30..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map(r => (
                  <div key={r.code} className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <code className="text-xs font-mono px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">{r.code}</code>
                        <span className="ml-2 text-gray-800">{r.description}</span>
                        <p className="text-xs text-gray-400 mt-0.5">{r.chapter}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="font-medium text-gray-900">{formatCost(r.unitCost)}/{r.unit}</p>
                        <p className="text-xs text-gray-500">
                          Mat. {formatCost(r.breakdown.materials)} | MO {formatCost(r.breakdown.labor)} | Eq. {formatCost(r.breakdown.machinery)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WBS Preview */}
          {wbsProject && (
            <div className="border-t border-gray-200 pt-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-gray-900">{wbsProject.name}</h4>
                  <p className="text-xs text-gray-500">
                    {wbsProject.chapters.length} capítulos,{" "}
                    {wbsProject.chapters.reduce((sum, ch) => sum + ch.subChapters.reduce((s, sub) => s + sub.articles.length, 0), 0)} artigos
                  </p>
                </div>
                <button
                  onClick={handleRunMatch}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
                >
                  <Play className="w-4 h-4" />
                  Mapear para CYPE
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-2">
                {wbsProject.chapters.map(ch => (
                  <div key={ch.code} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="font-medium text-gray-800 text-sm">{ch.code} - {ch.name}</p>
                    <div className="mt-1 space-y-0.5">
                      {ch.subChapters.map(sub => (
                        <div key={sub.code} className="text-xs text-gray-600 pl-4">
                          {sub.code} - {sub.name} ({sub.articles.length} art.)
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Match Results */}
      {step === "match" && matchReport && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">2. Correspondência CYPE</h3>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <StatCard label="Total Artigos" value={matchReport.stats.totalArticles} color="gray" />
              <StatCard label="Correspondidos" value={matchReport.stats.matched} color="green" />
              <StatCard label="Alta Confiança" value={matchReport.stats.highConfidence} color="emerald" />
              <StatCard label="Média Confiança" value={matchReport.stats.mediumConfidence} color="amber" />
              <StatCard label="Sem Corresp." value={matchReport.stats.unmatched} color="red" />
            </div>

            {/* Coverage bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Cobertura</span>
                <span className="font-medium text-gray-900">{matchReport.stats.coveragePercent}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all"
                  style={{ width: `${matchReport.stats.coveragePercent}%` }}
                />
              </div>
            </div>

            {/* Matches list */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {matchReport.matches.map(m => (
                <div key={m.articleCode} className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-500">{m.articleCode}</span>
                        <span className="text-gray-400">→</span>
                        <code className="text-xs font-mono px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">{m.cypeCode}</code>
                        <ConfidenceBadge confidence={m.confidence} />
                      </div>
                      <p className="text-gray-700 mt-1">{m.articleDescription}</p>
                      <p className="text-xs text-gray-500 mt-0.5">CYPE: {m.cypeDescription}</p>
                      {m.warnings.length > 0 && (
                        <p className="text-xs text-amber-600 mt-0.5">{m.warnings.join("; ")}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium text-gray-900">{formatCost(m.unitCost)}/{m.cypeUnit}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Unmatched */}
            {matchReport.unmatched.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowUnmatched(!showUnmatched)}
                  className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                >
                  {showUnmatched ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {matchReport.unmatched.length} artigos sem correspondência
                </button>
                {showUnmatched && (
                  <div className="mt-2 space-y-2">
                    {matchReport.unmatched.map(u => (
                      <div key={u.articleCode} className="p-3 bg-red-50 rounded-lg border border-red-200 text-sm">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <span className="font-mono text-xs text-gray-500">{u.articleCode}</span>
                          <span className="text-gray-700">{u.description}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 pl-6">Pesquisa sugerida: {u.suggestedSearch}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Team size, Critical Chain & generate */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dimensão máxima da equipa
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={2}
                      max={20}
                      value={maxWorkers}
                      onChange={e => setMaxWorkers(Number(e.target.value))}
                      className="w-40"
                    />
                    <span className="text-lg font-bold text-gray-900 flex items-center gap-1">
                      <Users className="w-4 h-4" /> {maxWorkers}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleGenerateSchedule}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
                >
                  <Calendar className="w-4 h-4" />
                  Gerar Planeamento
                </button>
              </div>

              {/* Critical Chain toggle */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCriticalChain}
                      onChange={e => setUseCriticalChain(e.target.checked)}
                      className="w-4 h-4 text-accent rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Critical Chain (Goldratt CCPM)
                    </span>
                  </label>
                  {useCriticalChain && (
                    <span className="text-xs px-2 py-0.5 bg-accent-medium text-accent rounded">Ativo</span>
                  )}
                </div>
                {useCriticalChain && (
                  <div className="pl-6 space-y-2">
                    <p className="text-xs text-gray-500">
                      Remove proteção individual das tarefas e concentra-a em buffers estratégicos.
                      Resultado: prazos mais realistas e visibilidade de risco.
                    </p>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-600">Redução de proteção:</label>
                      <input
                        type="range"
                        min={20}
                        max={70}
                        value={safetyReduction}
                        onChange={e => setSafetyReduction(Number(e.target.value))}
                        className="w-32"
                      />
                      <span className="text-sm font-bold text-gray-900">{safetyReduction}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Schedule */}
      {step === "schedule" && schedule && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">3. Planeamento de Obra</h3>
              <div className="flex gap-2 items-center">
                {/* Capacity Configuration Toggle */}
                <button
                  onClick={() => setShowCapacityConfig(!showCapacityConfig)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  title="Configurar Constrangimentos"
                >
                  <BarChart3 className="w-4 h-4" />
                  {showCapacityConfig ? "Ocultar Config" : "Configurar"}
                </button>

                <button
                  onClick={handleOptimize}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                  disabled={!resources}
                >
                  <BarChart3 className="w-4 h-4" />
                  🎯 Otimizar Capacidade
                </button>
                <button
                  onClick={handleExportXML}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Exportar MS Project (.xml)
                </button>
                <button
                  onClick={handleExportBudget}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
                  disabled={!resources}
                >
                  <FileText className="w-4 h-4" />
                  Exportar Orçamento (.xlsx)
                </button>
              </div>
            </div>

            {/* Capacity Configuration Panel */}
            {showCapacityConfig && (
              <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h4 className="font-medium text-purple-900 mb-3">⚙️ Configuração de Capacidade do Estaleiro</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Máx. Trabalhadores por Piso
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="50"
                      value={maxWorkersPerFloor}
                      onChange={(e) => setMaxWorkersPerFloor(parseInt(e.target.value) || 20)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Padrão: 20 (conforme área disponível e segurança)
                    </p>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Regras de Sobreposição
                    </label>
                    <div className="bg-white p-3 rounded border border-gray-200 max-h-24 overflow-y-auto">
                      <p className="text-xs text-gray-600">
                        ✓ 18 regras portuguesas ativas (estuque→pintura: 3 dias, impermeabilização→revestimento: 2 dias, etc.)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-accent-light rounded-lg p-4 text-center border border-accent">
                <Calendar className="w-5 h-5 text-accent mx-auto mb-1" />
                <p className="text-xs text-accent">Duração Total</p>
                <p className="text-lg font-bold text-accent">{schedule.totalDurationDays} dias</p>
                <p className="text-xs text-accent">~{Math.ceil(schedule.totalDurationDays / 22)} meses</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center border border-amber-200">
                <Euro className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-xs text-amber-600">Custo Total</p>
                <p className="text-lg font-bold text-amber-800">{formatCost(schedule.totalCost)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center border border-purple-200">
                <Users className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                <p className="text-xs text-purple-600">Equipa Média</p>
                <p className="text-lg font-bold text-purple-800">{schedule.teamSummary.averageWorkers}</p>
                <p className="text-xs text-purple-500">máx. {schedule.teamSummary.maxWorkers}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center border border-green-200">
                <Clock className="w-5 h-5 text-green-500 mx-auto mb-1" />
                <p className="text-xs text-green-600">Homens-Hora</p>
                <p className="text-lg font-bold text-green-800">{schedule.teamSummary.totalManHours.toLocaleString("pt-PT")}</p>
              </div>
            </div>

            {/* Timeline header */}
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
              <span>Início: <strong>{schedule.startDate}</strong></span>
              <span>Conclusão: <strong>{schedule.finishDate}</strong></span>
            </div>
          </div>

          {/* Optimization Results */}
          {optimizedSchedule && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                🎯 Análise de Capacidade do Estaleiro
              </h4>

              {/* Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className={`rounded-lg p-4 text-center border ${
                  optimizedSchedule.bottlenecks.length === 0 ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"
                }`}>
                  <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${
                    optimizedSchedule.bottlenecks.length === 0 ? "text-green-500" : "text-orange-500"
                  }`} />
                  <p className={`text-xs ${
                    optimizedSchedule.bottlenecks.length === 0 ? "text-green-600" : "text-orange-600"
                  }`}>Constrangimentos</p>
                  <p className={`text-lg font-bold ${
                    optimizedSchedule.bottlenecks.length === 0 ? "text-green-800" : "text-orange-800"
                  }`}>{optimizedSchedule.bottlenecks.length}</p>
                </div>

                <div className="bg-accent-light rounded-lg p-4 text-center border border-accent">
                  <BarChart3 className="w-5 h-5 text-accent mx-auto mb-1" />
                  <p className="text-xs text-accent">Utilização Média</p>
                  <p className="text-lg font-bold text-accent">
                    {(optimizedSchedule.capacityTimeline.reduce((sum, p) => sum + p.utilizationPercent, 0) / optimizedSchedule.capacityTimeline.length).toFixed(0)}%
                  </p>
                </div>

                <div className="bg-purple-50 rounded-lg p-4 text-center border border-purple-200">
                  <Calendar className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                  <p className="text-xs text-purple-600">Duração Original</p>
                  <p className="text-lg font-bold text-purple-800">{Math.ceil(optimizedSchedule.originalDuration)} dias</p>
                </div>

                <div className={`rounded-lg p-4 text-center border ${
                  optimizedSchedule.efficiencyGain >= 0 ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                }`}>
                  <CheckCircle className={`w-5 h-5 mx-auto mb-1 ${
                    optimizedSchedule.efficiencyGain >= 0 ? "text-green-500" : "text-gray-500"
                  }`} />
                  <p className={`text-xs ${
                    optimizedSchedule.efficiencyGain >= 0 ? "text-green-600" : "text-gray-600"
                  }`}>Ganho de Eficiência</p>
                  <p className={`text-lg font-bold ${
                    optimizedSchedule.efficiencyGain >= 0 ? "text-green-800" : "text-gray-800"
                  }`}>{optimizedSchedule.efficiencyGain.toFixed(1)}%</p>
                </div>
              </div>

              {/* Capacity Timeline (simplified bar chart) */}
              <div className="mb-6">
                <h5 className="text-sm font-medium text-gray-700 mb-3">Timeline de Capacidade</h5>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {optimizedSchedule.capacityTimeline.slice(0, 30).map((point, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 w-20">{point.date.toLocaleDateString('pt-PT', { month: 'short', day: 'numeric' })}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden relative">
                        <div
                          className={`h-full ${
                            point.isBottleneck ? "bg-red-500" : point.utilizationPercent > 80 ? "bg-orange-400" : "bg-green-400"
                          }`}
                          style={{ width: `${Math.min(100, point.utilizationPercent)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-gray-700 font-medium">
                          {point.workersAllocated}/{point.workersCapacity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {optimizedSchedule.capacityTimeline.length > 30 && (
                  <p className="text-xs text-gray-500 mt-2">Mostrando primeiros 30 dias de {optimizedSchedule.capacityTimeline.length}</p>
                )}
              </div>

              {/* Bottlenecks */}
              {optimizedSchedule.bottlenecks.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    Constrangimentos Detetados
                  </h5>
                  <div className="space-y-2">
                    {optimizedSchedule.bottlenecks.slice(0, 5).map((bottleneck, i) => (
                      <div key={i} className={`p-3 rounded-lg border ${
                        bottleneck.severity === "high" ? "bg-red-50 border-red-200" :
                        bottleneck.severity === "medium" ? "bg-orange-50 border-orange-200" :
                        "bg-yellow-50 border-yellow-200"
                      }`}>
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                            bottleneck.severity === "high" ? "text-red-600" :
                            bottleneck.severity === "medium" ? "text-orange-600" :
                            "text-yellow-600"
                          }`} />
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${
                              bottleneck.severity === "high" ? "text-red-800" :
                              bottleneck.severity === "medium" ? "text-orange-800" :
                              "text-yellow-800"
                            }`}>{bottleneck.reason}</p>
                            <p className="text-xs text-gray-600 mt-1">
                              {bottleneck.date.toLocaleDateString('pt-PT')} • Fases: {bottleneck.phases.join(", ")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {optimizedSchedule.suggestions.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    💡 Sugestões de Otimização
                  </h5>
                  <div className="space-y-3">
                    {optimizedSchedule.suggestions.map((suggestion, i) => (
                      <div key={i} className="p-4 bg-accent-light border border-accent rounded-lg">
                        <h6 className="font-medium text-accent mb-1">{suggestion.title}</h6>
                        <p className="text-sm text-accent mb-2">{suggestion.description}</p>
                        <p className="text-xs text-accent">
                          Impacto estimado: <strong>{suggestion.estimatedImpact}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Gantt-like phase view */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Sequência de Obra
              </h4>
            </div>
            <div className="divide-y divide-gray-100">
              {schedule.tasks.filter(t => t.isSummary).map(task => {
                const isCritical = schedule.criticalPath.includes(task.uid);
                const isExpanded = expandedPhase === task.phase;
                const childTasks = schedule.tasks.filter(t => !t.isSummary && t.phase === task.phase);

                // Calculate bar position (proportional)
                const projectStart = new Date(schedule.startDate).getTime();
                const projectEnd = new Date(schedule.finishDate).getTime();
                const totalSpan = projectEnd - projectStart || 1;
                const taskStart = new Date(task.startDate).getTime();
                const taskEnd = new Date(task.finishDate).getTime();
                const left = ((taskStart - projectStart) / totalSpan) * 100;
                const width = Math.max(2, ((taskEnd - taskStart) / totalSpan) * 100);

                return (
                  <div key={task.uid}>
                    <button
                      type="button"
                      onClick={() => setExpandedPhase(isExpanded ? null : task.phase)}
                      className="w-full p-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 shrink-0">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-sm">{task.name}</span>
                            {isCritical && (
                              <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Crítico</span>
                            )}
                            <span className="text-xs text-gray-400">{task.durationDays}d</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {task.startDate} → {task.finishDate}
                            {task.cost > 0 && <span className="ml-2">{formatCost(task.cost)}</span>}
                          </div>
                        </div>
                        {/* Mini Gantt bar */}
                        <div className="w-48 hidden md:block">
                          <div className="h-4 bg-gray-100 rounded-full relative">
                            <div
                              className={`h-full rounded-full ${isCritical ? "bg-red-400" : "bg-accent"}`}
                              style={{ marginLeft: `${left}%`, width: `${width}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Expanded child tasks */}
                    {isExpanded && childTasks.length > 0 && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {childTasks.map(child => (
                          <div key={child.uid} className="px-3 py-2 pl-12 border-b border-gray-100 last:border-0 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-800">{child.name}</p>
                                <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                                  <span>{child.startDate} → {child.finishDate} ({child.durationDays}d)</span>
                                  {child.notes && <span className="text-gray-400">{child.notes}</span>}
                                </div>
                                {/* Resources */}
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {child.resources.map((res, i) => (
                                    <span
                                      key={i}
                                      className={`text-xs px-1.5 py-0.5 rounded ${
                                        res.type === "labor" ? "bg-accent-medium text-accent" :
                                        res.type === "material" ? "bg-amber-100 text-amber-700" :
                                        "bg-gray-100 text-gray-600"
                                      }`}
                                    >
                                      {res.type === "labor" ? `${res.name} ×${res.units}` :
                                       res.type === "material" ? `${formatCost(res.units * res.rate)}` :
                                       res.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-medium text-gray-900">{formatCost(child.cost)}</p>
                                <p className="text-xs text-gray-500">{child.durationHours.toFixed(0)}h</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Critical Chain (Goldratt) summary */}
          {schedule.criticalChain && (
            <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                Critical Chain (Goldratt CCPM)
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Original</p>
                  <p className="text-lg font-bold text-gray-400 line-through">{schedule.criticalChain.originalDurationDays}d</p>
                </div>
                <div className="bg-accent-light rounded-lg p-3 text-center">
                  <p className="text-xs text-accent">Agressivo (-{schedule.criticalChain.safetyReductionPercent}%)</p>
                  <p className="text-lg font-bold text-accent">{schedule.criticalChain.aggressiveDurationDays}d</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-600">Buffer Projeto</p>
                  <p className="text-lg font-bold text-green-800">+{schedule.criticalChain.projectBuffer.durationDays}d</p>
                </div>
                <div className="bg-indigo-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-indigo-600">CCPM Final</p>
                  <p className="text-lg font-bold text-indigo-800">{schedule.criticalChain.ccpmDurationDays}d</p>
                  <p className="text-xs text-indigo-500">~{Math.ceil(schedule.criticalChain.ccpmDurationDays / 22)} meses</p>
                </div>
              </div>

              {/* Buffer fever chart visualization */}
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-gray-700">Buffers</h5>
                <BufferBar buffer={schedule.criticalChain.projectBuffer} />
                {schedule.criticalChain.feedingBuffers.map(fb => (
                  <BufferBar key={fb.uid} buffer={fb} />
                ))}
              </div>

              <p className="text-xs text-gray-500 mt-3">
                Rácio buffer/projeto: {(schedule.criticalChain.bufferRatio * 100).toFixed(0)}%.
                A proteção individual das tarefas foi removida e concentrada nos buffers.
                Monitorize o consumo dos buffers (verde/amarelo/vermelho) durante a execução.
              </p>
            </div>
          )}

          {/* Resources summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Recursos</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {schedule.resources.filter(r => r.type === "labor").map(res => (
                <div key={res.uid} className="p-3 bg-accent-light rounded-lg border border-accent text-sm flex justify-between">
                  <div>
                    <p className="font-medium text-accent">{res.name}</p>
                    <p className="text-xs text-accent">{res.totalHours.toFixed(0)} horas | {formatCost(res.standardRate)}/h</p>
                  </div>
                  <p className="font-semibold text-accent">{formatCost(res.totalCost)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep("match")}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Voltar às Correspondências
            </button>
            <button
              onClick={handleExportXML}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Exportar MS Project (.xml)
            </button>
            <button
              onClick={handleExportBudget}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
              disabled={!resources}
            >
              <FileText className="w-4 h-4" />
              Exportar Orçamento (.xlsx)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "import", label: "Importar WBS" },
    { key: "match", label: "CYPE Match" },
    { key: "schedule", label: "Planeamento" },
  ];
  const idx = steps.findIndex(s => s.key === current);

  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            i < idx ? "bg-green-100 text-green-700" :
            i === idx ? "bg-accent text-white" :
            "bg-gray-100 text-gray-400"
          }`}>
            {i < idx ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          <span className={i === idx ? "text-gray-900 font-medium" : "text-gray-400"}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-gray-300">→</span>}
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    gray: "bg-gray-50 text-gray-800",
    green: "bg-green-50 text-green-800",
    emerald: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-lg p-3 text-center ${colors[color] ?? "bg-gray-50"}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 70 ? "bg-green-100 text-green-700" :
    confidence >= 40 ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>
      {confidence}%
    </span>
  );
}

function BufferBar({ buffer }: { buffer: CriticalChainBuffer }) {
  const zoneColors = {
    green: { bg: "bg-green-400", text: "text-green-700", label: "bg-green-100" },
    yellow: { bg: "bg-amber-400", text: "text-amber-700", label: "bg-amber-100" },
    red: { bg: "bg-red-400", text: "text-red-700", label: "bg-red-100" },
  };
  const c = zoneColors[buffer.zone];

  return (
    <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-1.5 py-0.5 rounded ${c.label} ${c.text}`}>
            {buffer.type === "project" ? "Projeto" : "Feeding"}
          </span>
          <span className="text-xs text-gray-700 truncate">{buffer.name}</span>
          <span className="text-xs text-gray-400">{buffer.durationDays}d</span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          {/* Three-zone background */}
          <div className="h-full flex">
            <div className="w-1/3 bg-green-200" />
            <div className="w-1/3 bg-amber-200" />
            <div className="w-1/3 bg-red-200" />
          </div>
        </div>
        <div className="h-2.5 -mt-2.5 rounded-full overflow-hidden">
          <div
            className={`h-full ${c.bg} rounded-full transition-all`}
            style={{ width: `${Math.max(2, buffer.consumedPercent)}%` }}
          />
        </div>
      </div>
      <span className={`text-xs font-bold ${c.text}`}>
        {buffer.consumedPercent.toFixed(0)}%
      </span>
    </div>
  );
}

function ExtrapolationPanel({ result }: { result: ExtrapolationResult }) {
  const confColors: Record<string, string> = {
    high: "bg-green-100 text-green-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-orange-100 text-orange-700",
    very_low: "bg-red-100 text-red-700",
  };
  const confLabels: Record<string, string> = {
    high: "Alta", medium: "Média", low: "Baixa", very_low: "Muito Baixa",
  };
  const stageLabels: Record<string, string> = {
    pip: "Informação Prévia", architecture: "Projeto Arquitetura",
    specialties: "Especialidades", execution: "Execução", construction: "Obra",
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">Fase: {stageLabels[result.stage]}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${confColors[result.overallConfidence]}`}>
            Confiança {confLabels[result.overallConfidence]}
          </span>
          <span className="text-xs text-gray-500">Completude: {result.completenessScore}%</span>
        </div>
      </div>

      {/* Cost summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <p className="text-xs text-gray-500">Mínimo</p>
          <p className="text-lg font-bold text-gray-700">{formatCost(result.totalMinCost)}</p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center border border-indigo-300">
          <p className="text-xs text-indigo-600">Melhor Estimativa</p>
          <p className="text-lg font-bold text-indigo-800">{formatCost(result.bestEstimate)}</p>
          <p className="text-xs text-indigo-500">{formatCost(result.costPerM2.benchmark)}/m²</p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <p className="text-xs text-gray-500">Máximo</p>
          <p className="text-lg font-bold text-gray-700">{formatCost(result.totalMaxCost)}</p>
        </div>
      </div>

      {/* Duration & team */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Duração Estimada</p>
          <p className="text-sm font-bold text-gray-800">
            {result.estimatedDurationDays.min}-{result.estimatedDurationDays.max} dias
          </p>
          <p className="text-xs text-gray-500">
            ~{Math.ceil(result.estimatedDurationDays.best / 22)} meses (ótimo)
          </p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Equipa Estimada</p>
          <p className="text-sm font-bold text-gray-800">
            {result.estimatedTeamSize.min}-{result.estimatedTeamSize.max} trabalhadores
          </p>
          <p className="text-xs text-gray-500">
            Ótimo: {result.estimatedTeamSize.optimal}
          </p>
        </div>
      </div>

      {/* Per-specialty breakdown */}
      <div>
        <h5 className="text-sm font-medium text-gray-700 mb-2">Decomposição por Especialidade</h5>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {result.specialties
            .filter(s => s.maxCost > 0)
            .sort((a, b) => b.maxCost - a.maxCost)
            .map(s => (
            <div key={s.name} className="flex items-center gap-2 p-2 bg-white rounded border border-gray-100 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-800">{s.name}</span>
                  <span className={`text-xs px-1 py-0 rounded ${confColors[s.confidence]}`}>
                    {confLabels[s.confidence]}
                  </span>
                  {s.method === "known" && (
                    <span className="text-xs px-1 py-0 bg-green-50 text-green-600 rounded">Dados reais</span>
                  )}
                </div>
                {s.dataNeeded.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    Necessário: {s.dataNeeded.join(", ")}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium text-gray-800">
                  {formatCost(s.minCost)} - {formatCost(s.maxCost)}
                </p>
                <p className="text-xs text-gray-400">{s.percentOfTotal}% do total</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-1">
          {result.warnings.map((w, i) => (
            <div key={i} className="text-xs p-2 bg-amber-50 text-amber-800 rounded border border-amber-200">
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-xs font-medium text-gray-600">Para melhorar a precisão:</h5>
          {result.recommendations.map((r, i) => (
            <div key={i} className="text-xs p-2 bg-accent-light text-accent rounded border border-accent">
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// CSV parser extracted to @/lib/wbs-parser.ts for reusability

// ============================================================
// WBS + IFC Merge
// ============================================================

function mergeIfcIntoWbs(project: WbsProject, analyses: SpecialtyAnalysisResult[]): WbsProject {
  const merged = { ...project, chapters: [...project.chapters] };

  for (const analysis of analyses) {
    for (const ifcChapter of analysis.chapters) {
      const existing = merged.chapters.find(ch => ch.code === ifcChapter.code);
      if (existing) {
        // Merge sub-chapters - add IFC-derived ones alongside manual ones
        for (const ifcSub of ifcChapter.subChapters) {
          const existingSub = existing.subChapters.find(s => s.code === ifcSub.code);
          if (existingSub) {
            // Update quantities from IFC where articles match
            for (const ifcArt of ifcSub.articles) {
              const existingArt = existingSub.articles.find(a =>
                a.description.toLowerCase().includes(ifcArt.description.split("(")[0].trim().toLowerCase().slice(0, 20))
              );
              if (existingArt && ifcArt.quantity > 0) {
                existingArt.quantity = ifcArt.quantity;
                existingArt.elementIds = ifcArt.elementIds;
              } else {
                existingSub.articles.push(ifcArt);
              }
            }
          } else {
            existing.subChapters.push(ifcSub);
          }
        }
      } else {
        merged.chapters.push(ifcChapter);
      }
    }
  }

  // Sort chapters by code
  merged.chapters.sort((a, b) => a.code.localeCompare(b.code));
  return merged;
}

// ============================================================
// Demo WBS Project (Moradia T3 Unifamiliar)
// ============================================================

const DEMO_WBS: WbsProject = {
  id: "demo-moradia-t3",
  name: "Moradia T3 Unifamiliar - Cascais",
  classification: "ProNIC",
  startDate: new Date().toISOString().split("T")[0],
  district: "Lisboa",
  buildingType: "residential",
  grossFloorArea: 200,
  usableFloorArea: 160,
  numberOfFloors: 2,
  numberOfDwellings: 1,
  buildingHeight: 7,
  isRehabilitation: false,
  chapters: [
    {
      code: "01", name: "Estaleiro e trabalhos preparatórios",
      subChapters: [{
        code: "01.01", name: "Estaleiro",
        articles: [
          { code: "01.01.001", description: "Montagem e desmontagem de estaleiro de obra", unit: "Ud", quantity: 1, keynote: "01" },
          { code: "01.01.002", description: "Vedação perimetral de obra em chapa metálica h=2m", unit: "m", quantity: 80, keynote: "01" },
        ],
      }],
    },
    {
      code: "03", name: "Movimento de terras",
      subChapters: [{
        code: "03.01", name: "Escavação",
        articles: [
          { code: "03.01.001", description: "Escavação geral a céu aberto em terreno tipo II", unit: "m3", quantity: 180, keynote: "A10" },
          { code: "03.01.002", description: "Escavação de valas para sapatas de fundação", unit: "m3", quantity: 45, keynote: "A10" },
          { code: "03.01.003", description: "Aterro e compactação com materiais selecionados", unit: "m3", quantity: 60, keynote: "A10" },
        ],
      }],
    },
    {
      code: "04", name: "Fundações",
      subChapters: [{
        code: "04.01", name: "Sapatas",
        articles: [
          { code: "04.01.001", description: "Sapata isolada de betão armado C25/30", unit: "m3", quantity: 12, keynote: "A20" },
          { code: "04.01.002", description: "Sapata contínua de betão armado C25/30", unit: "m3", quantity: 18, keynote: "A20" },
        ],
      }],
    },
    {
      code: "06", name: "Estruturas de betão armado",
      subChapters: [
        {
          code: "06.01", name: "Pilares e vigas",
          articles: [
            { code: "06.01.001", description: "Pilar de betão armado C25/30 secção 30x30cm", unit: "m3", quantity: 8, keynote: "B10" },
            { code: "06.01.002", description: "Viga de betão armado C25/30", unit: "m3", quantity: 14, keynote: "B10" },
          ],
        },
        {
          code: "06.02", name: "Lajes",
          articles: [
            { code: "06.02.001", description: "Laje maciça de betão armado C25/30 e=20cm", unit: "m2", quantity: 200, keynote: "B10" },
            { code: "06.02.002", description: "Escada de betão armado C25/30 (2 lanços)", unit: "m2", quantity: 12, keynote: "B10" },
          ],
        },
      ],
    },
    {
      code: "08", name: "Alvenarias",
      subChapters: [
        {
          code: "08.01", name: "Alvenarias exteriores",
          articles: [
            { code: "08.01.001", description: "Alvenaria de tijolo cerâmico furado e=15cm (paredes exteriores)", unit: "m2", quantity: 180, keynote: "B20" },
          ],
        },
        {
          code: "08.02", name: "Alvenarias interiores",
          articles: [
            { code: "08.02.001", description: "Alvenaria de tijolo cerâmico furado e=11cm (divisórias)", unit: "m2", quantity: 120, keynote: "C10" },
          ],
        },
      ],
    },
    {
      code: "09", name: "Coberturas",
      subChapters: [{
        code: "09.01", name: "Cobertura inclinada",
        articles: [
          { code: "09.01.001", description: "Cobertura em telha cerâmica Marselha sobre ripado", unit: "m2", quantity: 110, keynote: "B30" },
        ],
      }],
    },
    {
      code: "10", name: "Impermeabilizações",
      subChapters: [{
        code: "10.01", name: "Coberturas e fundações",
        articles: [
          { code: "10.01.001", description: "Impermeabilização de cobertura com tela asfáltica", unit: "m2", quantity: 110, keynote: "10" },
          { code: "10.01.002", description: "Impermeabilização de fundações com emulsão betuminosa", unit: "m2", quantity: 65, keynote: "10" },
        ],
      }],
    },
    {
      code: "11", name: "Revestimentos exteriores",
      subChapters: [{
        code: "11.01", name: "Reboco e ETICS",
        articles: [
          { code: "11.01.001", description: "Sistema ETICS (capoto) com EPS 60mm em fachadas", unit: "m2", quantity: 180, keynote: "28" },
          { code: "11.01.002", description: "Reboco projetado armado com rede fibra de vidro", unit: "m2", quantity: 40, keynote: "11" },
        ],
      }],
    },
    {
      code: "12", name: "Revestimentos interiores",
      subChapters: [{
        code: "12.01", name: "Estuque e cerâmico",
        articles: [
          { code: "12.01.001", description: "Estuque projetado em paredes interiores", unit: "m2", quantity: 350, keynote: "12" },
          { code: "12.01.002", description: "Revestimento cerâmico em paredes WC e cozinha", unit: "m2", quantity: 60, keynote: "12" },
        ],
      }],
    },
    {
      code: "13", name: "Pavimentos",
      subChapters: [{
        code: "13.01", name: "Pavimentos interiores",
        articles: [
          { code: "13.01.001", description: "Betonilha de regularização e=5cm", unit: "m2", quantity: 160, keynote: "13" },
          { code: "13.01.002", description: "Pavimento cerâmico em WC e cozinha", unit: "m2", quantity: 40, keynote: "C30" },
          { code: "13.01.003", description: "Pavimento flutuante em madeira (quartos e salas)", unit: "m2", quantity: 110, keynote: "C30" },
        ],
      }],
    },
    {
      code: "14", name: "Tetos",
      subChapters: [{
        code: "14.01", name: "Tetos falsos",
        articles: [
          { code: "14.01.001", description: "Teto falso em gesso cartonado (WC e cozinha)", unit: "m2", quantity: 35, keynote: "14" },
        ],
      }],
    },
    {
      code: "15", name: "Caixilharias e portas exteriores",
      subChapters: [{
        code: "15.01", name: "Caixilharias alumínio",
        articles: [
          { code: "15.01.001", description: "Caixilharia de alumínio com RPT e vidro duplo", unit: "m2", quantity: 28, keynote: "B20" },
          { code: "15.01.002", description: "Porta exterior em madeira maciça com ferragens", unit: "Ud", quantity: 1, keynote: "B20" },
        ],
      }],
    },
    {
      code: "16", name: "Serralharias",
      subChapters: [{
        code: "16.01", name: "Guardas",
        articles: [
          { code: "16.01.001", description: "Guarda metálica de escada e varanda h=1.10m", unit: "m", quantity: 18, keynote: "16" },
        ],
      }],
    },
    {
      code: "17", name: "Carpintarias",
      subChapters: [{
        code: "17.01", name: "Portas interiores e armários",
        articles: [
          { code: "17.01.001", description: "Porta interior de madeira com aro e ferragens", unit: "Ud", quantity: 10, keynote: "C20" },
          { code: "17.01.002", description: "Armário roupeiro embutido (módulo 1.20m)", unit: "Ud", quantity: 4, keynote: "C20" },
        ],
      }],
    },
    {
      code: "19", name: "Pinturas e envernizamentos",
      subChapters: [{
        code: "19.01", name: "Pinturas",
        articles: [
          { code: "19.01.001", description: "Pintura de paredes interiores (tinta plástica, 2 demãos)", unit: "m2", quantity: 450, keynote: "19" },
          { code: "19.01.002", description: "Pintura de tetos interiores (tinta plástica, 2 demãos)", unit: "m2", quantity: 160, keynote: "19" },
          { code: "19.01.003", description: "Pintura de fachada (tinta acrílica, 2 demãos)", unit: "m2", quantity: 40, keynote: "19" },
        ],
      }],
    },
    {
      code: "20", name: "Instalações de abastecimento de água",
      subChapters: [{
        code: "20.01", name: "Rede de água e loiças",
        articles: [
          { code: "20.01.001", description: "Rede de abastecimento de água fria em PPR", unit: "Ud", quantity: 1, keynote: "D10" },
          { code: "20.01.002", description: "Base de duche com resguardo e misturadora", unit: "Ud", quantity: 2, keynote: "D10" },
          { code: "20.01.003", description: "Sanita suspensa com autoclismo e tampo", unit: "Ud", quantity: 3, keynote: "D10" },
          { code: "20.01.004", description: "Lavatório de pousar com torneira e sifão", unit: "Ud", quantity: 3, keynote: "D10" },
          { code: "20.01.005", description: "Bancada de cozinha com lava-loiça inox (2.40m)", unit: "Ud", quantity: 1, keynote: "D10" },
        ],
      }],
    },
    {
      code: "23", name: "Instalações elétricas",
      subChapters: [{
        code: "23.01", name: "Instalação elétrica",
        articles: [
          { code: "23.01.001", description: "Rede de distribuição elétrica interior (T3)", unit: "Ud", quantity: 1, keynote: "D20" },
          { code: "23.01.002", description: "Quadro elétrico de habitação (18 módulos)", unit: "Ud", quantity: 1, keynote: "D20" },
          { code: "23.01.003", description: "Ponto de carregamento de veículo elétrico (wallbox 7.4 kW)", unit: "Ud", quantity: 1, keynote: "D20" },
        ],
      }],
    },
    {
      code: "24", name: "ITED / ITUR",
      subChapters: [{
        code: "24.01", name: "Telecomunicações",
        articles: [
          { code: "24.01.001", description: "Armário de Telecomunicações Individual (ATI)", unit: "Ud", quantity: 1, keynote: "24" },
        ],
      }],
    },
    {
      code: "25", name: "AVAC e ventilação",
      subChapters: [{
        code: "25.01", name: "Ventilação mecânica",
        articles: [
          { code: "25.01.001", description: "Unidade de ventilação mecânica com recuperação de calor (VMC)", unit: "Ud", quantity: 1, keynote: "25" },
        ],
      }],
    },
    {
      code: "27", name: "Segurança contra incêndio",
      subChapters: [{
        code: "27.01", name: "SCIE",
        articles: [
          { code: "27.01.001", description: "Detetor ótico de fumos analógico", unit: "Ud", quantity: 6, keynote: "D50" },
          { code: "27.01.002", description: "Extintor portátil ABC 6 kg", unit: "Ud", quantity: 2, keynote: "D50" },
          { code: "27.01.003", description: "Bloco autónomo de iluminação de emergência", unit: "Ud", quantity: 8, keynote: "D50" },
        ],
      }],
    },
    {
      code: "28", name: "Isolamentos térmicos e acústicos",
      subChapters: [{
        code: "28.01", name: "Isolamentos",
        articles: [
          { code: "28.01.001", description: "Isolamento térmico de cobertura com XPS 60mm", unit: "m2", quantity: 110, keynote: "28" },
          { code: "28.01.002", description: "Isolamento acústico de parede entre compartimentos", unit: "m2", quantity: 45, keynote: "28" },
        ],
      }],
    },
    {
      code: "29", name: "Arranjos exteriores",
      subChapters: [{
        code: "29.01", name: "Pavimentos e vedações",
        articles: [
          { code: "29.01.001", description: "Pavimento exterior em betão (caminhos pedonais)", unit: "m2", quantity: 30, keynote: "29" },
          { code: "29.01.002", description: "Murete de vedação exterior (bloco + reboco + pintura)", unit: "m", quantity: 40, keynote: "29" },
        ],
      }],
    },
    {
      code: "30", name: "Ensaios e certificações",
      subChapters: [{
        code: "30.01", name: "Ensaios e gestão de resíduos",
        articles: [
          { code: "30.01.001", description: "Ensaio acústico in situ (RRAE)", unit: "ensaio", quantity: 1, keynote: "30" },
          { code: "30.01.002", description: "Plano de Prevenção e Gestão de RCD", unit: "projeto", quantity: 1, keynote: "30" },
        ],
      }],
    },
  ],
};

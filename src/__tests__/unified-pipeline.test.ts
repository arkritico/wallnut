import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the unified pipeline at the integration level using vi.mock
// to control each downstream module.

// ─── Mock modules ─────────────────────────────────────────────

const mockAnalyzeIfcSpecialty = vi.fn();
const mockSpecialtyToFields = vi.fn();
const mockParseExcelWbs = vi.fn();
const mockParseCsvWbs = vi.fn();
const mockSplitAndExtract = vi.fn();
const mockParseDocumentWithAI = vi.fn();
const mockMergeExtractedData = vi.fn();
const mockOcrPdfPages = vi.fn();
const mockAnalyzeProject = vi.fn();
const mockMatchWbsToCype = vi.fn();
const mockInferMaxWorkers = vi.fn();
const mockGenerateSchedule = vi.fn();
const mockAggregateResources = vi.fn();
const mockGenerateBudgetExcel = vi.fn();
const mockGenerateMSProjectXML = vi.fn();
const mockGenerateComplianceExcel = vi.fn();
const mockGenerateBoqFromIfc = vi.fn();

vi.mock("@/lib/defaults", () => ({
  DEFAULT_PROJECT: {
    name: "",
    buildingType: "residential",
    location: { municipality: "Lisboa", district: "Lisboa" },
    isRehabilitation: false,
    grossFloorArea: 150,
    usableFloorArea: 120,
    numberOfFloors: 2,
    buildingHeight: 6,
    architecture: {},
    structural: {},
    fireSafety: {},
    avac: {},
    waterDrainage: {},
    gas: {},
    electrical: {},
    telecommunications: {},
    envelope: {},
    systems: {},
    acoustic: {},
    accessibility: {},
    elevators: {},
    licensing: {},
    localRegulations: {},
    drawings: {},
  },
}));

vi.mock("@/lib/ifc-specialty-analyzer", () => ({
  analyzeIfcSpecialty: (...args: unknown[]) => mockAnalyzeIfcSpecialty(...args),
}));

vi.mock("@/lib/ifc-enrichment", () => ({
  specialtyAnalysisToProjectFields: (...args: unknown[]) => mockSpecialtyToFields(...args),
}));

vi.mock("@/lib/wbs-parser", () => ({
  parseExcelWbs: (...args: unknown[]) => mockParseExcelWbs(...args),
  parseCsvWbs: (...args: unknown[]) => mockParseCsvWbs(...args),
}));

vi.mock("@/lib/pdf-splitter", () => ({
  splitAndExtract: (...args: unknown[]) => mockSplitAndExtract(...args),
}));

vi.mock("@/lib/document-parser", () => ({
  parseDocumentWithAI: (...args: unknown[]) => mockParseDocumentWithAI(...args),
  mergeExtractedData: (...args: unknown[]) => mockMergeExtractedData(...args),
}));

vi.mock("@/lib/analyzer", () => ({
  analyzeProject: (...args: unknown[]) => mockAnalyzeProject(...args),
}));

vi.mock("@/lib/cype-matcher", () => ({
  matchWbsToCype: (...args: unknown[]) => mockMatchWbsToCype(...args),
}));

vi.mock("@/lib/labor-constraints", () => ({
  inferMaxWorkers: (...args: unknown[]) => mockInferMaxWorkers(...args),
}));

vi.mock("@/lib/construction-sequencer", () => ({
  generateSchedule: (...args: unknown[]) => mockGenerateSchedule(...args),
}));

vi.mock("@/lib/resource-aggregator", () => ({
  aggregateProjectResources: (...args: unknown[]) => mockAggregateResources(...args),
}));

vi.mock("@/lib/budget-export", () => ({
  generateBudgetExcel: (...args: unknown[]) => mockGenerateBudgetExcel(...args),
}));

vi.mock("@/lib/msproject-export", () => ({
  generateMSProjectXML: (...args: unknown[]) => mockGenerateMSProjectXML(...args),
}));

vi.mock("@/lib/compliance-export", () => ({
  generateComplianceExcel: (...args: unknown[]) => mockGenerateComplianceExcel(...args),
}));

vi.mock("@/lib/keynote-resolver", () => ({
  generateBoqFromIfc: (...args: unknown[]) => mockGenerateBoqFromIfc(...args),
}));

vi.mock("@/lib/server-ocr", () => ({
  ocrPdfPages: (...args: unknown[]) => mockOcrPdfPages(...args),
}));

const mockMapElementsToTasks = vi.fn();
vi.mock("@/lib/element-task-mapper", () => ({
  mapElementsToTasks: (...args: unknown[]) => mockMapElementsToTasks(...args),
}));

import { runUnifiedPipeline, type UnifiedPipelineInput } from "@/lib/unified-pipeline";

// ─── Helpers ──────────────────────────────────────────────────

function makeFile(name: string, content: string = "test"): File {
  return new File([content], name, { type: "application/octet-stream" });
}

function setupFullMocks() {
  const ifcResult = {
    specialty: "structure",
    quantities: [{ entityType: "IFCCOLUMN", name: "Col", globalId: "g1", properties: {}, propertySetData: {}, quantities: { length: 3 }, materials: [] }],
    chapters: [],
    optimizations: [],
    summary: { totalElements: 1, elementsByType: {}, storeys: [], materialsUsed: [] },
  };

  const wbsProject = {
    id: "test",
    name: "Test",
    classification: "ProNIC" as const,
    startDate: "2026-01-01",
    chapters: [{ code: "06", name: "Estruturas", subChapters: [{ code: "06.01", name: "Pilares", articles: [{ code: "06.01.001", description: "Pilar", unit: "m", quantity: 10 }] }] }],
  };

  const matchReport = {
    matches: [{ articleCode: "06.01.001", cypeCode: "EHS010", confidence: 80, unitCost: 673, estimatedCost: 6730, matchMethod: "keynote", articleDescription: "", cypeDescription: "", cypeChapter: "", breakdown: { materials: 0, labor: 0, machinery: 0 }, cypeUnit: "m", unitConversion: 1, warnings: [] }],
    unmatched: [],
    stats: { totalArticles: 1, matched: 1, highConfidence: 1, mediumConfidence: 0, lowConfidence: 0, unmatched: 0, coveragePercent: 100, totalEstimatedCost: 6730 },
  };

  const schedule = {
    startDate: "2026-01-01",
    finishDate: "2026-06-01",
    totalDurationDays: 150,
    tasks: [],
    resources: [],
    criticalPath: [],
    buffers: [],
  };

  const resources = {
    materials: [],
    labor: [],
    equipment: [],
    totalMaterialCost: 0,
    totalLaborCost: 0,
    totalLaborHours: 0,
    totalEquipmentCost: 0,
    grandTotal: 6730,
  };

  const analysisResult = {
    projectName: "Test",
    overallScore: 75,
    energyClass: "B" as const,
    findings: [],
    recommendations: [],
    regulationSummary: [],
  };

  mockAnalyzeIfcSpecialty.mockReturnValue(ifcResult);
  mockSpecialtyToFields.mockReturnValue({ fields: { "structural.columnCount": 1 }, report: { populatedFields: [], specialtiesDetected: [], elementCounts: {}, totalElements: 0, storeys: [], materials: [] } });
  mockParseExcelWbs.mockResolvedValue(wbsProject);
  mockParseCsvWbs.mockReturnValue(wbsProject);
  mockGenerateBoqFromIfc.mockReturnValue({ project: wbsProject, resolutions: [], stats: { totalElements: 1, resolved: 1, unresolved: 0, coveragePercent: 100 } });
  mockAnalyzeProject.mockResolvedValue(analysisResult);
  mockMatchWbsToCype.mockReturnValue(matchReport);
  mockInferMaxWorkers.mockReturnValue({ maxWorkers: 6, budgetRange: "< 500K €", rationale: "test" });
  mockGenerateSchedule.mockReturnValue(schedule);
  mockAggregateResources.mockReturnValue(resources);
  mockGenerateBudgetExcel.mockReturnValue(Buffer.from("excel-data"));
  mockGenerateMSProjectXML.mockReturnValue("<Project/>");
  mockOcrPdfPages.mockResolvedValue([]);
  mockGenerateComplianceExcel.mockReturnValue(new ArrayBuffer(10));
  mockMapElementsToTasks.mockReturnValue({
    links: [],
    unmapped: [],
    stats: { totalElements: 0, mapped: 0, unmapped: 0, coveragePercent: 0, byMethod: {}, byPhase: {} },
  });

  return { ifcResult, wbsProject, matchReport, schedule, resources, analysisResult };
}

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runUnifiedPipeline", () => {
  it("classifies files by extension", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [
        makeFile("model.ifc"),
        makeFile("budget.xlsx"),
        makeFile("spec.pdf"),
        makeFile("readme.txt"),
      ],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    // IFC was parsed
    expect(mockAnalyzeIfcSpecialty).toHaveBeenCalledTimes(1);
    // BOQ was parsed (xlsx)
    expect(mockParseExcelWbs).toHaveBeenCalledTimes(1);
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("IFC-only path: generates BOQ from IFC when no spreadsheet", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("model.ifc")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    expect(mockAnalyzeIfcSpecialty).toHaveBeenCalledTimes(1);
    expect(mockGenerateBoqFromIfc).toHaveBeenCalledTimes(1);
    expect(mockParseExcelWbs).not.toHaveBeenCalled();
    expect(result.generatedBoq).toBeDefined();
    expect(result.wbsProject).toBeDefined();
  });

  it("BOQ-only path: skips IFC, parses Excel", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    expect(mockAnalyzeIfcSpecialty).not.toHaveBeenCalled();
    expect(mockGenerateBoqFromIfc).not.toHaveBeenCalled();
    expect(mockParseExcelWbs).toHaveBeenCalledTimes(1);
    expect(result.wbsProject).toBeDefined();
  });

  it("BOQ-only with CSV: calls parseCsvWbs", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("items.csv")],
      options: {},
    };

    await runUnifiedPipeline(input);

    expect(mockParseCsvWbs).toHaveBeenCalledTimes(1);
    expect(mockParseExcelWbs).not.toHaveBeenCalled();
  });

  it("IFC + BOQ: uses uploaded BOQ, skips auto-generation", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("model.ifc"), makeFile("budget.xlsx")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    expect(mockAnalyzeIfcSpecialty).toHaveBeenCalledTimes(1);
    expect(mockParseExcelWbs).toHaveBeenCalledTimes(1);
    expect(mockGenerateBoqFromIfc).not.toHaveBeenCalled();
    expect(result.generatedBoq).toBeUndefined();
  });

  it("runs cost estimation and schedule when WBS available", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    expect(mockMatchWbsToCype).toHaveBeenCalledTimes(1);
    expect(mockInferMaxWorkers).toHaveBeenCalledTimes(1);
    expect(mockGenerateSchedule).toHaveBeenCalledTimes(1);
    expect(mockAggregateResources).toHaveBeenCalledTimes(1);
    expect(result.matchReport).toBeDefined();
    expect(result.schedule).toBeDefined();
    expect(result.laborConstraint).toBeDefined();
    expect(result.resources).toBeDefined();
  });

  it("generates all three export outputs", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    expect(result.budgetExcel).toBeDefined();
    expect(result.msProjectXml).toBeDefined();
    expect(result.complianceExcel).toBeDefined();
  });

  it("respects includeCosts: false — skips estimation", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: { includeCosts: false },
    };

    const result = await runUnifiedPipeline(input);

    expect(mockMatchWbsToCype).not.toHaveBeenCalled();
    expect(result.matchReport).toBeUndefined();
    // No schedule either (needs matchReport)
    expect(result.schedule).toBeUndefined();
  });

  it("respects includeSchedule: false — skips schedule", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: { includeSchedule: false },
    };

    const result = await runUnifiedPipeline(input);

    // Cost still runs
    expect(mockMatchWbsToCype).toHaveBeenCalledTimes(1);
    expect(mockGenerateSchedule).not.toHaveBeenCalled();
    expect(result.schedule).toBeUndefined();
  });

  it("respects includeCompliance: false — skips analysis", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: { includeCompliance: false },
    };

    const result = await runUnifiedPipeline(input);

    expect(mockAnalyzeProject).not.toHaveBeenCalled();
    expect(result.analysis).toBeUndefined();
    expect(result.complianceExcel).toBeUndefined();
  });

  it("reports progress through callback", async () => {
    setupFullMocks();
    const stages: string[] = [];
    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: {
        onProgress: (p) => {
          if (!stages.includes(p.stage)) stages.push(p.stage);
        },
      },
    };

    await runUnifiedPipeline(input);

    expect(stages).toContain("classify");
    expect(stages).toContain("analyze");
    expect(stages).toContain("estimate");
    expect(stages).toContain("export");
  });

  it("handles empty file list gracefully", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Nenhum ficheiro reconhecido");
    expect(result.wbsProject).toBeUndefined();
  });

  it("merges existingProject data into result", async () => {
    setupFullMocks();
    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: {
        existingProject: { name: "Custom Name", numberOfFloors: 5 },
      },
    };

    const result = await runUnifiedPipeline(input);

    expect(result.project.name).toBe("Custom Name");
    expect(result.project.numberOfFloors).toBe(5);
  });

  it("handles IFC analysis failure gracefully", async () => {
    setupFullMocks();
    mockAnalyzeIfcSpecialty.mockImplementation(() => {
      throw new Error("parse error");
    });

    const input: UnifiedPipelineInput = {
      files: [makeFile("bad.ifc")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    expect(result.warnings.some(w => w.includes("Erro ao analisar IFC"))).toBe(true);
    expect(result.ifcAnalyses).toBeUndefined();
  });

  it("warns about unmatched CYPE articles", async () => {
    setupFullMocks();
    mockMatchWbsToCype.mockReturnValue({
      matches: [],
      unmatched: [{ articleCode: "99.01.001", description: "Unknown", suggestedSearch: "" }],
      stats: { totalArticles: 1, matched: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0, unmatched: 1, coveragePercent: 0 },
    });

    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    expect(result.warnings.some(w => w.includes("sem correspondência CYPE"))).toBe(true);
  });

  it("handles PDF parse failure gracefully", async () => {
    setupFullMocks();
    mockSplitAndExtract.mockRejectedValue(new Error("corrupt pdf"));

    const input: UnifiedPipelineInput = {
      files: [makeFile("spec.pdf"), makeFile("budget.xlsx")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    // Pipeline completes — PDF failure is a warning, not a crash
    expect(result.warnings.some(w => w.includes("spec.pdf"))).toBe(true);
    // BOQ still processed
    expect(mockParseExcelWbs).toHaveBeenCalledTimes(1);
    expect(result.wbsProject).toBeDefined();
  });

  it("handles schedule generation failure gracefully", async () => {
    setupFullMocks();
    mockGenerateSchedule.mockImplementation(() => {
      throw new Error("sequencer crash");
    });

    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    // Cost estimation still happened
    expect(result.matchReport).toBeDefined();
    // Schedule failed — warning added
    expect(result.warnings.some(w => w.includes("cronograma"))).toBe(true);
    expect(result.schedule).toBeUndefined();
    // No budget excel either (requires schedule + resources)
    expect(result.budgetExcel).toBeUndefined();
  });

  it("handles all optional stages failing without crashing", async () => {
    setupFullMocks();
    mockAnalyzeIfcSpecialty.mockImplementation(() => { throw new Error("ifc fail"); });
    mockParseExcelWbs.mockRejectedValue(new Error("excel fail"));
    mockAnalyzeProject.mockRejectedValue(new Error("analyze fail"));

    const input: UnifiedPipelineInput = {
      files: [makeFile("model.ifc"), makeFile("budget.xlsx")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    // Pipeline completes with warnings
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.some(w => w.includes("IFC"))).toBe(true);
    expect(result.warnings.some(w => w.includes("BOQ"))).toBe(true);
    // No outputs generated
    expect(result.ifcAnalyses).toBeUndefined();
    expect(result.wbsProject).toBeUndefined();
    expect(result.schedule).toBeUndefined();
  });

  it("passes labor constraint maxWorkers to generateSchedule", async () => {
    setupFullMocks();
    mockInferMaxWorkers.mockReturnValue({ maxWorkers: 20, budgetRange: "1.5M – 5M €", rationale: "test" });

    const input: UnifiedPipelineInput = {
      files: [makeFile("budget.xlsx")],
      options: {},
    };

    await runUnifiedPipeline(input);

    expect(mockGenerateSchedule).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        maxWorkers: 20,
        useCriticalChain: true,
      }),
    );
  });

  it("triggers OCR for scanned PDF pages", async () => {
    setupFullMocks();
    // Mock a PDF with scanned pages (< 50 chars)
    mockSplitAndExtract.mockResolvedValue({
      text: "",
      pageTexts: [
        { page: 1, text: "short" },
        { page: 2, text: "This page has enough text to not trigger OCR — it is a text-based page with sufficient content." },
        { page: 3, text: "" },
      ],
      totalPages: 3,
      chunks: 1,
    });
    mockOcrPdfPages.mockResolvedValue([
      { pageNumber: 1, text: "Memória descritiva\nÁrea bruta: 250 m2", confidence: 85, processingTimeMs: 2000 },
      { pageNumber: 3, text: "Projeto de estruturas", confidence: 78, processingTimeMs: 1500 },
    ]);
    mockParseDocumentWithAI.mockResolvedValue({
      fields: {},
      confidence: {},
      extractedText: "",
      warnings: [],
    });
    mockMergeExtractedData.mockImplementation((proj) => proj);

    const input: UnifiedPipelineInput = {
      files: [makeFile("scanned.pdf")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    // OCR was called for pages 1 and 3 (both < 50 chars)
    expect(mockOcrPdfPages).toHaveBeenCalledTimes(1);
    expect(mockOcrPdfPages).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      [1, 3],
      expect.objectContaining({ language: "por" }),
    );
    // OCR text should be used for AI parsing
    expect(mockParseDocumentWithAI).toHaveBeenCalledTimes(1);
    expect(result.warnings.some(w => w.includes("OCR aplicado"))).toBe(true);
  });

  it("continues without OCR if server-ocr import fails", async () => {
    setupFullMocks();
    mockSplitAndExtract.mockResolvedValue({
      text: "",
      pageTexts: [{ page: 1, text: "" }],
      totalPages: 1,
      chunks: 1,
    });
    // Simulate server-ocr module not available
    mockOcrPdfPages.mockImplementation(() => {
      throw new Error("Cannot find module './server-ocr'");
    });

    const input: UnifiedPipelineInput = {
      files: [makeFile("scanned.pdf")],
      options: {},
    };

    const result = await runUnifiedPipeline(input);

    // Pipeline didn't crash
    expect(result.warnings.some(w => w.includes("OCR indisponível"))).toBe(true);
  });
});

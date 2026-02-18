import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { generateComplianceExcel } from "@/lib/compliance-export";
import type { ComplianceExportOptions } from "@/lib/compliance-export";
import type {
  AnalysisResult,
  Finding,
  Recommendation,
  RegulationSummary,
  RuleEvaluationMetrics,
} from "@/lib/types";

// ============================================================
// Helpers
// ============================================================

function parseExcel(buffer: ArrayBuffer): { sheetNames: string[]; sheets: Record<string, unknown[][]> } {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets: Record<string, unknown[][]> = {};
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
  }
  return { sheetNames: wb.SheetNames, sheets };
}

function findRow(rows: unknown[][], text: string): number {
  return rows.findIndex((row) => row.some((cell) => typeof cell === "string" && cell.includes(text)));
}

// ============================================================
// Factories
// ============================================================

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "F-001",
    area: "architecture",
    regulation: "RGEU",
    article: "Art. 65",
    description: "Pé-direito inferior ao mínimo regulamentar",
    severity: "critical",
    currentValue: "2.4 m",
    requiredValue: "2.7 m",
    remediation: "Aumentar o pé-direito para 2.7 m",
    ...overrides,
  };
}

function makeRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "R-001",
    area: "thermal",
    title: "Isolamento térmico insuficiente",
    description: "Recomenda-se aumentar a espessura do isolamento ETICS",
    impact: "high",
    regulatoryBasis: "REH Anexo I",
    ...overrides,
  };
}

function makeRegulationSummary(overrides: Partial<RegulationSummary> = {}): RegulationSummary {
  return {
    area: "architecture",
    name: "Arquitetura (RGEU)",
    status: "non_compliant",
    findingsCount: 3,
    score: 65,
    ...overrides,
  };
}

function makeRuleMetrics(overrides: Partial<RuleEvaluationMetrics> = {}): RuleEvaluationMetrics {
  return {
    pluginId: "architecture",
    pluginName: "Arquitetura",
    area: "architecture",
    totalRules: 200,
    evaluatedRules: 180,
    skippedRules: 20,
    firedRules: 5,
    coveragePercent: 90,
    ...overrides,
  };
}

function makeAnalysisResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    projectName: "Edifício Teste",
    overallScore: 72,
    energyClass: "B",
    findings: [
      makeFinding({ id: "F-001", severity: "critical", area: "architecture" }),
      makeFinding({ id: "F-002", severity: "warning", area: "fire_safety", regulation: "SCIE", description: "Falta detetor de incêndio" }),
      makeFinding({ id: "F-003", severity: "pass", area: "architecture", description: "Largura de corredor conforme" }),
      makeFinding({ id: "F-004", severity: "pass", area: "structural", regulation: "Eurocódigo 8", description: "Classe de importância correta" }),
    ],
    recommendations: [
      makeRecommendation({ id: "R-001", impact: "high" }),
      makeRecommendation({ id: "R-002", impact: "medium", title: "Melhoria acústica", area: "acoustic" }),
      makeRecommendation({ id: "R-003", impact: "low", title: "Acessibilidade adicional", area: "accessibility" }),
    ],
    regulationSummary: [
      makeRegulationSummary({ area: "architecture", name: "Arquitetura (RGEU)", status: "non_compliant", findingsCount: 3, score: 65 }),
      makeRegulationSummary({ area: "fire_safety", name: "Segurança Contra Incêndio", status: "partially_compliant", findingsCount: 1, score: 80 }),
      makeRegulationSummary({ area: "structural", name: "Estruturas", status: "compliant", findingsCount: 1, score: 100 }),
    ],
    ruleEvaluation: [
      makeRuleMetrics({ pluginId: "architecture", pluginName: "Arquitetura", totalRules: 200, evaluatedRules: 180, skippedRules: 20, firedRules: 5, coveragePercent: 90 }),
      makeRuleMetrics({ pluginId: "fire_safety", pluginName: "Segurança Contra Incêndio", totalRules: 150, evaluatedRules: 140, skippedRules: 10, firedRules: 2, coveragePercent: 93 }),
    ],
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe("Compliance Excel Export", () => {
  describe("Sheet structure", () => {
    it("returns a valid ArrayBuffer", () => {
      const buffer = generateComplianceExcel(makeAnalysisResult());
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it("generates 7 sheets when all sections enabled (default)", () => {
      const { sheetNames } = parseExcel(generateComplianceExcel(makeAnalysisResult()));
      expect(sheetNames).toEqual([
        "Resumo",
        "Por Especialidade",
        "Não Conformidades",
        "Conformidades",
        "Recomendações",
        "Cobertura de Regras",
        "Auditoria",
      ]);
    });

    it("omits sheets when toggled off", () => {
      const options: ComplianceExportOptions = {
        nonConformities: false,
        conformities: false,
        recommendations: false,
      };
      const { sheetNames } = parseExcel(generateComplianceExcel(makeAnalysisResult(), options));
      expect(sheetNames).not.toContain("Não Conformidades");
      expect(sheetNames).not.toContain("Conformidades");
      expect(sheetNames).not.toContain("Recomendações");
      // Still has Resumo, Por Especialidade, Cobertura, Auditoria
      expect(sheetNames).toContain("Resumo");
      expect(sheetNames).toContain("Cobertura de Regras");
    });
  });

  describe("Resumo (Summary) sheet", () => {
    it("contains report header and project info", () => {
      const buffer = generateComplianceExcel(makeAnalysisResult(), { projectName: "Projeto ABC" });
      const { sheets } = parseExcel(buffer);
      const resumo = sheets["Resumo"];

      expect(resumo[0][0]).toBe("RELATÓRIO DE CONFORMIDADE REGULAMENTAR");
      expect(resumo[2][1]).toBe("Projeto ABC");
    });

    it("shows correct overall score and finding counts", () => {
      const result = makeAnalysisResult();
      const { sheets } = parseExcel(generateComplianceExcel(result));
      const resumo = sheets["Resumo"];

      const scoreRow = findRow(resumo, "Pontuação global:");
      expect(scoreRow).toBeGreaterThan(-1);
      expect(resumo[scoreRow][1]).toBe("72/100");

      const energyRow = findRow(resumo, "Classe energética:");
      expect(energyRow).toBeGreaterThan(-1);
      expect(resumo[energyRow][1]).toBe("B");

      const totalRow = findRow(resumo, "Total de verificações:");
      expect(totalRow).toBeGreaterThan(-1);
      expect(resumo[totalRow][1]).toBe(4); // 4 findings total

      const criticalRow = findRow(resumo, "Não conformidades críticas:");
      expect(criticalRow).toBeGreaterThan(-1);
      expect(resumo[criticalRow][1]).toBe(1);

      const warningRow = findRow(resumo, "Avisos:");
      expect(warningRow).toBeGreaterThan(-1);
      expect(resumo[warningRow][1]).toBe(1);

      const passRow = findRow(resumo, "Conformes:");
      expect(passRow).toBeGreaterThan(-1);
      expect(resumo[passRow][1]).toBe(2);
    });

    it("lists regulation summaries with Portuguese status labels", () => {
      const { sheets } = parseExcel(generateComplianceExcel(makeAnalysisResult()));
      const resumo = sheets["Resumo"];

      // Find the specialty summary section
      const headerRow = findRow(resumo, "Área");
      expect(headerRow).toBeGreaterThan(-1);

      // First regulation: Arquitetura → Não Conforme
      const archRow = findRow(resumo, "Arquitetura (RGEU)");
      expect(archRow).toBeGreaterThan(headerRow);
      expect(resumo[archRow][1]).toBe("Não Conforme");
      expect(resumo[archRow][3]).toBe("65%");

      // Structural → Conforme
      const structRow = findRow(resumo, "Estruturas");
      expect(structRow).toBeGreaterThan(headerRow);
      expect(resumo[structRow][1]).toBe("Conforme");
    });
  });

  describe("Por Especialidade sheet", () => {
    it("has specialty breakdown with correct subcounts", () => {
      const { sheets } = parseExcel(generateComplianceExcel(makeAnalysisResult()));
      const specialty = sheets["Por Especialidade"];

      const headerRow = findRow(specialty, "Especialidade");
      expect(headerRow).toBeGreaterThan(-1);

      // Architecture: 1 critical, 0 warning, 1 pass, 2 total
      const archRow = findRow(specialty, "Arquitetura (RGEU)");
      expect(archRow).toBeGreaterThan(headerRow);
      expect(specialty[archRow][2]).toBe(1); // critical
      expect(specialty[archRow][3]).toBe(0); // warning
      expect(specialty[archRow][4]).toBe(1); // pass
      expect(specialty[archRow][5]).toBe(2); // total
    });

    it("includes rule evaluation metrics", () => {
      const { sheets } = parseExcel(generateComplianceExcel(makeAnalysisResult()));
      const specialty = sheets["Por Especialidade"];

      const metricsHeader = findRow(specialty, "MÉTRICAS DE AVALIAÇÃO DE REGRAS");
      expect(metricsHeader).toBeGreaterThan(-1);

      // Plugin row
      const archMetrics = findRow(specialty, "Arquitetura");
      // The first "Arquitetura" is in the specialty section; find the one after metrics header
      const rows = specialty.slice(metricsHeader);
      const pluginRow = rows.findIndex(r => r[0] === "Arquitetura");
      expect(pluginRow).toBeGreaterThan(-1);
      const rowData = rows[pluginRow];
      expect(rowData[1]).toBe(200);  // totalRules
      expect(rowData[2]).toBe(180);  // evaluated
      expect(rowData[3]).toBe(20);   // skipped
      expect(rowData[4]).toBe(5);    // fired

      // TOTAL row
      const totalRow = rows.findIndex(r => r[0] === "TOTAL");
      expect(totalRow).toBeGreaterThan(-1);
      expect(rows[totalRow][1]).toBe(350); // 200 + 150
      expect(rows[totalRow][2]).toBe(320); // 180 + 140
    });
  });

  describe("Não Conformidades sheet", () => {
    it("lists only critical and warning findings, sorted critical-first", () => {
      const { sheets } = parseExcel(generateComplianceExcel(makeAnalysisResult()));
      const nc = sheets["Não Conformidades"];

      const headerRow = findRow(nc, "Gravidade");
      expect(headerRow).toBeGreaterThan(-1);

      // First data row should be critical
      const firstData = nc[headerRow + 1];
      expect(firstData[1]).toBe("Crítico");

      // Second data row should be warning
      const secondData = nc[headerRow + 2];
      expect(secondData[1]).toBe("Aviso");

      // No "pass" findings in this sheet
      const allSeverities = nc.slice(headerRow + 1).map(r => r[1]).filter(Boolean);
      expect(allSeverities).not.toContain("Conforme");

      // Total row
      const totalRow = findRow(nc, "Total: 2 não conformidades");
      expect(totalRow).toBeGreaterThan(-1);
    });
  });

  describe("Recomendações sheet", () => {
    it("uses Portuguese impact labels", () => {
      const { sheets } = parseExcel(generateComplianceExcel(makeAnalysisResult()));
      const rec = sheets["Recomendações"];

      const headerRow = findRow(rec, "ID");
      expect(headerRow).toBeGreaterThan(-1);

      // Collect all impact labels from data rows
      const impacts = rec.slice(headerRow + 1)
        .map(r => r[1])
        .filter(v => typeof v === "string" && v.length > 0 && !v.startsWith("Total"));

      expect(impacts).toContain("Alto");
      expect(impacts).toContain("Médio");
      expect(impacts).toContain("Baixo");

      // Total row
      const totalRow = findRow(rec, "Total: 3 recomendações");
      expect(totalRow).toBeGreaterThan(-1);
    });
  });

  describe("Cobertura de Regras sheet", () => {
    it("shows rules sorted by total rules descending with TOTAL row", () => {
      const { sheets } = parseExcel(generateComplianceExcel(makeAnalysisResult()));
      const coverage = sheets["Cobertura de Regras"];

      const headerRow = findRow(coverage, "Plugin ID");
      expect(headerRow).toBeGreaterThan(-1);

      // First plugin should be the one with more rules (architecture=200 > fire_safety=150)
      const firstData = coverage[headerRow + 1];
      expect(firstData[0]).toBe("architecture");
      expect(firstData[3]).toBe(200);

      const secondData = coverage[headerRow + 2];
      expect(secondData[0]).toBe("fire_safety");
      expect(secondData[3]).toBe(150);

      // TOTAL row
      const totalRow = findRow(coverage, "TOTAL");
      expect(totalRow).toBeGreaterThan(-1);
      expect(coverage[totalRow][3]).toBe(350); // 200 + 150
      expect(coverage[totalRow][4]).toBe(320); // 180 + 140
    });
  });

  describe("Edge cases", () => {
    it("handles empty findings and recommendations", () => {
      const result = makeAnalysisResult({
        findings: [],
        recommendations: [],
        regulationSummary: [],
        ruleEvaluation: [],
      });
      const buffer = generateComplianceExcel(result);
      const { sheetNames, sheets } = parseExcel(buffer);
      expect(sheetNames.length).toBe(7);

      // Summary shows 0 counts
      const resumo = sheets["Resumo"];
      const totalRow = findRow(resumo, "Total de verificações:");
      expect(resumo[totalRow][1]).toBe(0);
    });

    it("handles missing ruleEvaluation", () => {
      const result = makeAnalysisResult({ ruleEvaluation: undefined });
      const buffer = generateComplianceExcel(result);
      const { sheets } = parseExcel(buffer);
      const coverage = sheets["Cobertura de Regras"];

      // Should have fallback message
      const fallbackRow = findRow(coverage, "Métricas de avaliação de regras não disponíveis");
      expect(fallbackRow).toBeGreaterThan(-1);
    });
  });
});

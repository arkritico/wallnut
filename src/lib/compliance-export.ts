/**
 * Compliance Excel Export
 *
 * Generates a multi-sheet Excel file for regulatory compliance analysis results.
 * Sheets:
 * 1. Resumo — Overall score, energy class, compliance summary
 * 2. Por Especialidade — Per-specialty metrics and scores
 * 3. Não Conformidades — All critical + warning findings with details
 * 4. Conformidades — All pass findings
 * 5. Recomendações — Recommendations with impact levels
 * 6. Cobertura de Regras — Rule evaluation metrics per plugin
 */

import * as XLSX from "xlsx";
import type {
  AnalysisResult,
  Finding,
  Recommendation,
  RegulationSummary,
  RuleEvaluationMetrics,
} from "./types";

// ============================================================
// Export Options
// ============================================================

export interface ComplianceExportOptions {
  projectName?: string;
  projectLocation?: string;
  exportDate?: string;
  // Section toggles (all default to true)
  nonConformities?: boolean;
  conformities?: boolean;
  recommendations?: boolean;
  rulesCoverage?: boolean;
  auditTrail?: boolean;
}

// ============================================================
// Sheet 1: Summary (Resumo)
// ============================================================

function buildSummarySheet(
  result: AnalysisResult,
  options: ComplianceExportOptions,
): XLSX.WorkSheet {
  const criticalCount = result.findings.filter(f => f.severity === "critical").length;
  const warningCount = result.findings.filter(f => f.severity === "warning").length;
  const passCount = result.findings.filter(f => f.severity === "pass").length;

  const rows: unknown[][] = [
    ["RELATÓRIO DE CONFORMIDADE REGULAMENTAR"],
    [""],
    ["Projeto:", options.projectName || result.projectName || "Sem nome"],
    ["Localização:", options.projectLocation || "Portugal"],
    ["Data do relatório:", options.exportDate || new Date().toISOString().split("T")[0]],
    [""],
    ["RESULTADO GLOBAL"],
    [""],
    ["Pontuação global:", `${result.overallScore}/100`],
    ["Classe energética:", result.energyClass || "N/A"],
    [""],
    ["Total de verificações:", result.findings.length],
    ["Não conformidades críticas:", criticalCount],
    ["Avisos:", warningCount],
    ["Conformes:", passCount],
    [""],
    ["RESUMO POR ESPECIALIDADE"],
    [""],
    ["Área", "Estado", "Não Conformidades", "Pontuação"],
  ];

  const statusLabels: Record<string, string> = {
    compliant: "Conforme",
    partially_compliant: "Parcialmente Conforme",
    non_compliant: "Não Conforme",
  };

  for (const reg of result.regulationSummary) {
    rows.push([
      reg.name,
      statusLabels[reg.status] ?? reg.status,
      reg.findingsCount,
      `${reg.score}%`,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 50 },
    { wch: 25 },
    { wch: 20 },
    { wch: 15 },
  ];

  return ws;
}

// ============================================================
// Sheet 2: Per Specialty (Por Especialidade)
// ============================================================

function buildSpecialtySheet(result: AnalysisResult): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ["ANÁLISE POR ESPECIALIDADE"],
    [""],
    [
      "Especialidade",
      "Estado",
      "Críticos",
      "Avisos",
      "Conformes",
      "Total",
      "Pontuação",
    ],
  ];

  const statusLabels: Record<string, string> = {
    compliant: "Conforme",
    partially_compliant: "Parcial",
    non_compliant: "Não Conforme",
  };

  for (const reg of result.regulationSummary) {
    const areaFindings = result.findings.filter(f => f.area === reg.area);
    const critical = areaFindings.filter(f => f.severity === "critical").length;
    const warning = areaFindings.filter(f => f.severity === "warning").length;
    const pass = areaFindings.filter(f => f.severity === "pass").length;

    rows.push([
      reg.name,
      statusLabels[reg.status] ?? reg.status,
      critical,
      warning,
      pass,
      areaFindings.length,
      `${reg.score}%`,
    ]);
  }

  // Add rule evaluation metrics if available
  if (result.ruleEvaluation && result.ruleEvaluation.length > 0) {
    rows.push([]);
    rows.push(["MÉTRICAS DE AVALIAÇÃO DE REGRAS"]);
    rows.push([]);
    rows.push([
      "Plugin",
      "Regras Totais",
      "Avaliadas",
      "Ignoradas",
      "Disparadas",
      "Cobertura",
    ]);

    for (const m of result.ruleEvaluation) {
      rows.push([
        m.pluginName,
        m.totalRules,
        m.evaluatedRules,
        m.skippedRules,
        m.firedRules,
        `${m.coveragePercent}%`,
      ]);
    }

    // Totals
    const totals = result.ruleEvaluation.reduce(
      (acc, m) => ({
        total: acc.total + m.totalRules,
        evaluated: acc.evaluated + m.evaluatedRules,
        skipped: acc.skipped + m.skippedRules,
        fired: acc.fired + m.firedRules,
      }),
      { total: 0, evaluated: 0, skipped: 0, fired: 0 },
    );
    const totalCoverage = totals.total > 0 ? Math.round((totals.evaluated / totals.total) * 100) : 100;
    rows.push([
      "TOTAL",
      totals.total,
      totals.evaluated,
      totals.skipped,
      totals.fired,
      `${totalCoverage}%`,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 50 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];
  return ws;
}

// ============================================================
// Sheet 3: Non-Conformities (Não Conformidades)
// ============================================================

function buildNonConformitySheet(result: AnalysisResult): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ["NÃO CONFORMIDADES DETETADAS"],
    [""],
    [
      "ID",
      "Gravidade",
      "Especialidade",
      "Regulamento",
      "Artigo",
      "Descrição",
      "Valor Atual",
      "Valor Exigido",
      "Remediação",
    ],
  ];

  const severityLabels: Record<string, string> = {
    critical: "Crítico",
    warning: "Aviso",
  };

  const nonConformities = result.findings.filter(
    f => f.severity === "critical" || f.severity === "warning",
  );

  // Sort: critical first, then by area
  nonConformities.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (a.severity !== "critical" && b.severity === "critical") return 1;
    return (a.area ?? "").localeCompare(b.area ?? "");
  });

  for (const f of nonConformities) {
    rows.push([
      f.id,
      severityLabels[f.severity] ?? f.severity,
      f.area,
      f.regulation ?? "",
      f.article ?? "",
      f.description,
      f.currentValue ?? "",
      f.requiredValue ?? "",
      f.remediation ?? "",
    ]);
  }

  rows.push([]);
  rows.push([`Total: ${nonConformities.length} não conformidades`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 25 },
    { wch: 15 },
    { wch: 60 },
    { wch: 25 },
    { wch: 25 },
    { wch: 50 },
  ];
  return ws;
}

// ============================================================
// Sheet 4: Conformities (Conformidades)
// ============================================================

function buildConformitySheet(result: AnalysisResult): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ["VERIFICAÇÕES CONFORMES"],
    [""],
    ["ID", "Especialidade", "Regulamento", "Artigo", "Descrição"],
  ];

  const conformities = result.findings.filter(f => f.severity === "pass");
  conformities.sort((a, b) => (a.area ?? "").localeCompare(b.area ?? ""));

  for (const f of conformities) {
    rows.push([
      f.id,
      f.area,
      f.regulation ?? "",
      f.article ?? "",
      f.description,
    ]);
  }

  rows.push([]);
  rows.push([`Total: ${conformities.length} verificações conformes`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 25 },
    { wch: 15 },
    { wch: 70 },
  ];
  return ws;
}

// ============================================================
// Sheet 5: Recommendations (Recomendações)
// ============================================================

function buildRecommendationsSheet(result: AnalysisResult): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ["RECOMENDAÇÕES"],
    [""],
    ["ID", "Impacto", "Área", "Título", "Descrição", "Base Regulamentar"],
  ];

  const impactLabels: Record<string, string> = {
    high: "Alto",
    medium: "Médio",
    low: "Baixo",
  };

  for (const r of result.recommendations) {
    rows.push([
      r.id,
      impactLabels[r.impact] ?? r.impact,
      r.area ?? "",
      r.title,
      r.description,
      r.regulatoryBasis ?? "",
    ]);
  }

  rows.push([]);
  rows.push([`Total: ${result.recommendations.length} recomendações`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 15 },
    { wch: 10 },
    { wch: 18 },
    { wch: 40 },
    { wch: 60 },
    { wch: 30 },
  ];
  return ws;
}

// ============================================================
// Sheet 6: Rule Coverage (Cobertura de Regras)
// ============================================================

function buildCoverageSheet(result: AnalysisResult): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ["COBERTURA DE REGRAS POR ESPECIALIDADE"],
    [""],
  ];

  if (result.ruleEvaluation && result.ruleEvaluation.length > 0) {
    rows.push([
      "Plugin ID",
      "Nome",
      "Área",
      "Regras Totais",
      "Avaliadas",
      "Ignoradas (dados em falta)",
      "Disparadas (não conformes)",
      "Cobertura (%)",
    ]);

    const sorted = [...result.ruleEvaluation].sort((a, b) => b.totalRules - a.totalRules);

    for (const m of sorted) {
      rows.push([
        m.pluginId,
        m.pluginName,
        m.area,
        m.totalRules,
        m.evaluatedRules,
        m.skippedRules,
        m.firedRules,
        m.coveragePercent,
      ]);
    }

    // Totals
    const totals = result.ruleEvaluation.reduce(
      (acc, m) => ({
        total: acc.total + m.totalRules,
        evaluated: acc.evaluated + m.evaluatedRules,
        skipped: acc.skipped + m.skippedRules,
        fired: acc.fired + m.firedRules,
      }),
      { total: 0, evaluated: 0, skipped: 0, fired: 0 },
    );

    rows.push([]);
    rows.push([
      "TOTAL",
      "",
      "",
      totals.total,
      totals.evaluated,
      totals.skipped,
      totals.fired,
      totals.total > 0 ? Math.round((totals.evaluated / totals.total) * 100) : 100,
    ]);
  } else {
    rows.push(["Métricas de avaliação de regras não disponíveis nesta análise."]);
  }

  // Data coverage section
  if (result.contextCoverage) {
    rows.push([]);
    rows.push(["COBERTURA DE DADOS DO PROJETO"]);
    rows.push([]);
    rows.push([
      "Campos totais definidos:",
      result.contextCoverage.total,
    ]);
    rows.push([
      "Campos preenchidos:",
      result.contextCoverage.populated,
    ]);
    rows.push([
      "Cobertura:",
      `${result.contextCoverage.percentage}%`,
    ]);

    if (result.contextCoverage.sources) {
      rows.push([]);
      rows.push(["Fontes dos dados:"]);
      rows.push(["  Do IFC:", result.contextCoverage.sources.fromIfc.length]);
      rows.push(["  Do formulário:", result.contextCoverage.sources.fromForm.length]);
      rows.push(["  Valores por defeito:", result.contextCoverage.sources.fromDefaults.length]);
    }

    if (result.contextCoverage.missingFields.length > 0) {
      rows.push([]);
      rows.push(["Campos em falta (regras ignoradas):"]);
      for (const field of result.contextCoverage.missingFields.slice(0, 50)) {
        rows.push(["  " + field]);
      }
      if (result.contextCoverage.missingFields.length > 50) {
        rows.push([`  ... e mais ${result.contextCoverage.missingFields.length - 50} campos`]);
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 30 },
    { wch: 40 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 25 },
    { wch: 25 },
    { wch: 15 },
  ];
  return ws;
}

// ============================================================
// Sheet 7: Audit Trail (Regras Ignoradas)
// ============================================================

function buildAuditTrailSheet(result: AnalysisResult): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ["TRILHO DE AUDITORIA — REGRAS IGNORADAS POR ESPECIALIDADE"],
    [""],
    ["Regras ignoradas por falta de dados de projeto. Para aumentar a cobertura, preencha os campos indicados na folha 'Cobertura de Regras'."],
    [""],
  ];

  if (result.ruleEvaluation && result.ruleEvaluation.length > 0) {
    const sorted = [...result.ruleEvaluation]
      .filter(m => m.skippedRules > 0)
      .sort((a, b) => b.skippedRules - a.skippedRules);

    if (sorted.length === 0) {
      rows.push(["Nenhuma regra foi ignorada — cobertura de 100%."]);
    } else {
      rows.push([
        "Especialidade",
        "Regras Ignoradas",
        "Cobertura",
        "IDs das Regras Ignoradas",
      ]);

      for (const m of sorted) {
        rows.push([
          m.pluginName,
          m.skippedRules,
          `${m.coveragePercent}%`,
          m.skippedRuleIds ? m.skippedRuleIds.join(", ") : "(IDs não disponíveis)",
        ]);
      }

      // Total
      const totalSkipped = sorted.reduce((s, m) => s + m.skippedRules, 0);
      rows.push([]);
      rows.push([`Total: ${totalSkipped} regras ignoradas`]);
    }
  } else {
    rows.push(["Métricas de avaliação não disponíveis."]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 40 },
    { wch: 18 },
    { wch: 12 },
    { wch: 100 },
  ];
  return ws;
}

// ============================================================
// Main Export Functions
// ============================================================

/**
 * Generate a compliance Excel workbook from analysis results.
 * Returns a binary buffer suitable for server-side use.
 */
export function generateComplianceExcel(
  result: AnalysisResult,
  options: ComplianceExportOptions = {},
): ArrayBuffer {
  const opts = { nonConformities: true, conformities: true, recommendations: true, rulesCoverage: true, auditTrail: true, ...options };
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(result, options), "Resumo");
  XLSX.utils.book_append_sheet(wb, buildSpecialtySheet(result), "Por Especialidade");
  if (opts.nonConformities) XLSX.utils.book_append_sheet(wb, buildNonConformitySheet(result), "Não Conformidades");
  if (opts.conformities) XLSX.utils.book_append_sheet(wb, buildConformitySheet(result), "Conformidades");
  if (opts.recommendations) XLSX.utils.book_append_sheet(wb, buildRecommendationsSheet(result), "Recomendações");
  if (opts.rulesCoverage) XLSX.utils.book_append_sheet(wb, buildCoverageSheet(result), "Cobertura de Regras");
  if (opts.auditTrail) XLSX.utils.book_append_sheet(wb, buildAuditTrailSheet(result), "Auditoria");

  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return buffer;
}

/**
 * Generate and download compliance Excel from the browser.
 */
export function downloadComplianceExcel(
  result: AnalysisResult,
  options: ComplianceExportOptions = {},
): void {
  const buffer = generateComplianceExcel(result, options);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);

  const projectName = (options.projectName || result.projectName || "projeto")
    .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "")
    .replace(/\s+/g, "_");
  const date = options.exportDate || new Date().toISOString().split("T")[0];
  const fileName = `conformidade_${projectName}_${date}.xlsx`;

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

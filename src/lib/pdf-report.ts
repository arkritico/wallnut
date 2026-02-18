/**
 * PDF Report Generator for Wallnut analysis results.
 * Uses jsPDF to create professional regulatory compliance reports.
 */

import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { AnalysisResult, Finding, Recommendation, RegulationSummary, Severity, RuleEvaluationMetrics } from "./types";

// Extend jsPDF with autotable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const COLORS = {
  primary: [37, 99, 235] as [number, number, number],    // blue-600
  dark: [17, 24, 39] as [number, number, number],         // gray-900
  gray: [107, 114, 128] as [number, number, number],      // gray-500
  lightGray: [243, 244, 246] as [number, number, number],  // gray-100
  critical: [220, 38, 38] as [number, number, number],     // red-600
  warning: [217, 119, 6] as [number, number, number],      // amber-600
  pass: [22, 163, 74] as [number, number, number],         // green-600
  info: [37, 99, 235] as [number, number, number],         // blue-600
  white: [255, 255, 255] as [number, number, number],
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Crítico",
  warning: "Aviso",
  info: "Informação",
  pass: "Conforme",
};

const STATUS_LABELS: Record<string, string> = {
  compliant: "Conforme",
  partially_compliant: "Parcial",
  non_compliant: "Não Conforme",
};

export interface PDFExportOptions {
  findings?: boolean;
  recommendations?: boolean;
  passFindings?: boolean;
  metrics?: boolean;
  coverage?: boolean;
}

export function generatePDFReport(result: AnalysisResult, options?: PDFExportOptions): void {
  const opts = { findings: true, recommendations: true, passFindings: true, metrics: true, coverage: true, ...options };
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ============================================================
  // Cover Page
  // ============================================================
  
  // Blue header bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 60, "F");
  
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("WALLNUT", margin, 28);
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Relatório de Análise Regulamentar", margin, 40);
  doc.text("Regulamentação Portuguesa de Edifícios", margin, 48);

  y = 75;
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(result.projectName || "Projeto sem nome", margin, y);
  
  y += 15;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.gray);
  doc.text(`Data do relatório: ${new Date().toLocaleDateString("pt-PT")}`, margin, y);
  
  // Score and energy class box
  y += 20;
  // Score
  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(margin, y, 60, 35, 3, 3, "F");
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.text(`${result.overallScore}`, margin + 30, y + 20, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  doc.text("Pontuação /100", margin + 30, y + 30, { align: "center" });
  
  // Energy class
  const energyColor = getEnergyClassColor(result.energyClass);
  doc.setFillColor(...energyColor);
  doc.roundedRect(margin + 70, y, 40, 35, 3, 3, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text(result.energyClass, margin + 90, y + 20, { align: "center" });
  doc.setFontSize(8);
  doc.text("Classe Energética", margin + 90, y + 30, { align: "center" });

  // Summary stats
  y += 50;
  const criticalCount = result.findings.filter(f => f.severity === "critical").length;
  const warningCount = result.findings.filter(f => f.severity === "warning").length;
  const passCount = result.findings.filter(f => f.severity === "pass").length;
  
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  
  doc.setFillColor(...COLORS.critical);
  doc.circle(margin + 3, y - 1, 2, "F");
  doc.text(`${criticalCount} Não conformidades`, margin + 8, y);
  
  doc.setFillColor(...COLORS.warning);
  doc.circle(margin + 63, y - 1, 2, "F");
  doc.text(`${warningCount} Avisos`, margin + 68, y);
  
  doc.setFillColor(...COLORS.pass);
  doc.circle(margin + 113, y - 1, 2, "F");
  doc.text(`${passCount} Conforme`, margin + 118, y);

  // ============================================================
  // Page 2: Regulation Summary Table
  // ============================================================
  doc.addPage();
  y = margin;

  y = addSectionHeader(doc, "1. Resumo por Regulamento", y, margin);

  const summaryData = result.regulationSummary.map(reg => [
    reg.name,
    STATUS_LABELS[reg.status] || reg.status,
    `${reg.findingsCount}`,
    `${reg.score}%`,
  ]);

  doc.autoTable({
    startY: y,
    head: [["Regulamento", "Estado", "Constataçōes", "Pontuação"]],
    body: summaryData,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 8,
      textColor: COLORS.dark,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 30, halign: "center" },
      2: { cellWidth: 25, halign: "center" },
      3: { cellWidth: 25, halign: "center" },
    },
    didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { textColor: number[] }; text: string[] } }) => {
      if (data.section === "body" && data.column.index === 1) {
        const status = data.cell.text[0];
        if (status === "Não Conforme") data.cell.styles.textColor = [...COLORS.critical];
        else if (status === "Parcial") data.cell.styles.textColor = [...COLORS.warning];
        else if (status === "Conforme") data.cell.styles.textColor = [...COLORS.pass];
      }
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ============================================================
  // Findings (Critical + Warning)
  // ============================================================
  if (opts.findings) {
    const criticalFindings = result.findings.filter(f => f.severity === "critical");
    const warningFindings = result.findings.filter(f => f.severity === "warning");

    if (criticalFindings.length > 0) {
      y = checkPageBreak(doc, y, 40, margin);
      y = addSectionHeader(doc, "2. Não Conformidades (Críticas)", y, margin);
      y = addFindingsTable(doc, criticalFindings, y, margin, "critical");
    }

    if (warningFindings.length > 0) {
      y = checkPageBreak(doc, y, 40, margin);
      y = addSectionHeader(doc, "3. Avisos", y, margin);
      y = addFindingsTable(doc, warningFindings, y, margin, "warning");
    }
  }

  // ============================================================
  // Recommendations
  // ============================================================
  if (opts.recommendations && result.recommendations.length > 0) {
    y = checkPageBreak(doc, y, 40, margin);
    y = addSectionHeader(doc, "4. Recomendações de Melhoria", y, margin);

    const recData = result.recommendations.map(rec => {
      const impactLabel = rec.impact === "high" ? "Alto" : rec.impact === "medium" ? "Médio" : "Baixo";
      return [
        rec.title,
        rec.description,
        impactLabel,
        rec.regulatoryBasis || "-",
      ];
    });

    doc.autoTable({
      startY: y,
      head: [["Recomendação", "Descrição", "Impacto", "Base Legal"]],
      body: recData,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontSize: 9,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 7,
        textColor: COLORS.dark,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 35, fontStyle: "bold" },
        1: { cellWidth: 80 },
        2: { cellWidth: 18, halign: "center" },
        3: { cellWidth: 35 },
      },
    });

    y = doc.lastAutoTable.finalY + 10;
  }

  // ============================================================
  // Pass findings (summary)
  // ============================================================
  const passFindings = result.findings.filter(f => f.severity === "pass");
  if (opts.passFindings && passFindings.length > 0) {
    y = checkPageBreak(doc, y, 40, margin);
    y = addSectionHeader(doc, "5. Conformidades Verificadas", y, margin);

    const passData = passFindings.map(f => [
      f.regulation,
      f.article || "-",
      f.description,
    ]);

    doc.autoTable({
      startY: y,
      head: [["Regulamento", "Artigo", "Descrição"]],
      body: passData,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: COLORS.pass,
        textColor: COLORS.white,
        fontSize: 9,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 7,
        textColor: COLORS.dark,
      },
      alternateRowStyles: {
        fillColor: [240, 253, 244],
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 30 },
        2: { cellWidth: 100 },
      },
    });
  }

  // ============================================================
  // Rule Evaluation Metrics
  // ============================================================
  if (opts.metrics && result.ruleEvaluation && result.ruleEvaluation.length > 0) {
    y = checkPageBreak(doc, y, 40, margin);
    y = addSectionHeader(doc, "6. Cobertura de Regras por Especialidade", y, margin);

    const sorted = [...result.ruleEvaluation].sort((a, b) => b.totalRules - a.totalRules);
    const metricsData = sorted.map(m => [
      m.pluginName,
      String(m.totalRules),
      String(m.evaluatedRules),
      String(m.skippedRules),
      String(m.firedRules),
      `${m.coveragePercent}%`,
    ]);

    // Totals row
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
    metricsData.push([
      "TOTAL",
      String(totals.total),
      String(totals.evaluated),
      String(totals.skipped),
      String(totals.fired),
      `${totalCoverage}%`,
    ]);

    doc.autoTable({
      startY: y,
      head: [["Especialidade", "Total", "Avaliadas", "Ignoradas", "Disparadas", "Cobertura"]],
      body: metricsData,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 7,
        textColor: COLORS.dark,
      },
      alternateRowStyles: {
        fillColor: [239, 246, 255],
      },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 15, halign: "center" as const },
        2: { cellWidth: 20, halign: "center" as const },
        3: { cellWidth: 20, halign: "center" as const },
        4: { cellWidth: 20, halign: "center" as const },
        5: { cellWidth: 20, halign: "center" as const },
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ============================================================
  // Context Coverage & Missing Fields (Audit Trail)
  // ============================================================
  if (opts.coverage && result.contextCoverage && result.contextCoverage.total > 0) {
    y = checkPageBreak(doc, y, 40, margin);
    y = addSectionHeader(doc, "7. Cobertura de Dados do Projeto", y, margin);

    // Summary stats
    const cc = result.contextCoverage;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    doc.text(`Campos totais: ${cc.total} | Preenchidos: ${cc.populated} | Cobertura: ${cc.percentage}%`, margin, y);
    y += 6;

    if (cc.sources) {
      doc.text(`Fontes — Formulário: ${cc.sources.fromForm.length} | IFC: ${cc.sources.fromIfc.length} | Defeitos: ${cc.sources.fromDefaults.length}`, margin, y);
      y += 8;
    }

    // Missing fields table
    if (cc.missingFields.length > 0) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${cc.missingFields.length} campos em falta (regras ignoradas):`, margin, y);
      y += 6;

      // Show up to 60 missing fields in a compact 3-column table
      const fieldsToShow = cc.missingFields.slice(0, 60);
      const cols = 3;
      const rows: string[][] = [];
      for (let i = 0; i < fieldsToShow.length; i += cols) {
        rows.push([
          fieldsToShow[i] || "",
          fieldsToShow[i + 1] || "",
          fieldsToShow[i + 2] || "",
        ]);
      }

      doc.autoTable({
        startY: y,
        body: rows,
        margin: { left: margin, right: margin },
        showHead: false,
        bodyStyles: {
          fontSize: 6,
          textColor: COLORS.gray,
          cellPadding: 1.5,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: contentWidth / 3 },
          1: { cellWidth: contentWidth / 3 },
          2: { cellWidth: contentWidth / 3 },
        },
      });
      y = doc.lastAutoTable.finalY + 4;

      if (cc.missingFields.length > 60) {
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.gray);
        doc.text(`... e mais ${cc.missingFields.length - 60} campos`, margin, y);
        y += 6;
      }
    }

    y += 4;
  }

  // ============================================================
  // Footer on all pages
  // ============================================================
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text(
      `Wallnut - Análise Regulamentar | ${result.projectName} | ${new Date().toLocaleDateString("pt-PT")} | Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 7,
      { align: "center" },
    );
  }

  // Save
  const fileName = `wallnut_${(result.projectName || "projeto").replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

// ============================================================
// Helpers
// ============================================================

function addSectionHeader(doc: jsPDF, title: string, y: number, margin: number): number {
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text(title, margin, y);
  
  y += 2;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 60, y);
  
  return y + 8;
}

function addFindingsTable(
  doc: jsPDF,
  findings: Finding[],
  y: number,
  margin: number,
  severity: "critical" | "warning",
): number {
  const color = severity === "critical" ? COLORS.critical : COLORS.warning;
  const altColor: [number, number, number] = severity === "critical" ? [254, 242, 242] : [255, 251, 235];

  const data = findings.map(f => [
    f.regulation,
    f.article || "-",
    f.description,
    f.currentValue ? `${f.currentValue} → ${f.requiredValue || "?"}` : "-",
  ]);

  doc.autoTable({
    startY: y,
    head: [["Regulamento", "Artigo", "Descrição", "Valor"]],
    body: data,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: color,
      textColor: COLORS.white,
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7,
      textColor: COLORS.dark,
    },
    alternateRowStyles: {
      fillColor: altColor,
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 30 },
      2: { cellWidth: 80 },
      3: { cellWidth: 25 },
    },
  });

  return doc.lastAutoTable.finalY + 10;
}

function checkPageBreak(doc: jsPDF, y: number, requiredSpace: number, margin: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + requiredSpace > pageHeight - 20) {
    doc.addPage();
    return margin;
  }
  return y;
}

function getEnergyClassColor(energyClass: string): [number, number, number] {
  const map: Record<string, [number, number, number]> = {
    "A+": [21, 128, 61],
    A: [22, 163, 74],
    B: [34, 197, 94],
    "B-": [202, 138, 4],
    C: [234, 179, 8],
    D: [249, 115, 22],
    E: [234, 88, 12],
    F: [220, 38, 38],
  };
  return map[energyClass] ?? [107, 114, 128];
}

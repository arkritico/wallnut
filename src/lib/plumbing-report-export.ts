/**
 * Plumbing Report Export Utilities
 *
 * Generates PDF, Excel, and HTML reports for RGSPPDADAR plumbing validation results.
 */

import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PlumbingValidationResult } from "@/components/PlumbingValidationPanel";

// Extend jsPDF with autotable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const COLORS = {
  primary: [14, 165, 233] as [number, number, number],    // sky-500
  dark: [17, 24, 39] as [number, number, number],         // gray-900
  gray: [107, 114, 128] as [number, number, number],      // gray-500
  lightGray: [243, 244, 246] as [number, number, number], // gray-100
  critical: [220, 38, 38] as [number, number, number],    // red-600
  warning: [217, 119, 6] as [number, number, number],     // amber-600
  pass: [22, 163, 74] as [number, number, number],        // green-600
  white: [255, 255, 255] as [number, number, number],
};

interface PlumbingReportData {
  projectName: string;
  results: PlumbingValidationResult[];
  statistics: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    byCategory: Record<string, { passed: number; failed: number }>;
  };
}

/**
 * Generate PDF report for plumbing validation
 */
export function generatePlumbingPDF(data: PlumbingReportData): void {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ============================================================
  // Cover Page
  // ============================================================

  // Header bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 50, "F");

  doc.setTextColor(...COLORS.white);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("💧 Validação Hidráulica", margin, 25);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("RGSPPDADAR - Decreto Regulamentar 23/95", margin, 38);

  y = 65;
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.projectName || "Projeto", margin, y);

  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.gray);
  doc.text(`Data: ${new Date().toLocaleDateString("pt-PT")}`, margin, y);
  doc.text(`Hora: ${new Date().toLocaleTimeString("pt-PT")}`, margin + 50, y);

  // Statistics boxes
  y += 15;
  const compliancePercent = data.statistics.total > 0
    ? Math.round((data.statistics.passed / data.statistics.total) * 100)
    : 0;

  // Total rules
  drawStatBox(doc, margin, y, 40, 30,
    data.statistics.total.toString(), "Regras", COLORS.lightGray, COLORS.dark);

  // Passed
  drawStatBox(doc, margin + 45, y, 40, 30,
    data.statistics.passed.toString(), "Conformes", [220, 252, 231] as [number, number, number], COLORS.pass);

  // Failed
  drawStatBox(doc, margin + 90, y, 40, 30,
    data.statistics.failed.toString(), "Não Conformes", [254, 226, 226] as [number, number, number], COLORS.critical);

  // Compliance
  drawStatBox(doc, margin + 135, y, 40, 30,
    `${compliancePercent}%`, "Conformidade", COLORS.primary, COLORS.white);

  // ============================================================
  // Page 2: Category Breakdown
  // ============================================================
  doc.addPage();
  y = margin;

  addSectionHeader(doc, "1. Conformidade por Categoria", y, margin);
  y += 10;

  const categoryData = Object.entries(data.statistics.byCategory).map(([cat, counts]) => {
    const total = counts.passed + counts.failed;
    const percent = total > 0 ? Math.round((counts.passed / total) * 100) : 0;
    return [
      cat,
      total.toString(),
      counts.passed.toString(),
      counts.failed.toString(),
      `${percent}%`
    ];
  });

  doc.autoTable({
    startY: y,
    head: [["Categoria", "Total", "Conforme", "Não Conforme", "%"]],
    body: categoryData,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontSize: 9,
      fontStyle: "bold",
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: "center", cellWidth: 20 },
      2: { halign: "center", cellWidth: 20 },
      3: { halign: "center", cellWidth: 20 },
      4: { halign: "center", cellWidth: 20 },
    },
  });

  y = doc.lastAutoTable.finalY + 15;

  // ============================================================
  // Non-Compliant Rules Detail
  // ============================================================
  const failedResults = data.results.filter(r => r.status === 'fail');

  if (failedResults.length > 0) {
    addSectionHeader(doc, "2. Não Conformidades Detalhadas", y, margin);
    y += 10;

    for (const result of failedResults) {
      // Check if we need a new page
      if (y > 250) {
        doc.addPage();
        y = margin;
      }

      // Rule ID and severity
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.dark);
      doc.text(result.rule_id, margin, y);

      // Severity badge
      const sevColor = result.severity === 'mandatory' ? COLORS.critical : COLORS.warning;
      doc.setFillColor(...sevColor);
      doc.setTextColor(...COLORS.white);
      doc.roundedRect(margin + 30, y - 3, 25, 5, 1, 1, "F");
      doc.setFontSize(7);
      doc.text(
        result.severity === 'mandatory' ? 'OBRIGATÓRIO' : 'RECOMENDADO',
        margin + 42.5,
        y,
        { align: "center" }
      );

      y += 6;

      // Category
      doc.setTextColor(...COLORS.gray);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(result.category, margin, y);

      y += 5;

      // Message
      doc.setTextColor(...COLORS.dark);
      doc.setFontSize(9);
      const messageLines = doc.splitTextToSize(result.message, pageWidth - margin * 2);
      doc.text(messageLines, margin, y);
      y += messageLines.length * 4 + 2;

      // Values if present
      if (result.value_found !== undefined || result.value_expected !== undefined) {
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.gray);
        let valuesText = "";
        if (result.value_found !== undefined) {
          valuesText += `Encontrado: ${result.value_found}`;
        }
        if (result.value_expected !== undefined) {
          if (valuesText) valuesText += " | ";
          valuesText += `Exigido: ${result.value_expected}`;
        }
        doc.text(valuesText, margin, y);
        y += 4;
      }

      // Recommendation if present
      if (result.recommendation) {
        doc.setFillColor(240, 249, 255); // sky-50
        const recLines = doc.splitTextToSize(result.recommendation, pageWidth - margin * 2 - 4);
        const boxHeight = recLines.length * 4 + 4;
        doc.roundedRect(margin, y, pageWidth - margin * 2, boxHeight, 2, 2, "F");

        doc.setTextColor(...COLORS.primary);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("💡 Recomendação:", margin + 2, y + 4);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COLORS.dark);
        doc.text(recLines, margin + 2, y + 8);
        y += boxHeight + 2;
      }

      y += 5; // spacing between rules
    }
  } else {
    doc.setTextColor(...COLORS.pass);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("✅ Nenhuma não-conformidade encontrada!", margin, y);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Todas as regras RGSPPDADAR foram validadas com sucesso.", margin, y + 8);
  }

  // ============================================================
  // Footer on all pages
  // ============================================================
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.gray);
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
    doc.text(
      "RGSPPDADAR - Regulamento Geral dos Sistemas Públicos e Prediais",
      margin,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  // Save
  doc.save(`plumbing-validation-${data.projectName.replace(/\s+/g, "-")}-${Date.now()}.pdf`);
}

/**
 * Generate Excel (CSV) export for plumbing validation
 */
export function generatePlumbingExcel(data: PlumbingReportData): void {
  const rows: string[][] = [
    // Header
    ["RELATÓRIO DE VALIDAÇÃO HIDRÁULICA - RGSPPDADAR"],
    ["Projeto", data.projectName],
    ["Data", new Date().toLocaleDateString("pt-PT")],
    ["Hora", new Date().toLocaleTimeString("pt-PT")],
    [],
    ["RESUMO"],
    ["Total de Regras", data.statistics.total.toString()],
    ["Conformes", data.statistics.passed.toString()],
    ["Não Conformes", data.statistics.failed.toString()],
    ["Erros", data.statistics.error.toString()],
    ["Conformidade", `${Math.round((data.statistics.passed / data.statistics.total) * 100)}%`],
    [],
    ["CONFORMIDADE POR CATEGORIA"],
    ["Categoria", "Total", "Conforme", "Não Conforme", "Conformidade %"],
  ];

  // Add category data
  Object.entries(data.statistics.byCategory).forEach(([cat, counts]) => {
    const total = counts.passed + counts.failed;
    const percent = total > 0 ? Math.round((counts.passed / total) * 100) : 0;
    rows.push([
      cat,
      total.toString(),
      counts.passed.toString(),
      counts.failed.toString(),
      `${percent}%`
    ]);
  });

  rows.push([]);
  rows.push(["RESULTADOS DETALHADOS"]);
  rows.push([
    "ID Regra",
    "Status",
    "Severidade",
    "Categoria",
    "Mensagem",
    "Valor Encontrado",
    "Valor Exigido",
    "Recomendação"
  ]);

  // Add all results
  data.results.forEach(result => {
    rows.push([
      result.rule_id,
      result.status === 'pass' ? 'Conforme' : result.status === 'fail' ? 'Não Conforme' : 'Erro',
      result.severity === 'mandatory' ? 'Obrigatório' : result.severity === 'recommended' ? 'Recomendado' : 'Opcional',
      result.category,
      result.message,
      result.value_found !== undefined ? String(result.value_found) : '',
      result.value_expected !== undefined ? String(result.value_expected) : '',
      result.recommendation || ''
    ]);
  });

  // Convert to CSV
  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  // Add BOM for Excel UTF-8 support
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `plumbing-validation-${data.projectName.replace(/\s+/g, "-")}-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate HTML report for plumbing validation
 */
export function generatePlumbingHTML(data: PlumbingReportData): void {
  const compliancePercent = data.statistics.total > 0
    ? Math.round((data.statistics.passed / data.statistics.total) * 100)
    : 0;

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validação Hidráulica - ${data.projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f9fafb;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      color: white;
      padding: 40px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .header h1 { font-size: 2rem; margin-bottom: 10px; }
    .header p { opacity: 0.9; font-size: 0.95rem; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 25px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      text-align: center;
    }
    .stat-value {
      font-size: 2.5rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .stat-label {
      color: #6b7280;
      font-size: 0.9rem;
    }
    .section {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      margin-bottom: 30px;
    }
    .section h2 {
      font-size: 1.5rem;
      margin-bottom: 20px;
      color: #0ea5e9;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
      color: #374151;
    }
    tr:hover { background: #f9fafb; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-pass { background: #dcfce7; color: #166534; }
    .badge-fail { background: #fee2e2; color: #991b1b; }
    .badge-mandatory { background: #fee2e2; color: #991b1b; }
    .badge-recommended { background: #fef3c7; color: #92400e; }
    .result-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 15px;
    }
    .result-card.fail { border-left: 4px solid #dc2626; }
    .result-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .result-id {
      font-family: monospace;
      font-weight: 600;
      color: #0ea5e9;
    }
    .result-message {
      margin: 10px 0;
      font-size: 0.95rem;
    }
    .result-recommendation {
      background: #f0f9ff;
      border-left: 3px solid #0ea5e9;
      padding: 12px;
      margin-top: 10px;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .footer {
      text-align: center;
      color: #6b7280;
      font-size: 0.85rem;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    @media print {
      body { background: white; padding: 0; }
      .header { background: #0ea5e9; }
      .result-card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>💧 Validação Hidráulica RGSPPDADAR</h1>
      <p><strong>${data.projectName}</strong></p>
      <p>Data: ${new Date().toLocaleDateString("pt-PT")} ${new Date().toLocaleTimeString("pt-PT")}</p>
    </div>

    <!-- Statistics -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" style="color: #0ea5e9;">${data.statistics.total}</div>
        <div class="stat-label">Regras Avaliadas</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #16a34a;">${data.statistics.passed}</div>
        <div class="stat-label">Conformes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #dc2626;">${data.statistics.failed}</div>
        <div class="stat-label">Não Conformes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #0ea5e9;">${compliancePercent}%</div>
        <div class="stat-label">Conformidade</div>
      </div>
    </div>

    <!-- Category Breakdown -->
    <div class="section">
      <h2>Conformidade por Categoria</h2>
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th style="text-align: center;">Total</th>
            <th style="text-align: center;">Conforme</th>
            <th style="text-align: center;">Não Conforme</th>
            <th style="text-align: center;">Conformidade</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(data.statistics.byCategory).map(([cat, counts]) => {
            const total = counts.passed + counts.failed;
            const percent = total > 0 ? Math.round((counts.passed / total) * 100) : 0;
            return `
              <tr>
                <td><strong>${cat}</strong></td>
                <td style="text-align: center;">${total}</td>
                <td style="text-align: center;">${counts.passed}</td>
                <td style="text-align: center;">${counts.failed}</td>
                <td style="text-align: center;"><strong>${percent}%</strong></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Non-Compliant Results -->
    ${data.results.filter(r => r.status === 'fail').length > 0 ? `
    <div class="section">
      <h2>Não Conformidades Detalhadas</h2>
      ${data.results.filter(r => r.status === 'fail').map(result => `
        <div class="result-card fail">
          <div class="result-header">
            <span class="result-id">${result.rule_id}</span>
            <span class="badge badge-${result.severity === 'mandatory' ? 'mandatory' : 'recommended'}">
              ${result.severity === 'mandatory' ? 'OBRIGATÓRIO' : 'RECOMENDADO'}
            </span>
            <span style="color: #6b7280; font-size: 0.85rem;">${result.category}</span>
          </div>
          <div class="result-message">${result.message}</div>
          ${result.value_found !== undefined || result.value_expected !== undefined ? `
            <div style="font-size: 0.85rem; color: #6b7280; margin-top: 8px;">
              ${result.value_found !== undefined ? `Encontrado: <strong>${result.value_found}</strong>` : ''}
              ${result.value_expected !== undefined ? (result.value_found !== undefined ? ' | ' : '') + `Exigido: <strong>${result.value_expected}</strong>` : ''}
            </div>
          ` : ''}
          ${result.recommendation ? `
            <div class="result-recommendation">
              <strong>💡 Recomendação:</strong> ${result.recommendation}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    ` : `
    <div class="section" style="text-align: center; padding: 60px 30px;">
      <div style="font-size: 3rem; margin-bottom: 20px;">✅</div>
      <h2 style="color: #16a34a; margin-bottom: 10px;">Nenhuma Não Conformidade!</h2>
      <p style="color: #6b7280;">Todas as regras RGSPPDADAR foram validadas com sucesso.</p>
    </div>
    `}

    <!-- Footer -->
    <div class="footer">
      <p><strong>RGSPPDADAR</strong> - Regulamento Geral dos Sistemas Públicos e Prediais de Distribuição de Água e de Drenagem de Águas Residuais</p>
      <p>Decreto Regulamentar 23/95 de 23 de Agosto de 1995</p>
      <p style="margin-top: 10px;">Gerado por <strong>Wallnut</strong> - Análise Regulamentar de Edifícios</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  // Create and download
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `plumbing-validation-${data.projectName.replace(/\s+/g, "-")}-${Date.now()}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

// Helper functions

function drawStatBox(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  value: string,
  label: string,
  bgColor: [number, number, number],
  textColor: [number, number, number]
): void {
  doc.setFillColor(...bgColor);
  doc.roundedRect(x, y, width, height, 2, 2, "F");

  doc.setTextColor(...textColor);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(value, x + width / 2, y + height / 2 - 2, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(label, x + width / 2, y + height / 2 + 5, { align: "center" });
}

function addSectionHeader(
  doc: jsPDF,
  title: string,
  y: number,
  margin: number
): void {
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text(title, margin, y);
}

function getEnergyClassColor(energyClass: string): [number, number, number] {
  const colorMap: Record<string, [number, number, number]> = {
    "A+": [34, 197, 94],  // green-500
    "A": [34, 197, 94],
    "B": [132, 204, 22],  // lime-500
    "B-": [234, 179, 8],  // yellow-500
    "C": [251, 146, 60],  // orange-400
    "D": [249, 115, 22],  // orange-500
    "E": [239, 68, 68],   // red-500
    "F": [220, 38, 38],   // red-600
  };
  return colorMap[energyClass] || [107, 114, 128]; // gray-500
}

import { useState } from "react";
import type { AnalysisResult } from "@/lib/types";
import { Download, ChevronDown, Printer, FileSpreadsheet } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function ExportBar({ result, isExporting, setIsExporting, budgetExcel, msProjectXml, ccpmGanttExcel, complianceExcel, onReset }: {
  result: AnalysisResult;
  isExporting: boolean;
  setIsExporting: (v: boolean) => void;
  budgetExcel?: ArrayBuffer;
  msProjectXml?: string;
  ccpmGanttExcel?: ArrayBuffer;
  complianceExcel?: ArrayBuffer;
  onReset: () => void;
}) {
  const { t, lang } = useI18n();

  const [exportMenu, setExportMenu] = useState<"pdf" | "excel" | null>(null);
  const [pdfOpts, setPdfOpts] = useState({ findings: true, recommendations: true, passFindings: true, metrics: true, coverage: true });
  const [excelOpts, setExcelOpts] = useState({ nonConformities: true, conformities: true, recommendations: true, rulesCoverage: true, auditTrail: true });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex gap-3 flex-wrap items-center">
        <button
          onClick={onReset}
          className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
        >
          Nova Análise
        </button>

        <div className="h-6 w-px bg-gray-200" />

        {budgetExcel && (
          <button
            onClick={() => {
              const blob = new Blob([budgetExcel], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `orcamento_${result.projectName || "projeto"}.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" /> Orçamento
          </button>
        )}
        {msProjectXml && (
          <button
            onClick={() => {
              const blob = new Blob([msProjectXml], { type: "application/xml" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `cronograma_${result.projectName || "projeto"}.xml`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Cronograma
          </button>
        )}
        {ccpmGanttExcel && (
          <button
            onClick={() => {
              const blob = new Blob([ccpmGanttExcel], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `gantt_ccpm_${result.projectName || "projeto"}.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#202A30] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" /> {lang === "pt" ? "Gantt CCPM" : "CCPM Gantt"}
          </button>
        )}
        {complianceExcel && (
          <button
            onClick={() => {
              const blob = new Blob([complianceExcel], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `conformidade_${result.projectName || "projeto"}.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" /> Conformidade
          </button>
        )}

        {/* PDF export with options */}
        <div className="relative">
          <button
            onClick={() => setExportMenu(exportMenu === "pdf" ? null : "pdf")}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isExporting ? t.loading : t.exportPDF}
            <ChevronDown className="w-3 h-3" />
          </button>
          {exportMenu === "pdf" && (
            <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-[220px]">
              <p className="text-xs font-semibold text-gray-500 mb-2">Seccoes do PDF</p>
              {([
                ["findings", "Constatações"] as const,
                ["recommendations", "Recomendações"] as const,
                ["passFindings", "Conformidades"] as const,
                ["metrics", "Cobertura de regras"] as const,
                ["coverage", "Dados do projeto"] as const,
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 py-1 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfOpts[key]}
                    onChange={() => setPdfOpts(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded border-gray-300"
                  />
                  {label}
                </label>
              ))}
              <button
                onClick={async () => {
                  setExportMenu(null);
                  setIsExporting(true);
                  try {
                    const { generatePDFReport } = await import("@/lib/pdf-report");
                    generatePDFReport(result, pdfOpts);
                  } catch (err) {
                    console.error("PDF export error:", err);
                  } finally {
                    setIsExporting(false);
                  }
                }}
                className="mt-2 w-full px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Transferir PDF
              </button>
            </div>
          )}
        </div>

        {/* Excel export with options */}
        <div className="relative">
          <button
            onClick={() => setExportMenu(exportMenu === "excel" ? null : "excel")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t.exportExcel}
            <ChevronDown className="w-3 h-3" />
          </button>
          {exportMenu === "excel" && (
            <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-[220px]">
              <p className="text-xs font-semibold text-gray-500 mb-2">Folhas do Excel</p>
              {([
                ["nonConformities", "Não Conformidades"] as const,
                ["conformities", "Conformidades"] as const,
                ["recommendations", "Recomendações"] as const,
                ["rulesCoverage", "Cobertura de regras"] as const,
                ["auditTrail", "Auditoria"] as const,
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 py-1 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excelOpts[key]}
                    onChange={() => setExcelOpts(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded border-gray-300"
                  />
                  {label}
                </label>
              ))}
              <button
                onClick={async () => {
                  setExportMenu(null);
                  try {
                    const { downloadComplianceExcel } = await import("@/lib/compliance-export");
                    downloadComplianceExcel(result, {
                      projectName: result.projectName,
                      ...excelOpts,
                    });
                  } catch (err) {
                    console.error("Excel export error:", err);
                  }
                }}
                className="mt-2 w-full px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Transferir Excel
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          <Printer className="w-4 h-4" /> {t.printReport}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { CheckCircle, ChevronDown, ChevronUp, AlertTriangle, Info } from "lucide-react";
import type { IfcEnrichmentReport, FieldConfidence } from "@/lib/ifc-enrichment";

interface IfcEnrichmentBannerProps {
  report: IfcEnrichmentReport;
}

const CONFIDENCE_STYLE: Record<FieldConfidence, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-green-100", text: "text-green-700", label: "Alta" },
  medium: { bg: "bg-amber-100", text: "text-amber-700", label: "Media" },
  low: { bg: "bg-red-100", text: "text-red-700", label: "Baixa" },
};

/** Group fields by their top-level namespace for display */
function groupBySection(fields: IfcEnrichmentReport["populatedFields"]): Record<string, typeof fields> {
  const groups: Record<string, typeof fields> = {};
  for (const f of fields) {
    const section = f.field.includes(".") ? f.field.split(".")[0] : "geral";
    if (!groups[section]) groups[section] = [];
    groups[section].push(f);
  }
  return groups;
}

const SECTION_LABELS: Record<string, string> = {
  structural: "Estrutura",
  envelope: "Envolvente",
  fireSafety: "Seguranca Incendio",
  accessibility: "Acessibilidade",
  electrical: "Eletricidade",
  waterDrainage: "Agua e Drenagem",
  avac: "AVAC",
  telecommunications: "Telecomunicacoes",
  gas: "Gas",
  geral: "Geral",
};

export default function IfcEnrichmentBanner({ report }: IfcEnrichmentBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (report.populatedFields.length === 0) return null;

  const grouped = groupBySection(report.populatedFields);
  const highCount = report.populatedFields.filter(f => f.confidence === "high").length;
  const mediumCount = report.populatedFields.filter(f => f.confidence === "medium").length;
  const lowCount = report.populatedFields.filter(f => f.confidence === "low").length;

  return (
    <div className="mb-6 rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-accent-light overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-green-50/50 transition-colors"
      >
        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-gray-900">
            IFC Auto-Enrichment: {report.populatedFields.length} campos preenchidos
          </p>
          <p className="text-sm text-gray-600">
            {report.totalElements} elementos de {report.specialtiesDetected.length} especialidade(s)
            {report.storeys.length > 0 && ` | ${report.storeys.length} pisos`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {highCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">{highCount} alta</span>
          )}
          {mediumCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{mediumCount} media</span>
          )}
          {lowCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">{lowCount} baixa</span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Detail Panel */}
      {expanded && (
        <div className="border-t border-green-200 px-4 pb-4">
          {/* Low confidence warning */}
          {lowCount > 0 && (
            <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                {lowCount} campo(s) com confianca baixa — valores estimados que devem ser verificados manualmente.
              </p>
            </div>
          )}

          {/* Grouped fields */}
          <div className="mt-3 space-y-3">
            {Object.entries(grouped).map(([section, fields]) => (
              <div key={section}>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {SECTION_LABELS[section] ?? section}
                </h4>
                <div className="space-y-1">
                  {fields.map((f, i) => {
                    const style = CONFIDENCE_STYLE[f.confidence];
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-white/60">
                        {f.confidence === "low" ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        ) : f.confidence === "medium" ? (
                          <Info className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        )}
                        <span className="text-gray-700 font-medium min-w-0 truncate">
                          {f.field.split(".").pop()}
                        </span>
                        <span className="text-gray-500">=</span>
                        <span className="text-gray-900 font-mono text-xs">
                          {typeof f.value === "boolean" ? (f.value ? "Sim" : "Nao") : String(f.value)}
                        </span>
                        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Materials & Storeys */}
          {(report.materials.length > 0 || report.storeys.length > 0) && (
            <div className="mt-3 pt-3 border-t border-green-100 grid grid-cols-2 gap-4 text-xs text-gray-600">
              {report.storeys.length > 0 && (
                <div>
                  <span className="font-semibold">Pisos:</span>{" "}
                  {report.storeys.join(", ")}
                </div>
              )}
              {report.materials.length > 0 && (
                <div>
                  <span className="font-semibold">Materiais:</span>{" "}
                  {report.materials.slice(0, 8).join(", ")}
                  {report.materials.length > 8 && ` (+${report.materials.length - 8})`}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

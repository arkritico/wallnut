"use client";

import { useMemo } from "react";
import { Calendar, Plus, FileText } from "lucide-react";
import type { SpecialtyPlugin } from "@/lib/plugins/types";
import {
  LEGAL_FORCE_LABELS,
  LEGAL_FORCE_COLORS,
  SOURCE_TYPE_LABELS,
  INGESTION_STATUS_CONFIG,
  SEVERITY_COLORS,
} from "@/lib/regulation-constants";

interface SpecialtyDetailProps {
  plugin: SpecialtyPlugin;
  onSelectRegulation: (specialtyId: string, regulationId: string) => void;
  onStartIngestion: (pluginId: string) => void;
}

export default function SpecialtyDetail({
  plugin,
  onSelectRegulation,
  onStartIngestion,
}: SpecialtyDetailProps) {
  // Severity distribution for this specialty
  const severityDist = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0, pass: 0 };
    for (const rule of plugin.rules) {
      counts[rule.severity]++;
    }
    return counts;
  }, [plugin.rules]);

  const totalRules = plugin.rules.length;

  // Rules per regulation (quick lookup)
  const rulesPerReg = useMemo(() => {
    const map = new Map<string, number>();
    for (const rule of plugin.rules) {
      map.set(rule.regulationId, (map.get(rule.regulationId) ?? 0) + 1);
    }
    return map;
  }, [plugin.rules]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("pt-PT", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{plugin.name}</h1>
        <p className="text-sm text-gray-500 mt-1">{plugin.description}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Atualizado: {formatDate(plugin.lastUpdated)}
          </span>
          <span>v{plugin.version}</span>
          <span>{plugin.regulations.length} regulamentos</span>
          <span>{totalRules} regras</span>
        </div>
      </div>

      {/* Severity distribution bar */}
      {totalRules > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-2">
            Distribuição por Severidade
          </h2>
          <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
            {(["critical", "warning", "info", "pass"] as const).map((sev) => {
              const pct = (severityDist[sev] / totalRules) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={sev}
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: SEVERITY_COLORS[sev],
                  }}
                  title={`${sev}: ${severityDist[sev]} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2">
            {(["critical", "warning", "info", "pass"] as const).map((sev) => (
              <span key={sev} className="flex items-center gap-1 text-xs text-gray-500">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: SEVERITY_COLORS[sev] }}
                />
                {severityDist[sev]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Regulations list */}
      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">Regulamentos</h2>

        {plugin.regulations.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">
              Nenhum regulamento registado
            </p>
            <button
              onClick={() => onStartIngestion(plugin.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {plugin.regulations.map((reg) => {
              const ingestionCfg = INGESTION_STATUS_CONFIG[reg.ingestionStatus];
              const regRuleCount = rulesPerReg.get(reg.id) ?? 0;

              return (
                <button
                  key={reg.id}
                  onClick={() => onSelectRegulation(plugin.id, reg.id)}
                  className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all group"
                >
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {reg.shortRef}
                      </span>
                      <span className="text-sm text-gray-600 ml-2">
                        {reg.title}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums shrink-0">
                      {regRuleCount} regras
                    </span>
                  </div>

                  {/* Badges row */}
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    {/* Date */}
                    <span className="text-xs text-gray-400">
                      {formatDate(reg.effectiveDate)}
                    </span>

                    {/* Legal force */}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        LEGAL_FORCE_COLORS[reg.legalForce] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {LEGAL_FORCE_LABELS[reg.legalForce] ?? reg.legalForce}
                    </span>

                    {/* Source type */}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {SOURCE_TYPE_LABELS[reg.sourceType] ?? reg.sourceType}
                    </span>

                    {/* Ingestion status */}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${ingestionCfg.bg} ${ingestionCfg.color}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${ingestionCfg.dot}`} />
                      {ingestionCfg.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

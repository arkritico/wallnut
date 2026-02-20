"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Tag } from "lucide-react";
import type { SpecialtyPlugin, RegulationDocument, DeclarativeRule } from "@/lib/plugins/types";
import {
  LEGAL_FORCE_LABELS,
  LEGAL_FORCE_COLORS,
  SOURCE_TYPE_LABELS,
  INGESTION_STATUS_CONFIG,
  SEVERITY_BG,
} from "@/lib/regulation-constants";
import { SPECIALTY_NAMES } from "@/lib/regulation-constants";

interface RegulationDetailProps {
  plugin: SpecialtyPlugin;
  regulation: RegulationDocument;
  severityFilter: string;
  searchQuery: string;
  onSelectRule: (specialtyId: string, regulationId: string, ruleId: string) => void;
  onBack: () => void;
}

const PAGE_SIZE = 100;

export default function RegulationDetail({
  plugin,
  regulation,
  severityFilter,
  searchQuery,
  onSelectRule,
  onBack,
}: RegulationDetailProps) {
  const [showAll, setShowAll] = useState(false);

  // Get rules belonging to this regulation from the plugin
  const allRules = useMemo(
    () => plugin.rules.filter((r) => r.regulationId === regulation.id),
    [plugin.rules, regulation.id],
  );

  // Filter rules by search and severity
  const filteredRules = useMemo(() => {
    let rules = allRules;

    if (severityFilter && severityFilter !== "all") {
      rules = rules.filter((r) => r.severity === severityFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rules = rules.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.article.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }

    // Sort by rule ID
    rules.sort((a, b) => a.id.localeCompare(b.id, "pt", { numeric: true }));
    return rules;
  }, [allRules, severityFilter, searchQuery]);

  const displayedRules = showAll ? filteredRules : filteredRules.slice(0, PAGE_SIZE);
  const hasMore = filteredRules.length > PAGE_SIZE && !showAll;

  const ingestionCfg = INGESTION_STATUS_CONFIG[regulation.ingestionStatus];

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

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "..." : text;

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      active: "Ativo",
      amended: "Alterado",
      superseded: "Substituído",
      revoked: "Revogado",
      draft: "Rascunho",
    };
    return map[status] ?? status;
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-100 text-green-700",
      amended: "bg-amber-100 text-amber-700",
      superseded: "bg-gray-100 text-gray-600",
      revoked: "bg-red-100 text-red-700",
      draft: "bg-blue-100 text-blue-600",
    };
    return map[status] ?? "bg-gray-100 text-gray-600";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <button
          onClick={onBack}
          className="hover:text-gray-900 transition-colors"
        >
          {SPECIALTY_NAMES[plugin.id] ?? plugin.name}
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">{regulation.shortRef}</span>
      </nav>

      {/* Metadata header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{regulation.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{regulation.shortRef}</p>
        </div>

        {/* Badges */}
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {formatDate(regulation.effectiveDate)}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor(regulation.status)}`}>
            {statusLabel(regulation.status)}
          </span>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              LEGAL_FORCE_COLORS[regulation.legalForce] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {LEGAL_FORCE_LABELS[regulation.legalForce] ?? regulation.legalForce}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {SOURCE_TYPE_LABELS[regulation.sourceType] ?? regulation.sourceType}
          </span>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${ingestionCfg.bg} ${ingestionCfg.color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${ingestionCfg.dot}`} />
            {ingestionCfg.label}
          </span>
        </div>

        {/* Tags */}
        {regulation.tags.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5">
            <Tag className="w-3.5 h-3.5 text-gray-400" />
            {regulation.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Notes */}
        {regulation.notes && (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            {regulation.notes}
          </p>
        )}
      </div>

      {/* Rules table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-700">
            {filteredRules.length} regra{filteredRules.length !== 1 ? "s" : ""}
          </h2>
        </div>

        {filteredRules.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            Nenhuma regra encontrada.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-500 w-40">
                    ID
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 w-28">
                    Artigo
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">
                    Descrição
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 w-24 text-center">
                    Severidade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedRules.map((rule) => (
                  <tr
                    key={rule.id}
                    onClick={() => onSelectRule(plugin.id, regulation.id, rule.id)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {rule.id}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {rule.article}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {truncate(rule.description, 80)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BG[rule.severity]}`}
                      >
                        {rule.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {hasMore && (
              <div className="border-t border-gray-200 px-4 py-3 text-center">
                <button
                  onClick={() => setShowAll(true)}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <ChevronDown className="w-4 h-4" />
                  Mostrar mais ({filteredRules.length - PAGE_SIZE} restantes)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
} from "lucide-react";
import type {
  ReconciledBoq,
  ReconciledArticle,
  AdditionArticle,
} from "@/lib/boq-reconciliation";

// ============================================================
// Types
// ============================================================

export interface ReconciliationPanelProps {
  reconciledBoq: ReconciledBoq;
  onExport?: () => void;
  className?: string;
}

type SortField = "code" | "delta" | "confidence";
type FilterMode = "all" | "corroborated" | "delta" | "unmatched";

// ============================================================
// Helpers
// ============================================================

function formatEur(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQty(value: number, unit: string): string {
  return `${value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${unit}`;
}

function deltaColor(delta: number, base: number): string {
  if (base === 0) return "text-gray-500";
  const ratio = Math.abs(delta) / base;
  if (ratio <= 0.05) return "text-green-600";
  if (ratio <= 0.10) return "text-amber-600";
  return "text-red-600";
}

function confidenceBadge(confidence: number): { bg: string; text: string; label: string } {
  if (confidence >= 85) return { bg: "bg-green-100", text: "text-green-700", label: "Alta" };
  if (confidence >= 60) return { bg: "bg-amber-100", text: "text-amber-700", label: "Média" };
  if (confidence >= 40) return { bg: "bg-orange-100", text: "text-orange-700", label: "Baixa" };
  return { bg: "bg-gray-100", text: "text-gray-500", label: "—" };
}

// ============================================================
// Component
// ============================================================

export default function ReconciliationPanel({
  reconciledBoq,
  onExport,
  className = "",
}: ReconciliationPanelProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedExecution, setExpandedExecution] = useState(true);
  const [expandedAdditions, setExpandedAdditions] = useState(true);

  const { executionArticles, additionArticles, stats } = reconciledBoq;

  // Filtered execution articles
  const filteredExecution = useMemo(() => {
    let items = [...executionArticles];

    switch (filter) {
      case "corroborated":
        items = items.filter((a) => a.ifcCorroborated);
        break;
      case "delta":
        items = items.filter(
          (a) =>
            a.ifcCorroborated &&
            a.quantityDelta !== undefined &&
            Math.abs(a.quantityDelta) > a.executionQuantity * 0.05,
        );
        break;
      case "unmatched":
        items = items.filter((a) => !a.ifcCorroborated);
        break;
    }

    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "code":
          cmp = a.articleCode.localeCompare(b.articleCode);
          break;
        case "delta":
          cmp = Math.abs(b.quantityDelta ?? 0) - Math.abs(a.quantityDelta ?? 0);
          break;
        case "confidence":
          cmp = b.matchConfidence - a.matchConfidence;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return items;
  }, [executionArticles, filter, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // ── Summary bar ────────────────────────────────────────────
  const corroboratedPct =
    stats.totalExecution > 0
      ? Math.round((stats.corroboratedByIfc / stats.totalExecution) * 100)
      : 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-green-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[10px] font-medium">Confirmados IFC</span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {stats.corroboratedByIfc}/{stats.totalExecution}
          </p>
          <p className="text-[10px] text-gray-500">{corroboratedPct}% cobertura</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-amber-600 mb-1">
            <ArrowUpDown className="w-4 h-4" />
            <span className="text-[10px] font-medium">Com desvio</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{stats.withQuantityDelta}</p>
          <p className="text-[10px] text-gray-500">artigos com &Delta; &gt; 5%</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-blue-600 mb-1">
            <PlusCircle className="w-4 h-4" />
            <span className="text-[10px] font-medium">Adições IFC</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{stats.totalAdditions}</p>
          <p className="text-[10px] text-gray-500">
            {stats.additionCost > 0 ? formatEur(stats.additionCost) : "—"}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-gray-600 mb-1">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="text-[10px] font-medium">Custo execução</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatEur(stats.executionCost)}</p>
          <p className="text-[10px] text-gray-500">
            confiança média: {stats.avgConfidence}%
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "Todos"],
            ["corroborated", "Confirmados"],
            ["delta", "Com desvio"],
            ["unmatched", "Sem correspondência"],
          ] as [FilterMode, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors min-h-[36px] ${
              filter === key
                ? "bg-accent text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}

        {onExport && (
          <button
            onClick={onExport}
            className="ml-auto px-3 py-1.5 text-[11px] font-medium text-accent border border-accent rounded-lg hover:bg-accent-light transition-colors min-h-[36px]"
          >
            Exportar Excel
          </button>
        )}
      </div>

      {/* Execution articles section */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedExecution(!expandedExecution)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <h3 className="text-xs font-semibold text-gray-700">
            Artigos do Mapa de Quantidades ({filteredExecution.length})
          </h3>
          {expandedExecution ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {expandedExecution && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th
                    className="px-3 py-2 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("code")}
                  >
                    Código {sortField === "code" && (sortAsc ? "↑" : "↓")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Descrição
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">
                    Qtd. Exec.
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">
                    Qtd. IFC
                  </th>
                  <th
                    className="px-3 py-2 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("delta")}
                  >
                    Delta {sortField === "delta" && (sortAsc ? "↑" : "↓")}
                  </th>
                  <th
                    className="px-3 py-2 text-center font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("confidence")}
                  >
                    Conf. {sortField === "confidence" && (sortAsc ? "↑" : "↓")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredExecution.map((article) => (
                  <ExecutionRow key={article.articleCode} article={article} />
                ))}
                {filteredExecution.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                      Nenhum artigo corresponde ao filtro selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Addition articles section */}
      {additionArticles.length > 0 && (
        <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedAdditions(!expandedAdditions)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-200 hover:bg-blue-100 transition-colors"
          >
            <h3 className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
              <PlusCircle className="w-3.5 h-3.5" />
              Adições IFC ({additionArticles.length})
            </h3>
            {expandedAdditions ? (
              <ChevronUp className="w-4 h-4 text-blue-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-blue-400" />
            )}
          </button>

          {expandedAdditions && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-blue-100 bg-blue-50/30">
                    <th className="px-3 py-2 text-left font-medium text-blue-600">
                      Código
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-blue-600">
                      Descrição
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-blue-600">
                      Qtd. IFC
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-blue-600">
                      Custo est.
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-blue-600">
                      Elementos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {additionArticles.map((article) => (
                    <AdditionRow key={article.articleCode} article={article} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ExecutionRow({ article }: { article: ReconciledArticle }) {
  const badge = confidenceBadge(article.matchConfidence);

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50">
      <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
        {article.articleCode || "—"}
      </td>
      <td className="px-3 py-2 text-gray-800 max-w-[300px]">
        <div className="truncate" title={article.originalDescription}>
          {article.originalDescription}
        </div>
        {article.priceCode && (
          <span className="text-[9px] text-gray-400 font-mono">{article.priceCode}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
        {formatQty(article.executionQuantity, article.unit)}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {article.ifcCorroborated && article.ifcQuantity !== undefined ? (
          <span className="text-gray-700">
            {formatQty(article.ifcQuantity, article.unit)}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {article.ifcCorroborated && article.quantityDelta !== undefined ? (
          <span className={deltaColor(article.quantityDelta, article.executionQuantity)}>
            {article.quantityDelta > 0 ? "+" : ""}
            {article.quantityDelta.toLocaleString("pt-PT", {
              maximumFractionDigits: 2,
            })}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        {article.ifcCorroborated ? (
          <span
            className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.bg} ${badge.text}`}
          >
            {article.matchConfidence}%
          </span>
        ) : (
          <span className="text-[9px] text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}

function AdditionRow({ article }: { article: AdditionArticle }) {
  return (
    <tr className="border-b border-blue-50 hover:bg-blue-50/30">
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-100 text-blue-700 rounded">
            ADIÇÃO
          </span>
          <span className="font-mono text-blue-600">{article.articleCode}</span>
        </span>
      </td>
      <td className="px-3 py-2 text-gray-800 max-w-[300px]">
        <div className="truncate" title={article.description}>
          {article.description}
        </div>
        {article.priceCode && (
          <span className="text-[9px] text-gray-400 font-mono">{article.priceCode}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-blue-700 whitespace-nowrap">
        {formatQty(article.ifcQuantity, article.unit)}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {article.estimatedCost ? (
          <span className="text-blue-700 font-medium">
            {formatEur(article.estimatedCost)}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-gray-500">
        {article.ifcElementIds.length}
      </td>
    </tr>
  );
}

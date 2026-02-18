"use client";

/**
 * BOQ Diff Panel — displays the comparison between an uploaded BOQ
 * (Mapa de Quantidades) and the generated WBS from analysis findings.
 *
 * Shows: matched items, missing items, quantity mismatches, extra items,
 * cost impact summary, and completeness percentage.
 */

import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import type { BoqDiffResult, DiffItem, DiffStatus } from "@/lib/boq-diff";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpDown,
  Euro,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  Info,
} from "lucide-react";

interface BoqDiffPanelProps {
  diffResult: BoqDiffResult;
}

type FilterTab = "all" | "missing" | "mismatch" | "extra" | "matched";

const STATUS_CONFIG: Record<
  DiffStatus,
  { bgClass: string; textClass: string; label: string; labelEn: string }
> = {
  matched: {
    bgClass: "bg-green-50 border-green-200",
    textClass: "text-green-700",
    label: "Conforme",
    labelEn: "Matched",
  },
  quantity_mismatch: {
    bgClass: "bg-amber-50 border-amber-200",
    textClass: "text-amber-700",
    label: "Qtd. divergente",
    labelEn: "Qty mismatch",
  },
  missing_in_boq: {
    bgClass: "bg-red-50 border-red-200",
    textClass: "text-red-700",
    label: "Em falta no BOQ",
    labelEn: "Missing in BOQ",
  },
  missing_in_wbs: {
    bgClass: "bg-accent-light border-accent",
    textClass: "text-accent",
    label: "Extra no BOQ",
    labelEn: "Extra in BOQ",
  },
  unit_mismatch: {
    bgClass: "bg-orange-50 border-orange-200",
    textClass: "text-orange-700",
    label: "Unid. incompatível",
    labelEn: "Unit mismatch",
  },
  new_required: {
    bgClass: "bg-red-50 border-red-300",
    textClass: "text-red-800",
    label: "Regulamentar obrigatório",
    labelEn: "Regulatory required",
  },
};

function formatEur(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
}

export default function BoqDiffPanel({ diffResult }: BoqDiffPanelProps) {
  const { lang } = useI18n();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const s = diffResult.summary;

  const txt = {
    title: lang === "pt" ? "Comparação BOQ vs. WBS" : "BOQ vs. WBS Comparison",
    boqItems: lang === "pt" ? "Artigos no BOQ" : "BOQ Items",
    wbsItems: lang === "pt" ? "Artigos no WBS" : "WBS Items",
    matched: lang === "pt" ? "Correspondidos" : "Matched",
    missing: lang === "pt" ? "Em falta" : "Missing",
    mismatches: lang === "pt" ? "Divergências" : "Mismatches",
    extra: lang === "pt" ? "Extra" : "Extra",
    all: lang === "pt" ? "Todos" : "All",
    completeness: lang === "pt" ? "Completude do BOQ" : "BOQ Completeness",
    boqTotal: lang === "pt" ? "Custo total BOQ" : "BOQ Total Cost",
    missingCost: lang === "pt" ? "Custo estimado em falta" : "Estimated Missing Cost",
    totalEstimated: lang === "pt" ? "Custo total estimado" : "Estimated Total Cost",
    exportReport: lang === "pt" ? "Exportar Relatório" : "Export Report",
    boqLabel: lang === "pt" ? "BOQ" : "BOQ",
    wbsLabel: lang === "pt" ? "WBS" : "WBS",
    qty: lang === "pt" ? "Qtd" : "Qty",
    costImpact: lang === "pt" ? "Impacto" : "Impact",
    confidence: lang === "pt" ? "Confiança" : "Confidence",
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    switch (filterTab) {
      case "missing":
        return diffResult.missingInBoq;
      case "mismatch":
        return diffResult.quantityMismatches;
      case "extra":
        return diffResult.extraInBoq;
      case "matched":
        return diffResult.matched;
      default:
        return diffResult.items;
    }
  }, [filterTab, diffResult]);

  const handleExport = () => {
    import("@/lib/boq-diff").then(({ formatDiffReport }) => {
      const report = formatDiffReport(diffResult);
      const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "boq-diff-report.txt";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label={txt.completeness}
          value={`${s.completenessPercent}%`}
          color={s.completenessPercent >= 80 ? "green" : s.completenessPercent >= 50 ? "amber" : "red"}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <SummaryCard
          label={txt.boqTotal}
          value={formatEur(s.boqTotalCost)}
          color="blue"
          icon={<Euro className="w-4 h-4" />}
        />
        <SummaryCard
          label={txt.missingCost}
          value={formatEur(s.missingCostEstimate)}
          color="red"
          icon={<XCircle className="w-4 h-4" />}
        />
        <SummaryCard
          label={txt.totalEstimated}
          value={formatEur(s.estimatedTotalCost)}
          color="purple"
          icon={<Euro className="w-4 h-4" />}
        />
      </div>

      {/* Completeness bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>{txt.boqItems}: {s.totalBoqItems} | {txt.wbsItems}: {s.totalWbsItems}</span>
          <span>{s.matchedCount + s.mismatchCount}/{s.matchedCount + s.mismatchCount + s.missingCount} {txt.matched}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
          {s.matchedCount > 0 && (
            <div
              className="bg-green-500"
              style={{ width: `${(s.matchedCount / Math.max(1, diffResult.items.length)) * 100}%` }}
              title={`${s.matchedCount} ${txt.matched}`}
            />
          )}
          {s.mismatchCount > 0 && (
            <div
              className="bg-amber-500"
              style={{ width: `${(s.mismatchCount / Math.max(1, diffResult.items.length)) * 100}%` }}
              title={`${s.mismatchCount} ${txt.mismatches}`}
            />
          )}
          {s.missingCount > 0 && (
            <div
              className="bg-red-500"
              style={{ width: `${(s.missingCount / Math.max(1, diffResult.items.length)) * 100}%` }}
              title={`${s.missingCount} ${txt.missing}`}
            />
          )}
          {s.extraCount > 0 && (
            <div
              className="bg-accent"
              style={{ width: `${(s.extraCount / Math.max(1, diffResult.items.length)) * 100}%` }}
              title={`${s.extraCount} ${txt.extra}`}
            />
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        {(
          [
            { key: "all", label: txt.all, count: diffResult.items.length },
            { key: "missing", label: txt.missing, count: s.missingCount },
            { key: "mismatch", label: txt.mismatches, count: s.mismatchCount },
            { key: "extra", label: txt.extra, count: s.extraCount },
            { key: "matched", label: txt.matched, count: s.matchedCount },
          ] as const
        ).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterTab(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterTab === key
                ? "bg-accent text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {filteredItems.map((item, idx) => (
          <DiffItemCard
            key={idx}
            item={item}
            lang={lang}
            isExpanded={expandedIdx === idx}
            onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          />
        ))}
        {filteredItems.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">
            {lang === "pt" ? "Nenhum item nesta categoria." : "No items in this category."}
          </p>
        )}
      </div>

      {/* Warnings */}
      {diffResult.warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          {diffResult.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Export */}
      <button
        onClick={handleExport}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
      >
        <Download className="w-4 h-4" />
        {txt.exportReport}
      </button>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    blue: "bg-accent-light border-accent text-accent",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color] ?? "bg-gray-50 border-gray-200 text-gray-700"}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
        {icon}
        {label}
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function DiffItemCard({
  item,
  lang,
  isExpanded,
  onToggle,
}: {
  item: DiffItem;
  lang: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = STATUS_CONFIG[item.status];

  return (
    <div className={`rounded-lg border ${config.bgClass}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 flex items-start justify-between gap-2 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.textClass} bg-white/50`}>
              {lang === "pt" ? config.label : config.labelEn}
            </span>
            {item.isRegulatoryRequired && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                {lang === "pt" ? "Regulamentar" : "Regulatory"}
              </span>
            )}
            {item.wbsArticle?.code && (
              <code className="text-xs font-mono text-gray-500">{item.wbsArticle.code}</code>
            )}
          </div>
          <p className="text-sm text-gray-800 mt-1 truncate">{item.description}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {item.costImpact !== undefined && item.costImpact !== 0 && (
            <span className={`text-xs font-medium ${
              item.costImpact > 0 ? "text-red-600" : "text-green-600"
            }`}>
              {item.costImpact > 0 ? "+" : ""}{formatEur(item.costImpact)}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-gray-200/50 pt-2 space-y-2">
          {/* Quantities comparison */}
          {(item.boqItem || item.wbsArticle) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {item.boqItem && (
                <div className="bg-white/50 rounded p-2">
                  <p className="font-medium text-gray-600 mb-1">BOQ</p>
                  <p>{item.boqItem.quantity} {item.boqItem.unit}</p>
                  <p className="text-gray-500">{formatEur(item.boqItem.totalPrice)}</p>
                </div>
              )}
              {item.wbsArticle && (
                <div className="bg-white/50 rounded p-2">
                  <p className="font-medium text-gray-600 mb-1">WBS</p>
                  <p>{item.wbsArticle.quantity} {item.wbsArticle.unit}</p>
                  {item.wbsArticle.unitPrice && (
                    <p className="text-gray-500">
                      {formatEur(item.wbsArticle.quantity * item.wbsArticle.unitPrice)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quantity delta */}
          {item.quantityDelta !== undefined && item.quantityDelta !== 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <ArrowUpDown className="w-3 h-3" />
              <span>
                {lang === "pt" ? "Diferença" : "Delta"}: {item.quantityDelta > 0 ? "+" : ""}
                {item.quantityDelta.toFixed(2)} {item.wbsArticle?.unit ?? item.boqItem?.unit ?? ""}
              </span>
            </div>
          )}

          {/* Confidence */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Info className="w-3 h-3" />
            {lang === "pt" ? "Confiança" : "Confidence"}: {Math.round(item.matchConfidence * 100)}%
          </div>

          {/* Recommendation */}
          <div className="p-2 bg-white/60 rounded text-xs text-gray-700">
            {item.recommendation}
          </div>
        </div>
      )}
    </div>
  );
}

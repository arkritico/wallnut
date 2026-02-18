"use client";

/**
 * Ingestion Dashboard — Overview of all regulation ingestion activity
 * across specialty plugins.
 *
 * Features:
 * - Summary cards: total regulations, rules extracted, pending, verified
 * - Per-plugin breakdown with ingestion status
 * - Filterable list of all regulation documents
 * - Quick actions: start ingestion, verify rules
 * - Color-coded ingestion status indicators
 */

import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import type {
  SpecialtyPlugin,
  RegulationDocument,
  IngestionStatus,
} from "@/lib/plugins/types";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Layers,
  ArrowRight,
  BarChart3,
  Package,
  Sparkles,
  X,
} from "lucide-react";
import AIRegulationIngestion from "./AIRegulationIngestion";

// ============================================================
// Types
// ============================================================

interface IngestionDashboardProps {
  /** All loaded specialty plugins */
  plugins: SpecialtyPlugin[];
  /** Called when user wants to start ingestion for a plugin */
  onStartIngestion?: (pluginId: string) => void;
  /** Called when user wants to view/edit a regulation's rules */
  onViewRules?: (pluginId: string, regulationId: string) => void;
}

type StatusFilter = "all" | IngestionStatus;

// ============================================================
// Constants
// ============================================================

const STATUS_CONFIG: Record<
  IngestionStatus,
  { label: string; labelEn: string; icon: typeof Clock; color: string; bg: string }
> = {
  pending: {
    label: "Pendente",
    labelEn: "Pending",
    icon: Clock,
    color: "text-gray-600",
    bg: "bg-gray-100",
  },
  partial: {
    label: "Parcial",
    labelEn: "Partial",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  complete: {
    label: "Completo",
    labelEn: "Complete",
    icon: CheckCircle2,
    color: "text-accent",
    bg: "bg-accent-light",
  },
  verified: {
    label: "Verificado",
    labelEn: "Verified",
    icon: ShieldCheck,
    color: "text-green-600",
    bg: "bg-green-50",
  },
};

// ============================================================
// Component
// ============================================================

export default function IngestionDashboard({
  plugins,
  onStartIngestion,
  onViewRules,
}: IngestionDashboardProps) {
  const { lang } = useI18n();
  const pt = lang === "pt";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [showAIIngestion, setShowAIIngestion] = useState(false);

  // ---- Compute aggregate stats ----
  const stats = useMemo(() => {
    let totalRegs = 0;
    let totalRules = 0;
    let pending = 0;
    let partial = 0;
    let complete = 0;
    let verified = 0;

    for (const plugin of plugins) {
      for (const reg of plugin.regulations) {
        totalRegs++;
        totalRules += reg.rulesCount;
        switch (reg.ingestionStatus) {
          case "pending":
            pending++;
            break;
          case "partial":
            partial++;
            break;
          case "complete":
            complete++;
            break;
          case "verified":
            verified++;
            break;
        }
      }
    }

    return { totalRegs, totalRules, pending, partial, complete, verified };
  }, [plugins]);

  // ---- Filter regulations across all plugins ----
  const filteredRegulations = useMemo(() => {
    const results: {
      pluginId: string;
      pluginName: string;
      regulation: RegulationDocument;
    }[] = [];

    const query = searchQuery.toLowerCase();

    for (const plugin of plugins) {
      for (const reg of plugin.regulations) {
        if (statusFilter !== "all" && reg.ingestionStatus !== statusFilter) {
          continue;
        }
        if (
          query &&
          !reg.title.toLowerCase().includes(query) &&
          !reg.shortRef.toLowerCase().includes(query) &&
          !reg.id.toLowerCase().includes(query) &&
          !(reg.tags ?? []).some((t) => t.toLowerCase().includes(query))
        ) {
          continue;
        }
        results.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          regulation: reg,
        });
      }
    }

    return results;
  }, [plugins, statusFilter, searchQuery]);

  // ---- Per-plugin summaries ----
  const pluginSummaries = useMemo(() => {
    return plugins.map((plugin) => {
      const regs = plugin.regulations;
      const counts: Record<IngestionStatus, number> = {
        pending: 0,
        partial: 0,
        complete: 0,
        verified: 0,
      };
      for (const reg of regs) {
        counts[reg.ingestionStatus]++;
      }
      const totalRules = regs.reduce((sum, r) => sum + r.rulesCount, 0);
      const pct =
        regs.length > 0
          ? Math.round(((counts.complete + counts.verified) / regs.length) * 100)
          : 0;
      return { plugin, counts, totalRules, completionPct: pct };
    });
  }, [plugins]);

  // ---- Handle AI-extracted rules ----
  const handleRulesExtracted = async (rules: any[]) => {
    if (!rules.length) return;
    const pluginId = rules[0]?.suggestedPlugin || "general";
    try {
      const res = await fetch("/api/merge-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginId, rules }),
      });
      const result = await res.json();
      if (result.success) {
        alert(`${result.added} regra(s) adicionada(s) ao plugin "${pluginId}", ${result.skipped} duplicada(s) ignorada(s). Total: ${result.total}`);
      } else {
        alert(`Erro ao fundir regras: ${result.error}`);
      }
    } catch (err) {
      console.error("Merge rules error:", err);
      alert("Erro ao fundir regras. Verifique a consola.");
    }
  };

  // ---- Collect all existing rules for conflict detection ----
  const allExistingRules = useMemo(() => {
    const rules: any[] = [];
    for (const plugin of plugins) {
      // This would need to be implemented based on your plugin structure
      // For now, return empty array
    }
    return rules;
  }, [plugins]);

  return (
    <div className="space-y-6">
      {/* ---- AI Ingestion Call-to-Action ---- */}
      {!showAIIngestion && (
        <div className="bg-gradient-to-r from-[#4d65ff] via-purple-500 to-pink-500 rounded-xl p-[2px] shadow-lg">
          <div className="bg-white rounded-[10px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#4d65ff] to-purple-600 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    🤖 {pt ? "Ingestão Semi-Automática com AI" : "AI-Powered Semi-Automatic Ingestion"}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {pt
                      ? "Cole o texto de um regulamento (DL, Portaria, etc.) e a AI extrai automaticamente as regras quantitativas."
                      : "Paste regulation text (DL, Ordinance, etc.) and AI automatically extracts quantitative rules."}
                  </p>
                  <ul className="text-xs text-gray-500 space-y-1">
                    <li>✅ {pt ? "Extração automática de valores, fórmulas e tabelas" : "Automatic extraction of values, formulas, and tables"}</li>
                    <li>✅ {pt ? "Validação e classificação inteligente" : "Smart validation and classification"}</li>
                    <li>✅ {pt ? "Detecção de conflitos com regras existentes" : "Conflict detection with existing rules"}</li>
                  </ul>
                </div>
              </div>
              <button
                onClick={() => setShowAIIngestion(true)}
                className="flex-shrink-0 px-6 py-3 bg-gradient-to-r from-[#4d65ff] to-purple-600 text-white rounded-lg hover:from-[#3a4fdb] hover:to-purple-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium"
              >
                <Sparkles className="w-4 h-4" />
                {pt ? "Começar" : "Start"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- AI Ingestion Panel ---- */}
      {showAIIngestion && (
        <div className="bg-white rounded-xl border-2 border-purple-200 shadow-lg">
          <div className="px-6 py-4 border-b border-purple-100 flex items-center justify-between bg-gradient-to-r from-accent-light to-purple-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4d65ff] to-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {pt ? "Ingestão com AI" : "AI Ingestion"}
              </h3>
            </div>
            <button
              onClick={() => setShowAIIngestion(false)}
              className="p-1.5 hover:bg-white rounded-lg transition-colors"
              title={pt ? "Fechar" : "Close"}
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="p-6">
            <AIRegulationIngestion
              onRulesExtracted={handleRulesExtracted}
              existingRules={allExistingRules}
              availablePlugins={plugins.map((p) => p.id)}
            />
          </div>
        </div>
      )}

      {/* ---- Summary Cards ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={BookOpen}
          label={pt ? "Regulamentos" : "Regulations"}
          value={stats.totalRegs}
          color="text-accent"
          bg="bg-accent-light"
        />
        <SummaryCard
          icon={Layers}
          label={pt ? "Regras Extraídas" : "Rules Extracted"}
          value={stats.totalRules}
          color="text-green-600"
          bg="bg-green-50"
        />
        <SummaryCard
          icon={Clock}
          label={pt ? "Pendentes" : "Pending"}
          value={stats.pending + stats.partial}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <SummaryCard
          icon={ShieldCheck}
          label={pt ? "Verificados" : "Verified"}
          value={stats.verified}
          color="text-green-600"
          bg="bg-green-50"
        />
      </div>

      {/* ---- Progress Bar ---- */}
      {stats.totalRegs > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {pt ? "Progresso Global de Ingestão" : "Overall Ingestion Progress"}
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(
                ((stats.complete + stats.verified) / stats.totalRegs) * 100,
              )}
              %
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
            {stats.verified > 0 && (
              <div
                className="bg-green-500 h-full transition-all"
                style={{
                  width: `${(stats.verified / stats.totalRegs) * 100}%`,
                }}
              />
            )}
            {stats.complete > 0 && (
              <div
                className="bg-accent h-full transition-all"
                style={{
                  width: `${(stats.complete / stats.totalRegs) * 100}%`,
                }}
              />
            )}
            {stats.partial > 0 && (
              <div
                className="bg-amber-400 h-full transition-all"
                style={{
                  width: `${(stats.partial / stats.totalRegs) * 100}%`,
                }}
              />
            )}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {pt ? "Verificado" : "Verified"} ({stats.verified})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent" />
              {pt ? "Completo" : "Complete"} ({stats.complete})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {pt ? "Parcial" : "Partial"} ({stats.partial})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              {pt ? "Pendente" : "Pending"} ({stats.pending})
            </span>
          </div>
        </div>
      )}

      {/* ---- Per-Plugin Breakdown ---- */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" />
            {pt ? "Por Especialidade" : "By Specialty"}
          </h3>
        </div>
        <div className="divide-y divide-gray-100">
          {pluginSummaries.map(({ plugin, counts, totalRules, completionPct }) => (
            <div key={plugin.id}>
              <button
                type="button"
                onClick={() =>
                  setExpandedPlugin(
                    expandedPlugin === plugin.id ? null : plugin.id,
                  )
                }
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-light flex items-center justify-center">
                    <span className="text-xs font-bold text-accent">
                      {plugin.id.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {plugin.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {plugin.regulations.length}{" "}
                      {pt ? "regulamentos" : "regulations"} · {totalRules}{" "}
                      {pt ? "regras" : "rules"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Mini status pills */}
                  <div className="hidden md:flex gap-1">
                    {(
                      Object.entries(counts) as [IngestionStatus, number][]
                    ).map(
                      ([status, count]) =>
                        count > 0 && (
                          <span
                            key={status}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].color}`}
                          >
                            {count} {STATUS_CONFIG[status].label}
                          </span>
                        ),
                    )}
                  </div>
                  {/* Completion bar */}
                  <div className="w-16 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">
                    {completionPct}%
                  </span>
                  {expandedPlugin === plugin.id ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded: regulation list for this plugin */}
              {expandedPlugin === plugin.id && (
                <div className="px-5 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                  <div className="space-y-2">
                    {plugin.regulations.map((reg) => {
                      const sc = STATUS_CONFIG[reg.ingestionStatus];
                      const Icon = sc.icon;
                      return (
                        <div
                          key={reg.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-gray-200"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`flex-shrink-0 w-7 h-7 rounded-full ${sc.bg} flex items-center justify-center`}
                            >
                              <Icon className={`w-3.5 h-3.5 ${sc.color}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-800 truncate">
                                {reg.shortRef}
                              </div>
                              <div className="text-[10px] text-gray-500 truncate">
                                {reg.title}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${sc.bg} ${sc.color}`}
                            >
                              {pt ? sc.label : sc.labelEn}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {reg.rulesCount}{" "}
                              {pt ? "regras" : "rules"}
                            </span>
                            {onViewRules && reg.rulesCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onViewRules(plugin.id, reg.id)
                                }
                                className="p-1 text-gray-400 hover:text-accent"
                                title={pt ? "Ver regras" : "View rules"}
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {onStartIngestion && (
                    <button
                      type="button"
                      onClick={() => onStartIngestion(plugin.id)}
                      className="mt-3 flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover font-medium"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {pt
                        ? "Adicionar regulamento a esta especialidade"
                        : "Add regulation to this specialty"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ---- Search & Filter ---- */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            {pt ? "Todos os Regulamentos" : "All Regulations"}
          </h3>
        </div>

        {/* Search + Filter bar */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                pt
                  ? "Pesquisar por título, referência, ID..."
                  : "Search by title, reference, ID..."
              }
              className="input-field pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-400" />
            {(["all", "pending", "partial", "complete", "verified"] as const).map(
              (filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    statusFilter === filter
                      ? "bg-accent-light border-accent text-accent font-medium"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {filter === "all"
                    ? pt
                      ? "Todos"
                      : "All"
                    : pt
                      ? STATUS_CONFIG[filter].label
                      : STATUS_CONFIG[filter].labelEn}
                  {filter !== "all" && (
                    <span className="ml-1 text-[10px] opacity-70">
                      (
                      {filter === "pending"
                        ? stats.pending
                        : filter === "partial"
                          ? stats.partial
                          : filter === "complete"
                            ? stats.complete
                            : stats.verified}
                      )
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Regulations list */}
        <div className="divide-y divide-gray-100">
          {filteredRegulations.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              {searchQuery || statusFilter !== "all"
                ? pt
                  ? "Nenhum regulamento corresponde aos filtros"
                  : "No regulations match the filters"
                : pt
                  ? "Nenhum regulamento registado"
                  : "No regulations registered"}
            </div>
          ) : (
            filteredRegulations.map(({ pluginId, pluginName, regulation: reg }) => {
              const sc = STATUS_CONFIG[reg.ingestionStatus];
              const Icon = sc.icon;
              return (
                <div
                  key={`${pluginId}-${reg.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full ${sc.bg} flex items-center justify-center`}
                    >
                      <Icon className={`w-4 h-4 ${sc.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {reg.shortRef}
                        </span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {pluginName}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {reg.title}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${sc.bg} ${sc.color} font-medium`}
                    >
                      {pt ? sc.label : sc.labelEn}
                    </span>
                    <span className="text-xs text-gray-400 w-16 text-right">
                      {reg.rulesCount} {pt ? "regras" : "rules"}
                    </span>
                    {reg.legalForce === "normative" && (
                      <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">
                        {pt ? "Norma" : "Standard"}
                      </span>
                    )}
                    {onViewRules && reg.rulesCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onViewRules(pluginId, reg.id)}
                        className="p-1.5 text-gray-400 hover:text-accent transition-colors"
                        title={pt ? "Ver regras" : "View rules"}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer count */}
        {filteredRegulations.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
            {pt
              ? `${filteredRegulations.length} regulamento(s) encontrado(s)`
              : `${filteredRegulations.length} regulation(s) found`}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SummaryCard — Stats card
// ============================================================

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}
        >
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { I18nContext, getTranslations, type Language } from "@/lib/i18n";
import { getSettings, saveSettings } from "@/lib/storage";
import { getAvailablePlugins } from "@/lib/plugins/loader";
import type { SpecialtyPlugin, RegulationDocument, DeclarativeRule } from "@/lib/plugins/types";
import type { Severity } from "@/lib/types";
import RegulamentosHeader from "./RegulamentosHeader";
import RegulamentosSidebar from "./RegulamentosSidebar";
import RegulamentosDetail from "./RegulamentosDetail";
import CrossSpecialtyDetail from "./detail/CrossSpecialtyDetail";
import IngestionPanel from "@/components/IngestionPanel";
import { X } from "lucide-react";

const RegulationGraph = dynamic(() => import("@/components/RegulationGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400">
      A carregar grafo 3D...
    </div>
  ),
});

// ============================================================
// Types
// ============================================================

type SeverityFilter = "all" | Severity;
type ViewMode = "list" | "graph";

// ============================================================
// Component
// ============================================================

export default function RegulamentosPage() {
  // ── i18n ──
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window === "undefined") return "pt";
    return getSettings().language;
  });
  const t = getTranslations(lang);

  function handleLanguageChange(newLang: Language) {
    setLang(newLang);
    saveSettings({ ...getSettings(), language: newLang });
  }

  // ── Data ──
  const plugins = useMemo(() => getAvailablePlugins(), []);

  // ── Selection ──
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<Set<string>>(new Set());
  const [selectedRegulationId, setSelectedRegulationId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const isMultiSelect = selectedSpecialtyIds.size >= 2;

  // ── View ──
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  // ── Ingestion ──
  const [ingestionPluginId, setIngestionPluginId] = useState<string | null>(null);

  // ── Derived data ──
  const selectedSpecialtyId = selectedSpecialtyIds.size === 1 ? [...selectedSpecialtyIds][0] : null;

  const selectedPlugin = useMemo(
    () => (selectedSpecialtyId ? plugins.find((p) => p.id === selectedSpecialtyId) ?? null : null),
    [plugins, selectedSpecialtyId],
  );

  const selectedRegulation = useMemo(() => {
    if (!selectedPlugin || !selectedRegulationId) return null;
    return selectedPlugin.regulations.find((r) => r.id === selectedRegulationId) ?? null;
  }, [selectedPlugin, selectedRegulationId]);

  const selectedRule = useMemo(() => {
    if (!selectedPlugin || !selectedRuleId) return null;
    return selectedPlugin.rules.find((r) => r.id === selectedRuleId) ?? null;
  }, [selectedPlugin, selectedRuleId]);

  // ── Handlers ──

  // Sidebar single-select (for drill-down navigation)
  const handleSelectSpecialty = useCallback((id: string | null) => {
    setSelectedSpecialtyIds(id ? new Set([id]) : new Set());
    setSelectedRegulationId(null);
    setSelectedRuleId(null);
  }, []);

  // Header chip toggle (for multi-select AND filtering)
  const handleToggleSpecialty = useCallback((id: string) => {
    setSelectedSpecialtyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedRegulationId(null);
    setSelectedRuleId(null);
  }, []);

  const handleClearSpecialties = useCallback(() => {
    setSelectedSpecialtyIds(new Set());
    setSelectedRegulationId(null);
    setSelectedRuleId(null);
  }, []);

  const handleSelectRegulation = useCallback((specialtyId: string, regulationId: string | null) => {
    setSelectedSpecialtyIds(new Set([specialtyId]));
    setSelectedRegulationId(regulationId);
    setSelectedRuleId(null);
  }, []);

  const handleSelectRule = useCallback((specialtyId: string, regulationId: string, ruleId: string | null) => {
    setSelectedSpecialtyIds(new Set([specialtyId]));
    setSelectedRegulationId(regulationId);
    setSelectedRuleId(ruleId);
  }, []);

  const handleAddRegulation = useCallback(() => {
    setIngestionPluginId(selectedSpecialtyId ?? plugins[0]?.id ?? null);
  }, [selectedSpecialtyId, plugins]);

  const handleIngestionComplete = useCallback(
    async (regulation: RegulationDocument, rules: DeclarativeRule[]) => {
      try {
        const res = await fetch("/api/merge-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pluginId: ingestionPluginId,
            regulationId: regulation.id,
            rules,
          }),
        });
        const result = await res.json();
        if (result.success) {
          alert(
            `${result.added} regra(s) de ${regulation.shortRef} adicionadas ao plugin. ${result.skipped} duplicada(s) ignorada(s).`,
          );
        } else {
          alert(`Erro: ${result.error}`);
        }
      } catch (err) {
        console.error("Merge error:", err);
        alert("Erro ao fundir regras.");
      }
      setIngestionPluginId(null);
    },
    [ingestionPluginId],
  );

  return (
    <I18nContext.Provider value={{ lang, t, setLang: handleLanguageChange }}>
      <div className="h-screen flex flex-col bg-gray-50">
        <RegulamentosHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          severityFilter={severityFilter}
          onSeverityFilterChange={setSeverityFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onAddRegulation={handleAddRegulation}
          plugins={plugins}
          selectedSpecialtyIds={selectedSpecialtyIds}
          onToggleSpecialty={handleToggleSpecialty}
          onClearSpecialties={handleClearSpecialties}
        />

        <div className="flex flex-1 overflow-hidden">
          <RegulamentosSidebar
            plugins={plugins}
            searchQuery={searchQuery}
            severityFilter={severityFilter}
            selectedSpecialtyId={selectedSpecialtyId}
            selectedRegulationId={selectedRegulationId}
            selectedRuleId={selectedRuleId}
            onSelectSpecialty={handleSelectSpecialty}
            onSelectRegulation={handleSelectRegulation}
            onSelectRule={handleSelectRule}
            selectedSpecialtyIds={selectedSpecialtyIds}
            isMultiSelect={isMultiSelect}
          />

          <main className={`flex-1 overflow-hidden ${viewMode === "graph" ? "bg-gray-900" : ""}`}>
            {viewMode === "list" ? (
              <div className="h-full overflow-y-auto">
                {isMultiSelect ? (
                  <CrossSpecialtyDetail
                    plugins={plugins}
                    selectedSpecialtyIds={selectedSpecialtyIds}
                    severityFilter={severityFilter}
                    searchQuery={searchQuery}
                  />
                ) : (
                  <RegulamentosDetail
                    plugins={plugins}
                    selectedPlugin={selectedPlugin}
                    selectedRegulation={selectedRegulation}
                    selectedRule={selectedRule}
                    selectedSpecialtyId={selectedSpecialtyId}
                    selectedRegulationId={selectedRegulationId}
                    severityFilter={severityFilter}
                    searchQuery={searchQuery}
                    onSelectSpecialty={handleSelectSpecialty}
                    onSelectRegulation={handleSelectRegulation}
                    onSelectRule={handleSelectRule}
                    onStartIngestion={(pluginId) => setIngestionPluginId(pluginId)}
                  />
                )}
              </div>
            ) : (
              <RegulationGraph className="h-full" embedded />
            )}
          </main>
        </div>

        {/* Ingestion slide-over */}
        {ingestionPluginId && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setIngestionPluginId(null)}
            />
            <div className="relative w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-lg font-semibold text-gray-900">Adicionar Regulamento</h2>
                <button
                  onClick={() => setIngestionPluginId(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <IngestionPanel
                  targetPlugin={plugins.find((p) => p.id === ingestionPluginId)!}
                  onRulesReady={handleIngestionComplete}
                  onCancel={() => setIngestionPluginId(null)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </I18nContext.Provider>
  );
}

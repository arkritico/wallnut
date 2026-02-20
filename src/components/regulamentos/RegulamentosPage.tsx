"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { I18nContext, pt, en, type Language } from "@/lib/i18n";
import { getSettings, saveSettings } from "@/lib/storage";
import { getAvailablePlugins } from "@/lib/plugins/loader";
import type { SpecialtyPlugin, RegulationDocument, DeclarativeRule } from "@/lib/plugins/types";
import type { Severity } from "@/lib/types";
import RegulamentosHeader from "./RegulamentosHeader";
import RegulamentosSidebar from "./RegulamentosSidebar";
import RegulamentosDetail from "./RegulamentosDetail";
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

export interface BrowsePath {
  buildingType: string | null;
  buildingCategory: string | null;
  phase: string | null;
  system: string | null;
  specialty: string | null;
  subTopic: string | null;
  regulationId: string | null;
}

const DEFAULT_BROWSE: BrowsePath = {
  buildingType: null,
  buildingCategory: null,
  phase: null,
  system: null,
  specialty: null,
  subTopic: null,
  regulationId: null,
};

// ============================================================
// Component
// ============================================================

export default function RegulamentosPage() {
  // ── i18n ──
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window === "undefined") return "pt";
    return getSettings().language;
  });
  const t = lang === "pt" ? pt : en;

  function handleLanguageChange(newLang: Language) {
    setLang(newLang);
    saveSettings({ ...getSettings(), language: newLang });
  }

  // ── Data ──
  const plugins = useMemo(() => getAvailablePlugins(), []);

  // ── Selection ──
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string | null>(null);
  const [selectedRegulationId, setSelectedRegulationId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  // ── View ──
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  // ── Ingestion ──
  const [ingestionPluginId, setIngestionPluginId] = useState<string | null>(null);

  // ── Graph ──
  const [browsePath, setBrowsePath] = useState<BrowsePath>(DEFAULT_BROWSE);

  // ── Derived data ──
  const selectedPlugin = useMemo(
    () => plugins.find((p) => p.id === selectedSpecialtyId) ?? null,
    [plugins, selectedSpecialtyId],
  );

  const selectedRegulation = useMemo(() => {
    if (!selectedPlugin || !selectedRegulationId) return null;
    return selectedPlugin.regulations.find((r) => r.id === selectedRegulationId) ?? null;
  }, [selectedPlugin, selectedRegulationId]);

  const selectedRule = useMemo(() => {
    if (!selectedPlugin || !selectedRuleId) return null;
    for (const reg of selectedPlugin.regulations) {
      const rule = reg.rules?.find((r) => r.id === selectedRuleId);
      if (rule) return rule;
    }
    return null;
  }, [selectedPlugin, selectedRuleId]);

  // ── Handlers ──
  const handleSelectSpecialty = useCallback((id: string | null) => {
    setSelectedSpecialtyId(id);
    setSelectedRegulationId(null);
    setSelectedRuleId(null);
    if (id) {
      setBrowsePath((prev) => ({ ...prev, specialty: id, regulationId: null }));
    } else {
      setBrowsePath(DEFAULT_BROWSE);
    }
  }, []);

  const handleSelectRegulation = useCallback((specialtyId: string, regulationId: string | null) => {
    setSelectedSpecialtyId(specialtyId);
    setSelectedRegulationId(regulationId);
    setSelectedRuleId(null);
    setBrowsePath((prev) => ({ ...prev, specialty: specialtyId, regulationId }));
  }, []);

  const handleSelectRule = useCallback((specialtyId: string, regulationId: string, ruleId: string | null) => {
    setSelectedSpecialtyId(specialtyId);
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
          />

          <main className={`flex-1 overflow-hidden ${viewMode === "graph" ? "bg-gray-900" : ""}`}>
            {viewMode === "list" ? (
              <div className="h-full overflow-y-auto">
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
              </div>
            ) : (
              <RegulationGraph
                className="h-full"
                embedded
                externalBrowsePath={browsePath}
                onBrowsePathChange={setBrowsePath}
              />
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

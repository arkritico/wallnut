"use client";

import { Search, X, Plus, ChevronLeft, List, Box } from "lucide-react";
import Link from "next/link";
import type { SpecialtyPlugin } from "@/lib/plugins/types";
import type { Severity } from "@/lib/types";
import { SEVERITY_LABELS, SEVERITY_COLORS, SPECIALTY_NAMES } from "@/lib/regulation-constants";
import { SPECIALTY_COLORS } from "@/lib/regulation-graph";

type SeverityFilter = "all" | Severity;
type ViewMode = "list" | "graph";

interface RegulamentosHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  severityFilter: SeverityFilter;
  onSeverityFilterChange: (s: SeverityFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onAddRegulation: () => void;
  plugins: SpecialtyPlugin[];
  selectedSpecialtyIds: Set<string>;
  onToggleSpecialty: (id: string) => void;
  onClearSpecialties: () => void;
}

const SEVERITY_PILLS: SeverityFilter[] = ["all", "critical", "warning", "info", "pass"];

export default function RegulamentosHeader({
  searchQuery,
  onSearchChange,
  severityFilter,
  onSeverityFilterChange,
  viewMode,
  onViewModeChange,
  onAddRegulation,
  plugins,
  selectedSpecialtyIds,
  onToggleSpecialty,
  onClearSpecialties,
}: RegulamentosHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
      {/* Top row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Regulamentos</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Pesquisar regras, regulamentos..."
              className="w-72 pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => onViewModeChange("list")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <List className="w-4 h-4" />
              Lista
            </button>
            <button
              onClick={() => onViewModeChange("graph")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                viewMode === "graph"
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Box className="w-4 h-4" />
              Grafo 3D
            </button>
          </div>

          {/* Add regulation */}
          <button
            onClick={onAddRegulation}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Severity filter pills */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-gray-500 mr-1">Severidade:</span>
        {SEVERITY_PILLS.map((sev) => {
          const isActive = severityFilter === sev;
          return (
            <button
              key={sev}
              onClick={() => onSeverityFilterChange(sev)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                isActive
                  ? "text-white"
                  : "text-gray-600 bg-gray-100 hover:bg-gray-200"
              }`}
              style={isActive && sev !== "all" ? { backgroundColor: SEVERITY_COLORS[sev] } : isActive ? { backgroundColor: "#374151" } : undefined}
            >
              {SEVERITY_LABELS[sev]}
            </button>
          );
        })}
      </div>

      {/* Specialty filter chips */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Especialidades:</span>
        {selectedSpecialtyIds.size > 0 && (
          <button
            onClick={onClearSpecialties}
            className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Limpar
          </button>
        )}
        {plugins.map((plugin) => {
          const isActive = selectedSpecialtyIds.has(plugin.id);
          const color = SPECIALTY_COLORS[plugin.id] ?? "#6b7280";
          const name = SPECIALTY_NAMES[plugin.id] ?? plugin.name;
          return (
            <button
              key={plugin.id}
              onClick={() => onToggleSpecialty(plugin.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                isActive
                  ? "text-white shadow-sm"
                  : "text-gray-600 bg-gray-100 hover:bg-gray-200"
              }`}
              style={isActive ? { backgroundColor: color } : undefined}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: isActive ? "white" : color,
                  opacity: isActive ? 0.8 : 1,
                }}
              />
              {name}
            </button>
          );
        })}
      </div>

      {/* AND mode indicator */}
      {selectedSpecialtyIds.size >= 2 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5">
          <span className="font-medium">Modo AND:</span>
          <span>
            A mostrar regras que cruzam{" "}
            {[...selectedSpecialtyIds]
              .map((id) => SPECIALTY_NAMES[id] ?? id)
              .join(" + ")}
          </span>
        </div>
      )}
    </header>
  );
}

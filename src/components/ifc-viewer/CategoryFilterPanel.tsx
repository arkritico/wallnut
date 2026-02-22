"use client";

import { useState, useMemo } from "react";
import { Eye, EyeOff, Search, Crosshair } from "lucide-react";

// ============================================================
// Types
// ============================================================

export interface CategoryNode {
  name: string;        // e.g. "IfcWall"
  displayName: string; // e.g. "Paredes"
  count: number;
  localIds: Record<string, number[]>; // modelId → localIds
  visible: boolean;
}

interface CategoryFilterPanelProps {
  categories: CategoryNode[];
  onToggleCategory: (categoryName: string) => void;
  onIsolateCategory: (categoryName: string) => void;
  onShowAll: () => void;
}

// ============================================================
// IFC Category translations (EN → PT)
// ============================================================

const CATEGORY_TRANSLATIONS: Record<string, string> = {
  IfcWall: "Paredes",
  IfcWallStandardCase: "Paredes",
  IfcSlab: "Lajes",
  IfcDoor: "Portas",
  IfcWindow: "Janelas",
  IfcColumn: "Colunas",
  IfcBeam: "Vigas",
  IfcStair: "Escadas",
  IfcStairFlight: "Lanços de Escada",
  IfcRoof: "Coberturas",
  IfcRailing: "Guardas",
  IfcCovering: "Revestimentos",
  IfcFurnishingElement: "Mobiliário",
  IfcSpace: "Espaços",
  IfcBuildingElementProxy: "Elementos Genéricos",
  IfcPlate: "Placas",
  IfcMember: "Membros Estruturais",
  IfcCurtainWall: "Fachadas Cortina",
  IfcFooting: "Fundações",
  IfcPile: "Estacas",
  IfcFlowTerminal: "Terminais de Fluxo",
  IfcFlowSegment: "Segmentos de Fluxo",
  IfcOpeningElement: "Aberturas",
  IfcBuildingStorey: "Pisos",
  IfcBuilding: "Edifício",
  IfcSite: "Terreno",
  IfcDistributionElement: "Elementos de Distribuição",
  IfcFlowFitting: "Acessórios de Fluxo",
  IfcFlowController: "Controladores de Fluxo",
  IfcEnergyConversionDevice: "Conversores de Energia",
  IfcBuildingElementPart: "Partes de Elemento",
  IfcReinforcingBar: "Armaduras",
  IfcTendon: "Pré-esforço",
  IfcProxy: "Proxy",
};

export function translateCategoryName(name: string): string {
  return CATEGORY_TRANSLATIONS[name] ?? name.replace(/^Ifc/, "");
}

// ============================================================
// Component
// ============================================================

export default function CategoryFilterPanel({
  categories,
  onToggleCategory,
  onIsolateCategory,
  onShowAll,
}: CategoryFilterPanelProps) {
  const [filter, setFilter] = useState("");

  const filteredCategories = useMemo(() => {
    if (!filter.trim()) return categories;
    const lower = filter.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.displayName.toLowerCase().includes(lower),
    );
  }, [categories, filter]);

  const allVisible = categories.every((c) => c.visible);
  const noneVisible = categories.every((c) => !c.visible);
  const totalElements = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="absolute inset-x-0 bottom-0 md:bottom-auto md:inset-x-auto md:top-12 md:right-3 bg-white rounded-t-2xl md:rounded-lg shadow-lg border border-gray-200 w-full md:w-64 z-20 max-h-[55vh] md:max-h-none">
      {/* Drag handle (mobile) */}
      <div className="flex justify-center pt-2 pb-0 md:hidden">
        <div className="w-8 h-1 rounded-full bg-gray-300" />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Categorias
        </p>
        <span className="text-[10px] text-gray-400">
          {totalElements} elem.
        </span>
      </div>

      {/* Search filter */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar categorias..."
            className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 placeholder:text-gray-300"
          />
        </div>
      </div>

      {/* Category list */}
      <div className="max-h-64 overflow-y-auto p-2 space-y-0.5">
        {filteredCategories.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-2 py-3 text-center">
            Nenhuma categoria encontrada
          </p>
        ) : (
          filteredCategories.map((cat) => (
            <div
              key={cat.name}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 transition-colors group"
            >
              {/* Visibility checkbox */}
              <button
                onClick={() => onToggleCategory(cat.name)}
                className={`p-0.5 rounded transition-colors ${
                  cat.visible
                    ? "text-accent"
                    : "text-gray-300"
                }`}
                title={cat.visible ? "Ocultar" : "Mostrar"}
              >
                {cat.visible ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Category name */}
              <span
                className={`flex-1 text-xs truncate ${
                  cat.visible ? "text-gray-700" : "text-gray-400"
                }`}
                title={`${cat.displayName} (${cat.name})`}
              >
                {cat.displayName}
              </span>

              {/* Count */}
              <span className="text-[10px] text-gray-300 tabular-nums">
                {cat.count}
              </span>

              {/* Isolate button */}
              <button
                onClick={() => onIsolateCategory(cat.name)}
                className="p-0.5 rounded text-gray-300 hover:text-accent md:opacity-0 md:group-hover:opacity-100 transition-all"
                title="Isolar categoria"
              >
                <Crosshair className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-3">
        <button
          onClick={onShowAll}
          disabled={allVisible}
          className={`text-xs transition-colors ${
            allVisible
              ? "text-gray-300 cursor-not-allowed"
              : "text-gray-500 hover:text-accent"
          }`}
        >
          Mostrar todos
        </button>
        {!noneVisible && !allVisible && (
          <span className="text-[10px] text-gray-300">|</span>
        )}
        {!allVisible && (
          <span className="text-[10px] text-gray-400">
            {categories.filter((c) => c.visible).length}/{categories.length} visíveis
          </span>
        )}
      </div>
    </div>
  );
}

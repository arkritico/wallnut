"use client";

import { Eye, EyeOff, X, Maximize2 } from "lucide-react";
import type { FragmentsModel } from "@thatopen/fragments";

// ============================================================
// Types
// ============================================================

export interface LoadedModelInfo {
  model: FragmentsModel;
  name: string;
  categories: string[];
}

interface ModelManagerPanelProps {
  models: LoadedModelInfo[];
  visibility: Record<string, boolean>;
  onToggleVisibility: (modelId: string) => void;
  onRemoveModel: (modelId: string) => void;
  onFitAll: () => void;
}

// ============================================================
// Color badges for multi-model differentiation
// ============================================================

const MODEL_COLORS = [
  "#4D65FF", // Wallnut accent blue
  "#10B981", // emerald
  "#D97706", // amber
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
  "#6366F1", // indigo
];

// ============================================================
// Component
// ============================================================

export default function ModelManagerPanel({
  models,
  visibility,
  onToggleVisibility,
  onRemoveModel,
  onFitAll,
}: ModelManagerPanelProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 md:bottom-auto md:inset-x-auto md:top-12 md:right-3 bg-white rounded-t-2xl md:rounded-lg shadow-lg border border-gray-200 w-full md:w-64 z-20 max-h-[60vh] md:max-h-none">
      {/* Drag handle (mobile) */}
      <div className="flex justify-center pt-2 pb-0 md:hidden cursor-grab" data-drag-handle>
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Modelos ({models.length})
        </p>
      </div>

      {/* Model list */}
      <div className="max-h-48 overflow-y-auto p-2 space-y-1">
        {models.map((m, idx) => {
          const isVisible = visibility[m.model.modelId] !== false;
          const color = MODEL_COLORS[idx % MODEL_COLORS.length];

          return (
            <div
              key={m.model.modelId}
              className="flex items-center gap-2 px-2 py-2 sm:py-1.5 rounded hover:bg-gray-50 transition-colors group min-h-[44px] sm:min-h-0"
            >
              {/* Color badge */}
              <div
                className="w-3 h-3 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />

              {/* Model name */}
              <span
                className={`flex-1 text-sm sm:text-xs truncate ${isVisible ? "text-gray-700" : "text-gray-400 line-through"}`}
                title={m.name}
              >
                {m.name}
              </span>

              {/* Toggle visibility */}
              <button
                onClick={() => onToggleVisibility(m.model.modelId)}
                className={`p-1.5 sm:p-1 rounded transition-colors ${
                  isVisible
                    ? "text-gray-400 hover:text-gray-600"
                    : "text-gray-300 hover:text-gray-500"
                }`}
                title={isVisible ? "Ocultar modelo" : "Mostrar modelo"}
              >
                {isVisible ? (
                  <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                ) : (
                  <EyeOff className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                )}
              </button>

              {/* Remove model */}
              <button
                onClick={() => onRemoveModel(m.model.modelId)}
                className="p-1.5 sm:p-1 rounded text-gray-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all"
                title="Remover modelo"
              >
                <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
          );
        })}

        {models.length === 0 && (
          <p className="text-xs text-gray-400 italic px-2 py-3 text-center">
            Nenhum modelo carregado
          </p>
        )}
      </div>

      {/* Footer actions */}
      {models.length > 0 && (
        <div className="px-3 py-2 pb-safe border-t border-gray-100">
          <button
            onClick={onFitAll}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent transition-colors min-h-[44px] sm:min-h-0"
          >
            <Maximize2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
            Encaixar tudo
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";
import { Copy, Navigation, ChevronDown, ChevronRight, X } from "lucide-react";

// ============================================================
// Types
// ============================================================

export interface ElementProperties {
  localId: number;
  modelId: string;
  modelName: string;
  name: string;
  category: string;
  guid: string;
  storey?: string;
  attributes: Record<string, unknown>;
}

interface PropertiesPanelProps {
  element: ElementProperties | null;
  onFlyTo: (modelId: string, localId: number) => void;
  onClose: () => void;
}

// ============================================================
// IFC attribute name translations (EN → PT)
// ============================================================

const ATTR_TRANSLATIONS: Record<string, string> = {
  Name: "Nome",
  Description: "Descrição",
  ObjectType: "Tipo de Objeto",
  Tag: "Etiqueta",
  GlobalId: "GUID",
  OverallHeight: "Altura Total",
  OverallWidth: "Largura Total",
  OverallDepth: "Profundidade",
  NominalLength: "Comprimento Nominal",
  NominalWidth: "Largura Nominal",
  NominalHeight: "Altura Nominal",
  GrossArea: "Área Bruta",
  NetArea: "Área Líquida",
  GrossSideArea: "Área Lateral Bruta",
  NetSideArea: "Área Lateral Líquida",
  GrossVolume: "Volume Bruto",
  NetVolume: "Volume Líquido",
  GrossWeight: "Peso Bruto",
  NetWeight: "Peso Líquido",
  Width: "Largura",
  Height: "Altura",
  Length: "Comprimento",
  Depth: "Profundidade",
  Perimeter: "Perímetro",
  FireRating: "Resistência ao Fogo",
  LoadBearing: "Estrutural",
  IsExternal: "Exterior",
  ThermalTransmittance: "Transmitância Térmica",
  AcousticRating: "Isolamento Acústico",
  Reference: "Referência",
  Status: "Estado",
  Material: "Material",
};

const CATEGORY_TRANSLATIONS: Record<string, string> = {
  IfcWall: "Parede",
  IfcWallStandardCase: "Parede",
  IfcSlab: "Laje",
  IfcDoor: "Porta",
  IfcWindow: "Janela",
  IfcColumn: "Coluna",
  IfcBeam: "Viga",
  IfcStair: "Escada",
  IfcStairFlight: "Lanço de Escada",
  IfcRoof: "Cobertura",
  IfcRailing: "Guarda",
  IfcCovering: "Revestimento",
  IfcFurnishingElement: "Mobiliário",
  IfcSpace: "Espaço",
  IfcBuildingElementProxy: "Elemento Genérico",
  IfcPlate: "Placa",
  IfcMember: "Membro Estrutural",
  IfcCurtainWall: "Fachada Cortina",
  IfcFooting: "Fundação",
  IfcPile: "Estaca",
  IfcFlowTerminal: "Terminal de Fluxo",
  IfcFlowSegment: "Segmento de Fluxo",
  IfcOpeningElement: "Abertura",
};

// ============================================================
// Helpers
// ============================================================

function translateAttr(key: string): string {
  return ATTR_TRANSLATIONS[key] ?? key;
}

function translateCategory(cat: string): string {
  return CATEGORY_TRANSLATIONS[cat] ?? cat.replace(/^Ifc/, "");
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (typeof val === "number") {
    if (Number.isInteger(val)) return String(val);
    return val.toFixed(3);
  }
  if (typeof val === "object" && val !== null) {
    // Handle IFC value objects like { value: 4.5, type: 3 }
    const obj = val as Record<string, unknown>;
    if ("value" in obj) return formatValue(obj.value);
    return JSON.stringify(val);
  }
  return String(val);
}

/** Group attributes into sections for display */
function groupAttributes(attrs: Record<string, unknown>): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {
    "Dimensões": {},
    "Material": {},
    "Propriedades IFC": {},
  };

  const dimensionKeys = new Set([
    "Width", "Height", "Length", "Depth", "Perimeter",
    "OverallHeight", "OverallWidth", "OverallDepth",
    "NominalLength", "NominalWidth", "NominalHeight",
    "GrossArea", "NetArea", "GrossSideArea", "NetSideArea",
    "GrossVolume", "NetVolume", "GrossWeight", "NetWeight",
  ]);

  const materialKeys = new Set(["Material"]);

  const skipKeys = new Set([
    "Name", "Description", "GlobalId", "ObjectType", "Tag",
    "type", "expressID", "localId",
  ]);

  for (const [key, val] of Object.entries(attrs)) {
    if (skipKeys.has(key)) continue;
    if (val === null || val === undefined) continue;

    const formatted = formatValue(val);
    if (formatted === "—") continue;

    if (dimensionKeys.has(key)) {
      sections["Dimensões"][translateAttr(key)] = formatted;
    } else if (materialKeys.has(key)) {
      sections["Material"][translateAttr(key)] = formatted;
    } else {
      sections["Propriedades IFC"][translateAttr(key)] = formatted;
    }
  }

  // Remove empty sections
  for (const key of Object.keys(sections)) {
    if (Object.keys(sections[key]).length === 0) delete sections[key];
  }

  return sections;
}

// ============================================================
// Component
// ============================================================

export default function PropertiesPanel({
  element,
  onFlyTo,
  onClose,
}: PropertiesPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    "Geral": true,
    "Dimensões": true,
    "Material": true,
    "Propriedades IFC": false,
  });
  const [copied, setCopied] = useState(false);

  // Swipe-to-dismiss for mobile bottom sheet
  const dragStartY = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Only initiate drag from the handle area
    if (target.closest("[data-drag-handle]")) {
      dragStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleDragMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null || !panelRef.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) {
      panelRef.current.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const handleDragEnd = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null || !panelRef.current) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy > 80) {
      onClose();
    } else {
      panelRef.current.style.transform = "";
    }
  }, [onClose]);

  if (!element) {
    return (
      <div className="absolute inset-x-0 bottom-0 md:bottom-auto md:inset-x-auto md:top-12 md:right-3 bg-white rounded-t-2xl md:rounded-lg shadow-lg border border-gray-200 w-full md:w-72 z-20">
        <div className="flex justify-center pt-2 pb-0 md:hidden" data-drag-handle>
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Propriedades
          </p>
          <button onClick={onClose} className="p-2 md:p-0.5 text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center">
            <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>
        </div>
        <div className="px-3 py-6 text-center pb-safe">
          <p className="text-xs text-gray-400 italic">
            Clique num elemento para ver as propriedades
          </p>
        </div>
      </div>
    );
  }

  const sections = groupAttributes(element.attributes);

  function toggleSection(name: string) {
    setExpandedSections((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function handleCopyGuid() {
    navigator.clipboard.writeText(element!.guid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      ref={panelRef}
      className="absolute inset-x-0 bottom-0 md:bottom-auto md:inset-x-auto md:top-12 md:right-3 bg-white rounded-t-2xl md:rounded-lg shadow-lg border border-gray-200 w-full md:w-72 z-20 max-h-[60vh] md:max-h-none will-change-transform"
      onTouchStart={handleDragStart}
      onTouchMove={handleDragMove}
      onTouchEnd={handleDragEnd}
    >
      {/* Drag handle (mobile) */}
      <div className="flex justify-center pt-2 pb-0 md:hidden cursor-grab active:cursor-grabbing" data-drag-handle>
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Propriedades
        </p>
        <button onClick={onClose} className="p-2 md:p-0.5 text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center">
          <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
        </button>
      </div>

      {/* Element header */}
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <p className="text-[10px] text-accent font-medium uppercase tracking-wider">
          {translateCategory(element.category)}
        </p>
        <p className="text-sm font-medium text-gray-800 truncate" title={element.name}>
          {element.name}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="max-h-[400px] overflow-y-auto">
        {/* General section — always shown */}
        <div className="border-b border-gray-100">
          <button
            onClick={() => toggleSection("Geral")}
            className="flex items-center gap-1 w-full px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
          >
            {expandedSections["Geral"] ? (
              <ChevronDown className="w-3 h-3 text-gray-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-400" />
            )}
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Geral
            </span>
          </button>
          {expandedSections["Geral"] && (
            <div className="px-3 pb-2 space-y-1">
              <PropertyRow label="Categoria" value={element.category} />
              <PropertyRow label="Modelo" value={element.modelName} />
              {element.storey && <PropertyRow label="Piso" value={element.storey} />}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">GUID</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-600 font-mono truncate max-w-[140px]" title={element.guid}>
                    {element.guid}
                  </span>
                  <button
                    onClick={handleCopyGuid}
                    className="p-0.5 text-gray-300 hover:text-accent transition-colors"
                    title="Copiar GUID"
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                  {copied && (
                    <span className="text-[9px] text-accent">Copiado!</span>
                  )}
                </div>
              </div>
              <PropertyRow label="ID Local" value={String(element.localId)} />
            </div>
          )}
        </div>

        {/* Dynamic attribute sections */}
        {Object.entries(sections).map(([sectionName, attrs]) => (
          <div key={sectionName} className="border-b border-gray-100">
            <button
              onClick={() => toggleSection(sectionName)}
              className="flex items-center gap-1 w-full px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
            >
              {expandedSections[sectionName] ? (
                <ChevronDown className="w-3 h-3 text-gray-400" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-400" />
              )}
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {sectionName}
              </span>
              <span className="text-[9px] text-gray-300 ml-auto">
                {Object.keys(attrs).length}
              </span>
            </button>
            {expandedSections[sectionName] && (
              <div className="px-3 pb-2 space-y-1">
                {Object.entries(attrs).map(([key, val]) => (
                  <PropertyRow key={key} label={key} value={val} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 pb-safe border-t border-gray-100 flex items-center gap-2">
        <button
          onClick={() => onFlyTo(element.modelId, element.localId)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent transition-colors min-h-[44px] md:min-h-0"
        >
          <Navigation className="w-3.5 h-3.5 md:w-3 md:h-3" />
          Voar para elemento
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-[10px] text-gray-600 text-right truncate" title={value}>
        {value}
      </span>
    </div>
  );
}

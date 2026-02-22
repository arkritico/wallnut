import { useState } from "react";
import { Euro, MapPin, Building, ChevronUp, ChevronDown } from "lucide-react";
import { formatCost, type CostSummary, type CostLineItem } from "@/lib/cost-estimation";
import Section from "./Section";

const DONUT_COLORS = [
  "#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

function CostDonut({ areas }: { areas: { area: string; areaName: string; maxCost: number }[] }) {
  const total = areas.reduce((s, a) => s + a.maxCost, 0);
  if (total === 0) return null;

  const segments: { color: string; pct: number; label: string }[] = [];
  let cumulative = 0;
  for (let i = 0; i < areas.length; i++) {
    const pct = (areas[i].maxCost / total) * 100;
    segments.push({ color: DONUT_COLORS[i % DONUT_COLORS.length], pct, label: areas[i].areaName });
    cumulative += pct;
  }

  let gradientParts: string[] = [];
  let angle = 0;
  for (const seg of segments) {
    const end = angle + seg.pct;
    gradientParts.push(`${seg.color} ${angle.toFixed(1)}% ${end.toFixed(1)}%`);
    angle = end;
  }
  const gradient = `conic-gradient(${gradientParts.join(", ")})`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-28 h-28 rounded-full relative" style={{ background: gradient }}>
        <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-xs font-bold text-gray-700">{areas.length}</p>
            <p className="text-[9px] text-gray-500">áreas</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-0.5">
        {segments.slice(0, 5).map((seg, i) => (
          <div key={areas[i].area} className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="truncate max-w-[100px]">{seg.label}</span>
            <span className="text-gray-400 ml-auto">{seg.pct.toFixed(0)}%</span>
          </div>
        ))}
        {segments.length > 5 && (
          <p className="text-[9px] text-gray-400">+{segments.length - 5} mais</p>
        )}
      </div>
    </div>
  );
}

function PriceLineItemCard({ lineItem }: { lineItem: CostLineItem }) {
  const { workItem: wi, quantity, quantitySource, adjustedCost, breakdown } = lineItem;
  const confidenceColors = { high: "bg-green-100 text-green-700", medium: "bg-amber-100 text-amber-700", low: "bg-gray-100 text-gray-600" };
  const confidenceLabels = { high: "Alta", medium: "Media", low: "Baixa" };
  const sourceLabels = { measured: "medido", estimated: "estimado", minimum: "minimo" };
  const total = breakdown.materials + breakdown.labor + breakdown.machinery;
  return (
    <div className="p-3 bg-white rounded-lg border border-gray-200 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">{wi.code}</code>
            <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceColors[lineItem.confidence]}`}>
              {confidenceLabels[lineItem.confidence]}
            </span>
          </div>
          <p className="text-gray-800 mt-1">{wi.description}</p>
          <p className="text-xs text-gray-400 mt-0.5">{wi.chapter}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-gray-900">{formatCost(adjustedCost)}</p>
          <p className="text-xs text-gray-500">{quantity.toFixed(1)} {wi.unit} x {formatCost(wi.unitCost)}/{wi.unit}</p>
          <p className="text-xs text-gray-400">({sourceLabels[quantitySource]})</p>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-2">
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-accent" style={{ width: `${(breakdown.materials / total) * 100}%` }} title={`Materiais: ${formatCost(breakdown.materials)}`} />
            <div className="bg-orange-400" style={{ width: `${(breakdown.labor / total) * 100}%` }} title={`Mão-de-obra: ${formatCost(breakdown.labor)}`} />
            <div className="bg-gray-400" style={{ width: `${(breakdown.machinery / total) * 100}%` }} title={`Equipamento: ${formatCost(breakdown.machinery)}`} />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" /> Materiais {formatCost(breakdown.materials)}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Mão-de-obra {formatCost(breakdown.labor)}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Equip. {formatCost(breakdown.machinery)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CostEstimationPanel({ costSummary, open, onToggle }: {
  costSummary: CostSummary;
  open: boolean;
  onToggle: () => void;
}) {
  const [showCostDetails, setShowCostDetails] = useState(false);

  if (costSummary.estimates.length === 0) return null;

  return (
    <Section
      title={`Estimativa de Custos (${formatCost(costSummary.totalMinCost)} - ${formatCost(costSummary.totalMaxCost)})`}
      id="costs"
      icon={<Euro className="w-5 h-5 text-amber-600" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-6">
          {costSummary.byArea.length > 1 && (
            <CostDonut areas={costSummary.byArea} />
          )}
          <div className="grid grid-cols-2 gap-4 flex-1 w-full">
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 text-center">
              <Euro className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="text-xs text-amber-600">Mínimo Estimado</p>
              <p className="text-xl font-bold text-amber-800">{formatCost(costSummary.totalMinCost)}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4 border border-red-200 text-center">
              <Euro className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-xs text-red-600">Máximo Estimado</p>
              <p className="text-xl font-bold text-red-800">{formatCost(costSummary.totalMaxCost)}</p>
            </div>
          </div>
        </div>

        {(costSummary.locationFactor !== 1.0 || costSummary.typeFactor !== 1.0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {costSummary.locationFactor !== 1.0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-light text-accent rounded border border-accent">
                <MapPin className="w-3 h-3" /> Fator localização: {costSummary.locationFactor.toFixed(2)}
              </span>
            )}
            {costSummary.typeFactor !== 1.0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded border border-purple-200">
                <Building className="w-3 h-3" /> Fator tipología: {costSummary.typeFactor.toFixed(2)}
              </span>
            )}
          </div>
        )}

        {costSummary.byArea.map(area => (
          <div key={area.area} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 text-sm">{area.areaName}</span>
                <span className="text-xs text-gray-400">({area.count} {area.count === 1 ? "item" : "itens"})</span>
              </div>
              <span className="text-sm font-medium text-gray-700">{formatCost(area.minCost)} - {formatCost(area.maxCost)}</span>
            </div>
          </div>
        ))}

        {costSummary.lineItems.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowCostDetails(!showCostDetails)}
              className="text-sm text-accent hover:text-accent-hover font-medium flex items-center gap-1"
            >
              {showCostDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showCostDetails ? "Ocultar detalhes de preços" : `Ver detalhes de preços (${costSummary.lineItems.length} rubricas)`}
            </button>
            {showCostDetails && (
              <div className="mt-3 space-y-2">
                {costSummary.lineItems.map((li, idx) => (
                  <PriceLineItemCard key={`${li.workItem.code}-${idx}`} lineItem={li} />
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-gray-500">
          Valores de referência: <strong>geradordeprecos.info</strong> (Portugal 2024-2025).
          Custos reais variam conforme localização, acessibilidade e complexidade da obra.
        </p>
      </div>
    </Section>
  );
}

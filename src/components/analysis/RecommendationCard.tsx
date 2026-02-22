import type { Recommendation } from "@/lib/types";
import { Lightbulb } from "lucide-react";

export default function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const impactColors = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700", low: "bg-accent-medium text-accent" };
  const impactLabels = { high: "Alto Impacto", medium: "Impacto Médio", low: "Baixo Impacto" };
  return (
    <div className="p-4 rounded-lg border border-accent bg-accent-light">
      <div className="flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900">{recommendation.title}</h4>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${impactColors[recommendation.impact]}`}>
              {impactLabels[recommendation.impact]}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1">{recommendation.description}</p>
          {recommendation.estimatedSavings && (
            <p className="text-xs text-green-700 mt-2 font-medium">Poupança estimada: {recommendation.estimatedSavings}</p>
          )}
          {recommendation.regulatoryBasis && (
            <p className="text-xs text-gray-500 mt-1">Base regulamentar: {recommendation.regulatoryBasis}</p>
          )}
        </div>
      </div>
    </div>
  );
}

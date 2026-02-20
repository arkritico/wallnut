"use client";

import { useMemo } from "react";
import { FileText, Scale, CheckCircle2, Clock } from "lucide-react";
import type { SpecialtyPlugin } from "@/lib/plugins/types";
import { SPECIALTY_COLORS } from "@/lib/regulation-graph";
import { SPECIALTY_NAMES } from "@/lib/regulation-constants";

interface DashboardOverviewProps {
  plugins: SpecialtyPlugin[];
  onSelectSpecialty: (id: string) => void;
}

export default function DashboardOverview({
  plugins,
  onSelectSpecialty,
}: DashboardOverviewProps) {
  const stats = useMemo(() => {
    let totalRegulations = 0;
    let totalRules = 0;
    let verified = 0;
    let pending = 0;

    for (const p of plugins) {
      totalRegulations += p.regulations.length;
      totalRules += p.rules.length;
      for (const reg of p.regulations) {
        if (reg.ingestionStatus === "verified") verified++;
        if (reg.ingestionStatus === "pending") pending++;
      }
    }

    return { totalRegulations, totalRules, verified, pending };
  }, [plugins]);

  const maxRuleCount = useMemo(
    () => Math.max(1, ...plugins.map((p) => p.rules.length)),
    [plugins],
  );

  // All 18 specialties, sorted by rule count descending
  const specialties = useMemo(() => {
    const allIds = Object.keys(SPECIALTY_NAMES);
    return allIds
      .map((id) => {
        const plugin = plugins.find((p) => p.id === id);
        return {
          id,
          name: SPECIALTY_NAMES[id] ?? id,
          ruleCount: plugin?.rules.length ?? 0,
          color: SPECIALTY_COLORS[id] ?? "#6b7280",
        };
      })
      .sort((a, b) => b.ruleCount - a.ruleCount);
  }, [plugins]);

  const statCards = [
    {
      icon: FileText,
      value: stats.totalRegulations,
      label: "Regulamentos",
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      icon: Scale,
      value: stats.totalRules,
      label: "Regras",
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      icon: CheckCircle2,
      value: stats.verified,
      label: "Verificados",
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      icon: Clock,
      value: stats.pending,
      label: "Pendentes",
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4"
          >
            <div className={`${card.bg} rounded-lg p-3`}>
              <card.icon className={`w-6 h-6 ${card.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Per-specialty bars */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Regras por Especialidade
        </h2>
        <div className="space-y-3">
          {specialties.map((spec) => (
            <button
              key={spec.id}
              onClick={() => onSelectSpecialty(spec.id)}
              className="w-full text-left group"
            >
              <div className="flex items-center gap-3 mb-1">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: spec.color }}
                />
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors flex-1">
                  {spec.name}
                </span>
                <span className="text-xs text-gray-400 tabular-nums">
                  {spec.ruleCount} regras
                </span>
              </div>
              <div className="ml-6 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 group-hover:opacity-80"
                  style={{
                    width: `${(spec.ruleCount / maxRuleCount) * 100}%`,
                    backgroundColor: spec.color,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { SpecialtyPlugin } from "@/lib/plugins/types";
import { SPECIALTY_COLORS } from "@/lib/regulation-graph";
import { SPECIALTY_NAMES, SEVERITY_BG } from "@/lib/regulation-constants";
import {
  analyzeCrossSpecialties,
  type CrossSpecialtyPair,
} from "@/lib/cross-specialty-analysis";

// ── Props ──────────────────────────────────────────────────

interface CrossSpecialtyDetailProps {
  plugins: SpecialtyPlugin[];
  selectedSpecialtyIds: Set<string>;
  severityFilter: string;
  searchQuery: string;
}

// ── Component ──────────────────────────────────────────────

export default function CrossSpecialtyDetail({
  plugins,
  selectedSpecialtyIds,
  severityFilter,
  searchQuery,
}: CrossSpecialtyDetailProps) {
  const analysis = useMemo(
    () => analyzeCrossSpecialties(selectedSpecialtyIds, plugins),
    [selectedSpecialtyIds, plugins],
  );

  const filteredRules = useMemo(() => {
    let rules = analysis.crossRules;

    if (severityFilter && severityFilter !== "all") {
      rules = rules.filter((cr) => cr.rule.severity === severityFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rules = rules.filter(
        (cr) =>
          cr.rule.id.toLowerCase().includes(q) ||
          cr.rule.description.toLowerCase().includes(q) ||
          cr.rule.article?.toLowerCase().includes(q) ||
          cr.crossFields.some((f) => f.toLowerCase().includes(q)),
      );
    }

    return rules;
  }, [analysis.crossRules, severityFilter, searchQuery]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          {[...selectedSpecialtyIds].map((id, i) => (
            <span key={id} className="flex items-center gap-1.5">
              {i > 0 && (
                <span className="text-gray-400 font-bold text-lg">+</span>
              )}
              <span
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full text-white font-medium"
                style={{
                  backgroundColor: SPECIALTY_COLORS[id] ?? "#6b7280",
                }}
              >
                {SPECIALTY_NAMES[id] ?? id}
              </span>
            </span>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Regras que cruzam as especialidades selecionadas (
          {analysis.totalCrossRules} regras, {analysis.totalSharedFields} campos
          partilhados)
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {analysis.totalCrossRules}
          </p>
          <p className="text-xs text-gray-500">Regras cruzadas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {analysis.pairs.length}
          </p>
          <p className="text-xs text-gray-500">Pares de conexão</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {analysis.totalSharedFields}
          </p>
          <p className="text-xs text-gray-500">Campos partilhados</p>
        </div>
      </div>

      {/* Pairwise connections */}
      {analysis.pairs.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Conexões entre especialidades
          </h2>
          <div className="space-y-3">
            {analysis.pairs.map((pair) => (
              <PairCard
                key={`${pair.specialtyA}:${pair.specialtyB}`}
                pair={pair}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cross-referencing rules table */}
      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          {filteredRules.length} regra
          {filteredRules.length !== 1 ? "s" : ""} cruzada
          {filteredRules.length !== 1 ? "s" : ""}
        </h2>
        {filteredRules.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            Nenhuma regra encontrada que cruze estas especialidades.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-500 w-36">
                    ID
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 w-28">
                    Origem
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">
                    Descrição
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 w-44">
                    Campos cruzados
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 w-24 text-center">
                    Severidade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRules.map((cr) => (
                  <tr
                    key={cr.rule.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {cr.rule.id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center text-xs px-2 py-0.5 rounded-full text-white"
                        style={{
                          backgroundColor:
                            SPECIALTY_COLORS[cr.ownerPluginId] ?? "#6b7280",
                        }}
                      >
                        {SPECIALTY_NAMES[cr.ownerPluginId] ?? cr.ownerPluginId}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {cr.rule.description.length > 80
                        ? cr.rule.description.slice(0, 77) + "..."
                        : cr.rule.description}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {cr.crossFields.slice(0, 3).map((f) => (
                          <span
                            key={f}
                            className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded"
                          >
                            {f}
                          </span>
                        ))}
                        {cr.crossFields.length > 3 && (
                          <span className="text-xs text-gray-400">
                            +{cr.crossFields.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BG[cr.rule.severity] ?? ""}`}
                      >
                        {cr.rule.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PairCard ───────────────────────────────────────────────

function PairCard({ pair }: { pair: CrossSpecialtyPair }) {
  const colorA = SPECIALTY_COLORS[pair.specialtyA] ?? "#6b7280";
  const colorB = SPECIALTY_COLORS[pair.specialtyB] ?? "#6b7280";
  const nameA = SPECIALTY_NAMES[pair.specialtyA] ?? pair.specialtyA;
  const nameB = SPECIALTY_NAMES[pair.specialtyB] ?? pair.specialtyB;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="text-xs px-2.5 py-1 rounded-full text-white font-medium"
          style={{ backgroundColor: colorA }}
        >
          {nameA}
        </span>
        <ArrowRight className="w-4 h-4 text-gray-400" />
        <span
          className="text-xs px-2.5 py-1 rounded-full text-white font-medium"
          style={{ backgroundColor: colorB }}
        >
          {nameB}
        </span>
        <span className="ml-auto text-xs text-gray-400">
          {pair.totalRules} regras
        </span>
      </div>

      <div className="flex gap-4 text-xs text-gray-500 mb-2">
        <span>
          {nameA} → {nameB}: {pair.rulesFromA.length}
        </span>
        <span>
          {nameB} → {nameA}: {pair.rulesFromB.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {pair.sharedFields.slice(0, 6).map((f) => (
          <span
            key={f}
            className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
          >
            {f}
          </span>
        ))}
        {pair.sharedFields.length > 6 && (
          <span className="text-xs text-gray-400">
            +{pair.sharedFields.length - 6} mais
          </span>
        )}
      </div>
    </div>
  );
}

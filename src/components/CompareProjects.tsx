"use client";

import { useState, useMemo } from "react";
import type { SavedProject } from "@/lib/storage";
import { compareVersions, type ProjectVersion, type VersionDiff } from "@/lib/version-diff";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface CompareProjectsProps {
  projects: SavedProject[];
  onBack: () => void;
}

export default function CompareProjects({ projects, onBack }: CompareProjectsProps) {
  const [leftId, setLeftId] = useState<string>(projects[0]?.id ?? "");
  const [rightId, setRightId] = useState<string>(projects[1]?.id ?? projects[0]?.id ?? "");
  const [showAllFields, setShowAllFields] = useState(false);

  const leftProject = projects.find(p => p.id === leftId);
  const rightProject = projects.find(p => p.id === rightId);

  const diff = useMemo(() => {
    if (!leftProject || !rightProject || leftId === rightId) return null;

    const toVersion = (sp: SavedProject): ProjectVersion => ({
      id: sp.id,
      name: sp.name,
      timestamp: sp.updatedAt,
      project: sp.project,
      analysis: sp.lastAnalysis,
    });

    return compareVersions(toVersion(leftProject), toVersion(rightProject));
  }, [leftProject, rightProject, leftId, rightId]);

  const visibleFields = useMemo(() => {
    if (!diff) return [];
    return showAllFields ? diff.fieldChanges : diff.fieldChanges.slice(0, 15);
  }, [diff, showAllFields]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Comparar Projetos</h2>
      </div>

      {/* Project selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProjectSelector
          label="Projeto Base (anterior)"
          value={leftId}
          onChange={setLeftId}
          projects={projects}
          excludeId={rightId}
        />
        <ProjectSelector
          label="Projeto Atual (novo)"
          value={rightId}
          onChange={setRightId}
          projects={projects}
          excludeId={leftId}
        />
      </div>

      {leftId === rightId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Selecione dois projetos diferentes para comparar.
        </div>
      )}

      {diff && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              label="Campos alterados"
              value={diff.fieldChanges.length}
              color="blue"
            />
            <SummaryCard
              label="Variação pontuação"
              value={diff.scoreChange}
              color={diff.scoreChange > 0 ? "green" : diff.scoreChange < 0 ? "red" : "gray"}
              prefix={diff.scoreChange > 0 ? "+" : ""}
              icon={diff.scoreChange > 0 ? <ArrowUp className="w-4 h-4" /> : diff.scoreChange < 0 ? <ArrowDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            />
            <SummaryCard
              label="Novas não-conf."
              value={diff.newFindings.length}
              color={diff.newFindings.length > 0 ? "red" : "green"}
            />
            <SummaryCard
              label="Resolvidas"
              value={diff.resolvedFindings.length}
              color={diff.resolvedFindings.length > 0 ? "green" : "gray"}
            />
          </div>

          {/* Summary text */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-700">{diff.summary}</p>
          </div>

          {/* Score comparison */}
          {leftProject?.lastAnalysis && rightProject?.lastAnalysis && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Pontuação e Classe Energética</h3>
              <div className="grid grid-cols-2 gap-8">
                <ScoreDisplay
                  label={leftProject.name}
                  score={leftProject.lastAnalysis.overallScore}
                  energyClass={leftProject.lastAnalysis.energyClass}
                />
                <ScoreDisplay
                  label={rightProject.name}
                  score={rightProject.lastAnalysis.overallScore}
                  energyClass={rightProject.lastAnalysis.energyClass}
                />
              </div>
            </div>
          )}

          {/* Compliance changes */}
          {diff.complianceChanges.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Alterações de Conformidade</h3>
              <div className="space-y-2">
                {diff.complianceChanges.map(cc => (
                  <div
                    key={cc.area}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      cc.direction === "improved"
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-800">{cc.areaName}</span>
                    <div className="flex items-center gap-2 text-sm">
                      <StatusBadge status={cc.previousStatus} />
                      <span className="text-gray-400">&rarr;</span>
                      <StatusBadge status={cc.currentStatus} />
                      {cc.direction === "improved" ? (
                        <ArrowUp className="w-4 h-4 text-green-600" />
                      ) : (
                        <ArrowDown className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Field changes */}
          {diff.fieldChanges.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">
                Campos Alterados ({diff.fieldChanges.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="pb-2 pr-4">Campo</th>
                      <th className="pb-2 pr-4">Anterior</th>
                      <th className="pb-2 pr-4">Atual</th>
                      <th className="pb-2">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFields.map(fc => (
                      <tr key={fc.path} className="border-b border-gray-100">
                        <td className="py-2 pr-4 text-gray-800 font-medium">{fc.label}</td>
                        <td className="py-2 pr-4 text-gray-500">{formatValue(fc.previousValue)}</td>
                        <td className="py-2 pr-4 text-gray-900 font-medium">{formatValue(fc.currentValue)}</td>
                        <td className="py-2">
                          <ChangeTypeBadge type={fc.type} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {diff.fieldChanges.length > 15 && (
                <button
                  onClick={() => setShowAllFields(!showAllFields)}
                  className="mt-3 text-sm text-accent hover:text-accent-hover font-medium flex items-center gap-1"
                >
                  {showAllFields ? (
                    <>
                      <ChevronUp className="w-4 h-4" /> Mostrar menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" /> Ver todos ({diff.fieldChanges.length})
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* New findings */}
          {diff.newFindings.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-red-700 mb-4">
                Novas Não-Conformidades ({diff.newFindings.length})
              </h3>
              <div className="space-y-2">
                {diff.newFindings.map(f => (
                  <div key={f.id} className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium text-gray-800">{f.regulation} {f.article}</span>
                      <p className="text-gray-600">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolved findings */}
          {diff.resolvedFindings.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-green-700 mb-4">
                Não-Conformidades Resolvidas ({diff.resolvedFindings.length})
              </h3>
              <div className="space-y-2">
                {diff.resolvedFindings.map(f => (
                  <div key={f.id} className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium text-gray-800">{f.regulation} {f.article}</span>
                      <p className="text-gray-600">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ProjectSelector({
  label,
  value,
  onChange,
  projects,
  excludeId,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  projects: SavedProject[];
  excludeId: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent focus:border-accent"
      >
        {projects.map(p => (
          <option key={p.id} value={p.id} disabled={p.id === excludeId}>
            {p.name || "Sem nome"} ({new Date(p.updatedAt).toLocaleDateString("pt-PT")})
            {p.lastAnalysis ? ` — ${p.lastAnalysis.overallScore}/100` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  prefix = "",
  icon,
}: {
  label: string;
  value: number;
  color: string;
  prefix?: string;
  icon?: React.ReactNode;
}) {
  const bgMap: Record<string, string> = {
    blue: "bg-accent-light border-accent",
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    gray: "bg-gray-50 border-gray-200",
  };
  const textMap: Record<string, string> = {
    blue: "text-accent",
    green: "text-green-700",
    red: "text-red-700",
    gray: "text-gray-700",
  };

  return (
    <div className={`rounded-xl border p-4 text-center ${bgMap[color] ?? bgMap.gray}`}>
      <div className={`flex items-center justify-center gap-1 text-2xl font-bold ${textMap[color] ?? textMap.gray}`}>
        {icon}
        {prefix}{value}
      </div>
      <p className="text-xs text-gray-600 mt-1">{label}</p>
    </div>
  );
}

function ScoreDisplay({ label, score, energyClass }: { label: string; score: number; energyClass: string }) {
  const scoreColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-500" : "text-red-500";
  const classColors: Record<string, string> = {
    "A+": "bg-green-700 text-white",
    A: "bg-green-600 text-white",
    B: "bg-green-500 text-white",
    "B-": "bg-yellow-400 text-gray-900",
    C: "bg-yellow-500 text-gray-900",
    D: "bg-orange-400 text-white",
    E: "bg-orange-500 text-white",
    F: "bg-red-600 text-white",
  };

  return (
    <div className="text-center">
      <p className="text-sm text-gray-500 mb-2 truncate">{label}</p>
      <div className="flex items-center justify-center gap-4">
        <div>
          <span className={`text-3xl font-bold ${scoreColor}`}>{score}</span>
          <span className="text-sm text-gray-400">/100</span>
        </div>
        <span className={`px-3 py-1 rounded-lg font-bold text-lg ${classColors[energyClass] ?? "bg-gray-400 text-white"}`}>
          {energyClass}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; label: string }> = {
    compliant: { bg: "bg-green-100 text-green-700", label: "Conforme" },
    partially_compliant: { bg: "bg-amber-100 text-amber-700", label: "Parcial" },
    non_compliant: { bg: "bg-red-100 text-red-700", label: "N/Conforme" },
  };
  const c = config[status] ?? { bg: "bg-gray-100 text-gray-700", label: status };

  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.bg}`}>{c.label}</span>
  );
}

function ChangeTypeBadge({ type }: { type: "added" | "removed" | "changed" }) {
  const config = {
    added: { bg: "bg-green-100 text-green-700", label: "Novo" },
    removed: { bg: "bg-red-100 text-red-700", label: "Removido" },
    changed: { bg: "bg-accent-medium text-accent", label: "Alterado" },
  };
  const c = config[type];

  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.bg}`}>{c.label}</span>
  );
}

function formatValue(val: unknown): string {
  if (val === undefined || val === null) return "—";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (typeof val === "number") return val.toLocaleString("pt-PT");
  return String(val);
}

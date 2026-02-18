"use client";

import { useState, useEffect } from "react";
import type { BuildingProject, AnalysisResult } from "@/lib/types";
import {
  compareVersions,
  type VersionDiff,
  type ProjectVersion,
} from "@/lib/version-diff";
import {
  Save,
  GitCompareArrows,
  ArrowUp,
  ArrowDown,
  Trash2,
  Clock,
} from "lucide-react";

interface VersionDiffViewProps {
  project: BuildingProject;
  analysis: AnalysisResult;
}

const STORAGE_KEY = "wallnut-versions";

function loadVersions(): ProjectVersion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistVersions(versions: ProjectVersion[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions.slice(0, 10)));
  } catch {
    /* quota exceeded */
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    compliant: "Conforme",
    non_compliant: "Não conforme",
    partially_compliant: "Parcial",
  };
  return labels[status] || status;
}

export default function VersionDiffView({ project, analysis }: VersionDiffViewProps) {
  const [versions, setVersions] = useState<ProjectVersion[]>(() => loadVersions());
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);

  function handleSaveVersion() {
    const now = new Date();
    const newVersion: ProjectVersion = {
      id: `v-${Date.now()}`,
      name: `${project.name} - ${now.toLocaleDateString("pt-PT")} ${now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`,
      timestamp: now.toISOString(),
      project: { ...project },
      analysis: { ...analysis },
    };
    const updated = [newVersion, ...versions];
    setVersions(updated);
    persistVersions(updated);
  }

  function handleCompare(versionId: string) {
    const prev = versions.find(v => v.id === versionId);
    if (!prev) return;

    setSelectedVersion(versionId);

    const current: ProjectVersion = {
      id: "current",
      name: "Versão atual",
      timestamp: new Date().toISOString(),
      project,
      analysis,
    };

    setDiff(compareVersions(prev, current));
  }

  function handleDeleteVersion(versionId: string) {
    const updated = versions.filter(v => v.id !== versionId);
    setVersions(updated);
    persistVersions(updated);
    if (selectedVersion === versionId) {
      setSelectedVersion(null);
      setDiff(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Save button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Guarde versões do projeto para comparar evolução.
        </p>
        <button
          onClick={handleSaveVersion}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          Guardar Versão Atual
        </button>
      </div>

      {/* Version list */}
      {versions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Versões guardadas:</h4>
          {versions.map(v => (
            <div
              key={v.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                selectedVersion === v.id ? "border-accent bg-accent-light" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{v.name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(v.timestamp).toLocaleDateString("pt-PT")}{" "}
                    {new Date(v.timestamp).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    {v.analysis && ` | Score: ${v.analysis.overallScore}/100`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCompare(v.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-medium transition-colors"
                >
                  <GitCompareArrows className="w-3 h-3" />
                  Comparar
                </button>
                <button
                  onClick={() => handleDeleteVersion(v.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Diff display */}
      {diff && (
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5 text-accent" />
            <h4 className="font-semibold text-gray-900">Comparação</h4>
          </div>

          {/* Summary */}
          <p className="text-sm text-gray-600">{diff.summary}</p>

          {/* Score change */}
          {diff.scoreChange !== 0 && (
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              diff.scoreChange > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {diff.scoreChange > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              Pontuação: {diff.scoreChange > 0 ? "+" : ""}{diff.scoreChange} pontos
            </div>
          )}

          {/* Compliance changes */}
          {diff.complianceChanges.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Alterações de conformidade:</h5>
              <div className="space-y-1">
                {diff.complianceChanges.map((cc, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded text-sm ${
                      cc.direction === "improved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {cc.direction === "improved" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                    <span className="font-medium">{cc.areaName}</span>
                    <span className="text-xs">
                      {statusLabel(cc.previousStatus)} → {statusLabel(cc.currentStatus)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Field changes */}
          {diff.fieldChanges.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Campos alterados ({diff.fieldChanges.length}):
              </h5>
              <div className="space-y-1">
                {diff.fieldChanges.slice(0, 20).map((fc, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded text-sm">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      fc.type === "added"
                        ? "bg-green-100 text-green-700"
                        : fc.type === "removed"
                        ? "bg-red-100 text-red-700"
                        : "bg-accent-medium text-accent"
                    }`}>
                      {fc.type === "added" ? "+" : fc.type === "removed" ? "-" : "~"}
                    </span>
                    <span className="font-medium text-gray-800">{fc.label}</span>
                    {fc.type === "changed" && (
                      <span className="text-gray-500 text-xs">
                        {String(fc.previousValue)} → {String(fc.currentValue)}
                      </span>
                    )}
                  </div>
                ))}
                {diff.fieldChanges.length > 20 && (
                  <p className="text-xs text-gray-500">+{diff.fieldChanges.length - 20} campos adicionais</p>
                )}
              </div>
            </div>
          )}

          {/* New findings */}
          {diff.newFindings.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-red-700 mb-2">
                Novas não-conformidades ({diff.newFindings.length}):
              </h5>
              <div className="space-y-1">
                {diff.newFindings.map((f, i) => (
                  <div key={i} className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    <span className="font-medium">[{f.regulation}]</span> {f.description}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolved findings */}
          {diff.resolvedFindings.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-green-700 mb-2">
                Não-conformidades resolvidas ({diff.resolvedFindings.length}):
              </h5>
              <div className="space-y-1">
                {diff.resolvedFindings.map((f, i) => (
                  <div key={i} className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                    <span className="font-medium">[{f.regulation}]</span> {f.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

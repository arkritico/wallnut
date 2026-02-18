"use client";

import { AlertTriangle, GitBranch, Info, XCircle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { RuleConflict, RuleDependency } from "@/lib/plumbing-conflict-detector";

interface PlumbingConflictsPanelProps {
  conflicts: RuleConflict[];
  dependencies: RuleDependency[];
  missingPrerequisites?: Record<string, string[]>;
}

export default function PlumbingConflictsPanel({
  conflicts,
  dependencies,
  missingPrerequisites = {}
}: PlumbingConflictsPanelProps) {
  const [expandedConflict, setExpandedConflict] = useState<string | null>(null);
  const [showDependencies, setShowDependencies] = useState(false);

  const criticalConflicts = conflicts.filter(c => c.severity === 'critical');
  const warningConflicts = conflicts.filter(c => c.severity === 'warning');
  const missingCount = Object.keys(missingPrerequisites).length;

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className={`rounded-lg p-4 border ${
        criticalConflicts.length > 0
          ? 'bg-red-50 border-red-200'
          : conflicts.length > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-green-50 border-green-200'
      }`}>
        <div className="flex items-center gap-3 mb-2">
          {criticalConflicts.length > 0 ? (
            <XCircle className="w-6 h-6 text-red-600" />
          ) : conflicts.length > 0 ? (
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          ) : (
            <CheckCircle className="w-6 h-6 text-green-600" />
          )}
          <div>
            <h4 className={`font-semibold ${
              criticalConflicts.length > 0 ? 'text-red-900' :
              conflicts.length > 0 ? 'text-amber-900' : 'text-green-900'
            }`}>
              Análise de Conflitos de Regras
            </h4>
            <p className={`text-sm ${
              criticalConflicts.length > 0 ? 'text-red-600' :
              conflicts.length > 0 ? 'text-amber-600' : 'text-green-600'
            }`}>
              {conflicts.length === 0
                ? '✅ Nenhum conflito detectado'
                : `${conflicts.length} conflito${conflicts.length > 1 ? 's' : ''} encontrado${conflicts.length > 1 ? 's' : ''}`
              }
            </p>
          </div>
        </div>

        {/* Statistics Grid */}
        {conflicts.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-xl font-bold text-red-700">{criticalConflicts.length}</p>
              <p className="text-xs text-red-600">Críticos</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-xl font-bold text-amber-700">{warningConflicts.length}</p>
              <p className="text-xs text-amber-600">Avisos</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-xl font-bold text-gray-700">{missingCount}</p>
              <p className="text-xs text-gray-600">Pré-requisitos</p>
            </div>
          </div>
        )}
      </div>

      {/* Critical Conflicts */}
      {criticalConflicts.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            Conflitos Críticos
          </h5>
          {criticalConflicts.map(conflict => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              expanded={expandedConflict === conflict.id}
              onToggle={() => setExpandedConflict(expandedConflict === conflict.id ? null : conflict.id)}
            />
          ))}
        </div>
      )}

      {/* Warning Conflicts */}
      {warningConflicts.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Avisos
          </h5>
          {warningConflicts.map(conflict => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              expanded={expandedConflict === conflict.id}
              onToggle={() => setExpandedConflict(expandedConflict === conflict.id ? null : conflict.id)}
            />
          ))}
        </div>
      )}

      {/* Missing Prerequisites */}
      {missingCount > 0 && (
        <div className="bg-accent-light border border-accent rounded-lg p-4">
          <h5 className="text-sm font-semibold text-accent mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Pré-requisitos em Falta
          </h5>
          <div className="space-y-2">
            {Object.entries(missingPrerequisites).map(([ruleId, params]) => (
              <div key={ruleId} className="text-sm">
                <code className="font-mono text-xs bg-accent-medium px-2 py-0.5 rounded">{ruleId}</code>
                <span className="text-accent ml-2">requer: {params.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dependencies Toggle */}
      {dependencies.length > 0 && (
        <div>
          <button
            onClick={() => setShowDependencies(!showDependencies)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            <GitBranch className="w-4 h-4" />
            Grafo de Dependências ({dependencies.length})
            {showDependencies ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showDependencies && (
            <div className="mt-3 space-y-2">
              {dependencies.map(dep => (
                <div key={dep.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="font-mono text-xs bg-gray-200 px-2 py-0.5 rounded">{dep.ruleId}</code>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      dep.type === 'prerequisite' ? 'bg-purple-100 text-purple-700' :
                      dep.type === 'conditional' ? 'bg-accent-medium text-accent' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {dep.type === 'prerequisite' ? 'Pré-requisito' :
                       dep.type === 'conditional' ? 'Condicional' : 'Sequencial'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{dep.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {dep.dependsOn.map(param => (
                      <span key={param} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                        {param}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      {conflicts.length === 0 && dependencies.length === 0 && missingCount === 0 && (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className="text-sm">
            ✅ Análise completa - nenhum conflito ou dependência não satisfeita detectada.
          </p>
        </div>
      )}
    </div>
  );
}

function ConflictCard({
  conflict,
  expanded,
  onToggle
}: {
  conflict: RuleConflict;
  expanded: boolean;
  onToggle: () => void;
}) {
  const bgColor = conflict.severity === 'critical'
    ? 'bg-red-50 border-red-300'
    : conflict.severity === 'warning'
      ? 'bg-amber-50 border-amber-300'
      : 'bg-accent-light border-accent';

  const textColor = conflict.severity === 'critical'
    ? 'text-red-800'
    : conflict.severity === 'warning'
      ? 'text-amber-800'
      : 'text-accent';

  return (
    <div className={`rounded-lg border p-3 ${bgColor}`}>
      <button
        onClick={onToggle}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                conflict.type === 'contradiction' ? 'bg-red-200 text-red-800' :
                conflict.type === 'overlap' ? 'bg-amber-200 text-amber-800' :
                'bg-gray-200 text-gray-800'
              }`}>
                {conflict.type === 'contradiction' ? 'CONTRADIÇÃO' :
                 conflict.type === 'overlap' ? 'SOBREPOSIÇÃO' : 'IMPOSSÍVEL'}
              </span>
              <code className="text-xs font-mono bg-white/60 px-2 py-0.5 rounded">
                {conflict.rule1.id} ⚔️ {conflict.rule2.id}
              </code>
            </div>
            <p className={`text-sm font-medium ${textColor}`}>
              {conflict.description}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-current/20 pt-3">
          {/* Rule 1 */}
          <div className="bg-white/60 rounded p-2">
            <p className="text-xs font-semibold text-gray-700 mb-1">Regra 1:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono">{conflict.rule1.id}</code>
              <span className="text-xs text-gray-600">{conflict.rule1.category}</span>
            </div>
            <p className="text-xs text-gray-700 mt-1">{conflict.rule1.requirement}</p>
          </div>

          {/* Rule 2 */}
          <div className="bg-white/60 rounded p-2">
            <p className="text-xs font-semibold text-gray-700 mb-1">Regra 2:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono">{conflict.rule2.id}</code>
              <span className="text-xs text-gray-600">{conflict.rule2.category}</span>
            </div>
            <p className="text-xs text-gray-700 mt-1">{conflict.rule2.requirement}</p>
          </div>

          {/* Recommendation */}
          <div className="bg-white/60 rounded p-2 border-l-2 border-accent">
            <p className="text-xs font-semibold text-accent mb-1">💡 Recomendação:</p>
            <p className="text-xs text-gray-700">{conflict.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

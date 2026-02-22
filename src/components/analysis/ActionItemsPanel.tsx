import { useState, useCallback } from "react";
import type { Finding, RegulationArea } from "@/lib/types";
import {
  AlertCircle, AlertTriangle, XCircle, CheckCircle,
  ChevronDown, ChevronRight, Shield, Layers, Minus,
} from "lucide-react";
import { AREA_SHORT_LABELS } from "@/lib/area-metadata";
import { AREA_ICONS } from "./area-icons";
import FindingCard from "./FindingCard";
import type { AnalysisHierarchy } from "@/lib/analysis-hierarchy";

export default function ActionItemsPanel({ actionItems, actionHierarchy, naAreas, costLookup, projectId, userRole }: {
  actionItems: Finding[];
  actionHierarchy: AnalysisHierarchy;
  naAreas: Set<string>;
  costLookup: Map<string, { minCost: number; maxCost: number }>;
  projectId?: string;
  userRole?: import("@/lib/collaboration").ProjectRole | null;
}) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    for (const dg of actionHierarchy.domains) {
      if (dg.criticalCount > 0) expanded.add(dg.domain.id);
    }
    if (expanded.size === 0 && actionHierarchy.domains.length > 0) {
      expanded.add(actionHierarchy.domains[0].domain.id);
    }
    return expanded;
  });

  const [expandedSpecialties, setExpandedSpecialties] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    for (const dg of actionHierarchy.domains) {
      for (const sg of dg.specialties) {
        if (sg.criticalCount > 0) expanded.add(`${dg.domain.id}:${sg.area}`);
      }
    }
    return expanded;
  });

  const toggleDomain = useCallback((domainId: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId); else next.add(domainId);
      return next;
    });
  }, []);

  const toggleSpecialty = useCallback((key: string) => {
    setExpandedSpecialties(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  if (actionItems.length === 0) {
    return (
      <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-6 text-center">
        <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
        <h3 className="text-lg font-semibold text-green-800">Sem problemas detetados</h3>
        <p className="text-sm text-green-600 mt-1">
          {naAreas.size > 0
            ? `${18 - naAreas.size} especialidades analisadas, ${naAreas.size} sem dados`
            : "Todas as especialidades em conformidade"}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-red-500" />
        {actionItems.length} {actionItems.length === 1 ? "problema" : "problemas"} a resolver
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Agrupados por domínio, especialidade e regulamento — mais críticos primeiro.
      </p>

      <div className="space-y-3">
        {actionHierarchy.domains.map(dg => {
          const domainExpanded = expandedDomains.has(dg.domain.id);
          return (
            <div key={dg.domain.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleDomain(dg.domain.id)}
                className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                  dg.criticalCount > 0 ? "bg-red-50 hover:bg-red-100" : "bg-amber-50 hover:bg-amber-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  {domainExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  <Layers className="w-4 h-4 text-gray-600" />
                  <span className="font-semibold text-sm text-gray-900">{dg.domain.label}</span>
                  <span className="text-xs text-gray-500">{dg.domain.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  {dg.criticalCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">
                      <XCircle className="w-3 h-3" /> {dg.criticalCount}
                    </span>
                  )}
                  {dg.warningCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold border border-amber-200">
                      <AlertTriangle className="w-3 h-3" /> {dg.warningCount}
                    </span>
                  )}
                </div>
              </button>

              {domainExpanded && (
                <div className="border-t border-gray-200">
                  {dg.specialties.map(sg => {
                    const specKey = `${dg.domain.id}:${sg.area}`;
                    const specExpanded = expandedSpecialties.has(specKey);
                    const specIcon = AREA_ICONS[sg.area];
                    return (
                      <div key={sg.area} className="border-b border-gray-100 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => toggleSpecialty(specKey)}
                          className="w-full flex items-center justify-between px-4 py-2.5 pl-8 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {specExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                            {specIcon ?? <Minus className="w-4 h-4 text-gray-400" />}
                            <span className="font-medium text-sm text-gray-800">{AREA_SHORT_LABELS[sg.area] ?? sg.area}</span>
                            <span className="text-xs text-gray-400">
                              {sg.regulations.length} {sg.regulations.length === 1 ? "regulamento" : "regulamentos"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {sg.criticalCount > 0 && (
                              <span className="text-xs font-bold text-red-600">{sg.criticalCount} críticas</span>
                            )}
                            {sg.warningCount > 0 && (
                              <span className="text-xs font-bold text-amber-600">{sg.warningCount} avisos</span>
                            )}
                          </div>
                        </button>

                        {specExpanded && (
                          <div className="pl-14 pr-4 pb-3 space-y-3">
                            {sg.regulations.map(rg => (
                              <div key={rg.regulation}>
                                <div className="flex items-center gap-2 mb-2">
                                  <Shield className="w-3.5 h-3.5 text-gray-400" />
                                  <span className="text-xs font-semibold text-gray-700">{rg.regulation}</span>
                                  <span className="text-xs text-gray-400">
                                    ({rg.findings.length} {rg.findings.length === 1 ? "constatação" : "constatações"})
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  {rg.findings.map(f => (
                                    <FindingCard key={f.id} finding={f} costEstimate={costLookup.get(f.id)} projectId={projectId} userRole={userRole} />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

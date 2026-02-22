"use client";

import { useState } from "react";
import type { Finding, RegulationArea, Severity } from "@/lib/types";
import { ChevronDown, ChevronRight, Shield, Layers, Filter, Minus } from "lucide-react";
import { AREA_SHORT_LABELS } from "@/lib/area-metadata";
import { AREA_ICONS } from "./area-icons";
import type { AnalysisHierarchy } from "@/lib/analysis-hierarchy";
import FindingCard from "./FindingCard";
import SeverityBadges from "./SeverityBadges";
import Section from "./Section";

function sortFindings(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Hierarchical findings view: Domain → Specialty → Regulation → Findings */
function HierarchicalFindings({ hierarchy, costLookup, projectId, userRole }: {
  hierarchy: AnalysisHierarchy;
  costLookup: Map<string, { minCost: number; maxCost: number }>;
  projectId?: string;
  userRole?: import("@/lib/collaboration").ProjectRole | null;
}) {
  const [openDomains, setOpenDomains] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const dg of hierarchy.domains) {
      if (dg.criticalCount > 0 || dg.warningCount > 0) s.add(dg.domain.id);
    }
    return s;
  });
  const [openSpecs, setOpenSpecs] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const dg of hierarchy.domains) {
      for (const sg of dg.specialties) {
        if (sg.criticalCount > 0) s.add(`${dg.domain.id}:${sg.area}`);
      }
    }
    return s;
  });
  const [openRegs, setOpenRegs] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const dg of hierarchy.domains) {
      for (const sg of dg.specialties) {
        for (const rg of sg.regulations) {
          if (rg.criticalCount > 0) s.add(`${dg.domain.id}:${sg.area}:${rg.regulation}`);
        }
      }
    }
    return s;
  });

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (hierarchy.domains.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-4">Nenhuma constatação.</p>;
  }

  return (
    <div className="space-y-2">
      {hierarchy.domains.map(dg => {
        const dOpen = openDomains.has(dg.domain.id);
        return (
          <div key={dg.domain.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSet(setOpenDomains, dg.domain.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {dOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                <Layers className="w-4 h-4 text-gray-600" />
                <span className="font-semibold text-sm text-gray-900">{dg.domain.label}</span>
                <span className="text-xs text-gray-400 hidden md:inline">{dg.domain.description}</span>
              </div>
              <SeverityBadges critical={dg.criticalCount} warning={dg.warningCount} pass={dg.passCount} info={dg.infoCount} />
            </button>

            {dOpen && (
              <div className="border-t border-gray-200">
                {dg.specialties.map(sg => {
                  const sKey = `${dg.domain.id}:${sg.area}`;
                  const sOpen = openSpecs.has(sKey);
                  const specIcon = AREA_ICONS[sg.area];
                  return (
                    <div key={sg.area} className="border-b border-gray-100 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => toggleSet(setOpenSpecs, sKey)}
                        className="w-full flex items-center justify-between px-4 py-2.5 pl-8 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {sOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                          {specIcon ?? <Minus className="w-4 h-4 text-gray-400" />}
                          <span className="font-medium text-sm text-gray-800">{AREA_SHORT_LABELS[sg.area] ?? sg.area}</span>
                          <span className="text-xs text-gray-400">
                            {sg.totalFindings} {sg.totalFindings === 1 ? "constatação" : "constatações"}
                          </span>
                        </div>
                        <SeverityBadges critical={sg.criticalCount} warning={sg.warningCount} pass={sg.passCount} info={sg.infoCount} />
                      </button>

                      {sOpen && (
                        <div className="pl-12 pr-4 pb-3 space-y-4">
                          {sg.regulations.map(rg => {
                            const rKey = `${dg.domain.id}:${sg.area}:${rg.regulation}`;
                            const rOpen = openRegs.has(rKey);
                            return (
                              <div key={rg.regulation}>
                                <button
                                  type="button"
                                  onClick={() => toggleSet(setOpenRegs, rKey)}
                                  className="w-full flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity"
                                >
                                  <div className="flex items-center gap-2">
                                    {rOpen ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                                    <Shield className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-xs font-semibold text-gray-700">{rg.regulation}</span>
                                    <span className="text-xs text-gray-400">({rg.findings.length})</span>
                                  </div>
                                  <SeverityBadges critical={rg.criticalCount} warning={rg.warningCount} pass={rg.passCount} info={rg.infoCount} compact />
                                </button>

                                {rOpen && (
                                  <div className="space-y-2 mt-2 ml-5">
                                    {rg.findings.map(f => (
                                      <FindingCard key={f.id} finding={f} costEstimate={costLookup.get(f.id)} projectId={projectId} userRole={userRole} />
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
            )}
          </div>
        );
      })}

      {hierarchy.ungrouped.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Outras constatações</p>
          <div className="space-y-2">
            {hierarchy.ungrouped.map(f => (
              <FindingCard key={f.id} finding={f} costEstimate={costLookup.get(f.id)} projectId={projectId} userRole={userRole} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FindingsExplorer({ findings, filteredFindings, hierarchy, areasWithFindings, areaFilter, setAreaFilter, costLookup, open, onToggle, projectId, userRole }: {
  findings: Finding[];
  filteredFindings: Finding[];
  hierarchy: AnalysisHierarchy;
  areasWithFindings: [RegulationArea, { critical: number; warning: number; info: number; pass: number }][];
  areaFilter: RegulationArea | "all";
  setAreaFilter: (filter: RegulationArea | "all") => void;
  costLookup: Map<string, { minCost: number; maxCost: number }>;
  open: boolean;
  onToggle: () => void;
  projectId?: string;
  userRole?: import("@/lib/collaboration").ProjectRole | null;
}) {
  return (
    <Section
      title={`Todas as Constatações (${findings.length})`}
      id="findings"
      icon={<Layers className="w-5 h-5 text-gray-500" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-gray-400" />
        <button
          type="button"
          onClick={() => setAreaFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            areaFilter === "all" ? "bg-accent text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Todas ({findings.length})
        </button>
        {areasWithFindings.map(([area, counts]) => {
          const total = counts.critical + counts.warning + counts.info + counts.pass;
          const isActive = areaFilter === area;
          const hasCritical = counts.critical > 0;
          return (
            <button
              key={area}
              type="button"
              onClick={() => setAreaFilter(isActive ? "all" : area)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : hasCritical
                    ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {AREA_SHORT_LABELS[area] ?? area} ({total})
            </button>
          );
        })}
      </div>

      {areaFilter === "all" ? (
        <HierarchicalFindings
          hierarchy={hierarchy}
          costLookup={costLookup}
          projectId={projectId}
          userRole={userRole}
        />
      ) : (
        <div className="space-y-3">
          {sortFindings(filteredFindings).map(finding => (
            <FindingCard key={finding.id} finding={finding} costEstimate={costLookup.get(finding.id)} projectId={projectId} userRole={userRole} />
          ))}
          {filteredFindings.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">Nenhuma constatação nesta especialidade.</p>
          )}
        </div>
      )}
    </Section>
  );
}

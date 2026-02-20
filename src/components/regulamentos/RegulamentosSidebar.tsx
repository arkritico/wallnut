"use client";

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, FileText, Hash } from "lucide-react";
import type { SpecialtyPlugin, RegulationDocument, DeclarativeRule } from "@/lib/plugins/types";
import { SPECIALTY_COLORS } from "@/lib/regulation-graph";
import { SPECIALTY_NAMES, SEVERITY_COLORS, INGESTION_STATUS_CONFIG } from "@/lib/regulation-constants";

// ============================================================
// Props
// ============================================================

interface RegulamentosSidebarProps {
  plugins: SpecialtyPlugin[];
  searchQuery: string;
  severityFilter: "all" | "critical" | "warning" | "info" | "pass";
  selectedSpecialtyId: string | null;
  selectedRegulationId: string | null;
  selectedRuleId: string | null;
  onSelectSpecialty: (id: string | null) => void;
  onSelectRegulation: (specialtyId: string, regulationId: string | null) => void;
  onSelectRule: (specialtyId: string, regulationId: string, ruleId: string | null) => void;
  selectedSpecialtyIds?: Set<string>;
  isMultiSelect?: boolean;
}

// ============================================================
// Filtering helpers
// ============================================================

function matchesSearch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query);
}

function ruleMatchesSearch(rule: DeclarativeRule, query: string): boolean {
  return (
    matchesSearch(rule.id, query) ||
    matchesSearch(rule.description, query) ||
    matchesSearch(rule.article, query) ||
    rule.tags.some((tag) => matchesSearch(tag, query))
  );
}

function regulationMatchesSearch(reg: RegulationDocument, query: string): boolean {
  return matchesSearch(reg.shortRef, query) || matchesSearch(reg.title, query);
}

function ruleMatchesSeverity(
  rule: DeclarativeRule,
  filter: "all" | "critical" | "warning" | "info" | "pass",
): boolean {
  return filter === "all" || rule.severity === filter;
}

// ============================================================
// Filtered tree types
// ============================================================

interface FilteredRule {
  rule: DeclarativeRule;
}

interface FilteredRegulation {
  regulation: RegulationDocument;
  rules: FilteredRule[];
}

interface FilteredSpecialty {
  plugin: SpecialtyPlugin;
  regulations: FilteredRegulation[];
  totalRules: number;
}

// ============================================================
// Component
// ============================================================

export default function RegulamentosSidebar({
  plugins,
  searchQuery,
  severityFilter,
  selectedSpecialtyId,
  selectedRegulationId,
  selectedRuleId,
  onSelectSpecialty,
  onSelectRegulation,
  onSelectRule,
  selectedSpecialtyIds,
  isMultiSelect,
}: RegulamentosSidebarProps) {
  const [expandedSpecialties, setExpandedSpecialties] = useState<Set<string>>(new Set());
  const [expandedRegulations, setExpandedRegulations] = useState<Set<string>>(new Set());

  // ── Build filtered tree ──
  const query = searchQuery.trim().toLowerCase();
  const hasSearch = query.length > 0;

  const filteredTree = useMemo<FilteredSpecialty[]>(() => {
    const result: FilteredSpecialty[] = [];

    for (const plugin of plugins) {
      const filteredRegs: FilteredRegulation[] = [];

      // Build a map of regulation ID → rules from the plugin-level rules array
      const rulesByRegulation = new Map<string, DeclarativeRule[]>();
      for (const rule of plugin.rules) {
        const existing = rulesByRegulation.get(rule.regulationId);
        if (existing) {
          existing.push(rule);
        } else {
          rulesByRegulation.set(rule.regulationId, [rule]);
        }
      }

      for (const reg of plugin.regulations) {
        const allRules: DeclarativeRule[] = rulesByRegulation.get(reg.id) ?? [];

        // Filter rules by severity and search
        const matchingRules: FilteredRule[] = [];
        for (const rule of allRules) {
          if (!ruleMatchesSeverity(rule, severityFilter)) continue;
          if (hasSearch && !ruleMatchesSearch(rule, query)) continue;
          matchingRules.push({ rule });
        }

        // Include regulation if:
        // - It has matching rules, OR
        // - Its own text matches the search (and severity allows at least one rule or no filter)
        const regTextMatches = hasSearch && regulationMatchesSearch(reg, query);
        if (matchingRules.length > 0 || regTextMatches) {
          filteredRegs.push({
            regulation: reg,
            rules: matchingRules,
          });
        }
      }

      // Include specialty if:
      // - It has matching regulations, OR
      // - Its name matches the search
      const specialtyName = SPECIALTY_NAMES[plugin.id] ?? plugin.name;
      const specialtyTextMatches = hasSearch && matchesSearch(specialtyName, query);
      if (filteredRegs.length > 0 || specialtyTextMatches) {
        const totalRules = filteredRegs.reduce((sum, r) => sum + r.rules.length, 0);
        result.push({ plugin, regulations: filteredRegs, totalRules });
      }
    }

    return result;
  }, [plugins, query, hasSearch, severityFilter]);

  // ── Auto-expand matching paths when search is active ──
  const autoExpandedSpecialties = useMemo<Set<string>>(() => {
    if (!hasSearch) return new Set<string>();
    return new Set(filteredTree.map((s) => s.plugin.id));
  }, [hasSearch, filteredTree]);

  const autoExpandedRegulations = useMemo<Set<string>>(() => {
    if (!hasSearch) return new Set<string>();
    const set = new Set<string>();
    for (const s of filteredTree) {
      for (const r of s.regulations) {
        if (r.rules.length > 0) {
          set.add(regKey(s.plugin.id, r.regulation.id));
        }
      }
    }
    return set;
  }, [hasSearch, filteredTree]);

  // ── Effective expanded state (user toggles + auto-expand) ──
  function isSpecialtyExpanded(id: string): boolean {
    if (hasSearch) return autoExpandedSpecialties.has(id);
    return expandedSpecialties.has(id);
  }

  function isRegulationExpanded(specialtyId: string, regulationId: string): boolean {
    const key = regKey(specialtyId, regulationId);
    if (hasSearch) return autoExpandedRegulations.has(key);
    return expandedRegulations.has(key);
  }

  // ── Toggle handlers ──
  function toggleSpecialty(id: string) {
    setExpandedSpecialties((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleRegulation(specialtyId: string, regulationId: string) {
    const key = regKey(specialtyId, regulationId);
    setExpandedRegulations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // ── Selection handlers (also expand parents) ──
  function handleSelectSpecialty(id: string) {
    const isAlreadySelected = selectedSpecialtyId === id;
    if (isAlreadySelected) {
      onSelectSpecialty(null);
    } else {
      onSelectSpecialty(id);
      setExpandedSpecialties((prev) => new Set(prev).add(id));
    }
  }

  function handleSelectRegulation(specialtyId: string, regulationId: string) {
    const isAlreadySelected = selectedRegulationId === regulationId;
    if (isAlreadySelected) {
      onSelectRegulation(specialtyId, null);
    } else {
      onSelectRegulation(specialtyId, regulationId);
      setExpandedSpecialties((prev) => new Set(prev).add(specialtyId));
      setExpandedRegulations((prev) => new Set(prev).add(regKey(specialtyId, regulationId)));
    }
  }

  function handleSelectRule(specialtyId: string, regulationId: string, ruleId: string) {
    const isAlreadySelected = selectedRuleId === ruleId;
    if (isAlreadySelected) {
      onSelectRule(specialtyId, regulationId, null);
    } else {
      onSelectRule(specialtyId, regulationId, ruleId);
      setExpandedSpecialties((prev) => new Set(prev).add(specialtyId));
      setExpandedRegulations((prev) => new Set(prev).add(regKey(specialtyId, regulationId)));
    }
  }

  // ── Stats ──
  const totalSpecialties = filteredTree.length;
  const totalRegulations = filteredTree.reduce((sum, s) => sum + s.regulations.length, 0);
  const totalRules = filteredTree.reduce((sum, s) => sum + s.totalRules, 0);

  // ── Render ──
  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Scrollable tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredTree.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            Nenhum resultado encontrado.
          </div>
        )}

        {filteredTree.map(({ plugin, regulations, totalRules: specRuleCount }) => {
          const specialtyColor = SPECIALTY_COLORS[plugin.id] ?? "#6b7280";
          const specialtyName = SPECIALTY_NAMES[plugin.id] ?? plugin.name;
          const expanded = isSpecialtyExpanded(plugin.id);
          const isSelected = isMultiSelect && selectedSpecialtyIds
            ? selectedSpecialtyIds.has(plugin.id)
            : selectedSpecialtyId === plugin.id;

          return (
            <div key={plugin.id}>
              {/* Level 1: Specialty */}
              <button
                onClick={() => {
                  toggleSpecialty(plugin.id);
                  handleSelectSpecialty(plugin.id);
                }}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                  hover:bg-gray-50 transition-colors
                  ${isSelected ? "bg-blue-100" : ""}
                `}
                style={{ minHeight: 40 }}
                title={specialtyName}
              >
                {/* Expand/collapse chevron */}
                <span className="flex-shrink-0 w-4 h-4 text-gray-400">
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                {/* Colored dot */}
                <span
                  className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: specialtyColor }}
                />
                {/* Name */}
                <span className="flex-1 truncate font-medium text-gray-800">
                  {specialtyName}
                </span>
                {/* Rule count */}
                <span className="flex-shrink-0 text-xs text-gray-400 tabular-nums">
                  {specRuleCount}
                </span>
              </button>

              {/* Level 2: Regulations */}
              {expanded &&
                regulations.map(({ regulation, rules }) => {
                  const regExpanded = isRegulationExpanded(plugin.id, regulation.id);
                  const isRegSelected = selectedRegulationId === regulation.id;
                  const ingestionCfg = INGESTION_STATUS_CONFIG[regulation.ingestionStatus];
                  const ruleCount = rules.length;

                  return (
                    <div key={regulation.id}>
                      <button
                        onClick={() => {
                          toggleRegulation(plugin.id, regulation.id);
                          handleSelectRegulation(plugin.id, regulation.id);
                        }}
                        className={`
                          w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-left text-sm
                          hover:bg-gray-50 transition-colors
                          ${isRegSelected ? "bg-blue-50" : ""}
                        `}
                        style={{ minHeight: 32 }}
                        title={`${regulation.shortRef} — ${regulation.title}`}
                      >
                        {/* Expand/collapse chevron */}
                        <span className="flex-shrink-0 w-4 h-4 text-gray-400">
                          {regExpanded ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </span>
                        {/* Regulation icon */}
                        <FileText size={14} className="flex-shrink-0 text-gray-400" />
                        {/* Short ref */}
                        <span className="flex-1 truncate text-gray-700">
                          {regulation.shortRef}
                        </span>
                        {/* Ingestion status dot */}
                        <span
                          className={`flex-shrink-0 w-2 h-2 rounded-full ${ingestionCfg.dot}`}
                          title={ingestionCfg.label}
                        />
                        {/* Rule count */}
                        <span className="flex-shrink-0 text-xs text-gray-400 tabular-nums">
                          {ruleCount}
                        </span>
                      </button>

                      {/* Level 3: Rules */}
                      {regExpanded &&
                        rules.map(({ rule }) => {
                          const isRuleSelected = selectedRuleId === rule.id;
                          const severityColor = SEVERITY_COLORS[rule.severity] ?? "#6b7280";
                          const truncatedArticle =
                            rule.article.length > 40
                              ? rule.article.slice(0, 37) + "..."
                              : rule.article;

                          return (
                            <button
                              key={rule.id}
                              onClick={() =>
                                handleSelectRule(plugin.id, regulation.id, rule.id)
                              }
                              className={`
                                w-full flex items-center gap-2 pl-16 pr-3 py-1 text-left text-xs
                                hover:bg-gray-50 transition-colors
                                ${isRuleSelected ? "bg-blue-100 border-l-2 border-blue-500" : ""}
                              `}
                              style={{ minHeight: 28 }}
                              title={`${rule.id}: ${rule.description}`}
                            >
                              {/* Rule hash icon */}
                              <Hash size={12} className="flex-shrink-0 text-gray-300" />
                              {/* Rule ID (monospace) */}
                              <span className="flex-shrink-0 font-mono text-gray-600">
                                {rule.id}
                              </span>
                              {/* Severity dot */}
                              <span
                                className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: severityColor }}
                              />
                              {/* Article text truncated */}
                              <span className="flex-1 truncate text-gray-500">
                                {truncatedArticle}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {/* Stats footer */}
      <div className="flex-shrink-0 border-t border-gray-200 px-3 py-2 text-xs text-gray-500 text-center">
        {totalSpecialties} especialidades | {totalRegulations} regulamentos | {totalRules} regras
      </div>
    </div>
  );
}

// ============================================================
// Utilities
// ============================================================

/** Composite key for regulation expand state, scoped by specialty to avoid collisions */
function regKey(specialtyId: string, regulationId: string): string {
  return `${specialtyId}::${regulationId}`;
}

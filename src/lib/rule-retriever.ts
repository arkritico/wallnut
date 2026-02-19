/**
 * Rule Retriever — filters and compacts rules for LLM context
 *
 * Provides server-side rule filtering by specialty, building type, scope,
 * and keyword relevance, then serializes into a compact text format
 * suitable for including in Claude prompts.
 */

import type { SpecialtyPlugin, DeclarativeRule } from "./plugins/types";
import { getAvailablePlugins } from "./plugins/loader";
import { buildFieldLookup, buildConditionDisplay } from "./regulation-graph";

// ============================================================
// Types
// ============================================================

export interface RuleFilter {
  specialty?: string;
  buildingType?: string;
  projectScope?: "new" | "rehab";
  regulationId?: string;
  severity?: string;
  keywords?: string[];
}

export interface CompactRule {
  id: string;
  severity: string;
  article: string;
  description: string;
  conditions: string[];
  remediation: string;
  tags: string[];
  regulationRef: string;
  specialtyId: string;
}

export interface RuleRetrievalResult {
  rules: CompactRule[];
  totalMatched: number;
  serialized: string;
}

// ============================================================
// Portuguese stopwords for keyword extraction
// ============================================================

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "em", "no", "na",
  "nos", "nas", "um", "uma", "uns", "umas", "por", "para", "com", "sem",
  "que", "se", "ao", "aos", "e", "ou", "mas", "como", "qual", "quais",
  "este", "esta", "esse", "essa", "aquele", "aquela", "isto", "isso",
  "ser", "ter", "estar", "ir", "ver", "fazer", "dar", "poder", "dever",
  "mais", "muito", "também", "já", "ainda", "só", "mesmo", "bem",
  "quando", "onde", "porque", "pois", "então", "assim", "depois",
  "sobre", "entre", "até", "desde", "durante", "segundo",
  "regras", "regra", "aplicam", "aplica", "projeto", "edificio",
  "quais", "sao", "são", "nao", "não", "tem", "pode", "deve",
  "tipo", "tipos", "este", "esta", "existe", "existem",
]);

// ============================================================
// Functions
// ============================================================

/** Extract meaningful keywords from a user question */
export function extractKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[?!.,;:()[\]{}""'']/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/** Score a rule's relevance to a set of keywords */
function scoreRelevance(rule: DeclarativeRule, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  let score = 0;
  const text = `${rule.id} ${rule.article} ${rule.description} ${rule.tags.join(" ")} ${rule.remediation}`.toLowerCase();
  for (const kw of keywords) {
    if (text.includes(kw)) score += 1;
    // Boost for ID match
    if (rule.id.toLowerCase().includes(kw)) score += 3;
    // Boost for tag match
    if (rule.tags.some(t => t.toLowerCase().includes(kw))) score += 2;
  }
  return score;
}

/** Check if a rule matches a building type filter */
function matchesBuildingType(rule: DeclarativeRule, buildingType: string): boolean {
  const btConditions = rule.conditions.filter(c => c.field === "buildingType");
  if (btConditions.length === 0) return true; // universal rule
  return btConditions.some(c => {
    if (c.operator === "==" && c.value === buildingType) return true;
    if (c.operator === "in" && Array.isArray(c.value) && c.value.includes(buildingType)) return true;
    return false;
  });
}

/** Check if a rule matches a project scope filter */
function matchesProjectScope(rule: DeclarativeRule, scope: "new" | "rehab"): boolean {
  const rehabConditions = rule.conditions.filter(c => c.field === "isRehabilitation");
  if (rehabConditions.length === 0) return true; // applies to all
  return rehabConditions.some(c => {
    if (c.operator === "==" && c.value === (scope === "rehab")) return true;
    return false;
  });
}

/** Filter rules from all plugins based on criteria */
export function filterRules(filter: RuleFilter): { rules: Array<DeclarativeRule & { specialtyId: string; regulationRef: string }>; plugins: SpecialtyPlugin[] } {
  const plugins = getAvailablePlugins();
  const matched: Array<DeclarativeRule & { specialtyId: string; regulationRef: string }> = [];

  for (const plugin of plugins) {
    if (filter.specialty && plugin.id !== filter.specialty) continue;

    // Build regulation shortRef lookup
    const regRefs = new Map<string, string>();
    for (const reg of plugin.regulations) {
      regRefs.set(reg.id, reg.shortRef);
    }

    for (const rule of plugin.rules) {
      if (!rule.enabled) continue;
      if (filter.regulationId && rule.regulationId !== filter.regulationId) continue;
      if (filter.severity && rule.severity !== filter.severity) continue;
      if (filter.buildingType && !matchesBuildingType(rule, filter.buildingType)) continue;
      if (filter.projectScope && !matchesProjectScope(rule, filter.projectScope)) continue;

      matched.push({
        ...rule,
        specialtyId: plugin.id,
        regulationRef: regRefs.get(rule.regulationId) || rule.regulationId,
      });
    }
  }

  return { rules: matched, plugins };
}

/** Convert filtered rules into compact format for LLM context */
export function compactRules(
  rules: Array<DeclarativeRule & { specialtyId: string; regulationRef: string }>,
  keywords: string[],
  maxRules: number = 300,
): CompactRule[] {
  // Score by keyword relevance if keywords provided
  let scored = rules.map(r => ({ rule: r, score: scoreRelevance(r, keywords) }));

  // Sort: keyword-matched first (by score desc), then by severity (critical > warning > info > pass)
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return (severityOrder[a.rule.severity] ?? 4) - (severityOrder[b.rule.severity] ?? 4);
  });

  // Cap at maxRules
  scored = scored.slice(0, maxRules);

  const fieldLookup = buildFieldLookup();

  return scored.map(({ rule }) => ({
    id: rule.id,
    severity: rule.severity,
    article: rule.article,
    description: rule.description,
    conditions: rule.conditions.map(c => {
      const display = buildConditionDisplay(
        { field: c.field, operator: c.operator, value: c.value, formula: c.formula },
        fieldLookup,
      );
      return display.question;
    }),
    remediation: rule.remediation,
    tags: rule.tags,
    regulationRef: rule.regulationRef,
    specialtyId: rule.specialtyId,
  }));
}

/** Serialize compact rules into text for LLM prompt injection */
export function serializeForPrompt(rules: CompactRule[]): string {
  return rules.map(r => {
    const lines = [
      `[${r.id}] (${r.severity}) ${r.regulationRef} — ${r.article}`,
      `  ${r.description}`,
    ];
    if (r.conditions.length > 0) {
      lines.push(`  Verifica: ${r.conditions.join("; ")}`);
    }
    if (r.remediation) {
      lines.push(`  Remediação: ${r.remediation.slice(0, 150)}${r.remediation.length > 150 ? "..." : ""}`);
    }
    if (r.tags.length > 0) {
      lines.push(`  Tags: ${r.tags.join(", ")}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}

/** Full pipeline: filter → compact → serialize */
export function retrieveRulesForChat(
  filter: RuleFilter,
  question: string,
  maxRules: number = 300,
): RuleRetrievalResult {
  const keywords = extractKeywords(question);
  const { rules: matched } = filterRules({ ...filter, keywords });
  const compact = compactRules(matched, keywords, maxRules);
  const serialized = serializeForPrompt(compact);

  return {
    rules: compact,
    totalMatched: matched.length,
    serialized,
  };
}

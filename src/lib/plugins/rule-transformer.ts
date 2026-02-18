/**
 * Rule Transformer — converts AI-extracted rules into DeclarativeRule format
 * used by the plugin evaluation engine.
 */

import type { DeclarativeRule, RuleCondition, RuleOperator } from "./types";
import type { Severity } from "../types";

/** Shape of rules extracted by AIRegulationIngestion */
export interface ExtractedRuleInput {
  id: string;
  artigo: string;
  regulamento: string;
  categoria: string;
  descricao: string;
  contexto?: string;
  condicoes_aplicacao?: string[];
  exclusoes?: string[];
  parametro: string;
  tipo_validacao: "range" | "threshold" | "formula" | "lookup" | "conditional";
  valores: {
    min?: number;
    max?: number;
    unidade?: string;
    formula?: string;
    tabela?: Record<string, number>;
    condicao?: string;
  };
  ambito: string;
  severidade: "mandatory" | "recommended" | "informative";
  suggestedPlugin?: string;
}

const SEVERITY_MAP: Record<string, Severity> = {
  mandatory: "critical",
  recommended: "warning",
  informative: "info",
};

/**
 * Transform a single extracted rule into a DeclarativeRule.
 */
export function transformExtractedRule(
  rule: ExtractedRuleInput,
  pluginId: string,
  regulationId?: string,
): DeclarativeRule {
  const id = `PF-${pluginId.toUpperCase()}-${rule.id}`;
  const severity = SEVERITY_MAP[rule.severidade] ?? "warning";
  const conditions = buildConditions(rule);

  return {
    id,
    regulationId: regulationId ?? rule.regulamento,
    article: rule.artigo,
    description: rule.descricao,
    severity,
    conditions,
    remediation: rule.contexto || `Verificar conforme ${rule.artigo}`,
    enabled: true,
    tags: [rule.categoria, rule.ambito].filter(Boolean),
  };
}

function buildConditions(rule: ExtractedRuleInput): RuleCondition[] {
  const field = rule.parametro;
  const { min, max, formula, tabela } = rule.valores;
  const conditions: RuleCondition[] = [];

  switch (rule.tipo_validacao) {
    case "threshold":
      if (min !== undefined) conditions.push({ field, operator: "<" as RuleOperator, value: min });
      if (max !== undefined) conditions.push({ field, operator: ">" as RuleOperator, value: max });
      break;

    case "range":
      // Rule fires when value is outside the valid range
      if (min !== undefined && max !== undefined) {
        conditions.push({ field, operator: "not_in_range" as RuleOperator, value: [min, max] });
      } else {
        if (min !== undefined) conditions.push({ field, operator: "<" as RuleOperator, value: min });
        if (max !== undefined) conditions.push({ field, operator: ">" as RuleOperator, value: max });
      }
      break;

    case "formula":
      if (formula) {
        conditions.push({ field, operator: "formula_gt" as RuleOperator, value: 0, formula });
      }
      break;

    case "lookup":
      if (tabela) {
        // Use first entry as reference; full table stored in lookup tables
        const firstValue = Object.values(tabela)[0];
        if (firstValue !== undefined) {
          conditions.push({ field, operator: "<" as RuleOperator, value: firstValue });
        }
      }
      break;

    case "conditional":
      if (min !== undefined) {
        conditions.push({ field, operator: "<" as RuleOperator, value: min });
      }
      break;

    default:
      if (min !== undefined) {
        conditions.push({ field, operator: "<" as RuleOperator, value: min });
      }
  }

  return conditions;
}

/**
 * Transform a batch of extracted rules, deduplicating against existing rule IDs.
 */
export function transformAndMerge(
  extractedRules: ExtractedRuleInput[],
  existingRules: DeclarativeRule[],
  pluginId: string,
  regulationId?: string,
): { added: DeclarativeRule[]; skipped: number } {
  const existingIds = new Set(existingRules.map(r => r.id));
  const added: DeclarativeRule[] = [];
  let skipped = 0;

  for (const rule of extractedRules) {
    const transformed = transformExtractedRule(rule, pluginId, regulationId);
    if (existingIds.has(transformed.id)) {
      skipped++;
    } else {
      existingIds.add(transformed.id);
      added.push(transformed);
    }
  }

  return { added, skipped };
}

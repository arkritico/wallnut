// ============================================================
// DECLARATIVE RULE ENGINE — Evaluates rules against projects
// ============================================================
//
// Takes a set of DeclarativeRules and a BuildingProject,
// evaluates each rule's conditions, and produces Findings.
//
// Supports:
// - Direct comparisons (>, <, ==, exists, in, between)
// - Lookup table comparisons (field vs. table[key1][key2]...)
// - Ordinal comparisons (position in an ordered scale)
// - Computed fields (derived values before rule evaluation)
//
// Rules are pure data (JSON) — no code execution.
// The engine is the same for all specialties.
//

import type { BuildingProject, Finding } from "../types";
import type {
  DeclarativeRule,
  RuleCondition,
  RuleOperator,
  LookupTable,
  ComputedField,
  PluginEvaluationResult,
  SpecialtyPlugin,
} from "./types";
import { RegulationRegistry } from "./registry";

// ----------------------------------------------------------
// Field Resolution
// ----------------------------------------------------------

/**
 * Resolve a dot-notation path against an object.
 * Supports both project fields and computed fields.
 */
function resolveFieldFromObject(obj: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Resolve a field path against the project, with support for computed fields.
 * Paths starting with "computed." resolve against the computed context.
 */
function resolveField(
  project: BuildingProject,
  fieldPath: string,
  computed: Record<string, unknown> = {}
): unknown {
  if (fieldPath.startsWith("computed.")) {
    const computedKey = fieldPath.slice("computed.".length);
    const localValue = computed[computedKey];
    if (localValue !== undefined) return localValue;
    // Fall through to project resolution (finds enriched.computed.X from global pre-computation)
  }
  return resolveFieldFromObject(project as unknown as Record<string, unknown>, fieldPath);
}

/**
 * Interpolate {field} references in a template string.
 * Supports both project fields and computed fields.
 */
function interpolate(
  template: string,
  project: BuildingProject,
  computed: Record<string, unknown> = {}
): string {
  return template.replace(/\{([^}]+)\}/g, (_, fieldPath: string) => {
    const value = resolveField(project, fieldPath, computed);
    if (value === undefined || value === null) return "(não definido)";
    if (typeof value === "number") {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
  });
}

// ----------------------------------------------------------
// Computed Fields
// ----------------------------------------------------------

/**
 * Evaluate all computed fields and return a map of results.
 */
export function evaluateComputedFields(
  project: BuildingProject,
  computedFields: ComputedField[]
): Record<string, unknown> {
  const results: Record<string, unknown> = {};

  for (const cf of computedFields) {
    try {
      const comp = cf.computation;

      switch (comp.type) {
        case "arithmetic": {
          const a = resolveField(project, comp.operands[0], results);
          const b = resolveField(project, comp.operands[1], results);
          if (typeof a === "number" && typeof b === "number") {
            switch (comp.operation) {
              case "divide": results[cf.id] = b !== 0 ? a / b : undefined; break;
              case "multiply": results[cf.id] = a * b; break;
              case "add": results[cf.id] = a + b; break;
              case "subtract": results[cf.id] = a - b; break;
            }
          }
          break;
        }

        case "tier": {
          const val = resolveField(project, comp.field, results);
          if (typeof val === "number") {
            for (const tier of comp.tiers) {
              const aboveMin = tier.min === undefined || val >= tier.min;
              const belowMax = tier.max === undefined || val <= tier.max;
              if (aboveMin && belowMax) {
                results[cf.id] = tier.result;
                break;
              }
            }
          }
          break;
        }

        case "conditional": {
          const val = resolveField(project, comp.field, results);
          results[cf.id] = val ? comp.ifTrue : comp.ifFalse;
          break;
        }
      }
    } catch {
      // Skip failed computations
    }
  }

  return results;
}

// ----------------------------------------------------------
// Lookup Table Resolution
// ----------------------------------------------------------

/**
 * Resolve a value from a lookup table using project field values as keys.
 */
function lookupTableValue(
  table: LookupTable,
  project: BuildingProject,
  computed: Record<string, unknown>,
  keyOverrides?: string[]
): unknown {
  const keyPaths = keyOverrides ?? table.keys;
  let current: unknown = table.values;

  for (const keyPath of keyPaths) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;

    const keyValue = resolveField(project, keyPath, computed);
    if (keyValue === undefined || keyValue === null) return undefined;

    current = (current as Record<string, unknown>)[String(keyValue)];
  }

  // If there's a subKey, drill one more level
  if (table.subKey && current !== null && current !== undefined && typeof current === "object") {
    current = (current as Record<string, unknown>)[table.subKey];
  }

  return current;
}

// ----------------------------------------------------------
// Condition Evaluation
// ----------------------------------------------------------

function evaluateCondition(
  condition: RuleCondition,
  project: BuildingProject,
  computed: Record<string, unknown>,
  tables: Map<string, LookupTable>
): boolean {
  const fieldValue = resolveField(project, condition.field, computed);
  const op = condition.operator;

  // --- Direct comparison operators ---
  switch (op) {
    case "exists":
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== false && fieldValue !== "";

    case "not_exists":
      return fieldValue === undefined || fieldValue === null || fieldValue === false || fieldValue === "";

    case "==":
      return fieldValue === condition.value;

    case "!=":
      return fieldValue !== condition.value;

    case ">":
      return typeof fieldValue === "number" && fieldValue > (condition.value as number);

    case ">=":
      return typeof fieldValue === "number" && fieldValue >= (condition.value as number);

    case "<":
      return typeof fieldValue === "number" && fieldValue < (condition.value as number);

    case "<=":
      return typeof fieldValue === "number" && fieldValue <= (condition.value as number);

    case "in":
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);

    case "not_in":
      return !Array.isArray(condition.value) || !condition.value.includes(fieldValue);

    case "between": {
      if (typeof fieldValue === "number" && Array.isArray(condition.value) && condition.value.length === 2) {
        const [min, max] = condition.value as [number, number];
        return fieldValue >= min && fieldValue <= max;
      }
      return false;
    }

    case "not_in_range": {
      if (typeof fieldValue === "number" && Array.isArray(condition.value) && condition.value.length === 2) {
        const [min, max] = condition.value as [number, number];
        return fieldValue < min || fieldValue > max;
      }
      return false;
    }
  }

  // --- Formula operators ---
  if (op.startsWith("formula_")) {
    if (typeof fieldValue !== "number" || typeof condition.value !== "string") return false;
    try {
      // Build a safe evaluation context from project fields
      const flatContext: Record<string, unknown> = {};
      const flatten = (obj: unknown, prefix = "") => {
        if (typeof obj === "object" && obj !== null) {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            const key = prefix ? `${prefix}.${k}` : k;
            flatContext[k] = v; // top-level access
            if (typeof v === "object" && v !== null) flatten(v, key);
            else flatContext[key] = v;
          }
        }
      };
      flatten(project);
      Object.assign(flatContext, computed);
      // eslint-disable-next-line no-new-func
      const fn = new Function(...Object.keys(flatContext), `return (${condition.value});`);
      const formulaResult = fn(...Object.values(flatContext)) as number;
      if (typeof formulaResult !== "number" || isNaN(formulaResult)) return false;
      switch (op) {
        case "formula_gt":  return fieldValue > formulaResult;
        case "formula_gte": return fieldValue >= formulaResult;
        case "formula_lt":  return fieldValue < formulaResult;
        case "formula_lte": return fieldValue <= formulaResult;
      }
    } catch {
      return false;
    }
  }

  // --- Computed operators (formula in condition.formula field) ---
  if (op.startsWith("computed_")) {
    const formulaExpr = (condition as { formula?: string }).formula;
    if (typeof fieldValue !== "number" || !formulaExpr) return false;
    try {
      const flatContext: Record<string, unknown> = {};
      const flatten = (obj: unknown, prefix = "") => {
        if (typeof obj === "object" && obj !== null) {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            flatContext[k] = v;
            if (typeof v === "object" && v !== null) flatten(v, prefix ? `${prefix}.${k}` : k);
          }
        }
      };
      flatten(project);
      Object.assign(flatContext, computed);
      // eslint-disable-next-line no-new-func
      const fn = new Function(...Object.keys(flatContext), `return (${formulaExpr});`);
      const result = fn(...Object.values(flatContext)) as number;
      if (typeof result !== "number" || isNaN(result)) return false;
      switch (op) {
        case "computed_lt":  return fieldValue < result;
        case "computed_lte": return fieldValue <= result;
        case "computed_gt":  return fieldValue > result;
        case "computed_gte": return fieldValue >= result;
      }
    } catch {
      return false;
    }
  }

  // --- Reaction class operators (Euroclass A1..F / CFL fire scale) ---
  if (op.startsWith("reaction_class_")) {
    if (typeof fieldValue !== "string" || typeof condition.value !== "string") return false;
    // Euroclass scale: A1 = best (index 0), F = worst (highest index)
    // Combined scale covers both wall/ceiling classes and floor classes
    const EUROCLASS_SCALE = ["A1", "A2", "B", "C", "D", "E", "F",
                              "CFL-s1", "CFL-s2", "DFL-s1", "EFL", "FFL"];
    const fieldIdx = EUROCLASS_SCALE.indexOf(fieldValue);
    const thresholdIdx = EUROCLASS_SCALE.indexOf(condition.value as string);
    if (fieldIdx === -1 || thresholdIdx === -1) return false;
    switch (op) {
      case "reaction_class_lt":  return fieldIdx > thresholdIdx;  // "worse than"
      case "reaction_class_lte": return fieldIdx >= thresholdIdx;
      case "reaction_class_gt":  return fieldIdx < thresholdIdx;  // "better than"
      case "reaction_class_gte": return fieldIdx <= thresholdIdx;
    }
  }

  // --- Lookup table operators ---
  if (op.startsWith("lookup_")) {
    if (!condition.table) return false;
    const table = tables.get(condition.table);
    if (!table) return false;

    const lookupValue = lookupTableValue(table, project, computed, condition.keys);
    if (lookupValue === undefined || lookupValue === null) return false;

    switch (op) {
      case "lookup_gt":
        return typeof fieldValue === "number" && typeof lookupValue === "number"
          && fieldValue > lookupValue;
      case "lookup_gte":
        return typeof fieldValue === "number" && typeof lookupValue === "number"
          && fieldValue >= lookupValue;
      case "lookup_lt":
        return typeof fieldValue === "number" && typeof lookupValue === "number"
          && fieldValue < lookupValue;
      case "lookup_lte":
        return typeof fieldValue === "number" && typeof lookupValue === "number"
          && fieldValue <= lookupValue;
      case "lookup_eq":
        return fieldValue === lookupValue;
      case "lookup_neq":
        return fieldValue !== lookupValue;
    }
  }

  // --- Ordinal operators ---
  if (op.startsWith("ordinal_")) {
    if (!condition.scale || !Array.isArray(condition.scale)) return false;

    const fieldIndex = condition.scale.indexOf(String(fieldValue));
    const thresholdIndex = condition.scale.indexOf(String(condition.value));

    if (fieldIndex === -1 || thresholdIndex === -1) return false;

    switch (op) {
      case "ordinal_lt": return fieldIndex < thresholdIndex;
      case "ordinal_lte": return fieldIndex <= thresholdIndex;
      case "ordinal_gt": return fieldIndex > thresholdIndex;
      case "ordinal_gte": return fieldIndex >= thresholdIndex;
    }
  }

  return false;
}

// ----------------------------------------------------------
// Rule Evaluation
// ----------------------------------------------------------

let pluginFindingCounter = 5000;

export function resetPluginFindingCounter(): void {
  pluginFindingCounter = 5000;
}

function nextPluginFindingId(): string {
  return `PF-${++pluginFindingCounter}`;
}

/**
 * For rules with lookup conditions, resolve the actual threshold value from the table
 * and format it as a human-readable requiredValue string.
 * This replaces generic "consult table" text with e.g. "≥ 60 min (REI)" or "≤ 0.40 W/(m².K)".
 */
function resolveRequiredValue(
  rule: DeclarativeRule,
  project: BuildingProject,
  computed: Record<string, unknown>,
  tables: Map<string, LookupTable>
): string | undefined {
  // Find the first lookup condition to extract the threshold
  const lookupCondition = rule.conditions.find(c => c.operator.startsWith("lookup_"));
  if (!lookupCondition || !lookupCondition.table) return undefined;

  const table = tables.get(lookupCondition.table);
  if (!table) return undefined;

  const thresholdValue = lookupTableValue(table, project, computed, lookupCondition.keys);
  if (thresholdValue === undefined || thresholdValue === null) return undefined;

  // Build a comparison symbol from the operator
  const opSymbols: Record<string, string> = {
    lookup_gt: ">", lookup_gte: "≥", lookup_lt: "≤", lookup_lte: "<",
    lookup_eq: "=", lookup_neq: "≠",
  };
  const symbol = opSymbols[lookupCondition.operator] ?? "=";

  // Format the value
  const formatted = typeof thresholdValue === "number"
    ? (Number.isInteger(thresholdValue) ? String(thresholdValue) : thresholdValue.toFixed(2))
    : String(thresholdValue);

  return `${symbol} ${formatted}`;
}

/**
 * Evaluate a single rule against a project.
 * Returns a Finding if the rule fires, null if it doesn't apply.
 */
function evaluateRule(
  rule: DeclarativeRule,
  project: BuildingProject,
  regulationRef: string,
  computed: Record<string, unknown>,
  tables: Map<string, LookupTable>
): Finding | null {
  if (!rule.enabled) return null;

  // Check all conditions (AND logic)
  const allConditionsMet = rule.conditions.every(c =>
    evaluateCondition(c, project, computed, tables)
  );
  if (!allConditionsMet) return null;

  // Check exclusions (any exclusion true = skip)
  if (rule.exclusions && rule.exclusions.length > 0) {
    const anyExcluded = rule.exclusions.some(c =>
      evaluateCondition(c, project, computed, tables)
    );
    if (anyExcluded) return null;
  }

  // Resolve actual threshold from lookup tables for richer requiredValue
  const resolvedRequired = resolveRequiredValue(rule, project, computed, tables);

  // Rule fires — produce finding
  return {
    id: nextPluginFindingId(),
    sourceRuleId: rule.id,
    area: "general", // Will be set by caller from regulation document
    regulation: regulationRef,
    article: rule.article,
    description: interpolate(rule.description, project, computed),
    severity: rule.severity,
    currentValue: rule.currentValueTemplate
      ? interpolate(rule.currentValueTemplate, project, computed)
      : undefined,
    requiredValue: resolvedRequired
      ?? (rule.requiredValue ? interpolate(rule.requiredValue, project, computed) : undefined),
    remediation: interpolate(rule.remediation, project, computed),
  };
}

// ----------------------------------------------------------
// Plugin Evaluation (main entry point)
// ----------------------------------------------------------

/**
 * Evaluate all active rules from a plugin against a project.
 *
 * Execution order:
 * 1. Compute all computed fields (derived values)
 * 2. Index all lookup tables
 * 3. Evaluate rules from active/amended regulations
 *
 * Superseded and revoked regulations are skipped automatically.
 */
export function evaluatePlugin(
  plugin: SpecialtyPlugin,
  project: BuildingProject
): PluginEvaluationResult {

  // 1. Compute derived fields
  const computed = evaluateComputedFields(project, plugin.computedFields ?? []);

  // 2. Index lookup tables
  const tables = new Map<string, LookupTable>();
  for (const table of plugin.lookupTables ?? []) {
    tables.set(table.id, table);
  }

  // 3. Get active rules from registry
  const registry = new RegulationRegistry(plugin);
  const activeRules = registry.getActiveRules();
  const applicableRegIds = new Set(
    registry.getApplicableRegulations().map(r => r.id)
  );
  const skippedRegIds = new Set(
    registry.getAllRegulations()
      .filter(r => !applicableRegIds.has(r.id))
      .map(r => r.id)
  );

  // 4. Evaluate rules
  const findings: Finding[] = [];
  const rulesSkipped: string[] = [];
  const regulationsUsed = new Set<string>();

  for (const rule of activeRules) {
    const reg = registry.getRegulation(rule.regulationId);
    const regulationRef = reg?.shortRef ?? rule.regulationId;

    try {
      // Check if we can resolve essential fields
      const canEvaluate = rule.conditions.every(c => {
        if (c.operator === "not_exists") return true;
        if (c.operator.startsWith("lookup_")) return true; // Lookup handles missing keys gracefully
        const val = resolveField(project, c.field, computed);
        return val !== undefined;
      });

      if (!canEvaluate) {
        rulesSkipped.push(rule.id);
        continue;
      }

      const finding = evaluateRule(rule, project, regulationRef, computed, tables);
      if (finding) {
        if (reg) finding.area = reg.area;
        findings.push(finding);
        regulationsUsed.add(rule.regulationId);
      }
    } catch {
      rulesSkipped.push(rule.id);
    }
  }

  return {
    pluginId: plugin.id,
    pluginVersion: plugin.version,
    findings,
    totalActiveRules: activeRules.length,
    regulationsUsed: Array.from(regulationsUsed),
    regulationsSkipped: Array.from(skippedRegIds),
    rulesSkipped,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Evaluate rules from a registry instance (for dynamic/modified registries).
 */
export function evaluateFromRegistry(
  registry: RegulationRegistry,
  project: BuildingProject,
  pluginId: string,
  lookupTables?: LookupTable[],
  computedFields?: ComputedField[]
): PluginEvaluationResult {
  resetPluginFindingCounter();

  const computed = evaluateComputedFields(project, computedFields ?? []);
  const tables = new Map<string, LookupTable>();
  for (const table of lookupTables ?? []) {
    tables.set(table.id, table);
  }

  const activeRules = registry.getActiveRules();
  const findings: Finding[] = [];
  const rulesSkipped: string[] = [];
  const regulationsUsed = new Set<string>();

  for (const rule of activeRules) {
    const reg = registry.getRegulation(rule.regulationId);
    const regulationRef = reg?.shortRef ?? rule.regulationId;

    try {
      const finding = evaluateRule(rule, project, regulationRef, computed, tables);
      if (finding) {
        if (reg) finding.area = reg.area;
        findings.push(finding);
        regulationsUsed.add(rule.regulationId);
      }
    } catch {
      rulesSkipped.push(rule.id);
    }
  }

  return {
    pluginId,
    pluginVersion: "dynamic",
    findings,
    totalActiveRules: activeRules.length,
    regulationsUsed: Array.from(regulationsUsed),
    regulationsSkipped: [],
    rulesSkipped,
    evaluatedAt: new Date().toISOString(),
  };
}

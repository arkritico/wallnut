// ============================================================
// PLUGIN VALIDATOR — Schema compliance checking for plugin data
// ============================================================
//
// Development/tooling utility for validating plugin JSON files.
// Can be used programmatically via exported functions or as a
// CLI entry point for CI/pre-commit validation.
//
// Usage (programmatic):
//   import { validateLoadedPlugin, validateAllLoadedPlugins } from "./validate";
//   const results = validateAllLoadedPlugins();
//   results.forEach(r => console.log(r.pluginId, r.valid ? "OK" : "FAIL"));
//
// Usage (CLI):
//   npx tsx src/lib/plugins/validate.ts [--plugin <id>] [--verbose] [--json]
//

import type {
  SpecialtyPlugin,
  RegulationDocument,
  DeclarativeRule,
  RuleCondition,
  RuleOperator,
  LookupTable,
  ComputedField,
  RegulationStatus,
  SourceType,
  LegalForce,
  IngestionStatus,
} from "./types";
import { getAvailablePlugins } from "./loader";

// ----------------------------------------------------------
// Validation result types
// ----------------------------------------------------------

export interface ValidationError {
  file: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  pluginId: string;
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  stats: {
    regulationCount: number;
    ruleCount: number;
    lookupTableCount: number;
    computedFieldCount: number;
  };
}

// ----------------------------------------------------------
// Valid enum values (derived from types.ts)
// ----------------------------------------------------------

const VALID_SEVERITIES = new Set<string>(["critical", "warning", "info", "pass"]);

const VALID_REGULATION_STATUSES = new Set<string>([
  "active", "amended", "superseded", "revoked", "draft",
]);

const VALID_SOURCE_TYPES = new Set<string>([
  "public_dre", "public_erse", "public_operator",
  "proprietary_iec", "proprietary_ipq", "proprietary_en",
  "manual_extract",
]);

const VALID_LEGAL_FORCES = new Set<string>([
  "legal", "regulatory", "normative", "contractual", "informative",
]);

const VALID_INGESTION_STATUSES = new Set<string>([
  "pending", "partial", "complete", "verified",
]);

const VALID_RULE_OPERATORS = new Set<string>([
  // Direct comparison
  ">", ">=", "<", "<=", "==", "!=",
  // Existence
  "exists", "not_exists",
  // Set membership
  "in", "not_in", "between", "not_in_range",
  // Lookup table
  "lookup_gt", "lookup_gte", "lookup_lt", "lookup_lte", "lookup_eq", "lookup_neq",
  // Ordinal
  "ordinal_lt", "ordinal_lte", "ordinal_gt", "ordinal_gte",
  // Formula
  "formula_gt", "formula_gte", "formula_lt", "formula_lte",
  // Computed (formula in separate condition.formula field)
  "computed_lt", "computed_lte", "computed_gt", "computed_gte",
  // Fire reaction class ordinal
  "reaction_class_lt", "reaction_class_lte", "reaction_class_gt", "reaction_class_gte",
]);

const LOOKUP_OPERATORS = new Set<string>([
  "lookup_gt", "lookup_gte", "lookup_lt", "lookup_lte", "lookup_eq", "lookup_neq",
]);

const ORDINAL_OPERATORS = new Set<string>([
  "ordinal_lt", "ordinal_lte", "ordinal_gt", "ordinal_gte",
]);

const VALID_COMPUTATION_TYPES = new Set<string>(["arithmetic", "tier", "conditional"]);

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

// ----------------------------------------------------------
// Helper utilities
// ----------------------------------------------------------

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.length > 0;
}

function isNonEmptyArray(val: unknown): val is unknown[] {
  return Array.isArray(val) && val.length > 0;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

// ----------------------------------------------------------
// Plugin metadata validation (plugin.json)
// ----------------------------------------------------------

function validatePluginMetadata(plugin: SpecialtyPlugin): ValidationError[] {
  const errors: ValidationError[] = [];
  const file = "plugin.json";

  if (!isNonEmptyString(plugin.id)) {
    errors.push({ file, path: "id", message: "Plugin 'id' is required and must be a non-empty string", severity: "error" });
  }

  if (!isNonEmptyString(plugin.name)) {
    errors.push({ file, path: "name", message: "Plugin 'name' is required and must be a non-empty string", severity: "error" });
  }

  if (!isNonEmptyString(plugin.version)) {
    errors.push({ file, path: "version", message: "Plugin 'version' is required and must be a non-empty string", severity: "error" });
  } else if (!SEMVER_PATTERN.test(plugin.version)) {
    errors.push({ file, path: "version", message: `Plugin 'version' must match semver pattern ^\\d+\\.\\d+\\.\\d+$ (got "${plugin.version}")`, severity: "error" });
  }

  if (!isNonEmptyArray(plugin.areas)) {
    errors.push({ file, path: "areas", message: "Plugin 'areas' is required and must be a non-empty array of strings", severity: "error" });
  } else {
    for (let i = 0; i < plugin.areas.length; i++) {
      if (!isNonEmptyString(plugin.areas[i])) {
        errors.push({ file, path: `areas[${i}]`, message: `Each area must be a non-empty string`, severity: "error" });
      }
    }
  }

  if (!isNonEmptyString(plugin.description)) {
    errors.push({ file, path: "description", message: "Plugin 'description' is required and must be a non-empty string", severity: "error" });
  }

  if (!isNonEmptyString(plugin.author)) {
    errors.push({ file, path: "author", message: "Plugin 'author' is required and must be a non-empty string", severity: "error" });
  }

  if (!isNonEmptyString(plugin.lastUpdated)) {
    errors.push({ file, path: "lastUpdated", message: "Plugin 'lastUpdated' is required and must be a non-empty string", severity: "error" });
  }

  return errors;
}

// ----------------------------------------------------------
// Regulation registry validation (registry.json)
// ----------------------------------------------------------

function validateRegulations(regulations: RegulationDocument[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const file = "registry.json";

  if (!Array.isArray(regulations)) {
    errors.push({ file, path: "regulations", message: "'regulations' must be an array", severity: "error" });
    return errors;
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < regulations.length; i++) {
    const reg = regulations[i];
    const prefix = `regulations[${i}]`;

    // Required fields
    if (!isNonEmptyString(reg.id)) {
      errors.push({ file, path: `${prefix}.id`, message: "Regulation 'id' is required and must be a non-empty string", severity: "error" });
    } else {
      if (seenIds.has(reg.id)) {
        errors.push({ file, path: `${prefix}.id`, message: `Duplicate regulation ID: "${reg.id}"`, severity: "error" });
      }
      seenIds.add(reg.id);
    }

    if (!isNonEmptyString(reg.shortRef)) {
      errors.push({ file, path: `${prefix}.shortRef`, message: "Regulation 'shortRef' is required", severity: "error" });
    }

    if (!isNonEmptyString(reg.title)) {
      errors.push({ file, path: `${prefix}.title`, message: "Regulation 'title' is required", severity: "error" });
    }

    if (!isNonEmptyString(reg.status)) {
      errors.push({ file, path: `${prefix}.status`, message: "Regulation 'status' is required", severity: "error" });
    } else if (!VALID_REGULATION_STATUSES.has(reg.status)) {
      errors.push({ file, path: `${prefix}.status`, message: `Invalid regulation status: "${reg.status}". Must be one of: ${Array.from(VALID_REGULATION_STATUSES).join(", ")}`, severity: "error" });
    }

    if (!isNonEmptyString(reg.effectiveDate)) {
      errors.push({ file, path: `${prefix}.effectiveDate`, message: "Regulation 'effectiveDate' is required", severity: "error" });
    }

    if (!isNonEmptyString(reg.sourceType)) {
      errors.push({ file, path: `${prefix}.sourceType`, message: "Regulation 'sourceType' is required", severity: "error" });
    } else if (!VALID_SOURCE_TYPES.has(reg.sourceType)) {
      errors.push({ file, path: `${prefix}.sourceType`, message: `Invalid sourceType: "${reg.sourceType}". Must be one of: ${Array.from(VALID_SOURCE_TYPES).join(", ")}`, severity: "error" });
    }

    if (!isNonEmptyString(reg.legalForce)) {
      errors.push({ file, path: `${prefix}.legalForce`, message: "Regulation 'legalForce' is required", severity: "error" });
    } else if (!VALID_LEGAL_FORCES.has(reg.legalForce)) {
      errors.push({ file, path: `${prefix}.legalForce`, message: `Invalid legalForce: "${reg.legalForce}". Must be one of: ${Array.from(VALID_LEGAL_FORCES).join(", ")}`, severity: "error" });
    }

    if (!isNonEmptyString(reg.area)) {
      errors.push({ file, path: `${prefix}.area`, message: "Regulation 'area' is required", severity: "error" });
    }

    if (!isNonEmptyString(reg.ingestionStatus)) {
      errors.push({ file, path: `${prefix}.ingestionStatus`, message: "Regulation 'ingestionStatus' is required", severity: "error" });
    } else if (!VALID_INGESTION_STATUSES.has(reg.ingestionStatus)) {
      errors.push({ file, path: `${prefix}.ingestionStatus`, message: `Invalid ingestionStatus: "${reg.ingestionStatus}". Must be one of: ${Array.from(VALID_INGESTION_STATUSES).join(", ")}`, severity: "error" });
    }

    if (typeof reg.rulesCount !== "number") {
      errors.push({ file, path: `${prefix}.rulesCount`, message: "Regulation 'rulesCount' is required and must be a number", severity: "error" });
    }

    if (!Array.isArray(reg.tags)) {
      errors.push({ file, path: `${prefix}.tags`, message: "Regulation 'tags' is required and must be an array", severity: "error" });
    }
  }

  return errors;
}

// ----------------------------------------------------------
// Rules validation (rules.json)
// ----------------------------------------------------------

function validateRules(
  rules: DeclarativeRule[],
  regulationIds: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const file = "rules.json";

  if (!Array.isArray(rules)) {
    errors.push({ file, path: "rules", message: "'rules' must be an array", severity: "error" });
    return errors;
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const prefix = `rules[${i}]`;

    // Required string fields
    if (!isNonEmptyString(rule.id)) {
      errors.push({ file, path: `${prefix}.id`, message: "Rule 'id' is required and must be a non-empty string", severity: "error" });
    } else {
      if (seenIds.has(rule.id)) {
        errors.push({ file, path: `${prefix}.id`, message: `Duplicate rule ID: "${rule.id}"`, severity: "error" });
      }
      seenIds.add(rule.id);
    }

    if (!isNonEmptyString(rule.regulationId)) {
      errors.push({ file, path: `${prefix}.regulationId`, message: "Rule 'regulationId' is required", severity: "error" });
    } else if (!regulationIds.has(rule.regulationId)) {
      errors.push({ file, path: `${prefix}.regulationId`, message: `Rule references unknown regulation: "${rule.regulationId}"`, severity: "error" });
    }

    if (!isNonEmptyString(rule.article)) {
      errors.push({ file, path: `${prefix}.article`, message: "Rule 'article' is required", severity: "error" });
    }

    if (!isNonEmptyString(rule.description)) {
      errors.push({ file, path: `${prefix}.description`, message: "Rule 'description' is required", severity: "error" });
    }

    // Severity
    if (!isNonEmptyString(rule.severity)) {
      errors.push({ file, path: `${prefix}.severity`, message: "Rule 'severity' is required", severity: "error" });
    } else if (!VALID_SEVERITIES.has(rule.severity)) {
      errors.push({ file, path: `${prefix}.severity`, message: `Invalid rule severity: "${rule.severity}". Must be one of: ${Array.from(VALID_SEVERITIES).join(", ")}`, severity: "error" });
    }

    // Conditions
    if (!isNonEmptyArray(rule.conditions)) {
      errors.push({ file, path: `${prefix}.conditions`, message: "Rule 'conditions' is required and must be a non-empty array", severity: "error" });
    } else {
      for (let j = 0; j < rule.conditions.length; j++) {
        const condErrors = validateCondition(rule.conditions[j], `${prefix}.conditions[${j}]`, file);
        errors.push(...condErrors);
      }
    }

    // Exclusions (optional, but if present must be valid)
    if (rule.exclusions !== undefined) {
      if (!Array.isArray(rule.exclusions)) {
        errors.push({ file, path: `${prefix}.exclusions`, message: "Rule 'exclusions' must be an array if present", severity: "error" });
      } else {
        for (let j = 0; j < rule.exclusions.length; j++) {
          const condErrors = validateCondition(rule.exclusions[j], `${prefix}.exclusions[${j}]`, file);
          errors.push(...condErrors);
        }
      }
    }

    // Remediation
    if (!isNonEmptyString(rule.remediation)) {
      errors.push({ file, path: `${prefix}.remediation`, message: "Rule 'remediation' is required", severity: "error" });
    }

    // Enabled
    if (typeof rule.enabled !== "boolean") {
      errors.push({ file, path: `${prefix}.enabled`, message: "Rule 'enabled' is required and must be a boolean", severity: "error" });
    }

    // Tags
    if (!Array.isArray(rule.tags)) {
      errors.push({ file, path: `${prefix}.tags`, message: "Rule 'tags' is required and must be an array", severity: "error" });
    }
  }

  return errors;
}

function validateCondition(
  condition: RuleCondition,
  path: string,
  file: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isNonEmptyString(condition.field)) {
    errors.push({ file, path: `${path}.field`, message: "Condition 'field' is required and must be a non-empty string", severity: "error" });
  }

  if (!isNonEmptyString(condition.operator)) {
    errors.push({ file, path: `${path}.operator`, message: "Condition 'operator' is required", severity: "error" });
  } else if (!VALID_RULE_OPERATORS.has(condition.operator)) {
    errors.push({ file, path: `${path}.operator`, message: `Invalid condition operator: "${condition.operator}". Must be one of: ${Array.from(VALID_RULE_OPERATORS).join(", ")}`, severity: "error" });
  } else {
    // Lookup operators require 'table' field
    if (LOOKUP_OPERATORS.has(condition.operator)) {
      if (!isNonEmptyString(condition.table)) {
        errors.push({ file, path: `${path}.table`, message: `Lookup operator "${condition.operator}" requires a 'table' field`, severity: "error" });
      }
    }

    // Ordinal operators require 'scale' field
    if (ORDINAL_OPERATORS.has(condition.operator)) {
      if (!isNonEmptyArray(condition.scale)) {
        errors.push({ file, path: `${path}.scale`, message: `Ordinal operator "${condition.operator}" requires a non-empty 'scale' array`, severity: "error" });
      }
    }
  }

  return errors;
}

// ----------------------------------------------------------
// Lookup tables validation (lookup-tables.json)
// ----------------------------------------------------------

function validateLookupTables(tables: LookupTable[] | undefined): ValidationError[] {
  const errors: ValidationError[] = [];
  const file = "lookup-tables.json";

  if (tables === undefined) {
    return errors;
  }

  if (!Array.isArray(tables)) {
    errors.push({ file, path: "tables", message: "'tables' must be an array", severity: "error" });
    return errors;
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const prefix = `tables[${i}]`;

    if (!isNonEmptyString(table.id)) {
      errors.push({ file, path: `${prefix}.id`, message: "Lookup table 'id' is required and must be a non-empty string", severity: "error" });
    } else {
      if (seenIds.has(table.id)) {
        errors.push({ file, path: `${prefix}.id`, message: `Duplicate lookup table ID: "${table.id}"`, severity: "error" });
      }
      seenIds.add(table.id);
    }

    if (!isNonEmptyString(table.description)) {
      errors.push({ file, path: `${prefix}.description`, message: "Lookup table 'description' is required", severity: "error" });
    }

    if (!isNonEmptyArray(table.keys)) {
      errors.push({ file, path: `${prefix}.keys`, message: "Lookup table 'keys' is required and must be a non-empty array", severity: "error" });
    }

    if (!isObject(table.values) || Object.keys(table.values).length === 0) {
      errors.push({ file, path: `${prefix}.values`, message: "Lookup table 'values' is required and must be a non-empty object", severity: "error" });
    }
  }

  return errors;
}

// ----------------------------------------------------------
// Computed fields validation (computed-fields.json)
// ----------------------------------------------------------

function validateComputedFields(fields: ComputedField[] | undefined): ValidationError[] {
  const errors: ValidationError[] = [];
  const file = "computed-fields.json";

  if (fields === undefined) {
    return errors;
  }

  if (!Array.isArray(fields)) {
    errors.push({ file, path: "fields", message: "'fields' must be an array", severity: "error" });
    return errors;
  }

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const prefix = `fields[${i}]`;

    if (!isNonEmptyString(field.id)) {
      errors.push({ file, path: `${prefix}.id`, message: "Computed field 'id' is required and must be a non-empty string", severity: "error" });
    }

    if (!isNonEmptyString(field.description)) {
      errors.push({ file, path: `${prefix}.description`, message: "Computed field 'description' is required", severity: "error" });
    }

    if (!field.computation) {
      errors.push({ file, path: `${prefix}.computation`, message: "Computed field 'computation' is required", severity: "error" });
      continue;
    }

    const comp = field.computation;

    if (!VALID_COMPUTATION_TYPES.has(comp.type)) {
      errors.push({ file, path: `${prefix}.computation.type`, message: `Invalid computation type: "${comp.type}". Must be one of: ${Array.from(VALID_COMPUTATION_TYPES).join(", ")}`, severity: "error" });
      continue;
    }

    switch (comp.type) {
      case "arithmetic": {
        if (!Array.isArray(comp.operands) || comp.operands.length !== 2) {
          errors.push({ file, path: `${prefix}.computation.operands`, message: "Arithmetic computation requires 'operands' as a 2-element array", severity: "error" });
        }
        if (!isNonEmptyString(comp.operation)) {
          errors.push({ file, path: `${prefix}.computation.operation`, message: "Arithmetic computation requires 'operation'", severity: "error" });
        }
        break;
      }
      case "tier": {
        if (!isNonEmptyString(comp.field)) {
          errors.push({ file, path: `${prefix}.computation.field`, message: "Tier computation requires 'field'", severity: "error" });
        }
        if (!isNonEmptyArray(comp.tiers)) {
          errors.push({ file, path: `${prefix}.computation.tiers`, message: "Tier computation requires a non-empty 'tiers' array", severity: "error" });
        }
        break;
      }
      case "conditional": {
        if (!isNonEmptyString(comp.field)) {
          errors.push({ file, path: `${prefix}.computation.field`, message: "Conditional computation requires 'field'", severity: "error" });
        }
        if (!("ifTrue" in comp)) {
          errors.push({ file, path: `${prefix}.computation.ifTrue`, message: "Conditional computation requires 'ifTrue'", severity: "error" });
        }
        if (!("ifFalse" in comp)) {
          errors.push({ file, path: `${prefix}.computation.ifFalse`, message: "Conditional computation requires 'ifFalse'", severity: "error" });
        }
        break;
      }
    }
  }

  return errors;
}

// ----------------------------------------------------------
// Cross-validation warnings
// ----------------------------------------------------------

function validateCrossReferences(plugin: SpecialtyPlugin): ValidationError[] {
  const warnings: ValidationError[] = [];

  // Check that rulesCount in regulations roughly matches actual rule count
  for (const reg of plugin.regulations) {
    const actualRuleCount = plugin.rules.filter(r => r.regulationId === reg.id).length;
    if (reg.rulesCount !== actualRuleCount) {
      warnings.push({
        file: "registry.json",
        path: `regulations[${reg.id}].rulesCount`,
        message: `Regulation "${reg.id}" declares rulesCount=${reg.rulesCount} but has ${actualRuleCount} rules in the rules file`,
        severity: "warning",
      });
    }
  }

  // Check that lookup tables referenced by rules actually exist
  if (plugin.lookupTables) {
    const tableIds = new Set(plugin.lookupTables.map(t => t.id));
    for (const rule of plugin.rules) {
      for (const cond of rule.conditions) {
        if (cond.table && !tableIds.has(cond.table)) {
          warnings.push({
            file: "rules.json",
            path: `rules[${rule.id}].conditions`,
            message: `Rule "${rule.id}" references lookup table "${cond.table}" which does not exist in lookup-tables.json`,
            severity: "warning",
          });
        }
      }
      if (rule.exclusions) {
        for (const cond of rule.exclusions) {
          if (cond.table && !tableIds.has(cond.table)) {
            warnings.push({
              file: "rules.json",
              path: `rules[${rule.id}].exclusions`,
              message: `Rule "${rule.id}" exclusion references lookup table "${cond.table}" which does not exist in lookup-tables.json`,
              severity: "warning",
            });
          }
        }
      }
    }
  }

  // Check for disabled rules (informational warning)
  const disabledRules = plugin.rules.filter(r => !r.enabled);
  if (disabledRules.length > 0) {
    warnings.push({
      file: "rules.json",
      path: "rules",
      message: `${disabledRules.length} rule(s) are disabled: ${disabledRules.map(r => r.id).join(", ")}`,
      severity: "warning",
    });
  }

  return warnings;
}

// ----------------------------------------------------------
// Main validation functions
// ----------------------------------------------------------

/**
 * Validate an already-loaded SpecialtyPlugin object.
 * This works with plugins loaded via the loader (static imports).
 */
export function validateLoadedPlugin(plugin: SpecialtyPlugin): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  // 1. Plugin metadata
  allErrors.push(...validatePluginMetadata(plugin));

  // 2. Regulations
  allErrors.push(...validateRegulations(plugin.regulations));

  // 3. Rules (with regulation IDs for cross-reference)
  const regulationIds = new Set(plugin.regulations.map(r => r.id));
  allErrors.push(...validateRules(plugin.rules, regulationIds));

  // 4. Lookup tables
  allErrors.push(...validateLookupTables(plugin.lookupTables));

  // 5. Computed fields
  allErrors.push(...validateComputedFields(plugin.computedFields));

  // 6. Cross-reference warnings
  allWarnings.push(...validateCrossReferences(plugin));

  return {
    pluginId: plugin.id || "<unknown>",
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    stats: {
      regulationCount: Array.isArray(plugin.regulations) ? plugin.regulations.length : 0,
      ruleCount: Array.isArray(plugin.rules) ? plugin.rules.length : 0,
      lookupTableCount: Array.isArray(plugin.lookupTables) ? plugin.lookupTables.length : 0,
      computedFieldCount: Array.isArray(plugin.computedFields) ? plugin.computedFields.length : 0,
    },
  };
}

/**
 * Validate all loaded plugins (all 18 built-in specialties).
 * Uses getAvailablePlugins() from the loader.
 */
export function validateAllLoadedPlugins(): ValidationResult[] {
  const plugins = getAvailablePlugins();
  return plugins.map(plugin => validateLoadedPlugin(plugin));
}

/**
 * Validate a plugin from a directory on disk.
 * Reads and parses the JSON files from the given pluginDir.
 *
 * Expected directory structure:
 *   pluginDir/
 *     plugin.json
 *     regulations/
 *       registry.json
 *       <reg-id>/
 *         rules.json
 *     lookup-tables.json     (optional)
 *     computed-fields.json   (optional)
 */
export function validatePlugin(pluginDir: string): ValidationResult {
  // Dynamic import of fs and path for disk-based validation
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path") as typeof import("path");

  const errors: ValidationError[] = [];

  // Read plugin.json
  const pluginJsonPath = path.join(pluginDir, "plugin.json");
  let pluginDef: Record<string, unknown>;
  try {
    pluginDef = JSON.parse(fs.readFileSync(pluginJsonPath, "utf-8"));
  } catch (e) {
    errors.push({
      file: "plugin.json",
      path: "",
      message: `Failed to read or parse plugin.json: ${e instanceof Error ? e.message : String(e)}`,
      severity: "error",
    });
    return {
      pluginId: "<unknown>",
      valid: false,
      errors,
      warnings: [],
      stats: { regulationCount: 0, ruleCount: 0, lookupTableCount: 0, computedFieldCount: 0 },
    };
  }

  // Read registry.json
  const registryPath = path.join(pluginDir, "regulations", "registry.json");
  let registry: { regulations: RegulationDocument[] };
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  } catch (e) {
    errors.push({
      file: "registry.json",
      path: "",
      message: `Failed to read or parse registry.json: ${e instanceof Error ? e.message : String(e)}`,
      severity: "error",
    });
    registry = { regulations: [] };
  }

  // Read all rules.json files from regulation subdirectories
  const allRules: DeclarativeRule[] = [];
  const regulationsDir = path.join(pluginDir, "regulations");
  if (fs.existsSync(regulationsDir)) {
    const entries = fs.readdirSync(regulationsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const rulesPath = path.join(regulationsDir, entry.name, "rules.json");
        if (fs.existsSync(rulesPath)) {
          try {
            const rulesFile = JSON.parse(fs.readFileSync(rulesPath, "utf-8"));
            if (Array.isArray(rulesFile.rules)) {
              allRules.push(...rulesFile.rules);
            }
          } catch (e) {
            errors.push({
              file: `regulations/${entry.name}/rules.json`,
              path: "",
              message: `Failed to read or parse rules.json: ${e instanceof Error ? e.message : String(e)}`,
              severity: "error",
            });
          }
        }
      }
    }
  }

  // Read optional lookup-tables.json
  let lookupTables: LookupTable[] | undefined;
  const lookupTablesPath = path.join(pluginDir, "lookup-tables.json");
  if (fs.existsSync(lookupTablesPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(lookupTablesPath, "utf-8"));
      lookupTables = parsed.tables;
    } catch (e) {
      errors.push({
        file: "lookup-tables.json",
        path: "",
        message: `Failed to read or parse lookup-tables.json: ${e instanceof Error ? e.message : String(e)}`,
        severity: "error",
      });
    }
  }

  // Read optional computed-fields.json
  let computedFields: ComputedField[] | undefined;
  const computedFieldsPath = path.join(pluginDir, "computed-fields.json");
  if (fs.existsSync(computedFieldsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(computedFieldsPath, "utf-8"));
      computedFields = parsed.fields;
    } catch (e) {
      errors.push({
        file: "computed-fields.json",
        path: "",
        message: `Failed to read or parse computed-fields.json: ${e instanceof Error ? e.message : String(e)}`,
        severity: "error",
      });
    }
  }

  // Assemble into a SpecialtyPlugin shape for validation
  const assembledPlugin: SpecialtyPlugin = {
    id: pluginDef.id as string,
    name: pluginDef.name as string,
    version: pluginDef.version as string,
    areas: pluginDef.areas as SpecialtyPlugin["areas"],
    description: pluginDef.description as string,
    author: pluginDef.author as string,
    lastUpdated: pluginDef.lastUpdated as string,
    regulations: registry.regulations || [],
    rules: allRules,
    lookupTables,
    computedFields,
  };

  // Validate the assembled plugin
  const result = validateLoadedPlugin(assembledPlugin);

  // Prepend any file-read errors
  result.errors = [...errors, ...result.errors];
  result.valid = result.errors.length === 0;

  return result;
}

/**
 * Validate all plugin directories under a base path.
 */
export function validateAllPlugins(baseDir?: string): ValidationResult[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path") as typeof import("path");

  const pluginsDir = baseDir || path.resolve(__dirname, "../../../data/plugins");
  const results: ValidationResult[] = [];

  if (!fs.existsSync(pluginsDir)) {
    return results;
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pluginDir = path.join(pluginsDir, entry.name);
      const pluginJsonPath = path.join(pluginDir, "plugin.json");
      if (fs.existsSync(pluginJsonPath)) {
        results.push(validatePlugin(pluginDir));
      }
    }
  }

  return results;
}

// ----------------------------------------------------------
// CLI entry point
// ----------------------------------------------------------

function printUsage(): void {
  console.log(`
Plugin Validator — Validates plugin JSON files for schema compliance

Usage:
  npx tsx src/lib/plugins/validate.ts [options]

Options:
  --plugin <id>    Validate only the specified plugin (by ID)
  --dir <path>     Validate a plugin from a directory on disk
  --loaded         Validate all loaded (bundled) plugins (default)
  --verbose        Show detailed error messages
  --json           Output results as JSON
  --help           Show this help message

Examples:
  npx tsx src/lib/plugins/validate.ts                    # Validate all loaded plugins
  npx tsx src/lib/plugins/validate.ts --plugin electrical
  npx tsx src/lib/plugins/validate.ts --dir ./my-plugin
  npx tsx src/lib/plugins/validate.ts --json
`);
}

function formatResult(result: ValidationResult, verbose: boolean): string {
  const status = result.valid ? "PASS" : "FAIL";
  const lines: string[] = [];

  lines.push(`[${status}] ${result.pluginId} (v${result.stats.regulationCount} regs, ${result.stats.ruleCount} rules, ${result.stats.lookupTableCount} tables, ${result.stats.computedFieldCount} computed)`);

  if (result.errors.length > 0) {
    lines.push(`  Errors: ${result.errors.length}`);
    if (verbose) {
      for (const err of result.errors) {
        lines.push(`    [ERROR] ${err.file}:${err.path} — ${err.message}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`  Warnings: ${result.warnings.length}`);
    if (verbose) {
      for (const warn of result.warnings) {
        lines.push(`    [WARN]  ${warn.file}:${warn.path} — ${warn.message}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * CLI main function. Parses argv and runs validation.
 */
export function main(argv: string[] = process.argv.slice(2)): void {
  const args = new Set(argv);
  const flagIndex = (flag: string): number => argv.indexOf(flag);

  if (args.has("--help") || args.has("-h")) {
    printUsage();
    process.exit(0);
  }

  const verbose = args.has("--verbose") || args.has("-v");
  const jsonOutput = args.has("--json");

  let results: ValidationResult[];

  // --dir: validate from disk
  const dirIdx = flagIndex("--dir");
  if (dirIdx !== -1 && argv[dirIdx + 1]) {
    const dir = argv[dirIdx + 1];
    results = [validatePlugin(dir)];
  }
  // --plugin: validate a specific loaded plugin
  else if (flagIndex("--plugin") !== -1 && argv[flagIndex("--plugin") + 1]) {
    const pluginId = argv[flagIndex("--plugin") + 1];
    const allPlugins = getAvailablePlugins();
    const target = allPlugins.find(p => p.id === pluginId);
    if (!target) {
      console.error(`Plugin not found: "${pluginId}"`);
      console.error(`Available plugins: ${allPlugins.map(p => p.id).join(", ")}`);
      process.exit(1);
    }
    results = [validateLoadedPlugin(target)];
  }
  // Default: validate all loaded plugins
  else {
    results = validateAllLoadedPlugins();
  }

  // Output
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("=== Plugin Validation Results ===\n");

    for (const result of results) {
      console.log(formatResult(result, verbose));
      console.log();
    }

    // Summary
    const totalPlugins = results.length;
    const passed = results.filter(r => r.valid).length;
    const failed = totalPlugins - passed;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

    console.log("--- Summary ---");
    console.log(`Plugins: ${totalPlugins} total, ${passed} passed, ${failed} failed`);
    console.log(`Errors: ${totalErrors}, Warnings: ${totalWarnings}`);

    if (!verbose && totalErrors > 0) {
      console.log("\nRun with --verbose to see detailed error messages.");
    }

    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run as CLI when executed directly
if (require.main === module) {
  main();
}

// ============================================================
// PLUGIN SYSTEM — Types for regulation lifecycle management
// ============================================================

import type { RegulationArea, Severity, BuildingProject, Finding } from "../types";

// ----------------------------------------------------------
// Regulation Document Lifecycle
// ----------------------------------------------------------

/** Status of a regulation document in the system */
export type RegulationStatus =
  | "active"        // Currently in force
  | "amended"       // Partially modified by newer regulation
  | "superseded"    // Fully replaced by newer regulation
  | "revoked"       // Explicitly revoked, no replacement
  | "draft";        // Not yet in force

/** How the regulation text was obtained */
export type SourceType =
  | "public_dre"       // Diário da República (free access)
  | "public_erse"      // ERSE publications
  | "public_operator"  // E-REDES, REN, etc.
  | "proprietary_iec"  // IEC standards (paid)
  | "proprietary_ipq"  // IPQ/NP norms (paid)
  | "proprietary_en"   // European norms (paid)
  | "manual_extract";  // Manually extracted from physical document

/** Legal force / binding nature of the document */
export type LegalForce =
  | "legal"         // Legislation (DL, Lei, Portaria)
  | "regulatory"    // Regulation with legal backing
  | "normative"     // Technical norm (IEC, NP, EN)
  | "contractual"   // Operator requirements (E-REDES)
  | "informative";  // Best practice / guidance

/** Ingestion status: how complete is the rule extraction */
export type IngestionStatus =
  | "pending"       // Document registered but no rules extracted
  | "partial"       // Some rules extracted, more to do
  | "complete"      // All relevant rules extracted
  | "verified";     // Extracted rules verified by engineer

/**
 * A regulation document registered in the system.
 * This tracks the full lifecycle: publication, amendments, revocation.
 */
export interface RegulationDocument {
  /** Unique identifier: e.g. "portaria-949a-2006" */
  id: string;
  /** Short reference: e.g. "Portaria 949-A/2006" */
  shortRef: string;
  /** Full title */
  title: string;
  /** Current lifecycle status */
  status: RegulationStatus;
  /** Publication/effective date (ISO) */
  effectiveDate: string;
  /** Date when revoked/superseded (ISO), null if still active */
  revocationDate: string | null;
  /** IDs of regulations that amend this one */
  amendedBy: string[];
  /** ID of regulation that fully supersedes this one */
  supersededBy: string | null;
  /** IDs of regulations this one amends */
  amends: string[];
  /** Source classification */
  sourceType: SourceType;
  /** Official URL (DRE, ERSE, etc.) */
  sourceUrl: string | null;
  /** Local path to PDF relative to plugin's regulations/ dir */
  sourceFile: string | null;
  /** Legal force classification */
  legalForce: LegalForce;
  /** Regulation area this belongs to */
  area: RegulationArea;
  /** How complete is the rule extraction from this document */
  ingestionStatus: IngestionStatus;
  /** Date when rules were last extracted/updated (ISO) */
  ingestionDate: string | null;
  /** Engineer who verified the extracted rules */
  verifiedBy: string | null;
  /** Number of rules extracted from this document */
  rulesCount: number;
  /** Tags for filtering: e.g. ["BT", "quadros", "proteção"] */
  tags: string[];
  /** Free-text notes about this regulation */
  notes: string;
}

// ----------------------------------------------------------
// Declarative Rules
// ----------------------------------------------------------

/** Comparison operators for rule evaluation */
export type RuleOperator =
  // Direct comparison
  | ">"
  | ">="
  | "<"
  | "<="
  | "=="
  | "!="
  // Existence
  | "exists"       // Field exists and is truthy
  | "not_exists"   // Field is falsy or missing
  // Set membership
  | "in"           // Value is in a list
  | "not_in"       // Value is not in a list
  | "between"      // Value between [min, max]
  // Lookup table — compare field against a value from a lookup table
  | "lookup_gt"    // field > table[keys...]
  | "lookup_gte"   // field >= table[keys...]
  | "lookup_lt"    // field < table[keys...]
  | "lookup_lte"   // field <= table[keys...]
  | "lookup_eq"    // field == table[keys...] (for boolean/string lookups)
  | "lookup_neq"   // field != table[keys...]
  // Ordinal — compare position in an ordered scale
  | "ordinal_lt"   // field ranks below value in scale
  | "ordinal_lte"  // field ranks at or below value in scale
  | "ordinal_gt"   // field ranks above value in scale
  | "ordinal_gte"  // field ranks at or above value in scale
  // Formula — compare field against a computed formula expression
  | "formula_gt"   // field > evaluate(value as expression)
  | "formula_gte"  // field >= evaluate(value as expression)
  | "formula_lt"   // field < evaluate(value as expression)
  | "formula_lte"  // field <= evaluate(value as expression)
  // Computed comparison — like formula_lt but formula is in condition.formula field
  | "computed_lt"  // field < evaluate(condition.formula)
  | "computed_lte"
  | "computed_gt"
  | "computed_gte"
  // Range negation
  | "not_in_range" // field is NOT between [min, max]
  // Fire reaction class ordinal comparison (Euroclass A1...F scale)
  | "reaction_class_lt"   // field's Euroclass is worse than value
  | "reaction_class_lte"
  | "reaction_class_gt"   // field's Euroclass is better than value
  | "reaction_class_gte";

/**
 * A condition that evaluates a project field against a threshold.
 * Multiple conditions in a rule are ANDed together.
 */
export interface RuleCondition {
  /** Dot-notation path to the project field: e.g. "electrical.contractedPower" */
  field: string;
  /** Comparison operator */
  operator: RuleOperator;
  /** Threshold value(s) — number, string, boolean, or array for in/between */
  value: unknown;
  /** For lookup operators: ID of the lookup table to reference */
  table?: string;
  /** For lookup operators: field paths to use as lookup keys (overrides table defaults) */
  keys?: string[];
  /** For ordinal operators: ordered scale defining rank (lowest to highest) */
  scale?: string[];
  /** For computed_* operators: formula expression to evaluate (field must be number) */
  formula?: string;
}

// ----------------------------------------------------------
// Lookup Tables (for matrix/table-based thresholds)
// ----------------------------------------------------------

/**
 * A lookup table maps one or more project field values to a result.
 *
 * 1D example (thermal U-values by climate zone):
 *   keys: ["location.climateZoneWinter"]
 *   values: { "I1": 0.50, "I2": 0.40, "I3": 0.35 }
 *
 * 2D example (fire resistance by building type × risk category):
 *   keys: ["buildingType", "fireSafety.riskCategory"]
 *   values: { "residential": { "1": 30, "2": 60, "3": 90, "4": 120 } }
 *
 * 3D example (detection requirements by type × category × field):
 *   keys: ["buildingType", "fireSafety.riskCategory"]
 *   values: { "residential": { "1": { "detection": false, "alarm": true } } }
 *   → Use subKey in condition to select inner field
 */
export interface LookupTable {
  /** Unique ID referenced by rules: e.g. "fire_resistance" */
  id: string;
  /** Human-readable description */
  description: string;
  /** Dot-notation field paths used as lookup keys */
  keys: string[];
  /** Nested value structure — depth matches number of keys */
  values: Record<string, unknown>;
  /** Optional: sub-key to extract from the deepest value (for nested objects) */
  subKey?: string;
}

// ----------------------------------------------------------
// Computed Fields (for derived values before rule evaluation)
// ----------------------------------------------------------

/**
 * A computed field derives a value from project data before rules run.
 * The result is accessible to rules as "computed.<id>".
 *
 * Arithmetic example:
 *   { type: "arithmetic", operation: "divide",
 *     operands: ["buildingHeight", "numberOfFloors"] }
 *   → computed.avgFloorHeight = buildingHeight / numberOfFloors
 *
 * Tier example (stepped thresholds):
 *   { type: "tier", field: "grossFloorArea",
 *     tiers: [{ max: 50, result: 3 }, { max: 100, result: 5 }, { result: 7 }] }
 *   → computed.minCircuitsByArea = 3 if area ≤ 50, 5 if ≤ 100, else 7
 *
 * Conditional example:
 *   { type: "conditional", field: "isRehabilitation",
 *     ifTrue: 5, ifFalse: 4 }
 *   → computed.elevatorFloorThreshold = 5 if rehab, else 4
 */
export interface ComputedField {
  /** Unique ID — accessible as "computed.<id>" in rule field paths */
  id: string;
  /** Human-readable description */
  description: string;
  /** Computation definition */
  computation: ArithmeticComputation | TierComputation | ConditionalComputation;
}

export interface ArithmeticComputation {
  type: "arithmetic";
  /** Two field paths (dot-notation) as operands */
  operands: [string, string];
  /** Arithmetic operation */
  operation: "divide" | "multiply" | "add" | "subtract";
}

export interface TierComputation {
  type: "tier";
  /** Field path to evaluate */
  field: string;
  /** Ordered tiers — first matching tier wins */
  tiers: TierStep[];
}

export interface TierStep {
  /** Upper bound (inclusive). Omit for the final catch-all tier. */
  max?: number;
  /** Lower bound (inclusive). Omit to start from -Infinity. */
  min?: number;
  /** The result value for this tier */
  result: unknown;
}

export interface ConditionalComputation {
  type: "conditional";
  /** Field path to evaluate as boolean */
  field: string;
  /** Value if field is truthy */
  ifTrue: unknown;
  /** Value if field is falsy */
  ifFalse: unknown;
}

/**
 * A single declarative rule extracted from a regulation.
 * The rule engine evaluates conditions against project data
 * and produces findings when conditions match.
 */
export interface DeclarativeRule {
  /** Unique rule ID: e.g. "RTIEBT-311-01" */
  id: string;
  /** ID of the regulation document this rule comes from */
  regulationId: string;
  /** Specific article/section reference */
  article: string;
  /** Human-readable description (supports {field} interpolation) */
  description: string;
  /** Severity when this rule triggers */
  severity: Severity;
  /** Conditions that must ALL be true for this rule to fire */
  conditions: RuleCondition[];
  /** Additional conditions that EXCLUDE this rule (any true = skip) */
  exclusions?: RuleCondition[];
  /** Remediation guidance text */
  remediation: string;
  /** Current value template (supports {field} interpolation) */
  currentValueTemplate?: string;
  /** Required value text */
  requiredValue?: string;
  /** Whether this rule is active (allows disabling individual rules) */
  enabled: boolean;
  /** Tags for filtering */
  tags: string[];
}

// ----------------------------------------------------------
// Plugin Structure
// ----------------------------------------------------------

/**
 * A specialty plugin groups regulations, rules, lookup tables,
 * computed fields, and optionally custom calculations for one project area.
 */
export interface SpecialtyPlugin {
  /** Plugin identifier: e.g. "electrical" */
  id: string;
  /** Human-readable name: e.g. "Instalações Eléctricas" */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Which regulation area(s) this plugin covers */
  areas: RegulationArea[];
  /** Description of scope */
  description: string;
  /** Author / responsible engineer */
  author: string;
  /** Last update date (ISO) */
  lastUpdated: string;
  /** All regulation documents registered in this plugin */
  regulations: RegulationDocument[];
  /** All declarative rules from all regulations */
  rules: DeclarativeRule[];
  /** Lookup tables for matrix/table-based thresholds (optional) */
  lookupTables?: LookupTable[];
  /** Computed fields derived from project data before rule evaluation (optional) */
  computedFields?: ComputedField[];
}

// ----------------------------------------------------------
// Ingestion Pipeline
// ----------------------------------------------------------

/** A document queued for rule extraction */
export interface IngestionJob {
  /** Regulation document ID */
  regulationId: string;
  /** Path to source PDF */
  sourcePath: string;
  /** Extraction method */
  method: "manual" | "llm_assisted" | "ocr_then_llm";
  /** Status */
  status: "queued" | "in_progress" | "review" | "complete" | "failed";
  /** Extracted rules pending review */
  pendingRules: DeclarativeRule[];
  /** Error message if failed */
  error?: string;
  /** Timestamp */
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------
// Registry Events (for audit trail)
// ----------------------------------------------------------

export type RegistryEventType =
  | "regulation_added"
  | "regulation_amended"
  | "regulation_superseded"
  | "regulation_revoked"
  | "rules_extracted"
  | "rules_verified"
  | "rules_updated"
  | "plugin_updated";

export interface RegistryEvent {
  id: string;
  type: RegistryEventType;
  regulationId: string;
  timestamp: string;
  description: string;
  /** Who made this change */
  actor: string;
  /** Previous state (for auditing) */
  previousState?: Partial<RegulationDocument>;
}

// ----------------------------------------------------------
// Plugin evaluation result
// ----------------------------------------------------------

export interface PluginEvaluationResult {
  pluginId: string;
  pluginVersion: string;
  findings: Finding[];
  /** Total active rules considered for evaluation */
  totalActiveRules: number;
  /** Which regulations were used (only active ones) */
  regulationsUsed: string[];
  /** Which regulations were skipped (superseded/revoked) */
  regulationsSkipped: string[];
  /** Rules that couldn't be evaluated (missing project fields) */
  rulesSkipped: string[];
  evaluatedAt: string;
}

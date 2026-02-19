/**
 * Regulation Graph — transforms plugin data into force-directed graph format
 *
 * Builds nodes (specialty → regulation → rule) and links (containment + cross-specialty)
 * for visualization with react-force-graph-3d.
 */

import type { SpecialtyPlugin, DeclarativeRule } from "./plugins/types";
import { getFieldMappings } from "./plugins/loader";
import type { FieldMapping } from "./context-builder";

// ============================================================
// Types
// ============================================================

export type GraphNodeType = "specialty" | "regulation" | "rule";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  specialtyId: string;
  color: string;
  val: number;
  // Metadata
  severity?: "critical" | "warning" | "info" | "pass";
  article?: string;
  description?: string;
  tags?: string[];
  rulesCount?: number;
  shortRef?: string;
  regulationId?: string;
  legalForce?: string;
  conditionsCount?: number;
  // Browsing metadata (rules only)
  applicableTypes?: string[];     // e.g. ["residential"] — empty = universal
  projectScope?: "new" | "rehab" | "all";
  subTopic?: string;              // derived from tags
  // Full rule data (for detail display)
  conditions?: RuleConditionDisplay[];
  remediation?: string;
  requiredValue?: string;
}

export interface RuleConditionDisplay {
  field: string;
  operator: string;
  value: unknown;
  formula?: string;
  /** Human-readable field label in Portuguese */
  label: string;
  /** Unit of measurement */
  unit?: string;
  /** Human-readable question/statement */
  question: string;
}

export interface GraphLink {
  source: string;
  target: string;
  type: "contains" | "cross-specialty" | "amends";
  fieldRef?: string;
  /** For cross-specialty: all shared non-generic field paths between the two specialties */
  sharedFields?: string[];
}

export interface GraphStats {
  totalSpecialties: number;
  totalRegulations: number;
  totalRules: number;
  severityCounts: { critical: number; warning: number; info: number; pass: number };
  crossSpecialtyLinks: number;
  /** Regulation amendment chain edges */
  amendmentLinks: number;
  /** Distinct building types found in rule conditions */
  buildingTypes: string[];
}

export interface RegulationGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  stats: GraphStats;
}

// ============================================================
// Constants
// ============================================================

const SPECIALTY_COLORS: Record<string, string> = {
  electrical: "#f59e0b",
  "fire-safety": "#ef4444",
  thermal: "#f97316",
  acoustic: "#8b5cf6",
  structural: "#6366f1",
  "water-drainage": "#3b82f6",
  gas: "#eab308",
  hvac: "#06b6d4",
  telecommunications: "#10b981",
  accessibility: "#14b8a6",
  energy: "#22c55e",
  elevators: "#a855f7",
  licensing: "#ec4899",
  waste: "#84cc16",
  drawings: "#64748b",
  architecture: "#0ea5e9",
  general: "#78716c",
  municipal: "#d946ef",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  pass: "#22c55e",
};

/** Generic top-level fields used by most plugins — not meaningful cross-specialty links */
const GENERIC_FIELDS = new Set([
  "buildingType",
  "numberOfFloors",
  "grossFloorArea",
  "isRehabilitation",
  "occupancy",
  "location",
  "computed",
  "building",
  "buildingHeight",
  "constructionYear",
  "projectType",
  "municipality",
  "district",
  "parish",
]);

/**
 * Map field namespace (first segment of dotted path) to plugin ID.
 * Rules use camelCase namespaces, plugins use kebab-case IDs.
 */
const NAMESPACE_TO_PLUGIN: Record<string, string> = {
  fireSafety: "fire-safety",
  waterDrainage: "water-drainage",
  elevator: "elevators",
  elevators: "elevators",
  avac: "hvac",
  hvac: "hvac",
  ited: "telecommunications",
  itur: "telecommunications",
  telecommunications: "telecommunications",
  architecture: "architecture",
  electrical: "electrical",
  acoustic: "acoustic",
  structural: "structural",
  gas: "gas",
  energy: "energy",
  thermal: "thermal",
  accessibility: "accessibility",
  licensing: "licensing",
  waste: "waste",
  drawings: "drawings",
  drawingQuality: "drawings",
  general: "general",
  municipal: "municipal",
  localRegulations: "municipal",
};

// ============================================================
// Condition humanization
// ============================================================

/** Readable operator symbols */
const OPERATOR_LABELS: Record<string, string> = {
  ">": ">",
  "<": "<",
  ">=": "\u2265",
  "<=": "\u2264",
  "==": "=",
  "!=": "\u2260",
  gt: ">",
  lt: "<",
  gte: "\u2265",
  lte: "\u2264",
  in: "\u2208",
  not_in: "\u2209",
  between: "entre",
  exists: "existe",
  not_exists: "n\u00e3o existe",
  lookup_gt: "> tabela",
  lookup_lt: "< tabela",
  lookup_gte: "\u2265 tabela",
  lookup_lte: "\u2264 tabela",
  ordinal_gt: "> (escala)",
  ordinal_lt: "< (escala)",
  ordinal_gte: "\u2265 (escala)",
  ordinal_lte: "\u2264 (escala)",
  formula_gt: "> f\u00f3rmula",
  formula_lt: "< f\u00f3rmula",
  formula_gte: "\u2265 f\u00f3rmula",
  formula_lte: "\u2264 f\u00f3rmula",
  computed_gt: "> calculado",
  computed_lt: "< calculado",
  computed_gte: "\u2265 calculado",
  computed_lte: "\u2264 calculado",
  not_in_range: "fora do intervalo",
  reaction_class_lt: "< classe rea\u00e7\u00e3o",
  reaction_class_lte: "\u2264 classe rea\u00e7\u00e3o",
  reaction_class_gt: "> classe rea\u00e7\u00e3o",
  reaction_class_gte: "\u2265 classe rea\u00e7\u00e3o",
};

/** Known enum value translations */
const VALUE_LABELS: Record<string, string> = {
  residential: "Habita\u00e7\u00e3o",
  commercial: "Com\u00e9rcio/Servi\u00e7os",
  mixed: "Misto",
  industrial: "Industrial",
  office: "Escrit\u00f3rios",
  school: "Escolar",
  hospital: "Hospitalar",
  hotel: "Hotelaria",
  single_phase: "Monof\u00e1sico",
  three_phase: "Trif\u00e1sico",
  true: "Sim",
  false: "N\u00e3o",
};

/** Fallback: convert camelCase to readable Portuguese-ish label */
function camelToReadable(s: string): string {
  // Remove namespace prefix (e.g., "electrical." -> "")
  const field = s.includes(".") ? s.split(".").pop()! : s;
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

/** Build a field→{label, unit, options} lookup from all field mappings */
export function buildFieldLookup(): Map<string, { label: string; unit?: string; options?: Map<string, string> }> {
  const lookup = new Map<string, { label: string; unit?: string; options?: Map<string, string> }>();
  try {
    const mappings = getFieldMappings();
    for (const m of mappings) {
      const optMap = m.options ? new Map(m.options.map(o => [o.value, o.label])) : undefined;
      lookup.set(m.field, {
        label: m.label,
        unit: m.unit && m.unit !== "\u2014" ? m.unit : undefined,
        options: optMap,
      });
    }
  } catch {
    // Gracefully continue if field mappings unavailable
  }
  return lookup;
}

/** Format a condition value to readable text */
function formatValue(
  value: unknown,
  options?: Map<string, string>,
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sim" : "N\u00e3o";
  const str = String(value);
  // Check options map first (select field translated labels)
  if (options?.has(str)) return options.get(str)!;
  // Check global value labels
  if (VALUE_LABELS[str]) return VALUE_LABELS[str];
  // Arrays
  if (Array.isArray(value)) {
    return value.map(v => formatValue(v, options)).join(", ");
  }
  return str;
}

/** Build a human-readable question from a condition */
export function buildConditionDisplay(
  cond: { field: string; operator: string; value: unknown; formula?: string },
  fieldLookup: Map<string, { label: string; unit?: string; options?: Map<string, string> }>,
): RuleConditionDisplay {
  const info = fieldLookup.get(cond.field);
  const label = info?.label || camelToReadable(cond.field);
  const unit = info?.unit;
  const opLabel = OPERATOR_LABELS[cond.operator] || cond.operator;

  let question: string;
  const valueText = cond.formula
    ? cond.formula
    : formatValue(cond.value, info?.options);

  if (cond.operator === "exists") {
    question = `${label} est\u00e1 definido?`;
  } else if (cond.operator === "not_exists") {
    question = `${label} n\u00e3o est\u00e1 definido?`;
  } else if (cond.operator === "==" && typeof cond.value === "boolean") {
    question = cond.value ? `${label}?` : `N\u00e3o \u00e9 ${label.toLowerCase()}?`;
  } else if (cond.operator === "==" || cond.operator === "equals") {
    question = `${label} = ${valueText}${unit ? " " + unit : ""}?`;
  } else if (cond.operator === "in" || cond.operator === "not_in") {
    question = `${label} ${opLabel} [${valueText}]?`;
  } else if (cond.operator.startsWith("lookup_")) {
    question = `${label} ${opLabel}?`;
  } else {
    question = `${label} ${opLabel} ${valueText}${unit ? " " + unit : ""}?`;
  }

  return {
    field: cond.field,
    operator: cond.operator,
    value: cond.value,
    formula: cond.formula,
    label,
    unit,
    question,
  };
}

// ============================================================
// Rule browsing metadata extraction
// ============================================================

/** Extract applicable building types from a rule's conditions */
export function extractApplicableTypes(rule: DeclarativeRule): string[] {
  const types: string[] = [];
  for (const cond of rule.conditions) {
    if (cond.field === "buildingType") {
      if (cond.operator === "==" && typeof cond.value === "string") {
        types.push(cond.value);
      } else if (cond.operator === "in" && Array.isArray(cond.value)) {
        types.push(...cond.value.filter((v): v is string => typeof v === "string"));
      }
    }
  }
  return types;
}

/** Extract project scope (new build / rehabilitation / all) from a rule's conditions */
export function extractProjectScope(rule: DeclarativeRule): "new" | "rehab" | "all" {
  for (const cond of rule.conditions) {
    if (cond.field === "isRehabilitation" && cond.operator === "==") {
      return cond.value === true ? "rehab" : "new";
    }
  }
  return "all";
}

/** Tags that are regulation references rather than meaningful sub-topics */
const REG_REF_TAGS = new Set([
  "RGEU", "RJUE", "RTIEBT", "SCIE", "RT-SCIE", "RRAE", "REH", "RECS",
  "RGSPPDADAR", "ITED", "ITUR", "SCE", "DL", "Portaria", "EN", "NP",
]);

/** Derive a sub-topic label from a rule's tags, preferring component/concept tags */
function extractSubTopic(rule: DeclarativeRule): string | undefined {
  if (!rule.tags || rule.tags.length === 0) return undefined;
  // Skip regulation references and very short tags, prefer descriptive ones
  for (const tag of rule.tags) {
    if (tag.length < 2) continue;
    // Skip Eurocode references (EC0-EC9, NP EN...) and regulation acronyms
    if (/^EC\d/.test(tag)) continue;
    if (/^NP\s+EN/.test(tag)) continue;
    if (/^NT\d/.test(tag)) continue;
    if (REG_REF_TAGS.has(tag)) continue;
    return tag;
  }
  // Fallback to first tag
  return rule.tags[0];
}

/** Human-readable labels for building types */
export const BUILDING_TYPE_LABELS: Record<string, string> = {
  residential: "Habitação",
  commercial: "Comércio/Serviços",
  mixed: "Misto",
  industrial: "Industrial",
  office: "Escritórios",
  school: "Escolar",
  hospital: "Hospitalar",
  hotel: "Hotelaria",
  retail: "Comércio",
  restaurant: "Restauração",
  housing: "Habitação",
  habitacional: "Habitação",
};

// ============================================================
// Main builder
// ============================================================

export function buildRegulationGraph(plugins: SpecialtyPlugin[]): RegulationGraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const severityCounts = { critical: 0, warning: 0, info: 0, pass: 0 };
  const seenNodeIds = new Set<string>();
  const fieldLookup = buildFieldLookup();

  // Build specialty → regulation → rule tree
  for (const plugin of plugins) {
    const color = SPECIALTY_COLORS[plugin.id] ?? "#6b7280";

    // Specialty node
    const specialtyId = `s:${plugin.id}`;
    seenNodeIds.add(specialtyId);
    nodes.push({
      id: specialtyId,
      type: "specialty",
      label: plugin.name,
      specialtyId: plugin.id,
      color,
      rulesCount: plugin.rules.length,
      val: 30,
    });

    for (const reg of plugin.regulations) {
      const regRules = plugin.rules.filter(r => r.regulationId === reg.id);

      // Regulation node — scope with plugin to avoid cross-plugin duplicates
      let regNodeId = `r:${reg.id}`;
      if (seenNodeIds.has(regNodeId)) {
        regNodeId = `r:${plugin.id}:${reg.id}`;
      }
      seenNodeIds.add(regNodeId);

      nodes.push({
        id: regNodeId,
        type: "regulation",
        label: reg.shortRef,
        specialtyId: plugin.id,
        color,
        regulationId: reg.id,
        shortRef: reg.shortRef,
        legalForce: reg.legalForce,
        rulesCount: regRules.length,
        val: 10,
      });

      // Specialty → regulation link
      links.push({
        source: specialtyId,
        target: regNodeId,
        type: "contains",
      });

      // Rule nodes
      for (const rule of regRules) {
        // Scope rule ID with regulation to guarantee uniqueness across plugins
        let ruleNodeId = `rule:${rule.id}`;
        if (seenNodeIds.has(ruleNodeId)) {
          ruleNodeId = `rule:${reg.id}:${rule.id}`;
        }
        // If still duplicate, add index
        let attempt = 2;
        while (seenNodeIds.has(ruleNodeId)) {
          ruleNodeId = `rule:${reg.id}:${rule.id}:${attempt++}`;
        }
        seenNodeIds.add(ruleNodeId);

        severityCounts[rule.severity]++;
        nodes.push({
          id: ruleNodeId,
          type: "rule",
          label: rule.id,
          specialtyId: plugin.id,
          color: SEVERITY_COLORS[rule.severity] ?? "#6b7280",
          regulationId: reg.id,
          severity: rule.severity,
          article: rule.article,
          description: rule.description,
          tags: rule.tags,
          conditionsCount: rule.conditions.length,
          val: 2,
          applicableTypes: extractApplicableTypes(rule),
          projectScope: extractProjectScope(rule),
          subTopic: extractSubTopic(rule),
          conditions: rule.conditions.map(c => buildConditionDisplay(
            { field: c.field, operator: c.operator, value: c.value, formula: c.formula },
            fieldLookup,
          )),
          remediation: rule.remediation,
          requiredValue: rule.requiredValue,
        });

        // Regulation → rule link
        links.push({
          source: regNodeId,
          target: ruleNodeId,
          type: "contains",
        });
      }
    }
  }

  // Detect cross-specialty links via shared field namespaces
  // Accumulate all shared fields per specialty pair
  const crossPairFields = new Map<string, Set<string>>();

  for (const plugin of plugins) {
    for (const rule of plugin.rules) {
      for (const cond of rule.conditions) {
        const namespace = cond.field.split(".")[0];
        if (GENERIC_FIELDS.has(namespace)) continue;

        const targetPlugin = NAMESPACE_TO_PLUGIN[namespace];
        if (!targetPlugin || targetPlugin === plugin.id) continue;

        const pairKey = [plugin.id, targetPlugin].sort().join(":");
        let fields = crossPairFields.get(pairKey);
        if (!fields) {
          fields = new Set<string>();
          crossPairFields.set(pairKey, fields);
        }
        fields.add(cond.field);
      }
    }
  }

  for (const [pairKey, fields] of crossPairFields) {
    const [srcId, tgtId] = pairKey.split(":");
    links.push({
      source: `s:${srcId}`,
      target: `s:${tgtId}`,
      type: "cross-specialty",
      fieldRef: [...fields][0],
      sharedFields: [...fields].sort(),
    });
  }

  // Detect amendment chain links between regulations
  // Build a lookup: regulation ID → node ID (for matching amendedBy/amends)
  const regIdToNodeId = new Map<string, string>();
  for (const node of nodes) {
    if (node.type === "regulation" && node.regulationId) {
      // If multiple nodes share a regulationId, first one wins (they're in the same specialty)
      if (!regIdToNodeId.has(node.regulationId)) {
        regIdToNodeId.set(node.regulationId, node.id);
      }
    }
  }

  let amendmentLinkCount = 0;
  for (const plugin of plugins) {
    for (const reg of plugin.regulations) {
      const sourceNodeId = regIdToNodeId.get(reg.id);
      if (!sourceNodeId) continue;

      // amendedBy: this regulation was amended by another
      for (const amenderId of (reg.amendedBy ?? [])) {
        const targetNodeId = regIdToNodeId.get(amenderId);
        if (targetNodeId) {
          links.push({
            source: sourceNodeId,
            target: targetNodeId,
            type: "amends",
          });
          amendmentLinkCount++;
        }
      }
    }
  }

  // Collect distinct building types from rule nodes
  const buildingTypesSet = new Set<string>();
  for (const node of nodes) {
    if (node.type === "rule" && node.applicableTypes) {
      for (const t of node.applicableTypes) buildingTypesSet.add(t);
    }
  }

  // Count actual graph nodes (not plugin.rules.length) since orphaned rules are excluded
  const ruleNodeCount = nodes.filter(n => n.type === "rule").length;
  const regNodeCount = nodes.filter(n => n.type === "regulation").length;

  return {
    nodes,
    links,
    stats: {
      totalSpecialties: plugins.length,
      totalRegulations: regNodeCount,
      totalRules: ruleNodeCount,
      severityCounts,
      crossSpecialtyLinks: crossPairFields.size,
      amendmentLinks: amendmentLinkCount,
      buildingTypes: [...buildingTypesSet].sort(),
    },
  };
}

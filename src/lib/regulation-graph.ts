/**
 * Regulation Graph — transforms plugin data into force-directed graph format
 *
 * Builds nodes (specialty → regulation → rule) and links (containment + cross-specialty)
 * for visualization with react-force-graph-3d.
 */

import type { SpecialtyPlugin, DeclarativeRule } from "./plugins/types";

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
}

export interface GraphLink {
  source: string;
  target: string;
  type: "contains" | "cross-specialty";
  fieldRef?: string;
}

export interface GraphStats {
  totalSpecialties: number;
  totalRegulations: number;
  totalRules: number;
  severityCounts: { critical: number; warning: number; info: number; pass: number };
  crossSpecialtyLinks: number;
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
// Rule browsing metadata extraction
// ============================================================

/** Extract applicable building types from a rule's conditions */
function extractApplicableTypes(rule: DeclarativeRule): string[] {
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
function extractProjectScope(rule: DeclarativeRule): "new" | "rehab" | "all" {
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
  const crossPairs = new Set<string>();

  for (const plugin of plugins) {
    for (const rule of plugin.rules) {
      for (const cond of rule.conditions) {
        const namespace = cond.field.split(".")[0];
        if (GENERIC_FIELDS.has(namespace)) continue;

        const targetPlugin = NAMESPACE_TO_PLUGIN[namespace];
        if (!targetPlugin || targetPlugin === plugin.id) continue;

        // Deduplicate at the specialty-pair level
        const pairKey = [plugin.id, targetPlugin].sort().join(":");
        if (crossPairs.has(pairKey)) continue;
        crossPairs.add(pairKey);

        links.push({
          source: `s:${plugin.id}`,
          target: `s:${targetPlugin}`,
          type: "cross-specialty",
          fieldRef: cond.field,
        });
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

  return {
    nodes,
    links,
    stats: {
      totalSpecialties: plugins.length,
      totalRegulations: plugins.reduce((sum, p) => sum + p.regulations.length, 0),
      totalRules: plugins.reduce((sum, p) => sum + p.rules.length, 0),
      severityCounts,
      crossSpecialtyLinks: crossPairs.size,
      buildingTypes: [...buildingTypesSet].sort(),
    },
  };
}

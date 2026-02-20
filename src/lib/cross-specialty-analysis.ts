/**
 * Cross-specialty analysis — finds rules that reference fields across
 * multiple selected specialties (AND semantics).
 */

import type { SpecialtyPlugin, DeclarativeRule } from "./plugins/types";
import { NAMESPACE_TO_PLUGIN, GENERIC_FIELDS } from "./regulation-graph";

// ── Types ──────────────────────────────────────────────────

export interface CrossSpecialtyRule {
  rule: DeclarativeRule;
  /** Plugin this rule belongs to */
  ownerPluginId: string;
  /** Other selected specialty IDs this rule references via condition fields */
  referencedSpecialties: string[];
  /** The specific cross-specialty field paths */
  crossFields: string[];
}

export interface CrossSpecialtyPair {
  specialtyA: string;
  specialtyB: string;
  rulesFromA: CrossSpecialtyRule[];
  rulesFromB: CrossSpecialtyRule[];
  sharedFields: string[];
  totalRules: number;
}

export interface CrossSpecialtyAnalysis {
  crossRules: CrossSpecialtyRule[];
  pairs: CrossSpecialtyPair[];
  totalCrossRules: number;
  totalSharedFields: number;
}

// ── Analysis ───────────────────────────────────────────────

/**
 * Given a set of selected specialty IDs and all plugins,
 * find rules that cross between the selected specialties.
 *
 * AND semantics: a rule must belong to one selected specialty
 * AND reference fields from at least one OTHER selected specialty.
 */
export function analyzeCrossSpecialties(
  selectedIds: Set<string>,
  plugins: SpecialtyPlugin[],
): CrossSpecialtyAnalysis {
  if (selectedIds.size < 2) {
    return { crossRules: [], pairs: [], totalCrossRules: 0, totalSharedFields: 0 };
  }

  const selectedArray = [...selectedIds];
  const crossRules: CrossSpecialtyRule[] = [];
  const selectedPlugins = plugins.filter((p) => selectedIds.has(p.id));

  for (const plugin of selectedPlugins) {
    for (const rule of plugin.rules) {
      if (!rule.enabled) continue;

      const referencedSpecialties = new Set<string>();
      const crossFields: string[] = [];

      for (const cond of rule.conditions) {
        const namespace = cond.field.split(".")[0];
        if (GENERIC_FIELDS.has(namespace)) continue;

        const targetPlugin = NAMESPACE_TO_PLUGIN[namespace];
        if (!targetPlugin || targetPlugin === plugin.id) continue;

        if (selectedIds.has(targetPlugin)) {
          referencedSpecialties.add(targetPlugin);
          crossFields.push(cond.field);
        }
      }

      // Also check exclusions for cross-references
      if (rule.exclusions) {
        for (const excl of rule.exclusions) {
          const namespace = excl.field.split(".")[0];
          if (GENERIC_FIELDS.has(namespace)) continue;

          const targetPlugin = NAMESPACE_TO_PLUGIN[namespace];
          if (!targetPlugin || targetPlugin === plugin.id) continue;

          if (selectedIds.has(targetPlugin)) {
            referencedSpecialties.add(targetPlugin);
            if (!crossFields.includes(excl.field)) {
              crossFields.push(excl.field);
            }
          }
        }
      }

      if (referencedSpecialties.size > 0) {
        crossRules.push({
          rule,
          ownerPluginId: plugin.id,
          referencedSpecialties: [...referencedSpecialties],
          crossFields,
        });
      }
    }
  }

  // Build pairwise connections
  const pairs: CrossSpecialtyPair[] = [];
  for (let i = 0; i < selectedArray.length; i++) {
    for (let j = i + 1; j < selectedArray.length; j++) {
      const a = selectedArray[i];
      const b = selectedArray[j];

      const rulesFromA = crossRules.filter(
        (cr) => cr.ownerPluginId === a && cr.referencedSpecialties.includes(b),
      );
      const rulesFromB = crossRules.filter(
        (cr) => cr.ownerPluginId === b && cr.referencedSpecialties.includes(a),
      );

      if (rulesFromA.length === 0 && rulesFromB.length === 0) continue;

      const allFields = new Set<string>();
      for (const cr of [...rulesFromA, ...rulesFromB]) {
        for (const f of cr.crossFields) allFields.add(f);
      }

      pairs.push({
        specialtyA: a,
        specialtyB: b,
        rulesFromA,
        rulesFromB,
        sharedFields: [...allFields].sort(),
        totalRules: rulesFromA.length + rulesFromB.length,
      });
    }
  }

  pairs.sort((a, b) => b.totalRules - a.totalRules);

  const allSharedFields = new Set<string>();
  for (const cr of crossRules) {
    for (const f of cr.crossFields) allSharedFields.add(f);
  }

  return {
    crossRules,
    pairs,
    totalCrossRules: crossRules.length,
    totalSharedFields: allSharedFields.size,
  };
}

// ============================================================
// DECLARATIVE RECOMMENDATIONS ENGINE
// ============================================================
//
// Evaluates JSON-defined recommendations against a BuildingProject
// and its findings. Replaces the hardcoded generateRecommendations
// function in analyzer.ts.
//
// Supports four trigger types:
// - "always"             — always included
// - "condition"          — included when project field conditions are met
// - "area_has_findings"  — included when the area has findings of matching severity
//                          (optionally with additional field conditions)
//
// Special features:
// - Climate-zone-aware conditions and thresholds for thermal recs
// - Dynamic entity list generation for consultation recommendations
// - Dynamic process timeline interpolation for licensing recs
//

import type {
  BuildingProject,
  Finding,
  Recommendation,
  RegulationArea,
  Severity,
} from "./types";

import recommendationsData from "../data/recommendations.json";

// ----------------------------------------------------------
// Types for declarative recommendation entries
// ----------------------------------------------------------

interface RecommendationCondition {
  field: string;
  operator: string;
  value: unknown;
}

interface ConditionalEntity {
  name: string;
  field: string;
  operator: string;
  value: unknown;
}

interface ProcessTimeline {
  label: string;
  totalMaxDays: number;
  silenceEffect: string;
}

interface DeclarativeRecommendation {
  id: string;
  area: RegulationArea;
  trigger: "area_has_findings" | "always" | "condition";
  triggerSeverity?: Severity[];
  conditions?: RecommendationCondition[];
  // Climate-zone-dependent conditions & thresholds
  conditionsByClimateZone?: Record<string, RecommendationCondition[]>;
  climateZoneField?: string;
  thresholdsByClimateZone?: Record<string, number>;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  estimatedSavings?: string;
  regulatoryBasis?: string;
  // Dynamic entity consultation
  dynamicEntities?: boolean;
  mandatoryEntities?: string[];
  conditionalEntities?: ConditionalEntity[];
  // Dynamic process timeline
  dynamicTimeline?: boolean;
  processTimelines?: Record<string, ProcessTimeline>;
}

// ----------------------------------------------------------
// Field Resolution (reuses same logic as rule-engine)
// ----------------------------------------------------------

function resolveField(project: BuildingProject, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let current: unknown = project;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ----------------------------------------------------------
// Condition Evaluation
// ----------------------------------------------------------

function evaluateCondition(
  condition: RecommendationCondition,
  project: BuildingProject
): boolean {
  const fieldValue = resolveField(project, condition.field);
  const op = condition.operator;

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
      if (typeof fieldValue === "string" && typeof condition.value === "string") {
        return Number(fieldValue) >= Number(condition.value);
      }
      return typeof fieldValue === "number" && fieldValue >= (condition.value as number);

    case "<":
      return typeof fieldValue === "number" && fieldValue < (condition.value as number);

    case "<=":
      return typeof fieldValue === "number" && fieldValue <= (condition.value as number);

    case "in":
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);

    case "not_in":
      return !Array.isArray(condition.value) || !condition.value.includes(fieldValue);

    case "empty_array":
      return Array.isArray(fieldValue) && fieldValue.length === 0;

    default:
      return false;
  }
}

// ----------------------------------------------------------
// Climate Zone Resolution
// ----------------------------------------------------------

function getClimateZoneConditions(
  rec: DeclarativeRecommendation,
  project: BuildingProject
): RecommendationCondition[] | null {
  if (!rec.conditionsByClimateZone || !rec.climateZoneField) return null;

  const zone = resolveField(project, rec.climateZoneField);
  if (typeof zone !== "string") return null;

  return rec.conditionsByClimateZone[zone] ?? null;
}

function getThresholdForZone(
  rec: DeclarativeRecommendation,
  project: BuildingProject
): string | null {
  if (!rec.thresholdsByClimateZone || !rec.climateZoneField) return null;

  const zone = resolveField(project, rec.climateZoneField);
  if (typeof zone !== "string") return null;

  const threshold = rec.thresholdsByClimateZone[zone];
  if (threshold === undefined) return null;

  return Number.isInteger(threshold) ? String(threshold) : threshold.toFixed(2);
}

// ----------------------------------------------------------
// Dynamic Content Generation
// ----------------------------------------------------------

function buildEntityList(
  rec: DeclarativeRecommendation,
  project: BuildingProject
): string {
  const entities: string[] = [...(rec.mandatoryEntities ?? [])];

  if (rec.conditionalEntities) {
    for (const ce of rec.conditionalEntities) {
      const condition: RecommendationCondition = {
        field: ce.field,
        operator: ce.operator,
        value: ce.value,
      };
      if (evaluateCondition(condition, project)) {
        // Avoid duplicates
        if (!entities.includes(ce.name)) {
          entities.push(ce.name);
        }
      }
    }
  }

  return entities.join(", ");
}

function buildTimelineContent(
  rec: DeclarativeRecommendation,
  project: BuildingProject
): { title: string; description: string } | null {
  if (!rec.processTimelines) return null;

  const processType = resolveField(project, "licensing.processType") as string | undefined;
  if (!processType) return null;

  const timeline = rec.processTimelines[processType];
  if (!timeline) return null;

  const title = rec.title
    .replace("{processLabel}", timeline.label);

  const description = rec.description
    .replace("{processLabel}", timeline.label)
    .replace("{totalDays}", String(timeline.totalMaxDays))
    .replace("{silenceEffect}", timeline.silenceEffect);

  return { title, description };
}

// ----------------------------------------------------------
// Main Engine
// ----------------------------------------------------------

let recommendationCounter = 0;

function nextRecommendationId(): string {
  return `R-${++recommendationCounter}`;
}

/**
 * Evaluate all declarative recommendations against a project and its findings.
 * Produces the same Recommendation[] output as the previous hardcoded function.
 */
export function evaluateRecommendations(
  project: BuildingProject,
  findings: Finding[]
): Recommendation[] {
  recommendationCounter = 0;

  const recommendations: Recommendation[] = [];

  // Group findings by area and severity for fast lookup
  const criticalAreas = new Set(
    findings.filter(f => f.severity === "critical").map(f => f.area)
  );
  const warningAreas = new Set(
    findings.filter(f => f.severity === "warning").map(f => f.area)
  );

  const allRecs = recommendationsData.recommendations as unknown as DeclarativeRecommendation[];

  for (const rec of allRecs) {
    // --- Check trigger ---
    let triggerMet = false;

    switch (rec.trigger) {
      case "always":
        triggerMet = true;
        break;

      case "condition":
        // Pure condition-based: evaluate conditions only
        triggerMet = true;
        break;

      case "area_has_findings": {
        // Check if the area has findings matching the required severities
        const severities = rec.triggerSeverity ?? ["critical", "warning"];
        triggerMet = severities.some(sev => {
          if (sev === "critical") return criticalAreas.has(rec.area);
          if (sev === "warning") return warningAreas.has(rec.area);
          return false;
        });
        break;
      }
    }

    if (!triggerMet) continue;

    // --- Evaluate conditions ---
    // For climate-zone-aware recommendations, use zone-specific conditions
    let conditions = rec.conditions;
    const zoneConditions = getClimateZoneConditions(rec, project);
    if (zoneConditions) {
      // Replace the generic conditions with zone-specific ones
      // Keep any non-climate conditions that exist
      const nonClimateConditions = (rec.conditions ?? []).filter(c => {
        // Climate conditions are those that match the conditionsByClimateZone pattern
        // (same field as any zone condition)
        if (!zoneConditions.length) return true;
        return !zoneConditions.some(zc => zc.field === c.field);
      });
      conditions = [...nonClimateConditions, ...zoneConditions];
    }

    if (conditions && conditions.length > 0) {
      const allConditionsMet = conditions.every(c => evaluateCondition(c, project));
      if (!allConditionsMet) continue;
    }

    // --- Build recommendation content ---
    let title = rec.title;
    let description = rec.description;

    // Handle threshold interpolation for climate-zone recs
    const threshold = getThresholdForZone(rec, project);
    if (threshold !== null) {
      description = description.replace("{threshold}", threshold);
    }

    // Handle dynamic entity list
    if (rec.dynamicEntities) {
      const entityList = buildEntityList(rec, project);
      description = description.replace("{entities}", entityList);
    }

    // Handle dynamic timeline
    if (rec.dynamicTimeline) {
      const timelineContent = buildTimelineContent(rec, project);
      if (!timelineContent) continue; // Skip if no timeline data
      title = timelineContent.title;
      description = timelineContent.description;
    }

    // Interpolate any remaining {field} references
    title = interpolateFields(title, project);
    description = interpolateFields(description, project);

    // --- Build recommendation ---
    const recommendation: Recommendation = {
      id: nextRecommendationId(),
      area: rec.area as RegulationArea,
      title,
      description,
      impact: rec.impact,
    };

    if (rec.estimatedSavings) {
      recommendation.estimatedSavings = rec.estimatedSavings;
    }

    if (rec.regulatoryBasis) {
      recommendation.regulatoryBasis = rec.regulatoryBasis;
    }

    recommendations.push(recommendation);
  }

  return recommendations;
}

/**
 * Interpolate {field.path} references in text with project values.
 */
function interpolateFields(template: string, project: BuildingProject): string {
  return template.replace(/\{([a-zA-Z_.]+)\}/g, (match, fieldPath: string) => {
    // Skip known special placeholders that were already handled
    if (["threshold", "entities", "processLabel", "totalDays", "silenceEffect"].includes(fieldPath)) {
      return match;
    }
    const value = resolveField(project, fieldPath);
    if (value === undefined || value === null) return "(nao definido)";
    if (typeof value === "number") {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
  });
}

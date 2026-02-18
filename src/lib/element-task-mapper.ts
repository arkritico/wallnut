/**
 * Element ↔ WBS Task Mapper
 *
 * Bridges IFC model elements to WBS schedule tasks using 4 strategies:
 * 1. Keynote — classification/entity → ProNIC chapter → phase → task
 * 2. Type + Storey — entity type → phase, refined by storey
 * 3. System — MEP system property → phase
 * 4. Fallback — broad entity categorization → summary task
 */

import type {
  SpecialtyAnalysisResult,
  IfcQuantityData,
} from "./ifc-specialty-analyzer";
import type {
  ConstructionPhase,
  ScheduleTask,
  ProjectSchedule,
} from "./wbs-types";
import { PRONIC_CHAPTERS, chapterToPhase } from "./wbs-types";
import {
  generateBoqFromIfc,
  type KeynoteResolution,
  type GeneratedBoq,
} from "./keynote-resolver";

// ============================================================
// Types
// ============================================================

export interface ElementTaskLink {
  /** IFC GlobalId or element name */
  elementId: string;
  /** IFC entity type */
  entityType: string;
  /** WBS schedule task UID */
  taskUid: number;
  /** Task name (for display) */
  taskName: string;
  /** Construction phase */
  phase: ConstructionPhase;
  /** Confidence 0-100 */
  confidence: number;
  /** How the link was determined */
  method: "keynote" | "type_storey" | "system" | "fallback";
  /** Storey where element is located */
  storey?: string;
  /** ProNIC chapter code (for traceability) */
  chapterCode?: string;
}

export interface ElementTaskMappingResult {
  /** Per-element links */
  links: ElementTaskLink[];
  /** Elements that could not be mapped to any task */
  unmapped: {
    elementId: string;
    entityType: string;
    storey?: string;
    reason: string;
  }[];
  /** Statistics */
  stats: {
    totalElements: number;
    mapped: number;
    unmapped: number;
    coveragePercent: number;
    byMethod: Record<string, number>;
    byPhase: Record<string, number>;
  };
}

export interface ElementTaskReviewRow {
  elementId: string;
  entityType: string;
  elementName: string;
  storey: string;
  chapterCode: string;
  chapterName: string;
  phase: string;
  taskUid: number;
  taskName: string;
  confidence: number;
  method: string;
  /** User can override the task assignment */
  overrideTaskUid?: number;
}

// ============================================================
// Fixture Phase Overrides
// ============================================================

/**
 * Entity patterns that should be assigned to fixture phases
 * instead of the rough-in phase their ProNIC chapter implies.
 */
const FIXTURE_ENTITY_OVERRIDES: Record<string, ConstructionPhase> = {
  SANITARYTERMINAL: "plumbing_fixtures",
  FLOWSTORAGE: "plumbing_fixtures",
  LIGHTFIXTURE: "electrical_fixtures",
  OUTLET: "electrical_fixtures",
  SWITCHINGDEVICE: "electrical_fixtures",
  ELECTRICDISTRIBUTION: "electrical_fixtures",
};

// ============================================================
// Entity → Phase Direct Map (for Strategy 2)
// ============================================================

/** CURTAINWALL must appear before WALL to prevent substring match */
const ENTITY_TO_PHASE: {
  pattern: string;
  phase: ConstructionPhase;
  confidence: number;
}[] = [
  // Structure
  { pattern: "COLUMN", phase: "structure", confidence: 50 },
  { pattern: "BEAM", phase: "structure", confidence: 50 },
  { pattern: "SLAB", phase: "structure", confidence: 45 },
  { pattern: "FOOTING", phase: "foundations", confidence: 50 },
  { pattern: "PILE", phase: "foundations", confidence: 45 },
  { pattern: "STAIR", phase: "structure", confidence: 40 },
  { pattern: "MEMBER", phase: "structure", confidence: 40 },
  { pattern: "REINFORCING", phase: "structure", confidence: 45 },

  // Envelope — CURTAINWALL before WALL
  { pattern: "CURTAINWALL", phase: "external_finishes", confidence: 45 },
  { pattern: "WALL", phase: "external_walls", confidence: 40 },
  { pattern: "ROOF", phase: "roof", confidence: 50 },
  { pattern: "COVERING", phase: "roof", confidence: 35 },
  { pattern: "WINDOW", phase: "external_frames", confidence: 50 },
  { pattern: "DOOR", phase: "carpentry", confidence: 40 },
  { pattern: "RAILING", phase: "metalwork", confidence: 40 },

  // Plumbing
  { pattern: "PIPESEGMENT", phase: "rough_in_plumbing", confidence: 45 },
  { pattern: "PIPEFITTING", phase: "rough_in_plumbing", confidence: 40 },
  { pattern: "SANITARYTERMINAL", phase: "plumbing_fixtures", confidence: 50 },
  { pattern: "FLOWSTORAGE", phase: "plumbing_fixtures", confidence: 45 },

  // Electrical
  { pattern: "CABLESEGMENT", phase: "rough_in_electrical", confidence: 45 },
  { pattern: "CABLECARRIER", phase: "rough_in_electrical", confidence: 40 },
  { pattern: "LIGHTFIXTURE", phase: "electrical_fixtures", confidence: 50 },
  { pattern: "OUTLET", phase: "electrical_fixtures", confidence: 50 },
  { pattern: "SWITCHINGDEVICE", phase: "electrical_fixtures", confidence: 45 },
  { pattern: "ELECTRICDISTRIBUTION", phase: "electrical_fixtures", confidence: 50 },

  // HVAC
  { pattern: "DUCTSEGMENT", phase: "rough_in_hvac", confidence: 45 },
  { pattern: "DUCTFITTING", phase: "rough_in_hvac", confidence: 40 },
  { pattern: "AIRTERMINAL", phase: "rough_in_hvac", confidence: 45 },
  { pattern: "UNITARYEQUIPMENT", phase: "rough_in_hvac", confidence: 40 },

  // Fire safety
  { pattern: "FIRESUPPRESSION", phase: "fire_safety", confidence: 45 },
  { pattern: "ALARM", phase: "fire_safety", confidence: 45 },

  // Gas
  { pattern: "VALVE", phase: "rough_in_gas", confidence: 35 },
];

// ============================================================
// System Name → Phase Map (for Strategy 3)
// ============================================================

const SYSTEM_KEYWORDS_TO_PHASE: {
  keywords: string[];
  phase: ConstructionPhase;
}[] = [
  {
    keywords: ["plumbing", "water", "água", "drainage", "drenagem", "esgoto"],
    phase: "rough_in_plumbing",
  },
  {
    keywords: [
      "electrical",
      "power",
      "lighting",
      "elétric",
      "eletric",
      "iluminação",
    ],
    phase: "rough_in_electrical",
  },
  {
    keywords: [
      "hvac",
      "avac",
      "ventilation",
      "ventilação",
      "climatização",
      "mechanical",
    ],
    phase: "rough_in_hvac",
  },
  {
    keywords: ["gas", "gás"],
    phase: "rough_in_gas",
  },
  {
    keywords: ["fire", "incêndio", "sprinkler", "alarm"],
    phase: "fire_safety",
  },
  {
    keywords: ["telecom", "ited", "itur", "fibra"],
    phase: "rough_in_telecom",
  },
];

// ============================================================
// Storey Normalization
// ============================================================

/**
 * Normalize Portuguese storey names for comparison.
 * Handles: "Piso 0", "R/C", "Rés-do-chão", "Level 1", "Nível 1",
 * "Cave", "Piso -1", "Cobertura"
 */
export function normalizeStorey(storey: string): string {
  const lower = storey.toLowerCase().trim();

  // Ground floor variants
  if (
    lower === "r/c" ||
    lower.includes("rés") ||
    lower.includes("res-do-chao") ||
    lower === "ground" ||
    lower === "ground floor"
  ) {
    return "P0";
  }

  // Roof / attic
  if (lower === "cobertura" || lower === "roof" || lower === "sotão") {
    return "PCOB";
  }

  // "Piso N" / "Piso -N"
  const pisoMatch = lower.match(/piso\s*(-?\d+)/);
  if (pisoMatch) return `P${pisoMatch[1]}`;

  // "Level N"
  const levelMatch = lower.match(/level\s*(-?\d+)/);
  if (levelMatch) return `P${levelMatch[1]}`;

  // "Nível N" / "Nivel N"
  const nivelMatch = lower.match(/n[ií]vel\s*(-?\d+)/);
  if (nivelMatch) return `P${nivelMatch[1]}`;

  // "Cave" / "Cave N"
  const caveMatch = lower.match(/cave\s*(\d+)?/);
  if (caveMatch)
    return `P${caveMatch[1] ? `-${caveMatch[1]}` : "-1"}`;

  // Bare number
  const bareNum = lower.match(/^(-?\d+)$/);
  if (bareNum) return `P${bareNum[1]}`;

  return storey;
}

/**
 * From a list of candidate tasks (all with the same phase),
 * find the one whose name best matches the element's storey.
 */
function findStoreyTask(
  tasks: ScheduleTask[],
  storey: string | undefined,
): ScheduleTask | undefined {
  if (tasks.length === 0) return undefined;
  if (!storey || tasks.length === 1) return tasks[0];

  const normStorey = normalizeStorey(storey);

  // Try exact storey string in task name
  for (const task of tasks) {
    if (task.name.toLowerCase().includes(storey.toLowerCase())) return task;
  }

  // Try normalized storey match against task name
  for (const task of tasks) {
    const taskStoreyMatch = task.name.match(
      /[Pp]iso\s*(-?\d+)|[Nn][ií]vel\s*(-?\d+)|R\/C|Cobertura/i,
    );
    if (taskStoreyMatch) {
      const taskNorm = normalizeStorey(taskStoreyMatch[0]);
      if (taskNorm === normStorey) return task;
    }
  }

  // Try WBS code match (e.g., "06.01.P1" contains "P1")
  for (const task of tasks) {
    if (task.wbs.includes(normStorey)) return task;
  }

  // No storey match found — return first non-summary task
  return tasks.find((t) => !t.isSummary) ?? tasks[0];
}

// ============================================================
// Wall Disambiguation
// ============================================================

function resolveWallPhase(element: IfcQuantityData): ConstructionPhase {
  const isExternal =
    element.propertySetData?.["Pset_WallCommon"]?.IsExternal;
  if (isExternal === false) return "internal_walls";
  return "external_walls";
}

// ============================================================
// Strategy Functions
// ============================================================

function mapViaKeynote(
  resolution: KeynoteResolution,
  element: IfcQuantityData,
  tasksByPhase: Map<ConstructionPhase, ScheduleTask[]>,
  summaryByPhase: Map<ConstructionPhase, ScheduleTask>,
): ElementTaskLink | null {
  const entityNorm = element.entityType.toUpperCase().replace("IFC", "");

  // Get phase from chapter code
  let phase = chapterToPhase(resolution.chapterCode);
  let confidenceAdjust = 0;

  // Wall disambiguation
  if (entityNorm === "WALL" || entityNorm === "WALLSTANDARDCASE") {
    phase = resolveWallPhase(element);
  }

  // Fixture override
  if (FIXTURE_ENTITY_OVERRIDES[entityNorm]) {
    phase = FIXTURE_ENTITY_OVERRIDES[entityNorm];
    confidenceAdjust = -5;
  }

  // Find tasks for this phase
  const phaseTasks = tasksByPhase.get(phase);
  const task = phaseTasks
    ? findStoreyTask(phaseTasks, element.storey)
    : summaryByPhase.get(phase);

  if (!task) return null;

  return {
    elementId: resolution.elementId,
    entityType: element.entityType,
    taskUid: task.uid,
    taskName: task.name,
    phase,
    confidence: Math.max(0, resolution.confidence + confidenceAdjust),
    method: "keynote",
    storey: element.storey,
    chapterCode: resolution.chapterCode,
  };
}

function mapViaTypeStorey(
  element: IfcQuantityData,
  tasksByPhase: Map<ConstructionPhase, ScheduleTask[]>,
  summaryByPhase: Map<ConstructionPhase, ScheduleTask>,
): ElementTaskLink | null {
  const entityNorm = element.entityType.toUpperCase().replace("IFC", "");
  const elementId = element.globalId ?? element.name;

  // Wall disambiguation first
  if (entityNorm === "WALL" || entityNorm === "WALLSTANDARDCASE") {
    const phase = resolveWallPhase(element);
    const phaseTasks = tasksByPhase.get(phase);
    const task = phaseTasks
      ? findStoreyTask(phaseTasks, element.storey)
      : summaryByPhase.get(phase);
    if (task) {
      return {
        elementId,
        entityType: element.entityType,
        taskUid: task.uid,
        taskName: task.name,
        phase,
        confidence: 40,
        method: "type_storey",
        storey: element.storey,
      };
    }
  }

  for (const mapping of ENTITY_TO_PHASE) {
    if (entityNorm.includes(mapping.pattern)) {
      const phaseTasks = tasksByPhase.get(mapping.phase);
      const task = phaseTasks
        ? findStoreyTask(phaseTasks, element.storey)
        : summaryByPhase.get(mapping.phase);
      if (task) {
        return {
          elementId,
          entityType: element.entityType,
          taskUid: task.uid,
          taskName: task.name,
          phase: mapping.phase,
          confidence: mapping.confidence,
          method: "type_storey",
          storey: element.storey,
        };
      }
    }
  }

  return null;
}

function mapViaSystem(
  element: IfcQuantityData,
  tasksByPhase: Map<ConstructionPhase, ScheduleTask[]>,
  summaryByPhase: Map<ConstructionPhase, ScheduleTask>,
): ElementTaskLink | null {
  const elementId = element.globalId ?? element.name;

  // Check properties for system-related keys
  const systemValue =
    (element.properties["System Name"] as string) ??
    (element.properties["SystemName"] as string) ??
    (element.properties["SystemType"] as string) ??
    (element.properties["System Classification"] as string) ??
    "";

  if (!systemValue) return null;

  const lower = systemValue.toLowerCase();

  for (const mapping of SYSTEM_KEYWORDS_TO_PHASE) {
    if (mapping.keywords.some((kw) => lower.includes(kw))) {
      const phaseTasks = tasksByPhase.get(mapping.phase);
      const task = phaseTasks
        ? findStoreyTask(phaseTasks, element.storey)
        : summaryByPhase.get(mapping.phase);
      if (task) {
        return {
          elementId,
          entityType: element.entityType,
          taskUid: task.uid,
          taskName: task.name,
          phase: mapping.phase,
          confidence: 50,
          method: "system",
          storey: element.storey,
        };
      }
    }
  }

  return null;
}

function mapViaFallback(
  element: IfcQuantityData,
  summaryByPhase: Map<ConstructionPhase, ScheduleTask>,
): ElementTaskLink | null {
  const entityNorm = element.entityType.toUpperCase().replace("IFC", "");
  const elementId = element.globalId ?? element.name;

  // Very broad categorization
  let phase: ConstructionPhase | null = null;
  if (
    entityNorm.includes("FLOW") ||
    entityNorm.includes("PIPE") ||
    entityNorm.includes("DISTRIBUTION")
  ) {
    phase = "rough_in_plumbing";
  } else if (
    entityNorm.includes("CABLE") ||
    entityNorm.includes("ELECTRIC") ||
    entityNorm.includes("LIGHT")
  ) {
    phase = "rough_in_electrical";
  } else if (
    entityNorm.includes("DUCT") ||
    entityNorm.includes("AIR") ||
    entityNorm.includes("UNITARY")
  ) {
    phase = "rough_in_hvac";
  } else if (entityNorm.includes("BUILDING") || entityNorm.includes("PROXY")) {
    phase = "structure";
  }

  if (!phase) return null;

  const task = summaryByPhase.get(phase);
  if (!task) return null;

  return {
    elementId,
    entityType: element.entityType,
    taskUid: task.uid,
    taskName: task.name,
    phase,
    confidence: 25,
    method: "fallback",
    storey: element.storey,
  };
}

// ============================================================
// Main Entry
// ============================================================

/**
 * Map IFC elements to schedule tasks.
 *
 * Accepts pre-computed resolutions (efficient when keynote resolution
 * was already done) or computes them from raw analyses.
 */
export function mapElementsToTasks(
  analyses: SpecialtyAnalysisResult[],
  schedule: ProjectSchedule,
  options?: {
    resolutions?: KeynoteResolution[];
    boq?: GeneratedBoq;
  },
): ElementTaskMappingResult {
  // Step 1: Get or compute resolutions
  const resolutions =
    options?.resolutions ??
    options?.boq?.resolutions ??
    generateBoqFromIfc(analyses, "mapping", "2026-01-01").resolutions;

  // Step 2: Index resolutions by elementId
  const resolutionMap = new Map<string, KeynoteResolution>();
  for (const r of resolutions) {
    resolutionMap.set(r.elementId, r);
  }

  // Step 3: Index schedule tasks by phase
  const tasksByPhase = new Map<ConstructionPhase, ScheduleTask[]>();
  const summaryByPhase = new Map<ConstructionPhase, ScheduleTask>();

  for (const task of schedule.tasks) {
    if (task.isSummary) {
      summaryByPhase.set(task.phase, task);
    } else {
      const list = tasksByPhase.get(task.phase) ?? [];
      list.push(task);
      tasksByPhase.set(task.phase, list);
    }
  }

  // Step 4: Flatten IFC elements (skip TYPE/STYLE)
  const allElements: IfcQuantityData[] = [];
  for (const analysis of analyses) {
    for (const q of analysis.quantities) {
      const norm = q.entityType.toUpperCase().replace("IFC", "");
      if (norm.endsWith("TYPE") || norm.endsWith("STYLE")) continue;
      allElements.push(q);
    }
  }

  // Step 5: Map each element
  const links: ElementTaskLink[] = [];
  const unmapped: ElementTaskMappingResult["unmapped"] = [];

  for (const element of allElements) {
    const elementId = element.globalId ?? element.name;
    const resolution = resolutionMap.get(elementId);

    let link: ElementTaskLink | null = null;

    // Strategy 1: Keynote
    if (resolution) {
      link = mapViaKeynote(
        resolution,
        element,
        tasksByPhase,
        summaryByPhase,
      );
    }

    // Strategy 2: Type + Storey
    if (!link) {
      link = mapViaTypeStorey(element, tasksByPhase, summaryByPhase);
    }

    // Strategy 3: System
    if (!link) {
      link = mapViaSystem(element, tasksByPhase, summaryByPhase);
    }

    // Strategy 4: Fallback
    if (!link) {
      link = mapViaFallback(element, summaryByPhase);
    }

    if (link) {
      links.push(link);
    } else {
      unmapped.push({
        elementId,
        entityType: element.entityType,
        storey: element.storey,
        reason: "No matching schedule task found",
      });
    }
  }

  // Step 6: Compute statistics
  const byMethod: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  for (const l of links) {
    byMethod[l.method] = (byMethod[l.method] ?? 0) + 1;
    byPhase[l.phase] = (byPhase[l.phase] ?? 0) + 1;
  }

  return {
    links,
    unmapped,
    stats: {
      totalElements: allElements.length,
      mapped: links.length,
      unmapped: unmapped.length,
      coveragePercent:
        allElements.length > 0
          ? Math.round((links.length / allElements.length) * 100)
          : 0,
      byMethod,
      byPhase,
    },
  };
}

// ============================================================
// Export Review Table
// ============================================================

/**
 * Export a flat mapping table for user review/override.
 */
export function exportTaskMappingTable(
  analyses: SpecialtyAnalysisResult[],
  result: ElementTaskMappingResult,
): ElementTaskReviewRow[] {
  // Build element lookup
  const elementMap = new Map<string, IfcQuantityData>();
  for (const analysis of analyses) {
    for (const q of analysis.quantities) {
      const id = q.globalId ?? q.name;
      elementMap.set(id, q);
    }
  }

  return result.links.map((link) => {
    const element = elementMap.get(link.elementId);
    const pronicChapter = PRONIC_CHAPTERS.find(
      (c) => c.code === link.chapterCode,
    );

    return {
      elementId: link.elementId,
      entityType: link.entityType,
      elementName: element?.name ?? link.elementId,
      storey: link.storey ?? element?.storey ?? "",
      chapterCode: link.chapterCode ?? "",
      chapterName: pronicChapter?.name ?? "",
      phase: link.phase,
      taskUid: link.taskUid,
      taskName: link.taskName,
      confidence: link.confidence,
      method: link.method,
    };
  });
}

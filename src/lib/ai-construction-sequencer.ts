/**
 * AI Construction Sequencer
 *
 * Uses Claude to analyze IFC model data and generate a project-specific
 * construction sequence. Instead of mechanical pattern matching, the AI
 * reasons about *this* building's construction logic: spatial relationships,
 * material dependencies, storey-by-storey progression, and Portuguese
 * construction methodology.
 *
 * The output maps every IFC element to a construction step with high
 * confidence, producing a cumulative build-up sequence from earthworks
 * to final finishes.
 */

import type { SpecialtyAnalysisResult, IfcQuantityData } from "./ifc-specialty-analyzer";
import type { BuildingProject } from "./types";
import type { ConstructionPhase } from "./wbs-types";
import { PRONIC_CHAPTERS } from "./wbs-types";
import { createLogger } from "./logger";

const log = createLogger("ai-sequencer");

// ============================================================
// Types
// ============================================================

export interface AiConstructionStep {
  /** Unique step identifier (e.g., "S001") */
  stepId: string;
  /** Human-readable name (Portuguese) */
  name: string;
  /** Maps to existing ConstructionPhase enum */
  phase: ConstructionPhase;
  /** IFC GlobalIds or element names assigned to this step */
  elementIds: string[];
  /** Storey this step applies to (null = project-wide) */
  storey: string | null;
  /** Step IDs this depends on (must complete first) */
  predecessors: string[];
  /** AI's explanation for why this step is in this position */
  rationale: string;
  /** AI-estimated duration in working days (informational) */
  estimatedDurationDays?: number;
}

export interface AiSequenceResult {
  /** Ordered construction steps */
  steps: AiConstructionStep[];
  /** Per-element mapping: elementId → step assignment */
  elementMapping: Map<string, { stepId: string; phase: ConstructionPhase; confidence: number }>;
  /** Elements the AI could not assign */
  unmappedElements: string[];
  /** Overall construction strategy explanation */
  aiRationale: string;
  /** API token usage */
  tokenUsage: { input: number; output: number };
}

/** Compact element summary for the AI prompt (keeps token count manageable) */
interface ElementSummaryGroup {
  entityType: string;
  storey: string;
  count: number;
  totalArea?: number;
  totalVolume?: number;
  totalLength?: number;
  materials: string[];
  /** Representative element IDs (all in this group) */
  elementIds: string[];
}

// ============================================================
// Valid phases set (for validation)
// ============================================================

const VALID_PHASES = new Set<string>([
  "site_setup", "demolition", "earthworks", "foundations", "structure",
  "external_walls", "roof", "waterproofing", "external_frames",
  "rough_in_plumbing", "rough_in_electrical", "rough_in_hvac",
  "rough_in_gas", "rough_in_telecom", "internal_walls", "insulation",
  "external_finishes", "internal_finishes", "flooring", "ceilings",
  "carpentry", "plumbing_fixtures", "electrical_fixtures", "painting",
  "metalwork", "fire_safety", "elevators", "external_works",
  "testing", "cleanup",
]);

// ============================================================
// Prompt Building
// ============================================================

/**
 * Summarize IFC elements into compact groups for the AI prompt.
 * Groups by (entityType, storey) to reduce token count while preserving
 * all element IDs for mapping.
 */
function summarizeElements(
  analyses: SpecialtyAnalysisResult[],
): { groups: ElementSummaryGroup[]; totalElements: number; storeys: string[] } {
  const groupMap = new Map<string, ElementSummaryGroup>();
  let totalElements = 0;
  const storeySet = new Set<string>();

  for (const analysis of analyses) {
    for (const q of analysis.quantities) {
      const norm = q.entityType.toUpperCase().replace("IFC", "");
      if (norm.endsWith("TYPE") || norm.endsWith("STYLE")) continue;

      const elementId = q.globalId ?? q.name;
      if (!elementId) continue;

      totalElements++;
      const storey = q.storey ?? "Unknown";
      storeySet.add(storey);

      const key = `${q.entityType}::${storey}`;
      const existing = groupMap.get(key);

      if (existing) {
        existing.count++;
        existing.elementIds.push(elementId);
        if (q.quantities.area) existing.totalArea = (existing.totalArea ?? 0) + q.quantities.area;
        if (q.quantities.volume) existing.totalVolume = (existing.totalVolume ?? 0) + q.quantities.volume;
        if (q.quantities.length) existing.totalLength = (existing.totalLength ?? 0) + q.quantities.length;
        for (const mat of q.materials) {
          if (!existing.materials.includes(mat)) existing.materials.push(mat);
        }
      } else {
        groupMap.set(key, {
          entityType: q.entityType,
          storey,
          count: 1,
          totalArea: q.quantities.area,
          totalVolume: q.quantities.volume,
          totalLength: q.quantities.length,
          materials: [...q.materials],
          elementIds: [elementId],
        });
      }
    }
  }

  return {
    groups: Array.from(groupMap.values()),
    totalElements,
    storeys: Array.from(storeySet).sort(),
  };
}

/**
 * Build the system prompt that instructs Claude to act as a Portuguese
 * construction site manager sequencing a specific project.
 */
function buildSystemPrompt(): string {
  return `You are an expert Portuguese construction site manager (Diretor de Obra) with 30 years of experience.

Your task: Given an IFC building model's element inventory, produce the optimal construction sequence — the exact order in which elements should be built, starting from bare terrain.

## Portuguese Construction Methodology

Follow this canonical phase order (adapt based on the specific project):
${PRONIC_CHAPTERS.map((c, i) => `${i + 1}. ${c.name} (phase: "${c.phase}")`).join("\n")}

Key principles:
- Earthworks and foundations first, always
- Structure progresses storey by storey (floor 0 → 1 → 2 → ...)
- Envelope follows structure: external walls, then roof, then waterproofing
- MEP rough-in can start while envelope is in progress (with lag)
- Interior finishes only after MEP rough-in is complete
- Fixtures after finishes
- Testing and cleanup last
- Phases within the same storey can overlap where safe

## Rules

1. Every element ID in the input MUST appear in exactly one step's elementIds
2. Each step must reference a valid phase from the enum
3. Steps must form a valid dependency graph (no cycles)
4. Group elements logically: same type + same storey = same step (unless split by phase)
5. Provide clear rationale for each step's position
6. Think about what a worker on site would see: which elements need physical support from which other elements?

## Output Format

Respond with ONLY a JSON object (no markdown, no commentary):
{
  "rationale": "Overall construction strategy explanation (1-2 paragraphs, Portuguese)",
  "steps": [
    {
      "stepId": "S001",
      "name": "Step name in Portuguese",
      "phase": "earthworks",
      "elementIds": ["guid1", "guid2", ...],
      "storey": "Piso 0" or null,
      "predecessors": [],
      "rationale": "Why this step is here",
      "estimatedDurationDays": 5
    }
  ]
}`;
}

/**
 * Build the user prompt with the specific project's IFC data.
 */
function buildUserPrompt(
  analyses: SpecialtyAnalysisResult[],
  project: Partial<BuildingProject>,
  summary: { groups: ElementSummaryGroup[]; totalElements: number; storeys: string[] },
): string {
  const parts: string[] = [];

  // Project metadata
  parts.push("## Project");
  parts.push(`- Name: ${project.name ?? "Unknown"}`);
  parts.push(`- Type: ${project.buildingType ?? "Unknown"}`);
  parts.push(`- Location: ${project.location?.municipality ?? "Unknown"}, ${project.location?.district ?? "Unknown"}`);
  parts.push(`- Floors: ${project.numberOfFloors ?? "Unknown"}`);
  parts.push(`- Height: ${project.buildingHeight ?? "Unknown"} m`);
  parts.push(`- Gross area: ${project.grossFloorArea ?? "Unknown"} m²`);
  parts.push(`- Storeys detected: ${summary.storeys.join(", ")}`);
  parts.push(`- Total elements: ${summary.totalElements}`);
  parts.push("");

  // Specialty breakdown
  parts.push("## Specialties");
  for (const a of analyses) {
    parts.push(`- ${a.specialty}: ${a.summary.totalElements} elements`);
    if (a.summary.storeys.length > 0) {
      parts.push(`  Storeys: ${a.summary.storeys.join(", ")}`);
    }
    if (a.summary.materialsUsed.length > 0) {
      parts.push(`  Materials: ${a.summary.materialsUsed.slice(0, 10).join(", ")}`);
    }
  }
  parts.push("");

  // Element inventory grouped by storey
  parts.push("## Element Inventory");
  parts.push("");

  // Sort groups by storey, then entity type
  const sortedGroups = [...summary.groups].sort((a, b) => {
    const storeyCompare = a.storey.localeCompare(b.storey);
    if (storeyCompare !== 0) return storeyCompare;
    return a.entityType.localeCompare(b.entityType);
  });

  let currentStorey = "";
  for (const group of sortedGroups) {
    if (group.storey !== currentStorey) {
      currentStorey = group.storey;
      parts.push(`### ${currentStorey}`);
    }

    let line = `- ${group.entityType} × ${group.count}`;
    const metrics: string[] = [];
    if (group.totalArea) metrics.push(`${group.totalArea.toFixed(1)} m²`);
    if (group.totalVolume) metrics.push(`${group.totalVolume.toFixed(2)} m³`);
    if (group.totalLength) metrics.push(`${group.totalLength.toFixed(1)} m`);
    if (metrics.length > 0) line += ` (${metrics.join(", ")})`;
    if (group.materials.length > 0) line += ` [${group.materials.slice(0, 3).join(", ")}]`;
    line += ` → IDs: ${group.elementIds.join(",")}`;

    parts.push(line);
  }

  parts.push("");
  parts.push("Generate the construction sequence for this specific building. Every element ID listed above must appear in exactly one step.");

  return parts.join("\n");
}

// ============================================================
// Response Parsing
// ============================================================

/**
 * Parse and validate the AI's JSON response into typed AiConstructionSteps.
 */
function parseAiResponse(
  responseText: string,
  allElementIds: Set<string>,
): { steps: AiConstructionStep[]; rationale: string; unmapped: string[] } {
  // Extract JSON from response (handle potential markdown wrapping)
  let jsonStr = responseText.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  // Also handle case where response starts with text before JSON
  const braceStart = jsonStr.indexOf("{");
  if (braceStart > 0) {
    jsonStr = jsonStr.slice(braceStart);
  }

  const parsed = JSON.parse(jsonStr) as {
    rationale?: string;
    steps?: Array<{
      stepId?: string;
      name?: string;
      phase?: string;
      elementIds?: string[];
      storey?: string | null;
      predecessors?: string[];
      rationale?: string;
      estimatedDurationDays?: number;
    }>;
  };

  if (!parsed.steps || !Array.isArray(parsed.steps)) {
    throw new Error("AI response missing 'steps' array");
  }

  const assignedIds = new Set<string>();
  const steps: AiConstructionStep[] = [];

  for (let i = 0; i < parsed.steps.length; i++) {
    const raw = parsed.steps[i];

    // Validate phase
    const phase = (raw.phase ?? "site_setup") as ConstructionPhase;
    if (!VALID_PHASES.has(phase)) {
      log.warn(`AI step ${i} has invalid phase "${raw.phase}", defaulting to site_setup`);
    }

    // Filter element IDs to only those that exist in the model
    const validIds = (raw.elementIds ?? []).filter((id) => {
      if (!allElementIds.has(id)) return false;
      if (assignedIds.has(id)) return false; // avoid duplicates
      assignedIds.add(id);
      return true;
    });

    steps.push({
      stepId: raw.stepId ?? `S${String(i + 1).padStart(3, "0")}`,
      name: raw.name ?? `Step ${i + 1}`,
      phase: VALID_PHASES.has(phase) ? phase : "site_setup",
      elementIds: validIds,
      storey: raw.storey ?? null,
      predecessors: raw.predecessors ?? [],
      rationale: raw.rationale ?? "",
      estimatedDurationDays: raw.estimatedDurationDays,
    });
  }

  // Find unmapped elements
  const unmapped = Array.from(allElementIds).filter((id) => !assignedIds.has(id));

  return {
    steps,
    rationale: parsed.rationale ?? "",
    unmapped,
  };
}

// ============================================================
// Main Entry
// ============================================================

export interface AiSequenceOptions {
  /** Max workers for team size context */
  maxWorkers?: number;
  /** Override API key (for testing) */
  apiKey?: string;
  /** Override model (defaults based on analysisDepth) */
  model?: string;
  /** Enable extended thinking for complex projects (default: auto based on element count) */
  enableThinking?: boolean;
  /** Analysis depth — affects model choice, thinking budget, and context */
  analysisDepth?: "quick" | "standard" | "deep";
  /** Enriched context from PDFs + BOQ for deep mode */
  enrichedContext?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Generate an AI-driven construction sequence from IFC analysis data.
 *
 * Sends the element inventory to Claude, which returns an ordered
 * construction sequence with element-to-step assignments.
 *
 * Falls through gracefully: if the API call fails, the caller should
 * fall back to the existing mechanical sequencer.
 */
export async function generateAiSequence(
  analyses: SpecialtyAnalysisResult[],
  project: Partial<BuildingProject>,
  options?: AiSequenceOptions,
): Promise<AiSequenceResult> {
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // Summarize elements for the prompt
  const summary = summarizeElements(analyses);
  if (summary.totalElements === 0) {
    throw new Error("No IFC elements to sequence");
  }

  log.info("Building AI sequence prompt", {
    totalElements: summary.totalElements,
    groups: summary.groups.length,
    storeys: summary.storeys.length,
  });

  // Collect all element IDs for validation
  const allElementIds = new Set<string>();
  for (const group of summary.groups) {
    for (const id of group.elementIds) {
      allElementIds.add(id);
    }
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(analyses, project, summary);

  const depth = options?.analysisDepth ?? "standard";

  // Model selection based on depth:
  //   quick    → Sonnet (fast, cheap, good enough for scoping)
  //   standard → Opus (default, extended thinking auto for complex)
  //   deep     → Opus (always extended thinking, high budget)
  const model = options?.model ?? (
    depth === "quick" ? "claude-sonnet-4-6" : "claude-opus-4-6"
  );

  // Extended thinking:
  //   quick    → never
  //   standard → auto (>200 elements)
  //   deep     → always, high budget
  const useThinking = options?.enableThinking ?? (
    depth === "quick" ? false :
    depth === "deep" ? true :
    summary.totalElements > 200
  );
  const thinkingBudget = depth === "deep"
    ? (summary.totalElements > 500 ? 48000 : 24000)
    : (summary.totalElements > 500 ? 32000 : 10000);

  log.info("Calling AI sequence API", {
    model,
    depth,
    thinking: useThinking,
    thinkingBudget: useThinking ? thinkingBudget : 0,
    promptChars: userPrompt.length,
    elementCount: summary.totalElements,
  });

  // In deep mode, append enriched context from PDFs + BOQ to the user prompt
  const fullUserPrompt = options?.enrichedContext
    ? `${userPrompt}\n\n# Additional Project Context (from documents and BOQ)\n${options.enrichedContext}`
    : userPrompt;

  // Build request body — extended thinking adds a `thinking` parameter
  // and requires a higher max_tokens to cover both thinking + output.
  const maxTokens = depth === "quick" ? 8192 : useThinking ? 32768 : 16384;
  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: fullUserPrompt }],
  };
  if (useThinking) {
    requestBody.thinking = { type: "enabled", budget_tokens: thinkingBudget };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    log.error(`AI API error ${response.status}`, { body: errText.slice(0, 500) });
    throw new Error(`AI API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const answerText = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");

  if (!answerText) {
    throw new Error("AI returned empty response");
  }

  const tokenUsage = {
    input: data.usage?.input_tokens ?? 0,
    output: data.usage?.output_tokens ?? 0,
  };

  log.info("AI sequence response received", {
    responseChars: answerText.length,
    tokens: tokenUsage,
  });

  // Parse the response
  const { steps, rationale, unmapped } = parseAiResponse(answerText, allElementIds);

  // Build element mapping
  const elementMapping = new Map<string, { stepId: string; phase: ConstructionPhase; confidence: number }>();
  for (const step of steps) {
    for (const elementId of step.elementIds) {
      elementMapping.set(elementId, {
        stepId: step.stepId,
        phase: step.phase,
        confidence: 90, // AI-assigned: high confidence
      });
    }
  }

  log.info("AI sequence complete", {
    steps: steps.length,
    mapped: elementMapping.size,
    unmapped: unmapped.length,
    coveragePercent: allElementIds.size > 0
      ? Math.round((elementMapping.size / allElementIds.size) * 100)
      : 0,
  });

  return {
    steps,
    elementMapping,
    unmappedElements: unmapped,
    aiRationale: rationale,
    tokenUsage,
  };
}

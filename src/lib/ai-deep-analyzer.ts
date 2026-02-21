/**
 * AI Deep Analyzer — Multi-pass orchestrator for "deep" analysis mode.
 *
 * In deep mode, the AI doesn't just sequence in one shot. It:
 *   1. Assembles a unified context from ALL parsed data (IFC + PDFs + BOQ)
 *   2. Generates the construction sequence with full project awareness
 *   3. Validates the sequence against regulations and project constraints
 *   4. Refines the sequence based on validation findings
 *
 * This produces higher-quality results at the cost of more API calls
 * and token usage (~€15-40 per run vs ~€2-8 for standard mode).
 */

import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
import type { BuildingProject } from "./types";
import type { WbsProject, ConstructionPhase } from "./wbs-types";
import type { AiSequenceResult, AiConstructionStep } from "./ai-construction-sequencer";
import { createLogger } from "./logger";

const log = createLogger("ai-deep-analyzer");

// ============================================================
// Types
// ============================================================

export interface DeepAnalysisContext {
  project: BuildingProject;
  ifcAnalyses: SpecialtyAnalysisResult[];
  wbsProject?: WbsProject;
  /** Raw text extracted from all PDFs */
  pdfTexts: string[];
  apiKey: string;
  signal?: AbortSignal;
  onProgress?: (fraction: number, message: string) => void;
}

export interface ValidationFinding {
  severity: "error" | "warning" | "info";
  category: string;
  description: string;
  affectedSteps: string[];
  suggestion: string;
}

export interface DeepAnalysisAdditions {
  validationFindings: ValidationFinding[];
  refinementPasses: number;
  wasRefined: boolean;
  enrichedContext: string;
}

// ============================================================
// Valid phases (duplicated from sequencer to avoid circular dep)
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
// Context Assembly
// ============================================================

/**
 * Build a rich context string from all available project data.
 * This gives the AI sequencer awareness of PDF contents, BOQ items,
 * and regulatory constraints — not just IFC geometry.
 */
export function assembleEnrichedContext(ctx: DeepAnalysisContext): string {
  const parts: string[] = [];

  // Project metadata from PDF parsing
  parts.push("## Project Intelligence (from documents)");
  parts.push(`- Name: ${ctx.project.name}`);
  parts.push(`- Type: ${ctx.project.buildingType}`);
  parts.push(`- Location: ${ctx.project.location?.municipality ?? "Unknown"}, ${ctx.project.location?.district ?? "Unknown"}`);
  parts.push(`- Floors: ${ctx.project.numberOfFloors ?? "Unknown"}`);
  parts.push(`- Gross area: ${ctx.project.grossFloorArea ?? "Unknown"} m²`);
  parts.push(`- Height: ${ctx.project.buildingHeight ?? "Unknown"} m`);
  parts.push(`- Rehabilitation: ${ctx.project.isRehabilitation ? "Yes" : "No"}`);

  if (ctx.project.structural) {
    parts.push(`- Structural system: ${ctx.project.structural.structuralSystem ?? "Unknown"}`);
    parts.push(`- Foundation type: ${ctx.project.structural.foundationType ?? "Unknown"}`);
  }
  if (ctx.project.systems) {
    const sys = ctx.project.systems;
    parts.push(`- Heating: ${sys.heatingSystem ?? "Unknown"}`);
    parts.push(`- Cooling: ${sys.coolingSystem ?? "Unknown"}`);
    parts.push(`- DHW: ${sys.dhwSystem ?? "Unknown"}`);
    if (sys.hasSolarPV) parts.push(`- Solar PV: ${sys.solarPVCapacity ?? "?"} kWp`);
    if (sys.hasSolarThermal) parts.push(`- Solar thermal: ${sys.solarThermalArea ?? "?"} m²`);
  }
  if (ctx.project.licensing) {
    parts.push(`- Project phase: ${ctx.project.licensing.projectPhase ?? "Unknown"}`);
    if (ctx.project.licensing.isInARU) parts.push("- In ARU (urban rehabilitation area)");
    if (ctx.project.licensing.isProtectedArea) parts.push("- Protected area");
  }
  parts.push("");

  // BOQ summary
  if (ctx.wbsProject) {
    parts.push("## Bill of Quantities Summary");
    let totalArticles = 0;
    for (const ch of ctx.wbsProject.chapters) {
      let chapterTotal = 0;
      for (const sc of ch.subChapters) {
        chapterTotal += sc.articles.length;
      }
      totalArticles += chapterTotal;
      parts.push(`- ${ch.code} ${ch.name}: ${chapterTotal} articles`);
    }
    parts.push(`- Total articles: ${totalArticles}`);
    parts.push("");
  }

  // PDF excerpts (key specifications and constraints)
  if (ctx.pdfTexts.length > 0) {
    parts.push("## Key Document Excerpts");
    for (let i = 0; i < ctx.pdfTexts.length; i++) {
      const text = ctx.pdfTexts[i];
      if (text.length > 50) {
        parts.push(`### Document ${i + 1}`);
        parts.push(text.slice(0, 3000));
        if (text.length > 3000) parts.push("... (truncated)");
        parts.push("");
      }
    }
  }

  return parts.join("\n");
}

// ============================================================
// Validation Pass
// ============================================================

/**
 * Ask AI to review the generated sequence against project context.
 * Checks for logical errors, missing dependencies, regulatory
 * concerns, and cross-document contradictions.
 */
export async function validateSequence(
  sequence: AiSequenceResult,
  enrichedContext: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ findings: ValidationFinding[]; tokenUsage: { input: number; output: number } }> {
  const systemPrompt = `You are a Portuguese construction quality auditor (Fiscal de Obra) reviewing a construction sequence.

Your task: Review the proposed sequence for this specific project and identify issues.

Check for:
1. LOGICAL ERRORS: Steps that depend on something not yet built
2. MISSING DEPENDENCIES: Steps missing predecessors
3. REGULATORY CONCERNS: Sequence conflicting with Portuguese regulations or project constraints
4. UNREALISTIC DURATIONS: Steps too short or too long for scope
5. CROSS-DOCUMENT CONFLICTS: Contradictions between IFC model and document specifications
6. RESOURCE CONFLICTS: Too many trades simultaneously in the same area

Respond with ONLY a JSON object:
{
  "findings": [
    {
      "severity": "error|warning|info",
      "category": "logical|dependency|regulatory|duration|conflict|resource",
      "description": "What's wrong (Portuguese)",
      "affectedSteps": ["S001", "S005"],
      "suggestion": "How to fix it (Portuguese)"
    }
  ],
  "overallAssessment": "Brief overall assessment (Portuguese)"
}`;

  const stepsJson = JSON.stringify(sequence.steps.map(s => ({
    stepId: s.stepId,
    name: s.name,
    phase: s.phase,
    storey: s.storey,
    predecessors: s.predecessors,
    elementCount: s.elementIds.length,
    estimatedDurationDays: s.estimatedDurationDays,
    rationale: s.rationale,
  })), null, 2);

  const userPrompt = `## Project Context
${enrichedContext}

## Proposed Construction Sequence (${sequence.steps.length} steps)
${stepsJson}

## AI Rationale
${sequence.aiRationale}

Review this sequence against the project context. Identify ALL issues, organized by severity (errors first, then warnings, then info).`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Validation API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const answerText = (data.content ?? [])
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  const tokenUsage = {
    input: data.usage?.input_tokens ?? 0,
    output: data.usage?.output_tokens ?? 0,
  };

  let findings: ValidationFinding[] = [];
  try {
    let jsonStr = answerText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const braceStart = jsonStr.indexOf("{");
    if (braceStart > 0) jsonStr = jsonStr.slice(braceStart);
    const lastBrace = jsonStr.lastIndexOf("}");
    if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);

    const parsed = JSON.parse(jsonStr) as { findings?: ValidationFinding[] };
    findings = (parsed.findings ?? []).map(f => ({
      severity: f.severity ?? "info",
      category: f.category ?? "logical",
      description: f.description ?? "",
      affectedSteps: Array.isArray(f.affectedSteps) ? f.affectedSteps : [],
      suggestion: f.suggestion ?? "",
    }));
  } catch (err) {
    log.warn("Failed to parse validation response", { error: String(err) });
  }

  // Sort by severity: error → warning → info
  const severityOrder = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

  return { findings, tokenUsage };
}

// ============================================================
// Refinement Pass
// ============================================================

/**
 * Ask AI to fix issues found during validation.
 * Provides the original sequence + validation findings and returns
 * a corrected sequence.
 */
export async function refineSequence(
  sequence: AiSequenceResult,
  findings: ValidationFinding[],
  enrichedContext: string,
  allElementIds: Set<string>,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ steps: AiConstructionStep[]; rationale: string; tokenUsage: { input: number; output: number } }> {
  const systemPrompt = `You are an expert Portuguese construction site manager (Diretor de Obra).
You previously generated a construction sequence, but quality review found issues.
Fix the identified problems while maintaining the overall structure.

Rules:
1. Every element ID must appear in exactly one step
2. Fix the specific issues listed — don't change things that are working
3. Maintain valid dependency graph (no cycles)
4. Provide updated rationale explaining what you changed and why

Respond with ONLY a JSON object (same format as the original sequence):
{
  "rationale": "Updated strategy explanation (Portuguese) — explain what changed",
  "steps": [
    {
      "stepId": "S001",
      "name": "Step name in Portuguese",
      "phase": "earthworks",
      "elementIds": ["guid1", "guid2"],
      "storey": "Piso 0" or null,
      "predecessors": [],
      "rationale": "Why this step is here",
      "estimatedDurationDays": 5
    }
  ]
}`;

  const currentStepsJson = JSON.stringify(sequence.steps.map(s => ({
    stepId: s.stepId,
    name: s.name,
    phase: s.phase,
    storey: s.storey,
    predecessors: s.predecessors,
    elementIds: s.elementIds,
    estimatedDurationDays: s.estimatedDurationDays,
    rationale: s.rationale,
  })), null, 2);

  // Only send actionable findings (errors and warnings)
  const actionableFindings = findings.filter(f => f.severity !== "info");
  const findingsJson = JSON.stringify(actionableFindings, null, 2);

  const userPrompt = `## Project Context
${enrichedContext}

## Current Sequence
${currentStepsJson}

## Issues Found by Quality Review
${findingsJson}

Fix ONLY the identified issues. Keep everything else unchanged. Every element ID from the original must still appear exactly once.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 32768,
      thinking: { type: "enabled", budget_tokens: 16000 },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Refinement API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const answerText = (data.content ?? [])
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  const tokenUsage = {
    input: data.usage?.input_tokens ?? 0,
    output: data.usage?.output_tokens ?? 0,
  };

  // Parse refined steps
  let jsonStr = answerText.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  const braceStart = jsonStr.indexOf("{");
  if (braceStart > 0) jsonStr = jsonStr.slice(braceStart);
  const lastBrace = jsonStr.lastIndexOf("}");
  if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);

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
    throw new Error("AI refinement response missing 'steps' array");
  }

  const assignedIds = new Set<string>();
  const steps: AiConstructionStep[] = [];

  for (let i = 0; i < parsed.steps.length; i++) {
    const raw = parsed.steps[i];
    const phase = (raw.phase ?? "site_setup") as ConstructionPhase;

    const validIds = (raw.elementIds ?? []).filter(id => {
      if (!allElementIds.has(id)) return false;
      if (assignedIds.has(id)) return false;
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

  return {
    steps,
    rationale: parsed.rationale ?? sequence.aiRationale,
    tokenUsage,
  };
}

// ============================================================
// Regulatory Deep Review
// ============================================================

/**
 * AI-powered review of regulatory findings — double-checks findings
 * for accuracy, ranks by severity and relevance to the project phase,
 * and adds actionable construction-oriented commentary.
 */
export async function reviewRegulatoryFindings(
  findings: Array<{ id: string; area: string; description: string; severity: string; regulation: string; article: string; currentValue?: string; requiredValue?: string }>,
  project: BuildingProject,
  pdfTexts: string[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ reviewedFindings: ReviewedFinding[]; tokenUsage: { input: number; output: number } }> {
  if (findings.length === 0) {
    return { reviewedFindings: [], tokenUsage: { input: 0, output: 0 } };
  }

  const systemPrompt = `You are a senior Portuguese construction regulatory consultant reviewing compliance findings for a construction project.

Your task: Review each finding for accuracy, relevance, and actionability. For each finding:
1. VERIFY: Is the finding correct? Could it be a false positive given the project context?
2. RANK: How severe is this for the current project phase?
3. COMMENT: What should the project team actually DO about this?
4. RELEVANCE: Is this finding relevant given what documents were submitted?

Respond with ONLY a JSON object:
{
  "reviewed": [
    {
      "id": "original finding ID",
      "verified": true|false,
      "adjustedSeverity": "critical|warning|info|pass",
      "relevanceScore": 0-100,
      "comment": "Actionable advice in Portuguese — what to do and why",
      "falsePositiveReason": "null or why this might be wrong (Portuguese)"
    }
  ]
}`;

  // Project phase context
  const phase = project.licensing?.projectPhase ?? "unknown";
  const pdfContext = pdfTexts.length > 0
    ? pdfTexts.map((t, i) => `Doc ${i + 1}: ${t.slice(0, 500)}`).join("\n")
    : "No documents provided";

  const findingsJson = JSON.stringify(findings.slice(0, 50).map(f => ({
    id: f.id,
    area: f.area,
    regulation: f.regulation,
    article: f.article,
    description: f.description,
    severity: f.severity,
    currentValue: f.currentValue,
    requiredValue: f.requiredValue,
  })), null, 2);

  const userPrompt = `## Project
- Type: ${project.buildingType}
- Location: ${project.location?.municipality ?? "Unknown"}
- Phase: ${phase}
- Floors: ${project.numberOfFloors ?? "Unknown"}
- Area: ${project.grossFloorArea ?? "Unknown"} m²
- Rehabilitation: ${project.isRehabilitation ? "Yes" : "No"}

## Document Summaries
${pdfContext}

## Findings to Review (${findings.length} total, showing first 50)
${findingsJson}

Review each finding. Verify accuracy, adjust severity based on project phase (${phase}), and provide actionable comments. Flag any false positives.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Regulatory review API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const answerText = (data.content ?? [])
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  const tokenUsage = {
    input: data.usage?.input_tokens ?? 0,
    output: data.usage?.output_tokens ?? 0,
  };

  let reviewedFindings: ReviewedFinding[] = [];
  try {
    let jsonStr = answerText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const braceStart = jsonStr.indexOf("{");
    if (braceStart > 0) jsonStr = jsonStr.slice(braceStart);
    const lastBrace = jsonStr.lastIndexOf("}");
    if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);

    const parsed = JSON.parse(jsonStr) as { reviewed?: ReviewedFinding[] };
    reviewedFindings = (parsed.reviewed ?? []).map(r => ({
      id: r.id ?? "",
      verified: r.verified ?? true,
      adjustedSeverity: r.adjustedSeverity ?? "info",
      relevanceScore: typeof r.relevanceScore === "number" ? r.relevanceScore : 50,
      comment: r.comment ?? "",
      falsePositiveReason: r.falsePositiveReason ?? null,
    }));
  } catch (err) {
    log.warn("Failed to parse regulatory review response", { error: String(err) });
  }

  // Sort by relevance (highest first), then severity
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  reviewedFindings.sort((a, b) => {
    const relDiff = b.relevanceScore - a.relevanceScore;
    if (Math.abs(relDiff) > 10) return relDiff;
    return (severityOrder[a.adjustedSeverity] ?? 2) - (severityOrder[b.adjustedSeverity] ?? 2);
  });

  return { reviewedFindings, tokenUsage };
}

export interface ReviewedFinding {
  id: string;
  verified: boolean;
  adjustedSeverity: "critical" | "warning" | "info" | "pass";
  relevanceScore: number;
  comment: string;
  falsePositiveReason: string | null;
}

// ============================================================
// Price Match Review — AI improves matching, not pricing
// ============================================================

export interface MatchReviewDecision {
  articleCode: string;
  action: "confirm" | "swap" | "reject";
  /** If action=swap, the better price code from the database */
  newPriceCode?: string;
  /** Updated confidence after AI review */
  newConfidence?: number;
  rationale: string;
}

export interface MatchReviewResult {
  decisions: MatchReviewDecision[];
  tokenUsage: { input: number; output: number };
  /** How many matches were confirmed, swapped, or rejected */
  stats: { confirmed: number; swapped: number; rejected: number };
}

/**
 * AI reviews low-confidence price matches — improving the pairing,
 * not the prices themselves. Prices always come from the scraped database.
 *
 * For each suspect match, the AI receives:
 *   - The BOQ article description
 *   - The current fuzzy match (with score and method)
 *   - 3-5 alternative candidates from the database
 * And decides: confirm (bump confidence), swap (use better candidate), or reject (send to unmatched).
 */
export async function reviewLowConfidenceMatches(
  lowConfidenceMatches: Array<{
    articleCode: string;
    articleDescription: string;
    articleUnit: string;
    priceCode: string;
    priceDescription: string;
    confidence: number;
    matchMethod: string;
  }>,
  alternatives: Map<string, Array<{
    code: string;
    description: string;
    unitCost: number;
    unit: string;
    score: number;
    variantRange?: { min: number; max: number; count: number };
  }>>,
  projectContext: { buildingType: string; location: string; isRehabilitation?: boolean },
  apiKey: string,
  signal?: AbortSignal,
): Promise<MatchReviewResult> {
  if (lowConfidenceMatches.length === 0) {
    return {
      decisions: [],
      tokenUsage: { input: 0, output: 0 },
      stats: { confirmed: 0, swapped: 0, rejected: 0 },
    };
  }

  const systemPrompt = `You are a Portuguese Quantity Surveyor (Medidor-Orçamentista) reviewing automated price-matching results.

Our system fuzzy-matched BOQ articles against a database of 8,500+ Portuguese construction price items (from CYPE Gerador de Preços). Some matches have low confidence scores. Your task: review each low-confidence match and decide whether it's actually correct, should be swapped for a better candidate, or should be rejected entirely.

For each match, you receive:
- The BOQ article (code, description, unit)
- The current automated match (price code, description, confidence score, method)
- Alternative candidates from the database (with scores and variant price ranges)

For each, decide:
- **confirm**: The current match is actually correct despite the low score. Suggest a new confidence (50-80).
- **swap**: A listed alternative is a better match. Specify which price code. Give confidence 50-85.
- **reject**: None of the candidates adequately match this article. It should go to AI estimation.

Rules:
1. ONLY swap to a candidate that is in the alternatives list. Never invent price codes.
2. Units must be compatible (m² with m², Ud with Ud, etc.).
3. Consider the full description, not just keywords. "Isolamento térmico" with EPS 40mm is different from XPS 60mm.
4. When a candidate has a variantPriceRange, the price database has multiple specification options — a good sign of coverage.

Respond with ONLY a JSON object:
{
  "decisions": [
    {
      "articleCode": "06.01.003",
      "action": "confirm|swap|reject",
      "newPriceCode": "EHS010 (only for swap)",
      "newConfidence": 65,
      "rationale": "Brief reason in Portuguese"
    }
  ]
}`;

  // Batch up to 20 matches per call
  const batch = lowConfidenceMatches.slice(0, 20);

  const matchesForReview = batch.map(m => {
    const alts = alternatives.get(m.articleCode) ?? [];
    return {
      article: {
        code: m.articleCode,
        description: m.articleDescription,
        unit: m.articleUnit,
      },
      currentMatch: {
        priceCode: m.priceCode,
        priceDescription: m.priceDescription,
        confidence: m.confidence,
        method: m.matchMethod,
      },
      alternatives: alts.map(a => ({
        code: a.code,
        description: a.description.slice(0, 120),
        unitCost: a.unitCost,
        unit: a.unit,
        similarity: a.score,
        variantPriceRange: a.variantRange ?? undefined,
      })),
    };
  });

  const userPrompt = `## Project Context
- Type: ${projectContext.buildingType}
- Location: ${projectContext.location}
- Rehabilitation: ${projectContext.isRehabilitation ? "Yes" : "No"}

## Low-Confidence Matches to Review (${batch.length} of ${lowConfidenceMatches.length})
${JSON.stringify(matchesForReview, null, 2)}

Review each match. Confirm, swap, or reject. Remember: only swap to codes listed in the alternatives.`;

  log.info("Reviewing low-confidence matches", {
    total: lowConfidenceMatches.length,
    reviewing: batch.length,
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      thinking: { type: "enabled", budget_tokens: 8000 },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Match review API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const answerText = (data.content ?? [])
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  const tokenUsage = {
    input: data.usage?.input_tokens ?? 0,
    output: data.usage?.output_tokens ?? 0,
  };

  let decisions: MatchReviewDecision[] = [];
  try {
    let jsonStr = answerText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const braceStart = jsonStr.indexOf("{");
    if (braceStart > 0) jsonStr = jsonStr.slice(braceStart);
    const lastBrace = jsonStr.lastIndexOf("}");
    if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);

    const parsed = JSON.parse(jsonStr) as { decisions?: MatchReviewDecision[] };
    decisions = (parsed.decisions ?? []).map(d => ({
      articleCode: d.articleCode ?? "",
      action: (d.action === "confirm" || d.action === "swap" || d.action === "reject")
        ? d.action : "confirm",
      newPriceCode: d.action === "swap" ? d.newPriceCode : undefined,
      newConfidence: typeof d.newConfidence === "number"
        ? Math.min(85, Math.max(15, d.newConfidence)) : undefined,
      rationale: d.rationale ?? "",
    }));
  } catch (err) {
    log.warn("Failed to parse match review response", { error: String(err) });
  }

  const stats = {
    confirmed: decisions.filter(d => d.action === "confirm").length,
    swapped: decisions.filter(d => d.action === "swap").length,
    rejected: decisions.filter(d => d.action === "reject").length,
  };

  return { decisions, tokenUsage, stats };
}

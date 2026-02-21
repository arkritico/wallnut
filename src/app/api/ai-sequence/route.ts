import { NextResponse } from "next/server";
import type { SpecialtyAnalysisResult } from "@/lib/ifc-specialty-analyzer";
import type { BuildingProject } from "@/lib/types";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";

const log = createLogger("ai-sequence");

export const runtime = "nodejs";
export const maxDuration = 120; // AI calls can take up to 2 minutes for large models

/**
 * POST /api/ai-sequence
 *
 * Accepts IFC analysis data and project metadata, calls Claude to generate
 * a project-specific construction sequence with element-to-step mapping.
 *
 * Body (JSON):
 *   - ifcAnalyses: SpecialtyAnalysisResult[] (required)
 *   - project: Partial<BuildingProject> (optional, enriches context)
 *   - options: { maxWorkers?, startDate?, model? } (optional)
 *
 * Returns:
 *   - steps: AiConstructionStep[]
 *   - elementMapping: { elementId, stepId, phase, confidence }[]
 *   - unmappedElements: string[]
 *   - aiRationale: string
 *   - tokenUsage: { input, output }
 */
export const POST = withApiHandler("ai-sequence", async (request) => {
  const body = await request.json() as {
    ifcAnalyses?: SpecialtyAnalysisResult[];
    project?: Partial<BuildingProject>;
    options?: {
      maxWorkers?: number;
      startDate?: string;
      model?: string;
    };
  };

  // Validate input
  if (!body.ifcAnalyses || !Array.isArray(body.ifcAnalyses) || body.ifcAnalyses.length === 0) {
    return NextResponse.json(
      { error: "ifcAnalyses é obrigatório e deve conter pelo menos uma análise." },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Serviço de IA não configurado. Defina ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const totalElements = body.ifcAnalyses.reduce(
    (sum, a) => sum + (a.summary?.totalElements ?? a.quantities?.length ?? 0),
    0,
  );

  log.info("AI sequence request", {
    analyses: body.ifcAnalyses.length,
    totalElements,
    buildingType: body.project?.buildingType,
  });

  const { generateAiSequence } = await import("@/lib/ai-construction-sequencer");

  const result = await generateAiSequence(
    body.ifcAnalyses,
    body.project ?? {},
    {
      maxWorkers: body.options?.maxWorkers,
      model: body.options?.model,
      apiKey,
    },
  );

  // Serialize Map to array for JSON response
  const elementMappingArray = Array.from(result.elementMapping.entries()).map(
    ([elementId, mapping]) => ({
      elementId,
      stepId: mapping.stepId,
      phase: mapping.phase,
      confidence: mapping.confidence,
    }),
  );

  return NextResponse.json({
    steps: result.steps,
    elementMapping: elementMappingArray,
    unmappedElements: result.unmappedElements,
    aiRationale: result.aiRationale,
    tokenUsage: result.tokenUsage,
  });
}, { errorMessage: "Erro ao gerar sequência construtiva com IA." });

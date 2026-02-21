import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";

const log = createLogger("parse-document");

const MAX_DOCUMENT_LENGTH = 100_000; // 100 KB of text (supports chunked PDFs)
const MAX_PROMPT_LENGTH = 4_000;

export const POST = withApiHandler("parse-document", async (request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corpo do pedido inválido." }, { status: 400 });
    }

    const { documentText, prompt, pageRange, totalPages } = body as Record<string, unknown>;

    if (!documentText || typeof documentText !== "string") {
      return NextResponse.json({ error: "Campo 'documentText' é obrigatório." }, { status: 400 });
    }

    // Bound inputs to prevent token abuse
    const safeDocText = documentText.slice(0, MAX_DOCUMENT_LENGTH);
    const safePrompt = typeof prompt === "string" ? prompt.slice(0, MAX_PROMPT_LENGTH) : undefined;

    // Chunk metadata (from pdf-splitter)
    const chunkInfo = typeof pageRange === "string" && typeof totalPages === "number"
      ? `\n\n[NOTA: Este texto corresponde às páginas ${pageRange} de ${totalPages} páginas totais do documento.]`
      : "";

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: attempt local regex-based extraction when no API key
      const fallback = extractWithRegex(safeDocText);
      return NextResponse.json(fallback);
    }

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
        system: `Você é um sistema de extração de dados de documentos de construção portugueses. Extraia dados estruturados de memórias descritivas, projetos de especialidade e documentos técnicos. Retorne APENAS JSON válido.`,
        messages: [
          {
            role: "user",
            content: (safePrompt || buildDefaultPrompt(safeDocText)) + chunkInfo,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn(`Anthropic API ${response.status}`, { body: errorText.slice(0, 500) });
      // Fallback to regex-based extraction
      const fallback = extractWithRegex(safeDocText);
      return NextResponse.json(fallback);
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = data.content
      ?.filter(block => block.type === "text")
      .map(block => block.text ?? "")
      .join("\n") || "{}";

    // Non-greedy JSON extraction to avoid matching from first { to last }
    const jsonMatch = text.match(/\{[\s\S]*?\}(?=[^}]*$)/) ?? text.match(/\{[^}]*\}/);
    if (!jsonMatch) {
      const fallback = extractWithRegex(safeDocText);
      return NextResponse.json(fallback);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // AI returned malformed JSON — fall back to regex
      const fallback = extractWithRegex(safeDocText);
      fallback.warnings.push("Resposta da IA continha JSON inválido; utilizada extração por padrões.");
      return NextResponse.json(fallback);
    }

    // Structure into ParsedProjectData format
    const result = {
      fields: { ...parsed },
      confidence: (parsed.confidence && typeof parsed.confidence === "object") ? parsed.confidence as Record<string, string> : {},
      extractedText: safeDocText.slice(0, 2000),
      warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as string[]).slice(0, 20) : [],
    };
    // Remove metadata from fields
    delete result.fields.confidence;
    delete result.fields.warnings;

    return NextResponse.json(result);
}, { errorMessage: "Falha ao analisar o documento. Tente novamente." });

function buildDefaultPrompt(text: string): string {
  return `Analise o seguinte documento de projeto de construção português e extraia todos os dados relevantes como JSON.

DOCUMENTO:
"""
${text.slice(0, 15000)}
"""

Retorne um JSON com os campos encontrados: name, buildingType, grossFloorArea, usableFloorArea, numberOfFloors, buildingHeight, numberOfDwellings, isRehabilitation, location (municipality, district, parish, altitude), architecture (ceilingHeight), structural (structuralSystem, foundationType), fireSafety (utilizationType, riskCategory), envelope (U-values, windowSolarFactor, windowFrameType), systems (heatingSystem, coolingSystem, dhwSystem, hasSolarPV, hasSolarThermal), electrical (supplyType, contractedPower), gas (hasGasInstallation, gasType), licensing (projectPhase, isInARU, isProtectedArea), confidence (por campo: high/medium/low), warnings (avisos).

RETORNE APENAS JSON VÁLIDO.`;
}

/**
 * Regex-based fallback extraction when AI is unavailable.
 * Extracts common patterns from Portuguese building documents.
 */
function extractWithRegex(text: string): {
  fields: Record<string, unknown>;
  confidence: Record<string, string>;
  extractedText: string;
  warnings: string[];
} {
  const fields: Record<string, unknown> = {};
  const confidence: Record<string, string> = {};
  const warnings: string[] = [
    "Extração feita por padrões de texto (sem IA). Verifique todos os valores.",
  ];

  const lower = text.toLowerCase();

  // Building type
  if (lower.includes("moradia") || lower.includes("habitação unifamiliar")) {
    fields.buildingType = "residential";
    confidence.buildingType = "high";
  } else if (lower.includes("edifício multifamiliar") || lower.includes("apartamento")) {
    fields.buildingType = "residential";
    confidence.buildingType = "high";
  } else if (lower.includes("comercial") || lower.includes("loja") || lower.includes("escritório")) {
    fields.buildingType = "commercial";
    confidence.buildingType = "medium";
  } else if (lower.includes("misto")) {
    fields.buildingType = "mixed";
    confidence.buildingType = "medium";
  }

  // Area extraction
  const areaMatch = text.match(/área\s*(bruta|total)\s*(?:de\s*construção)?\s*[:=]?\s*([\d.,]+)\s*m[²2]/i);
  if (areaMatch) {
    fields.grossFloorArea = parseFloat(areaMatch[2].replace(",", "."));
    confidence.grossFloorArea = "medium";
  }

  const usableMatch = text.match(/área\s*útil\s*[:=]?\s*([\d.,]+)\s*m[²2]/i);
  if (usableMatch) {
    fields.usableFloorArea = parseFloat(usableMatch[1].replace(",", "."));
    confidence.usableFloorArea = "medium";
  }

  // Floors
  const floorMatch = text.match(/(\d+)\s*pisos?\b/i);
  if (floorMatch) {
    fields.numberOfFloors = parseInt(floorMatch[1]);
    confidence.numberOfFloors = "medium";
  }

  // Height
  const heightMatch = text.match(/(?:altura|cércea)\s*[:=]?\s*([\d.,]+)\s*m(?:etros)?\b/i);
  if (heightMatch) {
    fields.buildingHeight = parseFloat(heightMatch[1].replace(",", "."));
    confidence.buildingHeight = "medium";
  }

  // Ceiling height
  const ceilingMatch = text.match(/pé[\s-]*direito\s*[:=]?\s*([\d.,]+)\s*m/i);
  if (ceilingMatch) {
    fields.architecture = { ceilingHeight: parseFloat(ceilingMatch[1].replace(",", ".")) };
    confidence["architecture.ceilingHeight"] = "high";
  }

  // Dwellings
  const dwellingMatch = text.match(/(\d+)\s*(?:fogos?|frações?|apartamentos?|fracções?)/i);
  if (dwellingMatch) {
    fields.numberOfDwellings = parseInt(dwellingMatch[1]);
    confidence.numberOfDwellings = "medium";
  }

  // Location
  const municipalityMatch = text.match(/(?:município|concelho)\s*(?:de|do|da)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/);
  if (municipalityMatch) {
    fields.location = { ...(fields.location as Record<string, unknown> || {}), municipality: municipalityMatch[1] };
    confidence["location.municipality"] = "medium";
  }

  const parishMatch = text.match(/(?:freguesia)\s*(?:de|do|da)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/);
  if (parishMatch) {
    fields.location = { ...(fields.location as Record<string, unknown> || {}), parish: parishMatch[1] };
    confidence["location.parish"] = "medium";
  }

  // U-values
  const uWallMatch = text.match(/(?:parede|fachada)\s*.*?U\s*[:=]?\s*([\d.,]+)\s*W/i);
  if (uWallMatch) {
    fields.envelope = { ...(fields.envelope as Record<string, unknown> || {}), externalWallUValue: parseFloat(uWallMatch[1].replace(",", ".")) };
    confidence["envelope.externalWallUValue"] = "medium";
  }

  // Rehabilitation
  if (lower.includes("reabilitação") || lower.includes("remodelação") || lower.includes("recuperação")) {
    fields.isRehabilitation = true;
    confidence.isRehabilitation = "medium";
  }

  // Name extraction (from title or header)
  const titleMatch = text.match(/(?:memória\s*descritiva|projeto\s*de\s*arquitetura)\s*[-–:]\s*(.+?)(?:\n|$)/i);
  if (titleMatch) {
    fields.name = titleMatch[1].trim();
    confidence.name = "low";
  }

  return { fields, confidence, extractedText: text.slice(0, 2000), warnings };
}

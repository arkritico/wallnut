/**
 * AI-powered document parser for auto-filling BuildingProject fields.
 * Parses memória descritiva, specialty reports, and other Portuguese
 * building project documents via the AI endpoint.
 */

import type { BuildingProject } from "./types";

export interface ParsedProjectData {
  fields: Partial<BuildingProject>;
  confidence: Record<string, "high" | "medium" | "low">;
  extractedText: string;
  warnings: string[];
}

/**
 * Extract text from a file (PDF, Excel, or plain text) — client-side.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: Record<string, unknown>) => ("str" in item ? (item.str as string) : ""))
        .join(" ");
      pages.push(text);
    }
    return pages.join("\n\n");
  }

  // Excel files
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["xls", "xlsx", "ods", "csv"].includes(ext) ||
      file.type.includes("spreadsheet") || file.type.includes("excel")) {
    const { extractTextFromExcel } = await import("./xlsx-parser");
    const arrayBuffer = await file.arrayBuffer();
    return extractTextFromExcel(arrayBuffer);
  }

  // Plain text or other formats
  return file.text();
}

/**
 * Send extracted text to the AI endpoint for parsing into BuildingProject fields.
 */
export async function parseDocumentWithAI(
  text: string,
  currentProject: BuildingProject,
): Promise<ParsedProjectData> {
  const prompt = buildExtractionPrompt(text);

  const response = await fetch("/api/parse-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentText: text,
      currentProject,
      prompt,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Parsing failed: ${response.status}`);
  }

  return response.json();
}

function buildExtractionPrompt(documentText: string): string {
  return `Analise o seguinte documento de projeto de construção português (memória descritiva, projeto de especialidade, ou documento técnico) e extraia todos os dados relevantes para preencher um formulário de análise regulamentar.

DOCUMENTO:
"""
${documentText.slice(0, 15000)}
"""

Extraia e retorne um objeto JSON com os seguintes campos (inclua apenas os que encontrar no documento):

{
  "name": "nome do projeto",
  "buildingType": "residential|commercial|mixed|industrial",
  "grossFloorArea": número em m²,
  "usableFloorArea": número em m²,
  "numberOfFloors": número,
  "buildingHeight": número em metros,
  "numberOfDwellings": número,
  "isRehabilitation": boolean,
  "location": {
    "municipality": "nome",
    "district": "nome",
    "parish": "nome",
    "altitude": número
  },
  "architecture": {
    "ceilingHeight": número em metros,
    "isHorizontalProperty": boolean,
    "hasCrossVentilation": boolean
  },
  "structural": {
    "structuralSystem": "reinforced_concrete|steel|masonry|wood|mixed",
    "foundationType": "shallow|deep|mixed"
  },
  "fireSafety": {
    "utilizationType": "I-XII",
    "riskCategory": "1-4"
  },
  "envelope": {
    "externalWallUValue": número,
    "roofUValue": número,
    "windowUValue": número,
    "windowSolarFactor": número,
    "windowFrameType": "aluminum_no_break|aluminum_thermal_break|pvc|wood"
  },
  "systems": {
    "heatingSystem": "heat_pump|gas_boiler|electric_radiator|biomass|none",
    "coolingSystem": "heat_pump|split_ac|central_ac|none",
    "dhwSystem": "heat_pump|gas_boiler|electric|solar_thermal|thermodynamic",
    "hasSolarPV": boolean,
    "solarPVCapacity": número em kWp,
    "hasSolarThermal": boolean,
    "solarThermalArea": número em m²
  },
  "electrical": {
    "supplyType": "single_phase|three_phase",
    "contractedPower": número em kVA
  },
  "waterDrainage": {
    "waterPipeMaterial": "ppr|pex|copper|multicamada|galvanized|other"
  },
  "gas": {
    "hasGasInstallation": boolean,
    "gasType": "natural_gas|lpg_piped|lpg_bottle|none"
  },
  "licensing": {
    "projectPhase": "prior_info|pip|licensing|communication|utilization|none",
    "isInARU": boolean,
    "isProtectedArea": boolean
  },
  "confidence": {
    "campo": "high|medium|low"
  },
  "warnings": ["avisos sobre dados não encontrados ou ambíguos"]
}

REGRAS:
1. Inclua apenas campos que encontrar explicitamente ou que possa inferir com confiança do texto.
2. Para cada campo extraído, indique o nível de confiança em "confidence".
3. Se o documento menciona valores numéricos específicos (áreas, U-values, potências), extraia-os diretamente.
4. Se identifica o tipo de construção mas não valores exatos, preencha o que puder e avise em "warnings".
5. Retorne APENAS JSON válido, sem texto adicional.`;
}

/**
 * Merge parsed data into an existing BuildingProject, only overwriting
 * fields that were extracted with sufficient confidence.
 */
export function mergeExtractedData(
  current: BuildingProject,
  parsed: ParsedProjectData,
  minConfidence: "high" | "medium" | "low" = "medium",
): BuildingProject {
  const confidenceRank = { high: 3, medium: 2, low: 1 };
  const minRank = confidenceRank[minConfidence];

  const merged = { ...current };
  const fields = parsed.fields;

  // Helper to check confidence
  function isConfident(field: string): boolean {
    const level = parsed.confidence[field];
    if (!level) return true; // no confidence info = accept
    return confidenceRank[level] >= minRank;
  }

  // Top-level fields
  if (fields.name && isConfident("name")) merged.name = fields.name;
  if (fields.buildingType && isConfident("buildingType")) merged.buildingType = fields.buildingType;
  if (fields.grossFloorArea && isConfident("grossFloorArea")) merged.grossFloorArea = fields.grossFloorArea;
  if (fields.usableFloorArea && isConfident("usableFloorArea")) merged.usableFloorArea = fields.usableFloorArea;
  if (fields.numberOfFloors && isConfident("numberOfFloors")) merged.numberOfFloors = fields.numberOfFloors;
  if (fields.buildingHeight && isConfident("buildingHeight")) merged.buildingHeight = fields.buildingHeight;
  if (fields.numberOfDwellings !== undefined && isConfident("numberOfDwellings")) merged.numberOfDwellings = fields.numberOfDwellings;
  if (fields.isRehabilitation !== undefined && isConfident("isRehabilitation")) merged.isRehabilitation = fields.isRehabilitation;

  // Location
  if (fields.location) {
    merged.location = { ...merged.location };
    if (fields.location.municipality && isConfident("location.municipality")) merged.location.municipality = fields.location.municipality;
    if (fields.location.district && isConfident("location.district")) merged.location.district = fields.location.district;
    if (fields.location.parish && isConfident("location.parish")) merged.location.parish = fields.location.parish;
    if (fields.location.altitude && isConfident("location.altitude")) merged.location.altitude = fields.location.altitude;
  }

  // Architecture
  if (fields.architecture) {
    merged.architecture = { ...merged.architecture };
    for (const [key, value] of Object.entries(fields.architecture)) {
      if (value !== undefined && isConfident(`architecture.${key}`)) {
        (merged.architecture as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Structural
  if (fields.structural) {
    merged.structural = { ...merged.structural };
    for (const [key, value] of Object.entries(fields.structural)) {
      if (value !== undefined && isConfident(`structural.${key}`)) {
        (merged.structural as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Fire safety
  if (fields.fireSafety) {
    merged.fireSafety = { ...merged.fireSafety };
    for (const [key, value] of Object.entries(fields.fireSafety)) {
      if (value !== undefined && isConfident(`fireSafety.${key}`)) {
        (merged.fireSafety as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Envelope
  if (fields.envelope) {
    merged.envelope = { ...merged.envelope };
    for (const [key, value] of Object.entries(fields.envelope)) {
      if (value !== undefined && isConfident(`envelope.${key}`)) {
        (merged.envelope as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Systems
  if (fields.systems) {
    merged.systems = { ...merged.systems };
    for (const [key, value] of Object.entries(fields.systems)) {
      if (value !== undefined && isConfident(`systems.${key}`)) {
        (merged.systems as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Electrical
  if (fields.electrical) {
    merged.electrical = { ...merged.electrical };
    for (const [key, value] of Object.entries(fields.electrical)) {
      if (value !== undefined && isConfident(`electrical.${key}`)) {
        (merged.electrical as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Water drainage
  if (fields.waterDrainage) {
    merged.waterDrainage = { ...merged.waterDrainage };
    for (const [key, value] of Object.entries(fields.waterDrainage)) {
      if (value !== undefined && isConfident(`waterDrainage.${key}`)) {
        (merged.waterDrainage as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Gas
  if (fields.gas) {
    merged.gas = { ...merged.gas };
    for (const [key, value] of Object.entries(fields.gas)) {
      if (value !== undefined && isConfident(`gas.${key}`)) {
        (merged.gas as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Licensing
  if (fields.licensing) {
    merged.licensing = { ...merged.licensing };
    for (const [key, value] of Object.entries(fields.licensing)) {
      if (value !== undefined && isConfident(`licensing.${key}`)) {
        (merged.licensing as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  return merged;
}

import { NextResponse } from "next/server";
import { analyzeIfcSpecialty, type SpecialtyAnalysisResult } from "@/lib/ifc-specialty-analyzer";
import { specialtyAnalysisToProjectFields, type IfcEnrichmentReport } from "@/lib/ifc-enrichment";
import { withApiHandler } from "@/lib/api-error-handler";

// ── Limits ──────────────────────────────────────────────────
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_FILES = 10;
const IFC_HEADER_PATTERN = /ISO-10303-21/;

// ── Response type (importable by client) ────────────────────
export interface IfcAnalyzeResponse {
  analyses: SpecialtyAnalysisResult[];
  enrichment: {
    fields: Record<string, unknown>;
    report: IfcEnrichmentReport;
  };
  fileNames: string[];
}

export const POST = withApiHandler("ifc-analyze", async (request) => {
  // 1. Parse FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Formato inválido. Envie multipart/form-data." },
      { status: 400 },
    );
  }

  // 2. Extract files
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json(
      { error: "Nenhum ficheiro IFC fornecido. Use o campo 'files'." },
      { status: 400 },
    );
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_FILES} ficheiros por pedido.` },
      { status: 400 },
    );
  }

  // 3. Validate total size
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return NextResponse.json(
      { error: `Tamanho total excede o limite de ${MAX_TOTAL_SIZE / (1024 * 1024)} MB.` },
      { status: 413 },
    );
  }

  // 4. Read, validate, and analyze each file
  const analyses: SpecialtyAnalysisResult[] = [];
  const fileNames: string[] = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".ifc")) {
      return NextResponse.json(
        { error: `Ficheiro "${file.name}" não é um ficheiro .ifc.` },
        { status: 400 },
      );
    }

    const content = await file.text();

    if (!IFC_HEADER_PATTERN.test(content.slice(0, 500))) {
      return NextResponse.json(
        { error: `Ficheiro "${file.name}" não parece ser um ficheiro IFC válido (cabeçalho STEP não encontrado).` },
        { status: 400 },
      );
    }

    analyses.push(analyzeIfcSpecialty(content));
    fileNames.push(file.name);
  }

  // 5. Run enrichment
  const enrichment = specialtyAnalysisToProjectFields(analyses);

  // 6. Return results
  const response: IfcAnalyzeResponse = {
    analyses,
    enrichment,
    fileNames,
  };

  return NextResponse.json(response);
}, { errorMessage: "Erro interno ao processar ficheiros IFC." });

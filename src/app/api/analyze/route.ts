import { NextResponse } from "next/server";
import { analyzeProject } from "@/lib/analyzer";
import { runAllCalculations } from "@/lib/calculations";
import { validateBuildingProject } from "@/lib/validation";
import { withApiHandler } from "@/lib/api-error-handler";

export const POST = withApiHandler("analyze", async (request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido." },
      { status: 400 },
    );
  }

  const validation = validateBuildingProject(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Dados do projeto inválidos.", details: validation.errors },
      { status: 400 },
    );
  }

  const result = await analyzeProject(validation.data);
  const calculations = runAllCalculations(validation.data);

  return NextResponse.json({ result, calculations });
}, { errorMessage: "Erro interno ao processar a análise." });

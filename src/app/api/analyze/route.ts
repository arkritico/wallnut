import { NextResponse } from "next/server";
import { analyzeProject } from "@/lib/analyzer";
import { runAllCalculations } from "@/lib/calculations";
import { validateBuildingProject } from "@/lib/validation";

export async function POST(request: Request) {
  try {
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

    // Run analysis and calculations server-side
    const result = analyzeProject(validation.data);
    const calculations = runAllCalculations(validation.data);

    return NextResponse.json({
      result,
      calculations,
    });
  } catch (error) {
    console.error("Analyze error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: "Erro interno ao processar a análise." },
      { status: 500 },
    );
  }
}

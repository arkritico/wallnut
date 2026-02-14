import { NextResponse } from "next/server";
import { analyzeProject } from "@/lib/analyzer";
import type { BuildingProject } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const project: BuildingProject = await request.json();
    const result = analyzeProject(project);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Dados do projeto inválidos. Verifique todos os campos obrigatórios." },
      { status: 400 },
    );
  }
}

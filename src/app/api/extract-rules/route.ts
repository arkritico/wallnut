/**
 * API Route: Extract Rules from Regulation Text
 *
 * Uses AI (Claude) to extract quantitative rules from regulation text
 * based on the extraction prompt template.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

// ============================================================================
// TYPES
// ============================================================================

interface ExtractedRule {
  id: string;
  artigo: string;
  regulamento: string;
  categoria: string;
  descricao: string;
  contexto?: string; // Human-readable context
  condicoes_aplicacao?: string[]; // Machine-readable conditions when rule applies
  exclusoes?: string[]; // When rule does NOT apply
  parametro: string;
  tipo_validacao: "range" | "threshold" | "formula" | "lookup" | "conditional";
  valores: {
    min?: number;
    max?: number;
    unidade?: string;
    formula?: string;
    tabela?: Record<string, number>;
    condicao?: string;
  };
  ambito: string;
  severidade: "mandatory" | "recommended" | "informative";
}

// ============================================================================
// LOAD EXTRACTION PROMPT
// ============================================================================

function getExtractionPrompt(): string {
  try {
    const promptPath = path.join(
      process.cwd(),
      "prompts",
      "quick-extract-rules.txt"
    );
    return fs.readFileSync(promptPath, "utf-8");
  } catch (error) {
    console.error("Error loading extraction prompt:", error);
    // Fallback inline prompt
    return `
Analisa este documento regulamentar e extrai TODAS as regras que contenham:
- Valores numéricos (mínimos, máximos, intervalos)
- Fórmulas matemáticas
- Tabelas de lookup
- Condições com thresholds numéricos

INCLUIR:
✓ "Secção mínima 2.5 mm²"
✓ "Pressão entre 150-400 kPa"
✓ "Se área > 500m² então..."

EXCLUIR:
✗ "Deve ser adequado"
✗ "Conforme boas práticas"

OUTPUT: JSON array com estrutura:
{
  "id": "REG_XXX_001",
  "artigo": "Art. 42º, n.3",
  "regulamento": "RTIEBT",
  "categoria": "Proteção elétrica",
  "descricao": "Texto da regra",
  "parametro": "pressao_min_servico",
  "tipo_validacao": "range|threshold|formula|lookup|conditional",
  "valores": { "min": 150, "max": 400, "unidade": "kPa" },
  "ambito": "general",
  "severidade": "mandatory"
}
    `.trim();
  }
}

// ============================================================================
// API CONFIG
// ============================================================================

// Configure API route
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for Claude processing

// ============================================================================
// API HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Handle JSON text input (PDF extraction now happens client-side)
    const body = await request.json();
    const text = body.text;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Invalid input: 'text' field required" },
        { status: 400 }
      );
    }

    // Check API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Initialize Anthropic client
    const client = new Anthropic({ apiKey });

    // Load extraction prompt
    const extractionPrompt = getExtractionPrompt();

    // Call Claude
    console.log("🤖 Calling Claude to extract rules...");
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 16000,
      temperature: 0.2, // Low temperature for consistent extraction
      messages: [
        {
          role: "user",
          content: `${extractionPrompt}

---

TEXTO DO REGULAMENTO:

${text}

---

IMPORTANTE: Retorna APENAS um JSON array válido, sem texto adicional. Formato:
{
  "metadata": {
    "regulamento": "nome extraído do texto",
    "total_regras": N
  },
  "regras": [ /* array de regras */ ]
}`,
        },
      ],
    });

    // Extract text from response
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let aiResponse = content.text.trim();

    // Clean up response - remove markdown code blocks if present
    if (aiResponse.startsWith("```")) {
      aiResponse = aiResponse
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```\s*$/, "");
    }

    // Extract only the JSON part (remove any explanatory text after the JSON)
    // Find the last closing brace of the main JSON object
    const lastBraceIndex = aiResponse.lastIndexOf("}");
    if (lastBraceIndex !== -1) {
      aiResponse = aiResponse.substring(0, lastBraceIndex + 1).trim();
    }

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("❌ Failed to parse AI response as JSON");
      console.error("Raw response (first 1000 chars):", aiResponse.substring(0, 1000));
      console.error("Parse error:", parseError);
      return NextResponse.json(
        {
          error: "Failed to parse AI response as JSON",
          rawResponse: aiResponse.substring(0, 1000),
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        },
        { status: 500 }
      );
    }

    // Validate structure
    if (!parsed.regras || !Array.isArray(parsed.regras)) {
      return NextResponse.json(
        { error: "Invalid response structure: missing 'regras' array" },
        { status: 500 }
      );
    }

    const ruleCount = parsed.regras.length;
    if (ruleCount === 0) {
      console.log("⚠️  No quantitative rules found in document (may be procedural/qualitative)");
    } else {
      console.log(`✅ Extracted ${ruleCount} rule(s)`);
    }

    // Return extracted rules (even if empty)
    return NextResponse.json({
      success: true,
      metadata: parsed.metadata || {},
      rules: parsed.regras,
      count: ruleCount,
    });
  } catch (error: any) {
    console.error("❌ Error extracting rules:", error);
    console.error("Stack:", error.stack);
    return NextResponse.json(
      {
        error: "Failed to extract rules",
        message: error.message,
        details: error.stack?.split('\n')[0] || 'No details',
      },
      { status: 500 }
    );
  }
}

// OPTIONS handler for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

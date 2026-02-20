import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-error-handler";
import { retrieveRulesForChat } from "@/lib/rule-retriever";
import type { RuleFilter } from "@/lib/rule-retriever";

// ============================================================
// Types
// ============================================================

interface RulesAskRequest {
  question: string;
  specialty?: string;
  buildingType?: string;
  projectScope?: "new" | "rehab";
  regulationId?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface RulesAskResponse {
  answer: string;
  ruleReferences: string[];
  regulationReferences: string[];
  rulesInContext: number;
  error?: string;
}

// ============================================================
// System prompt
// ============================================================

const SYSTEM_PROMPT = `Você é um especialista em regulamentação portuguesa de construção.
O utilizador está a navegar um grafo interativo de regras regulamentares e faz-lhe perguntas sobre quais regras se aplicam e porquê.

Foi-lhe fornecido um subconjunto filtrado das regras relevantes ao contexto atual de navegação.

Instruções:
1. Responda sempre em português europeu.
2. Quando referenciar regras, use o formato [RULE_ID] (ex: [STRUCT-EC0-01]).
3. Explique PORQUÊ cada regra se aplica ao contexto do utilizador.
4. Se a pergunta pedir regras aplicáveis, liste-as organizadas por severidade (crítico primeiro).
5. Cite o artigo regulamentar de cada regra.
6. Quando possível, indique valores numéricos de referência.
7. Se não houver regras no contexto que respondam à pergunta, indique-o claramente.
8. Estruture a resposta de forma clara com títulos e tópicos.
9. Seja conciso mas completo. Não repita informação.`;

// ============================================================
// Route handler
// ============================================================

const MAX_QUESTION_LENGTH = 2_000;
const MAX_HISTORY_TURNS = 8;
const MAX_RULES_CONTEXT = 80_000; // chars

export const POST = withApiHandler("rules-ask", async (request) => {
  const body: RulesAskRequest = await request.json();

  // Validate
  if (!body.question || typeof body.question !== "string") {
    return NextResponse.json({
      answer: "", ruleReferences: [], regulationReferences: [], rulesInContext: 0,
      error: "Campo 'question' é obrigatório.",
    } satisfies RulesAskResponse, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      answer: "Serviço de IA não configurado. Defina ANTHROPIC_API_KEY.",
      ruleReferences: [], regulationReferences: [], rulesInContext: 0,
      error: "API key not configured",
    } satisfies RulesAskResponse);
  }

  // Build filter from request
  const filter: RuleFilter = {};
  if (body.specialty) filter.specialty = body.specialty;
  if (body.buildingType) filter.buildingType = body.buildingType;
  if (body.projectScope) filter.projectScope = body.projectScope;
  if (body.regulationId) filter.regulationId = body.regulationId;

  // Retrieve and serialize rules
  const retrieval = retrieveRulesForChat(filter, body.question);

  // Build browse context description
  const contextParts: string[] = [];
  if (body.specialty) contextParts.push(`Especialidade: ${body.specialty}`);
  if (body.buildingType) contextParts.push(`Tipo: ${body.buildingType}`);
  if (body.projectScope) contextParts.push(`Âmbito: ${body.projectScope === "new" ? "Construção nova" : "Reabilitação"}`);
  if (body.regulationId) contextParts.push(`Regulamento: ${body.regulationId}`);
  const browseContext = contextParts.length > 0
    ? contextParts.join(" | ")
    : "Todas as especialidades";

  // Build user message with rule context
  let userMessage = body.question.slice(0, MAX_QUESTION_LENGTH);
  userMessage = `Contexto de navegação: ${browseContext}\n\n`
    + `=== REGRAS NO CONTEXTO (${retrieval.totalMatched} regras, mostrando ${retrieval.rules.length}) ===\n\n`
    + retrieval.serialized.slice(0, MAX_RULES_CONTEXT)
    + `\n\n=== PERGUNTA ===\n${body.question.slice(0, MAX_QUESTION_LENGTH)}`;

  // Build messages array (multi-turn support)
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (body.conversationHistory?.length) {
    for (const msg of body.conversationHistory.slice(-MAX_HISTORY_TURNS)) {
      // Only allow user/assistant roles — reject system or other roles
      const role = msg.role === "assistant" ? "assistant" : "user";
      const content = typeof msg.content === "string" ? msg.content.slice(0, MAX_RULES_CONTEXT) : "";
      if (content) messages.push({ role, content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  // Call Anthropic API
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({
      answer: "", ruleReferences: [], regulationReferences: [], rulesInContext: retrieval.rules.length,
      error: "Serviço de IA temporariamente indisponível.",
    } satisfies RulesAskResponse, { status: 502 });
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };

  if (!data.content || !Array.isArray(data.content)) {
    return NextResponse.json({
      answer: "", ruleReferences: [], regulationReferences: [], rulesInContext: retrieval.rules.length,
      error: "Resposta inesperada do serviço de IA.",
    } satisfies RulesAskResponse, { status: 502 });
  }

  const answerText = data.content
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");

  // Parse rule ID references like [STRUCT-EC0-01]
  const ruleIdPattern = /\[([A-Z][\w-]+-\d+(?:-\d+)*)\]/g;
  const ruleReferences = [...new Set(
    [...answerText.matchAll(ruleIdPattern)].map(m => m[1])
  )];

  // Parse legal references
  const regPattern = /(?:DL|Decreto-Lei|Portaria|Lei|Art\.?|Regulamento)\s+[\d/\-.]+(?:\s*(?:de\s+)?\d{4})?/gi;
  const regulationReferences = [...new Set(answerText.match(regPattern) ?? [])].slice(0, 50);

  return NextResponse.json({
    answer: answerText,
    ruleReferences,
    regulationReferences,
    rulesInContext: retrieval.rules.length,
  } satisfies RulesAskResponse);
}, { errorMessage: "Erro interno ao processar a pergunta sobre regras." });

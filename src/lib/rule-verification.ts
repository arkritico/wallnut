/**
 * Rule Verification Engine — Types and helpers for AI + web search
 * powered iterative regulation validation.
 *
 * Flow:
 * Focused on Portuguese construction regulations (DRE, RTIEBT, SCIE,
 * REH/RECS, RRAE, RGSPPDADAR, Eurocodes, NP/EN norms, etc.)
 *
 * 1. Takes a rule (or batch) with its regulation reference
 * 2. Builds search queries from the regulation article/reference
 * 3. Fetches official sources via web search (Brave / Google / fallback)
 * 4. AI cross-references rule assertions against official text
 * 5. Returns structured verification with confidence + sources
 * 6. Engineer reviews → feedback → re-verify loop
 */

// ============================================================
// Types
// ============================================================

export type VerificationStatus =
  | "verified"       // Rule matches official source
  | "discrepancy"    // Rule differs from official source
  | "outdated"       // Regulation has been amended/superseded
  | "unverifiable"   // Could not find authoritative source
  | "misinterpretation" // Rule misinterprets the regulation text
  | "pending";       // Not yet verified

export type SearchProvider = "brave" | "google" | "none";

export interface VerificationSource {
  /** URL of the source document */
  url: string;
  /** Title of the source page */
  title: string;
  /** Relevant excerpt from the source */
  excerpt: string;
  /** How authoritative is this source (0-1) */
  authority: number;
}

export interface VerificationResult {
  /** Rule ID that was verified */
  ruleId: string;
  /** Verification outcome */
  status: VerificationStatus;
  /** Confidence in the verification (0-1) */
  confidence: number;
  /** Detailed explanation of the verification */
  explanation: string;
  /** What the AI found in official sources */
  officialText: string | null;
  /** Specific discrepancies found */
  discrepancies: DiscrepancyDetail[];
  /** Sources consulted */
  sources: VerificationSource[];
  /** Suggested correction if discrepancy/misinterpretation found */
  suggestedCorrection: string | null;
  /** Whether the regulation has been updated since the rule was created */
  regulationUpdated: boolean;
  /** Timestamp of verification */
  verifiedAt: string;
  /** Search queries used */
  searchQueries: string[];
}

export interface DiscrepancyDetail {
  /** What the rule claims */
  ruleClaim: string;
  /** What the official source says */
  officialValue: string;
  /** Type of discrepancy */
  type: "value_mismatch" | "article_reference" | "scope_error" | "missing_condition" | "outdated_value" | "interpretation_error";
  /** Severity of the discrepancy */
  severity: "critical" | "warning" | "info";
}

export interface VerificationRequest {
  /** Rules to verify (max 5 per batch) */
  rules: RuleToVerify[];
  /** Optional: engineer's feedback from previous iteration */
  feedback?: string;
  /** Optional: additional search context */
  searchContext?: string;
  /** Optional: force specific search queries */
  customSearchQueries?: string[];
  /** Analysis depth */
  analysisDepth?: "quick" | "standard" | "deep";
}

export interface RuleToVerify {
  id: string;
  article: string;
  regulationRef: string;
  description: string;
  severity: string;
  conditions: string[];
  remediation: string;
  specialtyId: string;
  /** Optional: regulation source URL for direct fetch */
  sourceUrl?: string | null;
}

export interface VerificationResponse {
  results: VerificationResult[];
  /** Summary statistics */
  summary: {
    total: number;
    verified: number;
    discrepancies: number;
    outdated: number;
    unverifiable: number;
    misinterpretations: number;
  };
  /** Suggested next steps for the engineer */
  nextSteps: string[];
}

// ============================================================
// Search Query Builder
// ============================================================

/** Build web search queries from a rule's metadata */
export function buildSearchQueries(rule: RuleToVerify, feedback?: string): string[] {
  const queries: string[] = [];
  const ref = rule.regulationRef;
  const article = rule.article;

  // Primary: regulation reference + article
  if (ref && article) {
    queries.push(`${ref} ${article} texto oficial`);
  }

  // Secondary: regulation reference + key terms from description
  if (ref) {
    const keyTerms = extractKeyTerms(rule.description);
    if (keyTerms.length > 0) {
      queries.push(`${ref} ${keyTerms.slice(0, 3).join(" ")}`);
    }
  }

  // Tertiary: search for regulation amendments/updates
  if (ref) {
    queries.push(`${ref} alterações revisão atualização 2024 2025`);
  }

  // Portuguese DRE-specific query
  if (ref) {
    queries.push(`site:dre.pt ${ref}`);
  }

  // Portuguese IPQ/LNEC specific query for NP/EN norms
  if (ref.match(/^(NP|EN)\s/i)) {
    queries.push(`IPQ ${ref} norma portuguesa`);
  }

  // If engineer provided feedback, incorporate it
  if (feedback) {
    const feedbackTerms = extractKeyTerms(feedback);
    if (feedbackTerms.length > 0) {
      queries.push(`${ref} ${feedbackTerms.slice(0, 4).join(" ")}`);
    }
  }

  return queries.slice(0, 5); // Max 5 queries per rule
}

/** Extract meaningful terms from Portuguese/English text */
function extractKeyTerms(text: string): string[] {
  const stopwords = new Set([
    "a", "o", "as", "os", "de", "do", "da", "dos", "das", "em", "no", "na",
    "um", "uma", "por", "para", "com", "sem", "que", "se", "ao", "e", "ou",
    "ser", "ter", "estar", "deve", "pode", "mais", "muito", "quando", "onde",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "of", "in",
    "to", "for", "with", "on", "at", "from", "by", "this", "that", "and", "or",
    "minimum", "maximum", "minimo", "maximo", "mínimo", "máximo",
    "deve", "devem", "shall", "must", "should",
  ]);

  return text
    .toLowerCase()
    .replace(/[?!.,;:()[\]{}""''«»]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w))
    .slice(0, 10);
}

// ============================================================
// Verification Prompt Builder
// ============================================================

export function buildVerificationPrompt(
  rules: RuleToVerify[],
  searchResults: Array<{ query: string; results: Array<{ title: string; url: string; snippet: string }> }>,
  feedback?: string,
): string {
  let prompt = `Você é um auditor especialista em regulamentação portuguesa de construção civil.

A sua tarefa é VERIFICAR se as regras extraídas de regulamentos portugueses estão corretas, comparando-as com fontes oficiais (DRE, Diário da República, IPQ, LNEC, normas europeias EN/ISO).

Para cada regra, avalie:
1. O artigo/secção referenciado está correto?
2. Os valores numéricos (mínimos, máximos, fórmulas) correspondem ao texto oficial?
3. O âmbito de aplicação está correto (quando se aplica e quando NÃO se aplica)?
4. A regra está atualizada ou o regulamento foi alterado/revogado?
5. A interpretação do regulamento é correta ou há erro de interpretação?

ERROS COMUNS A VERIFICAR:
- Confusão entre valores mínimos e máximos
- Referência a artigos errados (ex: Art. 42º quando devia ser Art. 43º)
- Ignorar condições de aplicação (ex: "apenas para edifícios > 28m")
- Não considerar alterações legislativas recentes
- Confundir regulamentos diferentes (ex: regra do RTIEBT atribuída ao RGSCIE)
- Valores em unidades erradas (kPa vs bar, mm² vs cm²)
- Interpretar "recomendado" como "obrigatório"

`;

  // Add search context
  if (searchResults.length > 0) {
    prompt += `\n=== RESULTADOS DE PESQUISA WEB ===\n`;
    for (const sr of searchResults) {
      prompt += `\nPesquisa: "${sr.query}"\n`;
      for (const r of sr.results) {
        prompt += `- [${r.title}](${r.url})\n  ${r.snippet}\n`;
      }
    }
    prompt += `\n=== FIM DOS RESULTADOS ===\n\n`;
  }

  // Add engineer feedback if iterating
  if (feedback) {
    prompt += `\n=== FEEDBACK DO ENGENHEIRO (iteração anterior) ===\n${feedback}\n=== FIM DO FEEDBACK ===\n\n`;
    prompt += `IMPORTANTE: O engenheiro forneceu feedback sobre a verificação anterior. Ajuste a sua análise tendo em conta este feedback.\n\n`;
  }

  // Add rules to verify
  prompt += `=== REGRAS A VERIFICAR ===\n\n`;
  for (const rule of rules) {
    prompt += `[${rule.id}] ${rule.regulationRef} — ${rule.article}
  Especialidade: ${rule.specialtyId}
  Severidade: ${rule.severity}
  Descrição: ${rule.description}
  Condições: ${rule.conditions.join("; ") || "Nenhuma"}
  Remediação: ${rule.remediation}
  URL Fonte: ${rule.sourceUrl || "N/D"}

`;
  }

  prompt += `=== FIM DAS REGRAS ===

RESPONDA em JSON com a seguinte estrutura (sem texto adicional):
{
  "results": [
    {
      "ruleId": "ID_DA_REGRA",
      "status": "verified|discrepancy|outdated|unverifiable|misinterpretation",
      "confidence": 0.0-1.0,
      "explanation": "Explicação detalhada em português",
      "officialText": "Texto relevante da fonte oficial (ou null)",
      "discrepancies": [
        {
          "ruleClaim": "O que a regra afirma",
          "officialValue": "O que a fonte oficial diz",
          "type": "value_mismatch|article_reference|scope_error|missing_condition|outdated_value|interpretation_error",
          "severity": "critical|warning|info"
        }
      ],
      "suggestedCorrection": "Correção sugerida (ou null)",
      "regulationUpdated": false,
      "searchQueries": ["queries adicionais sugeridas para próxima iteração"]
    }
  ],
  "nextSteps": ["Sugestões de próximos passos para o engenheiro"]
}`;

  return prompt;
}

// ============================================================
// Brave Search Helper
// ============================================================

export interface BraveSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchBrave(
  query: string,
  apiKey: string,
  count: number = 5,
): Promise<BraveSearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("search_lang", "pt");
  url.searchParams.set("country", "PT");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    console.warn(`Brave search failed for "${query}": ${response.status}`);
    return [];
  }

  const data = await response.json();
  const webResults = data.web?.results ?? [];

  return webResults.map((r: { title?: string; url?: string; description?: string }) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? "",
  }));
}

// ============================================================
// Google Custom Search Helper
// ============================================================

export async function searchGoogle(
  query: string,
  apiKey: string,
  searchEngineId: string,
  count: number = 5,
): Promise<BraveSearchResult[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", searchEngineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(count, 10)));
  url.searchParams.set("lr", "lang_pt");

  const response = await fetch(url.toString());

  if (!response.ok) {
    console.warn(`Google search failed for "${query}": ${response.status}`);
    return [];
  }

  const data = await response.json();
  const items = data.items ?? [];

  return items.map((r: { title?: string; link?: string; snippet?: string }) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    snippet: r.snippet ?? "",
  }));
}

// ============================================================
// Unified Search
// ============================================================

export async function performSearch(
  query: string,
  count: number = 5,
): Promise<BraveSearchResult[]> {
  // Try Brave first
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    return searchBrave(query, braveKey, count);
  }

  // Try Google Custom Search
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (googleKey && googleCx) {
    return searchGoogle(query, googleKey, googleCx, count);
  }

  // No search provider configured — return empty
  // AI will fall back to its training knowledge
  return [];
}

/** Detect which search provider is configured */
export function getSearchProvider(): SearchProvider {
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) return "google";
  return "none";
}

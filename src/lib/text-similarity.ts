/**
 * Shared Portuguese Text Similarity Utilities
 *
 * Extracted from boq-diff.ts for reuse across BOQ reconciliation,
 * diff engine, and matching systems.
 */

// ============================================================
// Stop Words & Prefix Patterns
// ============================================================

/** Portuguese articles and prepositions to strip during comparison */
export const PT_STOP_WORDS = new Set([
  "o", "a", "os", "as", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "para", "por", "com",
  "um", "uma", "uns", "umas", "ao", "aos", "e", "ou",
  "que", "se", "num", "numa",
]);

/** Common Portuguese construction prefixes to normalize */
export const PT_PREFIX_PATTERNS: [RegExp, string][] = [
  [/fornecimento\s+e\s+coloca[çc][aã]o\s+de\s*/gi, ""],
  [/fornecimento\s+e\s+aplica[çc][aã]o\s+de\s*/gi, ""],
  [/fornecimento\s+e\s+montagem\s+de\s*/gi, ""],
  [/fornecimento\s+e\s+assentamento\s+de\s*/gi, ""],
  [/fornecimento\s+e\s+coloca[çc][aã]o\s*/gi, ""],
  [/fornecimento\s+e\s+instala[çc][aã]o\s+de\s*/gi, ""],
  [/incluindo\s+[^,.]*/gi, ""],
  [/conforme\s+[^,.]*/gi, ""],
  [/segundo\s+projeto\s*/gi, ""],
  [/de\s+acordo\s+com\s+[^,.]*/gi, ""],
];

// ============================================================
// Core Utilities
// ============================================================

/**
 * Remove diacritics/accents from Portuguese text.
 */
export function removeAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalize Portuguese construction text for comparison.
 * Strips accents, common prefixes, articles, and lowercases.
 */
export function normalizeText(text: string): string {
  let normalized = text.toLowerCase().trim();

  // Remove accents
  normalized = removeAccents(normalized);

  // Strip common construction prefixes
  for (const [pattern, replacement] of PT_PREFIX_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Tokenize Portuguese text into meaningful words,
 * filtering stop words and very short tokens.
 */
export function tokenize(text: string): Set<string> {
  const normalized = normalizeText(text);
  const words = normalized.split(/[\s,;:()\[\]\/\-–—]+/);
  const tokens = new Set<string>();

  for (const word of words) {
    const cleaned = word.replace(/[^a-z0-9]/g, "");
    if (cleaned.length >= 2 && !PT_STOP_WORDS.has(cleaned)) {
      tokens.add(cleaned);
    }
  }

  return tokens;
}

/**
 * Compute Jaccard similarity between two token sets.
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ============================================================
// Construction Domain Knowledge
// ============================================================

/**
 * Domain-specific construction term groups.
 * Tokens within the same group are considered semantically close,
 * boosting similarity when both texts reference the same domain.
 */
export const CONSTRUCTION_TERM_GROUPS: string[][] = [
  // Concrete and reinforcement
  ["betao", "armado", "c25", "c30", "c35", "cimento", "laje", "pilar", "viga"],
  // Masonry
  ["alvenaria", "tijolo", "ceramico", "bloco", "parede", "divisoria"],
  // Waterproofing and insulation
  ["impermeabilizacao", "etics", "capoto", "isolamento", "termico", "xps", "eps"],
  // Flooring
  ["pavimento", "ceramico", "flutuante", "soalho", "betonilha", "mosaico"],
  // Plumbing
  ["canalizacao", "agua", "esgoto", "drenagem", "tubo", "pvc", "ppr", "sifao"],
  // Electrical
  ["eletrico", "eletrica", "quadro", "circuito", "tomada", "interruptor", "cabo"],
  // Painting
  ["pintura", "tinta", "demaos", "esmalte", "primario", "verniz"],
  // Carpentry
  ["carpintaria", "madeira", "porta", "caixilho", "aro", "rodape"],
  // Steel and metalwork
  ["metalico", "metalica", "aco", "serralharia", "guarda", "corrimao"],
  // Windows
  ["caixilharia", "aluminio", "vidro", "duplo", "janela", "rpt"],
  // Roofing
  ["cobertura", "telha", "caleira", "rufos", "subtelha", "beirado"],
  // HVAC
  ["avac", "climatizacao", "ventilacao", "conduta", "difusor", "split"],
  // Fire safety
  ["incendio", "detetor", "extintor", "sprinkler", "alarme", "evacuacao"],
  // Elevators
  ["ascensor", "elevador", "caixa", "maquinas", "paragem"],
];

/** Map from token to group index for fast lookup */
const TOKEN_TO_GROUP = new Map<string, number>();
for (let i = 0; i < CONSTRUCTION_TERM_GROUPS.length; i++) {
  for (const term of CONSTRUCTION_TERM_GROUPS[i]) {
    TOKEN_TO_GROUP.set(term, i);
  }
}

/**
 * Compute a domain-aware keyword overlap bonus.
 * If both texts reference terms from the same construction domain,
 * they get a similarity boost.
 */
export function domainOverlapBonus(tokensA: Set<string>, tokensB: Set<string>): number {
  const groupsA = new Set<number>();
  const groupsB = new Set<number>();

  for (const t of tokensA) {
    const g = TOKEN_TO_GROUP.get(t);
    if (g !== undefined) groupsA.add(g);
  }
  for (const t of tokensB) {
    const g = TOKEN_TO_GROUP.get(t);
    if (g !== undefined) groupsB.add(g);
  }

  if (groupsA.size === 0 || groupsB.size === 0) return 0;

  let sharedGroups = 0;
  for (const g of groupsA) {
    if (groupsB.has(g)) sharedGroups++;
  }

  const totalGroups = new Set([...groupsA, ...groupsB]).size;
  return totalGroups === 0 ? 0 : (sharedGroups / totalGroups) * 0.15;
}

/**
 * Compute overall text similarity between two Portuguese construction descriptions.
 * Combines Jaccard similarity with domain keyword overlap bonus.
 *
 * Returns a value in [0, 1].
 */
export function textSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const jaccard = jaccardSimilarity(tokensA, tokensB);
  const bonus = domainOverlapBonus(tokensA, tokensB);

  return Math.min(1, jaccard + bonus);
}

// ============================================================
// Unit Compatibility
// ============================================================

/** Canonical unit mapping — maps variant spellings to a canonical form */
export const UNIT_CANONICAL: Record<string, string> = {
  "m2": "m2", "m²": "m2", "m 2": "m2", "m^2": "m2",
  "m3": "m3", "m³": "m3", "m 3": "m3", "m^3": "m3",
  "m": "m", "ml": "m", "m.l.": "m", "metro": "m",
  "ud": "ud", "un": "ud", "unid": "ud", "unidade": "ud", "pç": "ud", "peca": "ud",
  "vg": "vg", "verba": "vg", "vb": "vg", "gl": "vg", "global": "vg", "cj": "vg", "conjunto": "vg",
  "kg": "kg", "quilo": "kg",
  "t": "t", "ton": "t", "tonelada": "t",
  "l": "l", "litro": "l",
  "h": "h", "hora": "h",
  "dia": "dia", "d": "dia",
  "mes": "mes", "mês": "mes",
  "sistema": "sistema", "sist": "sistema",
  "projeto": "projeto", "proj": "projeto",
  "ensaio": "ensaio",
};

/**
 * Normalize a unit string to its canonical form.
 */
export function normalizeUnit(unit: string): string {
  const cleaned = removeAccents(unit.toLowerCase().trim().replace(/\./g, ""));
  return UNIT_CANONICAL[cleaned] ?? cleaned;
}

/**
 * Check whether two units are compatible (same canonical form).
 */
export function unitsCompatible(unitA: string, unitB: string): boolean {
  return normalizeUnit(unitA) === normalizeUnit(unitB);
}

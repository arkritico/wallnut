/**
 * Local regulation document storage and indexing.
 *
 * Manages municipality-specific regulation documents uploaded as ZIP files.
 * Supports versioning, text search, and missing-regulation detection.
 */

// ============================================================
// Types
// ============================================================

export interface StoredRegulation {
  id: string;
  municipality: string;
  name: string;
  description: string;
  fileName: string;
  fileSize: number;
  /** Document type */
  documentType:
    | "pdm"
    | "regulamento_municipal"
    | "parecer"
    | "plano_pormenor"
    | "regulamento_urbanistico"
    | "other";
  /** Date uploaded */
  uploadedAt: string;
  /** Date of the regulation document */
  documentDate?: string;
  /** Whether this is the latest version */
  isLatest: boolean;
  /** Version number (for tracking updates) */
  version: number;
  /** Previous version ID (for versioning) */
  previousVersionId?: string;
  /** Extracted text content (for search) */
  textContent?: string;
  /** File data reference (Supabase path or local key) */
  storagePath: string;
  /** Tags for filtering */
  tags: string[];
}

export interface RegulationIndex {
  /** All stored regulations by municipality */
  byMunicipality: Map<string, StoredRegulation[]>;
  /** Total count */
  totalCount: number;
  /** Municipalities covered */
  municipalities: string[];
  /** Last updated */
  lastUpdated: string;
}

export interface RegulationSearchResult {
  regulation: StoredRegulation;
  /** Match score (0-1) */
  score: number;
  /** Matched text excerpt */
  excerpt?: string;
}

// ============================================================
// Portuguese document type names
// ============================================================

const DOCUMENT_TYPE_NAMES_PT: Record<StoredRegulation["documentType"], string> = {
  pdm: "Plano Director Municipal (PDM)",
  regulamento_municipal: "Regulamento Municipal",
  parecer: "Parecer",
  plano_pormenor: "Plano de Pormenor",
  regulamento_urbanistico: "Regulamento Urbanístico",
  other: "Outro",
};

// ============================================================
// Filename-based classification patterns
// ============================================================

interface ClassificationPattern {
  pattern: RegExp;
  documentType: StoredRegulation["documentType"];
}

/**
 * Classification patterns applied in order. The first match wins.
 * Note: regulamento_urbanistico is checked before regulamento_municipal
 * since its pattern is more specific and overlaps.
 */
const CLASSIFICATION_PATTERNS: ClassificationPattern[] = [
  { pattern: /pdm|plano.*direct/i, documentType: "pdm" },
  { pattern: /parecer/i, documentType: "parecer" },
  { pattern: /plano.*pormenor|pp\d/i, documentType: "plano_pormenor" },
  { pattern: /regul.*urban/i, documentType: "regulamento_urbanistico" },
  { pattern: /regulamento.*munic/i, documentType: "regulamento_municipal" },
];

/**
 * Auto-classify a regulation document type from its filename.
 */
function classifyRegulationType(fileName: string): StoredRegulation["documentType"] {
  for (const { pattern, documentType } of CLASSIFICATION_PATTERNS) {
    if (pattern.test(fileName)) {
      return documentType;
    }
  }
  return "other";
}

// ============================================================
// Minimum expected regulation types per municipality
// ============================================================

const MINIMUM_EXPECTED_TYPES: StoredRegulation["documentType"][] = [
  "pdm",
  "regulamento_municipal",
];

// ============================================================
// Core functions
// ============================================================

/**
 * Create an empty regulation index.
 */
export function createRegulationIndex(): RegulationIndex {
  return {
    byMunicipality: new Map(),
    totalCount: 0,
    municipalities: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Rebuild derived fields on the index (municipalities list, totalCount).
 */
function rebuildIndexMeta(index: RegulationIndex): void {
  let total = 0;
  const munis: string[] = [];

  for (const [municipality, regulations] of index.byMunicipality.entries()) {
    if (regulations.length > 0) {
      munis.push(municipality);
      total += regulations.length;
    }
  }

  index.totalCount = total;
  index.municipalities = munis.sort();
  index.lastUpdated = new Date().toISOString();
}

/**
 * Add a regulation to the index.
 * Handles versioning: if a regulation with the same municipality and
 * documentType already exists and is marked as latest, the old one
 * is demoted and the new one becomes the latest.
 */
export function addRegulation(index: RegulationIndex, regulation: StoredRegulation): void {
  const municipality = regulation.municipality.toLowerCase();

  if (!index.byMunicipality.has(municipality)) {
    index.byMunicipality.set(municipality, []);
  }

  const existing = index.byMunicipality.get(municipality)!;

  // If this regulation is marked as latest, demote any existing latest
  // of the same document type
  if (regulation.isLatest) {
    for (const reg of existing) {
      if (reg.documentType === regulation.documentType && reg.isLatest) {
        reg.isLatest = false;
      }
    }
  }

  existing.push(regulation);
  rebuildIndexMeta(index);
}

/**
 * Get the latest version of each regulation for a municipality.
 */
export function getLatestRegulations(
  index: RegulationIndex,
  municipality: string,
): StoredRegulation[] {
  const key = municipality.toLowerCase();
  const regulations = index.byMunicipality.get(key);
  if (!regulations) return [];

  return regulations.filter((r) => r.isLatest);
}

/**
 * Basic text search across stored regulation text content and names.
 * Scores results based on term frequency in text content and name.
 */
export function searchRegulations(
  index: RegulationIndex,
  query: string,
  municipality?: string,
): RegulationSearchResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (terms.length === 0) return [];

  const results: RegulationSearchResult[] = [];

  const municipalitiesToSearch = municipality
    ? [municipality.toLowerCase()]
    : Array.from(index.byMunicipality.keys());

  for (const muniKey of municipalitiesToSearch) {
    const regulations = index.byMunicipality.get(muniKey);
    if (!regulations) continue;

    for (const regulation of regulations) {
      const nameText = (regulation.name + " " + regulation.description + " " + regulation.fileName).toLowerCase();
      const contentText = (regulation.textContent ?? "").toLowerCase();
      const combinedText = nameText + " " + contentText;

      // Count how many query terms appear
      let matchedTerms = 0;
      let totalOccurrences = 0;

      for (const term of terms) {
        if (combinedText.includes(term)) {
          matchedTerms++;

          // Count occurrences for ranking
          let searchFrom = 0;
          let occurrences = 0;
          while (true) {
            const idx = combinedText.indexOf(term, searchFrom);
            if (idx === -1) break;
            occurrences++;
            searchFrom = idx + 1;
          }
          totalOccurrences += occurrences;
        }
      }

      if (matchedTerms === 0) continue;

      // Score: proportion of terms matched, boosted by occurrence count
      const termCoverage = matchedTerms / terms.length;
      const occurrenceBoost = Math.min(1, totalOccurrences / 20);
      const nameBoost = terms.some((t) => nameText.includes(t)) ? 0.2 : 0;
      const latestBoost = regulation.isLatest ? 0.1 : 0;

      const score = Math.min(1, termCoverage * 0.6 + occurrenceBoost * 0.1 + nameBoost + latestBoost);

      // Extract excerpt from content if available
      let excerpt: string | undefined;
      if (contentText.length > 0) {
        for (const term of terms) {
          const idx = contentText.indexOf(term);
          if (idx !== -1) {
            const start = Math.max(0, idx - 80);
            const end = Math.min(contentText.length, idx + term.length + 80);
            excerpt = (start > 0 ? "..." : "") +
              (regulation.textContent ?? "").slice(start, end) +
              (end < contentText.length ? "..." : "");
            break;
          }
        }
      }

      results.push({ regulation, score, excerpt });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Update a regulation in the index by ID.
 * Returns the updated regulation or null if not found.
 */
export function updateRegulation(
  index: RegulationIndex,
  id: string,
  updates: Partial<StoredRegulation>,
): StoredRegulation | null {
  for (const regulations of index.byMunicipality.values()) {
    const regulation = regulations.find((r) => r.id === id);
    if (regulation) {
      // Apply updates (excluding id which should not change)
      const { id: _id, ...safeUpdates } = updates;
      Object.assign(regulation, safeUpdates);

      // If municipality changed, we need to reorganize
      if (updates.municipality && updates.municipality.toLowerCase() !== regulation.municipality.toLowerCase()) {
        // Remove from old location
        const oldMuni = regulation.municipality.toLowerCase();
        const oldList = index.byMunicipality.get(oldMuni);
        if (oldList) {
          const idx = oldList.indexOf(regulation);
          if (idx !== -1) oldList.splice(idx, 1);
        }

        // Add to new location
        const newMuni = updates.municipality.toLowerCase();
        if (!index.byMunicipality.has(newMuni)) {
          index.byMunicipality.set(newMuni, []);
        }
        index.byMunicipality.get(newMuni)!.push(regulation);
      }

      rebuildIndexMeta(index);
      return regulation;
    }
  }

  return null;
}

/**
 * Process a regulation ZIP result (from zip-processor output) and create
 * StoredRegulation entries for each file found.
 *
 * Auto-classifies regulation type from filename patterns:
 * - PDM patterns: /pdm|plano.*direct/i
 * - Regulamento: /regulamento.*munic/i
 * - Parecer: /parecer/i
 * - Plano de pormenor: /plano.*pormenor|pp\d/i
 * - Regulamento urbanístico: /regul.*urban/i
 */
export function processRegulationZip(
  zipResult: {
    files: Array<{
      name: string;
      path: string;
      extension: string;
      size: number;
      data: ArrayBuffer;
      category: string;
    }>;
  },
  municipality: string,
): StoredRegulation[] {
  const now = new Date().toISOString();
  const regulations: StoredRegulation[] = [];

  for (const file of zipResult.files) {
    const documentType = classifyRegulationType(file.name);

    // Generate a readable name from the filename (strip extension)
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

    const regulation: StoredRegulation = {
      id: crypto.randomUUID(),
      municipality: municipality,
      name: nameWithoutExt,
      description: `Regulamento do município de ${municipality} — ${DOCUMENT_TYPE_NAMES_PT[documentType]}`,
      fileName: file.name,
      fileSize: file.size,
      documentType,
      uploadedAt: now,
      isLatest: true,
      version: 1,
      storagePath: file.path,
      tags: [municipality.toLowerCase(), documentType],
    };

    regulations.push(regulation);
  }

  return regulations;
}

/**
 * Check what regulation types are expected for a municipality and
 * return which are missing. The minimum expected types are:
 * ["pdm", "regulamento_municipal"].
 *
 * If additional required types are specified, those are checked too.
 */
export function getMissingRegulations(
  index: RegulationIndex,
  municipality: string,
  requiredTypes: StoredRegulation["documentType"][],
): { documentType: StoredRegulation["documentType"]; namePt: string }[] {
  const key = municipality.toLowerCase();
  const regulations = index.byMunicipality.get(key) ?? [];

  // Collect all document types present (latest versions)
  const presentTypes = new Set<StoredRegulation["documentType"]>();
  for (const reg of regulations) {
    if (reg.isLatest) {
      presentTypes.add(reg.documentType);
    }
  }

  // Combine minimum expected with any additional required types
  const allRequired = new Set([...MINIMUM_EXPECTED_TYPES, ...requiredTypes]);

  const missing: { documentType: StoredRegulation["documentType"]; namePt: string }[] = [];

  for (const docType of allRequired) {
    if (!presentTypes.has(docType)) {
      missing.push({
        documentType: docType,
        namePt: DOCUMENT_TYPE_NAMES_PT[docType] ?? docType,
      });
    }
  }

  return missing;
}

/**
 * Format a human-readable summary of regulations stored for a municipality.
 */
export function formatRegulationSummary(
  index: RegulationIndex,
  municipality: string,
): string {
  const key = municipality.toLowerCase();
  const regulations = index.byMunicipality.get(key);

  if (!regulations || regulations.length === 0) {
    return `Nenhum regulamento encontrado para o município de ${municipality}.`;
  }

  const latest = regulations.filter((r) => r.isLatest);
  const archived = regulations.filter((r) => !r.isLatest);

  const lines: string[] = [
    `Regulamentos para ${municipality}`,
    `${"─".repeat(40)}`,
    `Total: ${regulations.length} documento(s) (${latest.length} atual/atuais, ${archived.length} arquivado(s))`,
    "",
  ];

  // Group latest by document type
  const byType = new Map<string, StoredRegulation[]>();
  for (const reg of latest) {
    const key = reg.documentType;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(reg);
  }

  for (const [docType, regs] of byType.entries()) {
    const typeName = DOCUMENT_TYPE_NAMES_PT[docType as StoredRegulation["documentType"]] ?? docType;
    lines.push(`  ${typeName}:`);
    for (const reg of regs) {
      const dateStr = reg.documentDate ? ` (${reg.documentDate})` : "";
      const sizeKB = (reg.fileSize / 1024).toFixed(1);
      lines.push(`    - ${reg.name}${dateStr} [${sizeKB} KB] v${reg.version}`);
    }
  }

  // Check for missing required types
  const missing = getMissingRegulations(index, municipality, []);
  if (missing.length > 0) {
    lines.push("");
    lines.push("  Regulamentos em falta:");
    for (const m of missing) {
      lines.push(`    ⚠ ${m.namePt}`);
    }
  }

  return lines.join("\n");
}

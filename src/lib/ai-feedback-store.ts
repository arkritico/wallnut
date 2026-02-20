/**
 * AI Feedback Store
 *
 * Persists match history across project runs, enabling the
 * compounding improvement cycle. Stores validated matches
 * and computes aggregate patterns for few-shot prompting.
 *
 * Storage: `data/match-feedback.json` (gitignored per-installation)
 * Falls back to in-memory if filesystem unavailable (browser/worker).
 */

import type {
  MatchHistoryEntry,
  MatchPattern,
  MatchFeedbackStore,
} from "./ai-feedback-types";
import type { AIMatchReview } from "./ai-feedback-types";
import type { PriceMatch, MatchReport } from "./wbs-types";

// ============================================================
// Store Management
// ============================================================

const STORE_PATH = "data/match-feedback.json";
const MAX_ENTRIES = 5000; // Cap to prevent unbounded growth

let memoryStore: MatchFeedbackStore | null = null;

/** Load the feedback store from disk (Node.js) or memory (browser) */
export async function loadFeedbackStore(): Promise<MatchFeedbackStore> {
  if (memoryStore) return memoryStore;

  try {
    if (typeof process !== "undefined" && process.versions?.node) {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), STORE_PATH);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        memoryStore = JSON.parse(raw) as MatchFeedbackStore;
        return memoryStore;
      }
    }
  } catch {
    // Filesystem unavailable — use empty store
  }

  memoryStore = {
    version: 1,
    entries: [],
    patterns: [],
    totalProjects: 0,
    lastUpdated: new Date().toISOString(),
  };
  return memoryStore;
}

/** Persist the feedback store to disk */
async function saveFeedbackStore(store: MatchFeedbackStore): Promise<void> {
  memoryStore = store;

  try {
    if (typeof process !== "undefined" && process.versions?.node) {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), STORE_PATH);
      fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
    }
  } catch {
    // Filesystem unavailable — store lives in memory only
  }
}

// ============================================================
// Recording Matches
// ============================================================

/**
 * Record validated matches from a completed project run.
 * Called after Pass 3 (AI Review) with the AI's verdicts.
 */
export async function recordMatchFeedback(
  projectId: string,
  buildingType: string,
  isRehabilitation: boolean,
  matches: PriceMatch[],
  reviews: AIMatchReview[],
): Promise<void> {
  const store = await loadFeedbackStore();
  const timestamp = new Date().toISOString();

  // Build lookup of AI reviews by article code
  const reviewMap = new Map(reviews.map(r => [r.articleCode, r]));

  // Record each match with its AI verdict
  for (const match of matches) {
    const review = reviewMap.get(match.articleCode);
    const verdict = review?.verdict ?? "acceptable"; // Default if no review

    // Only record correct/acceptable matches (not wrong or missing_context)
    if (verdict !== "correct" && verdict !== "acceptable") continue;

    const entry: MatchHistoryEntry = {
      timestamp,
      projectId,
      buildingType,
      isRehabilitation,
      articleCode: match.articleCode,
      articleDescription: match.articleDescription,
      articleUnit: match.articleUnit ?? match.priceUnit,
      priceCode: match.priceCode,
      priceDescription: match.priceDescription,
      algorithmicConfidence: match.confidence,
      aiVerdict: verdict,
      validatedUnitCost: match.unitCost,
    };

    store.entries.push(entry);
  }

  // Trim to max entries (remove oldest)
  if (store.entries.length > MAX_ENTRIES) {
    store.entries = store.entries.slice(-MAX_ENTRIES);
  }

  store.totalProjects++;
  store.lastUpdated = timestamp;

  // Recompute patterns
  store.patterns = computePatterns(store.entries);

  await saveFeedbackStore(store);
}

// ============================================================
// Pattern Computation
// ============================================================

/**
 * Compute aggregate patterns from match history.
 * Groups by normalized article description → most common price code.
 */
function computePatterns(entries: MatchHistoryEntry[]): MatchPattern[] {
  // Group by normalized description
  const groups = new Map<string, MatchHistoryEntry[]>();

  for (const entry of entries) {
    const key = normalizeDescription(entry.articleDescription);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const patterns: MatchPattern[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue; // Need at least 2 occurrences

    // Find most common price code
    const codeCounts = new Map<string, number>();
    for (const e of group) {
      codeCounts.set(e.priceCode, (codeCounts.get(e.priceCode) ?? 0) + 1);
    }
    const bestCode = [...codeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    // Compute stats for the best code
    const bestEntries = group.filter(e => e.priceCode === bestCode[0]);
    const costs = bestEntries.map(e => e.validatedUnitCost).filter(c => c > 0);
    const avgConfidence = bestEntries.reduce((s, e) => s + e.algorithmicConfidence, 0) / bestEntries.length;

    patterns.push({
      articlePattern: key,
      bestPriceCode: bestCode[0],
      bestPriceDescription: bestEntries[0].priceDescription,
      validationCount: bestCode[1],
      averageConfidence: Math.round(avgConfidence),
      typicalUnitCost: {
        min: costs.length > 0 ? Math.min(...costs) : 0,
        max: costs.length > 0 ? Math.max(...costs) : 0,
      },
      buildingTypes: [...new Set(group.map(e => e.buildingType))],
    });
  }

  // Sort by validation count (most validated first)
  return patterns.sort((a, b) => b.validationCount - a.validationCount);
}

/** Normalize article description for grouping */
function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // Keep letters + numbers + spaces
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(w => w.length > 2)
    .slice(0, 6) // First 6 significant words
    .join(" ");
}

// ============================================================
// Few-Shot Examples for Prompts
// ============================================================

/**
 * Get the top N match patterns for use as few-shot examples
 * in the AI estimation prompt. Optionally filtered by building type.
 */
export async function getTopPatterns(
  n: number = 10,
  buildingType?: string,
): Promise<MatchPattern[]> {
  const store = await loadFeedbackStore();
  let patterns = store.patterns;

  if (buildingType) {
    // Prefer patterns from the same building type
    const typed = patterns.filter(p => p.buildingTypes.includes(buildingType));
    const other = patterns.filter(p => !p.buildingTypes.includes(buildingType));
    patterns = [...typed, ...other];
  }

  return patterns.slice(0, n);
}

/**
 * Format match patterns as a prompt section for few-shot learning.
 */
export function formatPatternsForPrompt(patterns: MatchPattern[]): string {
  if (patterns.length === 0) return "";

  const lines = patterns.map(p =>
    `- "${p.articlePattern}" → ${p.bestPriceCode} (${p.bestPriceDescription}), ` +
    `€${p.typicalUnitCost.min}-${p.typicalUnitCost.max}/${p.buildingTypes[0] ?? "geral"}, ` +
    `validado ${p.validationCount}x`,
  );

  return `\n## APRENDIZAGEM DE PROJETOS ANTERIORES (${patterns.length} padrões validados)\n` +
    `Estes artigos foram validados em projetos anteriores. Use como referência:\n` +
    lines.join("\n");
}

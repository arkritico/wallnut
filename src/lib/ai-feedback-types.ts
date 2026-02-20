/**
 * AI Feedback Loop Types
 *
 * Supports the compounding improvement cycle:
 *   Pass 1: AI Estimate (THE BRAIN)
 *   Pass 2: Algorithmic Match (THE DETAIL)
 *   Pass 3: AI Review (THE JUDGE) — reviews algorithmic choices, suggests improvements
 *   Store: Match history for few-shot learning in future projects
 */

// ============================================================
// Pass 3: AI Review (THE JUDGE)
// ============================================================

/** AI's review of a single algorithmic price match */
export interface AIMatchReview {
  /** Article code from the WBS */
  articleCode: string;
  /** Price code the algorithmic matcher chose */
  matchedPriceCode: string;
  /** AI's verdict on this match */
  verdict: "correct" | "acceptable" | "wrong" | "missing_context";
  /** Why the AI agrees or disagrees */
  reasoning: string;
  /** If wrong, AI's suggested better match (price code or description) */
  suggestedAlternative?: string;
  /** Confidence in the review itself */
  confidence: "high" | "medium" | "low";
}

/** AI's review of unmatched articles */
export interface AIUnmatchedReview {
  /** Article code that had no match */
  articleCode: string;
  articleDescription: string;
  /** AI's suggestion for how to handle it */
  suggestion: string;
  /** Estimated cost range even without a DB match */
  estimatedCostRange?: { min: number; max: number };
}

/** Full AI review result (Pass 3 output) */
export interface AIReviewResult {
  /** Reviews of algorithmic price matches */
  matchReviews: AIMatchReview[];
  /** Reviews of unmatched articles */
  unmatchedReviews: AIUnmatchedReview[];
  /** Patterns the AI noticed (for learning) */
  patternInsights: string[];
  /** Suggested improvements to the matching system */
  matcherSuggestions: AIMatcherSuggestion[];
  /** Refined total cost estimate after reviewing matches */
  refinedEstimate?: {
    min: number;
    max: number;
    mostLikely: number;
    adjustmentReason: string;
  };
  modelUsed: string;
  processingTimeMs: number;
}

/** AI's suggestion for improving the algorithmic matcher */
export interface AIMatcherSuggestion {
  type: "missing_synonym" | "wrong_unit" | "missing_pattern" | "category_mismatch" | "price_outdated";
  description: string;
  /** Concrete data for automated application */
  data?: {
    /** e.g., for missing_synonym: the word pair to add */
    word1?: string;
    word2?: string;
    /** e.g., for wrong_unit: the correct unit mapping */
    fromUnit?: string;
    toUnit?: string;
    /** e.g., for missing_pattern: a regex pattern to add */
    pattern?: string;
    priceCode?: string;
  };
}

// ============================================================
// Match History (Cross-Project Learning)
// ============================================================

/** A single successful match record for the feedback store */
export interface MatchHistoryEntry {
  /** Timestamp of the project run */
  timestamp: string;
  /** Project identifier (name or hash) */
  projectId: string;
  /** Building type for context */
  buildingType: string;
  /** Whether this was a rehabilitation project */
  isRehabilitation: boolean;
  /** The WBS article */
  articleCode: string;
  articleDescription: string;
  articleUnit: string;
  /** The matched price item */
  priceCode: string;
  priceDescription: string;
  /** How confident the match was */
  algorithmicConfidence: number;
  /** AI's verdict on the match */
  aiVerdict: "correct" | "acceptable" | "wrong";
  /** Final cost per unit (validated) */
  validatedUnitCost: number;
}

/** Aggregated match pattern for few-shot examples */
export interface MatchPattern {
  /** Article description pattern (e.g., "pilares betão armado") */
  articlePattern: string;
  /** Most frequently validated price code */
  bestPriceCode: string;
  bestPriceDescription: string;
  /** How many times this pairing was validated */
  validationCount: number;
  /** Average confidence when validated */
  averageConfidence: number;
  /** Typical unit cost range */
  typicalUnitCost: { min: number; max: number };
  /** Building types where this match appeared */
  buildingTypes: string[];
}

/** The full feedback store (persisted to JSON) */
export interface MatchFeedbackStore {
  version: 1;
  /** Individual match records */
  entries: MatchHistoryEntry[];
  /** Aggregated patterns (computed from entries) */
  patterns: MatchPattern[];
  /** Total projects processed */
  totalProjects: number;
  /** Last update timestamp */
  lastUpdated: string;
}

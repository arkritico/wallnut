/**
 * AI-First Estimation Types
 *
 * Defines the structured output that the LLM produces when interpreting
 * a construction project, plus the reconciliation types for comparing
 * AI estimates against the algorithmic price-matching pipeline.
 */

// ============================================================
// AI Estimation Output
// ============================================================

/** A single work package estimated by the AI */
export interface AIWorkPackage {
  /** ProNIC-style chapter code, e.g. "06.01" */
  code: string;
  /** Work package name, e.g. "Estrutura de betão armado" */
  name: string;
  /** Detailed scope description */
  description: string;
  /** Measurement unit: m, m2, m3, Ud, kg, vg, etc. */
  unit: string;
  /** AI-estimated quantity */
  estimatedQuantity: number;
  /** Unit cost range in EUR (Portuguese market 2024-2025) */
  unitCostRange: { min: number; max: number };
  /** Total cost range in EUR */
  totalCostRange: { min: number; max: number };
  /** Confidence level */
  confidence: "high" | "medium" | "low";
  /** Brief justification for the estimate */
  reasoning: string;
  /** Construction phase for sequencing */
  phase: string;
}

/** Full AI estimation result for a project */
export interface AIEstimateResult {
  /** AI's understanding of the project */
  projectUnderstanding: {
    buildingType: string;
    scope: string;
    complexity: "simple" | "medium" | "complex" | "very_complex";
    grossFloorArea: number;
    location: string;
    keyConstraints: string[];
  };
  /** Itemized work packages */
  workPackages: AIWorkPackage[];
  /** Aggregated cost estimate in EUR */
  totalEstimate: {
    min: number;
    max: number;
    mostLikely: number;
  };
  /** Suggested construction sequence (phase codes) */
  suggestedSequence: string[];
  /** Identified project risks */
  risks: Array<{
    description: string;
    impact: "low" | "medium" | "high";
    mitigation: string;
  }>;
  /** Key assumptions made by the AI */
  assumptions: string[];
  /** Model that produced this estimate */
  modelUsed: string;
  /** Wall-clock time for the API call */
  processingTimeMs: number;
}

// ============================================================
// Reconciliation
// ============================================================

/** Comparison of one work package across both estimation methods */
export interface ReconciliationItem {
  /** Work package name or code */
  workPackage: string;
  /** AI estimate range */
  aiEstimate: { min: number; max: number };
  /** Algorithmic (price DB) estimate */
  algorithmicEstimate: {
    total: number;
    confidence: number;
    priceCode?: string;
  };
  /** Percentage divergence between AI mostLikely and algorithmic total */
  divergencePercent: number;
  /** Recommended source to use */
  recommendation: "use_ai" | "use_algorithmic" | "review_needed";
}

/** Full reconciliation report comparing AI vs algorithmic pipeline */
export interface ReconciliationReport {
  items: ReconciliationItem[];
  aiTotal: { min: number; max: number };
  algorithmicTotal: number;
  overallDivergencePercent: number;
  verdict: "aligned" | "minor_divergence" | "major_divergence";
  /** Human-readable summary in Portuguese */
  summary: string;
}

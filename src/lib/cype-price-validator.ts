/**
 * CYPE Price Validator
 *
 * Validates scraped prices against parametric estimates and business rules.
 * - Outlier detection (scraped vs parametric)
 * - Breakdown sum validation (materials + labor + machinery = total)
 * - Unit validation and normalization
 * - Confidence scoring
 */

import { createLogger } from "./logger";

const logger = createLogger("cype-price-validator");

// ============================================================================
// TYPES
// ============================================================================

export interface PriceValidationResult {
  isValid: boolean;
  confidence: number; // 0-100
  warnings: string[];
  errors: string[];
  adjustedPrice?: number;
  source: "scraper" | "parametric" | "manual";
}

export interface BreakdownValidationResult {
  isValid: boolean;
  calculatedTotal: number;
  declaredTotal: number;
  difference: number;
  differencePercent: number;
  message: string;
}

export interface UnitValidationResult {
  isValid: boolean;
  normalizedUnit: string;
  warnings: string[];
}

export interface CypePriceInput {
  code: string;
  description: string;
  category: string;
  unit: string;
  totalCost: number;
  breakdown?: {
    materials: number;
    labor: number;
    machinery: number;
  };
}

// ============================================================================
// UNIT VALIDATION
// ============================================================================

const VALID_UNITS = new Set([
  "m", "m2", "m²", "m3", "m³",
  "Ud", "ud", "un", "unidade",
  "kg", "ton", "t",
  "h", "hora",
  "l", "litro",
  "conjunto", "cj",
  "sistema", "vg",
  "projeto", "projecto",
  "ensaio",
]);

const UNIT_NORMALIZATION: Record<string, string> = {
  "m2": "m²",
  "m 2": "m²",
  "m3": "m³",
  "m 3": "m³",
  "un": "Ud",
  "unidade": "Ud",
  "ud": "Ud",
  "ton": "t",
  "hora": "h",
  "litro": "l",
  "projecto": "projeto",
  "cj": "conjunto",
};

export function validateUnit(unit: string): UnitValidationResult {
  const warnings: string[] = [];
  const trimmed = unit.trim();
  const normalized = UNIT_NORMALIZATION[trimmed.toLowerCase()] || trimmed;

  const isValid = VALID_UNITS.has(normalized) || VALID_UNITS.has(trimmed);
  if (!isValid) {
    warnings.push(`Unidade não reconhecida: "${unit}"`);
  }

  return { isValid, normalizedUnit: normalized, warnings };
}

// ============================================================================
// BREAKDOWN VALIDATION
// ============================================================================

export function validateBreakdown(
  materials: number,
  labor: number,
  machinery: number,
  total: number,
  tolerance = 0.05,
): BreakdownValidationResult {
  const calculatedTotal = materials + labor + machinery;
  const difference = Math.abs(total - calculatedTotal);
  const differencePercent = total > 0 ? (difference / total) * 100 : 0;
  const isValid = differencePercent <= tolerance * 100;

  const message = isValid
    ? `Breakdown válido: ${calculatedTotal.toFixed(2)}€ ≈ ${total.toFixed(2)}€`
    : `Breakdown não soma ao total: ${calculatedTotal.toFixed(2)}€ ≠ ${total.toFixed(2)}€ (${differencePercent.toFixed(1)}%)`;

  return { isValid, calculatedTotal, declaredTotal: total, difference, differencePercent, message };
}

// ============================================================================
// PARAMETRIC PRICE ESTIMATION (Portuguese 2026 averages)
// ============================================================================

const PARAMETRIC: Record<string, number> = {
  concrete_column: 420,    // €/m³
  concrete_beam: 380,
  concrete_slab_solid: 85, // €/m²
  concrete_slab_hollow: 55,
  brick_wall_15cm: 22,     // €/m²
  brick_wall_11cm: 18,
  block_wall_20cm: 25,
  ceramic_floor: 42,       // €/m²
  wood_floor: 35,
  vinyl_floor: 28,
  paint_interior: 6,
  paint_exterior: 8,
  electrical_panel: 680,   // €/Ud
  fire_detector: 85,
  emergency_light: 65,
  fire_extinguisher: 52,
};

export function estimateParametricPrice(
  _code: string,
  description: string,
  _category: string,
  unit: string,
): number {
  const d = description.toLowerCase();

  if (d.includes("pilar") && d.includes("betão")) return PARAMETRIC.concrete_column;
  if (d.includes("viga") && d.includes("betão")) return PARAMETRIC.concrete_beam;
  if (d.includes("laje") && d.includes("maciça")) return PARAMETRIC.concrete_slab_solid;
  if (d.includes("laje") && d.includes("aligeirada")) return PARAMETRIC.concrete_slab_hollow;
  if (d.includes("alvenaria") && d.includes("15")) return PARAMETRIC.brick_wall_15cm;
  if (d.includes("alvenaria") && d.includes("11")) return PARAMETRIC.brick_wall_11cm;
  if (d.includes("pavimento") && d.includes("cerâmico")) return PARAMETRIC.ceramic_floor;
  if (d.includes("pavimento") && d.includes("madeira")) return PARAMETRIC.wood_floor;
  if (d.includes("pavimento") && d.includes("vinílico")) return PARAMETRIC.vinyl_floor;
  if (d.includes("pintura") && d.includes("interior")) return PARAMETRIC.paint_interior;
  if (d.includes("pintura") && d.includes("exterior")) return PARAMETRIC.paint_exterior;
  if (d.includes("quadro") && d.includes("elétrico")) return PARAMETRIC.electrical_panel;
  if (d.includes("detetor") && d.includes("fumo")) return PARAMETRIC.fire_detector;
  if (d.includes("iluminação") && d.includes("emergência")) return PARAMETRIC.emergency_light;
  if (d.includes("extintor")) return PARAMETRIC.fire_extinguisher;

  // Generic fallback by unit
  if (unit === "m²" || unit === "m2") return 50;
  if (unit === "m³" || unit === "m3") return 300;
  if (unit === "m") return 40;
  if (unit === "Ud") return 200;
  return 0;
}

// ============================================================================
// OUTLIER DETECTION
// ============================================================================

export function detectPriceOutlier(
  scrapedPrice: number,
  parametricPrice: number,
  tolerance = 2.0,
): { isOutlier: boolean; ratio: number; message: string } {
  if (parametricPrice === 0) {
    return { isOutlier: false, ratio: 0, message: "Sem estimativa paramétrica" };
  }

  const ratio = scrapedPrice / parametricPrice;
  const isOutlier = ratio > tolerance || ratio < 1 / tolerance;

  const message = isOutlier
    ? `Preço outlier: ${scrapedPrice.toFixed(2)}€ vs ${parametricPrice.toFixed(2)}€ (${ratio.toFixed(1)}x)`
    : `Preço dentro da margem (${ratio.toFixed(2)}x vs paramétrico)`;

  return { isOutlier, ratio, message };
}

// ============================================================================
// FULL VALIDATION
// ============================================================================

export function validateCypePrice(item: CypePriceInput): PriceValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let confidence = 100;

  // 1. Unit validation
  const unitResult = validateUnit(item.unit);
  if (!unitResult.isValid) {
    confidence -= 10;
    warnings.push(...unitResult.warnings);
  }

  // 2. Breakdown validation
  if (item.breakdown) {
    const br = validateBreakdown(
      item.breakdown.materials,
      item.breakdown.labor,
      item.breakdown.machinery,
      item.totalCost,
    );
    if (!br.isValid) {
      confidence -= 20;
      errors.push(br.message);
    }
  } else {
    confidence -= 5;
    warnings.push("Sem breakdown disponível");
  }

  // 3. Parametric comparison
  const parametric = estimateParametricPrice(item.code, item.description, item.category, item.unit);
  const outlier = detectPriceOutlier(item.totalCost, parametric);
  if (outlier.isOutlier) {
    confidence -= 30;
    warnings.push(outlier.message);
  }

  // 4. Sanity checks
  if (item.totalCost <= 0) {
    confidence = 0;
    errors.push("Preço inválido: <= 0");
  }
  if (item.totalCost > 100_000) {
    confidence -= 10;
    warnings.push(`Preço muito alto: ${item.totalCost.toFixed(2)}€`);
  }

  let source: "scraper" | "parametric" | "manual" = "scraper";
  let adjustedPrice: number | undefined;
  if (confidence < 50 && parametric > 0) {
    source = "parametric";
    adjustedPrice = parametric;
    warnings.push(`Usando preço paramétrico (${parametric.toFixed(2)}€)`);
  }

  return {
    isValid: errors.length === 0 && confidence >= 50,
    confidence: Math.max(0, confidence),
    warnings,
    errors,
    adjustedPrice,
    source,
  };
}

/**
 * Batch validate and return statistics.
 */
export function validateBatch(items: CypePriceInput[]): {
  results: Array<CypePriceInput & { validation: PriceValidationResult }>;
  stats: {
    total: number;
    valid: number;
    invalid: number;
    useParametric: number;
    avgConfidence: number;
  };
} {
  const results = items.map((item) => ({
    ...item,
    validation: validateCypePrice(item),
  }));

  const valid = results.filter((r) => r.validation.isValid).length;
  const useParametric = results.filter((r) => r.validation.source === "parametric").length;
  const avgConfidence =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.validation.confidence, 0) / results.length
      : 0;

  logger.info("Batch validation complete", {
    total: results.length,
    valid,
    invalid: results.length - valid,
    useParametric,
    avgConfidence: avgConfidence.toFixed(1),
  });

  return {
    results,
    stats: {
      total: results.length,
      valid,
      invalid: results.length - valid,
      useParametric,
      avgConfidence,
    },
  };
}

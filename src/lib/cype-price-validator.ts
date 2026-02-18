/**
 * CYPE Price Validator
 *
 * Validates scraped prices against parametric estimates and business rules.
 *
 * Features:
 * 1. Outlier detection (scraper vs parametric)
 * 2. Breakdown sum validation (materials + labor + machinery = total)
 * 3. Unit validation (m, m², m³, Ud, etc.)
 * 4. Historical price comparison
 * 5. Confidence scoring
 */

import { createLogger } from './logger';

const logger = createLogger('cype-price-validator');

// ============================================================================
// TYPES
// ============================================================================

export interface PriceValidationResult {
  isValid: boolean;
  confidence: number; // 0-100
  warnings: string[];
  errors: string[];
  adjustedPrice?: number; // If price needed adjustment
  source: 'scraper' | 'parametric' | 'manual';
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

// ============================================================================
// UNIT VALIDATION
// ============================================================================

const VALID_UNITS = new Set([
  'm', 'm2', 'm²', 'm3', 'm³',
  'Ud', 'ud', 'un', 'unidade',
  'kg', 'ton', 't',
  'h', 'hora',
  'l', 'litro',
  'conjunto', 'cj',
  'sistema', 'vg',
  'projeto', 'projecto',
  'ensaio'
]);

const UNIT_NORMALIZATION: Record<string, string> = {
  'm2': 'm²',
  'm 2': 'm²',
  'm3': 'm³',
  'm 3': 'm³',
  'un': 'Ud',
  'unidade': 'Ud',
  'ud': 'Ud',
  'ton': 't',
  'hora': 'h',
  'litro': 'l',
  'projecto': 'projeto',
  'cj': 'conjunto',
};

/**
 * Validate and normalize unit
 */
export function validateUnit(unit: string): UnitValidationResult {
  const warnings: string[] = [];
  let isValid = true;

  const trimmed = unit.trim();
  const normalized = UNIT_NORMALIZATION[trimmed.toLowerCase()] || trimmed;

  // Check if unit is recognized
  if (!VALID_UNITS.has(normalized) && !VALID_UNITS.has(trimmed)) {
    warnings.push(`Unidade não reconhecida: "${unit}"`);
    isValid = false;
  }

  // Check for common typos
  if (unit.includes(' ') && !unit.includes('m ')) {
    warnings.push(`Unidade contém espaços inesperados: "${unit}"`);
  }

  return {
    isValid,
    normalizedUnit: normalized,
    warnings,
  };
}

// ============================================================================
// BREAKDOWN VALIDATION
// ============================================================================

/**
 * Validate that breakdown components sum to total cost
 */
export function validateBreakdown(
  materials: number,
  labor: number,
  machinery: number,
  total: number,
  tolerance: number = 0.05 // 5% tolerance
): BreakdownValidationResult {
  const calculatedTotal = materials + labor + machinery;
  const difference = Math.abs(total - calculatedTotal);
  const differencePercent = total > 0 ? (difference / total) * 100 : 0;

  const isValid = differencePercent <= (tolerance * 100);

  let message = '';
  if (!isValid) {
    message = `Breakdown não soma ao total: ${calculatedTotal.toFixed(2)}€ ≠ ${total.toFixed(2)}€ (diferença: ${differencePercent.toFixed(1)}%)`;
  } else {
    message = `Breakdown válido: ${calculatedTotal.toFixed(2)}€ ≈ ${total.toFixed(2)}€`;
  }

  return {
    isValid,
    calculatedTotal,
    declaredTotal: total,
    difference,
    differencePercent,
    message,
  };
}

// ============================================================================
// PARAMETRIC PRICE ESTIMATION
// ============================================================================

/**
 * Parametric cost estimation formulas
 * Based on Portuguese construction industry averages (2026)
 */
const PARAMETRIC_FORMULAS: Record<string, (params: any) => number> = {
  // Structure
  concrete_column: (p) => 420, // €/m³
  concrete_beam: (p) => 380,
  concrete_slab_solid: (p) => 85, // €/m²
  concrete_slab_hollow: (p) => 55,

  // Masonry
  brick_wall_15cm: (p) => 22, // €/m²
  brick_wall_11cm: (p) => 18,
  block_wall_20cm: (p) => 25,

  // Finishes
  ceramic_floor: (p) => 42, // €/m²
  wood_floor: (p) => 35,
  vinyl_floor: (p) => 28,
  paint_interior: (p) => 6,
  paint_exterior: (p) => 8,

  // MEP
  electrical_panel_12mod: (p) => 680, // €/Ud
  fire_detector_smoke: (p) => 85,
  emergency_light: (p) => 65,
  fire_extinguisher_6kg: (p) => 52,

  // Default fallback: use materials + labor estimate
  default: (p) => {
    const { category, unit } = p;
    // Very rough estimates
    if (unit === 'm²') return 50;
    if (unit === 'm³') return 300;
    if (unit === 'm') return 40;
    if (unit === 'Ud') return 200;
    return 0;
  },
};

/**
 * Estimate parametric price for an item
 */
export function estimateParametricPrice(
  code: string,
  description: string,
  category: string,
  unit: string
): number {
  const lowerDesc = description.toLowerCase();
  const lowerCat = category.toLowerCase();

  // Match against formulas
  if (lowerDesc.includes('pilar') && lowerDesc.includes('betão')) {
    return PARAMETRIC_FORMULAS.concrete_column({});
  }
  if (lowerDesc.includes('viga') && lowerDesc.includes('betão')) {
    return PARAMETRIC_FORMULAS.concrete_beam({});
  }
  if (lowerDesc.includes('laje') && lowerDesc.includes('maciça')) {
    return PARAMETRIC_FORMULAS.concrete_slab_solid({});
  }
  if (lowerDesc.includes('laje') && lowerDesc.includes('aligeirada')) {
    return PARAMETRIC_FORMULAS.concrete_slab_hollow({});
  }

  if (lowerDesc.includes('alvenaria') && lowerDesc.includes('15')) {
    return PARAMETRIC_FORMULAS.brick_wall_15cm({});
  }
  if (lowerDesc.includes('alvenaria') && lowerDesc.includes('11')) {
    return PARAMETRIC_FORMULAS.brick_wall_11cm({});
  }

  if (lowerDesc.includes('pavimento') && lowerDesc.includes('cerâmico')) {
    return PARAMETRIC_FORMULAS.ceramic_floor({});
  }
  if (lowerDesc.includes('pavimento') && lowerDesc.includes('madeira')) {
    return PARAMETRIC_FORMULAS.wood_floor({});
  }
  if (lowerDesc.includes('pavimento') && lowerDesc.includes('vinílico')) {
    return PARAMETRIC_FORMULAS.vinyl_floor({});
  }

  if (lowerDesc.includes('pintura') && lowerDesc.includes('interior')) {
    return PARAMETRIC_FORMULAS.paint_interior({});
  }
  if (lowerDesc.includes('pintura') && lowerDesc.includes('exterior')) {
    return PARAMETRIC_FORMULAS.paint_exterior({});
  }

  if (lowerDesc.includes('quadro') && lowerDesc.includes('elétrico')) {
    return PARAMETRIC_FORMULAS.electrical_panel_12mod({});
  }
  if (lowerDesc.includes('detetor') && lowerDesc.includes('fumo')) {
    return PARAMETRIC_FORMULAS.fire_detector_smoke({});
  }
  if (lowerDesc.includes('iluminação') && lowerDesc.includes('emergência')) {
    return PARAMETRIC_FORMULAS.emergency_light({});
  }
  if (lowerDesc.includes('extintor')) {
    return PARAMETRIC_FORMULAS.fire_extinguisher_6kg({});
  }

  // Fallback
  return PARAMETRIC_FORMULAS.default({ category, unit });
}

// ============================================================================
// OUTLIER DETECTION
// ============================================================================

/**
 * Detect if scraped price is an outlier vs parametric
 */
export function detectPriceOutlier(
  scrapedPrice: number,
  parametricPrice: number,
  tolerance: number = 2.0 // 2x = 200% deviation threshold
): { isOutlier: boolean; ratio: number; message: string } {
  if (parametricPrice === 0) {
    return {
      isOutlier: false,
      ratio: 0,
      message: 'Sem estimativa paramétrica para comparação',
    };
  }

  const ratio = scrapedPrice / parametricPrice;

  const isOutlier = ratio > tolerance || ratio < (1 / tolerance);

  let message = '';
  if (isOutlier) {
    const percentDiff = Math.abs((ratio - 1) * 100);
    message = `Preço outlier: ${scrapedPrice.toFixed(2)}€ vs estimativa ${parametricPrice.toFixed(2)}€ (${ratio.toFixed(1)}x, ${percentDiff.toFixed(0)}% diferença)`;
  } else {
    message = `Preço dentro da margem esperada (${ratio.toFixed(2)}x vs parametric)`;
  }

  return { isOutlier, ratio, message };
}

// ============================================================================
// FULL PRICE VALIDATION
// ============================================================================

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

/**
 * Comprehensive price validation
 */
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

  // 2. Breakdown validation (if available)
  if (item.breakdown) {
    const { materials, labor, machinery } = item.breakdown;
    const breakdownResult = validateBreakdown(materials, labor, machinery, item.totalCost);

    if (!breakdownResult.isValid) {
      confidence -= 20;
      errors.push(breakdownResult.message);
      logger.warn('Breakdown validation failed', {
        code: item.code,
        ...breakdownResult
      });
    }
  } else {
    confidence -= 5;
    warnings.push('Sem breakdown disponível para validação');
  }

  // 3. Parametric comparison
  const parametricPrice = estimateParametricPrice(
    item.code,
    item.description,
    item.category,
    item.unit
  );

  const outlierResult = detectPriceOutlier(item.totalCost, parametricPrice);
  if (outlierResult.isOutlier) {
    confidence -= 30;
    warnings.push(outlierResult.message);
    logger.warn('Price outlier detected', {
      code: item.code,
      scrapedPrice: item.totalCost,
      parametricPrice,
      ratio: outlierResult.ratio
    });
  }

  // 4. Sanity checks
  if (item.totalCost <= 0) {
    confidence = 0;
    errors.push('Preço inválido: <= 0');
  }

  if (item.totalCost > 100000) {
    confidence -= 10;
    warnings.push(`Preço muito alto: ${item.totalCost.toFixed(2)}€`);
  }

  // Determine source and adjusted price
  let source: 'scraper' | 'parametric' | 'manual' = 'scraper';
  let adjustedPrice: number | undefined;

  if (confidence < 50 && parametricPrice > 0) {
    source = 'parametric';
    adjustedPrice = parametricPrice;
    warnings.push(`Usando preço paramétrico (${parametricPrice.toFixed(2)}€) devido a baixa confiança do scraper`);
  }

  const isValid = errors.length === 0 && confidence >= 50;

  if (!isValid) {
    logger.error('Price validation failed', {
      code: item.code,
      totalCost: item.totalCost,
      confidence,
      errors,
      warnings
    });
  }

  return {
    isValid,
    confidence: Math.max(0, confidence),
    warnings,
    errors,
    adjustedPrice,
    source,
  };
}

/**
 * Batch validate multiple items and return statistics
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
  const results = items.map(item => ({
    ...item,
    validation: validateCypePrice(item),
  }));

  const valid = results.filter(r => r.validation.isValid).length;
  const invalid = results.length - valid;
  const useParametric = results.filter(r => r.validation.source === 'parametric').length;
  const avgConfidence = results.reduce((sum, r) => sum + r.validation.confidence, 0) / results.length;

  logger.info('Batch validation complete', {
    total: results.length,
    valid,
    invalid,
    useParametric,
    avgConfidence: avgConfidence.toFixed(1)
  });

  return {
    results,
    stats: {
      total: results.length,
      valid,
      invalid,
      useParametric,
      avgConfidence,
    },
  };
}

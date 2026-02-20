/**
 * Price Matcher Database Loader (Isomorphic)
 *
 * Loads price data from scraper output. Works in both Node.js (server)
 * and browser/Worker contexts:
 *   - Node.js: reads from filesystem (data/price-db.json)
 *   - Browser/Worker: fetches from /data/price-db.json (public dir)
 */

import type { PriceWorkItem } from './cost-estimation';
import type { RegulationArea } from './types';

// ============================================================================
// TYPES
// ============================================================================

interface ScrapedPriceItem {
  code: string;
  description: string;
  fullDescription?: string;
  unit: string;
  totalCost: number;
  breakdown?: Array<{
    code: string;
    unit: string;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    total: number | null;
    type: 'material' | 'labor' | 'machinery';
  }>;
  category: string;
  url: string;
  typology?: string;
  variants?: Array<{
    variantId: string;
    parameters: Record<string, string>;
    description?: string;
    unit?: string;
    unitCost: number;
  }>;
}

interface ScrapedDataFile {
  metadata: {
    exportDate: string;
    totalItems: number;
    totalComponents?: number;
    source: string;
    version: string;
    region?: string;
    typologyCounts?: Record<string, number>;
  };
  items: ScrapedPriceItem[];
}

// ============================================================================
// RUNTIME DETECTION
// ============================================================================

const isNode = typeof process !== 'undefined' && !!process.versions?.node;

// ============================================================================
// CATEGORY TO REGULATION AREA MAPPING
// ============================================================================

/**
 * Maps price categories to regulation areas for better matching
 */
function inferRegulationAreas(category: string, description: string): RegulationArea[] {
  const areas: RegulationArea[] = [];
  const lowerCat = category.toLowerCase();
  const lowerDesc = description.toLowerCase();

  // Fire safety
  if (lowerCat.includes('incêndio') || lowerCat.includes('fogo') || lowerCat.includes('extintor') ||
      lowerDesc.includes('extintor') || lowerDesc.includes('detetor') || lowerDesc.includes('emergência')) {
    areas.push('fire_safety');
  }

  // Electrical
  if (lowerCat.includes('elétric') || lowerCat.includes('eletric') ||
      lowerDesc.includes('quadro') || lowerDesc.includes('cabo') || lowerDesc.includes('tomada')) {
    areas.push('electrical');
  }

  // Water/drainage
  if (lowerCat.includes('água') || lowerCat.includes('drenagem') || lowerCat.includes('esgoto') ||
      lowerDesc.includes('tubo') || lowerDesc.includes('água') || lowerDesc.includes('sanita')) {
    areas.push('water_drainage');
  }

  // Thermal/energy
  if (lowerCat.includes('isolamento térmico') || lowerCat.includes('térmic') ||
      lowerDesc.includes('isolamento') || lowerDesc.includes('capoto') || lowerDesc.includes('ETICS')) {
    areas.push('thermal');
  }

  // Gas
  if (lowerCat.includes('gás') || lowerCat.includes('gas') || lowerDesc.includes('gás')) {
    areas.push('gas');
  }

  // ITED
  if (lowerCat.includes('telecomunica') || lowerDesc.includes('ITED') || lowerDesc.includes('fibra')) {
    areas.push('telecommunications');
  }

  // Acoustic
  if (lowerCat.includes('acústic') || lowerCat.includes('acustic') || lowerDesc.includes('acústic')) {
    areas.push('acoustic');
  }

  // AVAC
  if (lowerCat.includes('ventilação') || lowerCat.includes('climatização') ||
      lowerDesc.includes('VMC') || lowerDesc.includes('ventilação')) {
    areas.push('hvac');
  }

  // Accessibility
  if (lowerCat.includes('acessibilidade') || lowerDesc.includes('rampa') || lowerDesc.includes('ascensor')) {
    areas.push('accessibility');
  }

  // Elevators
  if (lowerCat.includes('elevador') || lowerCat.includes('ascensor') || lowerDesc.includes('elevador')) {
    areas.push('elevators');
  }

  // Structural
  if (lowerCat.includes('estrutura') || lowerCat.includes('betão') || lowerCat.includes('fundaç') ||
      lowerDesc.includes('pilar') || lowerDesc.includes('viga') || lowerDesc.includes('laje')) {
    areas.push('structural');
  }

  // Architecture (fallback for most items)
  if (areas.length === 0 || lowerCat.includes('revestimento') || lowerCat.includes('pavimento') ||
      lowerCat.includes('cobertura') || lowerCat.includes('alvenaria')) {
    areas.push('architecture');
  }

  // General fallback
  if (areas.length === 0) {
    areas.push('general');
  }

  return areas;
}

// ============================================================================
// PATTERN GENERATION
// ============================================================================

/**
 * Generate search patterns from Price description
 */
function generatePatterns(description: string, category: string, code: string): RegExp[] {
  const patterns: RegExp[] = [];

  // Remove common prefixes and suffixes
  const cleanDesc = description
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Remove parentheses content
    .replace(/\d+\s*(mm|cm|m|kg|kw|kva)/g, '') // Remove measurements
    .trim();

  // Extract main keywords (first 3-5 significant words)
  const words = cleanDesc
    .split(/[\s,.-]+/)
    .filter(w => w.length >= 3 && !['com', 'para', 'segundo', 'inclusive'].includes(w))
    .slice(0, 5);

  if (words.length >= 2) {
    // Create pattern from first 2-3 words
    const keyPhrase = words.slice(0, 3).join('.*');
    patterns.push(new RegExp(keyPhrase, 'i'));
  }

  // Add code-based pattern
  if (code.match(/^[A-Z]{3}\d{3}/)) {
    const prefix = code.substring(0, 3);
    patterns.push(new RegExp(`\\b${prefix}\\d{3}\\b`, 'i'));
  }

  // Add category-based patterns
  const catWords = category
    .toLowerCase()
    .split(/[\s>-]+/)
    .filter(w => w.length >= 4)
    .slice(-2); // Last 2 words from category

  if (catWords.length > 0) {
    patterns.push(new RegExp(catWords.join('.*'), 'i'));
  }

  return patterns.length > 0 ? patterns : [new RegExp(cleanDesc.substring(0, 20), 'i')];
}

// ============================================================================
// DATA LOADING (Isomorphic)
// ============================================================================

let _cachedItems: PriceWorkItem[] | null = null;

/**
 * Load scraped Price data — filesystem on Node.js, fetch on browser/Worker
 */
async function loadScrapedData(): Promise<ScrapedDataFile | null> {
  try {
    if (isNode) {
      // Server: read from filesystem
      const fs = await import('fs');
      const pathMod = await import('path');
      const fullPath = pathMod.join(process.cwd(), 'data/price-db.json');
      if (!fs.existsSync(fullPath)) {
        console.warn('[price-db-loader] data/price-db.json not found');
        return null;
      }
      const jsonData = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(jsonData);
    } else {
      // Browser/Worker: fetch from public directory
      const res = await fetch('/data/price-db.json');
      if (!res.ok) {
        console.warn(`[price-db-loader] fetch /data/price-db.json failed: ${res.status}`);
        return null;
      }
      return await res.json();
    }
  } catch (error) {
    console.warn('[price-db-loader] Failed to load price data:', error);
    return null;
  }
}

/**
 * Convert scraped item to PriceWorkItem format
 */
function convertToWorkItems(item: ScrapedPriceItem): PriceWorkItem[] {
  // Calculate breakdown costs
  let materials = 0;
  let labor = 0;
  let machinery = 0;

  if (item.breakdown) {
    for (const component of item.breakdown) {
      if (component.total && component.type) {
        switch (component.type) {
          case 'material':
            materials += component.total;
            break;
          case 'labor':
            labor += component.total;
            break;
          case 'machinery':
            machinery += component.total;
            break;
        }
      }
    }
  }

  // Infer areas from category and description
  const areas = inferRegulationAreas(item.category, item.description);

  // Generate search patterns
  const patterns = generatePatterns(item.description, item.category, item.code);

  // Determine if it's a rehab item — typology-based (primary) or string-based (fallback)
  const isRehab = item.typology === 'reabilitacao' ||
                  item.category.toLowerCase().includes('reabilita') ||
                  item.description.toLowerCase().includes('reabilita') ||
                  item.category.toLowerCase().includes('demoliç');

  const base: PriceWorkItem = {
    code: item.code,
    description: item.description,
    chapter: item.category,
    unit: item.unit,
    unitCost: item.totalCost,
    breakdown: {
      materials,
      labor,
      machinery,
    },
    isRehab,
    areas,
    patterns,
    detailedBreakdown: item.breakdown || [], // Preserve full breakdown for resource aggregation
    typology: (item.typology as PriceWorkItem['typology']) || 'obra_nova',
  };

  const result: PriceWorkItem[] = [base];

  // Expand variants into separate work items
  if (item.variants && item.variants.length > 0) {
    for (const variant of item.variants) {
      result.push({
        ...base,
        code: `${item.code}_${variant.variantId}`,
        description: variant.description || `${item.description} [${variant.variantId}]`,
        unit: variant.unit || base.unit,
        unitCost: variant.unitCost,
        breakdown: { ...base.breakdown }, // Variants may override later if scraped
        patterns: [
          ...patterns,
          // Add variant-specific patterns from parameter values
          ...Object.values(variant.parameters)
            .filter(v => v.length >= 3)
            .map(v => new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
        ],
      });
    }
  }

  return result;
}

/**
 * Get already-loaded price data (sync). Returns null if not yet loaded.
 * Use this from code that cannot be async (e.g. cost-estimation fallback).
 */
export function getCachedPriceDatabase(): PriceWorkItem[] | null {
  return _cachedItems;
}

/**
 * Get the full Price database (async, cached after first load)
 */
export async function getPriceMatcherDatabase(): Promise<PriceWorkItem[]> {
  if (_cachedItems) return _cachedItems;

  const scrapedData = await loadScrapedData();

  if (scrapedData && scrapedData.items.length > 0) {
    _cachedItems = scrapedData.items.flatMap(convertToWorkItems);
    return _cachedItems;
  }

  console.warn('[price-db-loader] No scraped data available, returning empty database');
  return [];
}

/**
 * Refresh the matcher database (call after scraping)
 */
export async function refreshMatcherDatabase(): Promise<PriceWorkItem[]> {
  _cachedItems = null;
  return getPriceMatcherDatabase();
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const db = await getPriceMatcherDatabase();

  const byArea = new Map<RegulationArea, number>();
  const byChapter = new Map<string, number>();
  let withBreakdown = 0;
  let rehabItems = 0;

  for (const item of db) {
    // Count by area
    for (const area of item.areas) {
      byArea.set(area, (byArea.get(area) || 0) + 1);
    }

    // Count by chapter (top level)
    const topChapter = item.chapter.split('>')[0].trim();
    byChapter.set(topChapter, (byChapter.get(topChapter) || 0) + 1);

    // Count breakdowns
    if (item.breakdown.materials > 0 || item.breakdown.labor > 0 || item.breakdown.machinery > 0) {
      withBreakdown++;
    }

    // Count rehab items
    if (item.isRehab) {
      rehabItems++;
    }
  }

  return {
    totalItems: db.length,
    withBreakdown,
    rehabItems,
    byArea: Object.fromEntries(byArea),
    byChapter: Object.fromEntries(byChapter),
    topChapters: Array.from(byChapter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([chapter, count]) => ({ chapter, count })),
  };
}

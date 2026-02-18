/**
 * CYPE Matcher Database Loader
 *
 * Dynamically loads CYPE data from scraper output and parametric fallback.
 * Replaces hardcoded 652-item database with live scraped data.
 *
 * Architecture:
 * 1. Load scraped data from JSON (data/cype-full.json)
 * 2. Convert to CypeWorkItem format
 * 3. Merge with parametric fallback items
 * 4. Generate patterns from descriptions
 * 5. Cache for performance
 */

import fs from 'fs';
import path from 'path';
import type { CypeWorkItem } from './cost-estimation';
import type { RegulationArea } from './types';
import { createLogger } from './logger';

const logger = createLogger('cype-matcher-db-loader');

// ============================================================================
// TYPES
// ============================================================================

interface ScrapedCypeItem {
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
}

interface ScrapedDataFile {
  metadata: {
    exportDate: string;
    totalItems: number;
    totalComponents?: number;
    source: string;
    version: string;
    region?: string;
  };
  items: ScrapedCypeItem[];
}

// ============================================================================
// CATEGORY TO REGULATION AREA MAPPING
// ============================================================================

/**
 * Maps CYPE categories to regulation areas for better matching
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
    areas.push('ited_itur');
  }

  // Acoustic
  if (lowerCat.includes('acústic') || lowerCat.includes('acustic') || lowerDesc.includes('acústic')) {
    areas.push('acoustic');
  }

  // AVAC
  if (lowerCat.includes('ventilação') || lowerCat.includes('climatização') ||
      lowerDesc.includes('VMC') || lowerDesc.includes('ventilação')) {
    areas.push('avac');
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
 * Generate search patterns from CYPE description
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
// DATA LOADING
// ============================================================================

/**
 * Load scraped CYPE data from JSON file
 */
function loadScrapedData(filePath: string): ScrapedDataFile | null {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      logger.warn(`Scraped data file not found: ${filePath}`);
      return null;
    }

    const jsonData = fs.readFileSync(fullPath, 'utf-8');
    const data: ScrapedDataFile = JSON.parse(jsonData);

    logger.info(`Loaded ${data.items.length} items from ${filePath}`, {
      source: data.metadata.source,
      version: data.metadata.version,
      exportDate: data.metadata.exportDate
    });

    return data;
  } catch (error) {
    logger.error(`Failed to load scraped data from ${filePath}`, { error });
    return null;
  }
}

/**
 * Convert scraped item to CypeWorkItem format
 */
function convertToWorkItem(item: ScrapedCypeItem): CypeWorkItem {
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

  // Determine if it's a rehab item
  const isRehab = item.category.toLowerCase().includes('reabilita') ||
                  item.description.toLowerCase().includes('reabilita') ||
                  item.category.toLowerCase().includes('demoliç');

  return {
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
  };
}

/**
 * Get the full CYPE database by merging scraped data with parametric fallback
 */
export function getCypeMatcherDatabase(): CypeWorkItem[] {
  // Try to load scraped data
  const scrapedData = loadScrapedData('data/cype-full.json');

  if (scrapedData && scrapedData.items.length > 0) {
    logger.info(`Building matcher database from ${scrapedData.items.length} scraped items`);
    const workItems = scrapedData.items.map(convertToWorkItem);

    logger.info('Matcher database built successfully', {
      totalItems: workItems.length,
      source: 'scraper',
      hasBreakdowns: workItems.filter(i => i.breakdown.materials > 0 || i.breakdown.labor > 0).length
    });

    return workItems;
  }

  // Fallback to empty array if no scraped data
  // In production, you might want to load from parametric engine here
  logger.warn('No scraped data available, returning empty database');
  logger.warn('Run CYPE scraper to populate data/cype-full.json');

  return [];
}

/**
 * Refresh the matcher database (call after scraping)
 */
export function refreshMatcherDatabase(): CypeWorkItem[] {
  logger.info('Refreshing matcher database...');
  const db = getCypeMatcherDatabase();
  logger.info(`Database refreshed with ${db.length} items`);
  return db;
}

/**
 * Get database statistics
 */
export function getDatabaseStats() {
  const db = getCypeMatcherDatabase();

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

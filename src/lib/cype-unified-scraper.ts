/**
 * 🚀 CYPE Unified Scraper
 *
 * Combines best of V1 + V2 with major improvements:
 * - Cheerio HTML parsing (robust, no regex)
 * - Adaptive backoff & circuit breaker
 * - Full breakdown extraction
 * - Variant detection
 * - Progress tracking
 *
 * Created: 2026-02-16
 */

import * as cheerio from 'cheerio';
import type { CypeWorkItem } from './cost-estimation';
import { createLogger, logScraperActivity } from './logger';

// ============================================================================
// TYPES
// ============================================================================

export interface CypeItem {
  code: string;
  description: string;
  fullDescription?: string;
  category: string;
  unit: string;
  unitCost: number;
  totalCost?: number;
  url: string;
  breakdown?: CypeBreakdown;
  variants?: CypeVariant[];
  lastUpdated: Date;
}

export interface CypeBreakdown {
  materials: CypeComponent[];
  labor: CypeComponent[];
  machinery: CypeComponent[];
  materialCost: number;
  laborCost: number;
  machineryCost: number;
  totalCost: number;
}

export interface CypeComponent {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  type: 'material' | 'labor' | 'machinery';
}

export interface CypeVariant {
  name: string;
  code: string;
  unitCost: number;
  description?: string;
}

export interface ScraperConfig {
  baseUrl: string;
  rateLimit: number;
  maxRetries: number;
  maxDepth: number;
  typology: 'obra_nova' | 'reabilitacao' | 'espacos_urbanos';
  extractBreakdowns: boolean;
  extractVariants: boolean;
  enableCache: boolean;
  cacheTTL: number; // ms
}

export interface ScraperStats {
  itemsScraped: number;
  categoriesScraped: number;
  errors: number;
  retries: number;
  cacheHits: number;
  totalRequests: number;
  duration: number; // ms
}

// ============================================================================
// MAIN SCRAPER CLASS
// ============================================================================

export class CypeUnifiedScraper {
  private config: ScraperConfig;
  private results: Map<string, CypeItem>;
  private cache: Map<string, { data: string; timestamp: number }>;
  private stats: ScraperStats;
  private circuitBreaker: {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
  };
  private logger = createLogger('cype-unified-scraper');

  constructor(config?: Partial<ScraperConfig>) {
    this.config = {
      baseUrl: 'https://geradordeprecos.info',
      rateLimit: 1000, // 1s between requests (faster than V2's 3s)
      maxRetries: 5,
      maxDepth: 4,
      typology: 'obra_nova',
      extractBreakdowns: true,
      extractVariants: true,
      enableCache: true,
      cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };

    this.results = new Map();
    this.cache = new Map();
    this.stats = {
      itemsScraped: 0,
      categoriesScraped: 0,
      errors: 0,
      retries: 0,
      cacheHits: 0,
      totalRequests: 0,
      duration: 0,
    };
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    };
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Scrape all categories
   */
  async scrapeAll(onProgress?: (current: string, stats: ScraperStats) => void): Promise<CypeItem[]> {
    const startTime = Date.now();
    logScraperActivity('start', {});
    this.logger.info('Starting CYPE unified scraper');

    try {
      const categories = await this.getMainCategories();
      this.logger.info(`Found ${categories.length} main categories`);

      for (const category of categories) {
        if (onProgress) {
          onProgress(category.name, this.stats);
        }

        this.logger.info(`Scraping category: ${category.name}`);
        await this.scrapeCategory(category.url, category.name);
        await this.wait(this.config.rateLimit);
      }

      this.stats.duration = Date.now() - startTime;
      logScraperActivity('success', { duration: this.stats.duration });
      this.logger.info('Scraping complete', this.stats);

      return Array.from(this.results.values());
    } catch (error) {
      logScraperActivity('error', { error });
      this.logger.error('Fatal error during scraping', { error });
      throw error;
    }
  }

  /**
   * Scrape single item
   */
  async scrapeItem(url: string): Promise<CypeItem | null> {
    return this.extractItemDetails(url, 'unknown');
  }

  /**
   * Get current stats
   */
  getStats(): ScraperStats {
    return { ...this.stats };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  // =========================================================================
  // CORE SCRAPING LOGIC
  // =========================================================================

  private async getMainCategories(): Promise<Array<{ name: string; url: string }>> {
    const url = `${this.config.baseUrl}/${this.config.typology}`;
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const categories: Array<{ name: string; url: string }> = [];

    // Find navigation links (adjust selector based on actual HTML structure)
    $('a.nav-link, a[href*=".html"]').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim();

      if (href && text && href.includes(this.config.typology)) {
        const fullUrl = href.startsWith('http') ? href : `${this.config.baseUrl}/${href}`;
        categories.push({ name: text, url: fullUrl });
      }
    });

    return categories;
  }

  private async scrapeCategory(url: string, categoryName: string, depth: number = 0): Promise<void> {
    if (depth >= this.config.maxDepth) {
      this.logger.warn(`Max depth reached for category: ${categoryName}`, { depth, category: categoryName });
      return;
    }

    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    // Extract item links
    const itemLinks: string[] = [];
    $('a[href*=".html"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && !href.includes('index.html')) {
        const fullUrl = href.startsWith('http') ? href : `${this.config.baseUrl}/${href}`;
        itemLinks.push(fullUrl);
      }
    });

    this.logger.info(`Found ${itemLinks.length} potential items in ${categoryName}`, {
      category: categoryName,
      itemCount: itemLinks.length
    });

    // Extract each item
    for (const itemUrl of itemLinks) {
      const item = await this.extractItemDetails(itemUrl, categoryName);
      if (item) {
        this.results.set(item.code, item);
        this.stats.itemsScraped++;

        if (this.stats.itemsScraped % 10 === 0) {
          this.logger.info(`Extraction progress: ${this.stats.itemsScraped} items`, {
            itemsScraped: this.stats.itemsScraped
          });
        }
      }

      await this.wait(this.config.rateLimit);
    }

    this.stats.categoriesScraped++;
  }

  private async extractItemDetails(url: string, categoryName: string): Promise<CypeItem | null> {
    try {
      const html = await this.fetchWithRetry(url);
      const $ = cheerio.load(html);

      // Extract basic info using cheerio
      const code = this.extractCode($, html);
      const description = this.extractDescription($);
      const unit = this.extractUnit($);
      const unitCost = this.extractPrice($);

      if (!code || !description || !unitCost) {
        this.logger.warn('Skipping incomplete item', { url, hasCode: !!code, hasDescription: !!description, hasUnitCost: !!unitCost });
        return null;
      }

      const item: CypeItem = {
        code,
        description,
        fullDescription: this.extractFullDescription($),
        category: categoryName,
        unit: unit || 'Ud',
        unitCost,
        totalCost: unitCost,
        url,
        lastUpdated: new Date(),
      };

      // Extract breakdowns if enabled
      if (this.config.extractBreakdowns) {
        item.breakdown = this.extractBreakdown($) || undefined;
      }

      // Extract variants if enabled
      if (this.config.extractVariants) {
        item.variants = this.extractVariants($);
      }

      return item;
    } catch (error) {
      logScraperActivity('error', { url, error });
      this.logger.error('Error extracting item', { url, error });
      this.stats.errors++;
      return null;
    }
  }

  // =========================================================================
  // EXTRACTION HELPERS (using Cheerio - NO REGEX!)
  // =========================================================================

  private extractCode($: cheerio.CheerioAPI, html: string): string | null {
    // Try multiple strategies
    const codeFromMeta = $('meta[name="description"]').attr('content')?.match(/([A-Z]{3}\d{3})/)?.[1];
    const codeFromTitle = $('title').text().match(/([A-Z]{3}\d{3})/)?.[1];
    const codeFromH1 = $('h1').text().match(/([A-Z]{3}\d{3})/)?.[1];

    return codeFromMeta || codeFromTitle || codeFromH1 || null;
  }

  private extractDescription($: cheerio.CheerioAPI): string | null {
    const desc = $('h1').first().text().trim() ||
                 $('.description').first().text().trim() ||
                 $('meta[name="description"]').attr('content')?.split('-')[0]?.trim();

    return desc || null;
  }

  private extractFullDescription($: cheerio.CheerioAPI): string {
    return $('meta[name="description"]').attr('content')?.trim() || '';
  }

  private extractUnit($: cheerio.CheerioAPI): string {
    // Look for unit in common locations
    const unitText = $('.unit, .unidad, [class*="unit"]').first().text().trim();
    return unitText || this.inferUnit($('.description, h1').text());
  }

  private extractPrice($: cheerio.CheerioAPI): number | null {
    // Try multiple locations for price
    const priceSelectors = [
      '.price .value',
      '.total-cost',
      '[class*="price"]',
      '[class*="cost"]',
    ];

    for (const selector of priceSelectors) {
      const priceText = $(selector).first().text();
      const price = this.parsePrice(priceText);
      if (price) return price;
    }

    // Fallback to meta description
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    return this.parsePrice(metaDesc);
  }

  private extractBreakdown($: cheerio.CheerioAPI): CypeBreakdown | null {
    const materials: CypeComponent[] = [];
    const labor: CypeComponent[] = [];
    const machinery: CypeComponent[] = [];

    // Look for breakdown table
    $('table tr, .breakdown-row').each((_, row) => {
      const $row = $(row);
      const code = $row.find('.code, td:nth-child(1)').text().trim();
      const desc = $row.find('.description, td:nth-child(2)').text().trim();
      const unit = $row.find('.unit, td:nth-child(3)').text().trim();
      const qty = parseFloat($row.find('.quantity, td:nth-child(4)').text().replace(',', '.'));
      const unitPrice = this.parsePrice($row.find('.unit-price, td:nth-child(5)').text());
      const total = this.parsePrice($row.find('.total, td:nth-child(6)').text());

      if (code && desc && unitPrice && total) {
        const component: CypeComponent = {
          code,
          description: desc,
          unit: unit || 'Ud',
          quantity: qty || 1,
          unitPrice,
          total,
          type: this.inferComponentType(code, desc),
        };

        if (component.type === 'material') materials.push(component);
        else if (component.type === 'labor') labor.push(component);
        else machinery.push(component);
      }
    });

    if (materials.length === 0 && labor.length === 0 && machinery.length === 0) {
      return null;
    }

    const materialCost = materials.reduce((sum, m) => sum + m.total, 0);
    const laborCost = labor.reduce((sum, l) => sum + l.total, 0);
    const machineryCost = machinery.reduce((sum, m) => sum + m.total, 0);

    return {
      materials,
      labor,
      machinery,
      materialCost,
      laborCost,
      machineryCost,
      totalCost: materialCost + laborCost + machineryCost,
    };
  }

  private extractVariants($: cheerio.CheerioAPI): CypeVariant[] {
    const variants: CypeVariant[] = [];

    // Look for tabs, dropdowns, or multiple price rows
    $('.variant-tab, .variant-option, select option').each((_, element) => {
      const $el = $(element);
      const name = $el.text().trim();
      const code = $el.attr('data-code') || '';
      const priceText = $el.attr('data-price') || $el.find('.price').text();
      const unitCost = this.parsePrice(priceText);

      if (name && unitCost) {
        variants.push({ name, code, unitCost });
      }
    });

    return variants;
  }

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================

  private parsePrice(text: string | undefined): number | null {
    if (!text) return null;

    const match = text.match(/([\d.,]+)\s*€/);
    if (!match) return null;

    const numStr = match[1].replace('.', '').replace(',', '.');
    const num = parseFloat(numStr);

    return isNaN(num) ? null : num;
  }

  private inferUnit(text: string): string {
    const unitMap: Record<string, string> = {
      'metro': 'm',
      'metro quadrado': 'm²',
      'metro cúbico': 'm³',
      'unidade': 'Ud',
      'quilograma': 'kg',
      'litro': 'L',
    };

    const lowerText = text.toLowerCase();
    for (const [pattern, unit] of Object.entries(unitMap)) {
      if (lowerText.includes(pattern)) return unit;
    }

    return 'Ud';
  }

  private inferComponentType(code: string, description: string): 'material' | 'labor' | 'machinery' {
    const lowerDesc = description.toLowerCase();
    const lowerCode = code.toLowerCase();

    if (lowerCode.startsWith('mo') || lowerDesc.includes('mão de obra') || lowerDesc.includes('oficial')) {
      return 'labor';
    }

    if (lowerCode.startsWith('mq') || lowerDesc.includes('máquina') || lowerDesc.includes('equipamento')) {
      return 'machinery';
    }

    return 'material';
  }

  // =========================================================================
  // NETWORKING WITH ADAPTIVE BACKOFF & CIRCUIT BREAKER
  // =========================================================================

  private async fetchWithRetry(url: string, retries: number = 0): Promise<string> {
    // Check circuit breaker
    if (this.circuitBreaker.isOpen) {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
      if (timeSinceLastFailure < 60000) { // 1 minute cooldown
        throw new Error('Circuit breaker is open - too many failures');
      }
      // Reset circuit breaker after cooldown
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
    }

    // Check cache
    if (this.config.enableCache) {
      const cached = this.cache.get(url);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        this.stats.cacheHits++;
        logScraperActivity('cache_hit', { url });
        this.logger.debug('Cache hit', { url });
        return cached.data;
      }
    }

    this.stats.totalRequests++;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Success - reset circuit breaker
      this.circuitBreaker.failures = 0;

      // Cache result
      if (this.config.enableCache) {
        this.cache.set(url, { data: html, timestamp: Date.now() });
      }

      return html;
    } catch (error) {
      this.stats.errors++;
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailure = Date.now();

      // Open circuit breaker after 5 consecutive failures
      if (this.circuitBreaker.failures >= 5) {
        this.circuitBreaker.isOpen = true;
        this.logger.error('Circuit breaker opened due to too many failures', {
          failures: this.circuitBreaker.failures,
          lastFailure: new Date(this.circuitBreaker.lastFailure).toISOString()
        });
      }

      // Retry with exponential backoff
      if (retries < this.config.maxRetries) {
        this.stats.retries++;
        const delay = Math.min(1000 * (2 ** retries), 30000); // max 30s
        logScraperActivity('retry', { url, retryCount: retries + 1 });
        this.logger.warn(`Retry ${retries + 1}/${this.config.maxRetries} after ${delay}ms`, {
          url,
          retryCount: retries + 1,
          maxRetries: this.config.maxRetries,
          delay
        });
        await this.wait(delay);
        return this.fetchWithRetry(url, retries + 1);
      }

      this.logger.error(`Failed to fetch after ${this.config.maxRetries} retries`, {
        url,
        maxRetries: this.config.maxRetries,
        error
      });
      throw error;
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // =========================================================================
  // EXPORT UTILITIES
  // =========================================================================

  /**
   * Convert to CypeWorkItem format (for cost estimation)
   */
  toCypeWorkItems(): CypeWorkItem[] {
    return Array.from(this.results.values()).map((item) => ({
      code: item.code,
      description: item.description,
      chapter: item.category || "Outros",
      unit: item.unit,
      unitCost: item.unitCost,
      breakdown: item.breakdown ? {
        materials: item.breakdown.materialCost,
        labor: item.breakdown.laborCost,
        machinery: item.breakdown.machineryCost,
      } : { materials: 0, labor: 0, machinery: 0 },
      isRehab: false,
      areas: [],
      patterns: [],
    }));
  }

  /**
   * Export to JSON
   */
  toJSON() {
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        totalItems: this.results.size,
        totalComponents: Array.from(this.results.values()).reduce(
          (sum, item) => sum + (item.breakdown ?
            item.breakdown.materials.length +
            item.breakdown.labor.length +
            item.breakdown.machinery.length : 0
          ), 0
        ),
        source: 'geradordeprecos.info',
        version: 'unified-scraper-1.0',
        typology: this.config.typology,
        stats: this.stats,
      },
      items: Array.from(this.results.values()),
    };
  }
}

// ============================================================================
// CONVENIENCE EXPORT
// ============================================================================

export default CypeUnifiedScraper;

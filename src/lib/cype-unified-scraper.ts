/**
 * CYPE Unified Scraper
 *
 * Scrapes Portuguese construction prices from geradordeprecos.info
 * using Cheerio HTML parsing. Supports:
 * - Recursive category navigation (5 levels deep)
 * - Breakdown extraction (materials, labor, machinery)
 * - Adaptive backoff & circuit breaker
 * - In-memory caching with TTL
 * - Progress tracking
 */

import * as cheerio from "cheerio";
import type { CypeWorkItem } from "./cost-estimation";
import { createLogger, logScraperActivity } from "./logger";

// ============================================================================
// TYPES
// ============================================================================

export type CypeTypology = "obra_nova" | "reabilitacao" | "espacos_urbanos";

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
  lastUpdated: Date;
  typology: CypeTypology;
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
  type: "material" | "labor" | "machinery";
}

export interface ScraperConfig {
  baseUrl: string;
  /** Delay between requests in ms (default: 1500) */
  rateLimit: number;
  maxRetries: number;
  /** Max navigation depth from chapter level (default: 5) */
  maxDepth: number;
  typology: CypeTypology;
  extractBreakdowns: boolean;
  enableCache: boolean;
  cacheTTL: number;
}

export interface ScraperStats {
  itemsScraped: number;
  categoriesVisited: number;
  errors: number;
  retries: number;
  cacheHits: number;
  totalRequests: number;
  skippedDuplicates: number;
  duration: number;
}

export interface CategoryConfig {
  code: string;
  name: string;
  path: string;
  enabled: boolean;
  priority: number;
  status?: string;
}

/** Per-typology entry as loaded from v2 config. */
export interface TypologyConfig {
  id: CypeTypology;
  name: string;
  path: string;
  enabled: boolean;
  chapters: CategoryConfig[];
}

/**
 * Load and normalize scraper config from either v1 (flat) or v2 (per-typology) format.
 * Returns an array of TypologyConfig entries.
 */
export function loadScraperConfig(data: Record<string, unknown>): TypologyConfig[] {
  const version = String(data.version ?? "1.0");

  if (version.startsWith("2")) {
    // v2: per-typology chapters
    const typologies = data.typologies as Record<string, {
      name: string; path: string; enabled: boolean;
      chapters: CategoryConfig[];
    }>;
    return Object.entries(typologies).map(([id, t]) => ({
      id: id as CypeTypology,
      name: t.name,
      path: t.path,
      enabled: t.enabled,
      chapters: t.chapters,
    }));
  }

  // v1: flat chapters array, all belong to obra_nova
  const chapters = (data.chapters as CategoryConfig[]) ?? [];
  return [{
    id: "obra_nova" as CypeTypology,
    name: "Obra nova",
    path: "obra_nova",
    enabled: true,
    chapters,
  }];
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_CONFIG: ScraperConfig = {
  baseUrl: "https://geradordeprecos.info",
  rateLimit: 1500,
  maxRetries: 5,
  maxDepth: 5,
  typology: "obra_nova",
  extractBreakdowns: true,
  enableCache: true,
  cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
};

// ============================================================================
// MAIN SCRAPER CLASS
// ============================================================================

export class CypeUnifiedScraper {
  private config: ScraperConfig;
  private results: Map<string, CypeItem>;
  private visitedUrls: Set<string>;
  private cache: Map<string, { data: string; timestamp: number }>;
  private stats: ScraperStats;
  private circuitBreaker: {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
  };
  private logger = createLogger("cype-unified-scraper");
  private aborted = false;

  constructor(config?: Partial<ScraperConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.results = new Map();
    this.visitedUrls = new Set();
    this.cache = new Map();
    this.stats = {
      itemsScraped: 0,
      categoriesVisited: 0,
      errors: 0,
      retries: 0,
      cacheHits: 0,
      totalRequests: 0,
      skippedDuplicates: 0,
      duration: 0,
    };
    this.circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Scrape specific chapters by their URL paths.
   * If no chapters provided, scrapes all chapters found on the typology page.
   */
  async scrapeChapters(
    chapters?: CategoryConfig[],
    onProgress?: (message: string, stats: ScraperStats) => void,
  ): Promise<CypeItem[]> {
    const startTime = Date.now();
    logScraperActivity("start", {});
    this.logger.info("Starting CYPE scraper");

    try {
      const targets = chapters ?? (await this.discoverChapters());
      this.logger.info(`Scraping ${targets.length} chapters`);

      for (const chapter of targets) {
        if (this.aborted) break;
        if (!chapter.enabled) continue;

        const chapterUrl = `${this.config.baseUrl}/${this.config.typology}/${chapter.path}.html`;
        onProgress?.(`A processar: ${chapter.name}`, this.getStats());
        this.logger.info(`Scraping chapter: ${chapter.name} (${chapterUrl})`);

        await this.scrapeRecursive(chapterUrl, chapter.name, 0);
        await this.wait(this.config.rateLimit);
      }

      this.stats.duration = Date.now() - startTime;
      logScraperActivity("success", { duration: this.stats.duration });
      this.logger.info("Scraping complete", this.stats);

      return Array.from(this.results.values());
    } catch (error) {
      this.stats.duration = Date.now() - startTime;
      logScraperActivity("error", { error });
      this.logger.error("Fatal error during scraping", { error });
      throw error;
    }
  }

  /**
   * Scrape a single item by URL.
   */
  async scrapeItem(url: string): Promise<CypeItem | null> {
    let html: string;
    try {
      html = await this.fetchWithRetry(url);
    } catch {
      return null;
    }
    const $ = cheerio.load(html);
    return this.parseItemPage($, url, "unknown");
  }

  getStats(): ScraperStats {
    return { ...this.stats };
  }

  getResults(): CypeItem[] {
    return Array.from(this.results.values());
  }

  abort(): void {
    this.aborted = true;
    this.logger.warn("Scraper abort requested");
  }

  clearCache(): void {
    this.cache.clear();
  }

  // =========================================================================
  // RECURSIVE CRAWL
  // =========================================================================

  /**
   * Recursively navigate category pages and scrape items.
   *
   * Strategy:
   * - A page is an "item page" if it contains pricing data (€).
   * - Otherwise it's a navigation page — extract child links and recurse.
   */
  private async scrapeRecursive(
    url: string,
    categoryPath: string,
    depth: number,
  ): Promise<void> {
    if (this.aborted) return;
    if (depth > this.config.maxDepth) return;
    if (this.visitedUrls.has(url)) return;
    this.visitedUrls.add(url);

    let html: string;
    try {
      html = await this.fetchWithRetry(url);
    } catch {
      return; // Skip unreachable pages
    }

    const $ = cheerio.load(html);
    this.stats.categoriesVisited++;

    // Detect if this is an item detail page (has pricing)
    const isItemPage = this.detectItemPage($, html);

    if (isItemPage) {
      const item = this.parseItemPage($, url, categoryPath);
      if (item) {
        const dedupeKey = `${item.code}:${item.typology}`;
        if (!this.results.has(dedupeKey)) {
          this.results.set(dedupeKey, item);
          this.stats.itemsScraped++;

          if (this.stats.itemsScraped % 25 === 0) {
            this.logger.info(
              `Progress: ${this.stats.itemsScraped} items scraped`,
            );
          }
        } else {
          this.stats.skippedDuplicates++;
        }
      }
      return;
    }

    // Navigation page — find child links
    const childLinks = this.extractChildLinks($, url);

    for (const link of childLinks) {
      if (this.aborted) break;
      await this.scrapeRecursive(link.url, `${categoryPath} > ${link.text}`, depth + 1);
      await this.wait(this.config.rateLimit);
    }
  }

  // =========================================================================
  // PAGE DETECTION & PARSING
  // =========================================================================

  /**
   * Detect whether the current page is an item detail page.
   * Item pages have price information (€ symbol near a number).
   */
  private detectItemPage($: cheerio.CheerioAPI, _html: string): boolean {
    // Item pages contain a price display and typically a breakdown table
    // Check for price patterns: "XX,XX€" or "XX,XX €"
    const pricePattern = /\d+[.,]\d{2}\s*€/;

    // Check in h6 elements (common price location)
    let hasPrice = false;
    $("h6").each((_, el) => {
      if (pricePattern.test($(el).text())) hasPrice = true;
    });

    // Also check for breakdown table patterns
    if (!hasPrice) {
      const text = $("body").text();
      // Item pages have the unit-price-total pattern for breakdowns
      hasPrice = (text.match(/\d+[.,]\d{2}\s*€/g) || []).length >= 3;
    }

    return hasPrice;
  }

  /**
   * Parse an item detail page to extract structured data.
   */
  private parseItemPage(
    $: cheerio.CheerioAPI,
    url: string,
    categoryPath: string,
  ): CypeItem | null {
    try {
      // Extract code from URL (e.g., EHS010 from EHS010_Pilar...)
      const code = this.extractCodeFromUrl(url) ?? this.extractCodeFromPage($);
      if (!code) return null;

      // Extract description from page title / h1 / meta
      const description = this.extractDescription($);
      if (!description) return null;

      // Extract unit and price
      const unit = this.extractUnit($);
      const price = this.extractPrice($);
      if (!price) return null;

      const item: CypeItem = {
        code,
        description,
        fullDescription: this.extractFullDescription($),
        category: categoryPath.split(" > ").slice(-1)[0] || categoryPath,
        unit: unit || "Ud",
        unitCost: price,
        totalCost: price,
        url,
        lastUpdated: new Date(),
        typology: this.config.typology,
      };

      // Extract breakdown if enabled
      if (this.config.extractBreakdowns) {
        item.breakdown = this.extractBreakdown($) || undefined;
      }

      return item;
    } catch (error) {
      this.stats.errors++;
      this.logger.error("Error parsing item page", { url, error });
      return null;
    }
  }

  /**
   * Extract child navigation links from a category page.
   */
  private extractChildLinks(
    $: cheerio.CheerioAPI,
    currentUrl: string,
  ): Array<{ url: string; text: string }> {
    const links: Array<{ url: string; text: string }> = [];
    const currentPath = new URL(currentUrl).pathname;
    const baseDir = currentPath.replace(/\/[^/]*\.html$/, "");

    const baseHost = new URL(this.config.baseUrl).hostname;

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href || !text || text.length < 2) return;

      // Only follow .html links within the current typology
      if (!href.endsWith(".html")) return;
      if (href.includes("index.html")) return;

      // Build absolute URL
      let fullUrl: string;
      if (href.startsWith("http")) {
        // Reject links to other domains/subdomains (e.g. angola.geradordeprecos.info)
        try {
          const linkHost = new URL(href).hostname;
          if (linkHost !== baseHost) return;
        } catch { return; }
        fullUrl = href;
      } else if (href.startsWith("/")) {
        fullUrl = `${this.config.baseUrl}${href}`;
      } else {
        // Relative link — resolve against current page directory
        fullUrl = `${this.config.baseUrl}${baseDir}/${href}`;
      }

      // Must be within our typology
      if (!fullUrl.includes(`/${this.config.typology}/`)) return;

      // Skip already visited
      if (this.visitedUrls.has(fullUrl)) return;

      // Skip navigation back to parent categories
      const linkPath = new URL(fullUrl).pathname;
      if (linkPath.length <= currentPath.length && !linkPath.includes(baseDir.split("/").pop() || "")) return;

      // Skip links that go to other typologies
      if (
        fullUrl.includes("/reabilitacao/") && this.config.typology !== "reabilitacao" ||
        fullUrl.includes("/espacos_urbanos/") && this.config.typology !== "espacos_urbanos"
      ) return;

      links.push({ url: fullUrl, text });
    });

    // Deduplicate
    const seen = new Set<string>();
    return links.filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
  }

  // =========================================================================
  // EXTRACTION HELPERS
  // =========================================================================

  private extractCodeFromUrl(url: string): string | null {
    // Pattern: .../EHS010_Pilar_rectangular_... → EHS010
    const match = url.match(/\/([A-Z]{2,4}\d{3}[a-z]?)_/);
    return match ? match[1] : null;
  }

  private extractCodeFromPage($: cheerio.CheerioAPI): string | null {
    const codePattern = /\b([A-Z]{2,4}\d{3}[a-z]?)\b/;

    // Try title, h1, h2, meta description
    for (const selector of ["title", "h1", "h2", 'meta[name="description"]']) {
      const text =
        selector.startsWith("meta")
          ? $(selector).attr("content") || ""
          : $(selector).first().text();
      const match = text.match(codePattern);
      if (match) return match[1];
    }

    return null;
  }

  private extractDescription($: cheerio.CheerioAPI): string | null {
    // Try meta description first (most complete)
    const metaDesc = $('meta[name="description"]').attr("content")?.trim();
    if (metaDesc && metaDesc.length > 10) return metaDesc;

    // Try h1
    const h1 = $("h1").first().text().trim();
    if (h1 && h1.length > 10) return h1;

    // Try title (minus site name)
    const title = $("title").text().split("|")[0]?.trim();
    if (title && title.length > 10) return title;

    return null;
  }

  private extractFullDescription($: cheerio.CheerioAPI): string {
    return $('meta[name="description"]').attr("content")?.trim() || "";
  }

  private extractUnit($: cheerio.CheerioAPI): string {
    // Look for unit text near price — common patterns:
    // <p>m²</p>, <span class="unit">m</span>, text before €
    const unitPattern = /^(m[²³23]?|Ud|un|kg|t|h|l|conjunto|vg|sistema|projeto)$/i;

    // Check p elements adjacent to h6 (price heading)
    let unit = "";
    $("h6")
      .next("p")
      .each((_, el) => {
        const text = $(el).text().trim();
        if (unitPattern.test(text)) unit = text;
      });
    if (unit) return this.normalizeUnit(unit);

    // Check any small text blocks near prices
    $("p, span").each((_, el) => {
      const text = $(el).text().trim();
      if (unitPattern.test(text) && !unit) unit = text;
    });
    if (unit) return this.normalizeUnit(unit);

    // Infer from description
    const desc = $("h1").text().toLowerCase();
    if (desc.startsWith("m²") || desc.startsWith("m2 ")) return "m2";
    if (desc.startsWith("m³") || desc.startsWith("m3 ")) return "m3";
    if (desc.startsWith("m ") || desc.match(/^m\b/)) return "m";
    if (desc.startsWith("ud ") || desc.startsWith("Ud ")) return "Ud";
    if (desc.startsWith("kg ")) return "kg";

    return "Ud";
  }

  private extractPrice($: cheerio.CheerioAPI): number | null {
    // Primary: h6 element with price
    const h6Price = $("h6")
      .map((_, el) => this.parseEurPrice($(el).text()))
      .get()
      .find((p: number | null) => p !== null && p > 0);
    if (h6Price) return h6Price;

    // Fallback: any element with price pattern
    const allText = $("body").text();
    const match = allText.match(/(\d{1,6}[.,]\d{2})\s*€/);
    return match ? this.parseEurPrice(match[0]) : null;
  }

  private extractBreakdown($: cheerio.CheerioAPI): CypeBreakdown | null {
    const materials: CypeComponent[] = [];
    const labor: CypeComponent[] = [];
    const machinery: CypeComponent[] = [];

    // CYPE breakdown tables have rows with: code, unit, description, quantity, unitPrice, total
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 4) return;

      const code = $(cells[0]).text().trim();
      const cellTexts = cells.map((_, c) => $(c).text().trim()).get();

      // Skip header rows
      if (code === "Unitário" || code === "Código" || !code) return;

      // Parse the row — structure varies, try common patterns
      const desc = cellTexts[2] || cellTexts[1] || "";
      const unit = cellTexts[1] || "Ud";
      const qty = this.parseNumber(cellTexts[3]);
      const unitPrice = this.parseNumber(cellTexts[4]);
      const total = this.parseNumber(cellTexts[5] || cellTexts[cellTexts.length - 1]);

      if (!desc || total === null) return;

      const component: CypeComponent = {
        code,
        description: desc,
        unit,
        quantity: qty ?? 1,
        unitPrice: unitPrice ?? total,
        total,
        type: this.inferComponentType(code, desc),
      };

      switch (component.type) {
        case "material":
          materials.push(component);
          break;
        case "labor":
          labor.push(component);
          break;
        case "machinery":
          machinery.push(component);
          break;
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

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================

  private parseEurPrice(text: string): number | null {
    // Match: "11,23€" or "1.234,56 €" or "11.23€"
    const match = text.match(/([\d.,]+)\s*€/);
    if (!match) return null;

    // Portuguese format: 1.234,56 → 1234.56
    let numStr = match[1];
    if (numStr.includes(",")) {
      // Has comma → Portuguese format
      numStr = numStr.replace(/\./g, "").replace(",", ".");
    }

    const num = parseFloat(numStr);
    return isNaN(num) ? null : num;
  }

  private parseNumber(text: string | undefined): number | null {
    if (!text) return null;
    const cleaned = text.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  private normalizeUnit(unit: string): string {
    const map: Record<string, string> = {
      "m²": "m2",
      "m³": "m3",
      un: "Ud",
      unidade: "Ud",
      ud: "Ud",
      ton: "t",
      hora: "h",
      litro: "l",
      projecto: "projeto",
      cj: "conjunto",
    };
    return map[unit.toLowerCase()] || unit;
  }

  private inferComponentType(
    code: string,
    description: string,
  ): "material" | "labor" | "machinery" {
    const lowerDesc = description.toLowerCase();
    const lowerCode = code.toLowerCase();

    if (
      lowerCode.startsWith("mo") ||
      lowerDesc.includes("mão de obra") ||
      lowerDesc.includes("oficial") ||
      lowerDesc.includes("ajudante") ||
      lowerDesc.includes("pedreiro") ||
      lowerDesc.includes("servente")
    ) {
      return "labor";
    }

    if (
      lowerCode.startsWith("mq") ||
      lowerDesc.includes("máquina") ||
      lowerDesc.includes("equipamento") ||
      lowerDesc.includes("grua") ||
      lowerDesc.includes("betoneira") ||
      lowerDesc.includes("retroescavadora")
    ) {
      return "machinery";
    }

    return "material";
  }

  // =========================================================================
  // NETWORKING — ADAPTIVE BACKOFF & CIRCUIT BREAKER
  // =========================================================================

  private async fetchWithRetry(url: string, attempt = 0): Promise<string> {
    // Circuit breaker check
    if (this.circuitBreaker.isOpen) {
      const elapsed = Date.now() - this.circuitBreaker.lastFailure;
      if (elapsed < 60_000) {
        throw new Error("Circuit breaker open — too many failures");
      }
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
    }

    // Cache check
    if (this.config.enableCache) {
      const cached = this.cache.get(url);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        this.stats.cacheHits++;
        return cached.data;
      }
    }

    this.stats.totalRequests++;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Wallnut-CypeScraper/1.0 (construction-price-research)",
          "Accept-Language": "pt-PT,pt;q=0.9",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      this.circuitBreaker.failures = 0;

      if (this.config.enableCache) {
        this.cache.set(url, { data: html, timestamp: Date.now() });
      }

      return html;
    } catch (error) {
      this.stats.errors++;
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailure = Date.now();

      if (this.circuitBreaker.failures >= 5) {
        this.circuitBreaker.isOpen = true;
        this.logger.error("Circuit breaker opened", {
          failures: this.circuitBreaker.failures,
        });
      }

      if (attempt < this.config.maxRetries) {
        this.stats.retries++;
        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        logScraperActivity("retry", { url, retryCount: attempt + 1 });
        this.logger.warn(
          `Retry ${attempt + 1}/${this.config.maxRetries} after ${delay}ms`,
          { url },
        );
        await this.wait(delay);
        return this.fetchWithRetry(url, attempt + 1);
      }

      throw error;
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // =========================================================================
  // DISCOVERY
  // =========================================================================

  /**
   * Discover chapters from the typology index page.
   */
  private async discoverChapters(): Promise<CategoryConfig[]> {
    const url = `${this.config.baseUrl}/${this.config.typology}/`;
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);
    const chapters: CategoryConfig[] = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href || !text) return;
      if (!href.endsWith(".html")) return;
      if (!href.includes(this.config.typology)) return;

      // Extract path segment
      const pathMatch = href.match(
        new RegExp(`${this.config.typology}/([^/]+)\\.html`),
      );
      if (!pathMatch) return;

      chapters.push({
        code: text.charAt(0),
        name: text,
        path: pathMatch[1],
        enabled: true,
        priority: 2,
        status: "pending",
      });
    });

    return chapters;
  }

  // =========================================================================
  // EXPORT UTILITIES
  // =========================================================================

  toCypeWorkItems(): CypeWorkItem[] {
    return Array.from(this.results.values()).map((item) => ({
      code: item.code,
      description: item.description,
      chapter: item.category || "Outros",
      unit: item.unit,
      unitCost: item.unitCost,
      breakdown: item.breakdown
        ? {
            materials: item.breakdown.materialCost,
            labor: item.breakdown.laborCost,
            machinery: item.breakdown.machineryCost,
          }
        : { materials: 0, labor: 0, machinery: 0 },
      isRehab: item.typology === "reabilitacao",
      areas: [],
      patterns: [],
      typology: item.typology,
    }));
  }

  toJSON() {
    const items = Array.from(this.results.values());
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        totalItems: items.length,
        totalComponents: items.reduce(
          (sum, item) =>
            sum +
            (item.breakdown
              ? item.breakdown.materials.length +
                item.breakdown.labor.length +
                item.breakdown.machinery.length
              : 0),
          0,
        ),
        source: "geradordeprecos.info",
        version: "4.0-multi-typology",
        region: "Lisboa/Cascais",
        stats: this.stats,
        typologyCounts: {
          obra_nova: items.filter(i => i.typology === "obra_nova").length,
          reabilitacao: items.filter(i => i.typology === "reabilitacao").length,
          espacos_urbanos: items.filter(i => i.typology === "espacos_urbanos").length,
        },
      },
      items: items.map((item) => ({
        code: item.code,
        description: item.description,
        fullDescription: item.fullDescription,
        unit: item.unit,
        totalCost: item.unitCost,
        breakdown: item.breakdown
          ? [
              ...item.breakdown.materials,
              ...item.breakdown.labor,
              ...item.breakdown.machinery,
            ]
          : [],
        category: item.category,
        url: item.url,
        typology: item.typology,
      })),
    };
  }
}

export default CypeUnifiedScraper;

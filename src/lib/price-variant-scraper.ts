/**
 * Price Variant Scraper (Playwright)
 *
 * Uses headless Chromium to interact with the parametric configurator
 * at geradordeprecos.info. The site's `calculaprecio.asp` endpoint is
 * session-gated — direct HTTP requests return "Orden incorrecta" — so we
 * must drive a real browser session to select options and read updated prices.
 *
 * Usage:
 *   const scraper = new PriceVariantScraper();
 *   await scraper.init();
 *   const variants = await scraper.scrapeItemVariants(url, code, 'obra_nova');
 *   await scraper.close();
 */

import type { Browser, BrowserContext, Page } from "playwright";
import type { PriceTypology, PriceBreakdown, PriceComponent } from "./price-scraper";
import { createLogger } from "./logger";

const logger = createLogger("price-variant-scraper");

// ============================================================================
// TYPES
// ============================================================================

export interface PriceVariant {
  parentCode: string;
  variantId: string;
  parameters: Record<string, string>;
  description?: string;
  unit?: string;
  unitCost: number;
  breakdown?: PriceBreakdown;
}

export interface VariantPreset {
  label: string;
  axes: Record<string, string[]>;
  maxVariants: number;
}

export interface VariantPresetsFile {
  version: string;
  description: string;
  presets: Record<string, VariantPreset>;
  itemMappings: Record<string, string>;
}

export interface VariantScraperConfig {
  /** Delay between variant clicks in ms (default: 2000) */
  rateLimit: number;
  /** Max variants per item (default: 50) */
  maxVariantsPerItem: number;
  /** Navigation timeout in ms (default: 30000) */
  navigationTimeout: number;
  /** AJAX response timeout in ms (default: 15000) */
  ajaxTimeout: number;
  /** Headless mode (default: true) */
  headless: boolean;
}

const DEFAULT_CONFIG: VariantScraperConfig = {
  rateLimit: 2000,
  maxVariantsPerItem: 50,
  navigationTimeout: 30000,
  ajaxTimeout: 15000,
  headless: true,
};

// ============================================================================
// VARIANT ID GENERATION
// ============================================================================

/**
 * Generate a stable variant ID from parameter values.
 * e.g., { class: "C30/37", section: "30x30" } → "C30_37_30x30"
 */
export function generateVariantId(parameters: Record<string, string>): string {
  return Object.values(parameters)
    .map((v) => v.replace(/[/\\.,\s]+/g, "_").replace(/_+$/, ""))
    .join("_");
}

/**
 * Generate all combinations from preset axes, respecting maxVariants limit.
 * e.g., { section: ["25x25", "30x30"], class: ["C25/30"] }
 *   → [{ section: "25x25", class: "C25/30" }, { section: "30x30", class: "C25/30" }]
 */
export function generateCombinations(
  axes: Record<string, string[]>,
  maxVariants: number,
): Array<Record<string, string>> {
  const keys = Object.keys(axes);
  if (keys.length === 0) return [];

  const combos: Array<Record<string, string>> = [];

  function recurse(idx: number, current: Record<string, string>) {
    if (combos.length >= maxVariants) return;
    if (idx === keys.length) {
      combos.push({ ...current });
      return;
    }
    const key = keys[idx];
    for (const value of axes[key]) {
      if (combos.length >= maxVariants) return;
      current[key] = value;
      recurse(idx + 1, current);
    }
  }

  recurse(0, {});
  return combos;
}

// ============================================================================
// MAIN VARIANT SCRAPER
// ============================================================================

export class PriceVariantScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: VariantScraperConfig;
  private stats = {
    itemsProcessed: 0,
    variantsScraped: 0,
    errors: 0,
    skipped: 0,
  };

  constructor(config?: Partial<VariantScraperConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize Playwright browser.
   * Playwright must be installed: `npx playwright install chromium`
   */
  async init(): Promise<void> {
    // Dynamic import to keep playwright as optional dependency
    const { chromium } = await import("playwright");
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "pt-PT",
    });
    logger.info("Playwright browser initialized");
  }

  /**
   * Close browser and clean up.
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info("Playwright browser closed", { stats: this.stats });
  }

  getStats() {
    return { ...this.stats };
  }

  /**
   * Scrape parametric variants for a single item page.
   *
   * @param itemUrl   Full URL of the CYPE item page (e.g., .../EHS010_Pilar.html)
   * @param code      CYPE item code (e.g., "EHS010")
   * @param typology  Source typology
   * @param preset    Optional preset with specific parameter axes to try
   */
  async scrapeItemVariants(
    itemUrl: string,
    code: string,
    typology: PriceTypology,
    preset?: VariantPreset,
  ): Promise<PriceVariant[]> {
    if (!this.context) {
      throw new Error("Browser not initialized — call init() first");
    }

    const page = await this.context.newPage();
    const variants: PriceVariant[] = [];

    try {
      logger.info(`Scraping variants for ${code}`, { url: itemUrl, typology });

      // Navigate to item page
      await page.goto(itemUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.config.navigationTimeout,
      });

      // Wait for price display (h4 on current CYPE site, h6 on older layout)
      await page.waitForSelector("h4, h6", { timeout: 10000 }).catch(() => {
        logger.warn(`No h4/h6 price element found for ${code}`);
      });

      // Discover available configurator options on this page
      const pageOptions = await this.discoverOptions(page);

      if (pageOptions.length === 0) {
        logger.info(`No configurable options found for ${code}`);
        this.stats.skipped++;
        return [];
      }

      logger.info(`Found ${pageOptions.length} option groups for ${code}`, {
        groups: pageOptions.map((g) => g.label),
      });

      // Determine which combinations to scrape
      const combinations = preset
        ? generateCombinations(preset.axes, Math.min(preset.maxVariants, this.config.maxVariantsPerItem))
        : this.generateFromPageOptions(pageOptions);

      // Scrape each combination
      let scraped = 0;
      for (const combo of combinations) {
        if (scraped >= this.config.maxVariantsPerItem) break;

        try {
          const variant = await this.scrapeVariantCombination(page, code, combo);
          if (variant) {
            variants.push(variant);
            scraped++;
          }
        } catch (err) {
          this.stats.errors++;
          logger.warn(`Error scraping variant for ${code}`, {
            combo,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Rate limit between variants
        await this.delay(this.config.rateLimit);
      }

      this.stats.itemsProcessed++;
      this.stats.variantsScraped += variants.length;

      logger.info(`Scraped ${variants.length} variants for ${code}`);
    } catch (err) {
      this.stats.errors++;
      logger.error(`Failed to scrape variants for ${code}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await page.close();
    }

    return variants;
  }

  /**
   * Scrape variants for multiple items using preset mappings.
   */
  async scrapeMultiple(
    items: Array<{ url: string; code: string; typology: PriceTypology }>,
    presets: VariantPresetsFile,
    onProgress?: (message: string, stats: typeof this.stats) => void,
  ): Promise<Map<string, PriceVariant[]>> {
    const results = new Map<string, PriceVariant[]>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const presetName = presets.itemMappings[item.code];
      const preset = presetName ? presets.presets[presetName] : undefined;

      if (!preset) {
        logger.info(`No preset mapping for ${item.code}, skipping`);
        this.stats.skipped++;
        continue;
      }

      if (onProgress) {
        onProgress(
          `[${i + 1}/${items.length}] ${item.code} (${preset.label})`,
          this.stats,
        );
      }

      const variants = await this.scrapeItemVariants(
        item.url,
        item.code,
        item.typology,
        preset,
      );

      if (variants.length > 0) {
        results.set(item.code, variants);
      }
    }

    return results;
  }

  /**
   * Scrape variants for multiple items using AUTO-DISCOVERY (no presets needed).
   *
   * For each item, navigates to the page, discovers configurator options
   * automatically, generates combinations from the first few values of each
   * axis, and scrapes prices for each combination.
   *
   * This is the primary method for large-scale variant scraping — it covers
   * ALL items, not just the ~30 with manual preset mappings.
   */
  async scrapeMultipleAutoDiscover(
    items: Array<{ url: string; code: string; typology: PriceTypology }>,
    onProgress?: (message: string, stats: typeof this.stats) => void,
  ): Promise<Map<string, PriceVariant[]>> {
    const results = new Map<string, PriceVariant[]>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (onProgress) {
        onProgress(
          `[${i + 1}/${items.length}] ${item.code} (auto-discover)`,
          this.stats,
        );
      }

      // Pass no preset — scrapeItemVariants will auto-discover options
      const variants = await this.scrapeItemVariants(
        item.url,
        item.code,
        item.typology,
        undefined, // no preset → auto-discover from page DOM
      );

      if (variants.length > 0) {
        results.set(item.code, variants);
      }
    }

    return results;
  }

  // ==========================================================================
  // OPTION DISCOVERY
  // ==========================================================================

  private async discoverOptions(
    page: Page,
  ): Promise<Array<{ label: string; type: "select" | "link" | "button"; selector: string; values: string[] }>> {
    // Use string-based evaluate to completely bypass esbuild's __name decorator.
    //
    // All <select> elements on CYPE item pages are chapter navigation dropdowns,
    // NOT parametric variant selectors. We only extract calculaprecio buttons.
    //
    // Each button's onclick Valor parameter has structure: FIRST_SEG|...TAIL...
    // Buttons sharing the same tail belong to the same option axis.
    const result = await page.evaluate(`
      (function() {
        var groups = [];
        var allButtons = document.querySelectorAll("input[onclick*='calculaprecio']");
        if (allButtons.length === 0) return groups;

        var tailMap = {};
        for (var i = 0; i < allButtons.length; i++) {
          var btn = allButtons[i];
          var oc = btn.getAttribute("onclick") || "";
          var m = oc.match(/Valor=([^&'"\\)\\s]+)/);
          if (!m) continue;
          var valor = m[1];
          var pi = valor.indexOf("|");
          var fs = pi >= 0 ? valor.substring(0, pi) : valor;
          var tail = pi >= 0 ? valor.substring(pi + 1) : "";
          if (!tailMap[tail]) tailMap[tail] = [];
          tailMap[tail].push(fs);
        }

        var gIdx = 0;
        var tails = Object.keys(tailMap);
        for (var t = 0; t < tails.length; t++) {
          var tail = tails[t];
          var entries = tailMap[tail];
          if (entries.length <= 1) continue;
          var tp = tail.split("|");
          var lp = tp[tp.length - 1] || tp[tp.length - 2] || ("group_" + gIdx);
          var label = lp.replace(/:.*$/, "").replace(/_/g, " ").trim() || ("axis_" + gIdx);
          groups.push({ label: label, type: "button", selector: "input[onclick*='calculaprecio']", values: entries });
          gIdx++;
        }
        return groups;
      })()
    `);
    return result as Array<{ label: string; type: "select" | "link" | "button"; selector: string; values: string[] }>;
  }

  /**
   * Generate combinations from discovered page options (when no preset available).
   * Takes first 3 values from each discovered group, caps at maxVariantsPerItem.
   */
  private generateFromPageOptions(
    options: Array<{ label: string; values: string[] }>,
  ): Array<Record<string, string>> {
    const axes: Record<string, string[]> = {};
    for (const group of options) {
      axes[group.label] = group.values.slice(0, 3);
    }
    return generateCombinations(axes, this.config.maxVariantsPerItem);
  }

  // ==========================================================================
  // VARIANT SCRAPING
  // ==========================================================================

  /**
   * Apply a parameter combination on the page and read the resulting price.
   */
  private async scrapeVariantCombination(
    page: Page,
    code: string,
    parameters: Record<string, string>,
  ): Promise<PriceVariant | null> {
    // Apply each parameter selection
    for (const [key, value] of Object.entries(parameters)) {
      await this.selectOption(page, key, value);
    }

    // Wait for price update via AJAX (calculaprecio.asp)
    try {
      await page.waitForResponse(
        (resp) => resp.url().includes("calculaprecio"),
        { timeout: this.config.ajaxTimeout },
      );
      // Small extra wait for DOM to update after response
      await this.delay(500);
    } catch {
      // No AJAX observed — price might not have changed, or the page uses
      // a different mechanism. Try to read the price anyway.
      logger.debug(`No calculaprecio response for ${code}`, { parameters });
    }

    // Read updated price
    const priceData = await this.readPrice(page);
    if (!priceData || priceData.unitCost <= 0) {
      return null;
    }

    const variantId = generateVariantId(parameters);

    return {
      parentCode: code,
      variantId,
      parameters,
      description: priceData.description,
      unit: priceData.unit,
      unitCost: priceData.unitCost,
      breakdown: priceData.breakdown,
    };
  }

  /**
   * Select an option on the page by clicking the corresponding configurator button.
   *
   * In the CYPE configurator, options are `input[onclick*='calculaprecio']` buttons.
   * Each button's onclick contains a Valor= parameter like:
   *   "1|0_0_0_0|0|EHS010|ehs_altplant"
   *
   * The `key` parameter is the group label (derived from the Valor tail).
   * The `value` parameter is the first segment (option index) to select.
   *
   * We find the button whose Valor starts with `value|` and whose tail matches `key`.
   */
  private async selectOption(page: Page, key: string, value: string): Promise<void> {
    // Use string-based evaluate to completely bypass esbuild's __name decorator
    // injection, which breaks page.evaluate() in the browser context.
    const buttonClicked = await page.evaluate(`
      (function() {
        var k = ${JSON.stringify(key)};
        var v = ${JSON.stringify(value)};
        var buttons = document.querySelectorAll("input[onclick*='calculaprecio']");
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var onclick = btn.getAttribute("onclick") || "";
          var m = onclick.match(/Valor=([^&'"\\)\\s]+)/);
          if (!m) continue;
          var valor = m[1];
          var pi = valor.indexOf("|");
          if (pi < 0) continue;
          var fs = valor.substring(0, pi);
          var tail = valor.substring(pi + 1);
          if (fs !== v) continue;
          var tp = tail.split("|");
          var lp = tp[tp.length - 1] || tp[tp.length - 2] || "";
          var dl = lp.replace(/:.*$/, "").replace(/_/g, " ").trim();
          if (dl === k || tail.includes(k.replace(/ /g, "_"))) {
            btn.click();
            return true;
          }
        }
        var single = null, mc = 0;
        for (var j = 0; j < buttons.length; j++) {
          var b2 = buttons[j];
          var oc2 = b2.getAttribute("onclick") || "";
          var m2 = oc2.match(/Valor=([^&'"\\)\\s]+)/);
          if (!m2) continue;
          var v2 = m2[1];
          var pi2 = v2.indexOf("|");
          if (pi2 < 0) continue;
          if (v2.substring(0, pi2) === v) { single = b2; mc++; }
        }
        if (mc === 1 && single) { single.click(); return true; }
        return false;
      })()
    `) as boolean;

    if (buttonClicked) return;

    const linkClicked = await page.evaluate(`
      (function() {
        var v = ${JSON.stringify(value)};
        var links = document.querySelectorAll('.configurador a, .opciones a, [class*="variant"] a, [class*="opcion"] a, a');
        for (var i = 0; i < links.length; i++) {
          var t = links[i].textContent;
          if (t && t.trim().includes(v)) { links[i].click(); return true; }
        }
        return false;
      })()
    `) as boolean;

    if (!linkClicked) {
      logger.debug(`Could not find option "${key}=${value}" on page`);
    }
  }

  /**
   * Read the current price and breakdown from the page.
   */
  private async readPrice(
    page: Page,
  ): Promise<{ unitCost: number; unit?: string; description?: string; breakdown?: PriceBreakdown } | null> {
    // Use string-based evaluate to completely bypass esbuild's __name decorator.
    const result = await page.evaluate(`
      (function() {
        function parseEurNum(text) {
          if (!text) return 0;
          var m = text.match(/([\\d.,]+)\\s*€/);
          if (!m) return 0;
          var s = m[1];
          if (s.includes(",")) s = s.replace(/\\./g, "").replace(",", ".");
          var n = parseFloat(s);
          return isNaN(n) ? 0 : n;
        }
        function parseNum(text) {
          if (!text) return 0;
          var s = text.replace(/\\s/g, "").replace(/\\./g, "").replace(",", ".");
          var n = parseFloat(s);
          return isNaN(n) ? 0 : n;
        }
        function sumTotal(arr) {
          var s = 0;
          for (var i = 0; i < arr.length; i++) s += arr[i].total;
          return s;
        }

        var unitCost = 0;
        var priceElement = null;
        var h4s = document.querySelectorAll("h4");
        for (var i = 0; i < h4s.length; i++) {
          var p = parseEurNum(h4s[i].textContent);
          if (p > 0) { unitCost = p; priceElement = h4s[i]; break; }
        }
        if (unitCost <= 0) {
          var h6s = document.querySelectorAll("h6");
          for (var j = 0; j < h6s.length; j++) {
            var p2 = parseEurNum(h6s[j].textContent);
            if (p2 > 0) { unitCost = p2; priceElement = h6s[j]; break; }
          }
        }
        if (unitCost <= 0) return null;

        var unit = undefined;
        var unitPat = /^(m[²³23]?|Ud|un|kg|t|h|l|conjunto|vg|sistema|projeto)$/i;
        var ns = priceElement ? priceElement.nextElementSibling : null;
        if (ns && unitPat.test((ns.textContent || "").trim())) {
          unit = ns.textContent.trim();
        }

        var h1 = document.querySelector("h1");
        var meta = document.querySelector('meta[name="description"]');
        var rawDesc = (h1 ? h1.textContent.trim() : null) || (meta ? (meta.getAttribute("content") || "").trim() : null);
        var desc = rawDesc ? rawDesc.replace(/^[\\d.,]+\\s*€\\s*/, "").trim() : null;

        var materials = [], labor = [], machinery = [];
        var rows = document.querySelectorAll("table tr");
        for (var r = 0; r < rows.length; r++) {
          var cells = rows[r].querySelectorAll("td");
          if (cells.length < 4) continue;
          var code = (cells[0].textContent || "").trim();
          if (!code || code === "Unitário" || code === "Código") continue;
          if (/^(EN|NP)\s/i.test(code)) continue;
          if (/^\d{2}\s+\d{2}\s+\d{2}$/.test(code)) continue;
          if (/^Custo de /i.test(code)) continue;
          var hasTotal = false;
          for (var ct2 = 0; ct2 < cells.length; ct2++) { if (/^Total:/i.test((cells[ct2].textContent||"").trim())) hasTotal = true; }
          if (hasTotal) continue;
          var ct = [];
          for (var c = 0; c < cells.length; c++) ct.push((cells[c].textContent || "").trim());
          var total = parseNum(ct[5] || ct[ct.length - 1]);
          if (total === 0) continue;
          var lc = (code + " " + (ct[2] || "")).toLowerCase();
          var type = "material";
          if (lc.includes("oficial") || lc.includes("ajudante") || lc.includes("peão") || /^mo\\d/.test(lc)) type = "labor";
          else if (lc.includes("grua") || lc.includes("bomba") || lc.includes("máquina") || /^mq\\d/.test(lc)) type = "machinery";
          var comp = { code: code, description: ct[2]||ct[1]||"", unit: ct[1]||"Ud", quantity: parseNum(ct[3])||1, unitPrice: parseNum(ct[4])||total, total: total, type: type };
          if (type === "material") materials.push(comp);
          else if (type === "labor") labor.push(comp);
          else machinery.push(comp);
        }

        var breakdown = (materials.length > 0 || labor.length > 0 || machinery.length > 0)
          ? { materials: materials, labor: labor, machinery: machinery,
              materialCost: sumTotal(materials), laborCost: sumTotal(labor), machineryCost: sumTotal(machinery),
              totalCost: sumTotal(materials) + sumTotal(labor) + sumTotal(machinery) }
          : undefined;

        return { unitCost: unitCost, unit: unit, description: desc, breakdown: breakdown };
      })()
    `);
    return result as { unitCost: number; unit?: string; description?: string; breakdown?: PriceBreakdown } | null;
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Load variant presets from a JSON file.
 */
export function loadVariantPresets(filePath: string): VariantPresetsFile {
  // Dynamic require for Node.js — works in CLI scripts
  const fs = require("fs") as typeof import("fs");
  const data = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(data) as VariantPresetsFile;
}

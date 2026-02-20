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
    // NOTE: Inside page.evaluate(), we use plain `function` declarations
    // to avoid esbuild's `__name` decorator which doesn't exist in the browser.
    return page.evaluate(function() {
      var groups: Array<{
        label: string;
        type: "select" | "link" | "button";
        selector: string;
        values: string[];
      }> = [];

      // NOTE: All <select> elements on CYPE item pages are chapter navigation
      // dropdowns (e.g., "Trabalhos prévios", "Demolições", "Estruturas").
      // They are NOT parametric variant selectors. We intentionally skip them.

      // The CYPE configurator uses <input> elements with onclick handlers
      // that call calculaprecio() to recalculate prices for each option.
      //
      // Each button's onclick contains a Valor= parameter like:
      //   "1|0_0_0_0|0|EHS010|ehs_altplant"
      //
      // The first segment (before the first |) is the option index within a group.
      // The "tail" (everything after the first |) identifies the option GROUP/AXIS.
      // Buttons with the same tail belong to the same axis (user picks one).
      //
      // We group buttons by tail and return each group as a separate option axis.

      var allButtons = Array.from(
        document.querySelectorAll<HTMLInputElement>("input[onclick*='calculaprecio']"),
      );

      if (allButtons.length === 0) return groups;

      // Extract Valor from each button and group by tail
      var tailGroups = new Map<string, Array<{ firstSeg: string; parentId: string }>>();

      for (var i = 0; i < allButtons.length; i++) {
        var btn = allButtons[i];
        var onclick = btn.getAttribute("onclick") || "";
        var valorMatch = onclick.match(/Valor=([^&'")\s]+)/);
        if (!valorMatch) continue;

        var valor = valorMatch[1];
        var pipeIdx = valor.indexOf("|");
        var firstSeg = pipeIdx >= 0 ? valor.substring(0, pipeIdx) : valor;
        var tail = pipeIdx >= 0 ? valor.substring(pipeIdx + 1) : "";

        if (!tailGroups.has(tail)) tailGroups.set(tail, []);
        tailGroups.get(tail)!.push({
          firstSeg: firstSeg,
          parentId: btn.closest("[id]")?.id || "unknown",
        });
      }

      // Only include groups with >1 option (a single button = no real choice)
      var groupIdx = 0;
      for (var [tail, entries] of tailGroups) {
        if (entries.length <= 1) continue;

        // The "values" for each option are the first segments (option indices)
        var values: string[] = [];
        for (var j = 0; j < entries.length; j++) {
          values.push(entries[j].firstSeg);
        }

        // Derive a label from the tail (last code segment is most descriptive)
        var tailParts = tail.split("|");
        var labelPart = tailParts[tailParts.length - 1] || tailParts[tailParts.length - 2] || "group_" + groupIdx;
        var label = labelPart.replace(/:.*$/, "").replace(/_/g, " ").trim();

        groups.push({
          label: label || "axis_" + groupIdx,
          type: "button" as const,
          selector: "input[onclick*='calculaprecio']",
          values: values,
        });

        groupIdx++;
      }

      return groups;
    });
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
    // Primary: find calculaprecio button by Valor first segment + tail label match
    // NOTE: use `function` form to avoid esbuild __name decorator in browser context
    const buttonClicked = await page.evaluate(
      function(args: { key: string; value: string }) {
        var k = args.key;
        var v = args.value;
        var buttons = document.querySelectorAll<HTMLInputElement>(
          "input[onclick*='calculaprecio']",
        );

        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var onclick = btn.getAttribute("onclick") || "";
          var valorMatch = onclick.match(/Valor=([^&'")\s]+)/);
          if (!valorMatch) continue;

          var valor = valorMatch[1];
          var pipeIdx = valor.indexOf("|");
          if (pipeIdx < 0) continue;

          var firstSeg = valor.substring(0, pipeIdx);
          var tail = valor.substring(pipeIdx + 1);

          // Match by first segment (the option index)
          if (firstSeg !== v) continue;

          // Match by tail — the group label is derived from the tail's last segment
          var tailParts = tail.split("|");
          var labelPart = tailParts[tailParts.length - 1] || tailParts[tailParts.length - 2] || "";
          var derivedLabel = labelPart.replace(/:.*$/, "").replace(/_/g, " ").trim();

          if (derivedLabel === k || tail.includes(k.replace(/ /g, "_"))) {
            btn.click();
            return true;
          }
        }

        // Fallback: if only one button has this first segment, click it regardless of tail
        var singleMatch: HTMLInputElement | null = null;
        var matchCount = 0;
        for (var j = 0; j < buttons.length; j++) {
          var btn2 = buttons[j];
          var onclick2 = btn2.getAttribute("onclick") || "";
          var valorMatch2 = onclick2.match(/Valor=([^&'")\s]+)/);
          if (!valorMatch2) continue;

          var valor2 = valorMatch2[1];
          var pipeIdx2 = valor2.indexOf("|");
          if (pipeIdx2 < 0) continue;

          var firstSeg2 = valor2.substring(0, pipeIdx2);
          if (firstSeg2 === v) {
            singleMatch = btn2;
            matchCount++;
          }
        }

        if (matchCount === 1 && singleMatch) {
          singleMatch.click();
          return true;
        }

        return false;
      },
      { key, value },
    );

    if (buttonClicked) return;

    // Legacy fallback: try clicking a variant link containing the value text
    const linkClicked = await page.evaluate(function(v: string) {
      var links = document.querySelectorAll(
        '.configurador a, .opciones a, [class*="variant"] a, [class*="opcion"] a, a',
      );
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        if (link.textContent?.trim().includes(v)) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, value);

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
    // NOTE: Inside page.evaluate(), we must use plain `function` declarations
    // (not arrow functions or interfaces) because esbuild/tsx injects a `__name`
    // decorator on `const fn = () => {}` forms, and that decorator doesn't exist
    // in the browser's evaluation context.
    return page.evaluate(() => {
      // Helper: parse a European-format price string like "1.234,56 €" → 1234.56
      function parseEurNum(text: string | null | undefined): number {
        if (!text) return 0;
        const match = text.match(/([\d.,]+)\s*€/);
        if (!match) return 0;
        let numStr = match[1];
        if (numStr.includes(",")) {
          numStr = numStr.replace(/\./g, "").replace(",", ".");
        }
        const parsed = parseFloat(numStr);
        return isNaN(parsed) ? 0 : parsed;
      }

      function parseNum(text: string | undefined): number {
        if (!text) return 0;
        const cleaned = text.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
      }

      // Primary: h4 elements (current CYPE site uses h4 for the actual unit price)
      let unitCost = 0;
      let priceElement: Element | null = null;
      const h4Elements = document.querySelectorAll("h4");
      for (const h4 of h4Elements) {
        const parsed = parseEurNum(h4.textContent);
        if (parsed > 0) {
          unitCost = parsed;
          priceElement = h4;
          break;
        }
      }

      // Fallback: h6 elements (older CYPE layout)
      if (unitCost <= 0) {
        const h6Elements = document.querySelectorAll("h6");
        for (const h6 of h6Elements) {
          const parsed = parseEurNum(h6.textContent);
          if (parsed > 0) {
            unitCost = parsed;
            priceElement = h6;
            break;
          }
        }
      }

      if (unitCost <= 0) return null;

      // Extract unit
      let unit: string | undefined;
      const unitPattern = /^(m[²³23]?|Ud|un|kg|t|h|l|conjunto|vg|sistema|projeto)$/i;
      const nextSibling = priceElement?.nextElementSibling;
      if (nextSibling && unitPattern.test(nextSibling.textContent?.trim() || "")) {
        unit = nextSibling.textContent?.trim();
      }

      // Extract description from h1 or meta
      const desc =
        document.querySelector("h1")?.textContent?.trim() ||
        document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim();

      // Extract breakdown from table
      // Using 'any' for the array type since page.evaluate runs in the browser
      // and the PriceBreakdown/PriceComponent types don't exist there.
      const materials: any[] = [];
      const labor: any[] = [];
      const machinery: any[] = [];

      document.querySelectorAll("table tr").forEach(function(row) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) return;

        const codeText = cells[0]?.textContent?.trim() || "";
        if (!codeText || codeText === "Unitário" || codeText === "Código") return;

        const cellTexts = Array.from(cells).map(function(c) { return c.textContent?.trim() || ""; });
        const total = parseNum(cellTexts[5] || cellTexts[cellTexts.length - 1]);
        if (total === 0) return;

        // Infer type from code/description
        const lc = (codeText + " " + (cellTexts[2] || "")).toLowerCase();
        let type = "material";
        if (lc.includes("oficial") || lc.includes("ajudante") || lc.includes("peão") || lc.match(/^mo\d/)) {
          type = "labor";
        } else if (lc.includes("grua") || lc.includes("bomba") || lc.includes("máquina") || lc.match(/^mq\d/)) {
          type = "machinery";
        }

        const comp = {
          code: codeText,
          description: cellTexts[2] || cellTexts[1] || "",
          unit: cellTexts[1] || "Ud",
          quantity: parseNum(cellTexts[3]) || 1,
          unitPrice: parseNum(cellTexts[4]) || total,
          total,
          type,
        };

        if (type === "material") materials.push(comp);
        else if (type === "labor") labor.push(comp);
        else machinery.push(comp);
      });

      function sumTotal(arr: any[]): number {
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i].total;
        return s;
      }

      const breakdown =
        materials.length > 0 || labor.length > 0 || machinery.length > 0
          ? {
              materials,
              labor,
              machinery,
              materialCost: sumTotal(materials),
              laborCost: sumTotal(labor),
              machineryCost: sumTotal(machinery),
              totalCost: sumTotal(materials) + sumTotal(labor) + sumTotal(machinery),
            }
          : undefined;

      return { unitCost, unit, description: desc, breakdown };
    });
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

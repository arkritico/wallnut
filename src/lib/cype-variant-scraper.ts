/**
 * CYPE Variant Scraper (Playwright)
 *
 * Uses headless Chromium to interact with the CYPE parametric configurator
 * at geradordeprecos.info. The site's `calculaprecio.asp` endpoint is
 * session-gated — direct HTTP requests return "Orden incorrecta" — so we
 * must drive a real browser session to select options and read updated prices.
 *
 * Usage:
 *   const scraper = new CypeVariantScraper();
 *   await scraper.init();
 *   const variants = await scraper.scrapeItemVariants(url, code, 'obra_nova');
 *   await scraper.close();
 */

import type { Browser, BrowserContext, Page } from "playwright";
import type { CypeTypology, CypeBreakdown, CypeComponent } from "./cype-unified-scraper";
import { createLogger } from "./logger";

const logger = createLogger("cype-variant-scraper");

// ============================================================================
// TYPES
// ============================================================================

export interface CypeVariant {
  parentCode: string;
  variantId: string;
  parameters: Record<string, string>;
  description?: string;
  unit?: string;
  unitCost: number;
  breakdown?: CypeBreakdown;
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

export class CypeVariantScraper {
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
    typology: CypeTypology,
    preset?: VariantPreset,
  ): Promise<CypeVariant[]> {
    if (!this.context) {
      throw new Error("Browser not initialized — call init() first");
    }

    const page = await this.context.newPage();
    const variants: CypeVariant[] = [];

    try {
      logger.info(`Scraping variants for ${code}`, { url: itemUrl, typology });

      // Navigate to item page
      await page.goto(itemUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.config.navigationTimeout,
      });

      // Wait for price display
      await page.waitForSelector("h6", { timeout: 10000 }).catch(() => {
        logger.warn(`No h6 price element found for ${code}`);
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
    items: Array<{ url: string; code: string; typology: CypeTypology }>,
    presets: VariantPresetsFile,
    onProgress?: (message: string, stats: typeof this.stats) => void,
  ): Promise<Map<string, CypeVariant[]>> {
    const results = new Map<string, CypeVariant[]>();

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

  // ==========================================================================
  // OPTION DISCOVERY
  // ==========================================================================

  private async discoverOptions(
    page: Page,
  ): Promise<Array<{ label: string; type: "select" | "link"; selector: string; values: string[] }>> {
    return page.evaluate(() => {
      const groups: Array<{
        label: string;
        type: "select" | "link";
        selector: string;
        values: string[];
      }> = [];

      // Find <select> elements (dropdowns for parameters)
      document.querySelectorAll("select").forEach((sel, idx) => {
        const options = Array.from(sel.options)
          .filter((o) => o.value && o.value !== "" && !o.disabled)
          .map((o) => o.text.trim() || o.value);

        if (options.length >= 2) {
          const label =
            sel.getAttribute("aria-label") ||
            sel.getAttribute("title") ||
            sel.previousElementSibling?.textContent?.trim() ||
            `option_${idx}`;
          groups.push({
            label,
            type: "select",
            selector: `select:nth-of-type(${idx + 1})`,
            values: options,
          });
        }
      });

      // Find clickable variant links (often <a> tags within configurator sections)
      const variantContainers = document.querySelectorAll(
        '.configurador a, .opciones a, [class*="variant"] a, [class*="opcion"] a',
      );
      if (variantContainers.length >= 2) {
        const values = Array.from(variantContainers).map(
          (a) => a.textContent?.trim() || "",
        ).filter(Boolean);

        groups.push({
          label: "variant_links",
          type: "link",
          selector: '.configurador a, .opciones a, [class*="variant"] a, [class*="opcion"] a',
          values,
        });
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
  ): Promise<CypeVariant | null> {
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
   * Select an option on the page — either via <select> dropdown or clicking a link.
   */
  private async selectOption(page: Page, key: string, value: string): Promise<void> {
    // Try select dropdown first
    const selectHandled = await page.evaluate(
      ({ key: k, value: v }) => {
        const selects = document.querySelectorAll("select");
        for (const sel of selects) {
          const label =
            sel.getAttribute("aria-label") ||
            sel.getAttribute("title") ||
            sel.previousElementSibling?.textContent?.trim() ||
            "";
          if (label.includes(k) || sel.name?.includes(k)) {
            for (const opt of sel.options) {
              if (opt.text.trim().includes(v) || opt.value.includes(v)) {
                sel.value = opt.value;
                sel.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
              }
            }
          }
        }
        return false;
      },
      { key, value },
    );

    if (selectHandled) return;

    // Try clicking a variant link containing the value text
    const linkClicked = await page.evaluate((v) => {
      const links = document.querySelectorAll(
        '.configurador a, .opciones a, [class*="variant"] a, [class*="opcion"] a, a',
      );
      for (const link of links) {
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
  ): Promise<{ unitCost: number; unit?: string; description?: string; breakdown?: CypeBreakdown } | null> {
    return page.evaluate(() => {
      // Extract price from h6 elements
      let unitCost = 0;
      const h6Elements = document.querySelectorAll("h6");
      for (const h6 of h6Elements) {
        const match = h6.textContent?.match(/([\d.,]+)\s*€/);
        if (match) {
          let numStr = match[1];
          if (numStr.includes(",")) {
            numStr = numStr.replace(/\./g, "").replace(",", ".");
          }
          const parsed = parseFloat(numStr);
          if (!isNaN(parsed) && parsed > 0) {
            unitCost = parsed;
            break;
          }
        }
      }

      if (unitCost <= 0) return null;

      // Extract unit
      let unit: string | undefined;
      const unitPattern = /^(m[²³23]?|Ud|un|kg|t|h|l|conjunto|vg|sistema|projeto)$/i;
      const h6Next = h6Elements[0]?.nextElementSibling;
      if (h6Next && unitPattern.test(h6Next.textContent?.trim() || "")) {
        unit = h6Next.textContent?.trim();
      }

      // Extract description from h1 or meta
      const desc =
        document.querySelector("h1")?.textContent?.trim() ||
        document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim();

      // Extract breakdown from table
      interface ComponentData {
        code: string;
        description: string;
        unit: string;
        quantity: number;
        unitPrice: number;
        total: number;
        type: "material" | "labor" | "machinery";
      }

      const materials: ComponentData[] = [];
      const labor: ComponentData[] = [];
      const machinery: ComponentData[] = [];

      document.querySelectorAll("table tr").forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) return;

        const codeText = cells[0]?.textContent?.trim() || "";
        if (!codeText || codeText === "Unitário" || codeText === "Código") return;

        const parseNum = (text: string | undefined): number => {
          if (!text) return 0;
          const cleaned = text.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
          const n = parseFloat(cleaned);
          return isNaN(n) ? 0 : n;
        };

        const cellTexts = Array.from(cells).map((c) => c.textContent?.trim() || "");
        const total = parseNum(cellTexts[5] || cellTexts[cellTexts.length - 1]);
        if (total === 0) return;

        // Infer type from code/description
        const lc = (codeText + " " + (cellTexts[2] || "")).toLowerCase();
        let type: "material" | "labor" | "machinery" = "material";
        if (lc.includes("oficial") || lc.includes("ajudante") || lc.includes("peão") || lc.match(/^mo\d/)) {
          type = "labor";
        } else if (lc.includes("grua") || lc.includes("bomba") || lc.includes("máquina") || lc.match(/^mq\d/)) {
          type = "machinery";
        }

        const comp: ComponentData = {
          code: codeText,
          description: cellTexts[2] || cellTexts[1] || "",
          unit: cellTexts[1] || "Ud",
          quantity: parseNum(cellTexts[3]) || 1,
          unitPrice: parseNum(cellTexts[4]) || total,
          total,
          type,
        };

        switch (type) {
          case "material": materials.push(comp); break;
          case "labor": labor.push(comp); break;
          case "machinery": machinery.push(comp); break;
        }
      });

      const breakdown: CypeBreakdown | undefined =
        materials.length > 0 || labor.length > 0 || machinery.length > 0
          ? {
              materials: materials as unknown as CypeBreakdown["materials"],
              labor: labor as unknown as CypeBreakdown["labor"],
              machinery: machinery as unknown as CypeBreakdown["machinery"],
              materialCost: materials.reduce((s, m) => s + m.total, 0),
              laborCost: labor.reduce((s, l) => s + l.total, 0),
              machineryCost: machinery.reduce((s, m) => s + m.total, 0),
              totalCost:
                materials.reduce((s, m) => s + m.total, 0) +
                labor.reduce((s, l) => s + l.total, 0) +
                machinery.reduce((s, m) => s + m.total, 0),
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

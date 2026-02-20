#!/usr/bin/env npx tsx
/**
 * Price Variant Coverage Scanner
 *
 * Pre-scans all items in data/price-db.json to discover which ones have
 * configurator buttons / variant options in their STATIC HTML. This allows
 * us to prioritise which items need Playwright-based variant scraping.
 *
 * No browser automation required -- plain HTTP fetch + Cheerio parsing.
 *
 * Usage:
 *   npx tsx scripts/scan-variant-coverage.ts
 *   npx tsx scripts/scan-variant-coverage.ts --limit 100      # Scan first N items only
 *   npx tsx scripts/scan-variant-coverage.ts --offset 500      # Start from item index 500
 *   npx tsx scripts/scan-variant-coverage.ts --rate-limit 1000 # ms between requests
 */

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ACCEPT_LANG = "pt-PT,pt;q=0.9";
const DEFAULT_RATE_LIMIT = 800; // ms between requests
const PROGRESS_INTERVAL = 50; // log every N items
const SECONDS_PER_VARIANT = 2; // estimate for Playwright scrape time

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceItem {
  code: string;
  url: string;
  description?: string;
  unit?: string;
  totalCost?: number;
  category?: string;
  typology?: string;
  [key: string]: unknown;
}

interface PriceDbJson {
  metadata: Record<string, unknown>;
  items: PriceItem[];
}

interface OptionGroup {
  label: string;
  type: "calculaprecio";
  optionCount: number;
  sampleValues: string[];
}

interface ScannedItem {
  code: string;
  url: string;
  hasVariants: boolean;
  optionGroups: OptionGroup[];
  totalCombinations: number;
  estimatedScrapeTime: number;
}

interface ScanReport {
  metadata: {
    scanDate: string;
    totalItems: number;
    itemsScanned: number;
    itemsWithVariants: number;
    itemsWithoutVariants: number;
    scanDurationSeconds: number;
    errors: number;
  };
  items: ScannedItem[];
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length
    ? process.argv[idx + 1]
    : undefined;
}

const RATE_LIMIT = parseInt(getArg("--rate-limit") || String(DEFAULT_RATE_LIMIT), 10);
const LIMIT = getArg("--limit") ? parseInt(getArg("--limit")!, 10) : undefined;
const OFFSET = parseInt(getArg("--offset") || "0", 10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": ACCEPT_LANG,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return resp.text();
}

/**
 * Extract the Valor= parameter from an onclick or href string.
 */
function extractValor(source: string): string | null {
  const m = source.match(/Valor=([^&'")\s]+)/);
  return m ? m[1] : null;
}

/**
 * Given a Valor string like "1|0_0_0_0|0|EHS010|ehs_altplant",
 * return the "tail" -- everything after the first `|`-delimited segment.
 * The first segment is the option index that varies within a group;
 * the tail identifies the group/axis.
 */
function valorTail(valor: string): string {
  const idx = valor.indexOf("|");
  return idx >= 0 ? valor.substring(idx + 1) : valor;
}

/**
 * Try to derive a human-readable label for an option group from its tail.
 * The tail looks like "0_0_0_0|0|EHS010|ehs_altplant" -- extract the item code portion.
 */
function groupLabel(tail: string): string {
  const parts = tail.split("|");
  // Usually the last 1-2 segments are the most descriptive
  if (parts.length >= 2) {
    const codePart = parts[parts.length - 1] || parts[parts.length - 2];
    return codePart.replace(/:.*$/, "").replace(/_/g, " ").trim() || tail.substring(0, 50);
  }
  return tail.substring(0, 50);
}

// ---------------------------------------------------------------------------
// Core scanner
// ---------------------------------------------------------------------------

function scanHtml(html: string, itemCode: string): { groups: OptionGroup[]; totalCombinations: number } {
  const $ = cheerio.load(html);

  const groups: OptionGroup[] = [];

  // ----- 1. Scan calculaprecio inputs and links -----
  const valorEntries: Array<{ valor: string; label: string }> = [];

  $("input[onclick*='calculaprecio'], a[href*='calculaprecio']").each((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    const href = $(el).attr("href") || "";
    const source = onclick || href;

    const valor = extractValor(source);
    if (!valor) return;

    // Derive a label from the element's value/text or parent context
    const elText =
      $(el).attr("value") ||
      $(el).text().trim() ||
      $(el).parent().text().trim().substring(0, 80);

    valorEntries.push({ valor, label: elText });
  });

  // Group by tail (everything after first pipe segment)
  const tailGroups = new Map<string, Array<{ valor: string; label: string }>>();
  for (const entry of valorEntries) {
    const tail = valorTail(entry.valor);
    if (!tailGroups.has(tail)) {
      tailGroups.set(tail, []);
    }
    tailGroups.get(tail)!.push(entry);
  }

  for (const [tail, entries] of tailGroups) {
    // Only count groups with more than 1 option (a single option means no real choice)
    if (entries.length <= 1) continue;

    const sampleValues = entries
      .slice(0, 5)
      .map((e) => {
        // Try to extract meaningful short label: the first pipe segment is the option index
        const firstSeg = e.valor.split("|")[0];
        // Clean the label to something short
        const cleanLabel = e.label
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 60);
        return cleanLabel || firstSeg;
      });

    groups.push({
      label: groupLabel(tail),
      type: "calculaprecio",
      optionCount: entries.length,
      sampleValues,
    });
  }

  // NOTE: All <select> elements on CYPE item pages are navigation dropdowns
  // (chapter / sub-chapter / item selectors), NOT parametric variant selects.
  // They always start with chapter codes like "Trabalhos prévios", "Demolições", etc.
  // We intentionally skip them — only calculaprecio buttons represent real variants.

  // ----- 3. Compute total combinations -----
  let totalCombinations = 0;
  if (groups.length > 0) {
    totalCombinations = groups.reduce((product, g) => product * g.optionCount, 1);
  }

  return { groups, totalCombinations };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dataDir = path.join(process.cwd(), "data");
  const inputPath = path.join(dataDir, "price-db.json");
  const outputPath = path.join(dataDir, "price-variant-scan.json");

  // Load input data
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const rawData: PriceDbJson = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const allItems = rawData.items;
  console.log(`Loaded ${allItems.length} items from price-db.json`);

  // Apply offset and limit
  let itemsToScan = allItems.slice(OFFSET);
  if (LIMIT !== undefined) {
    itemsToScan = itemsToScan.slice(0, LIMIT);
  }

  console.log(
    `Scanning ${itemsToScan.length} items (offset: ${OFFSET}, limit: ${LIMIT ?? "none"})`,
  );
  console.log(`Rate limit: ${RATE_LIMIT}ms between requests`);
  console.log(`Progress reported every ${PROGRESS_INTERVAL} items\n`);

  const startTime = Date.now();
  const results: ScannedItem[] = [];
  let errorCount = 0;
  let withVariants = 0;
  let withoutVariants = 0;

  for (let i = 0; i < itemsToScan.length; i++) {
    const item = itemsToScan[i];

    // Progress reporting
    if (i > 0 && i % PROGRESS_INTERVAL === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (i / ((Date.now() - startTime) / 1000)).toFixed(1);
      console.log(
        `[${i}/${itemsToScan.length}] ${elapsed}s elapsed | ` +
          `${withVariants} with variants | ${errorCount} errors | ${rate} items/s`,
      );
    }

    if (!item.url) {
      withoutVariants++;
      continue;
    }

    try {
      const html = await fetchPage(item.url);
      const { groups, totalCombinations } = scanHtml(html, item.code);

      if (groups.length > 0 && totalCombinations > 1) {
        withVariants++;
        results.push({
          code: item.code,
          url: item.url,
          hasVariants: true,
          optionGroups: groups,
          totalCombinations,
          estimatedScrapeTime: totalCombinations * SECONDS_PER_VARIANT,
        });
      } else {
        withoutVariants++;
      }
    } catch (err) {
      errorCount++;
      if (errorCount <= 10) {
        console.error(`  ERROR [${item.code}]: ${(err as Error).message}`);
      } else if (errorCount === 11) {
        console.error("  (suppressing further error messages)");
      }
    }

    // Rate limit (skip on last item)
    if (i < itemsToScan.length - 1) {
      await sleep(RATE_LIMIT);
    }
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);

  // Sort results by totalCombinations descending (most complex first)
  results.sort((a, b) => b.totalCombinations - a.totalCombinations);

  // Build report
  const report: ScanReport = {
    metadata: {
      scanDate: new Date().toISOString(),
      totalItems: allItems.length,
      itemsScanned: itemsToScan.length,
      itemsWithVariants: withVariants,
      itemsWithoutVariants: withoutVariants,
      scanDurationSeconds: durationSeconds,
      errors: errorCount,
    },
    items: results,
  };

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("SCAN COMPLETE");
  console.log(`${"=".repeat(60)}`);
  console.log(`  Total items in database:    ${allItems.length}`);
  console.log(`  Items scanned:              ${itemsToScan.length}`);
  console.log(`  Items WITH variants:        ${withVariants}`);
  console.log(`  Items WITHOUT variants:     ${withoutVariants}`);
  console.log(`  Errors:                     ${errorCount}`);
  console.log(`  Scan duration:              ${durationSeconds}s`);
  console.log(`  Output:                     ${outputPath}`);

  if (results.length > 0) {
    const totalCombos = results.reduce((sum, r) => sum + r.totalCombinations, 0);
    const totalEstTime = results.reduce((sum, r) => sum + r.estimatedScrapeTime, 0);
    const maxItem = results[0]; // already sorted descending

    console.log(`\n  --- Variant Statistics ---`);
    console.log(`  Total variant combinations: ${totalCombos.toLocaleString()}`);
    console.log(
      `  Estimated Playwright time:  ${Math.round(totalEstTime / 60)} min (${Math.round(totalEstTime / 3600)} hrs)`,
    );
    console.log(
      `  Most complex item:          ${maxItem.code} (${maxItem.totalCombinations.toLocaleString()} combos)`,
    );
    console.log(`  Avg combos per variant item: ${Math.round(totalCombos / results.length)}`);

    // Top 10 most complex
    console.log(`\n  --- Top 10 Most Complex Items ---`);
    for (const item of results.slice(0, 10)) {
      const axes = item.optionGroups.map((g) => `${g.optionCount}`).join(" x ");
      console.log(
        `  ${item.code.padEnd(10)} ${String(item.totalCombinations).padStart(6)} combos  (${axes})  ~${item.estimatedScrapeTime}s`,
      );
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error("FATAL:", (err as Error).message);
  process.exit(1);
});

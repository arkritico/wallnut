#!/usr/bin/env npx tsx
/**
 * Price Scraper CLI
 *
 * Usage:
 *   npx tsx scripts/scrape-prices.ts                           # Scrape all enabled typologies & chapters
 *   npx tsx scripts/scrape-prices.ts --typology reabilitacao   # Scrape only rehabilitation
 *   npx tsx scripts/scrape-prices.ts --chapters E,I,N          # Scrape specific chapters by code
 *   npx tsx scripts/scrape-prices.ts --validate                # Validate after scraping
 *   npx tsx scripts/scrape-prices.ts --merge                   # Merge with existing data
 *   npx tsx scripts/scrape-prices.ts --dry-run                 # Show what would be scraped
 */

import fs from "fs";
import path from "path";
import {
  PriceScraper,
  loadScraperConfig,
  type CategoryConfig,
  type PriceTypology,
  type TypologyConfig,
} from "../src/lib/price-scraper";
import { validateBatch } from "../src/lib/price-validator";
import { PriceVariantScraper, loadVariantPresets } from "../src/lib/price-variant-scraper";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = {
  chapters: getArg("--chapters"),
  typology: getArg("--typology") || "all", // "obra_nova", "reabilitacao", "espacos_urbanos", or "all"
  validate: args.includes("--validate"),
  merge: args.includes("--merge"),
  dryRun: args.includes("--dry-run"),
  withVariants: args.includes("--with-variants"),
  maxVariants: parseInt(getArg("--max-variants") || "50", 10),
  rateLimit: parseInt(getArg("--rate-limit") || "1500", 10),
  help: args.includes("--help") || args.includes("-h"),
};

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

if (flags.help) {
  console.log(`
Price Scraper

Usage:
  npx tsx scripts/scrape-prices.ts [options]

Options:
  --typology TYPE      Typology to scrape: obra_nova, reabilitacao, espacos_urbanos, all (default: all)
  --chapters E,I,N     Scrape only these chapter codes (default: all enabled)
  --validate           Run price validation after scraping
  --merge              Merge scraped items with existing price-db.json
  --with-variants      Scrape parametric variants with Playwright (slower, more items)
  --max-variants N     Max variants per item (default: 50)
  --dry-run            Show plan without scraping
  --rate-limit 2000    Delay between requests in ms (default: 1500)
  --help               Show this help
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Load category config
// ---------------------------------------------------------------------------

const configPath = path.join(process.cwd(), "data", "price-categories.config.json");

if (!fs.existsSync(configPath)) {
  console.error("Category config not found at data/price-categories.config.json");
  process.exit(1);
}

const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
let typologies: TypologyConfig[] = loadScraperConfig(configData);

// Filter by --typology flag
if (flags.typology !== "all") {
  typologies = typologies.filter((t) => t.id === flags.typology);
  if (typologies.length === 0) {
    console.error(`Unknown typology: ${flags.typology}`);
    console.error("Valid values: obra_nova, reabilitacao, espacos_urbanos, all");
    process.exit(1);
  }
}

// Only enabled typologies
typologies = typologies.filter((t) => t.enabled);

// Filter chapters within each typology
if (flags.chapters) {
  const codes = new Set(flags.chapters.split(",").map((c: string) => c.trim().toUpperCase()));
  for (const typo of typologies) {
    typo.chapters = typo.chapters.filter((c) => codes.has(c.code.toUpperCase()));
  }
  typologies = typologies.filter((t) => t.chapters.length > 0);
  if (typologies.length === 0) {
    console.error(`No matching chapters for: ${flags.chapters}`);
    process.exit(1);
  }
}

// Filter to enabled chapters only
for (const typo of typologies) {
  typo.chapters = typo.chapters.filter((c) => c.enabled);
}

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

if (flags.dryRun) {
  console.log("\n=== DRY RUN — Would scrape these typologies & chapters ===\n");
  let totalChapters = 0;
  for (const typo of typologies) {
    console.log(`  [${typo.id}] ${typo.name} (${typo.chapters.length} chapters)`);
    for (const cat of typo.chapters) {
      console.log(`    [${cat.code}] ${cat.name} (priority: ${cat.priority})`);
    }
    totalChapters += typo.chapters.length;
  }
  console.log(`\n  Typologies: ${typologies.length}`);
  console.log(`  Total chapters: ${totalChapters}`);
  console.log(`  Rate limit: ${flags.rateLimit}ms between requests`);
  console.log(`  Validate: ${flags.validate}`);
  console.log(`  Merge: ${flags.merge}`);
  console.log(`  With variants: ${flags.withVariants}`);
  if (flags.withVariants) {
    console.log(`  Max variants per item: ${flags.maxVariants}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Run scraper
// ---------------------------------------------------------------------------

interface ScrapedItemJSON {
  code: string;
  description: string;
  fullDescription?: string;
  unit: string;
  totalCost: number;
  breakdown: unknown[];
  category: string;
  url: string;
  typology: string;
  variants?: Array<{
    variantId: string;
    parameters: Record<string, string>;
    description?: string;
    unit?: string;
    unitCost: number;
  }>;
}

async function main() {
  const totalChapters = typologies.reduce((sum, t) => sum + t.chapters.length, 0);
  console.log(`\nPrice Scraper — ${typologies.length} typologies, ${totalChapters} chapters\n`);

  const startTime = Date.now();
  const allItems: ScrapedItemJSON[] = [];
  let totalStats = {
    itemsScraped: 0,
    categoriesVisited: 0,
    errors: 0,
    retries: 0,
    cacheHits: 0,
    totalRequests: 0,
    skippedDuplicates: 0,
  };

  for (const typo of typologies) {
    console.log(`\n--- ${typo.name} (${typo.id}) — ${typo.chapters.length} chapters ---\n`);

    const scraper = new PriceScraper({
      rateLimit: flags.rateLimit,
      extractBreakdowns: true,
      typology: typo.id as PriceTypology,
    });

    await scraper.scrapeChapters(typo.chapters as CategoryConfig[], (message, stats) => {
      process.stdout.write(
        `\r  ${message} | Items: ${stats.itemsScraped} | Errors: ${stats.errors} | Requests: ${stats.totalRequests}    `,
      );
    });

    const json = scraper.toJSON();
    allItems.push(...json.items as ScrapedItemJSON[]);

    const stats = scraper.getStats();
    totalStats.itemsScraped += stats.itemsScraped;
    totalStats.categoriesVisited += stats.categoriesVisited;
    totalStats.errors += stats.errors;
    totalStats.retries += stats.retries;
    totalStats.cacheHits += stats.cacheHits;
    totalStats.totalRequests += stats.totalRequests;
    totalStats.skippedDuplicates += stats.skippedDuplicates;

    console.log(`\n  ${typo.id}: ${stats.itemsScraped} items scraped`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n\nScraping complete in ${duration}s`);
  console.log(`   Items: ${totalStats.itemsScraped}`);
  console.log(`   Categories visited: ${totalStats.categoriesVisited}`);
  console.log(`   Errors: ${totalStats.errors}`);
  console.log(`   Retries: ${totalStats.retries}`);
  console.log(`   Cache hits: ${totalStats.cacheHits}`);
  console.log(`   Requests: ${totalStats.totalRequests}`);
  console.log(`   Duplicates skipped: ${totalStats.skippedDuplicates}`);

  // Variant scraping with Playwright (optional)
  if (flags.withVariants && allItems.length > 0) {
    console.log("\n--- Variant Scraping (Playwright) ---\n");

    // Determine candidate items for variant scraping
    let variantCandidates: Array<{ url: string; code: string; typology: PriceTypology }> = [];
    let useAutoDiscover = false;

    // Try to load scan report for auto-discover mode
    const scanPath = path.join(process.cwd(), "data", "price-variant-scan.json");
    const presetsPath = path.join(process.cwd(), "data", "price-variant-presets.json");

    if (fs.existsSync(scanPath)) {
      // AUTO-DISCOVER MODE: use variant scan report to select items with variants
      const scanReport = JSON.parse(fs.readFileSync(scanPath, "utf-8"));
      const scannedCodes = new Set(
        scanReport.items
          .filter((s: { hasVariants: boolean; totalCombinations: number }) => s.hasVariants && s.totalCombinations > 1)
          .map((s: { code: string }) => s.code),
      );

      variantCandidates = allItems
        .filter((item) => scannedCodes.has(item.code))
        .map((item) => ({
          url: item.url,
          code: item.code,
          typology: (item.typology || "obra_nova") as PriceTypology,
        }));

      useAutoDiscover = true;
      console.log(`  Auto-discover mode: ${variantCandidates.length} items with variants (from scan report)`);
    } else if (fs.existsSync(presetsPath)) {
      // PRESET MODE: use manual presets file (legacy, covers ~30 items)
      const presets = loadVariantPresets(presetsPath);
      variantCandidates = allItems
        .filter((item) => presets.itemMappings[item.code])
        .map((item) => ({
          url: item.url,
          code: item.code,
          typology: (item.typology || "obra_nova") as PriceTypology,
        }));

      console.log(`  Preset mode: ${variantCandidates.length} items have variant presets`);
    } else {
      console.error("  No variant scan report or presets file found.");
      console.error("  Run: npx tsx scripts/scan-variant-coverage.ts");
      console.error("  Skipping variant scraping.");
    }

    if (variantCandidates.length > 0) {
      const variantScraper = new PriceVariantScraper({
        maxVariantsPerItem: flags.maxVariants,
        rateLimit: 2000,
      });

      try {
        await variantScraper.init();

        let variantResults: Map<string, import("../src/lib/price-variant-scraper").PriceVariant[]>;

        if (useAutoDiscover) {
          variantResults = await variantScraper.scrapeMultipleAutoDiscover(
            variantCandidates,
            (message, stats) => {
              process.stdout.write(
                `\r  ${message} | Variants: ${stats.variantsScraped} | Errors: ${stats.errors}    `,
              );
            },
          );
        } else {
          const presets = loadVariantPresets(presetsPath);
          variantResults = await variantScraper.scrapeMultiple(
            variantCandidates,
            presets,
            (message, stats) => {
              process.stdout.write(
                `\r  ${message} | Variants: ${stats.variantsScraped} | Errors: ${stats.errors}    `,
              );
            },
          );
        }

        // Attach variants to their parent items
        for (const [code, variants] of variantResults) {
          const parentItem = allItems.find((i) => i.code === code);
          if (parentItem && variants.length > 0) {
            parentItem.variants = variants.map((v) => ({
              variantId: v.variantId,
              parameters: v.parameters,
              description: v.description,
              unit: v.unit,
              unitCost: v.unitCost,
            }));
          }
        }

        const vStats = variantScraper.getStats();
        console.log(`\n  Variant scraping complete`);
        console.log(`    Items processed: ${vStats.itemsProcessed}`);
        console.log(`    Variants scraped: ${vStats.variantsScraped}`);
        console.log(`    Errors: ${vStats.errors}`);
        console.log(`    Skipped: ${vStats.skipped}`);
      } catch (err) {
        console.error("\n  Variant scraper error:", err instanceof Error ? err.message : String(err));
        console.error("  Continuing with base items only.");
      } finally {
        await variantScraper.close();
      }
    }
  }

  // Validate if requested
  if (flags.validate && allItems.length > 0) {
    console.log("\nValidating prices...");
    const validationInput = allItems.map((item) => ({
      code: item.code,
      description: item.description,
      category: item.category,
      unit: item.unit,
      totalCost: item.totalCost,
      breakdown: Array.isArray(item.breakdown) && item.breakdown.length > 0
        ? {
            materials: item.breakdown
              .filter((c: Record<string, unknown>) => c.type === "material")
              .reduce((sum: number, c: Record<string, unknown>) => sum + ((c.total as number) || 0), 0),
            labor: item.breakdown
              .filter((c: Record<string, unknown>) => c.type === "labor")
              .reduce((sum: number, c: Record<string, unknown>) => sum + ((c.total as number) || 0), 0),
            machinery: item.breakdown
              .filter((c: Record<string, unknown>) => c.type === "machinery")
              .reduce((sum: number, c: Record<string, unknown>) => sum + ((c.total as number) || 0), 0),
          }
        : undefined,
    }));

    const { stats: valStats } = validateBatch(validationInput);
    console.log(`   Valid: ${valStats.valid}/${valStats.total}`);
    console.log(`   Invalid: ${valStats.invalid}`);
    console.log(`   Using parametric: ${valStats.useParametric}`);
    console.log(`   Avg confidence: ${valStats.avgConfidence.toFixed(1)}%`);
  }

  // Build output
  const outputPath = path.join(process.cwd(), "data", "price-db.json");

  let output = {
    metadata: {
      exportDate: new Date().toISOString(),
      totalItems: allItems.length,
      totalComponents: 0,
      source: "geradordeprecos.info",
      version: "4.0-multi-typology",
      region: "Lisboa/Cascais",
      typologyCounts: {
        obra_nova: allItems.filter((i) => i.typology === "obra_nova").length,
        reabilitacao: allItems.filter((i) => i.typology === "reabilitacao").length,
        espacos_urbanos: allItems.filter((i) => i.typology === "espacos_urbanos").length,
      },
    },
    items: allItems,
  };

  if (flags.merge && fs.existsSync(outputPath)) {
    console.log("\nMerging with existing data...");
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
    const existingMap = new Map(
      existing.items.map((i: { code: string; typology?: string }) => [
        `${i.code}:${i.typology || "obra_nova"}`,
        i,
      ]),
    );

    // New items override existing ones by code:typology
    for (const item of output.items) {
      existingMap.set(`${item.code}:${item.typology || "obra_nova"}`, item);
    }

    const mergedItems = Array.from(existingMap.values()) as ScrapedItemJSON[];
    output = {
      ...output,
      metadata: {
        ...output.metadata,
        totalItems: mergedItems.length,
        typologyCounts: {
          obra_nova: mergedItems.filter((i) => (i.typology || "obra_nova") === "obra_nova").length,
          reabilitacao: mergedItems.filter((i) => i.typology === "reabilitacao").length,
          espacos_urbanos: mergedItems.filter((i) => i.typology === "espacos_urbanos").length,
        },
      },
      items: mergedItems,
    };
    console.log(`   Merged: ${mergedItems.length} total items (${allItems.length} new/updated)`);
  }

  // Create backup
  if (fs.existsSync(outputPath)) {
    const backupDir = path.join(process.cwd(), "data", "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    const backupPath = path.join(backupDir, `pricing-${date}.json`);
    fs.copyFileSync(outputPath, backupPath);
    console.log(`\nBackup: ${backupPath}`);
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Saved: ${outputPath} (${output.metadata.totalItems} items)\n`);
}

main().catch((error) => {
  console.error("\nScraper failed:", error.message);
  process.exit(1);
});

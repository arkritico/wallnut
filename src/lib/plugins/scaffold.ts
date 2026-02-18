// ============================================================
// PLUGIN SCAFFOLDING — Generate directory structure for new plugins
// ============================================================
//
// Development utility for bootstrapping new specialty plugins.
// Generates all required template files with sensible defaults.
//
// Usage (programmatic):
//   import { scaffoldPlugin, scaffoldPluginToDisk } from "./scaffold";
//   const files = scaffoldPlugin({ id: "fire-protection", ... });
//   // or write directly:
//   const result = scaffoldPluginToDisk("src/data/plugins", { ... });
//
// Usage (CLI):
//   npx tsx src/lib/plugins/scaffold.ts --id fire-protection --name "Proteção Contra Incêndio" ...
//

import * as fs from "node:fs";
import * as path from "node:path";

// ----------------------------------------------------------
// Types
// ----------------------------------------------------------

export interface ScaffoldOptions {
  /** Plugin ID (kebab-case): e.g. "fire-protection" */
  id: string;
  /** Human-readable name: e.g. "Proteção Contra Incêndio" */
  name: string;
  /** Regulation area(s) */
  areas: string[];
  /** Short description */
  description: string;
  /** Author name */
  author: string;
  /** Primary regulation ID (kebab-case): e.g. "dl-220-2008" */
  regulationId: string;
  /** Regulation short reference: e.g. "DL 220/2008" */
  regulationRef: string;
  /** Regulation full title */
  regulationTitle: string;
  /** Include lookup tables template */
  withLookupTables?: boolean;
  /** Include computed fields template */
  withComputedFields?: boolean;
}

export interface ScaffoldResult {
  /** Base directory path */
  directory: string;
  /** All files that were generated */
  files: string[];
  /** Instructions for next steps */
  nextSteps: string[];
}

// ----------------------------------------------------------
// Template generators
// ----------------------------------------------------------

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Convert a kebab-case ID to an UPPER_SNAKE prefix for rule IDs.
 * e.g. "fire-protection" -> "FIRE-PROTECTION"
 *      "dl-220-2008"     -> "DL-220-2008"
 */
function toUpperId(regulationId: string): string {
  return regulationId.toUpperCase();
}

function generatePluginJson(options: ScaffoldOptions): string {
  const plugin = {
    id: options.id,
    name: options.name,
    version: "0.1.0",
    areas: options.areas,
    description: options.description,
    author: options.author,
    lastUpdated: getTodayISO(),
  };
  return JSON.stringify(plugin, null, 2) + "\n";
}

function generateRegistryJson(options: ScaffoldOptions): string {
  const registry = {
    regulations: [
      {
        id: options.regulationId,
        shortRef: options.regulationRef,
        title: options.regulationTitle,
        status: "active",
        effectiveDate: "TODO",
        revocationDate: null,
        amendedBy: [],
        supersededBy: null,
        amends: [],
        sourceType: "public_dre",
        sourceUrl: null,
        sourceFile: null,
        legalForce: "legal",
        area: options.areas[0] ?? options.id,
        ingestionStatus: "pending",
        ingestionDate: null,
        verifiedBy: null,
        rulesCount: 0,
        tags: [],
        notes: "",
      },
    ],
  };
  return JSON.stringify(registry, null, 2) + "\n";
}

function generateRulesJson(options: ScaffoldOptions): string {
  const upperId = toUpperId(options.regulationId);
  const rules = {
    regulationRef: options.regulationId,
    description: `Regras de conformidade extraídas de ${options.regulationRef}`,
    extractedBy: options.author,
    extractedAt: getTodayISO(),
    rules: [
      {
        id: `${upperId}-001`,
        regulationId: options.regulationId,
        article: "Art. X.º",
        description: "TODO: Descrição da regra",
        severity: "warning",
        conditions: [
          { field: "TODO.field", operator: "exists", value: null },
        ],
        remediation: "TODO: Ação corretiva",
        enabled: false,
        tags: [],
      },
    ],
  };
  return JSON.stringify(rules, null, 2) + "\n";
}

function generateLookupTablesJson(): string {
  const tables = {
    tables: [],
  };
  return JSON.stringify(tables, null, 2) + "\n";
}

function generateComputedFieldsJson(): string {
  const fields = {
    fields: [],
  };
  return JSON.stringify(fields, null, 2) + "\n";
}

// ----------------------------------------------------------
// Next steps instructions
// ----------------------------------------------------------

function buildNextSteps(options: ScaffoldOptions): string[] {
  const steps: string[] = [
    `Edit regulations/${options.regulationId}/rules.json to add regulation rules`,
    "Update lookup-tables.json with threshold tables (if applicable)",
    "Set rule 'enabled: true' when rules are ready",
    "Register the plugin in src/lib/plugins/loader.ts",
    "Run validation: import { validatePlugin } from './validate'",
  ];
  return steps;
}

// ----------------------------------------------------------
// Public API
// ----------------------------------------------------------

/**
 * Generate all template files for a new plugin.
 * Returns a Map of relative file paths to their string contents.
 * Does NOT write anything to disk.
 */
export function scaffoldPlugin(options: ScaffoldOptions): Map<string, string> {
  const files = new Map<string, string>();

  // 1. plugin.json
  files.set("plugin.json", generatePluginJson(options));

  // 2. regulations/registry.json
  files.set("regulations/registry.json", generateRegistryJson(options));

  // 3. regulations/<regulationId>/rules.json
  files.set(
    `regulations/${options.regulationId}/rules.json`,
    generateRulesJson(options),
  );

  // 4. lookup-tables.json (optional)
  if (options.withLookupTables) {
    files.set("lookup-tables.json", generateLookupTablesJson());
  }

  // 5. computed-fields.json (optional)
  if (options.withComputedFields) {
    files.set("computed-fields.json", generateComputedFieldsJson());
  }

  return files;
}

/**
 * Generate and write all template files to disk.
 * Creates the full directory structure under `baseDir/<options.id>/`.
 */
export function scaffoldPluginToDisk(
  baseDir: string,
  options: ScaffoldOptions,
): ScaffoldResult {
  const files = scaffoldPlugin(options);
  const pluginDir = path.join(baseDir, options.id);
  const createdFiles: string[] = [];

  for (const [relativePath, content] of files) {
    const fullPath = path.join(pluginDir, relativePath);
    const dir = path.dirname(fullPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    createdFiles.push(relativePath);
  }

  return {
    directory: pluginDir,
    files: createdFiles,
    nextSteps: buildNextSteps(options),
  };
}

// ----------------------------------------------------------
// CLI entry point
// ----------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage: npx tsx src/lib/plugins/scaffold.ts [options]

Required:
  --id <string>              Plugin ID (kebab-case), e.g. "fire-protection"
  --name <string>            Human-readable name, e.g. "Proteção Contra Incêndio"
  --areas <string,...>       Comma-separated regulation areas
  --description <string>     Short description of the plugin
  --author <string>          Author name
  --regulation-id <string>   Primary regulation ID (kebab-case), e.g. "dl-220-2008"
  --regulation-ref <string>  Short reference, e.g. "DL 220/2008"
  --regulation-title <string> Full regulation title

Optional:
  --with-lookup-tables       Include empty lookup-tables.json template
  --with-computed-fields     Include empty computed-fields.json template
  --out <dir>                Output base directory (default: src/data/plugins)
  --dry-run                  Print files without writing to disk
  --help                     Show this help message
`);
}

function parseArgs(argv: string[]): {
  options: ScaffoldOptions | null;
  outDir: string;
  dryRun: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  let help = false;
  let dryRun = false;
  let outDir = "src/data/plugins";
  const partial: Record<string, string | boolean | string[]> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--with-lookup-tables":
        partial.withLookupTables = true;
        break;
      case "--with-computed-fields":
        partial.withComputedFields = true;
        break;
      case "--id":
        partial.id = args[++i];
        break;
      case "--name":
        partial.name = args[++i];
        break;
      case "--areas":
        partial.areas = args[++i]?.split(",").map((s) => s.trim());
        break;
      case "--description":
        partial.description = args[++i];
        break;
      case "--author":
        partial.author = args[++i];
        break;
      case "--regulation-id":
        partial.regulationId = args[++i];
        break;
      case "--regulation-ref":
        partial.regulationRef = args[++i];
        break;
      case "--regulation-title":
        partial.regulationTitle = args[++i];
        break;
      case "--out":
        outDir = args[++i];
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        help = true;
    }
  }

  if (help) {
    return { options: null, outDir, dryRun, help: true };
  }

  // Validate required fields
  const required = [
    "id",
    "name",
    "areas",
    "description",
    "author",
    "regulationId",
    "regulationRef",
    "regulationTitle",
  ] as const;

  const missing = required.filter((k) => !partial[k]);
  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.map((m) => `--${m.replace(/([A-Z])/g, "-$1").toLowerCase()}`).join(", ")}`);
    return { options: null, outDir, dryRun, help: true };
  }

  return {
    options: {
      id: partial.id as string,
      name: partial.name as string,
      areas: partial.areas as string[],
      description: partial.description as string,
      author: partial.author as string,
      regulationId: partial.regulationId as string,
      regulationRef: partial.regulationRef as string,
      regulationTitle: partial.regulationTitle as string,
      withLookupTables: (partial.withLookupTables as boolean) ?? false,
      withComputedFields: (partial.withComputedFields as boolean) ?? false,
    },
    outDir,
    dryRun,
    help: false,
  };
}

// Only run CLI when executed directly
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("scaffold.ts") ||
    process.argv[1].endsWith("scaffold.js"));

if (isDirectExecution) {
  const { options, outDir, dryRun, help } = parseArgs(process.argv);

  if (help || !options) {
    printUsage();
    process.exit(help && options ? 0 : 1);
  }

  if (dryRun) {
    console.log(`\n[dry-run] Plugin: ${options.id}`);
    console.log(`[dry-run] Directory: ${path.join(outDir, options.id)}\n`);

    const files = scaffoldPlugin(options);
    for (const [filePath, content] of files) {
      console.log(`--- ${filePath} ---`);
      console.log(content);
    }

    console.log("Next steps:");
    buildNextSteps(options).forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`);
    });
  } else {
    const result = scaffoldPluginToDisk(outDir, options);

    console.log(`\nPlugin scaffolded at: ${result.directory}\n`);
    console.log("Created files:");
    result.files.forEach((f) => console.log(`  ${f}`));
    console.log("\nNext steps:");
    result.nextSteps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`);
    });
    console.log();
  }
}

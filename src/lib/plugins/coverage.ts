// ============================================================
// COVERAGE DASHBOARD — Rule coverage analysis across plugins
// ============================================================
//
// Shows which regulations have declarative rules vs gaps.
// Generates structured reports and human-readable text output.
//

import type { RegulationArea } from "../types";
import type {
  SpecialtyPlugin,
  RegulationDocument,
} from "./types";
import { getAvailablePlugins } from "./loader";

// ----------------------------------------------------------
// Coverage Interfaces
// ----------------------------------------------------------

/** Coverage metrics for a single regulation area within a plugin */
export interface AreaCoverage {
  area: RegulationArea;
  pluginId: string;
  pluginName: string;
  regulationCount: number;
  ruleCount: number;
  lookupTableCount: number;
  computedFieldCount: number;
  /** Rules by severity */
  rulesBySeverity: Record<string, number>;
  /** Regulations by ingestion status */
  regulationsByStatus: Record<string, number>;
  /** Coverage score: 0-100 based on ingestion completeness */
  coverageScore: number;
}

/** Full coverage report across all plugins */
export interface CoverageReport {
  generatedAt: string;
  totalPlugins: number;
  totalRegulations: number;
  totalRules: number;
  totalLookupTables: number;
  totalComputedFields: number;
  overallCoverageScore: number;
  areas: AreaCoverage[];
  /** Areas with no rules at all */
  uncoveredAreas: string[];
  /** Regulations that are registered but have 0 rules extracted */
  pendingRegulations: Array<{
    pluginId: string;
    regulationId: string;
    shortRef: string;
    ingestionStatus: string;
  }>;
}

// ----------------------------------------------------------
// Coverage Score Calculation
// ----------------------------------------------------------

/**
 * Calculate the coverage score for one area within a plugin.
 *
 * Scoring:
 *   - Base: 50 points if the area has any rules
 *   - +25 points if all regulations have ingestion status "complete" or "verified"
 *   - +15 points if there are lookup tables
 *   - +10 points if there are computed fields
 *
 * Maximum: 100
 */
function calculateAreaCoverageScore(
  ruleCount: number,
  regulations: RegulationDocument[],
  lookupTableCount: number,
  computedFieldCount: number
): number {
  if (ruleCount === 0) {
    return 0;
  }

  let score = 50;

  // +25 if all regulations are fully ingested
  const allComplete =
    regulations.length > 0 &&
    regulations.every(
      (r) => r.ingestionStatus === "complete" || r.ingestionStatus === "verified"
    );
  if (allComplete) {
    score += 25;
  }

  // +15 if there are lookup tables
  if (lookupTableCount > 0) {
    score += 15;
  }

  // +10 if there are computed fields
  if (computedFieldCount > 0) {
    score += 10;
  }

  return score;
}

// ----------------------------------------------------------
// Area Coverage Builder
// ----------------------------------------------------------

/**
 * Build coverage data for a single area from a plugin.
 * A plugin may cover multiple areas, so we filter rules/regulations
 * by the specific area.
 */
function buildAreaCoverage(
  plugin: SpecialtyPlugin,
  area: RegulationArea
): AreaCoverage {
  // Filter regulations belonging to this area
  const areaRegulations = plugin.regulations.filter((r) => r.area === area);

  // Get regulation IDs for this area to filter rules
  const areaRegulationIds = new Set(areaRegulations.map((r) => r.id));

  // Filter rules belonging to regulations in this area
  const areaRules = plugin.rules.filter((r) =>
    areaRegulationIds.has(r.regulationId)
  );

  const lookupTableCount = plugin.lookupTables?.length ?? 0;
  const computedFieldCount = plugin.computedFields?.length ?? 0;

  // Count rules by severity
  const rulesBySeverity: Record<string, number> = {};
  for (const rule of areaRules) {
    rulesBySeverity[rule.severity] = (rulesBySeverity[rule.severity] ?? 0) + 1;
  }

  // Count regulations by ingestion status
  const regulationsByStatus: Record<string, number> = {};
  for (const reg of areaRegulations) {
    regulationsByStatus[reg.ingestionStatus] =
      (regulationsByStatus[reg.ingestionStatus] ?? 0) + 1;
  }

  const coverageScore = calculateAreaCoverageScore(
    areaRules.length,
    areaRegulations,
    lookupTableCount,
    computedFieldCount
  );

  return {
    area,
    pluginId: plugin.id,
    pluginName: plugin.name,
    regulationCount: areaRegulations.length,
    ruleCount: areaRules.length,
    lookupTableCount,
    computedFieldCount,
    rulesBySeverity,
    regulationsByStatus,
    coverageScore,
  };
}

// ----------------------------------------------------------
// Report Generation
// ----------------------------------------------------------

/**
 * Generate a full coverage report across all loaded plugins.
 * Iterates every plugin and every area within each plugin,
 * aggregating totals and identifying gaps.
 */
export function generateCoverageReport(): CoverageReport {
  const plugins = getAvailablePlugins();
  const areas: AreaCoverage[] = [];
  const pendingRegulations: CoverageReport["pendingRegulations"] = [];

  let totalRegulations = 0;
  let totalRules = 0;
  let totalLookupTables = 0;
  let totalComputedFields = 0;

  // Track which areas have at least one rule
  const coveredAreaSet = new Set<string>();

  for (const plugin of plugins) {
    // Accumulate plugin-level totals
    totalRegulations += plugin.regulations.length;
    totalRules += plugin.rules.length;
    totalLookupTables += plugin.lookupTables?.length ?? 0;
    totalComputedFields += plugin.computedFields?.length ?? 0;

    // Build area coverage for each area the plugin declares
    for (const area of plugin.areas) {
      const areaCoverage = buildAreaCoverage(plugin, area);
      areas.push(areaCoverage);

      if (areaCoverage.ruleCount > 0) {
        coveredAreaSet.add(area);
      }
    }

    // Identify pending regulations (registered but 0 rules extracted)
    for (const reg of plugin.regulations) {
      if (reg.rulesCount === 0) {
        pendingRegulations.push({
          pluginId: plugin.id,
          regulationId: reg.id,
          shortRef: reg.shortRef,
          ingestionStatus: reg.ingestionStatus,
        });
      }
    }
  }

  // Determine uncovered areas: areas declared by plugins but with zero rules
  const allDeclaredAreas = new Set<string>();
  for (const plugin of plugins) {
    for (const area of plugin.areas) {
      allDeclaredAreas.add(area);
    }
  }
  const uncoveredAreas = Array.from(allDeclaredAreas)
    .filter((a) => !coveredAreaSet.has(a))
    .sort();

  // Calculate overall coverage score as average of all area scores
  const overallCoverageScore =
    areas.length > 0
      ? Math.round(
          areas.reduce((sum, a) => sum + a.coverageScore, 0) / areas.length
        )
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    totalPlugins: plugins.length,
    totalRegulations,
    totalRules,
    totalLookupTables,
    totalComputedFields,
    overallCoverageScore,
    areas,
    uncoveredAreas,
    pendingRegulations,
  };
}

// ----------------------------------------------------------
// Text Formatter
// ----------------------------------------------------------

/**
 * Format a coverage report as a human-readable text string.
 * Suitable for CLI output, logs, or text-based dashboards.
 */
export function formatCoverageReportText(report: CoverageReport): string {
  const lines: string[] = [];

  lines.push("=== Wallnut Plugin Coverage Report ===");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");

  // Summary block
  lines.push("Summary:");
  lines.push(`  Plugins:         ${report.totalPlugins}`);
  lines.push(`  Regulations:     ${report.totalRegulations}`);
  lines.push(`  Rules:           ${report.totalRules}`);
  lines.push(`  Lookup Tables:   ${report.totalLookupTables}`);
  lines.push(`  Computed Fields: ${report.totalComputedFields}`);
  lines.push("");
  lines.push(`  Overall Coverage: ${report.overallCoverageScore}%`);
  lines.push("");

  // Area coverage table, sorted by score descending
  lines.push("Area Coverage:");

  const sortedAreas = [...report.areas].sort(
    (a, b) => b.coverageScore - a.coverageScore
  );

  for (const area of sortedAreas) {
    const icon = area.coverageScore >= 75 ? "\u2713" : "\u26A0";
    const regsLabel = area.regulationCount === 1 ? "reg" : "regs";
    const rulesLabel = area.ruleCount === 1 ? "rule" : "rules";

    const line = `  ${icon} ${padRight(area.area, 20)} \u2014 ${area.ruleCount} ${rulesLabel}, ${area.regulationCount} ${regsLabel} \u2014 ${area.coverageScore}%`;
    lines.push(line);
  }

  lines.push("");

  // Uncovered areas
  if (report.uncoveredAreas.length > 0) {
    lines.push("Uncovered Areas (no rules):");
    for (const area of report.uncoveredAreas) {
      lines.push(`  - ${area}`);
    }
    lines.push("");
  }

  // Pending regulations
  lines.push("Pending Regulations (no rules extracted):");
  if (report.pendingRegulations.length === 0) {
    lines.push("  (none)");
  } else {
    for (const pending of report.pendingRegulations) {
      lines.push(
        `  - [${pending.pluginId}] ${pending.shortRef} (${pending.ingestionStatus})`
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

/** Pad a string to the right to a minimum width */
function padRight(str: string, width: number): string {
  if (str.length >= width) {
    return str;
  }
  return str + " ".repeat(width - str.length);
}

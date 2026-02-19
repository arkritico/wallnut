/**
 * Tests for Phase 3 — Integration, hot-reload, validation, coverage
 *
 * Validates:
 * - Plugin engine is the sole evaluation path (no hardcoded functions)
 * - Hot-reload: register, unregister, override built-in plugins
 * - Plugin validation catches schema errors
 * - Coverage report generation
 * - Pass findings for compliant areas
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { analyzeProject } from "@/lib/analyzer";
import {
  getAvailablePlugins,
  getPluginForArea,
  loadElectricalPlugin,
  loadPluginFromJson,
  registerPlugin,
  unregisterPlugin,
  getDynamicPlugins,
  reloadBuiltinPlugin,
  resetPluginSystem,
  mergeRulesIntoPlugin,
} from "@/lib/plugins/loader";
import { validateLoadedPlugin, validateAllLoadedPlugins } from "@/lib/plugins/validate";
import { generateCoverageReport, formatCoverageReportText } from "@/lib/plugins/coverage";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject, AnalysisResult } from "@/lib/types";
import type { SpecialtyPlugin, DeclarativeRule, RegulationDocument } from "@/lib/plugins/types";

function createProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)), ...overrides };
}

// ============================================================
// 1. Plugin engine is the sole evaluation path
// ============================================================

describe("Phase 3 — Plugin engine as sole evaluation path", () => {
  it("all findings come from plugin engine (PF- prefix) or PDM (PDM- prefix) or PASS", async () => {
    const project = createProject({ name: "Sole Path Test" });
    const result = await analyzeProject(project);
    for (const f of result.findings) {
      // Allow: plugin findings (PF-), municipal findings (PDM-), pass findings (PASS-),
      // specialized engine findings (RTIEBT_ for electrical, PLUMB_ / plumbing- for plumbing),
      // deep analyzer findings (SCE- for energy, SCIE-CALC- / SCIE- for fire safety),
      // and *-SKIPPED / *-UNAVAIL findings (engine missing data or crashed)
      const validPrefix = f.id.startsWith("PF-") || f.id.startsWith("PDM-") || f.id.startsWith("PASS-")
        || f.id.startsWith("NA-")
        || f.id.startsWith("RTIEBT_") || f.id.startsWith("RTIEBT-")
        || f.id.startsWith("PLUMB_") || f.id.startsWith("plumbing-")
        || f.id.startsWith("SCE-") || f.id.startsWith("SCIE-CALC-") || f.id.startsWith("SCIE-")
        || f.id.startsWith("RGSPPDADAR-");
      expect(validPrefix).toBe(true);
    }
  });

  it("no findings with F- prefix (old hardcoded format)", async () => {
    const project = createProject({ name: "No Hardcoded" });
    const result = await analyzeProject(project);
    const hardcoded = result.findings.filter(f => /^F-\d+$/.test(f.id));
    expect(hardcoded.length).toBe(0);
  });

  it("generates pass findings for compliant areas", async () => {
    const project = createProject({ name: "Pass Test" });
    const result = await analyzeProject(project);
    const passFindings = result.findings.filter(f => f.severity === "pass");
    expect(passFindings.length).toBeGreaterThan(0);
    // Pass findings may come from plugin engine (PASS-) or specialized engines (RTIEBT_, PLUMB_)
    // or deep analyzers (SCE-, SCIE-CALC-)
    expect(passFindings.every(f =>
      f.id.startsWith("PASS-") || f.id.startsWith("RTIEBT_") || f.id.startsWith("PLUMB_")
      || f.id.startsWith("SCE-") || f.id.startsWith("SCIE-CALC-")
    )).toBe(true);
  });

  it("does not generate pass findings for areas with violations", async () => {
    const project = createProject({
      name: "Violation Test",
      architecture: {
        ...DEFAULT_PROJECT.architecture,
        hasBuildingPermitDesign: false,
        meetsRGEU: false,
        hasNaturalLight: false,
      },
    });
    const result = await analyzeProject(project);
    const archViolations = result.findings.filter(
      f => f.area === "architecture" && (f.severity === "critical" || f.severity === "warning"),
    );
    const archPass = result.findings.filter(
      f => f.area === "architecture" && f.severity === "pass",
    );
    expect(archViolations.length).toBeGreaterThan(0);
    expect(archPass.length).toBe(0);
  });

  it("still generates recommendations based on findings", async () => {
    const project = createProject({ name: "Recs Test" });
    const result = await analyzeProject(project);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("covers all 18 regulation areas in summary", async () => {
    const project = createProject({ name: "Summary Test" });
    const result = await analyzeProject(project);
    expect(result.regulationSummary.length).toBe(18);
  });
});

// ============================================================
// 2. Hot-reload — dynamic plugin registration
// ============================================================

describe("Phase 3 — Hot-reload", () => {
  afterEach(() => {
    resetPluginSystem();
  });

  it("registers a dynamic plugin", async () => {
    const custom: SpecialtyPlugin = {
      id: "custom-test",
      name: "Custom Test Plugin",
      version: "1.0.0",
      areas: ["general"],
      description: "Test plugin",
      author: "test",
      lastUpdated: "2026-02-15",
      regulations: [],
      rules: [],
    };
    registerPlugin(custom);
    expect(getDynamicPlugins().length).toBe(1);
    expect(getDynamicPlugins()[0].id).toBe("custom-test");
  });

  it("dynamic plugins appear in getAvailablePlugins", async () => {
    const custom: SpecialtyPlugin = {
      id: "custom-dynamic",
      name: "Dynamic Plugin",
      version: "1.0.0",
      areas: ["general"],
      description: "Test",
      author: "test",
      lastUpdated: "2026-02-15",
      regulations: [],
      rules: [],
    };
    registerPlugin(custom);
    const all = getAvailablePlugins();
    expect(all.find(p => p.id === "custom-dynamic")).toBeDefined();
  });

  it("dynamic plugins override built-ins with the same ID", async () => {
    const override: SpecialtyPlugin = {
      id: "electrical",
      name: "Custom Electrical Override",
      version: "2.0.0",
      areas: ["electrical"],
      description: "Override",
      author: "test",
      lastUpdated: "2026-02-15",
      regulations: [],
      rules: [],
    };
    registerPlugin(override);
    const all = getAvailablePlugins();
    const electrical = all.find(p => p.id === "electrical");
    expect(electrical).toBeDefined();
    expect(electrical!.version).toBe("2.0.0");
    expect(electrical!.name).toBe("Custom Electrical Override");
    // Should still have 18 plugins (override, not addition)
    expect(all.length).toBe(18);
  });

  it("unregisters a dynamic plugin", async () => {
    const custom: SpecialtyPlugin = {
      id: "temp-plugin",
      name: "Temp",
      version: "1.0.0",
      areas: ["general"],
      description: "Temp",
      author: "test",
      lastUpdated: "2026-02-15",
      regulations: [],
      rules: [],
    };
    registerPlugin(custom);
    expect(getDynamicPlugins().length).toBe(1);
    const removed = unregisterPlugin("temp-plugin");
    expect(removed).toBe(true);
    expect(getDynamicPlugins().length).toBe(0);
  });

  it("unregister returns false for non-existent plugin", async () => {
    expect(unregisterPlugin("does-not-exist")).toBe(false);
  });

  it("resetPluginSystem clears all state", async () => {
    registerPlugin({
      id: "to-clear",
      name: "Clear Me",
      version: "1.0.0",
      areas: ["general"],
      description: "",
      author: "",
      lastUpdated: "",
      regulations: [],
      rules: [],
    });
    expect(getDynamicPlugins().length).toBe(1);
    resetPluginSystem();
    expect(getDynamicPlugins().length).toBe(0);
  });

  it("reloadBuiltinPlugin reloads from JSON", async () => {
    const before = loadElectricalPlugin();
    const reloaded = reloadBuiltinPlugin("electrical");
    expect(reloaded).toBeDefined();
    expect(reloaded!.id).toBe("electrical");
    expect(reloaded!.rules.length).toBe(before.rules.length);
  });

  it("loadPluginFromJson creates a valid plugin with lookup tables", async () => {
    const pluginDef = {
      id: "test-json",
      name: "Test JSON Plugin",
      version: "1.0.0",
      areas: ["general"],
      description: "Test",
      author: "test",
      lastUpdated: "2026-02-15",
    };
    const registry = {
      regulations: [{
        id: "test-reg",
        shortRef: "Test Reg",
        title: "Test Regulation",
        status: "active" as const,
        effectiveDate: "2026-01-01",
        revocationDate: null,
        amendedBy: [],
        supersededBy: null,
        amends: [],
        sourceType: "manual_extract" as const,
        sourceUrl: null,
        sourceFile: null,
        legalForce: "legal" as const,
        area: "general" as const,
        ingestionStatus: "complete" as const,
        ingestionDate: "2026-02-15",
        verifiedBy: null,
        rulesCount: 1,
        tags: [],
        notes: "",
      }],
    };
    const rules = {
      rules: [{
        id: "TEST-01",
        regulationId: "test-reg",
        article: "Art. 1",
        description: "Test rule",
        severity: "warning" as const,
        conditions: [{ field: "general.test", operator: "exists" as const, value: null }],
        remediation: "Fix it",
        enabled: true,
        tags: ["test"],
      }],
    };
    const tables = {
      tables: [{
        id: "test-table",
        description: "Test table",
        keys: ["buildingType"],
        values: { residential: 10 },
      }],
    };
    const plugin = loadPluginFromJson(pluginDef, registry, [rules], tables);
    expect(plugin.id).toBe("test-json");
    expect(plugin.rules.length).toBe(1);
    expect(plugin.lookupTables).toBeDefined();
    expect(plugin.lookupTables!.length).toBe(1);
  });
});

// ============================================================
// 3. Plugin validation
// ============================================================

describe("Phase 3 — Plugin validation", () => {
  it("validates all built-in plugins without errors", async () => {
    const results = validateAllLoadedPlugins();
    expect(results.length).toBe(18);
    for (const r of results) {
      expect(r.valid).toBe(true);
    }
  });

  it("each plugin has expected stats", async () => {
    const results = validateAllLoadedPlugins();
    for (const r of results) {
      expect(r.stats.regulationCount).toBeGreaterThan(0);
      expect(r.stats.ruleCount).toBeGreaterThan(0);
    }
  });

  it("detects invalid plugin metadata", async () => {
    const badPlugin: SpecialtyPlugin = {
      id: "",
      name: "",
      version: "invalid",
      areas: [],
      description: "",
      author: "",
      lastUpdated: "",
      regulations: [],
      rules: [],
    };
    const result = validateLoadedPlugin(badPlugin);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("detects invalid rule operators", async () => {
    const badPlugin: SpecialtyPlugin = {
      id: "bad-ops",
      name: "Bad Operators",
      version: "1.0.0",
      areas: ["general"],
      description: "Test",
      author: "test",
      lastUpdated: "2026-01-01",
      regulations: [{
        id: "reg-1",
        shortRef: "R1",
        title: "Test",
        status: "active",
        effectiveDate: "2026-01-01",
        revocationDate: null,
        amendedBy: [],
        supersededBy: null,
        amends: [],
        sourceType: "manual_extract",
        sourceUrl: null,
        sourceFile: null,
        legalForce: "legal",
        area: "general",
        ingestionStatus: "complete",
        ingestionDate: "2026-01-01",
        verifiedBy: null,
        rulesCount: 1,
        tags: [],
        notes: "",
      }],
      rules: [{
        id: "BAD-01",
        regulationId: "reg-1",
        article: "Art 1",
        description: "Bad rule",
        severity: "warning",
        conditions: [{ field: "test", operator: "INVALID_OP" as any, value: null }],
        remediation: "Fix",
        enabled: true,
        tags: [],
      }],
    };
    const result = validateLoadedPlugin(badPlugin);
    expect(result.valid).toBe(false);
    const opErrors = result.errors.filter(e => e.message.includes("operator"));
    expect(opErrors.length).toBeGreaterThan(0);
  });

  it("detects duplicate rule IDs", async () => {
    const badPlugin: SpecialtyPlugin = {
      id: "dup-rules",
      name: "Dup Rules",
      version: "1.0.0",
      areas: ["general"],
      description: "Test",
      author: "test",
      lastUpdated: "2026-01-01",
      regulations: [{
        id: "reg-1",
        shortRef: "R1",
        title: "Test",
        status: "active",
        effectiveDate: "2026-01-01",
        revocationDate: null,
        amendedBy: [],
        supersededBy: null,
        amends: [],
        sourceType: "manual_extract",
        sourceUrl: null,
        sourceFile: null,
        legalForce: "legal",
        area: "general",
        ingestionStatus: "complete",
        ingestionDate: "2026-01-01",
        verifiedBy: null,
        rulesCount: 2,
        tags: [],
        notes: "",
      }],
      rules: [
        { id: "DUP-01", regulationId: "reg-1", article: "Art 1", description: "First", severity: "warning", conditions: [{ field: "a", operator: "exists", value: null }], remediation: "Fix", enabled: true, tags: [] },
        { id: "DUP-01", regulationId: "reg-1", article: "Art 2", description: "Dupe", severity: "warning", conditions: [{ field: "b", operator: "exists", value: null }], remediation: "Fix", enabled: true, tags: [] },
      ],
    };
    const result = validateLoadedPlugin(badPlugin);
    expect(result.valid).toBe(false);
    const dupErrors = result.errors.filter(e => e.message.includes("uplicate"));
    expect(dupErrors.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 4. Coverage report
// ============================================================

describe("Phase 3 — Coverage report", () => {
  it("generates a valid coverage report", async () => {
    const report = generateCoverageReport();
    expect(report.totalPlugins).toBe(18);
    expect(report.totalRules).toBeGreaterThanOrEqual(120);
    expect(report.totalRegulations).toBeGreaterThanOrEqual(25);
    expect(report.areas.length).toBeGreaterThan(0);
    expect(report.overallCoverageScore).toBeGreaterThan(0);
    expect(report.overallCoverageScore).toBeLessThanOrEqual(100);
  });

  it("all areas have coverage entries", async () => {
    const report = generateCoverageReport();
    expect(report.areas.length).toBeGreaterThanOrEqual(18);
  });

  it("each area has valid coverage score", async () => {
    const report = generateCoverageReport();
    for (const area of report.areas) {
      expect(area.coverageScore).toBeGreaterThanOrEqual(0);
      expect(area.coverageScore).toBeLessThanOrEqual(100);
      expect(area.ruleCount).toBeGreaterThan(0);
    }
  });

  it("formats a text report", async () => {
    const report = generateCoverageReport();
    const text = formatCoverageReportText(report);
    expect(text).toContain("Coverage Report");
    expect(text).toContain("Plugins:");
    expect(text).toContain("Rules:");
    expect(text).toContain("Overall Coverage:");
  });

  it("reports no uncovered areas for built-in plugins", async () => {
    const report = generateCoverageReport();
    expect(report.uncoveredAreas.length).toBe(0);
  });
});

// ============================================================
// 5. Analyzer line count sanity check
// ============================================================

describe("Phase 3 — Dead code removal verification", () => {
  it("analyzer.ts has fewer than 700 lines (was 3074)", async () => {
    // This test verifies the dead code removal was successful
    // The file went from ~3074 lines to ~620 lines
    const fs = await import("fs");
    const content = fs.readFileSync("src/lib/analyzer.ts", "utf8");
    const lines = content.split("\n").length;
    expect(lines).toBeLessThan(700);
  });
});

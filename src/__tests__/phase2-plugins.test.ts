/**
 * Tests for Phase 2 — Plugin system expansion
 *
 * Validates all 18 specialty plugins:
 * - Plugin metadata (id, name, version, areas)
 * - Regulation registry (documents exist, IDs unique)
 * - Declarative rules (valid fields, operators, IDs unique)
 * - Lookup tables (keys present, values defined)
 * - Computed fields (valid computation types)
 * - Loader integration (all plugins loadable)
 */

import { describe, it, expect } from "vitest";
import {
  getAvailablePlugins,
  loadElectricalPlugin,
  loadFireSafetyPlugin,
  loadThermalPlugin,
  loadAcousticPlugin,
  loadStructuralPlugin,
  loadWaterDrainagePlugin,
  loadGasPlugin,
  loadHvacPlugin,
  loadTelecomPlugin,
  loadAccessibilityPlugin,
  loadEnergyPlugin,
  loadElevatorsPlugin,
  loadLicensingPlugin,
  loadWastePlugin,
  loadDrawingsPlugin,
  loadArchitecturePlugin,
  loadGeneralPlugin,
  loadMunicipalPlugin,
  getPluginForArea,
} from "@/lib/plugins/loader";
import type { SpecialtyPlugin, DeclarativeRule, RuleOperator } from "@/lib/plugins/types";

// Valid operators from the type system
const VALID_OPERATORS: RuleOperator[] = [
  ">", ">=", "<", "<=", "==", "!=",
  "exists", "not_exists",
  "in", "not_in", "between", "not_in_range",
  "lookup_gt", "lookup_gte", "lookup_lt", "lookup_lte", "lookup_eq", "lookup_neq",
  "ordinal_lt", "ordinal_lte", "ordinal_gt", "ordinal_gte",
  "formula_gt", "formula_gte", "formula_lt", "formula_lte",
  "computed_lt", "computed_lte", "computed_gt", "computed_gte",
  "reaction_class_lt", "reaction_class_lte", "reaction_class_gt", "reaction_class_gte",
];

// ============================================================
// 1. Plugin Loader — All 18 plugins load without error
// ============================================================

describe("Plugin Loader — All 18 plugins", () => {
  it("loads all 18 plugins", async () => {
    const plugins = getAvailablePlugins();
    expect(plugins.length).toBe(18);
  });

  it("each plugin has unique id", async () => {
    const plugins = getAvailablePlugins();
    const ids = plugins.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all regulation areas", async () => {
    const plugins = getAvailablePlugins();
    const allAreas = plugins.flatMap(p => p.areas);
    const expectedAreas = [
      "electrical", "fire_safety", "thermal",
      "acoustic", "structural", "water_drainage",
      "gas", "avac", "ited_itur",
      "accessibility", "energy", "elevators",
      "licensing", "waste", "drawings",
      "architecture", "general", "local",
    ];
    for (const area of expectedAreas) {
      expect(allAreas).toContain(area);
    }
  });
});

// ============================================================
// 2. Phase 1 plugins still load correctly
// ============================================================

describe("Phase 1 plugins — backward compatibility", () => {
  it("loads electrical plugin with rules", async () => {
    const plugin = loadElectricalPlugin();
    expect(plugin.id).toBe("electrical");
    expect(plugin.rules.length).toBeGreaterThan(0);
    expect(plugin.regulations.length).toBeGreaterThan(0);
  });

  it("loads fire safety plugin with lookup tables", async () => {
    const plugin = loadFireSafetyPlugin();
    expect(plugin.id).toBe("fire-safety");
    expect(plugin.rules.length).toBeGreaterThan(0);
    expect(plugin.lookupTables).toBeDefined();
    expect(plugin.lookupTables!.length).toBeGreaterThan(0);
  });

  it("loads thermal plugin with computed fields", async () => {
    const plugin = loadThermalPlugin();
    expect(plugin.id).toBe("thermal");
    expect(plugin.rules.length).toBeGreaterThan(0);
    expect(plugin.lookupTables).toBeDefined();
  });
});

// ============================================================
// 3. Phase 2 plugin individual loaders
// ============================================================

describe("Phase 2 — Individual plugin loaders", () => {
  const loaders: Array<[string, () => SpecialtyPlugin, string[]]> = [
    ["acoustic", loadAcousticPlugin, ["acoustic"]],
    ["structural", loadStructuralPlugin, ["structural"]],
    ["water-drainage", loadWaterDrainagePlugin, ["water_drainage"]],
    ["gas", loadGasPlugin, ["gas"]],
    ["hvac", loadHvacPlugin, ["avac"]],
    ["telecommunications", loadTelecomPlugin, ["ited_itur"]],
    ["accessibility", loadAccessibilityPlugin, ["accessibility"]],
    ["energy", loadEnergyPlugin, ["energy"]],
    ["elevators", loadElevatorsPlugin, ["elevators"]],
    ["licensing", loadLicensingPlugin, ["licensing"]],
    ["waste", loadWastePlugin, ["waste"]],
    ["drawings", loadDrawingsPlugin, ["drawings"]],
    ["architecture", loadArchitecturePlugin, ["architecture"]],
    ["general", loadGeneralPlugin, ["general"]],
    ["municipal", loadMunicipalPlugin, ["local"]],
  ];

  for (const [id, loader, areas] of loaders) {
    describe(`Plugin: ${id}`, () => {
      let plugin: SpecialtyPlugin;

      it("loads without error", async () => {
        plugin = loader();
        expect(plugin).toBeDefined();
        expect(plugin.id).toBe(id);
      });

      it("has correct metadata", async () => {
        plugin = loader();
        expect(plugin.name).toBeTruthy();
        expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(plugin.areas).toEqual(areas);
        expect(plugin.description).toBeTruthy();
        expect(plugin.author).toBeTruthy();
        expect(plugin.lastUpdated).toBeTruthy();
      });

      it("has regulations", async () => {
        plugin = loader();
        expect(plugin.regulations.length).toBeGreaterThan(0);
      });

      it("has rules", async () => {
        plugin = loader();
        expect(plugin.rules.length).toBeGreaterThan(0);
      });

      it("all rule IDs are unique within plugin", async () => {
        plugin = loader();
        const ruleIds = plugin.rules.map(r => r.id);
        expect(new Set(ruleIds).size).toBe(ruleIds.length);
      });

      it("all rules have valid structure", async () => {
        plugin = loader();
        for (const rule of plugin.rules) {
          expect(rule.id).toBeTruthy();
          expect(rule.regulationId).toBeTruthy();
          expect(rule.article).toBeDefined();
          expect(rule.description).toBeTruthy();
          expect(["critical", "warning", "info", "pass"]).toContain(rule.severity);
          expect(rule.conditions.length).toBeGreaterThan(0);
          expect(rule.remediation).toBeTruthy();
          expect(typeof rule.enabled).toBe("boolean");
          expect(Array.isArray(rule.tags)).toBe(true);
        }
      });

      it("all rule conditions have valid operators", async () => {
        plugin = loader();
        for (const rule of plugin.rules) {
          for (const cond of rule.conditions) {
            expect(cond.field).toBeTruthy();
            expect(VALID_OPERATORS).toContain(cond.operator);
          }
          if (rule.exclusions) {
            for (const excl of rule.exclusions) {
              expect(excl.field).toBeTruthy();
              expect(VALID_OPERATORS).toContain(excl.operator);
            }
          }
        }
      });

      it("regulation IDs are unique within plugin", async () => {
        plugin = loader();
        const regIds = plugin.regulations.map(r => r.id);
        expect(new Set(regIds).size).toBe(regIds.length);
      });

      it("rules reference existing regulations", async () => {
        plugin = loader();
        const regIds = new Set(plugin.regulations.map(r => r.id));
        for (const rule of plugin.rules) {
          expect(regIds.has(rule.regulationId)).toBe(true);
        }
      });
    });
  }
});

// ============================================================
// 4. getPluginForArea — area lookup works for all areas
// ============================================================

describe("getPluginForArea — area lookup", () => {
  const areaMappings: Array<[string, string]> = [
    ["electrical", "electrical"],
    ["fire_safety", "fire-safety"],
    ["thermal", "thermal"],
    ["acoustic", "acoustic"],
    ["structural", "structural"],
    ["water_drainage", "water-drainage"],
    ["gas", "gas"],
    ["avac", "hvac"],
    ["ited_itur", "telecommunications"],
    ["accessibility", "accessibility"],
    ["energy", "energy"],
    ["elevators", "elevators"],
    ["licensing", "licensing"],
    ["waste", "waste"],
    ["drawings", "drawings"],
    ["architecture", "architecture"],
    ["general", "general"],
    ["local", "municipal"],
  ];

  for (const [area, expectedPluginId] of areaMappings) {
    it(`finds plugin for area "${area}"`, () => {
      const plugin = getPluginForArea(area);
      expect(plugin).toBeDefined();
      expect(plugin!.id).toBe(expectedPluginId);
    });
  }
});

// ============================================================
// 5. Lookup tables validation
// ============================================================

describe("Lookup tables — structure validation", () => {
  it("acoustic plugin has lookup tables", async () => {
    const plugin = loadAcousticPlugin();
    expect(plugin.lookupTables).toBeDefined();
    expect(plugin.lookupTables!.length).toBeGreaterThan(0);
    for (const table of plugin.lookupTables!) {
      expect(table.id).toBeTruthy();
      expect(table.description).toBeTruthy();
      expect(table.keys.length).toBeGreaterThan(0);
      expect(Object.keys(table.values).length).toBeGreaterThan(0);
    }
  });

  it("structural plugin has lookup tables", async () => {
    const plugin = loadStructuralPlugin();
    expect(plugin.lookupTables).toBeDefined();
    expect(plugin.lookupTables!.length).toBeGreaterThan(0);
  });

  it("fire-safety plugin has lookup tables", async () => {
    const plugin = loadFireSafetyPlugin();
    expect(plugin.lookupTables).toBeDefined();
    expect(plugin.lookupTables!.length).toBeGreaterThan(0);
  });

  it("telecommunications plugin has lookup tables", async () => {
    const plugin = loadTelecomPlugin();
    expect(plugin.lookupTables).toBeDefined();
    expect(plugin.lookupTables!.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 6. Computed fields validation
// ============================================================

describe("Computed fields — structure validation", () => {
  it("general plugin has computed fields", async () => {
    const plugin = loadGeneralPlugin();
    expect(plugin.computedFields).toBeDefined();
    expect(plugin.computedFields!.length).toBeGreaterThan(0);
    for (const field of plugin.computedFields!) {
      expect(field.id).toBeTruthy();
      expect(field.description).toBeTruthy();
      expect(field.computation).toBeDefined();
      expect(["arithmetic", "tier", "conditional"]).toContain(field.computation.type);
    }
  });

  it("telecommunications plugin has computed fields", async () => {
    const plugin = loadTelecomPlugin();
    expect(plugin.computedFields).toBeDefined();
    expect(plugin.computedFields!.length).toBeGreaterThan(0);
  });

  it("accessibility plugin has computed fields", async () => {
    const plugin = loadAccessibilityPlugin();
    expect(plugin.computedFields).toBeDefined();
    expect(plugin.computedFields!.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 7. Rule counts — sanity check
// ============================================================

describe("Rule counts — each specialty has expected minimum rules", () => {
  const expectedMinRules: Array<[string, () => SpecialtyPlugin, number]> = [
    ["electrical", loadElectricalPlugin, 10],
    ["fire-safety", loadFireSafetyPlugin, 5],
    ["thermal", loadThermalPlugin, 5],
    ["acoustic", loadAcousticPlugin, 5],
    ["structural", loadStructuralPlugin, 4],
    ["water-drainage", loadWaterDrainagePlugin, 8],
    ["gas", loadGasPlugin, 5],
    ["hvac", loadHvacPlugin, 7],
    ["telecommunications", loadTelecomPlugin, 10],
    ["accessibility", loadAccessibilityPlugin, 8],
    ["energy", loadEnergyPlugin, 5],
    ["elevators", loadElevatorsPlugin, 6],
    ["licensing", loadLicensingPlugin, 7],
    ["waste", loadWastePlugin, 5],
    ["drawings", loadDrawingsPlugin, 8],
    ["architecture", loadArchitecturePlugin, 8],
    ["general", loadGeneralPlugin, 2],
    ["municipal", loadMunicipalPlugin, 2],
  ];

  for (const [id, loader, minRules] of expectedMinRules) {
    it(`${id} has at least ${minRules} rules`, () => {
      const plugin = loader();
      expect(plugin.rules.length).toBeGreaterThanOrEqual(minRules);
    });
  }
});

// ============================================================
// 8. Total rule count across all plugins
// ============================================================

describe("Total rule count", () => {
  it("has at least 120 total rules across all plugins", async () => {
    const plugins = getAvailablePlugins();
    const totalRules = plugins.reduce((sum, p) => sum + p.rules.length, 0);
    expect(totalRules).toBeGreaterThanOrEqual(120);
  });

  it("has at least 25 total regulations across all plugins", async () => {
    const plugins = getAvailablePlugins();
    const totalRegs = plugins.reduce((sum, p) => sum + p.regulations.length, 0);
    expect(totalRegs).toBeGreaterThanOrEqual(25);
  });
});

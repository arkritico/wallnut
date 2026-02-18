/**
 * Tests for Lookup Table Evaluation
 *
 * Validates:
 * - 1D lookup resolution (thermal: climate zone → U-value threshold)
 * - 2D lookup resolution (fire-safety: buildingType × riskCategory → resistance)
 * - 2D + subKey resolution (fire-safety: detection required → boolean)
 * - Missing key graceful handling (no crash, condition returns false)
 * - Non-existent table graceful handling (no false positive)
 * - End-to-end: evaluatePlugin produces findings from lookup rules
 */

import { describe, it, expect, beforeEach } from "vitest";
import { evaluatePlugin, resetPluginFindingCounter } from "@/lib/plugins/rule-engine";
import {
  loadThermalPlugin,
  loadFireSafetyPlugin,
  loadPluginFromJson,
  resetPluginSystem,
} from "@/lib/plugins/loader";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject } from "@/lib/types";
import type { SpecialtyPlugin, LookupTable, DeclarativeRule } from "@/lib/plugins/types";

// Helper to create a deep-merged project from defaults
function makeProject(overrides: Record<string, unknown>): BuildingProject {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT)) as Record<string, unknown>;

  for (const [key, value] of Object.entries(overrides)) {
    const parts = key.split(".");
    let current = project;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  return project as unknown as BuildingProject;
}

describe("Lookup Table Evaluation", () => {
  beforeEach(() => {
    resetPluginSystem();
    resetPluginFindingCounter();
  });

  // ============================================================
  // 1. Thermal Plugin — 1D Lookup (climate zone → U-value)
  // ============================================================
  describe("1D Lookup — Thermal U-values", () => {
    it("should fire when wall U-value exceeds max for climate zone I2", () => {
      const thermal = loadThermalPlugin();
      const project = makeProject({
        "location.climateZoneWinter": "I2",
        "envelope.externalWallUValue": 0.45, // Above max 0.40 for I2
      });

      const result = evaluatePlugin(thermal, project);

      // Should find a critical finding for the wall U-value violation
      const wallFinding = result.findings.find(
        (f) => f.description.includes("paredes exteriores") && f.severity === "critical"
      );
      expect(wallFinding).toBeDefined();
      expect(wallFinding!.severity).toBe("critical");
    });

    it("should NOT fire when wall U-value is within max for climate zone I1", () => {
      const thermal = loadThermalPlugin();
      const project = makeProject({
        "location.climateZoneWinter": "I1",
        "envelope.externalWallUValue": 0.45, // Below max 0.50 for I1
      });

      const result = evaluatePlugin(thermal, project);

      const wallFinding = result.findings.find(
        (f) => f.description.includes("paredes exteriores") && f.severity === "critical"
      );
      expect(wallFinding).toBeUndefined();
    });

    it("should resolve different thresholds per climate zone", () => {
      const thermal = loadThermalPlugin();

      // I3 has the strictest limit (0.35)
      const projectI3 = makeProject({
        "location.climateZoneWinter": "I3",
        "envelope.externalWallUValue": 0.36, // Above 0.35 for I3
      });
      const resultI3 = evaluatePlugin(thermal, projectI3);
      const findingI3 = resultI3.findings.find(
        (f) => f.description.includes("paredes exteriores") && f.severity === "critical"
      );
      expect(findingI3).toBeDefined();

      // Same value should be OK in I1 (limit 0.50)
      resetPluginFindingCounter();
      const projectI1 = makeProject({
        "location.climateZoneWinter": "I1",
        "envelope.externalWallUValue": 0.36,
      });
      const resultI1 = evaluatePlugin(thermal, projectI1);
      const findingI1 = resultI1.findings.find(
        (f) => f.description.includes("paredes exteriores") && f.severity === "critical"
      );
      expect(findingI1).toBeUndefined();
    });

    it("should include resolved threshold in requiredValue", () => {
      const thermal = loadThermalPlugin();
      const project = makeProject({
        "location.climateZoneWinter": "I2",
        "envelope.externalWallUValue": 0.45,
      });

      const result = evaluatePlugin(thermal, project);
      const finding = result.findings.find(
        (f) => f.description.includes("paredes exteriores") && f.severity === "critical"
      );
      expect(finding).toBeDefined();
      // The resolved threshold should appear (≤ 0.40 or similar)
      expect(finding!.requiredValue).toMatch(/0\.40/);
    });
  });

  // ============================================================
  // 2. Fire Safety — 2D Lookup (buildingType × riskCategory)
  // ============================================================
  describe("2D Lookup — Fire Safety resistance", () => {
    it("should fire when fire resistance is below minimum for residential cat 2", () => {
      const fireSafety = loadFireSafetyPlugin();
      const project = makeProject({
        buildingType: "residential",
        "fireSafety.riskCategory": "2",
        "fireSafety.fireResistanceOfStructure": 30, // Below 60 min required
      });

      const result = evaluatePlugin(fireSafety, project);
      const resFinding = result.findings.find(
        (f) => f.description.includes("resistência ao fogo") && f.severity === "critical"
      );
      expect(resFinding).toBeDefined();
    });

    it("should NOT fire when fire resistance meets minimum", () => {
      const fireSafety = loadFireSafetyPlugin();
      const project = makeProject({
        buildingType: "residential",
        "fireSafety.riskCategory": "2",
        "fireSafety.fireResistanceOfStructure": 60, // Meets 60 min required
      });

      const result = evaluatePlugin(fireSafety, project);
      const resFinding = result.findings.find(
        (f) => f.description.includes("resistência ao fogo") && f.severity === "critical"
      );
      expect(resFinding).toBeUndefined();
    });

    it("should resolve different thresholds per risk category", () => {
      const fireSafety = loadFireSafetyPlugin();

      // Cat 3 requires 90 min
      const project3 = makeProject({
        buildingType: "commercial",
        "fireSafety.riskCategory": "3",
        "fireSafety.fireResistanceOfStructure": 60, // Below 90
      });
      const result3 = evaluatePlugin(fireSafety, project3);
      const finding3 = result3.findings.find(
        (f) => f.description.includes("resistência ao fogo") && f.severity === "critical"
      );
      expect(finding3).toBeDefined();
    });
  });

  // ============================================================
  // 3. 2D + subKey Lookup (fire detection required)
  // ============================================================
  describe("2D + subKey Lookup", () => {
    it("subKey resolves nested value for numeric comparison", () => {
      // Use subKey to extract a numeric threshold from a nested object
      const plugin = loadPluginFromJson(
        {
          id: "test-subkey-num",
          name: "Test SubKey Numeric",
          version: "1.0.0",
          areas: ["general"],
          description: "Test",
          author: "test",
          lastUpdated: "2026-02-17",
        },
        {
          regulations: [
            {
              id: "syn-reg",
              shortRef: "SYN",
              title: "Synthetic",
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
            },
          ],
        },
        [
          {
            rules: [
              {
                id: "SUBKEY-NUM",
                regulationId: "syn-reg",
                article: "Art. 1",
                description: "Below threshold",
                severity: "critical" as const,
                conditions: [
                  {
                    field: "fireSafety.fireResistanceOfStructure",
                    operator: "lookup_lt" as const,
                    value: null,
                    table: "nested_thresholds",
                    keys: ["buildingType", "fireSafety.riskCategory"],
                  },
                ],
                remediation: "Fix",
                enabled: true,
                tags: [],
              },
            ],
          },
        ],
        {
          tables: [
            {
              id: "nested_thresholds",
              description: "Thresholds with subKey",
              keys: ["buildingType", "fireSafety.riskCategory"],
              subKey: "min",
              values: {
                residential: {
                  "1": { min: 30, max: 120 },
                  "2": { min: 60, max: 120 },
                },
              },
            },
          ],
        }
      );

      // Cat 2 requires min=60, structure has 30 → 30 < 60 → fires
      const project = makeProject({
        buildingType: "residential",
        "fireSafety.riskCategory": "2",
        "fireSafety.fireResistanceOfStructure": 30,
      });
      const result = evaluatePlugin(plugin, project);
      expect(result.findings.length).toBe(1);

      // Cat 1 requires min=30, structure has 30 → 30 < 30 is false → no finding
      resetPluginFindingCounter();
      const project2 = makeProject({
        buildingType: "residential",
        "fireSafety.riskCategory": "1",
        "fireSafety.fireResistanceOfStructure": 30,
      });
      const result2 = evaluatePlugin(plugin, project2);
      expect(result2.findings.length).toBe(0);
    });
  });

  // ============================================================
  // 4. Missing Key — Graceful Handling
  // ============================================================
  describe("Missing key handling", () => {
    it("should skip rule when lookup key field is undefined", () => {
      const thermal = loadThermalPlugin();
      // Project without climateZoneWinter
      const project = makeProject({
        "envelope.externalWallUValue": 0.45,
      });
      // Remove the climate zone
      (project as Record<string, unknown>).location = {
        municipality: "Lisboa",
        district: "Lisboa",
      };

      // Should not crash, should skip the rule
      const result = evaluatePlugin(thermal, project);
      // No wall finding should appear (can't resolve threshold)
      const wallFinding = result.findings.find(
        (f) => f.description.includes("paredes exteriores") && f.severity === "critical"
      );
      expect(wallFinding).toBeUndefined();
    });

    it("should not crash when project field for lookup is missing", () => {
      const fireSafety = loadFireSafetyPlugin();
      const project = makeProject({
        buildingType: "residential",
        // riskCategory is missing — lookup should return undefined
      });
      delete (project as Record<string, unknown> & { fireSafety: Record<string, unknown> })
        .fireSafety.riskCategory;

      expect(() => evaluatePlugin(fireSafety, project)).not.toThrow();
    });
  });

  // ============================================================
  // 5. Non-existent Table — No False Positive
  // ============================================================
  describe("Non-existent table handling", () => {
    it("should return false for condition referencing missing table", () => {
      // Create a minimal plugin with a rule referencing a non-existent table
      const plugin = loadPluginFromJson(
        {
          id: "test-lookup-missing",
          name: "Test Missing Table",
          version: "1.0.0",
          areas: ["general"],
          description: "Test",
          author: "test",
          lastUpdated: "2026-02-17",
        },
        {
          regulations: [
            {
              id: "test-reg",
              shortRef: "Test",
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
            },
          ],
        },
        [
          {
            rules: [
              {
                id: "TEST-MISSING-TABLE",
                regulationId: "test-reg",
                article: "Art. 1",
                description: "Test missing table rule",
                severity: "critical" as const,
                conditions: [
                  {
                    field: "envelope.externalWallUValue",
                    operator: "lookup_gt" as const,
                    value: null,
                    table: "non_existent_table",
                    keys: ["buildingType"],
                  },
                ],
                remediation: "Fix it",
                enabled: true,
                tags: ["test"],
              },
            ],
          },
        ]
        // No lookup tables passed
      );

      const project = makeProject({
        "envelope.externalWallUValue": 999, // Huge value
      });

      const result = evaluatePlugin(plugin, project);
      // Rule should NOT fire (table doesn't exist → condition returns false)
      expect(result.findings.length).toBe(0);
    });
  });

  // ============================================================
  // 6. Synthetic lookup table tests (controlled values)
  // ============================================================
  describe("Synthetic lookup table evaluation", () => {
    function makeSyntheticPlugin(
      tables: LookupTable[],
      rules: DeclarativeRule[]
    ): SpecialtyPlugin {
      return loadPluginFromJson(
        {
          id: "synthetic-lookup",
          name: "Synthetic Lookup",
          version: "1.0.0",
          areas: ["general"],
          description: "Test",
          author: "test",
          lastUpdated: "2026-02-17",
        },
        {
          regulations: [
            {
              id: "syn-reg",
              shortRef: "SYN",
              title: "Synthetic",
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
              rulesCount: rules.length,
              tags: [],
              notes: "",
            },
          ],
        },
        [{ rules }],
        { tables }
      );
    }

    it("lookup_gt: fires when field > table value", () => {
      const plugin = makeSyntheticPlugin(
        [
          {
            id: "threshold",
            description: "Test threshold",
            keys: ["buildingType"],
            values: { residential: 100, commercial: 200 },
          },
        ],
        [
          {
            id: "SYN-GT",
            regulationId: "syn-reg",
            article: "Art. 1",
            description: "Value exceeds threshold",
            severity: "warning",
            conditions: [
              { field: "grossFloorArea", operator: "lookup_gt", value: null, table: "threshold", keys: ["buildingType"] },
            ],
            remediation: "Reduce value",
            enabled: true,
            tags: [],
          },
        ]
      );

      // grossFloorArea = 150, threshold for residential = 100 → 150 > 100 → fires
      const result = evaluatePlugin(plugin, makeProject({ grossFloorArea: 150 }));
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].severity).toBe("warning");
    });

    it("lookup_gt: does NOT fire when field <= table value", () => {
      const plugin = makeSyntheticPlugin(
        [
          {
            id: "threshold",
            description: "Test",
            keys: ["buildingType"],
            values: { residential: 200 },
          },
        ],
        [
          {
            id: "SYN-GT2",
            regulationId: "syn-reg",
            article: "Art. 1",
            description: "Test",
            severity: "warning",
            conditions: [
              { field: "grossFloorArea", operator: "lookup_gt", value: null, table: "threshold", keys: ["buildingType"] },
            ],
            remediation: "Fix",
            enabled: true,
            tags: [],
          },
        ]
      );

      // grossFloorArea = 150, threshold = 200 → 150 > 200 is false → no finding
      const result = evaluatePlugin(plugin, makeProject({ grossFloorArea: 150 }));
      expect(result.findings.length).toBe(0);
    });

    it("lookup_lt: fires when field < table value", () => {
      const plugin = makeSyntheticPlugin(
        [
          {
            id: "minimum",
            description: "Minimum threshold",
            keys: ["buildingType"],
            values: { residential: 200 },
          },
        ],
        [
          {
            id: "SYN-LT",
            regulationId: "syn-reg",
            article: "Art. 1",
            description: "Below minimum",
            severity: "critical",
            conditions: [
              { field: "grossFloorArea", operator: "lookup_lt", value: null, table: "minimum", keys: ["buildingType"] },
            ],
            remediation: "Increase",
            enabled: true,
            tags: [],
          },
        ]
      );

      const result = evaluatePlugin(plugin, makeProject({ grossFloorArea: 150 }));
      expect(result.findings.length).toBe(1);
    });

    it("lookup_eq: fires when field == table value (boolean)", () => {
      const plugin = makeSyntheticPlugin(
        [
          {
            id: "required",
            description: "Required boolean",
            keys: ["buildingType"],
            values: { residential: true },
          },
        ],
        [
          {
            id: "SYN-EQ",
            regulationId: "syn-reg",
            article: "Art. 1",
            description: "Matches required value",
            severity: "warning",
            conditions: [
              { field: "fireSafety.hasFireDetection", operator: "lookup_eq", value: null, table: "required", keys: ["buildingType"] },
            ],
            remediation: "Fix",
            enabled: true,
            tags: [],
          },
        ]
      );

      // hasFireDetection = false in DEFAULT_PROJECT, table says true → false === true → no match
      const result = evaluatePlugin(plugin, makeProject({}));
      expect(result.findings.length).toBe(0);

      // With detection = true → true === true → fires
      resetPluginFindingCounter();
      const result2 = evaluatePlugin(
        plugin,
        makeProject({ "fireSafety.hasFireDetection": true })
      );
      expect(result2.findings.length).toBe(1);
    });

    it("2D table with subKey resolves correctly", () => {
      const plugin = makeSyntheticPlugin(
        [
          {
            id: "nested",
            description: "2D with subKey",
            keys: ["buildingType", "fireSafety.riskCategory"],
            subKey: "threshold",
            values: {
              residential: {
                "1": { threshold: 30, label: "low" },
                "2": { threshold: 60, label: "medium" },
              },
            },
          },
        ],
        [
          {
            id: "SYN-2D",
            regulationId: "syn-reg",
            article: "Art. 1",
            description: "Below 2D threshold",
            severity: "critical",
            conditions: [
              {
                field: "fireSafety.fireResistanceOfStructure",
                operator: "lookup_lt",
                value: null,
                table: "nested",
                keys: ["buildingType", "fireSafety.riskCategory"],
              },
            ],
            remediation: "Increase",
            enabled: true,
            tags: [],
          },
        ]
      );

      // Cat 2 requires 60, structure has 30 → fires
      const result = evaluatePlugin(
        plugin,
        makeProject({
          buildingType: "residential",
          "fireSafety.riskCategory": "2",
          "fireSafety.fireResistanceOfStructure": 30,
        })
      );
      expect(result.findings.length).toBe(1);

      // Cat 1 requires 30, structure has 30 → 30 < 30 is false → no finding
      resetPluginFindingCounter();
      const result2 = evaluatePlugin(
        plugin,
        makeProject({
          buildingType: "residential",
          "fireSafety.riskCategory": "1",
          "fireSafety.fireResistanceOfStructure": 30,
        })
      );
      expect(result2.findings.length).toBe(0);
    });
  });
});

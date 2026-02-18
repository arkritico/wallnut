/**
 * Tests for the Declarative Rule Engine
 *
 * Validates:
 * - Empty plugin produces no findings
 * - Direct comparison operators (==, >, exists, not_exists, between, in)
 * - Rules skip when field is missing from project
 * - Exclusions prevent rule from firing
 * - Disabled rules are ignored
 * - Lookup table operators (lookup_gte)
 * - Ordinal operators (ordinal_lt with custom scale)
 * - Multiple AND conditions
 * - Finding shape (id, area, description, severity, remediation)
 * - Computed fields (arithmetic divide)
 * - Counter reset between tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { evaluatePlugin, evaluateComputedFields, resetPluginFindingCounter } from "@/lib/plugins/rule-engine";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type {
  SpecialtyPlugin,
  DeclarativeRule,
  LookupTable,
  ComputedField,
  RegulationDocument,
} from "@/lib/plugins/types";

// ------------------------------------------------------------------
// Helper: build a minimal plugin from partial rule definitions
// ------------------------------------------------------------------

function makePlugin(
  rules: Partial<DeclarativeRule>[],
  opts?: { lookupTables?: LookupTable[]; computedFields?: ComputedField[] }
): SpecialtyPlugin {
  const fullRules: DeclarativeRule[] = rules.map((r, i) => ({
    id: r.id ?? `test-rule-${i}`,
    regulationId: r.regulationId ?? "test-reg",
    article: r.article ?? "Art. 1",
    description: r.description ?? "Test description",
    severity: r.severity ?? "warning",
    conditions: r.conditions ?? [],
    exclusions: r.exclusions,
    enabled: r.enabled !== false,
    currentValueTemplate: r.currentValueTemplate,
    requiredValue: r.requiredValue,
    remediation: r.remediation ?? "Fix it",
    tags: r.tags ?? [],
  }));

  const regulation: RegulationDocument = {
    id: "test-reg",
    shortRef: "TEST",
    title: "Test Regulation",
    status: "active",
    effectiveDate: "2024-01-01",
    revocationDate: null,
    amendedBy: [],
    supersededBy: null,
    amends: [],
    sourceType: "manual_extract",
    sourceUrl: null,
    sourceFile: null,
    legalForce: "regulatory",
    area: "general" as RegulationDocument["area"],
    ingestionStatus: "complete",
    ingestionDate: "2024-01-01",
    verifiedBy: null,
    rulesCount: fullRules.length,
    tags: [],
    notes: "",
  };

  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    areas: ["general" as SpecialtyPlugin["areas"][number]],
    description: "Plugin for unit tests",
    author: "test",
    lastUpdated: "2024-01-01",
    regulations: [regulation],
    rules: fullRules,
    lookupTables: opts?.lookupTables,
    computedFields: opts?.computedFields,
  };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("evaluatePlugin", () => {
  beforeEach(() => {
    resetPluginFindingCounter();
  });

  // 1. Empty plugin returns no findings
  it("returns no findings for a plugin with no rules", () => {
    const plugin = makePlugin([]);
    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);

    expect(result.findings).toHaveLength(0);
    expect(result.pluginId).toBe("test-plugin");
    expect(result.pluginVersion).toBe("1.0.0");
    expect(result.totalActiveRules).toBe(0);
    expect(result.rulesSkipped).toHaveLength(0);
    expect(result.evaluatedAt).toBeTruthy();
  });

  // 2. Simple == condition fires
  it("fires a rule when == condition matches", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingType", operator: "==", value: "residential" }],
        description: "Building is residential",
        severity: "info",
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toBe("Building is residential");
    expect(result.findings[0].severity).toBe("info");
  });

  // 2b. == condition does NOT fire when value differs
  it("does not fire when == condition does not match", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingType", operator: "==", value: "commercial" }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  // 3. Simple > condition fires (or not)
  it("does not fire > condition when project value is below threshold", () => {
    // DEFAULT_PROJECT.buildingHeight = 6, so 6 > 10 is false
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingHeight", operator: ">", value: 10 }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  it("fires > condition when project value exceeds threshold", () => {
    // DEFAULT_PROJECT.buildingHeight = 6, so 6 > 5 is true
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingHeight", operator: ">", value: 5 }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  // 4. exists operator
  it("exists returns true for a truthy field", () => {
    // DEFAULT_PROJECT.fireSafety.hasFireAlarm = true (truthy)
    const plugin = makePlugin([
      {
        conditions: [{ field: "fireSafety.hasFireAlarm", operator: "exists", value: true }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  it("exists returns false for a false-valued field", () => {
    // DEFAULT_PROJECT.fireSafety.hasFireDetection = false
    // exists treats false as not-existing
    const plugin = makePlugin([
      {
        conditions: [{ field: "fireSafety.hasFireDetection", operator: "exists", value: true }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  it("exists returns false for an undefined field", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "completely.nonexistent.path", operator: "exists", value: true }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  // 5. not_exists operator
  it("not_exists fires for an undefined field", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "totally.missing.field", operator: "not_exists", value: true }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  it("not_exists fires for a false-valued field", () => {
    // fireSafety.hasFireDetection = false, and not_exists treats false as missing
    const plugin = makePlugin([
      {
        conditions: [{ field: "fireSafety.hasFireDetection", operator: "not_exists", value: true }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  it("not_exists does not fire for a truthy field", () => {
    // fireSafety.hasFireAlarm = true
    const plugin = makePlugin([
      {
        conditions: [{ field: "fireSafety.hasFireAlarm", operator: "not_exists", value: true }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  // 6. Rules skip when field is missing
  it("adds rule to rulesSkipped when a non-exists field cannot be resolved", () => {
    // A direct comparison (==) against a field that doesn't exist in the project
    // causes the canEvaluate check to fail, adding the rule to rulesSkipped
    const plugin = makePlugin([
      {
        id: "missing-field-rule",
        conditions: [{ field: "nonexistent.deep.path", operator: "==", value: "something" }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
    expect(result.rulesSkipped).toContain("missing-field-rule");
  });

  // 7. Exclusions prevent firing
  it("does not fire when exclusion condition is met", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingType", operator: "==", value: "residential" }],
        // Exclusion: if building has 2 floors, exclude this rule
        exclusions: [{ field: "numberOfFloors", operator: "==", value: 2 }],
        description: "Should be excluded",
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    // Condition matches (residential), but exclusion also matches (2 floors)
    expect(result.findings).toHaveLength(0);
  });

  it("fires when exclusion condition is NOT met", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingType", operator: "==", value: "residential" }],
        // Exclusion: if building has 10 floors, exclude (won't match)
        exclusions: [{ field: "numberOfFloors", operator: "==", value: 10 }],
        description: "Should fire because exclusion does not match",
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  // 8. Disabled rules don't fire
  it("does not evaluate disabled rules", () => {
    const plugin = makePlugin([
      {
        enabled: false,
        conditions: [{ field: "buildingType", operator: "==", value: "residential" }],
        description: "This rule is disabled",
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
    // Disabled rules are filtered out by getActiveRules(), so totalActiveRules = 0
    expect(result.totalActiveRules).toBe(0);
  });

  // 9. between operator
  it("fires when value is within between range", () => {
    // DEFAULT_PROJECT.buildingHeight = 6, between [3, 10] should fire
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingHeight", operator: "between", value: [3, 10] }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  it("does not fire when value is outside between range", () => {
    // DEFAULT_PROJECT.buildingHeight = 6, between [10, 30] should not fire
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingHeight", operator: "between", value: [10, 30] }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  it("fires between at boundaries (inclusive)", () => {
    // DEFAULT_PROJECT.buildingHeight = 6, between [6, 6] is inclusive
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingHeight", operator: "between", value: [6, 6] }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  // 10. in operator
  it("fires when value is in the provided array", () => {
    // DEFAULT_PROJECT.buildingType = "residential"
    const plugin = makePlugin([
      {
        conditions: [
          { field: "buildingType", operator: "in", value: ["residential", "commercial", "mixed"] },
        ],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  it("does not fire when value is not in the provided array", () => {
    const plugin = makePlugin([
      {
        conditions: [
          { field: "buildingType", operator: "in", value: ["commercial", "industrial"] },
        ],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  // 11. Lookup table operator (lookup_gte)
  it("fires lookup_gte when field value meets table threshold", () => {
    const lookupTable: LookupTable = {
      id: "height-limits",
      description: "Max building height by type",
      keys: ["buildingType"],
      values: {
        residential: 5,
        commercial: 10,
      },
    };

    // DEFAULT_PROJECT.buildingHeight = 6, lookup for "residential" = 5 => 6 >= 5 is true
    const plugin = makePlugin(
      [
        {
          conditions: [
            {
              field: "buildingHeight",
              operator: "lookup_gte",
              table: "height-limits",
              keys: ["buildingType"],
              value: undefined,
            },
          ],
          description: "Height meets or exceeds limit",
        },
      ],
      { lookupTables: [lookupTable] }
    );

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  it("does not fire lookup_gte when field value is below table threshold", () => {
    const lookupTable: LookupTable = {
      id: "height-limits",
      description: "Max building height by type",
      keys: ["buildingType"],
      values: {
        residential: 10,
        commercial: 20,
      },
    };

    // DEFAULT_PROJECT.buildingHeight = 6, lookup for "residential" = 10 => 6 >= 10 is false
    const plugin = makePlugin(
      [
        {
          conditions: [
            {
              field: "buildingHeight",
              operator: "lookup_gte",
              table: "height-limits",
              keys: ["buildingType"],
              value: undefined,
            },
          ],
        },
      ],
      { lookupTables: [lookupTable] }
    );

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  // 12. Ordinal operator (ordinal_lt)
  it("fires ordinal_lt when field ranks below threshold in scale", () => {
    // DEFAULT_PROJECT.fireSafety.riskCategory = "1"
    // Scale: ["1", "2", "3", "4"] => index 0 < index 1 => ordinal_lt fires
    const plugin = makePlugin([
      {
        conditions: [
          {
            field: "fireSafety.riskCategory",
            operator: "ordinal_lt",
            value: "2",
            scale: ["1", "2", "3", "4"],
          },
        ],
        description: "Risk category is below 2",
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
  });

  it("does not fire ordinal_lt when field ranks at or above threshold", () => {
    // DEFAULT_PROJECT.fireSafety.riskCategory = "1"
    // Scale: ["1", "2", "3", "4"] => index 0 < index 0 is false (ordinal_lt with value "1")
    const plugin = makePlugin([
      {
        conditions: [
          {
            field: "fireSafety.riskCategory",
            operator: "ordinal_lt",
            value: "1",
            scale: ["1", "2", "3", "4"],
          },
        ],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  // 13. Multiple conditions (AND)
  it("fires only when ALL conditions are met", () => {
    const plugin = makePlugin([
      {
        conditions: [
          { field: "buildingType", operator: "==", value: "residential" },
          { field: "numberOfFloors", operator: ">=", value: 2 },
          { field: "buildingHeight", operator: "<", value: 10 },
        ],
        description: "Residential, 2+ floors, under 10m",
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    // residential=true, numberOfFloors(2)>=2=true, buildingHeight(6)<10=true => all match
    expect(result.findings).toHaveLength(1);
  });

  it("does not fire when one of multiple conditions fails", () => {
    const plugin = makePlugin([
      {
        conditions: [
          { field: "buildingType", operator: "==", value: "residential" },
          { field: "numberOfFloors", operator: ">=", value: 2 },
          { field: "buildingHeight", operator: ">", value: 100 }, // fails: 6 > 100
        ],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });

  // 14. Finding has correct shape
  it("produces findings with the correct shape", () => {
    const plugin = makePlugin([
      {
        id: "shape-test-rule",
        article: "Art. 42",
        description: "Height is {buildingHeight}m",
        severity: "critical",
        conditions: [{ field: "buildingType", operator: "==", value: "residential" }],
        remediation: "Consult an engineer",
        currentValueTemplate: "{buildingHeight}m",
        requiredValue: "Above 10m",
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);

    const finding = result.findings[0];
    expect(finding.id).toMatch(/^PF-\d+$/);
    expect(finding.area).toBe("general");
    expect(finding.regulation).toBe("TEST");
    expect(finding.article).toBe("Art. 42");
    expect(finding.description).toBe("Height is 6m");
    expect(finding.severity).toBe("critical");
    expect(finding.remediation).toBe("Consult an engineer");
    expect(finding.currentValue).toBe("6m");
    expect(finding.requiredValue).toBe("Above 10m");
  });

  // 15. Computed fields (arithmetic divide)
  it("evaluates arithmetic computed fields and uses them in rules", () => {
    // DEFAULT_PROJECT: buildingHeight = 6, numberOfFloors = 2
    // Computed: avgFloorHeight = 6 / 2 = 3
    const computedField: ComputedField = {
      id: "avgFloorHeight",
      description: "Average floor height",
      computation: {
        type: "arithmetic",
        operands: ["buildingHeight", "numberOfFloors"],
        operation: "divide",
      },
    };

    const plugin = makePlugin(
      [
        {
          conditions: [
            { field: "computed.avgFloorHeight", operator: "<", value: 3.5 },
          ],
          description: "Average floor height is below 3.5m",
          currentValueTemplate: "{computed.avgFloorHeight}m",
        },
      ],
      { computedFields: [computedField] }
    );

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toBe("Average floor height is below 3.5m");
    // 6/2 = 3 (integer, so interpolate formats without decimals)
    expect(result.findings[0].currentValue).toBe("3m");
  });

  it("computed divide by zero yields undefined and rule does not fire", () => {
    const computedField: ComputedField = {
      id: "ratio",
      description: "Ratio with zero denominator",
      computation: {
        type: "arithmetic",
        operands: ["buildingHeight", "elevators.numberOfElevators"],
        operation: "divide",
      },
    };

    // numberOfElevators = 0 => divide by zero => undefined
    // condition < 100 on undefined should not fire
    const plugin = makePlugin(
      [
        {
          conditions: [
            { field: "computed.ratio", operator: "<", value: 100 },
          ],
        },
      ],
      { computedFields: [computedField] }
    );

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
  });
});

describe("resetPluginFindingCounter", () => {
  it("resets finding IDs to start from PF-5001", () => {
    // First evaluation produces some findings with IDs
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingType", operator: "==", value: "residential" }],
      },
    ]);

    resetPluginFindingCounter();
    const result1 = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result1.findings[0].id).toBe("PF-5001");

    // Without resetting, next finding would be PF-5002
    const result2 = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result2.findings[0].id).toBe("PF-5002");

    // After resetting, it starts back at PF-5001
    resetPluginFindingCounter();
    const result3 = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result3.findings[0].id).toBe("PF-5001");
  });
});

describe("evaluatePlugin — result metadata", () => {
  beforeEach(() => {
    resetPluginFindingCounter();
  });

  it("reports regulationsUsed when rules fire", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingType", operator: "==", value: "residential" }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.regulationsUsed).toContain("test-reg");
  });

  it("does not report regulationsUsed when no rules fire", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingType", operator: "==", value: "commercial" }],
      },
    ]);

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.regulationsUsed).toHaveLength(0);
  });

  it("skips superseded regulations", () => {
    const plugin = makePlugin([
      {
        conditions: [{ field: "buildingType", operator: "==", value: "residential" }],
      },
    ]);

    // Mark the regulation as superseded — its rules should not be evaluated
    plugin.regulations[0].status = "superseded";

    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);
    expect(result.findings).toHaveLength(0);
    expect(result.regulationsSkipped).toContain("test-reg");
    expect(result.totalActiveRules).toBe(0);
  });

  it("includes evaluatedAt as an ISO timestamp", () => {
    const plugin = makePlugin([]);
    const result = evaluatePlugin(plugin, DEFAULT_PROJECT);

    // Verify the evaluatedAt is a valid ISO date string
    const parsed = new Date(result.evaluatedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });
});

// ------------------------------------------------------------------
// Cross-plugin computed fields (P5: global pre-computation)
// ------------------------------------------------------------------

describe("evaluateComputedFields — global pre-computation", () => {
  it("evaluates arithmetic computed fields from project data", () => {
    // DEFAULT_PROJECT: buildingHeight = 6, numberOfFloors = 2
    const fields: ComputedField[] = [
      {
        id: "avgFloorHeight",
        description: "Average floor height",
        computation: {
          type: "arithmetic",
          operation: "divide",
          operands: ["buildingHeight", "numberOfFloors"],
        },
      },
    ];

    const result = evaluateComputedFields(DEFAULT_PROJECT, fields);
    expect(result.avgFloorHeight).toBe(3); // 6 / 2
  });

  it("evaluates tier-based computed fields", () => {
    const fields: ComputedField[] = [
      {
        id: "minExitsRequired",
        description: "Minimum exits",
        computation: {
          type: "tier",
          field: "grossFloorArea",
          tiers: [
            { max: 100, result: 1 },
            { min: 100, max: 300, result: 2 },
            { min: 300, result: 3 },
          ],
        },
      },
    ];

    // DEFAULT_PROJECT: grossFloorArea = 200
    const result = evaluateComputedFields(DEFAULT_PROJECT, fields);
    expect(result.minExitsRequired).toBe(2);
  });

  it("evaluates conditional computed fields", () => {
    const fields: ComputedField[] = [
      {
        id: "elevatorFloorThreshold",
        description: "Floor threshold for elevator requirement",
        computation: {
          type: "conditional",
          field: "isRehabilitation",
          ifTrue: 5,
          ifFalse: 4,
        },
      },
    ];

    // DEFAULT_PROJECT: isRehabilitation = false
    const result = evaluateComputedFields(DEFAULT_PROJECT, fields);
    expect(result.elevatorFloorThreshold).toBe(4);
  });

  it("merges computed fields from multiple plugins into global map", () => {
    const generalFields: ComputedField[] = [
      {
        id: "avgFloorHeight",
        description: "Average floor height",
        computation: {
          type: "arithmetic",
          operation: "divide",
          operands: ["buildingHeight", "numberOfFloors"],
        },
      },
    ];
    const fireFields: ComputedField[] = [
      {
        id: "minExitsRequired",
        description: "Minimum exits",
        computation: {
          type: "tier",
          field: "grossFloorArea",
          tiers: [
            { max: 100, result: 1 },
            { min: 100, max: 300, result: 2 },
            { min: 300, result: 3 },
          ],
        },
      },
    ];

    // Simulate what analyzer.ts does: pre-compute all plugins, merge
    const globalComputed: Record<string, unknown> = {};
    Object.assign(globalComputed, evaluateComputedFields(DEFAULT_PROJECT, generalFields));
    Object.assign(globalComputed, evaluateComputedFields(DEFAULT_PROJECT, fireFields));

    expect(globalComputed.avgFloorHeight).toBe(3);
    expect(globalComputed.minExitsRequired).toBe(2);
  });

  it("cross-plugin: fire-safety rule can access computed.avgFloorHeight via project.computed", () => {
    resetPluginFindingCounter();

    // Simulate global pre-computation (as analyzer.ts does)
    const enriched = { ...DEFAULT_PROJECT };
    const generalFields: ComputedField[] = [
      {
        id: "avgFloorHeight",
        description: "Average floor height",
        computation: {
          type: "arithmetic",
          operation: "divide",
          operands: ["buildingHeight", "numberOfFloors"],
        },
      },
    ];
    const globalComputed: Record<string, unknown> = {};
    Object.assign(globalComputed, evaluateComputedFields(enriched, generalFields));
    (enriched as Record<string, unknown>).computed = globalComputed;

    // Fire-safety plugin with a rule that references computed.avgFloorHeight (from general)
    // avgFloorHeight = 6/2 = 3 < 3.5, so rule should fire
    const fireSafetyPlugin = makePlugin(
      [
        {
          conditions: [
            { field: "computed.avgFloorHeight", operator: "<", value: 3.5 },
          ],
          description: "Floor height below 3.5m (cross-plugin computed field)",
        },
      ],
      // No computedFields — avgFloorHeight is NOT defined in this plugin
    );

    const result = evaluatePlugin(fireSafetyPlugin, enriched);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].description).toContain("cross-plugin computed field");
  });

  it("local computed field takes priority over global project.computed", () => {
    resetPluginFindingCounter();

    // Global says avgFloorHeight = 3 (via project.computed)
    const enriched = { ...DEFAULT_PROJECT };
    (enriched as Record<string, unknown>).computed = { avgFloorHeight: 3 };

    // Plugin defines its OWN avgFloorHeight that computes to a different value
    // buildingHeight=6, grossFloorArea=200 => 6/200 = 0.03
    const plugin = makePlugin(
      [
        {
          conditions: [
            { field: "computed.avgFloorHeight", operator: "<", value: 1 },
          ],
          description: "Local computed overrides global",
        },
      ],
      {
        computedFields: [
          {
            id: "avgFloorHeight",
            description: "Override: height / area",
            computation: {
              type: "arithmetic",
              operation: "divide",
              operands: ["buildingHeight", "grossFloorArea"],
            },
          },
        ],
      }
    );

    const result = evaluatePlugin(plugin, enriched);
    // Local avgFloorHeight = 6/200 = 0.03 < 1 → fires
    // If global (3) was used instead, 3 < 1 would be false → would NOT fire
    expect(result.findings).toHaveLength(1);
  });

  it("empty computed fields array returns empty map", () => {
    const result = evaluateComputedFields(DEFAULT_PROJECT, []);
    expect(result).toEqual({});
  });
});

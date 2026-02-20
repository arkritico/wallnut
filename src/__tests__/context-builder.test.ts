import { describe, it, expect } from "vitest";
import { buildProjectContext, analyzeRuleCoverage, analyzeValidationAutomation } from "@/lib/context-builder";
import type { BuildContextOptions, FieldMapping, ContextBuildReport } from "@/lib/context-builder";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject } from "@/lib/types";

function createProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)), name: "Context Test", ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Returns enriched project and report — basic shape
// ---------------------------------------------------------------------------

describe("buildProjectContext — basic shape", () => {
  it("returns enriched project and report with correct structure", () => {
    const project = createProject();
    const { enriched, report } = buildProjectContext(project);

    // enriched must still be a BuildingProject with the same name
    expect(enriched).toBeDefined();
    expect(enriched.name).toBe("Context Test");
    expect(enriched.buildingType).toBe("residential");

    // report must have the documented shape
    expect(report).toBeDefined();
    expect(report.fromIfc).toBeInstanceOf(Array);
    expect(report.fromForm).toBeInstanceOf(Array);
    expect(report.fromDefaults).toBeInstanceOf(Array);
    expect(report.stillMissing).toBeInstanceOf(Array);
    expect(report.aliasesApplied).toBeInstanceOf(Array);
    expect(report.coverage).toBeDefined();
    expect(typeof report.coverage.total).toBe("number");
    expect(typeof report.coverage.populated).toBe("number");
    expect(typeof report.coverage.percentage).toBe("number");
  });

  it("does not mutate the original project", () => {
    const project = createProject();
    const originalJson = JSON.stringify(project);
    buildProjectContext(project);
    expect(JSON.stringify(project)).toBe(originalJson);
  });
});

// ---------------------------------------------------------------------------
// 2. Namespace aliases — elevator ↔ elevators, hvac ↔ avac, etc.
// ---------------------------------------------------------------------------

describe("buildProjectContext — namespace aliases", () => {
  // Disable smart defaults so alias mechanism is tested in isolation.
  // When defaults are on, setFieldValue creates both "elevator.*" and "elevators.*"
  // independently, so the alias step sees both already defined.
  const noDefaults: BuildContextOptions = { applySmartDefaults: false };

  it("creates elevator alias when elevators exists", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project, noDefaults);
    const e = enriched as unknown as Record<string, unknown>;

    // DEFAULT_PROJECT has an "elevators" section, so "elevator" alias should be created
    expect(e["elevators"]).toBeDefined();
    expect(e["elevator"]).toBeDefined();
    expect(e["elevator"]).toBe(e["elevators"]);
  });

  it("creates hvac alias pointing to avac data", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project, noDefaults);
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["avac"]).toBeDefined();
    expect(e["hvac"]).toBeDefined();
    expect(e["hvac"]).toBe(e["avac"]);
  });

  it("creates water alias pointing to waterDrainage data", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project, noDefaults);
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["waterDrainage"]).toBeDefined();
    expect(e["water"]).toBeDefined();
    expect(e["water"]).toBe(e["waterDrainage"]);
  });

  it("creates drawings alias pointing to drawingQuality data", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project, noDefaults);
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["drawingQuality"]).toBeDefined();
    expect(e["drawings"]).toBeDefined();
    expect(e["drawings"]).toBe(e["drawingQuality"]);
  });

  it("creates municipal alias pointing to localRegulations data", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project, noDefaults);
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["localRegulations"]).toBeDefined();
    expect(e["municipal"]).toBeDefined();
    expect(e["municipal"]).toBe(e["localRegulations"]);
  });

  it("reports aliases in aliasesApplied when defaults are off", () => {
    const project = createProject();
    const { report } = buildProjectContext(project, noDefaults);

    expect(report.aliasesApplied.length).toBeGreaterThan(0);
  });

  it("both alias namespaces exist even with defaults on", () => {
    // With defaults on, both elevator and elevators are populated independently
    const project = createProject();
    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["elevator"]).toBeDefined();
    expect(e["elevators"]).toBeDefined();
    expect(e["hvac"]).toBeDefined();
    expect(e["avac"]).toBeDefined();
    expect(e["water"]).toBeDefined();
    expect(e["waterDrainage"]).toBeDefined();
    expect(e["drawings"]).toBeDefined();
    expect(e["drawingQuality"]).toBeDefined();
    expect(e["municipal"]).toBeDefined();
    expect(e["localRegulations"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. ITED / ITUR aliases → telecommunications
// ---------------------------------------------------------------------------

describe("buildProjectContext — ITED/ITUR aliases", () => {
  it("creates ited alias pointing to telecommunications when defaults are off", () => {
    const project = createProject();
    // With defaults off, ited/itur don't get pre-populated by setFieldValue,
    // so applyAliases creates them from telecommunications
    const { enriched } = buildProjectContext(project, { applySmartDefaults: false });
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["telecommunications"]).toBeDefined();
    expect(e["ited"]).toBeDefined();
    expect(e["ited"]).toBe(e["telecommunications"]);
  });

  it("creates itur alias pointing to telecommunications when defaults are off", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project, { applySmartDefaults: false });
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["itur"]).toBeDefined();
    expect(e["itur"]).toBe(e["telecommunications"]);
  });

  it("reports ited and itur aliases when defaults are off", () => {
    const project = createProject();
    const { report } = buildProjectContext(project, { applySmartDefaults: false });

    const itedAlias = report.aliasesApplied.find(a => a.includes("ited"));
    const iturAlias = report.aliasesApplied.find(a => a.includes("itur"));
    expect(itedAlias).toBeDefined();
    expect(iturAlias).toBeDefined();
  });

  it("ited and itur namespaces exist with defaults on (populated independently)", () => {
    // With smart defaults on, the defaults step sets "ited.*" and "itur.*" fields
    // independently, so they become separate objects from telecommunications
    const project = createProject();
    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["telecommunications"]).toBeDefined();
    expect(e["ited"]).toBeDefined();
    expect(e["itur"]).toBeDefined();

    // ited should have telecom-related fields from defaults
    const ited = e["ited"] as Record<string, unknown>;
    expect(ited.isUrbanization).toBe(false);
    expect(ited.rj45OutletsPerDwelling).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Virtual namespaces — building.* from top-level fields
// ---------------------------------------------------------------------------

describe("buildProjectContext — virtual namespaces", () => {
  it("creates building namespace with top-level fields", () => {
    const project = createProject({
      buildingHeight: 12,
      numberOfFloors: 4,
      grossFloorArea: 500,
      usableFloorArea: 400,
      numberOfDwellings: 8,
      buildingType: "residential",
      name: "Virtual NS Test",
    });
    const { enriched } = buildProjectContext(project);
    const e = enriched as unknown as Record<string, unknown>;
    const building = e["building"] as Record<string, unknown>;

    expect(building).toBeDefined();
    expect(building.height).toBe(12);
    expect(building.numberOfFloors).toBe(4);
    expect(building.type).toBe("residential");
    expect(building.name).toBe("Virtual NS Test");
    expect(building.grossFloorArea).toBe(500);
    expect(building.usableFloorArea).toBe(400);
    expect(building.numberOfDwellings).toBe(8);
  });

  it("creates project namespace from projectContext", () => {
    const project = createProject();
    project.projectContext = { description: "Test desc", questions: [], specificConcerns: "" };
    const { enriched } = buildProjectContext(project);
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["project"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Smart defaults — residential
// ---------------------------------------------------------------------------

describe("buildProjectContext — smart defaults (residential)", () => {
  it("applies residential fire safety defaults", () => {
    const project = createProject({ buildingType: "residential" });
    // Clear fireSafety to let defaults apply
    (project as Record<string, unknown>)["fireSafety"] = {};

    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const fs = enriched.fireSafety as Record<string, unknown>;

    expect(fs.utilizationType).toBe("I");
    expect(fs.riskCategory).toBe("1");
    expect(fs.hasFireExtinguishers).toBe(true);
  });

  it("applies residential accessibility defaults", () => {
    const project = createProject({ buildingType: "residential" });
    (project as Record<string, unknown>)["accessibility"] = {};

    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const acc = enriched.accessibility as Record<string, unknown>;

    expect(acc.hasAccessibleEntrance).toBe(true);
    expect(acc.doorWidths).toBe(0.77);
    expect(acc.corridorWidths).toBe(1.10);
  });

  it("reports defaults in fromDefaults list", () => {
    const project = createProject({ buildingType: "residential" });
    // Clear a namespace so defaults must be applied
    (project as Record<string, unknown>)["gas"] = {};

    const { report } = buildProjectContext(project, { applySmartDefaults: true });

    expect(report.fromDefaults.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Smart defaults — commercial
// ---------------------------------------------------------------------------

describe("buildProjectContext — smart defaults (commercial)", () => {
  it("applies commercial fire safety utilizationType VIII", () => {
    const project = createProject({ buildingType: "commercial" });
    (project as Record<string, unknown>)["fireSafety"] = {};

    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const fs = enriched.fireSafety as Record<string, unknown>;

    expect(fs.utilizationType).toBe("VIII");
    expect(fs.riskCategory).toBe("2");
    expect(fs.hasEmergencyLighting).toBe(true);
  });

  it("uses wider doors and corridors for commercial", () => {
    const project = createProject({ buildingType: "commercial" });
    (project as Record<string, unknown>)["accessibility"] = {};

    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const acc = enriched.accessibility as Record<string, unknown>;

    expect(acc.doorWidths).toBe(0.87);
    expect(acc.corridorWidths).toBe(1.20);
  });
});

// ---------------------------------------------------------------------------
// 7. Defaults do not overwrite existing values
// ---------------------------------------------------------------------------

describe("buildProjectContext — defaults don't overwrite", () => {
  it("preserves existing fireSafety.utilizationType", () => {
    const project = createProject({ buildingType: "residential" });
    // Set a specific non-default value
    (project.fireSafety as Record<string, unknown>).utilizationType = "III";

    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const fs = enriched.fireSafety as Record<string, unknown>;

    expect(fs.utilizationType).toBe("III");
  });

  it("preserves existing accessibility.doorWidths", () => {
    const project = createProject({ buildingType: "residential" });
    (project.accessibility as Record<string, unknown>).doorWidths = 0.95;

    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const acc = enriched.accessibility as Record<string, unknown>;

    expect(acc.doorWidths).toBe(0.95);
  });

  it("preserves existing gas.gasType even with defaults enabled", () => {
    const project = createProject({ buildingType: "residential" });
    (project.gas as Record<string, unknown>).gasType = "propane";

    const { enriched } = buildProjectContext(project, { applySmartDefaults: true });
    const gas = enriched.gas as Record<string, unknown>;

    expect(gas.gasType).toBe("propane");
  });
});

// ---------------------------------------------------------------------------
// 8. Cross-population — top-level → specialty namespaces
// ---------------------------------------------------------------------------

describe("buildProjectContext — cross-population", () => {
  it("copies buildingHeight into fireSafety.buildingHeight", () => {
    const project = createProject({ buildingHeight: 18 });
    const { enriched } = buildProjectContext(project);
    const fs = enriched.fireSafety as Record<string, unknown>;

    expect(fs.buildingHeight).toBe(18);
  });

  it("copies numberOfFloors into structural.numberOfFloors", () => {
    const project = createProject({ numberOfFloors: 5 });
    const { enriched } = buildProjectContext(project);
    const structural = enriched.structural as Record<string, unknown>;

    expect(structural.numberOfFloors).toBe(5);
  });

  it("copies grossFloorArea into accessibility namespace", () => {
    const project = createProject({ grossFloorArea: 800 });
    const { enriched } = buildProjectContext(project);
    const acc = enriched.accessibility as Record<string, unknown>;

    expect(acc.grossFloorArea).toBe(800);
  });

  it("cross-populates into all target namespaces", () => {
    const project = createProject({
      buildingHeight: 15,
      numberOfFloors: 5,
      grossFloorArea: 600,
      buildingType: "residential",
    });
    const { enriched } = buildProjectContext(project);

    const targets = ["fireSafety", "accessibility", "structural", "architecture", "acoustic", "energy"];
    for (const ns of targets) {
      const section = (enriched as unknown as Record<string, unknown>)[ns] as Record<string, unknown>;
      expect(section.buildingHeight).toBe(15);
      expect(section.numberOfFloors).toBe(5);
    }
  });

  it("does not overwrite existing values in specialty namespace", () => {
    const project = createProject({ buildingHeight: 20 });
    // Pre-set a different buildingHeight in fireSafety
    (project.fireSafety as Record<string, unknown>).buildingHeight = 25;

    const { enriched } = buildProjectContext(project);
    const fs = enriched.fireSafety as Record<string, unknown>;

    // Cross-populate should not overwrite existing 25 with top-level 20
    expect(fs.buildingHeight).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// 9. Coverage report with field mappings
// ---------------------------------------------------------------------------

describe("buildProjectContext — coverage report", () => {
  const sampleMappings: FieldMapping[] = [
    {
      field: "fireSafety.riskCategory",
      label: "Categoria de Risco",
      type: "select",
      sources: ["form", "default"],
    },
    {
      field: "fireSafety.utilizationType",
      label: "Tipo de Utilizacao",
      type: "select",
      sources: ["form", "default"],
    },
    {
      field: "fireSafety.buildingHeight",
      label: "Altura do Edificio",
      type: "number",
      sources: ["form", "ifc"],
    },
    {
      field: "fireSafety.nonExistentField",
      label: "Campo Inexistente",
      type: "string",
      sources: ["form"],
    },
  ];

  it("reports coverage total matching number of mappings", () => {
    const project = createProject();
    const { report } = buildProjectContext(project, { fieldMappings: sampleMappings });

    expect(report.coverage.total).toBe(sampleMappings.length);
  });

  it("reports populated count for fields that exist", () => {
    const project = createProject();
    const { report } = buildProjectContext(project, { fieldMappings: sampleMappings });

    // riskCategory, utilizationType, buildingHeight should all exist
    // nonExistentField should be missing (unless smart defaults set it)
    expect(report.coverage.populated).toBeGreaterThan(0);
    expect(report.coverage.populated).toBeLessThanOrEqual(report.coverage.total);
  });

  it("reports percentage between 0 and 100", () => {
    const project = createProject();
    const { report } = buildProjectContext(project, { fieldMappings: sampleMappings });

    expect(report.coverage.percentage).toBeGreaterThanOrEqual(0);
    expect(report.coverage.percentage).toBeLessThanOrEqual(100);
  });

  it("lists missing fields in stillMissing", () => {
    const project = createProject();
    const { report } = buildProjectContext(project, {
      fieldMappings: sampleMappings,
      applySmartDefaults: false,
    });

    // With defaults disabled, nonExistentField should be in stillMissing
    expect(report.stillMissing).toContain("fireSafety.nonExistentField");
  });

  it("tracks form fields in fromForm", () => {
    const project = createProject();
    const { report } = buildProjectContext(project, { fieldMappings: sampleMappings });

    // fireSafety.riskCategory and utilizationType exist in DEFAULT_PROJECT
    expect(report.fromForm).toContain("fireSafety.riskCategory");
    expect(report.fromForm).toContain("fireSafety.utilizationType");
  });

  it("reports 0 coverage when no mappings are provided", () => {
    const project = createProject();
    const { report } = buildProjectContext(project);

    expect(report.coverage.total).toBe(0);
    expect(report.coverage.populated).toBe(0);
    expect(report.coverage.percentage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Extra fields merge
// ---------------------------------------------------------------------------

describe("buildProjectContext — extra fields", () => {
  it("merges extra fields into enriched project", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project, {
      extraFields: { customField: "hello", customNumber: 42 },
    });
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["customField"]).toBe("hello");
    expect(e["customNumber"]).toBe(42);
  });

  it("merges nested extra fields", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project, {
      extraFields: {
        fireSafety: { customFireProp: true },
      },
    });
    const fs = enriched.fireSafety as Record<string, unknown>;

    expect(fs.customFireProp).toBe(true);
    // Original properties should be preserved (deep merge, not overwrite)
    expect(fs.utilizationType).toBeDefined();
  });

  it("does not create extra fields when option is omitted", () => {
    const project = createProject();
    const { enriched } = buildProjectContext(project);
    const e = enriched as unknown as Record<string, unknown>;

    expect(e["customField"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 11. analyzeRuleCoverage
// ---------------------------------------------------------------------------

describe("analyzeRuleCoverage", () => {
  it("returns correct counts for evaluable rules", () => {
    const project = createProject({ buildingHeight: 12 });
    const rules = [
      {
        id: "rule-1",
        conditions: [
          { field: "fireSafety.utilizationType", operator: "equals" },
        ],
      },
      {
        id: "rule-2",
        conditions: [
          { field: "fireSafety.riskCategory", operator: "equals" },
        ],
      },
    ];

    const result = analyzeRuleCoverage(project, rules);

    expect(result.total).toBe(2);
    expect(result.evaluable).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.percentage).toBe(100);
    expect(result.missingFields).toHaveLength(0);
  });

  it("marks rules as skipped when fields are missing", () => {
    const project = createProject();
    const rules = [
      {
        id: "rule-missing",
        conditions: [
          { field: "nonExistent.someField", operator: "equals" },
        ],
      },
    ];

    const result = analyzeRuleCoverage(project, rules);

    expect(result.total).toBe(1);
    expect(result.evaluable).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.percentage).toBe(0);
    expect(result.missingFields).toContain("nonExistent.someField");
  });

  it("handles not_exists operator as always evaluable", () => {
    const project = createProject();
    const rules = [
      {
        id: "rule-not-exists",
        conditions: [
          { field: "whatever.doesNotMatter", operator: "not_exists" },
        ],
      },
    ];

    const result = analyzeRuleCoverage(project, rules);

    expect(result.evaluable).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("handles lookup_ prefixed operators as always evaluable", () => {
    const project = createProject();
    const rules = [
      {
        id: "rule-lookup",
        conditions: [
          { field: "anyField.anyProp", operator: "lookup_table" },
        ],
      },
    ];

    const result = analyzeRuleCoverage(project, rules);

    expect(result.evaluable).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("reports byNamespace breakdown", () => {
    const project = createProject();
    const rules = [
      {
        id: "fire-rule-1",
        conditions: [{ field: "fireSafety.utilizationType", operator: "equals" }],
      },
      {
        id: "fire-rule-2",
        conditions: [{ field: "fireSafety.riskCategory", operator: "equals" }],
      },
      {
        id: "gas-rule-1",
        conditions: [{ field: "gas.hasGasInstallation", operator: "equals" }],
      },
      {
        id: "missing-rule",
        conditions: [{ field: "phantom.field", operator: "equals" }],
      },
    ];

    const result = analyzeRuleCoverage(project, rules);

    expect(result.byNamespace["fireSafety"]).toBeDefined();
    expect(result.byNamespace["fireSafety"].total).toBe(2);
    expect(result.byNamespace["fireSafety"].evaluable).toBe(2);

    expect(result.byNamespace["gas"]).toBeDefined();
    expect(result.byNamespace["gas"].total).toBe(1);
    expect(result.byNamespace["gas"].evaluable).toBe(1);

    expect(result.byNamespace["phantom"]).toBeDefined();
    expect(result.byNamespace["phantom"].total).toBe(1);
    expect(result.byNamespace["phantom"].evaluable).toBe(0);
  });

  it("skips a rule if any condition field is missing", () => {
    const project = createProject();
    const rules = [
      {
        id: "partial-rule",
        conditions: [
          { field: "fireSafety.utilizationType", operator: "equals" },
          { field: "nonExistent.field", operator: "greater_than" },
        ],
      },
    ];

    const result = analyzeRuleCoverage(project, rules);

    expect(result.evaluable).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.missingFields).toContain("nonExistent.field");
  });

  it("handles empty rules array", () => {
    const project = createProject();
    const result = analyzeRuleCoverage(project, []);

    expect(result.total).toBe(0);
    expect(result.evaluable).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.missingFields).toHaveLength(0);
  });

  it("deduplicates missing fields across rules", () => {
    const project = createProject();
    const rules = [
      {
        id: "rule-a",
        conditions: [{ field: "missing.fieldX", operator: "equals" }],
      },
      {
        id: "rule-b",
        conditions: [{ field: "missing.fieldX", operator: "greater_than" }],
      },
    ];

    const result = analyzeRuleCoverage(project, rules);

    // Same field missing in two rules should appear only once
    const occurrences = result.missingFields.filter(f => f === "missing.fieldX");
    expect(occurrences).toHaveLength(1);
  });

  it("returns sorted missingFields", () => {
    const project = createProject();
    const rules = [
      {
        id: "rule-z",
        conditions: [{ field: "zzz.field", operator: "equals" }],
      },
      {
        id: "rule-a",
        conditions: [{ field: "aaa.field", operator: "equals" }],
      },
      {
        id: "rule-m",
        conditions: [{ field: "mmm.field", operator: "equals" }],
      },
    ];

    const result = analyzeRuleCoverage(project, rules);

    expect(result.missingFields).toEqual(["aaa.field", "mmm.field", "zzz.field"]);
  });
});

// ---------------------------------------------------------------------------
// Edge cases and combined scenarios
// ---------------------------------------------------------------------------

describe("buildProjectContext — smart defaults disabled", () => {
  it("does not apply defaults when applySmartDefaults is false", () => {
    const project = createProject({ buildingType: "residential" });
    (project as Record<string, unknown>)["fireSafety"] = {};

    const { enriched, report } = buildProjectContext(project, {
      applySmartDefaults: false,
    });
    const fs = enriched.fireSafety as Record<string, unknown>;

    // When defaults are disabled, cleared fields should remain undefined
    expect(fs.utilizationType).toBeUndefined();
    expect(report.fromDefaults).toHaveLength(0);
  });
});

describe("buildProjectContext — field mapping defaults", () => {
  it("applies field-mapping-level defaults when type matches", () => {
    const project = createProject({ buildingType: "residential" });
    // Ensure the field doesn't already exist
    delete (project as Record<string, unknown>)["customSection"];

    const mappings: FieldMapping[] = [
      {
        field: "customSection.mappedField",
        label: "Campo Mapeado",
        type: "number",
        sources: ["default"],
        defaults: { residential: 42, _default: 0 },
      },
    ];

    const { enriched } = buildProjectContext(project, {
      fieldMappings: mappings,
      applySmartDefaults: true,
    });
    const e = enriched as unknown as Record<string, unknown>;
    const section = e["customSection"] as Record<string, unknown>;

    expect(section).toBeDefined();
    expect(section.mappedField).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// analyzeValidationAutomation
// ---------------------------------------------------------------------------

describe("analyzeValidationAutomation", () => {
  it("categorizes rules by automation level", () => {
    const project = createProject({ buildingType: "residential" });
    const { enriched, report } = buildProjectContext(project, { applySmartDefaults: true });

    // Rules that check fields from IFC (via defaults for this test)
    const rules = [
      {
        id: "rule-1",
        conditions: [{ field: "fireSafety.riskCategory", operator: "equals" }],
      },
      {
        id: "rule-2",
        conditions: [{ field: "general.bedroomArea", operator: "gte" }],
      },
      {
        id: "rule-3",
        conditions: [
          { field: "nonexistent.field1", operator: "gte" },
          { field: "nonexistent.field2", operator: "lte" },
        ],
      },
    ];

    const result = analyzeValidationAutomation(report, rules, enriched);

    expect(result.totalRules).toBe(3);
    // Rules 1 and 2 should be evaluable (from defaults)
    expect(result.fullyAutomated + result.evaluableWithDefaults).toBeGreaterThanOrEqual(2);
    // Rule 3 should need input
    expect(result.needsManualInput).toBeGreaterThanOrEqual(1);
  });

  it("identifies high-impact missing fields", () => {
    const project = createProject({ buildingType: "residential" });
    const { enriched, report } = buildProjectContext(project, { applySmartDefaults: false });

    const rules = [
      { id: "r1", conditions: [{ field: "missing.field", operator: "gt" }] },
      { id: "r2", conditions: [{ field: "missing.field", operator: "lt" }] },
      { id: "r3", conditions: [{ field: "missing.field", operator: "eq" }] },
      { id: "r4", conditions: [{ field: "other.missing", operator: "gt" }] },
    ];

    const result = analyzeValidationAutomation(report, rules, enriched);

    expect(result.highImpactFields.length).toBeGreaterThan(0);
    // "missing.field" blocks 3 rules, should be top
    expect(result.highImpactFields[0].field).toBe("missing.field");
    expect(result.highImpactFields[0].rulesBlocked).toBe(3);
  });

  it("returns per-namespace breakdown", () => {
    const project = createProject({ buildingType: "residential" });
    const { enriched, report } = buildProjectContext(project, { applySmartDefaults: true });

    const rules = [
      { id: "r1", conditions: [{ field: "fireSafety.riskCategory", operator: "equals" }] },
      { id: "r2", conditions: [{ field: "fireSafety.buildingHeight", operator: "gte" }] },
      { id: "r3", conditions: [{ field: "general.bedroomArea", operator: "gte" }] },
    ];

    const result = analyzeValidationAutomation(report, rules, enriched);

    expect(result.byNamespace.fireSafety).toBeDefined();
    expect(result.byNamespace.fireSafety.total).toBe(2);
    expect(result.byNamespace.general).toBeDefined();
    expect(result.byNamespace.general.total).toBe(1);
  });

  it("reports 100% automation when all fields available from IFC", () => {
    const project = createProject({ buildingType: "residential" });
    const { enriched, report } = buildProjectContext(project, { applySmartDefaults: true });

    // Simulate IFC-resolved fields
    report.fromIfc.push("fireSafety.riskCategory", "general.bedroomArea");

    const rules = [
      { id: "r1", conditions: [{ field: "fireSafety.riskCategory", operator: "equals" }] },
      { id: "r2", conditions: [{ field: "general.bedroomArea", operator: "gte" }] },
    ];

    const result = analyzeValidationAutomation(report, rules, enriched);

    expect(result.fullyAutomated).toBe(2);
    expect(result.automationPercentage).toBe(100);
  });
});

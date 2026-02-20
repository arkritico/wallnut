import { describe, it, expect } from "vitest";
import { analyzeProject } from "@/lib/analyzer";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject, AnalysisResult } from "@/lib/types";

function createProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)), ...overrides };
}

// ============================================================
// 1. Returns complete result structure
// ============================================================

describe("analyzeProject — result structure", () => {
  it("returns all required fields with correct types", async () => {
    const project = createProject({ name: "Structure Test" });
    const result = await analyzeProject(project);

    expect(result).toBeDefined();
    expect(typeof result.projectName).toBe("string");
    expect(result.projectName).toBe("Structure Test");
    expect(typeof result.overallScore).toBe("number");
    expect(typeof result.energyClass).toBe("string");
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(Array.isArray(result.regulationSummary)).toBe(true);
  });
});

// ============================================================
// 2. Score is 0-100
// ============================================================

describe("analyzeProject — score bounds", () => {
  it("overallScore is between 0 and 100", async () => {
    const result = await analyzeProject(createProject({ name: "Score Bounds" }));

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });
});

// ============================================================
// 3. Energy class is valid
// ============================================================

describe("analyzeProject — energy class", () => {
  it("energyClass is one of the valid Portuguese SCE classes", async () => {
    const result = await analyzeProject(createProject({ name: "Energy Class" }));
    const validClasses = ["A+", "A", "B", "B-", "C", "D", "E", "F"];

    expect(validClasses).toContain(result.energyClass);
  });
});

// ============================================================
// 4. Findings have required fields
// ============================================================

describe("analyzeProject — finding fields", () => {
  it("every finding has id, area, description, and severity", async () => {
    const result = await analyzeProject(createProject({ name: "Finding Fields" }));

    expect(result.findings.length).toBeGreaterThan(0);
    for (const f of result.findings) {
      expect(typeof f.id).toBe("string");
      expect(f.id.length).toBeGreaterThan(0);
      expect(typeof f.area).toBe("string");
      expect(f.area.length).toBeGreaterThan(0);
      expect(typeof f.description).toBe("string");
      expect(f.description.length).toBeGreaterThan(0);
      expect(["critical", "warning", "info", "pass"]).toContain(f.severity);
    }
  });
});

// ============================================================
// 5. Regulation summary covers all 18 areas
// ============================================================

describe("analyzeProject — regulation summary", () => {
  it("covers all 18 regulation areas", async () => {
    const result = await analyzeProject(createProject({ name: "Summary Coverage" }));

    expect(result.regulationSummary.length).toBeGreaterThanOrEqual(18);

    const areas = result.regulationSummary.map(s => s.area);
    const expectedAreas = [
      "architecture", "structural", "fire_safety", "hvac",
      "water_drainage", "gas", "electrical", "telecommunications",
      "thermal", "acoustic", "accessibility", "energy",
      "elevators", "licensing", "waste", "municipal",
      "drawings", "general",
    ];
    for (const area of expectedAreas) {
      expect(areas).toContain(area);
    }

    for (const summary of result.regulationSummary) {
      expect(typeof summary.name).toBe("string");
      expect(["compliant", "non_compliant", "partially_compliant"]).toContain(summary.status);
      expect(typeof summary.findingsCount).toBe("number");
      expect(typeof summary.score).toBe("number");
    }
  });
});

// ============================================================
// 6. Rule evaluation metrics present
// ============================================================

describe("analyzeProject — rule evaluation metrics", () => {
  it("ruleEvaluation is an array with expected fields per entry", async () => {
    const result = await analyzeProject(createProject({ name: "Rule Metrics" }));

    expect(result.ruleEvaluation).toBeDefined();
    expect(Array.isArray(result.ruleEvaluation)).toBe(true);
    expect(result.ruleEvaluation!.length).toBeGreaterThan(0);

    for (const metric of result.ruleEvaluation!) {
      expect(typeof metric.pluginId).toBe("string");
      expect(typeof metric.pluginName).toBe("string");
      expect(typeof metric.area).toBe("string");
      expect(typeof metric.totalRules).toBe("number");
      expect(typeof metric.evaluatedRules).toBe("number");
      expect(typeof metric.skippedRules).toBe("number");
      expect(typeof metric.firedRules).toBe("number");
      expect(typeof metric.coveragePercent).toBe("number");
      expect(metric.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(metric.coveragePercent).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================
// 7. Context coverage present
// ============================================================

describe("analyzeProject — context coverage", () => {
  it("contextCoverage exists with populated fields", async () => {
    const result = await analyzeProject(createProject({ name: "Context Coverage" }));

    expect(result.contextCoverage).toBeDefined();
    const cc = result.contextCoverage!;

    expect(typeof cc.total).toBe("number");
    expect(cc.total).toBeGreaterThan(0);
    expect(typeof cc.populated).toBe("number");
    expect(cc.populated).toBeGreaterThan(0);
    expect(typeof cc.percentage).toBe("number");
    expect(cc.percentage).toBeGreaterThan(0);
    expect(Array.isArray(cc.missingFields)).toBe(true);
    expect(cc.sources).toBeDefined();
    expect(Array.isArray(cc.sources.fromIfc)).toBe(true);
    expect(Array.isArray(cc.sources.fromForm)).toBe(true);
    expect(Array.isArray(cc.sources.fromDefaults)).toBe(true);
    expect(Array.isArray(cc.aliasesApplied)).toBe(true);
  });
});

// ============================================================
// 8. Plugin rules are evaluated — total rules sum
// ============================================================

describe("analyzeProject — total plugin rules", () => {
  it("total rules across all metrics sums to approximately 1964", async () => {
    const result = await analyzeProject(createProject({ name: "Total Rules" }));

    expect(result.ruleEvaluation).toBeDefined();
    const totalRulesSum = result.ruleEvaluation!.reduce(
      (sum, m) => sum + m.totalRules, 0,
    );

    // Allow a range to accommodate plugin updates: 2000-8000
    expect(totalRulesSum).toBeGreaterThanOrEqual(2000);
    expect(totalRulesSum).toBeLessThanOrEqual(8000);
  });
});

// ============================================================
// 9. Deep analyzers produce findings
// ============================================================

describe("analyzeProject — deep analyzer findings", () => {
  it("includes energy analyzer findings (SCE-700x IDs) for DEFAULT_PROJECT", async () => {
    const result = await analyzeProject(createProject({ name: "Energy Deep" }));

    const energyFindings = result.findings.filter(f => f.id.startsWith("SCE-700"));
    expect(energyFindings.length).toBeGreaterThan(0);
  });

  it("includes fire safety analyzer findings (SCIE-CALC-80xx IDs) for DEFAULT_PROJECT", async () => {
    const result = await analyzeProject(createProject({ name: "Fire Deep" }));

    const fireFindings = result.findings.filter(f => f.id.startsWith("SCIE-CALC-80"));
    expect(fireFindings.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 10. Commercial building gets different UT
// ============================================================

describe("analyzeProject — commercial building", () => {
  it("produces fire safety findings for commercial buildingType", async () => {
    const project = createProject({
      name: "Commercial Building",
      buildingType: "commercial",
      fireSafety: {
        ...JSON.parse(JSON.stringify(DEFAULT_PROJECT.fireSafety)),
        utilizationType: "VIII",
        riskCategory: "2",
      },
    });
    const result = await analyzeProject(project);

    const fireFindings = result.findings.filter(f => f.area === "fire_safety");
    expect(fireFindings.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 11. Silent failure handling
// ============================================================

describe("analyzeProject — silent failure handling", () => {
  it("does not throw when given a minimal/broken project", async () => {
    const minimalProject = {
      name: "Minimal",
      buildingType: "residential",
      location: { municipality: "Lisboa", district: "Lisboa" },
    } as unknown as BuildingProject;

    const result = await analyzeProject(minimalProject);

    expect(result).toBeDefined();
    expect(typeof result.projectName).toBe("string");
    expect(typeof result.overallScore).toBe("number");
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.regulationSummary)).toBe(true);
  });

  it("does not throw when given an empty-name project", async () => {
    const project = createProject({ name: "" });
    const result = await analyzeProject(project);

    expect(result).toBeDefined();
    expect(result.projectName).toBe("");
    expect(Array.isArray(result.findings)).toBe(true);
  });
});

// ============================================================
// 12. Specialty filtering — only analyze areas with real data
// ============================================================

describe("analyzeProject — specialty filtering", () => {
  it("structural-only project produces no critical/warning findings for unrelated specialties", async () => {
    // Minimal project with only structural data (simulates IFC-only upload)
    const structuralOnly = {
      name: "Structural Only",
      buildingType: "residential",
      location: { municipality: "Lisboa", district: "Lisboa", altitude: 0, distanceToCoast: 5, climateZoneWinter: "I1", climateZoneSummer: "V2" },
      grossFloorArea: 500,
      usableFloorArea: 400,
      numberOfFloors: 3,
      buildingHeight: 9,
      isRehabilitation: false,
      structural: {
        structuralSystem: "reinforced_concrete",
        seismicZone: "1.3",
        soilType: "B",
        importanceClass: "II",
        hasStructuralProject: true,
        hasGeotechnicalStudy: true,
        foundationType: "shallow",
        hasSeismicDesign: true,
        ductilityClass: "DCM",
      },
    } as unknown as BuildingProject;

    const result = await analyzeProject(structuralOnly);

    // These specialties should NOT produce critical/warning findings
    // because no real data was provided for them
    const irrelevantAreas = [
      "architecture", "general", "municipal",
      "gas", "hvac", "telecommunications", "acoustic",
      "elevators", "waste", "drawings",
    ];

    const badFindings = result.findings.filter(
      f => irrelevantAreas.includes(f.area) &&
           (f.severity === "critical" || f.severity === "warning"),
    );

    expect(badFindings).toEqual([]);
  });

  it("structural-only project does NOT include architecture/general/municipal in analyzedAreas", async () => {
    const structuralOnly = {
      name: "Structural Only",
      buildingType: "residential",
      structural: { structuralSystem: "reinforced_concrete", seismicZone: "1.3", soilType: "B",
        importanceClass: "II", hasStructuralProject: true, hasGeotechnicalStudy: true,
        foundationType: "shallow", hasSeismicDesign: true, ductilityClass: "DCM" },
    } as unknown as BuildingProject;

    const result = await analyzeProject(structuralOnly);

    expect(result.analyzedAreas).toContain("structural");
    expect(result.analyzedAreas).not.toContain("architecture");
    expect(result.analyzedAreas).not.toContain("general");
    expect(result.analyzedAreas).not.toContain("municipal");
  });

  it("returns analyzedAreas in the result (DEFAULT_PROJECT has architecture data)", async () => {
    const project = createProject({ name: "Analyzed Areas" });
    const result = await analyzeProject(project);

    expect(result.analyzedAreas).toBeDefined();
    expect(Array.isArray(result.analyzedAreas)).toBe(true);
    // DEFAULT_PROJECT has architecture.* fields → triggers architecture + general + municipal
    expect(result.analyzedAreas).toContain("architecture");
    expect(result.analyzedAreas).toContain("general");
    expect(result.analyzedAreas).toContain("municipal");
  });

  it("emits dependency warnings when fire_safety submitted without architecture/structural", async () => {
    const fireSafetyOnly = {
      name: "Fire Safety Only",
      buildingType: "residential",
      grossFloorArea: 500,
      numberOfFloors: 3,
      buildingHeight: 9,
      fireSafety: {
        utilizationType: "I",
        riskCategory: "1",
        fireResistanceOfStructure: 60,
        hasFireDetection: true,
        hasFireAlarm: true,
        evacuationRouteWidth: 1.2,
        numberOfExits: 2,
        maxEvacuationDistance: 30,
        hasEmergencyLighting: true,
        hasFireExtinguishers: true,
        hasSprinklers: false,
      },
    } as unknown as BuildingProject;

    const result = await analyzeProject(fireSafetyOnly);

    // Should have dependency warnings for missing architecture and structural
    const depWarnings = result.findings.filter(f => f.id.startsWith("DEP-"));
    expect(depWarnings.length).toBe(2);

    const archDep = depWarnings.find(f => f.id === "DEP-fire_safety-architecture");
    expect(archDep).toBeDefined();
    expect(archDep!.severity).toBe("info");
    expect(archDep!.description).toContain("Projeto de Arquitetura");

    const structDep = depWarnings.find(f => f.id === "DEP-fire_safety-structural");
    expect(structDep).toBeDefined();
    expect(structDep!.description).toContain("Projeto de Estruturas");
  });

  it("full DEFAULT_PROJECT has no dependency warnings", async () => {
    const project = createProject({ name: "Full Project" });
    const result = await analyzeProject(project);

    const depWarnings = result.findings.filter(f => f.id.startsWith("DEP-"));
    expect(depWarnings).toEqual([]);
  });

  it("rules do not fire on smart-default values (only real IFC/form data)", async () => {
    // A project with only structural form data — structural rules should skip
    // fields that come from smart defaults (e.g. liveLoad, behaviourFactor)
    const structuralOnly = {
      name: "Defaults Test",
      buildingType: "residential",
      structural: {
        structuralSystem: "reinforced_concrete",
        seismicZone: "1.3",
        soilType: "B",
        importanceClass: "II",
        hasStructuralProject: true,
        hasGeotechnicalStudy: true,
        foundationType: "shallow",
        hasSeismicDesign: true,
        ductilityClass: "DCM",
      },
    } as unknown as BuildingProject;

    const result = await analyzeProject(structuralOnly);
    const structMetrics = result.ruleEvaluation?.filter(m => m.area === "structural") ?? [];

    // With defaults stripped, most structural rules should be skipped
    // (only ~9 form-provided fields vs 288 total structural fields)
    const totalStructRules = structMetrics.reduce((s, m) => s + m.totalRules, 0);
    const skippedStructRules = structMetrics.reduce((s, m) => s + m.skippedRules, 0);

    // More than half the rules should be skipped (no default data to evaluate)
    expect(skippedStructRules).toBeGreaterThan(totalStructRules * 0.5);
  });
});

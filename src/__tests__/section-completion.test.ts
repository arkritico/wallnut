import { describe, it, expect } from "vitest";
import {
  calculateSectionCompletion,
  computeEngineReadiness,
  getRelevantSections,
} from "@/lib/section-completion";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject } from "@/lib/types";

function makeProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...DEFAULT_PROJECT, name: "Test Project", ...overrides };
}

// ============================================================
// calculateSectionCompletion
// ============================================================

describe("calculateSectionCompletion", () => {
  it("returns all expected section IDs", () => {
    const result = calculateSectionCompletion(makeProject());
    const expectedIds = [
      "context", "general", "architecture", "structural", "fire",
      "avac", "water", "gas", "electrical", "telecom", "envelope",
      "systems", "acoustic", "accessibility", "elevators", "licensing",
      "waste", "drawings", "local",
    ];
    for (const id of expectedIds) {
      expect(result[id]).toBeDefined();
      expect(result[id].id).toBe(id);
    }
  });

  it("returns valid percentage range (0-100)", () => {
    const result = calculateSectionCompletion(makeProject());
    for (const section of Object.values(result)) {
      expect(section.percentage).toBeGreaterThanOrEqual(0);
      expect(section.percentage).toBeLessThanOrEqual(100);
    }
  });

  it("marks empty sections as 'empty' status", () => {
    // Envelope section: all U-values at zero
    const project = makeProject({
      envelope: {
        ...DEFAULT_PROJECT.envelope,
        externalWallUValue: 0,
        roofUValue: 0,
        windowUValue: 0,
        windowSolarFactor: 0,
        airChangesPerHour: 0,
      },
    });
    const result = calculateSectionCompletion(project);
    expect(result.envelope.status).toBe("empty");
    expect(result.envelope.percentage).toBe(0);
  });

  it("marks partially filled sections as 'partial'", () => {
    // Envelope section: only some U-values filled
    const project = makeProject({
      envelope: {
        ...DEFAULT_PROJECT.envelope,
        externalWallUValue: 0.5,
        roofUValue: 0,
        windowUValue: 0,
        windowSolarFactor: 0,
        airChangesPerHour: 0,
      },
    });
    const result = calculateSectionCompletion(project);
    // envelope has 5 keys: 1 filled (0.5), 4 zeros = 1/5 = 20%
    expect(result.envelope.status).toBe("partial");
    expect(result.envelope.percentage).toBeGreaterThan(0);
    expect(result.envelope.percentage).toBeLessThan(80);
  });

  it("counts boolean true as filled", () => {
    const project = makeProject({
      architecture: {
        ...DEFAULT_PROJECT.architecture,
        hasNaturalLight: true,
        hasCrossVentilation: true,
        hasBuildingPermitDesign: true,
        meetsRGEU: true,
        hasCivilCodeCompliance: true,
      },
    });
    const result = calculateSectionCompletion(project);
    // architecture: 5 booleans true + ceilingHeight=0 (not filled) = 5/6 = 83%
    expect(result.architecture.filled).toBeGreaterThanOrEqual(5);
  });

  it("does NOT count zero values as filled", () => {
    const project = makeProject({
      envelope: {
        ...DEFAULT_PROJECT.envelope,
        externalWallUValue: 0,
        roofUValue: 0,
        windowUValue: 0,
        windowSolarFactor: 0,
        airChangesPerHour: 0,
      },
    });
    const result = calculateSectionCompletion(project);
    expect(result.envelope.filled).toBe(0);
    expect(result.envelope.status).toBe("empty");
  });

  it("does NOT count empty strings as filled", () => {
    // Use gas section: only 2 string/bool keys, no arrays
    const project = makeProject({
      gas: { ...DEFAULT_PROJECT.gas, hasGasInstallation: false, gasType: "" },
    });
    const result = calculateSectionCompletion(project);
    // gasType="" → skipped, hasGasInstallation=false → counted as filled (boolean)
    // So filled should be 1 (the boolean), not 2
    expect(result.gas.filled).toBe(1);
  });

  it("counts filled arrays as filled", () => {
    const project = makeProject({
      projectContext: {
        description: "Test description",
        specificConcerns: ["concern1"],
        questions: "",
      },
    });
    const result = calculateSectionCompletion(project);
    // description (filled) + specificConcerns (filled) + questions (empty) = 2/3
    expect(result.context.filled).toBe(2);
  });

  it("counts positive numbers as filled", () => {
    const project = makeProject({
      envelope: {
        ...DEFAULT_PROJECT.envelope,
        externalWallUValue: 0.5,
        roofUValue: 0.3,
        windowUValue: 2.1,
        windowSolarFactor: 0,
        airChangesPerHour: 0,
      },
    });
    const result = calculateSectionCompletion(project);
    expect(result.envelope.filled).toBe(3);
  });

  it("general section includes location fields", () => {
    const project = makeProject({
      name: "P",
      location: { ...DEFAULT_PROJECT.location, district: "Porto", municipality: "Porto" },
    });
    const result = calculateSectionCompletion(project);
    // name=P, buildingType=residential, district=Porto, municipality=Porto = 4 filled
    // grossFloorArea=150, usableFloorArea=120, numberOfFloors=2, buildingHeight=6 = 4 more
    expect(result.general.filled).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================
// computeEngineReadiness
// ============================================================

describe("computeEngineReadiness", () => {
  it("returns exactly 4 engines", () => {
    const result = computeEngineReadiness(makeProject());
    expect(result).toHaveLength(4);
  });

  it("contains expected engine IDs", () => {
    const result = computeEngineReadiness(makeProject());
    const ids = result.map(e => e.id);
    expect(ids).toContain("sce");
    expect(ids).toContain("rtiebt");
    expect(ids).toContain("rgsppdadar");
    expect(ids).toContain("scie");
  });

  it("each engine has a section reference", () => {
    const result = computeEngineReadiness(makeProject());
    for (const engine of result) {
      expect(engine.section).toBeTruthy();
      expect(typeof engine.section).toBe("string");
    }
  });

  it("SCE engine maps to envelope section", () => {
    const result = computeEngineReadiness(makeProject());
    const sce = result.find(e => e.id === "sce");
    expect(sce?.section).toBe("envelope");
  });

  it("RTIEBT engine maps to electrical section", () => {
    const result = computeEngineReadiness(makeProject());
    const rtiebt = result.find(e => e.id === "rtiebt");
    expect(rtiebt?.section).toBe("electrical");
  });

  it("RGSPPDADAR engine maps to water section", () => {
    const result = computeEngineReadiness(makeProject());
    const rgsppdadar = result.find(e => e.id === "rgsppdadar");
    expect(rgsppdadar?.section).toBe("water");
  });

  it("SCIE engine maps to fire section", () => {
    const result = computeEngineReadiness(makeProject());
    const scie = result.find(e => e.id === "scie");
    expect(scie?.section).toBe("fire");
  });

  it("each engine has a label", () => {
    const result = computeEngineReadiness(makeProject());
    for (const engine of result) {
      expect(engine.label).toBeTruthy();
      expect(engine.label.length).toBeGreaterThan(3);
    }
  });
});

// ============================================================
// getRelevantSections
// ============================================================

describe("getRelevantSections", () => {
  it("always includes core sections for any building type", () => {
    const core = ["context", "general", "architecture", "envelope", "systems", "licensing"];
    for (const type of ["residential", "commercial", "mixed", "industrial"] as const) {
      const sections = getRelevantSections(type);
      for (const c of core) {
        expect(sections).toContain(c);
      }
    }
  });

  it("residential includes all specialty sections", () => {
    const sections = getRelevantSections("residential");
    expect(sections).toContain("fire");
    expect(sections).toContain("electrical");
    expect(sections).toContain("water");
    expect(sections).toContain("acoustic");
    expect(sections).toContain("accessibility");
    expect(sections).toContain("telecom");
    expect(sections).toContain("elevators");
  });

  it("industrial excludes telecom, acoustic, accessibility, elevators", () => {
    const sections = getRelevantSections("industrial");
    expect(sections).not.toContain("telecom");
    expect(sections).not.toContain("acoustic");
    expect(sections).not.toContain("accessibility");
    expect(sections).not.toContain("elevators");
  });

  it("industrial includes structural, fire, electrical", () => {
    const sections = getRelevantSections("industrial");
    expect(sections).toContain("structural");
    expect(sections).toContain("fire");
    expect(sections).toContain("electrical");
  });
});

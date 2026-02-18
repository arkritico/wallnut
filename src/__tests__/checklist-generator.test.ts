import { describe, it, expect } from "vitest";
import { generateChecklists, generateChecklistForArea } from "@/lib/checklist-generator";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject, AnalysisResult, Finding } from "@/lib/types";

function makeProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...DEFAULT_PROJECT, name: "Test Project", ...overrides };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "F-1",
    area: "architecture",
    regulation: "RGEU",
    article: "Art. 65",
    description: "Test finding",
    severity: "critical",
    ...overrides,
  };
}

// ============================================================
// generateChecklists
// ============================================================

describe("generateChecklists", () => {
  it("returns checklists for multiple specialties", () => {
    const result = generateChecklists(makeProject());
    // Should return at least architecture, fire_safety, electrical, thermal, etc.
    expect(result.length).toBeGreaterThanOrEqual(10);
  });

  it("each checklist has correct structure", () => {
    const result = generateChecklists(makeProject());
    for (const cl of result) {
      expect(cl.specialty).toBeTruthy();
      expect(cl.title).toBeTruthy();
      expect(cl.projectName).toBe("Test Project");
      expect(cl.date).toBeTruthy();
      expect(Array.isArray(cl.items)).toBe(true);
      expect(cl.items.length).toBeGreaterThan(0);
    }
  });

  it("checklist items have required fields", () => {
    const result = generateChecklists(makeProject());
    for (const cl of result) {
      for (const item of cl.items) {
        expect(item.id).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.regulation).toBeTruthy();
        expect(item.article).toBeTruthy();
        expect(typeof item.critical).toBe("boolean");
        expect(typeof item.checked).toBe("boolean");
        expect(item.checked).toBe(false); // defaults unchecked
      }
    }
  });

  it("gas checklist is empty when hasGasInstallation is false", () => {
    const project = makeProject({
      gas: { ...DEFAULT_PROJECT.gas, hasGasInstallation: false },
    });
    const result = generateChecklists(project);
    const gasChecklist = result.find(cl => cl.specialty === "gas");
    // Gas should either not appear or have 0 items
    expect(gasChecklist).toBeUndefined();
  });

  it("gas checklist is populated when hasGasInstallation is true", () => {
    const project = makeProject({
      gas: { ...DEFAULT_PROJECT.gas, hasGasInstallation: true, gasType: "natural" },
    });
    const result = generateChecklists(project);
    const gasChecklist = result.find(cl => cl.specialty === "gas");
    expect(gasChecklist).toBeDefined();
    expect(gasChecklist!.items.length).toBeGreaterThan(0);
  });

  it("fire safety adds SADI item for riskCategory >= 2", () => {
    const project = makeProject({
      fireSafety: { ...DEFAULT_PROJECT.fireSafety, riskCategory: "2" },
    });
    const result = generateChecklists(project);
    const fireChecklist = result.find(cl => cl.specialty === "fire_safety")!;
    const hasSADI = fireChecklist.items.some(i => /SADI|deteção.*automática/i.test(i.description));
    expect(hasSADI).toBe(true);
  });

  it("accessibility adds elevator item for multi-floor buildings", () => {
    const project = makeProject({ numberOfFloors: 3 });
    const result = generateChecklists(project);
    const accChecklist = result.find(cl => cl.specialty === "accessibility")!;
    const hasElevator = accChecklist.items.some(i => /ascensor|elevador/i.test(i.description));
    expect(hasElevator).toBe(true);
  });

  it("attaches related findings when analysis result provided", () => {
    const findings: Finding[] = [
      makeFinding({ id: "F-arch-1", area: "architecture" }),
      makeFinding({ id: "F-fire-1", area: "fire_safety" }),
    ];
    const analysisResult = {
      findings,
    } as AnalysisResult;
    const result = generateChecklists(makeProject(), analysisResult);
    const archChecklist = result.find(cl => cl.specialty === "architecture")!;
    expect(archChecklist.relatedFindings).toHaveLength(1);
    expect(archChecklist.relatedFindings[0].id).toBe("F-arch-1");
  });

  it("subtitle includes project name and municipality", () => {
    const project = makeProject({
      name: "Edifício Nova",
      location: { ...DEFAULT_PROJECT.location, municipality: "Porto" },
    });
    const result = generateChecklists(project);
    for (const cl of result) {
      expect(cl.subtitle).toContain("Edifício Nova");
      expect(cl.subtitle).toContain("Porto");
    }
  });
});

// ============================================================
// generateChecklistForArea
// ============================================================

describe("generateChecklistForArea", () => {
  it("returns checklist for specific area", () => {
    const result = generateChecklistForArea("fire_safety", makeProject());
    expect(result).not.toBeNull();
    expect(result!.specialty).toBe("fire_safety");
  });

  it("returns null for area with no generator", () => {
    // "energy" has no dedicated checklist generator
    const result = generateChecklistForArea("energy", makeProject());
    expect(result).toBeNull();
  });

  it("returns same data as generateChecklists for that area", () => {
    const project = makeProject();
    const all = generateChecklists(project);
    const single = generateChecklistForArea("electrical", project);
    const fromAll = all.find(cl => cl.specialty === "electrical");
    expect(single?.items.length).toBe(fromAll?.items.length);
  });
});

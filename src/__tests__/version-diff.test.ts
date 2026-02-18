import { describe, it, expect } from "vitest";
import { compareVersions, type ProjectVersion } from "@/lib/version-diff";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject, AnalysisResult } from "@/lib/types";

function createVersion(overrides: { project?: Partial<BuildingProject>; analysis?: Partial<AnalysisResult>; id?: string } = {}): ProjectVersion {
  const project: BuildingProject = {
    ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)),
    name: "Test",
    ...overrides.project,
  };
  return {
    id: overrides.id ?? "v1",
    name: "Version 1",
    timestamp: new Date().toISOString(),
    project,
    analysis: overrides.analysis ? {
      projectName: "Test",
      overallScore: 70,
      energyClass: "B-",
      findings: [],
      recommendations: [],
      regulationSummary: [],
      ...overrides.analysis,
    } : undefined,
  };
}

describe("compareVersions", () => {
  it("detects field changes", () => {
    const prev = createVersion({ project: { grossFloorArea: 100 } });
    const curr = createVersion({ id: "v2", project: { grossFloorArea: 200 } });
    const diff = compareVersions(prev, curr);

    expect(diff.fieldChanges.length).toBeGreaterThan(0);
    const areaChange = diff.fieldChanges.find(f => f.path === "grossFloorArea");
    expect(areaChange).toBeDefined();
    expect(areaChange!.type).toBe("changed");
    expect(areaChange!.previousValue).toBe(100);
    expect(areaChange!.currentValue).toBe(200);
  });

  it("detects added fields", () => {
    const prev = createVersion({ project: { name: "Original" } });
    const curr = createVersion({
      id: "v2",
      project: { name: "Updated", numberOfDwellings: 4 },
    });
    const diff = compareVersions(prev, curr);
    // numberOfDwellings changed from 1 to 4
    const dwellingChange = diff.fieldChanges.find(f => f.path === "numberOfDwellings");
    expect(dwellingChange).toBeDefined();
  });

  it("calculates score change", () => {
    const prev = createVersion({
      analysis: { overallScore: 60, regulationSummary: [], findings: [] },
    });
    const curr = createVersion({
      id: "v2",
      analysis: { overallScore: 80, regulationSummary: [], findings: [] },
    });
    const diff = compareVersions(prev, curr);
    expect(diff.scoreChange).toBe(20);
  });

  it("identifies new findings", () => {
    const prev = createVersion({
      analysis: {
        overallScore: 70,
        findings: [],
        regulationSummary: [],
      },
    });
    const curr = createVersion({
      id: "v2",
      analysis: {
        overallScore: 60,
        findings: [{
          id: "F-1",
          area: "thermal",
          regulation: "REH",
          article: "Art. 1",
          description: "New issue",
          severity: "critical",
        }],
        regulationSummary: [],
      },
    });
    const diff = compareVersions(prev, curr);
    expect(diff.newFindings.length).toBe(1);
    expect(diff.newFindings[0].description).toBe("New issue");
  });

  it("identifies resolved findings", () => {
    const prev = createVersion({
      analysis: {
        overallScore: 60,
        findings: [{
          id: "F-1",
          area: "thermal",
          regulation: "REH",
          article: "Art. 1",
          description: "Old issue",
          severity: "warning",
        }],
        regulationSummary: [],
      },
    });
    const curr = createVersion({
      id: "v2",
      analysis: {
        overallScore: 80,
        findings: [],
        regulationSummary: [],
      },
    });
    const diff = compareVersions(prev, curr);
    expect(diff.resolvedFindings.length).toBe(1);
  });

  it("generates meaningful summary", () => {
    const prev = createVersion({ project: { name: "V1" } });
    const curr = createVersion({ id: "v2", project: { name: "V2" } });
    const diff = compareVersions(prev, curr);
    expect(diff.summary.length).toBeGreaterThan(0);
    expect(diff.timestamp).toBeDefined();
    expect(diff.previousVersion).toBe("v1");
    expect(diff.currentVersion).toBe("v2");
  });

  it("reports no changes for identical versions", () => {
    const prev = createVersion();
    const curr = createVersion({ id: "v2" });
    const diff = compareVersions(prev, curr);
    expect(diff.fieldChanges.length).toBe(0);
    expect(diff.scoreChange).toBe(0);
  });
});

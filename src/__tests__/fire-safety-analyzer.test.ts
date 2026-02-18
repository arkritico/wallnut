import { describe, it, expect } from "vitest";
import {
  canAnalyzeFireSafety,
  analyzeFireSafetySCIE,
  enrichProjectWithFireSafetyCalculations,
} from "@/lib/fire-safety-analyzer";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject } from "@/lib/types";

function createProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)), name: "Fire Safety Test", ...overrides };
}

// ============================================================================
// canAnalyzeFireSafety — gate check
// ============================================================================

describe("canAnalyzeFireSafety", () => {
  it("returns true for DEFAULT_PROJECT (has UT type 'I' + area 150)", () => {
    const project = createProject();
    expect(canAnalyzeFireSafety(project)).toBe(true);
  });

  it("returns false if fireSafety.utilizationType is removed AND buildingType is also removed", () => {
    const project = createProject();
    const fs = project.fireSafety as Record<string, unknown>;
    delete fs.utilizationType;
    (project as Record<string, unknown>).buildingType = undefined;
    // Without UT and without buildingType, the gate check has no type info
    // Also remove area/height to ensure failure
    (project as Record<string, unknown>).grossFloorArea = 0;
    (project as Record<string, unknown>).usableFloorArea = 0;
    (project as Record<string, unknown>).buildingHeight = 0;
    (project as Record<string, unknown>).numberOfFloors = 0;
    expect(canAnalyzeFireSafety(project)).toBe(false);
  });
});

// ============================================================================
// computeFireSafetyValues — tested through analyzeFireSafetySCIE result.computed
// (computeFireSafetyValues is not exported)
// ============================================================================

describe("computeFireSafetyValues (via result.computed)", () => {
  it("occupant load for UT-I with 150 m² area = ceil(150 * 0.04) = 6 persons", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    expect(result.computed.occupantLoad).toBe(Math.ceil(150 * 0.04));
    expect(result.computed.occupantLoad).toBe(6);
  });

  it("risk category for UT-I, height 6m, 6 persons = '1' (1.ª categoria)", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    expect(result.computed.riskCategory).toBe("1");
  });

  it("required REI for cat 1 residential should be 30", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    // From REQUIRED_REI table: category "1" => 30
    expect(result.computed.requiredREI).toBe(30);
  });

  it("maxCompartmentArea should be > 0", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    expect(result.computed.maxCompartmentArea).toBeGreaterThan(0);
  });

  it("requiredEvacuationWidth should be > 0", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    expect(result.computed.requiredEvacuationWidth).toBeGreaterThan(0);
  });

  it("sprinklersRequired should be false for small residential", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    // Category 1 => sprinklers not required (only >= 3)
    expect(result.computed.sprinklersRequired).toBe(false);
  });

  it("detectionRequired should be false for cat 1 residential", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    // Category 1 => detection not required (only >= 2)
    expect(result.computed.detectionRequired).toBe(false);
  });

  it("commercial building (UT VIII, 500 m²) gets higher risk category and more requirements", () => {
    const commercial = createProject({
      buildingType: "commercial",
      grossFloorArea: 500,
      usableFloorArea: 400,
      buildingHeight: 12,
      numberOfFloors: 4,
      fireSafety: {
        ...DEFAULT_PROJECT.fireSafety,
        utilizationType: "VIII",
      },
    });
    const result = analyzeFireSafetySCIE(commercial);

    // UT VIII with 500 m², height 12 m: occupancy = ceil(500 * 0.20) = 100
    expect(result.computed.occupantLoad).toBe(Math.ceil(500 * 0.20));
    expect(result.computed.occupantLoad).toBe(100);

    // For UT VIII: cat 1 thresholds are maxHeight:9, maxArea:800, maxOccupancy:100
    // height 12 > 9 so doesn't fit cat 1. Cat 2: maxHeight:28, maxArea:3200, maxOccupancy:500
    // 12 <= 28, 500 <= 3200, 100 <= 500 => fits cat 2
    expect(parseInt(result.computed.riskCategory)).toBeGreaterThanOrEqual(2);

    // Higher risk category means more requirements
    expect(result.computed.requiredREI).toBeGreaterThanOrEqual(60);
    expect(result.computed.detectionRequired).toBe(true);
  });
});

// ============================================================================
// analyzeFireSafetySCIE — main analysis
// ============================================================================

describe("analyzeFireSafetySCIE", () => {
  it("returns findings with IDs starting with SCIE-CALC-", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    for (const finding of result.findings) {
      expect(finding.id).toMatch(/^SCIE-CALC-/);
    }
  });

  it("returns statistics with checksPerformed > 0", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    expect(result.statistics.checksPerformed).toBeGreaterThan(0);
    expect(result.statistics.checksPerformed).toBe(result.findings.length);
  });

  it("small residential has mostly pass findings", () => {
    const project = createProject();
    // DEFAULT_PROJECT has fire extinguishers, emergency lighting, alarm, REI 30, etc.
    const result = analyzeFireSafetySCIE(project);

    const passingFindings = result.findings.filter((f) => f.severity === "pass");
    expect(passingFindings.length).toBeGreaterThan(0);
    // The majority should pass for a well-configured small residential
    expect(result.statistics.passed).toBeGreaterThan(0);
  });

  it("residential with insufficient fire resistance produces critical finding", () => {
    const project = createProject({
      fireSafety: {
        ...DEFAULT_PROJECT.fireSafety,
        // Set a fire resistance below required REI 30 for category 1
        fireResistanceOfStructure: 15,
      },
    });
    const result = analyzeFireSafetySCIE(project);

    const reiFinding = result.findings.find(
      (f) => f.article === "Art. 15.º" && f.severity === "critical",
    );
    expect(reiFinding).toBeDefined();
    expect(reiFinding!.description).toContain("REI");
  });
});

// ============================================================================
// enrichProjectWithFireSafetyCalculations — field injection
// ============================================================================

describe("enrichProjectWithFireSafetyCalculations", () => {
  it("after enrichment, project should have fireSafety.computedOccupantLoad and riskCategory", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    enrichProjectWithFireSafetyCalculations(project, result);

    const fs = project.fireSafety as Record<string, unknown>;
    expect(fs.computedOccupantLoad).toBeDefined();
    expect(fs.computedOccupantLoad).toBe(6);
    expect(fs.computedRiskCategory).toBeDefined();
    expect(fs.computedRiskCategory).toBe("1");
    expect(fs.riskCategory).toBeDefined();
    expect(fs.occupantLoad).toBeDefined();
  });

  it("injects all computed values into the fireSafety object", () => {
    const project = createProject();
    const result = analyzeFireSafetySCIE(project);
    enrichProjectWithFireSafetyCalculations(project, result);

    const fs = project.fireSafety as Record<string, unknown>;
    expect(fs.computedRequiredREI).toBe(result.computed.requiredREI);
    expect(fs.computedMaxCompartmentArea).toBe(result.computed.maxCompartmentArea);
    expect(fs.computedMinExitsRequired).toBe(result.computed.minExitsRequired);
    expect(fs.computedRequiredEvacuationUP).toBe(result.computed.requiredEvacuationUP);
    expect(fs.computedRequiredEvacuationWidth).toBe(result.computed.requiredEvacuationWidth);
    expect(fs.computedMaxEvacuationDistance).toBe(result.computed.maxEvacuationDistance);
    expect(fs.computedMaxDeadEndDistance).toBe(result.computed.maxDeadEndDistance);
    expect(fs.computedRequiredExtinguishers).toBe(result.computed.requiredExtinguishers);
    expect(fs.computedSprinklersRequired).toBe(result.computed.sprinklersRequired);
    expect(fs.computedDetectionRequired).toBe(result.computed.detectionRequired);
  });
});

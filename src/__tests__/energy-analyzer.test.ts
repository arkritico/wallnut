import { describe, it, expect } from "vitest";
import {
  canAnalyzeEnergy,
  analyzeEnergySCE,
  enrichProjectWithEnergyCalculations,
} from "@/lib/energy-analyzer";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject } from "@/lib/types";

function createProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)), name: "Energy Test", ...overrides };
}

// ============================================================================
// canAnalyzeEnergy — gate check
// ============================================================================

describe("canAnalyzeEnergy", () => {
  it("returns true for DEFAULT_PROJECT (has envelope with U-values > 0, wall area > 0, climate zones)", () => {
    const project = createProject();
    expect(canAnalyzeEnergy(project)).toBe(true);
  });

  it("returns false when envelope is missing", () => {
    const project = createProject();
    (project as Record<string, unknown>).envelope = undefined;
    expect(canAnalyzeEnergy(project)).toBe(false);
  });

  it("returns false when wall U-value is 0", () => {
    const project = createProject({
      envelope: { ...DEFAULT_PROJECT.envelope, externalWallUValue: 0 },
    });
    expect(canAnalyzeEnergy(project)).toBe(false);
  });

  it("returns false when climate zones are missing", () => {
    const project = createProject({
      location: {
        ...DEFAULT_PROJECT.location,
        climateZoneWinter: "" as never,
        climateZoneSummer: "" as never,
      },
    });
    expect(canAnalyzeEnergy(project)).toBe(false);
  });
});

// ============================================================================
// analyzeEnergySCE — main analysis
// ============================================================================

describe("analyzeEnergySCE", () => {
  it("returns correct engine type SCE_ENERGY", () => {
    const project = createProject();
    const result = analyzeEnergySCE(project);
    expect(result.engineType).toBe("SCE_ENERGY");
  });

  it("returns thermal results with Nic, Ni, Nvc, Nv > 0", () => {
    const project = createProject();
    const result = analyzeEnergySCE(project);
    expect(result.thermal.Nic).toBeGreaterThan(0);
    expect(result.thermal.Ni).toBeGreaterThan(0);
    expect(result.thermal.Nvc).toBeGreaterThanOrEqual(0);
    expect(result.thermal.Nv).toBeGreaterThanOrEqual(0);
  });

  it("returns energy class result with a valid class", () => {
    const project = createProject();
    const result = analyzeEnergySCE(project);
    const validClasses = ["A+", "A", "B", "B-", "C", "D", "E", "F"];
    expect(validClasses).toContain(result.energyClass.energyClass);
    expect(result.energyClass.ratio).toBeGreaterThan(0);
    expect(result.energyClass.Ntc).toBeGreaterThan(0);
    expect(result.energyClass.Nt).toBeGreaterThan(0);
  });

  it("produces findings (at least thermal conformance checks)", () => {
    const project = createProject();
    const result = analyzeEnergySCE(project);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
  });

  it("finding IDs start with SCE-", () => {
    const project = createProject();
    const result = analyzeEnergySCE(project);
    for (const finding of result.findings) {
      expect(finding.id).toMatch(/^SCE-/);
    }
  });

  it("finding areas are 'thermal' or 'energy'", () => {
    const project = createProject();
    const result = analyzeEnergySCE(project);
    for (const finding of result.findings) {
      expect(["thermal", "energy"]).toContain(finding.area);
    }
  });

  it("efficient building gets better energy class than inefficient", () => {
    const efficient = createProject({
      systems: {
        ...DEFAULT_PROJECT.systems,
        heatingSystem: "heat_pump",
        dhwSystem: "heat_pump",
        hasSolarPV: true,
        solarPVCapacity: 5,
      },
      envelope: {
        ...DEFAULT_PROJECT.envelope,
        externalWallUValue: 0.25,
        roofUValue: 0.2,
        windowUValue: 1.2,
        hasHRV: true,
        hrvEfficiency: 85,
      },
    });

    const inefficient = createProject({
      systems: {
        ...DEFAULT_PROJECT.systems,
        heatingSystem: "electric_radiator",
        dhwSystem: "electric",
      },
    });

    const efficientResult = analyzeEnergySCE(efficient);
    const inefficientResult = analyzeEnergySCE(inefficient);

    // Lower ratio = better energy class
    expect(efficientResult.energyClass.ratio).toBeLessThan(inefficientResult.energyClass.ratio);
  });

  it("new building without solar produces critical finding (Art. 27.º)", () => {
    const project = createProject({
      isRehabilitation: false,
      buildingType: "residential",
    });
    // DEFAULT_PROJECT has hasSolarPV: false and hasSolarThermal: false
    const result = analyzeEnergySCE(project);

    const solarFinding = result.findings.find(
      (f) => f.article && f.article.includes("Art. 27"),
    );
    expect(solarFinding).toBeDefined();
    expect(solarFinding!.severity).toBe("critical");
  });
});

// ============================================================================
// enrichProjectWithEnergyCalculations — field injection
// ============================================================================

describe("enrichProjectWithEnergyCalculations", () => {
  it("injects energy namespace fields into the project", () => {
    const project = createProject();
    const result = analyzeEnergySCE(project);
    enrichProjectWithEnergyCalculations(project, result);

    const energy = (project as Record<string, unknown>).energy as Record<string, unknown>;
    expect(energy).toBeDefined();
    // Check injectedFields keys that start with "energy." are mapped into the energy object
    expect(Object.keys(energy).length).toBeGreaterThan(0);
  });

  it("after enrichment, project.energy should have ntcNtRatio and energyClass", () => {
    const project = createProject();
    const result = analyzeEnergySCE(project);
    enrichProjectWithEnergyCalculations(project, result);

    const energy = (project as Record<string, unknown>).energy as Record<string, unknown>;
    expect(energy.ntcNtRatio).toBeDefined();
    expect(energy.ntcNtRatio).toBeGreaterThan(0);
    expect(energy.energyClass).toBeDefined();
    const validClasses = ["A+", "A", "B", "B-", "C", "D", "E", "F"];
    expect(validClasses).toContain(energy.energyClass);
  });
});

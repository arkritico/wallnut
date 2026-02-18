import { describe, it, expect } from "vitest";
import { calculateThermal, calculateEnergyClass, calculateAcoustic, calculateElectrical, calculateWaterSizing } from "@/lib/calculations";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject } from "@/lib/types";

function createProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)), name: "Calc Test", ...overrides };
}

describe("thermal calculations", () => {
  it("calculates heating and cooling needs", () => {
    const project = createProject();
    const result = calculateThermal(project);
    
    expect(result.Nic).toBeGreaterThan(0);
    expect(result.Ni).toBeGreaterThan(0);
    expect(result.Nvc).toBeGreaterThanOrEqual(0);
    expect(result.Ntc).toBeGreaterThan(0);
    expect(result.Nt).toBeGreaterThan(0);
    expect(result.ratio).toBeGreaterThan(0);
    expect(result.totalHeatLoss).toBeGreaterThan(0);
  });

  it("reduces heating needs with better insulation", () => {
    const badInsulation = createProject({
      envelope: { ...DEFAULT_PROJECT.envelope, externalWallUValue: 1.5, roofUValue: 1.0 },
    });
    const goodInsulation = createProject({
      envelope: { ...DEFAULT_PROJECT.envelope, externalWallUValue: 0.3, roofUValue: 0.2 },
    });

    const badResult = calculateThermal(badInsulation);
    const goodResult = calculateThermal(goodInsulation);

    expect(goodResult.Nic).toBeLessThan(badResult.Nic);
  });

  it("reduces losses with HRV", () => {
    const noHRV = createProject();
    const withHRV = createProject({
      envelope: { ...DEFAULT_PROJECT.envelope, hasHRV: true, hrvEfficiency: 80 },
    });

    const noResult = calculateThermal(noHRV);
    const hrvResult = calculateThermal(withHRV);

    expect(hrvResult.totalHeatLoss).toBeLessThan(noResult.totalHeatLoss);
  });
});

describe("energy class calculation", () => {
  it("returns a valid energy class", () => {
    const result = calculateEnergyClass(createProject());
    expect(["A+", "A", "B", "B-", "C", "D", "E", "F"]).toContain(result.energyClass);
    expect(result.ratio).toBeGreaterThan(0);
  });

  it("gives better class to efficient buildings", () => {
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

    expect(calculateEnergyClass(efficient).ratio).toBeLessThan(calculateEnergyClass(inefficient).ratio);
  });
});

describe("acoustic calculations", () => {
  it("returns correct RRAE requirements for residential", () => {
    const project = createProject({ buildingType: "residential" });
    const result = calculateAcoustic(project);

    expect(result.requiredAirborne).toBe(50);
    expect(result.requiredImpact).toBe(60);
    expect(result.equipmentNoiseLimit).toBe(32);
  });

  it("adjusts facade requirement by noise zone", () => {
    const quiet = createProject({
      acoustic: { ...DEFAULT_PROJECT.acoustic, buildingLocation: "quiet" },
    });
    const noisy = createProject({
      acoustic: { ...DEFAULT_PROJECT.acoustic, buildingLocation: "noisy" },
    });

    expect(calculateAcoustic(noisy).requiredFacade).toBeGreaterThan(
      calculateAcoustic(quiet).requiredFacade,
    );
  });
});

describe("electrical calculations", () => {
  it("calculates total load and recommends supply type", () => {
    const project = createProject();
    const result = calculateElectrical(project);

    expect(result.totalLoad).toBeGreaterThan(0);
    expect(["single_phase", "three_phase"]).toContain(result.recommendedSupply);
    expect(result.recommendedPower).toBeGreaterThan(0);
    expect(result.mainBreakerAmps).toBeGreaterThan(0);
    expect(result.minCircuits).toBeGreaterThan(0);
    expect(result.minRCDCount).toBeGreaterThanOrEqual(2);
  });

  it("increases load with EV charging", () => {
    const noEV = createProject({
      electrical: { ...DEFAULT_PROJECT.electrical, hasEVCharging: false },
    });
    const withEV = createProject({
      electrical: { ...DEFAULT_PROJECT.electrical, hasEVCharging: true },
    });

    expect(calculateElectrical(withEV).totalLoad).toBeGreaterThan(
      calculateElectrical(noEV).totalLoad,
    );
  });
});

describe("water sizing calculations", () => {
  it("calculates pipe sizes and consumption", () => {
    const project = createProject();
    const result = calculateWaterSizing(project);

    expect(result.simultaneousFlow).toBeGreaterThan(0);
    expect(result.mainPipeDiameter).toBeGreaterThanOrEqual(16);
    expect(result.hotWaterPipeDiameter).toBeGreaterThanOrEqual(16);
    expect(result.drainagePipeDiameter).toBeGreaterThanOrEqual(90);
    expect(result.dailyConsumption).toBeGreaterThan(0);
  });

  it("increases sizing for more dwellings", () => {
    const small = createProject({ numberOfDwellings: 1 });
    const large = createProject({ numberOfDwellings: 10 });

    expect(calculateWaterSizing(large).simultaneousFlow).toBeGreaterThan(
      calculateWaterSizing(small).simultaneousFlow,
    );
  });
});

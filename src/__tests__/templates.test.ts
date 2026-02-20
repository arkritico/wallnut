import { describe, it, expect } from "vitest";
import { PROJECT_TEMPLATES, getTemplate } from "@/lib/templates";

describe("Project Templates", () => {
  it("exports 8 templates", () => {
    expect(PROJECT_TEMPLATES).toHaveLength(8);
  });

  it("Moradia T4 has correct metrics", () => {
    const t4 = getTemplate("moradia_t4");
    expect(t4).toBeDefined();
    expect(t4!.project.grossFloorArea).toBe(280);
    expect(t4!.project.numberOfFloors).toBe(3);
    expect(t4!.project.electrical?.contractedPower).toBe(13.8);
    expect(t4!.project.systems?.hasSolarPV).toBe(true);
    expect(t4!.project.electrical?.hasEVCharging).toBe(true);
  });

  it("Armazém Industrial has industrial type and sprinklers", () => {
    const warehouse = getTemplate("armazem_industrial");
    expect(warehouse).toBeDefined();
    expect(warehouse!.project.structural?.structuralSystem).toBe("steel");
    expect(warehouse!.project.grossFloorArea).toBe(1500);
    expect(warehouse!.project.fireSafety?.hasSprinklers).toBe(true);
    expect(warehouse!.project.electrical?.supplyType).toBe("three_phase");
    expect(warehouse!.project.electrical?.contractedPower).toBe(100);
  });

  it("Edifício Público has elevator and enhanced accessibility", () => {
    const publicBldg = getTemplate("edificio_publico");
    expect(publicBldg).toBeDefined();
    expect(publicBldg!.project.accessibility?.hasElevator).toBe(true);
    expect(publicBldg!.project.avac?.hasHVACProject).toBe(true);
    expect(publicBldg!.project.avac?.hasAirQualityControl).toBe(true);
    expect(publicBldg!.project.electrical?.hasEmergencyCircuit).toBe(true);
  });

  it("all 8 templates have key specialty sections defined", () => {
    const sections = [
      "architecture", "structural", "fireSafety", "electrical",
      "envelope", "systems", "accessibility", "licensing",
    ] as const;

    for (const tmpl of PROJECT_TEMPLATES) {
      for (const section of sections) {
        expect(
          tmpl.project[section],
          `Template "${tmpl.id}" missing section "${section}"`,
        ).toBeDefined();
      }
    }
  });

  it("each template has a unique id", () => {
    const ids = PROJECT_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

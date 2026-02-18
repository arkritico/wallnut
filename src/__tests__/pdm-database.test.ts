import { describe, it, expect } from "vitest";
import { detectPdmZone, getPdmConstraints, checkPdmCompliance, getAvailableMunicipalities, getPdmZoneOptions } from "@/lib/pdm-database";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import type { BuildingProject } from "@/lib/types";

function createProject(overrides: Partial<BuildingProject> = {}): BuildingProject {
  return { ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)), name: "PDM Test", ...overrides };
}

describe("detectPdmZone", () => {
  it("detects REN zone", () => {
    expect(detectPdmZone("Zona REN")).toBe("solo_rustico_ren");
  });

  it("detects RAN zone", () => {
    expect(detectPdmZone("Reserva RAN")).toBe("solo_rustico_ran");
  });

  it("detects historic center", () => {
    expect(detectPdmZone("Núcleo Histórico")).toBe("nucleo_historico");
    expect(detectPdmZone("Centro Histórico")).toBe("nucleo_historico");
  });

  it("detects residential zone", () => {
    expect(detectPdmZone("Espaço Residencial")).toBe("espaco_residencial");
    expect(detectPdmZone("Zona habitacional")).toBe("espaco_residencial");
  });

  it("detects central/mixed zone", () => {
    expect(detectPdmZone("Espaço Central")).toBe("espaco_central");
    expect(detectPdmZone("Uso misto")).toBe("espaco_central");
  });

  it("detects urban consolidated", () => {
    expect(detectPdmZone("Solo Urbano Consolidado")).toBe("solo_urbano_consolidado");
    expect(detectPdmZone("Solo urbano")).toBe("solo_urbano_consolidado");
  });

  it("detects industrial zone", () => {
    expect(detectPdmZone("Actividades Económicas")).toBe("espaco_actividades_economicas");
    expect(detectPdmZone("Zona industrial")).toBe("espaco_actividades_economicas");
  });

  it("returns unknown for empty/null input", () => {
    expect(detectPdmZone("")).toBe("unknown");
    expect(detectPdmZone(undefined)).toBe("unknown");
  });

  it("returns unknown for unrecognized input", () => {
    expect(detectPdmZone("xyz random text")).toBe("unknown");
  });
});

describe("getPdmConstraints", () => {
  it("returns default constraints for unknown municipality", () => {
    const result = getPdmConstraints("UnknownCity", "Espaço Residencial");
    expect(result.zone).toBe("espaco_residencial");
    expect(result.constraints.maxFloors).toBe(4);
    expect(result.constraints.newConstructionAllowed).toBe(true);
    expect(result.municipalityData).toBeUndefined();
  });

  it("returns Lisboa-specific overrides", () => {
    const result = getPdmConstraints("Lisboa", "Espaço Central");
    expect(result.zone).toBe("espaco_central");
    expect(result.municipalityData).toBeDefined();
    expect(result.municipalityData!.name).toBe("Lisboa");
    expect(result.constraints.maxFloors).toBe(10);
    expect(result.constraints.maxHeight).toBe(35);
  });

  it("returns Sintra restrictions for residential", () => {
    const result = getPdmConstraints("Sintra", "Espaço Residencial");
    expect(result.constraints.maxHeight).toBe(9);
    expect(result.constraints.maxFloors).toBe(2);
    expect(result.constraints.cos).toBe(0.30);
  });

  it("handles accented municipality names", () => {
    const result = getPdmConstraints("Setúbal", "Espaço Residencial");
    expect(result.municipalityData).toBeDefined();
  });
});

describe("checkPdmCompliance", () => {
  it("warns when no PDM zoning specified", () => {
    const project = createProject({
      localRegulations: { ...DEFAULT_PROJECT.localRegulations, pdmZoning: "" },
    });
    const findings = checkPdmCompliance(project);
    expect(findings.some(f => f.severity === "warning" && f.description.includes("classificação"))).toBe(true);
  });

  it("flags non-allowed construction in REN", () => {
    const project = createProject({
      localRegulations: { ...DEFAULT_PROJECT.localRegulations, pdmZoning: "Zona REN" },
      isRehabilitation: false,
    });
    const findings = checkPdmCompliance(project);
    expect(findings.some(f => f.severity === "critical" && f.description.includes("não permite"))).toBe(true);
  });

  it("flags height violations", () => {
    const project = createProject({
      localRegulations: { ...DEFAULT_PROJECT.localRegulations, pdmZoning: "Espaço Residencial" },
      buildingHeight: 50,
      location: { ...DEFAULT_PROJECT.location, municipality: "Sintra" },
    });
    const findings = checkPdmCompliance(project);
    expect(findings.some(f => f.severity === "critical" && f.description.includes("cércea"))).toBe(true);
  });

  it("flags floor count violations", () => {
    const project = createProject({
      localRegulations: { ...DEFAULT_PROJECT.localRegulations, pdmZoning: "Espaço Residencial" },
      numberOfFloors: 10,
    });
    const findings = checkPdmCompliance(project);
    expect(findings.some(f => f.severity === "critical" && f.description.includes("pisos"))).toBe(true);
  });

  it("passes compliant projects", () => {
    const project = createProject({
      localRegulations: { ...DEFAULT_PROJECT.localRegulations, pdmZoning: "Espaço Residencial" },
      buildingHeight: 6,
      numberOfFloors: 2,
    });
    const findings = checkPdmCompliance(project);
    const criticals = findings.filter(f => f.severity === "critical");
    expect(criticals.length).toBe(0);
  });

  it("flags incompatible building type", () => {
    const project = createProject({
      localRegulations: { ...DEFAULT_PROJECT.localRegulations, pdmZoning: "Actividades Económicas" },
      buildingType: "residential",
    });
    const findings = checkPdmCompliance(project);
    expect(findings.some(f => f.severity === "critical" && f.description.includes("compatível"))).toBe(true);
  });

  it("provides ARU info when applicable", () => {
    const project = createProject({
      localRegulations: { ...DEFAULT_PROJECT.localRegulations, pdmZoning: "Espaço Residencial" },
      licensing: { ...DEFAULT_PROJECT.licensing, isInARU: true },
    });
    const findings = checkPdmCompliance(project);
    expect(findings.some(f => f.severity === "info" && f.description.includes("ARU"))).toBe(true);
  });
});

describe("utility functions", () => {
  it("getAvailableMunicipalities returns sorted list", () => {
    const municipalities = getAvailableMunicipalities();
    expect(municipalities.length).toBeGreaterThan(10);
    expect(municipalities).toContain("Lisboa");
    expect(municipalities).toContain("Porto");
    // Check sorted
    for (let i = 1; i < municipalities.length; i++) {
      expect(municipalities[i].localeCompare(municipalities[i - 1])).toBeGreaterThanOrEqual(0);
    }
  });

  it("getPdmZoneOptions returns valid options", () => {
    const options = getPdmZoneOptions();
    expect(options.length).toBeGreaterThan(10);
    expect(options.every(o => o.value !== "unknown")).toBe(true);
    expect(options.every(o => o.label.length > 0)).toBe(true);
  });
});

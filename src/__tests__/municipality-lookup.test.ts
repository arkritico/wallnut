import { describe, it, expect } from "vitest";
import {
  lookupMunicipality,
  resolveLocationParams,
  computeClimateZones,
  getAllMunicipalities,
  getMunicipalitiesByDistrict,
  getNutsIIIRegions,
  getNutsIIIParams,
} from "@/lib/municipality-lookup";

describe("municipality-lookup", () => {
  describe("lookupMunicipality", () => {
    it("finds Lisboa by exact name", () => {
      const result = lookupMunicipality("Lisboa");
      expect(result).toBeDefined();
      expect(result!.district).toBe("Lisboa");
      expect(result!.seismicZoneType1).toBe("1.3");
      expect(result!.seismicZoneType2).toBe("2.3");
      expect(result!.canonicalName).toBe("Lisboa");
    });

    it("finds municipality case-insensitively", () => {
      const result = lookupMunicipality("lisboa");
      expect(result).toBeDefined();
      expect(result!.canonicalName).toBe("Lisboa");
    });

    it("finds municipality ignoring accents", () => {
      const result = lookupMunicipality("Evora");
      expect(result).toBeDefined();
      expect(result!.canonicalName).toBe("Évora");
      expect(result!.district).toBe("Évora");
    });

    it("returns undefined for unknown municipality", () => {
      expect(lookupMunicipality("Atlantis")).toBeUndefined();
    });

    it("returns correct data for Porto", () => {
      const result = lookupMunicipality("Porto");
      expect(result).toBeDefined();
      expect(result!.district).toBe("Porto");
      expect(result!.nutsIII).toBe("Área Metropolitana do Porto");
      expect(result!.seismicZoneType1).toBe("1.6");
      expect(result!.seismicZoneType2).toBe("2.5");
      expect(result!.defaultSoilType).toBe("B");
    });

    it("returns correct data for Azores (Ponta Delgada)", () => {
      const result = lookupMunicipality("Ponta Delgada");
      expect(result).toBeDefined();
      expect(result!.seismicZoneType1).toBe("N/A"); // No Type 1 for Azores
      expect(result!.seismicZoneType2).toBe("2.1"); // Highest Type 2
    });
  });

  describe("computeClimateZones", () => {
    it("computes I1 winter zone for low-altitude Lisbon area", () => {
      const result = computeClimateZones("Área Metropolitana de Lisboa", 77);
      expect(result).toBeDefined();
      expect(result!.climateZoneWinter).toBe("I1");
      expect(result!.heatingDegreeDays).toBeLessThanOrEqual(1300);
    });

    it("computes I3 winter zone for high-altitude Serra da Estrela area", () => {
      const result = computeClimateZones("Beiras e Serra da Estrela", 1056);
      expect(result).toBeDefined();
      expect(result!.climateZoneWinter).toBe("I3");
      expect(result!.heatingDegreeDays).toBeGreaterThan(1800);
    });

    it("computes different winter zones at different altitudes in same region", () => {
      const low = computeClimateZones("Região de Coimbra", 50);
      const high = computeClimateZones("Região de Coimbra", 800);
      expect(low).toBeDefined();
      expect(high).toBeDefined();
      expect(high!.heatingDegreeDays).toBeGreaterThan(low!.heatingDegreeDays);
    });

    it("returns V3 summer zone for hot interior regions", () => {
      const result = computeClimateZones("Baixo Alentejo", 178);
      expect(result).toBeDefined();
      expect(result!.climateZoneSummer).toBe("V3");
      expect(result!.summerExternalTemp).toBeGreaterThanOrEqual(22);
    });

    it("returns undefined for unknown NUTS III region", () => {
      expect(computeClimateZones("Unknown Region", 100)).toBeUndefined();
    });

    it("altitude increases GD (colder at higher altitude)", () => {
      const base = computeClimateZones("Alto Minho", 268); // z_ref
      const high = computeClimateZones("Alto Minho", 1000);
      expect(base).toBeDefined();
      expect(high).toBeDefined();
      expect(high!.heatingDegreeDays).toBeGreaterThan(base!.heatingDegreeDays);
    });

    it("altitude decreases summer temperature", () => {
      const base = computeClimateZones("Alto Minho", 268);
      const high = computeClimateZones("Alto Minho", 1000);
      expect(base).toBeDefined();
      expect(high).toBeDefined();
      expect(high!.summerExternalTemp).toBeLessThan(base!.summerExternalTemp);
    });
  });

  describe("resolveLocationParams", () => {
    it("resolves Lisboa with all parameters", () => {
      const result = resolveLocationParams("Lisboa", 77);
      expect(result).toBeDefined();
      expect(result!.municipality).toBe("Lisboa");
      expect(result!.district).toBe("Lisboa");
      expect(result!.nutsIII).toBe("Área Metropolitana de Lisboa");
      expect(result!.seismicZoneType1).toBe("1.3");
      expect(result!.seismicZoneType2).toBe("2.3");
      expect(result!.soilType).toBe("C");
      expect(result!.climateZoneWinter).toBe("I1");
      expect(result!.heatingDegreeDays).toBeGreaterThan(0);
      expect(result!.solarRadiationSouth).toBeGreaterThan(0);
    });

    it("resolves Guarda as I3 (high altitude)", () => {
      const result = resolveLocationParams("Guarda");
      expect(result).toBeDefined();
      expect(result!.climateZoneWinter).toBe("I3");
      expect(result!.altitude).toBe(1056); // default altitude
    });

    it("uses default altitude when not provided", () => {
      const result = resolveLocationParams("Porto");
      expect(result).toBeDefined();
      expect(result!.altitude).toBe(104); // default for Porto
    });

    it("overrides altitude when provided", () => {
      const result = resolveLocationParams("Porto", 500);
      expect(result).toBeDefined();
      expect(result!.altitude).toBe(500);
    });

    it("returns undefined for unknown municipality", () => {
      expect(resolveLocationParams("Atlantis")).toBeUndefined();
    });

    it("handles accent-insensitive lookup", () => {
      const result = resolveLocationParams("evora");
      expect(result).toBeDefined();
      expect(result!.municipality).toBe("Évora");
    });
  });

  describe("getAllMunicipalities", () => {
    it("returns a non-empty sorted array", () => {
      const all = getAllMunicipalities();
      expect(all.length).toBeGreaterThanOrEqual(40);
      // Check sorted
      for (let i = 1; i < all.length; i++) {
        expect(all[i].localeCompare(all[i - 1], "pt")).toBeGreaterThanOrEqual(0);
      }
    });

    it("includes major cities", () => {
      const all = getAllMunicipalities();
      expect(all).toContain("Lisboa");
      expect(all).toContain("Porto");
      expect(all).toContain("Faro");
      expect(all).toContain("Guarda");
    });
  });

  describe("getMunicipalitiesByDistrict", () => {
    it("returns Lisboa district municipalities", () => {
      const result = getMunicipalitiesByDistrict("Lisboa");
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result).toContain("Lisboa");
      expect(result).toContain("Sintra");
    });

    it("returns empty for unknown district", () => {
      expect(getMunicipalitiesByDistrict("Unknown")).toEqual([]);
    });

    it("returns Porto district municipalities", () => {
      const result = getMunicipalitiesByDistrict("Porto");
      expect(result).toContain("Porto");
      expect(result).toContain("Vila Nova de Gaia");
      expect(result).toContain("Matosinhos");
    });
  });

  describe("getNutsIIIRegions", () => {
    it("returns all NUTS III regions", () => {
      const regions = getNutsIIIRegions();
      expect(regions.length).toBeGreaterThanOrEqual(20);
      expect(regions).toContain("Área Metropolitana de Lisboa");
      expect(regions).toContain("Algarve");
      expect(regions).toContain("R.A. Açores");
    });
  });

  describe("getNutsIIIParams", () => {
    it("returns climate parameters for a region", () => {
      const params = getNutsIIIParams("Algarve");
      expect(params).toBeDefined();
      expect(params!.GD_ref).toBe(987);
      expect(params!.z_ref).toBe(111);
      expect(params!.a_winter).toBe(1.2);
      expect(params!.Gsul_ref).toBe(520);
    });

    it("returns undefined for unknown region", () => {
      expect(getNutsIIIParams("Unknown")).toBeUndefined();
    });
  });
});

// ============================================================
// MUNICIPALITY LOOKUP — Auto-derive location parameters
// ============================================================
//
// Resolves a Portuguese municipality name into seismic zones,
// climate zones, soil type, heating degree-days, and other
// parameters required by the regulation engine.
//
// Climate zones are computed dynamically from NUTS III reference
// parameters + altitude using Despacho 15793-F/2013 formulas.
// Seismic zones come from NP EN 1998-1 Quadro NA.I.

import municipalityData from "../../data/portugal-municipalities.json";

// ── Types ──

export interface MunicipalityEntry {
  district: string;
  nutsIII: string;
  seismicZoneType1: string;
  seismicZoneType2: string;
  defaultAltitude: number;
  defaultSoilType: string;
  lat: number;
  lon: number;
}

export interface NutsIIIClimateParams {
  district: string;
  GD_ref: number;
  z_ref: number;
  a_winter: number;
  M_ref: number;
  a_M: number;
  theta_ext_v_ref: number;
  a_summer: number;
  Gsul_ref: number;
}

export interface ComputedClimate {
  climateZoneWinter: "I1" | "I2" | "I3";
  climateZoneSummer: "V1" | "V2" | "V3";
  heatingDegreeDays: number;
  heatingSeasonMonths: number;
  summerExternalTemp: number;
  solarRadiationSouth: number;
}

export interface ResolvedLocationParams extends ComputedClimate {
  municipality: string;
  district: string;
  nutsIII: string;
  seismicZoneType1: string;
  seismicZoneType2: string;
  soilType: string;
  altitude: number;
  lat: number;
  lon: number;
}

// ── Data access ──

const municipalities = municipalityData.municipalities as Record<string, MunicipalityEntry>;
const nutsIIIRegions = municipalityData.nutsIII as Record<string, NutsIIIClimateParams>;
const thresholds = municipalityData.thresholds;

// Build normalized name → canonical name lookup for fuzzy matching
const normalizedIndex = new Map<string, string>();
for (const name of Object.keys(municipalities)) {
  normalizedIndex.set(normalizeName(name), name);
}

// ── Name normalization ──

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, " ")
    .trim();
}

// ── Public API ──

/**
 * Look up a municipality by name (case-insensitive, accent-insensitive).
 * Returns the raw municipality entry or undefined if not found.
 */
export function lookupMunicipality(name: string): (MunicipalityEntry & { canonicalName: string }) | undefined {
  // Try exact match first
  if (municipalities[name]) {
    return { ...municipalities[name], canonicalName: name };
  }
  // Try normalized match
  const normalized = normalizeName(name);
  const canonical = normalizedIndex.get(normalized);
  if (canonical && municipalities[canonical]) {
    return { ...municipalities[canonical], canonicalName: canonical };
  }
  return undefined;
}

/**
 * Compute climate zones from NUTS III reference parameters + altitude.
 * Uses Despacho 15793-F/2013 formulas:
 *   GD = GD_ref + a_winter × (z - z_ref)
 *   M = M_ref + a_M × (z - z_ref)
 *   θ_ext_v = theta_ext_v_ref + a_summer × (z - z_ref)
 */
export function computeClimateZones(nutsIIIName: string, altitude: number): ComputedClimate | undefined {
  const params = nutsIIIRegions[nutsIIIName];
  if (!params) return undefined;

  const dz = altitude - params.z_ref;

  // Heating degree-days
  const GD = Math.round(params.GD_ref + params.a_winter * dz);

  // Heating season duration (months)
  const M = Math.round((params.M_ref + params.a_M * dz) * 10) / 10;

  // Summer external temperature
  const theta = Math.round((params.theta_ext_v_ref + params.a_summer * dz) * 10) / 10;

  // Solar radiation on south-facing surface (assumed constant within NUTS III)
  const Gsul = params.Gsul_ref;

  // Winter zone classification
  let climateZoneWinter: "I1" | "I2" | "I3";
  if (GD <= thresholds.winter.I1.max_GD) {
    climateZoneWinter = "I1";
  } else if (GD <= thresholds.winter.I2.max_GD) {
    climateZoneWinter = "I2";
  } else {
    climateZoneWinter = "I3";
  }

  // Summer zone classification
  let climateZoneSummer: "V1" | "V2" | "V3";
  if (theta < thresholds.summer.V1.max_theta) {
    climateZoneSummer = "V1";
  } else if (theta < thresholds.summer.V3.min_theta) {
    climateZoneSummer = "V2";
  } else {
    climateZoneSummer = "V3";
  }

  return {
    climateZoneWinter,
    climateZoneSummer,
    heatingDegreeDays: GD,
    heatingSeasonMonths: M,
    summerExternalTemp: theta,
    solarRadiationSouth: Gsul,
  };
}

/**
 * Resolve all location parameters for a municipality.
 * Combines static seismic/soil data with dynamic climate computation.
 * @param municipality - Municipality name (fuzzy matched)
 * @param altitude - Override altitude in meters (uses default if omitted)
 */
export function resolveLocationParams(
  municipality: string,
  altitude?: number,
): ResolvedLocationParams | undefined {
  const entry = lookupMunicipality(municipality);
  if (!entry) return undefined;

  const alt = altitude ?? entry.defaultAltitude;
  const climate = computeClimateZones(entry.nutsIII, alt);
  if (!climate) return undefined;

  return {
    municipality: entry.canonicalName,
    district: entry.district,
    nutsIII: entry.nutsIII,
    seismicZoneType1: entry.seismicZoneType1,
    seismicZoneType2: entry.seismicZoneType2,
    soilType: entry.defaultSoilType,
    altitude: alt,
    lat: entry.lat,
    lon: entry.lon,
    ...climate,
  };
}

/**
 * Get all available municipality names (sorted alphabetically).
 */
export function getAllMunicipalities(): string[] {
  return Object.keys(municipalities).sort((a, b) => a.localeCompare(b, "pt"));
}

/**
 * Get municipalities filtered by district.
 */
export function getMunicipalitiesByDistrict(district: string): string[] {
  return Object.entries(municipalities)
    .filter(([, entry]) => entry.district === district)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b, "pt"));
}

/**
 * Get all NUTS III region names.
 */
export function getNutsIIIRegions(): string[] {
  return Object.keys(nutsIIIRegions).sort((a, b) => a.localeCompare(b, "pt"));
}

/**
 * Get the NUTS III climate parameters for a region.
 */
export function getNutsIIIParams(name: string): NutsIIIClimateParams | undefined {
  return nutsIIIRegions[name];
}

import { z } from "zod";
import type { BuildingProject } from "./types";

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

const BuildingTypeSchema = z.enum(["residential", "commercial", "mixed", "industrial"]);

const ClimateZoneWinterSchema = z.enum(["I1", "I2", "I3"]);
const ClimateZoneSummerSchema = z.enum(["V1", "V2", "V3"]);

// ---------------------------------------------------------------------------
// PortugalLocationSchema
// ---------------------------------------------------------------------------

export const PortugalLocationSchema = z.object({
  municipality: z.string().min(1, "Municipality is required"),
  district: z.string().min(1, "District is required"),
  altitude: z.number().min(0, "Altitude must be >= 0").max(3000, "Altitude must be <= 3000m"),
  distanceToCoast: z.number().min(0, "Distance to coast must be >= 0").max(500, "Distance to coast must be <= 500km"),
  climateZoneWinter: ClimateZoneWinterSchema,
  climateZoneSummer: ClimateZoneSummerSchema,
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  parish: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Sub-object schemas (passthrough — form builds these incrementally)
// ---------------------------------------------------------------------------

const looseObject = z.object({}).passthrough();

// ---------------------------------------------------------------------------
// BuildingProjectSchema
// ---------------------------------------------------------------------------

export const BuildingProjectSchema = z.object({
  // General info
  name: z.string().min(1, "Project name is required").max(200, "Project name must be 200 characters or fewer"),
  buildingType: BuildingTypeSchema,
  location: PortugalLocationSchema,
  yearBuilt: z.number().int("Year must be an integer").min(1800, "Year must be >= 1800").max(2100, "Year must be <= 2100").optional(),
  isRehabilitation: z.boolean(),

  // Dimensions
  grossFloorArea: z.number().positive("Gross floor area must be > 0").max(1_000_000, "Gross floor area must be <= 1,000,000 m\u00B2"),
  usableFloorArea: z.number().positive("Usable floor area must be > 0").max(1_000_000, "Usable floor area must be <= 1,000,000 m\u00B2"),
  numberOfFloors: z.number().int("Number of floors must be an integer").min(1, "Must have at least 1 floor").max(200, "Number of floors must be <= 200"),
  buildingHeight: z.number().positive("Building height must be > 0").max(1000, "Building height must be <= 1000m"),
  numberOfDwellings: z.number().int("Number of dwellings must be an integer").min(0, "Number of dwellings must be >= 0").optional(),

  // Sub-objects — validated loosely so the form can build them step-by-step
  architecture: looseObject,
  structural: looseObject,
  fireSafety: looseObject,
  avac: looseObject,
  waterDrainage: looseObject,
  gas: looseObject,
  electrical: looseObject,
  telecommunications: looseObject,
  envelope: looseObject,
  systems: looseObject,
  acoustic: looseObject,
  accessibility: looseObject,
  elevators: looseObject,
  licensing: looseObject,
  waste: looseObject,
  localRegulations: looseObject,
  drawingQuality: looseObject,
  projectContext: looseObject,
});

// ---------------------------------------------------------------------------
// validateBuildingProject
// ---------------------------------------------------------------------------

type ValidationSuccess = { success: true; data: BuildingProject };
type ValidationFailure = { success: false; errors: string[] };

export function validateBuildingProject(
  input: unknown,
): ValidationSuccess | ValidationFailure {
  const result = BuildingProjectSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data as unknown as BuildingProject };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });

  return { success: false, errors };
}

// ---------------------------------------------------------------------------
// Number guard utilities for the calculation engine
// ---------------------------------------------------------------------------

/** Returns 0 for NaN, null, undefined, or non-number values. */
export function safeNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

/** Returns 0 for NaN, Infinity, -Infinity, null, undefined, or non-number values. */
export function safeFiniteNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

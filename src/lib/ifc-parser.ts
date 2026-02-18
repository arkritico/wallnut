/**
 * Basic IFC/BIM file parser for extracting building data.
 * Reads IFC STEP files and extracts properties relevant to
 * Portuguese building regulation analysis.
 *
 * Supports IFC2x3 and IFC4 property extraction.
 */

export interface IfcExtractedData {
  projectName?: string;
  site?: { name?: string; latitude?: number; longitude?: number };
  building?: {
    name?: string;
    numberOfStoreys?: number;
    grossFloorArea?: number;
    buildingHeight?: number;
  };
  spaces: IfcSpace[];
  walls: IfcWallData[];
  windows: IfcWindowData[];
  materials: string[];
  propertySets: IfcPropertySet[];
  warnings: string[];
}

export interface IfcSpace {
  name: string;
  longName?: string;
  area?: number;
  volume?: number;
  height?: number;
}

export interface IfcWallData {
  name: string;
  thickness?: number;
  uValue?: number;
  material?: string;
  isExternal: boolean;
}

export interface IfcWindowData {
  name: string;
  width?: number;
  height?: number;
  area?: number;
  uValue?: number;
  solarFactor?: number;
  frameType?: string;
}

export interface IfcPropertySet {
  name: string;
  properties: Record<string, string | number | boolean>;
}

/**
 * Parse an IFC file and extract building data.
 */
export function parseIfc(content: string): IfcExtractedData {
  const lines = content.split("\n");
  const entities = new Map<string, string>();
  const warnings: string[] = [];

  // Parse STEP entities
  for (const line of lines) {
    const match = line.match(/^(#\d+)\s*=\s*(.+);?\s*$/);
    if (match) {
      entities.set(match[1], match[2]);
    }
  }

  if (entities.size === 0) {
    warnings.push("Nenhuma entidade IFC encontrada. Verifique se o ficheiro é IFC válido.");
    return { spaces: [], walls: [], windows: [], materials: [], propertySets: [], warnings };
  }

  const projectName = extractProjectName(entities);
  const site = extractSite(entities);
  const building = extractBuilding(entities);
  const spaces = extractSpaces(entities);
  const walls = extractWalls(entities);
  const windows = extractWindows(entities);
  const materials = extractMaterials(entities);
  const propertySets = extractPropertySets(entities);

  // Derive additional data from property sets
  enrichFromPropertySets(walls, windows, propertySets);

  return {
    projectName,
    site,
    building,
    spaces,
    walls,
    windows,
    materials,
    propertySets,
    warnings,
  };
}

function extractProjectName(entities: Map<string, string>): string | undefined {
  for (const val of entities.values()) {
    if (val.startsWith("IFCPROJECT(")) {
      const nameMatch = val.match(/IFCPROJECT\([^,]*,'([^']*)'/);
      if (nameMatch) return nameMatch[1];
    }
  }
  return undefined;
}

function extractSite(entities: Map<string, string>): IfcExtractedData["site"] {
  for (const val of entities.values()) {
    if (val.startsWith("IFCSITE(")) {
      const nameMatch = val.match(/'([^']*)'/);
      const name = nameMatch ? nameMatch[1] : undefined;

      // Try to extract lat/lon from refLatitude/refLongitude
      const coordMatch = val.match(/\((\d+),(\d+),(\d+)(?:,(\d+))?\)/g);
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (coordMatch && coordMatch.length >= 2) {
        latitude = parseDMS(coordMatch[0]);
        longitude = parseDMS(coordMatch[1]);
      }

      return { name, latitude, longitude };
    }
  }
  return undefined;
}

function parseDMS(dmsStr: string): number {
  const nums = dmsStr.match(/\d+/g);
  if (!nums || nums.length < 2) return 0;
  const d = parseInt(nums[0]);
  const m = parseInt(nums[1]);
  const s = nums.length > 2 ? parseInt(nums[2]) : 0;
  return d + m / 60 + s / 3600;
}

function extractBuilding(entities: Map<string, string>): IfcExtractedData["building"] {
  for (const val of entities.values()) {
    if (val.startsWith("IFCBUILDING(")) {
      const nameMatch = val.match(/'([^']*)'/);
      return { name: nameMatch ? nameMatch[1] : undefined };
    }
  }
  return undefined;
}

function extractSpaces(entities: Map<string, string>): IfcSpace[] {
  const spaces: IfcSpace[] = [];
  for (const val of entities.values()) {
    if (val.startsWith("IFCSPACE(")) {
      const parts = val.match(/'([^']*)'/g);
      spaces.push({
        name: parts?.[0]?.replace(/'/g, "") ?? "Space",
        longName: parts?.[1]?.replace(/'/g, ""),
      });
    }
  }
  return spaces;
}

function extractWalls(entities: Map<string, string>): IfcWallData[] {
  const walls: IfcWallData[] = [];
  for (const [, val] of entities) {
    if (val.startsWith("IFCWALL(") || val.startsWith("IFCWALLSTANDARDCASE(")) {
      const parts = val.match(/'([^']*)'/g);
      const name = parts?.[0]?.replace(/'/g, "") ?? "Wall";
      walls.push({
        name,
        isExternal: name.toLowerCase().includes("ext") || name.toLowerCase().includes("fachada"),
      });
    }
  }
  return walls;
}

function extractWindows(entities: Map<string, string>): IfcWindowData[] {
  const windows: IfcWindowData[] = [];
  for (const [, val] of entities) {
    if (val.startsWith("IFCWINDOW(")) {
      const parts = val.match(/'([^']*)'/g);
      const numMatch = val.match(/[\d.]+/g);
      windows.push({
        name: parts?.[0]?.replace(/'/g, "") ?? "Window",
        width: numMatch ? parseFloat(numMatch[numMatch.length - 2]) : undefined,
        height: numMatch ? parseFloat(numMatch[numMatch.length - 1]) : undefined,
      });
    }
  }
  return windows;
}

function extractMaterials(entities: Map<string, string>): string[] {
  const materials = new Set<string>();
  for (const val of entities.values()) {
    if (val.startsWith("IFCMATERIAL(")) {
      const nameMatch = val.match(/'([^']*)'/);
      if (nameMatch) materials.add(nameMatch[1]);
    }
  }
  return Array.from(materials);
}

function extractPropertySets(entities: Map<string, string>): IfcPropertySet[] {
  const psets: IfcPropertySet[] = [];

  for (const [id, val] of entities) {
    if (val.startsWith("IFCPROPERTYSET(")) {
      const nameMatch = val.match(/'([^']*)'/);
      if (!nameMatch) continue;
      const name = nameMatch[1];

      // Find property references
      const propRefs = val.match(/#\d+/g) || [];
      const properties: Record<string, string | number | boolean> = {};

      for (const ref of propRefs) {
        const propVal = entities.get(ref);
        if (!propVal) continue;

        if (propVal.startsWith("IFCPROPERTYSINGLEVALUE(")) {
          const propParts = propVal.match(/'([^']*)'/g);
          const propName = propParts?.[0]?.replace(/'/g, "");
          if (propName) {
            // Extract value
            const valMatch = propVal.match(/IFCREAL\(([\d.]+)\)|IFCBOOLEAN\(\.([A-Z]+)\.\)|IFCLABEL\('([^']*)'\)|IFCTEXT\('([^']*)'\)|IFCINTEGER\((\d+)\)/);
            if (valMatch) {
              if (valMatch[1]) properties[propName] = parseFloat(valMatch[1]);
              else if (valMatch[2]) properties[propName] = valMatch[2] === "TRUE";
              else if (valMatch[3]) properties[propName] = valMatch[3];
              else if (valMatch[4]) properties[propName] = valMatch[4];
              else if (valMatch[5]) properties[propName] = parseInt(valMatch[5]);
            }
          }
        }
      }

      if (Object.keys(properties).length > 0) {
        psets.push({ name, properties });
      }
    }
  }
  return psets;
}

function enrichFromPropertySets(
  walls: IfcWallData[],
  windows: IfcWindowData[],
  psets: IfcPropertySet[],
): void {
  // Look for thermal transmittance in Pset_WallCommon or custom psets
  for (const pset of psets) {
    const uValue = pset.properties["ThermalTransmittance"] as number | undefined
      ?? pset.properties["UValue"] as number | undefined;
    const isExternal = pset.properties["IsExternal"] as boolean | undefined;

    if (uValue !== undefined && pset.name.toLowerCase().includes("wall")) {
      for (const wall of walls) {
        if (wall.uValue === undefined) {
          wall.uValue = uValue;
          if (isExternal !== undefined) wall.isExternal = isExternal;
          break;
        }
      }
    }

    if (uValue !== undefined && pset.name.toLowerCase().includes("window")) {
      for (const win of windows) {
        if (win.uValue === undefined) {
          win.uValue = uValue;
          break;
        }
      }
    }

    const solarFactor = pset.properties["SolarHeatGainCoefficient"] as number | undefined
      ?? pset.properties["GValue"] as number | undefined;
    if (solarFactor !== undefined) {
      for (const win of windows) {
        if (win.solarFactor === undefined) {
          win.solarFactor = solarFactor;
          break;
        }
      }
    }
  }
}

/**
 * Convert IFC extracted data into partial BuildingProject fields.
 */
export function ifcToProjectFields(ifc: IfcExtractedData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (ifc.projectName) fields.name = ifc.projectName;
  if (ifc.building?.numberOfStoreys) fields.numberOfFloors = ifc.building.numberOfStoreys;
  if (ifc.building?.grossFloorArea) fields.grossFloorArea = ifc.building.grossFloorArea;
  if (ifc.building?.buildingHeight) fields.buildingHeight = ifc.building.buildingHeight;

  if (ifc.site?.latitude && ifc.site?.longitude) {
    fields.location = {
      latitude: ifc.site.latitude,
      longitude: ifc.site.longitude,
    };
  }

  // Calculate areas from spaces
  const totalArea = ifc.spaces.reduce((sum, s) => sum + (s.area ?? 0), 0);
  if (totalArea > 0) fields.usableFloorArea = totalArea;

  // Envelope from walls and windows
  const extWalls = ifc.walls.filter(w => w.isExternal);
  const avgWallU = extWalls.filter(w => w.uValue).reduce((sum, w) => sum + (w.uValue ?? 0), 0) / Math.max(1, extWalls.filter(w => w.uValue).length);
  const avgWinU = ifc.windows.filter(w => w.uValue).reduce((sum, w) => sum + (w.uValue ?? 0), 0) / Math.max(1, ifc.windows.filter(w => w.uValue).length);
  const avgSolarFactor = ifc.windows.filter(w => w.solarFactor).reduce((sum, w) => sum + (w.solarFactor ?? 0), 0) / Math.max(1, ifc.windows.filter(w => w.solarFactor).length);

  const envelope: Record<string, unknown> = {};
  if (avgWallU > 0) envelope.externalWallUValue = Math.round(avgWallU * 100) / 100;
  if (avgWinU > 0) envelope.windowUValue = Math.round(avgWinU * 100) / 100;
  if (avgSolarFactor > 0) envelope.windowSolarFactor = Math.round(avgSolarFactor * 100) / 100;

  const totalWinArea = ifc.windows.reduce((sum, w) => sum + ((w.width ?? 0) * (w.height ?? 0)), 0);
  if (totalWinArea > 0) envelope.windowArea = Math.round(totalWinArea * 100) / 100;

  if (Object.keys(envelope).length > 0) fields.envelope = envelope;

  fields.numberOfDwellings = ifc.spaces.filter(s =>
    s.longName?.toLowerCase().includes("fração") ||
    s.longName?.toLowerCase().includes("apartamento") ||
    s.longName?.toLowerCase().includes("dwelling"),
  ).length || undefined;

  return fields;
}

/**
 * IFC Specialty Analyzer
 *
 * Analyzes IFC files per specialty (Architecture, Structure, MEP, etc.)
 * to extract quantities, identify optimizations, and populate WBS articles
 * with measured data from the model.
 *
 * Each specialty IFC typically contains different IFC entities:
 *   - Architecture: IfcWall, IfcWindow, IfcDoor, IfcSlab, IfcRoof, IfcSpace, IfcCovering, IfcStair
 *   - Structure: IfcBeam, IfcColumn, IfcSlab, IfcFooting, IfcPile, IfcReinforcingBar
 *   - MEP (Plumbing): IfcPipeSegment, IfcPipeFitting, IfcFlowTerminal, IfcSanitaryTerminal
 *   - MEP (Electrical): IfcCableSegment, IfcElectricDistributionBoard, IfcLightFixture
 *   - MEP (HVAC): IfcDuctSegment, IfcAirTerminal, IfcUnitaryEquipment
 */

import type { IfcExtractedData, IfcPropertySet } from "./ifc-parser";
import type { WbsChapter, WbsSubChapter, WbsArticle, ConstructionPhase } from "./wbs-types";

// ============================================================
// Specialty Detection
// ============================================================

export type IfcSpecialty =
  | "architecture"
  | "structure"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "fire_safety"
  | "telecom"
  | "gas"
  | "unknown";

/** IFC entity prefixes that indicate each specialty */
const SPECIALTY_INDICATORS: Record<IfcSpecialty, RegExp[]> = {
  architecture: [
    /IFCWALL/i, /IFCWINDOW/i, /IFCDOOR/i, /IFCROOF/i, /IFCCOVERING/i,
    /IFCCURTAINWALL/i, /IFCSTAIR/i, /IFCRAILING/i, /IFCFURNISHINGELEMENT/i,
  ],
  structure: [
    /IFCBEAM/i, /IFCCOLUMN/i, /IFCFOOTING/i, /IFCPILE/i,
    /IFCREINFORCINGBAR/i, /IFCREINFORCINGMESH/i, /IFCTENDON/i,
    /IFCSTRUCTURALCURVECONNECTION/i, /IFCSTRUCTURALSURFACECONNECTION/i,
  ],
  plumbing: [
    /IFCPIPESEGMENT/i, /IFCPIPEFITTING/i, /IFCSANITARYTERMINAL/i,
    /IFCFLOWSTORAGE/i, /IFCVALVE/i, /IFCPUMP/i,
  ],
  electrical: [
    /IFCCABLESEGMENT/i, /IFCCABLECARRIERSEGMENT/i, /IFCELECTRICDISTRIBUTIONBOARD/i,
    /IFCLIGHTFIXTURE/i, /IFCOUTLET/i, /IFCSWITCHINGDEVICE/i,
    /IFCELECTRICAPPLIANCE/i, /IFCJUNCTIONBOX/i,
  ],
  hvac: [
    /IFCDUCTSEGMENT/i, /IFCDUCTFITTING/i, /IFCAIRTERMINAL/i,
    /IFCUNITARYEQUIPMENT/i, /IFCCOIL/i, /IFCFAN/i, /IFCCHILLER/i,
    /IFCBOILER/i, /IFCHEATEXCHANGER/i,
  ],
  fire_safety: [
    /IFCFIRESUPPRESSIONTERMINAL/i, /IFCALARM/i, /IFCSENSOR.*SMOKE/i,
    /IFCFLOWINSTRUMENT/i,
  ],
  telecom: [
    /IFCCOMMUNICATIONSAPPLIANCE/i, /IFCAUDIOVISUALAPPLIANCE/i,
  ],
  gas: [
    /IFCBURNER/i,
  ],
  unknown: [],
};

/**
 * Detect which specialty an IFC file represents by analyzing its entity types.
 */
export function detectSpecialty(content: string): IfcSpecialty {
  const entityCounts: Record<IfcSpecialty, number> = {
    architecture: 0, structure: 0, plumbing: 0, electrical: 0,
    hvac: 0, fire_safety: 0, telecom: 0, gas: 0, unknown: 0,
  };

  const lines = content.split("\n");
  for (const line of lines) {
    const entityMatch = line.match(/^#\d+\s*=\s*(\w+)\(/);
    if (!entityMatch) continue;
    const entityType = entityMatch[1];

    for (const [specialty, patterns] of Object.entries(SPECIALTY_INDICATORS)) {
      if (specialty === "unknown") continue;
      for (const pattern of patterns) {
        if (pattern.test(entityType)) {
          entityCounts[specialty as IfcSpecialty]++;
        }
      }
    }
  }

  // Return specialty with highest count (if any)
  let best: IfcSpecialty = "unknown";
  let bestCount = 0;
  for (const [specialty, count] of Object.entries(entityCounts)) {
    if (count > bestCount) {
      bestCount = count;
      best = specialty as IfcSpecialty;
    }
  }

  return best;
}

// ============================================================
// Entity Extraction (beyond base parser)
// ============================================================

export interface IfcQuantityData {
  entityType: string;
  name: string;
  globalId?: string;
  /** Key-value properties from property sets */
  properties: Record<string, string | number | boolean>;
  /** Properties keyed by property set name: { "Pset_WallCommon": { IsExternal: true, ... } } */
  propertySetData: Record<string, Record<string, string | number | boolean>>;
  /** Extracted quantities */
  quantities: {
    area?: number;
    volume?: number;
    length?: number;
    width?: number;
    depth?: number;
    height?: number;
    thickness?: number;
    weight?: number;
    count?: number;
  };
  /** Material assignments */
  materials: string[];
  /** Classification references (keynotes) */
  classification?: string;
  /** Hosting element reference */
  hostElement?: string;
  /** Storey/level */
  storey?: string;
}

/**
 * Deep-extract quantities and properties from an IFC file content.
 * Goes beyond the base parser to capture structural, MEP, and specialty entities.
 */
export function extractDetailedQuantities(content: string): IfcQuantityData[] {
  const lines = content.split("\n");
  const entities = new Map<string, string>();
  const results: IfcQuantityData[] = [];

  // First pass: index all entities
  // Note: IFC STEP lines end with ;\r or ; — strip trailing ; and whitespace when storing
  for (const line of lines) {
    const match = line.match(/^(#\d+)\s*=\s*(.+);?\s*$/);
    if (match) {
      // Strip trailing semicolon so reference regexes like /(#\d+)\)$/ work correctly
      entities.set(match[1], match[2].replace(/;$/, ''));
    }
  }

  // Entity types we want to extract
  const TARGET_ENTITIES = [
    // Architecture
    "IFCWALL", "IFCWALLSTANDARDCASE", "IFCWINDOW", "IFCDOOR",
    "IFCSLAB", "IFCROOF", "IFCSTAIR", "IFCSTAIRFLIGHT",
    "IFCRAILING", "IFCCOVERING", "IFCCURTAINWALL",
    "IFCSPACE", "IFCRAMP", "IFCRAMPFLIGHT",
    // Structure
    "IFCBEAM", "IFCCOLUMN", "IFCFOOTING", "IFCPILE",
    "IFCMEMBER", "IFCPLATE",
    // MEP
    "IFCPIPESEGMENT", "IFCPIPEFITTING", "IFCSANITARYTERMINAL",
    "IFCFLOWTERMINAL", "IFCFLOWSEGMENT",
    "IFCCABLESEGMENT", "IFCELECTRICDISTRIBUTIONBOARD",
    "IFCLIGHTFIXTURE", "IFCOUTLET", "IFCSWITCHINGDEVICE",
    "IFCDUCTSEGMENT", "IFCDUCTFITTING", "IFCAIRTERMINAL",
    "IFCUNITARYEQUIPMENT",
    "IFCFIRESUPPRESSIONTERMINAL", "IFCALARM", "IFCSENSOR",
  ];

  // Second pass: extract target entities
  for (const [id, val] of entities) {
    const typeMatch = val.match(/^(\w+)\(/);
    if (!typeMatch) continue;
    const entityType = typeMatch[1];

    if (!TARGET_ENTITIES.some(t => entityType.startsWith(t))) continue;
    // Skip TYPE definitions (IFCCOLUMNTYPE, IFCBEAMTYPE, etc.) — they are type templates, not actual elements
    if (entityType.endsWith("TYPE")) continue;

    const nameMatch = val.match(/'([^']*)'/g);
    // IFC entity order: (GlobalId, #OwnerHistory, Name, Description, ...)
    // nameMatch[0] = GlobalId (always a GUID), nameMatch[1] = Name attribute
    const globalId = nameMatch?.[0]?.replace(/'/g, "");
    const name = nameMatch?.[1]?.replace(/'/g, "") ?? entityType;
    // Decode IFC encoded text (\X\HH encoding for non-ASCII)
    const decodedName = name.replace(/\\X\\([0-9A-Fa-f]{2})/g,
      (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    const item: IfcQuantityData = {
      entityType,
      name: decodedName,
      globalId,
      properties: {},
      propertySetData: {},
      quantities: {},
      materials: [],
    };

    // Extract numeric values from entity definition (dimensions)
    const nums = val.match(/[\d.]+/g);
    if (nums && nums.length >= 2) {
      const lastTwo = nums.slice(-2).map(Number);
      // For windows/doors: last two nums are typically width and height
      if (entityType.startsWith("IFCWINDOW") || entityType.startsWith("IFCDOOR")) {
        if (lastTwo[0] > 0 && lastTwo[0] < 10) item.quantities.width = lastTwo[0];
        if (lastTwo[1] > 0 && lastTwo[1] < 10) item.quantities.height = lastTwo[1];
        if (item.quantities.width && item.quantities.height) {
          item.quantities.area = Math.round(item.quantities.width * item.quantities.height * 100) / 100;
        }
      }
    }

    // Parse Revit family name dimensions for structural elements (e.g., "250 x 450mm" or "250 x 1250mm")
    // Format: "TypeName:WIDTHxDEPTHmm:RevitId" or "TypeName:WIDTH x DEPTHmm:RevitId"
    if (entityType.startsWith("IFCCOLUMN") || entityType.startsWith("IFCBEAM") ||
        entityType.startsWith("IFCMEMBER") || entityType.startsWith("IFCFOOTING")) {
      const sectionMatch = decodedName.match(/:(\d+)\s*[xX×]\s*(\d+)\s*mm/i);
      if (sectionMatch) {
        const dim1 = Number(sectionMatch[1]) / 1000; // mm → m
        const dim2 = Number(sectionMatch[2]) / 1000; // mm → m
        item.quantities.width = dim1;
        item.quantities.depth = dim2;
        // Estimate volume: cross-section × typical element length
        // Columns: width * depth * ~3m floor height
        // Beams: width * depth * ~5m span
        const typicalLength = entityType.startsWith("IFCCOLUMN") ? 3.0 : 5.0;
        item.quantities.volume = Math.round(dim1 * dim2 * typicalLength * 1000) / 1000;
      }
    }

    // Find associated property sets via IFCRELDEFINESBYPROPERTIES
    for (const [, relVal] of entities) {
      if (!relVal.startsWith("IFCRELDEFINESBYPROPERTIES(")) continue;
      if (!new RegExp(`${id}[,)\\]]`).test(relVal)) continue;

      // Find the property set reference (last #ref before closing paren)
      const psetRef = relVal.match(/(#\d+)\)$/);
      if (!psetRef) continue;

      const psetVal = entities.get(psetRef[1]);
      if (!psetVal) continue;

      // Extract from IFCELEMENTQUANTITY
      if (psetVal.startsWith("IFCELEMENTQUANTITY(")) {
        const qRefs = psetVal.match(/#\d+/g) || [];
        for (const qRef of qRefs) {
          const qVal = entities.get(qRef);
          if (!qVal) continue;

          if (qVal.startsWith("IFCQUANTITYAREA(")) {
            const areaMatch = qVal.match(/'([^']*)'/);
            const numMatch = qVal.match(/([\d.]+)/g);
            const area = numMatch?.map(Number).find(n => n > 0 && n < 100000);
            if (area) {
              const label = areaMatch?.[1] ?? "";
              if (label.toLowerCase().includes("net")) item.quantities.area = area;
              else if (!item.quantities.area) item.quantities.area = area;
            }
          }
          if (qVal.startsWith("IFCQUANTITYVOLUME(")) {
            const numMatch = qVal.match(/([\d.]+)/g);
            const vol = numMatch?.map(Number).find(n => n > 0 && n < 100000);
            if (vol) item.quantities.volume = vol;
          }
          if (qVal.startsWith("IFCQUANTITYLENGTH(")) {
            const numMatch = qVal.match(/([\d.]+)/g);
            const len = numMatch?.map(Number).find(n => n > 0 && n < 100000);
            if (len) item.quantities.length = len;
          }
          if (qVal.startsWith("IFCQUANTITYWEIGHT(")) {
            const numMatch = qVal.match(/([\d.]+)/g);
            const wt = numMatch?.map(Number).find(n => n > 0 && n < 1000000);
            if (wt) item.quantities.weight = wt;
          }
        }
      }

      // Extract from IFCPROPERTYSET
      if (psetVal.startsWith("IFCPROPERTYSET(")) {
        // Get the property set name
        const psetNameMatch = psetVal.match(/'([^']*)'/);
        const psetName = psetNameMatch?.[1] ?? "";

        const propRefs = psetVal.match(/#\d+/g) || [];
        const psetProperties: Record<string, string | number | boolean> = {};

        for (const pRef of propRefs) {
          const propVal = entities.get(pRef);
          if (!propVal?.startsWith("IFCPROPERTYSINGLEVALUE(")) continue;
          const propParts = propVal.match(/'([^']*)'/g);
          const propName = propParts?.[0]?.replace(/'/g, "");
          if (!propName) continue;

          const valMatch = propVal.match(/IFCREAL\(([\d.]+)\)|IFCBOOLEAN\(\.([A-Z]+)\.\)|IFCLABEL\('([^']*)'\)|IFCTEXT\('([^']*)'\)|IFCINTEGER\((\d+)\)|IFCTHERMALTRANSMITTANCEMEASURE\(([\d.]+)\)|IFCPOSITIVELENGTHMEASURE\(([\d.]+)\)|IFCAREAMEASURE\(([\d.]+)\)/);
          if (valMatch) {
            let value: string | number | boolean;
            if (valMatch[1]) value = parseFloat(valMatch[1]);
            else if (valMatch[2]) value = valMatch[2] === "TRUE";
            else if (valMatch[3]) value = valMatch[3];
            else if (valMatch[4]) value = valMatch[4];
            else if (valMatch[5]) value = parseInt(valMatch[5]);
            else if (valMatch[6]) value = parseFloat(valMatch[6]); // ThermalTransmittanceMeasure
            else if (valMatch[7]) value = parseFloat(valMatch[7]); // PositiveLengthMeasure
            else if (valMatch[8]) value = parseFloat(valMatch[8]); // AreaMeasure
            else continue;

            item.properties[propName] = value;
            psetProperties[propName] = value;
          }
        }

        // Store properties keyed by property set name
        if (psetName && Object.keys(psetProperties).length > 0) {
          item.propertySetData[psetName] = psetProperties;
        }

        // Check for thickness in wall properties
        const thickness = item.properties["Width"] ?? item.properties["Thickness"] ?? item.properties["NominalThickness"];
        if (typeof thickness === "number") item.quantities.thickness = thickness;

        // Check for IsExternal
        if (item.properties["IsExternal"] !== undefined) {
          item.properties._isExternal = item.properties["IsExternal"];
        }

        // Extract thermal transmittance for walls/windows/doors
        const thermalU = item.properties["ThermalTransmittance"] as number | undefined;
        if (thermalU !== undefined && thermalU > 0) {
          item.properties._thermalTransmittance = thermalU;
        }

        // Extract fire rating
        const fireRating = item.properties["FireRating"] as string | undefined;
        if (fireRating) {
          item.properties._fireRating = fireRating;
        }

        // Extract acoustic rating
        const acousticRating = item.properties["AcousticRating"] as string | number | undefined;
        if (acousticRating !== undefined) {
          item.properties._acousticRating = acousticRating;
        }

        // Extract handicap accessible flag (doors)
        const handicapAccessible = item.properties["HandicapAccessible"] as boolean | undefined;
        if (handicapAccessible !== undefined) {
          item.properties._handicapAccessible = handicapAccessible;
        }

        // Extract solar heat gain coefficient (windows)
        const solarGain = item.properties["SolarHeatGainCoefficient"] as number | undefined
          ?? item.properties["GValue"] as number | undefined;
        if (solarGain !== undefined && solarGain > 0) {
          item.properties._solarFactor = solarGain;
        }
      }
    }

    // Find material associations
    for (const [, relVal] of entities) {
      if (!relVal.startsWith("IFCRELASSOCIATESMATERIAL(")) continue;
      if (!new RegExp(`${id}[,)\\]]`).test(relVal)) continue;

      const matRef = relVal.match(/(#\d+)\)$/);
      if (!matRef) continue;
      const matVal = entities.get(matRef[1]);
      if (!matVal) continue;

      if (matVal.startsWith("IFCMATERIAL(")) {
        const mName = matVal.match(/'([^']*)'/);
        if (mName) item.materials.push(mName[1]);
      }
      if (matVal.startsWith("IFCMATERIALLAYERSET(") || matVal.startsWith("IFCMATERIALLAYERSETUSAGE(")) {
        const layerRefs = matVal.match(/#\d+/g) || [];
        for (const lRef of layerRefs) {
          const layerVal = entities.get(lRef);
          if (layerVal?.startsWith("IFCMATERIALLAYER(")) {
            const innerRef = layerVal.match(/#\d+/);
            if (innerRef) {
              const innerMat = entities.get(innerRef[0]);
              if (innerMat?.startsWith("IFCMATERIAL(")) {
                const mName = innerMat.match(/'([^']*)'/);
                if (mName) item.materials.push(mName[1]);
              }
            }
          }
        }
      }
    }

    // Find classification references (keynotes)
    for (const [, relVal] of entities) {
      if (!relVal.startsWith("IFCRELASSOCIATESCLASSIFICATION(")) continue;
      if (!new RegExp(`${id}[,)\\]]`).test(relVal)) continue;

      const classRef = relVal.match(/(#\d+)\)$/);
      if (!classRef) continue;
      const classVal = entities.get(classRef[1]);
      if (classVal?.startsWith("IFCCLASSIFICATIONREFERENCE(")) {
        const parts = classVal.match(/'([^']*)'/g);
        item.classification = parts?.[1]?.replace(/'/g, "") ?? parts?.[0]?.replace(/'/g, "");
      }
    }

    // Find storey containment via IFCRELCONTAINEDINSPATIALSTRUCTURE
    // Format: IFCRELCONTAINEDINSPATIALSTRUCTURE('guid',#owner,$,$,(#el1,#el2,...),#storey)
    for (const [, relVal] of entities) {
      if (!relVal.startsWith("IFCRELCONTAINEDINSPATIALSTRUCTURE(")) continue;
      // Use word-boundary-safe check: id must be followed by , or ) not another digit
      if (!new RegExp(`${id}[,)\\]]`).test(relVal)) continue;

      // Last #ref before closing ) is the spatial structure element (storey)
      const storeyRef = relVal.match(/(#\d+)\)$/);
      if (!storeyRef) continue;
      const storeyVal = entities.get(storeyRef[1]);
      if (storeyVal?.startsWith("IFCBUILDINGSTOREY(")) {
        // IFCBUILDINGSTOREY('GlobalId', #OwnerHistory, 'Name', 'Description', ...)
        // parts[0] = GlobalId, parts[1] = Name
        const parts = storeyVal.match(/'([^']*)'/g);
        const rawStorey = parts?.[1]?.replace(/'/g, "") || parts?.[0]?.replace(/'/g, "");
        // Decode IFC encoded text (\X\HH for non-ASCII, e.g. \X\E3 = ã)
        item.storey = rawStorey?.replace(/\\X\\([0-9A-Fa-f]{2})/g,
          (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      }
    }

    results.push(item);
  }

  return results;
}

// ============================================================
// Optimization Analysis
// ============================================================

export interface OptimizationFinding {
  type: "standardization" | "redundancy" | "sizing" | "material" | "coordination" | "cost";
  severity: "info" | "suggestion" | "warning";
  title: string;
  description: string;
  /** Affected IFC elements */
  affectedElements: string[];
  /** Potential savings estimate */
  potentialSavings?: string;
}

/**
 * Analyze IFC quantities for optimization opportunities.
 */
export function findOptimizations(
  quantities: IfcQuantityData[],
  specialty: IfcSpecialty,
): OptimizationFinding[] {
  const findings: OptimizationFinding[] = [];

  // ── Material Standardization ────────────────────────────────
  const materialGroups = new Map<string, IfcQuantityData[]>();
  for (const q of quantities) {
    for (const mat of q.materials) {
      const group = materialGroups.get(mat) ?? [];
      group.push(q);
      materialGroups.set(mat, group);
    }
  }

  // Detect too many material variations
  if (specialty === "architecture") {
    const wallThicknesses = new Set<number>();
    for (const q of quantities.filter(q => q.entityType.includes("WALL"))) {
      if (q.quantities.thickness) wallThicknesses.add(Math.round(q.quantities.thickness * 100));
    }
    if (wallThicknesses.size > 4) {
      findings.push({
        type: "standardization",
        severity: "suggestion",
        title: `${wallThicknesses.size} espessuras de parede diferentes`,
        description: `Foram detetadas ${wallThicknesses.size} espessuras de parede distintas (${Array.from(wallThicknesses).map(t => `${t}mm`).join(", ")}). Considere normalizar para reduzir variações e simplificar compras.`,
        affectedElements: quantities.filter(q => q.entityType.includes("WALL")).map(q => q.globalId ?? q.name),
        potentialSavings: "3-5% em materiais de alvenaria",
      });
    }

    // Window size variations
    const windowSizes = new Map<string, number>();
    for (const q of quantities.filter(q => q.entityType.includes("WINDOW"))) {
      if (q.quantities.width && q.quantities.height) {
        const key = `${(q.quantities.width * 100).toFixed(0)}×${(q.quantities.height * 100).toFixed(0)}`;
        windowSizes.set(key, (windowSizes.get(key) ?? 0) + 1);
      }
    }
    const uniqueWindowSizes = windowSizes.size;
    const totalWindows = quantities.filter(q => q.entityType.includes("WINDOW")).length;
    if (uniqueWindowSizes > 6 && totalWindows > 8) {
      findings.push({
        type: "standardization",
        severity: "suggestion",
        title: `${uniqueWindowSizes} tamanhos de janela diferentes (${totalWindows} janelas)`,
        description: `Muitas variações de dimensão de caixilharia encarecem o projeto. No CYPE/Gerador de Preços, cada variação gera um preço composto diferente. Considere normalizar para 3-5 tamanhos standard.`,
        affectedElements: quantities.filter(q => q.entityType.includes("WINDOW")).map(q => q.globalId ?? q.name),
        potentialSavings: "5-15% em caixilharias (produção em série vs. medida)",
      });
    }

    // Doors - check if all interior doors have same dimensions
    const doorSizes = new Map<string, number>();
    for (const q of quantities.filter(q => q.entityType.includes("DOOR"))) {
      if (q.quantities.width && q.quantities.height) {
        const key = `${(q.quantities.width * 100).toFixed(0)}×${(q.quantities.height * 100).toFixed(0)}`;
        doorSizes.set(key, (doorSizes.get(key) ?? 0) + 1);
      }
    }
    if (doorSizes.size > 4) {
      findings.push({
        type: "standardization",
        severity: "info",
        title: `${doorSizes.size} dimensões de porta diferentes`,
        description: `Portas com dimensões standard (80×210cm) são mais económicas que portas por medida.`,
        affectedElements: quantities.filter(q => q.entityType.includes("DOOR")).map(q => q.globalId ?? q.name),
      });
    }
  }

  // ── Structural Optimization ─────────────────────────────────
  if (specialty === "structure") {
    // Check for column section standardization
    const columnSections = new Map<string, number>();
    for (const q of quantities.filter(q => q.entityType.includes("COLUMN"))) {
      const section = q.name || "unknown";
      columnSections.set(section, (columnSections.get(section) ?? 0) + 1);
    }
    if (columnSections.size > 5) {
      findings.push({
        type: "standardization",
        severity: "suggestion",
        title: `${columnSections.size} secções de pilar diferentes`,
        description: `Muitas variações de secção de pilar aumentam custos de cofragem. Considere uniformizar secções onde possível.`,
        affectedElements: quantities.filter(q => q.entityType.includes("COLUMN")).map(q => q.globalId ?? q.name),
        potentialSavings: "5-10% em cofragem (reutilização de moldes)",
      });
    }

    // Beam spans - check for very long spans that might need pre-stress
    for (const q of quantities.filter(q => q.entityType.includes("BEAM"))) {
      if (q.quantities.length && q.quantities.length > 8) {
        findings.push({
          type: "sizing",
          severity: "warning",
          title: `Viga com vão de ${q.quantities.length.toFixed(1)}m (${q.name})`,
          description: `Vãos superiores a 8m podem beneficiar de pré-esforço ou estrutura mista (aço-betão). Verificar dimensionamento e alternativas.`,
          affectedElements: [q.globalId ?? q.name],
        });
      }
    }

    // Total concrete volume estimate
    const totalConcreteVol = quantities
      .filter(q => ["IFCBEAM", "IFCCOLUMN", "IFCSLAB", "IFCFOOTING"].some(t => q.entityType.includes(t)))
      .reduce((sum, q) => sum + (q.quantities.volume ?? 0), 0);
    if (totalConcreteVol > 0) {
      findings.push({
        type: "cost",
        severity: "info",
        title: `Volume total de betão estimado: ${totalConcreteVol.toFixed(1)} m³`,
        description: `Com base nos elementos estruturais do modelo. Verificar no CYPE por classe de betão e taxa de armadura.`,
        affectedElements: [],
      });
    }
  }

  // ── MEP Coordination ────────────────────────────────────────
  if (["plumbing", "electrical", "hvac"].includes(specialty)) {
    // Count total MEP elements
    const totalElements = quantities.length;
    findings.push({
      type: "coordination",
      severity: "info",
      title: `${totalElements} elementos MEP detetados na especialidade ${specialty}`,
      description: `Elementos extraídos do modelo para verificação de coordenação e informação do mapa de quantidades.`,
      affectedElements: [],
    });

    // Check for pipe/duct sizing consistency
    if (specialty === "plumbing") {
      const pipeDiameters = new Map<string, number>();
      for (const q of quantities.filter(q => q.entityType.includes("PIPE"))) {
        const dia = q.properties["NominalDiameter"] ?? q.properties["Diameter"];
        if (typeof dia === "number") {
          const key = `Ø${Math.round(dia * 1000)}mm`;
          pipeDiameters.set(key, (pipeDiameters.get(key) ?? 0) + 1);
        }
      }
      if (pipeDiameters.size > 0) {
        findings.push({
          type: "coordination",
          severity: "info",
          title: `Tubagem: ${Array.from(pipeDiameters.entries()).map(([k, v]) => `${k}(${v})`).join(", ")}`,
          description: `Diâmetros de tubagem detetados no modelo. Verificar dimensionamento conforme RGSPPDADAR.`,
          affectedElements: [],
        });
      }
    }

    // Check sanitary terminal count
    const sanitaryCount = quantities.filter(q =>
      q.entityType.includes("SANITARYTERMINAL") || q.entityType.includes("FLOWTERMINAL")
    ).length;
    if (sanitaryCount > 0) {
      findings.push({
        type: "coordination",
        severity: "info",
        title: `${sanitaryCount} terminais sanitários/hidráulicos`,
        description: `Loiças e terminais detetados no modelo para mapear a artigos do mapa de quantidades.`,
        affectedElements: [],
      });
    }
  }

  return findings;
}

// ============================================================
// WBS Article Generation from IFC
// ============================================================

/**
 * Generate WBS articles from IFC extracted quantities.
 * Groups elements by type and aggregates quantities.
 */
export function ifcToWbsArticles(
  quantities: IfcQuantityData[],
  specialty: IfcSpecialty,
): WbsChapter[] {
  const chapters: WbsChapter[] = [];

  // Group by entity type
  const groups = new Map<string, IfcQuantityData[]>();
  for (const q of quantities) {
    const group = groups.get(q.entityType) ?? [];
    group.push(q);
    groups.set(q.entityType, group);
  }

  if (specialty === "architecture") {
    // ── Walls ────────────────────────
    const walls = groups.get("IFCWALL") ?? groups.get("IFCWALLSTANDARDCASE") ?? [];
    if (walls.length > 0) {
      const extWalls = walls.filter(w => w.properties["IsExternal"] === true || w.properties._isExternal === true);
      const intWalls = walls.filter(w => !extWalls.includes(w));

      const articles: WbsArticle[] = [];
      if (extWalls.length > 0) {
        const totalArea = extWalls.reduce((s, w) => s + (w.quantities.area ?? 0), 0);
        articles.push({
          code: "08.01.001",
          description: `Alvenaria exterior (${extWalls.length} paredes do modelo)`,
          unit: "m2",
          quantity: Math.round(totalArea * 100) / 100 || extWalls.length * 15,
          keynote: "B20",
          elementIds: extWalls.map(w => w.globalId).filter(Boolean) as string[],
          tags: ["alvenaria", "exterior", "tijolo"],
        });
      }
      if (intWalls.length > 0) {
        const totalArea = intWalls.reduce((s, w) => s + (w.quantities.area ?? 0), 0);
        articles.push({
          code: "08.02.001",
          description: `Alvenaria interior / divisórias (${intWalls.length} paredes do modelo)`,
          unit: "m2",
          quantity: Math.round(totalArea * 100) / 100 || intWalls.length * 10,
          keynote: "C10",
          elementIds: intWalls.map(w => w.globalId).filter(Boolean) as string[],
          tags: ["alvenaria", "interior", "divisória"],
        });
      }

      if (articles.length > 0) {
        chapters.push({
          code: "08", name: "Alvenarias",
          subChapters: [{ code: "08.01", name: "Paredes (do modelo IFC)", articles }],
        });
      }
    }

    // ── Windows ──────────────────────
    const windows = groups.get("IFCWINDOW") ?? [];
    if (windows.length > 0) {
      // Group by size
      const sizeGroups = new Map<string, { items: IfcQuantityData[]; totalArea: number }>();
      for (const w of windows) {
        const wid = w.quantities.width ?? 1.2;
        const hgt = w.quantities.height ?? 1.4;
        const key = `${(wid * 100).toFixed(0)}×${(hgt * 100).toFixed(0)}`;
        const group = sizeGroups.get(key) ?? { items: [], totalArea: 0 };
        group.items.push(w);
        group.totalArea += w.quantities.area ?? (wid * hgt);
        sizeGroups.set(key, group);
      }

      const windowArticles: WbsArticle[] = [];
      let artIdx = 1;
      for (const [size, group] of sizeGroups) {
        windowArticles.push({
          code: `15.01.${String(artIdx).padStart(3, "0")}`,
          description: `Caixilharia alumínio RPT + vidro duplo (${size}cm) × ${group.items.length} un.`,
          unit: "m2",
          quantity: Math.round(group.totalArea * 100) / 100,
          keynote: "B20",
          elementIds: group.items.map(w => w.globalId).filter(Boolean) as string[],
          tags: ["caixilharia", "alumínio", "janela", size],
        });
        artIdx++;
      }

      chapters.push({
        code: "15", name: "Caixilharias e portas exteriores",
        subChapters: [{ code: "15.01", name: "Janelas (do modelo IFC)", articles: windowArticles }],
      });
    }

    // ── Doors ────────────────────────
    const doors = groups.get("IFCDOOR") ?? [];
    if (doors.length > 0) {
      chapters.push({
        code: "17", name: "Carpintarias",
        subChapters: [{
          code: "17.01", name: "Portas (do modelo IFC)",
          articles: [{
            code: "17.01.001",
            description: `Portas interiores com aro e ferragens (${doors.length} do modelo)`,
            unit: "Ud",
            quantity: doors.length,
            keynote: "C20",
            elementIds: doors.map(d => d.globalId).filter(Boolean) as string[],
            tags: ["porta", "interior", "madeira"],
          }],
        }],
      });
    }

    // ── Slabs ────────────────────────
    const slabs = groups.get("IFCSLAB") ?? [];
    if (slabs.length > 0) {
      const totalArea = slabs.reduce((s, sl) => s + (sl.quantities.area ?? 0), 0);
      if (totalArea > 0) {
        chapters.push({
          code: "13", name: "Pavimentos",
          subChapters: [{
            code: "13.01", name: "Pavimentos (do modelo IFC)",
            articles: [{
              code: "13.01.001",
              description: `Betonilha de regularização + pavimento (${slabs.length} lajes, ${totalArea.toFixed(0)} m²)`,
              unit: "m2",
              quantity: Math.round(totalArea),
              keynote: "C30",
              tags: ["pavimento", "laje", "betonilha"],
            }],
          }],
        });
      }
    }

    // ── Roof ─────────────────────────
    const roofs = groups.get("IFCROOF") ?? [];
    if (roofs.length > 0) {
      const totalArea = roofs.reduce((s, r) => s + (r.quantities.area ?? 0), 0);
      chapters.push({
        code: "09", name: "Coberturas",
        subChapters: [{
          code: "09.01", name: "Cobertura (do modelo IFC)",
          articles: [{
            code: "09.01.001",
            description: `Cobertura (${roofs.length} elementos, ${totalArea > 0 ? totalArea.toFixed(0) + " m²" : "medir no modelo"})`,
            unit: "m2",
            quantity: Math.round(totalArea) || 0,
            keynote: "B30",
            elementIds: roofs.map(r => r.globalId).filter(Boolean) as string[],
            tags: ["cobertura", "telhado"],
          }],
        }],
      });
    }

    // ── Stairs ────────────────────────
    const stairs = [...(groups.get("IFCSTAIR") ?? []), ...(groups.get("IFCSTAIRFLIGHT") ?? [])];
    if (stairs.length > 0) {
      chapters.push({
        code: "06", name: "Estruturas de betão armado",
        subChapters: [{
          code: "06.03", name: "Escadas (do modelo IFC)",
          articles: [{
            code: "06.03.001",
            description: `Escada de betão armado (${stairs.length} lanços do modelo)`,
            unit: "m2",
            quantity: stairs.reduce((s, st) => s + (st.quantities.area ?? 6), 0),
            keynote: "B10",
            tags: ["escada", "betão"],
          }],
        }],
      });
    }
  }

  if (specialty === "structure") {
    // Portuguese CYPE measures structural elements in linear meters (m)
    // Columns: m per storey height; Beams: m per span; Slabs: m per bay
    const ASSUMED_STOREY_HEIGHT = 3.0; // m - typical Portuguese residential
    const ASSUMED_BEAM_SPAN = 5.0;     // m - typical beam span

    // ── Columns ──────────────────────
    const columns = groups.get("IFCCOLUMN") ?? [];
    if (columns.length > 0) {
      // Estimate total linear length: count × average storey height
      // If we have volume, back-calculate height from cross-section
      const estimatedLength = columns.reduce((s, c) => {
        const w = c.quantities.width ?? 0.25;
        const d = c.quantities.depth ?? 0.25; // use 'depth' field for 2nd dim
        const v = c.quantities.volume;
        const h = (v && w > 0 && d > 0) ? v / (w * d) : ASSUMED_STOREY_HEIGHT;
        return s + Math.min(h, 6.0); // cap at 6m (max reasonable single storey)
      }, 0);
      const totalLength = Math.round(estimatedLength * 10) / 10 || columns.length * ASSUMED_STOREY_HEIGHT;
      chapters.push({
        code: "06", name: "Estruturas de betão armado",
        subChapters: [{
          code: "06.01", name: "Pilares (do modelo IFC)",
          articles: [{
            code: "06.01.001",
            description: `Pilar de secção rectangular de betão armado C25/30, de vários tamanhos (${columns.length} pilares do modelo BIM)`,
            unit: "m",
            quantity: totalLength,
            keynote: "B10",
            elementIds: columns.map(c => c.globalId).filter(Boolean) as string[],
            tags: ["pilar", "betão", "estrutura", "C25/30"],
          }],
        }],
      });
    }

    // ── Beams ────────────────────────
    const beams = groups.get("IFCBEAM") ?? [];
    if (beams.length > 0) {
      // Estimate total linear length from volume and cross-section
      const estimatedLength = beams.reduce((s, b) => {
        const w = b.quantities.width ?? 0.25;
        const d = b.quantities.depth ?? 0.50;
        const v = b.quantities.volume;
        const l = (v && w > 0 && d > 0) ? v / (w * d) : ASSUMED_BEAM_SPAN;
        return s + Math.min(l, 12.0); // cap at 12m
      }, 0);
      const totalLength = Math.round(estimatedLength * 10) / 10 || beams.length * ASSUMED_BEAM_SPAN;
      chapters.push({
        code: "06", name: "Estruturas de betão armado",
        subChapters: [{
          code: "06.02", name: "Vigas (do modelo IFC)",
          articles: [{
            code: "06.02.001",
            description: `Viga de betão armado C25/30, de vários tamanhos (${beams.length} vigas do modelo BIM)`,
            unit: "m",
            quantity: totalLength,
            keynote: "B10",
            elementIds: beams.map(b => b.globalId).filter(Boolean) as string[],
            tags: ["viga", "betão", "estrutura", "C25/30"],
          }],
        }],
      });
    }

    // ── Footings ─────────────────────
    const footings = groups.get("IFCFOOTING") ?? [];
    if (footings.length > 0) {
      const totalVol = footings.reduce((s, f) => s + (f.quantities.volume ?? 0), 0);
      chapters.push({
        code: "04", name: "Fundações",
        subChapters: [{
          code: "04.01", name: "Sapatas (do modelo IFC)",
          articles: [{
            code: "04.01.001",
            description: `Sapata de fundação de betão armado C25/30 (${footings.length} do modelo)`,
            unit: "m3",
            quantity: Math.round(totalVol * 100) / 100 || footings.length * 1.2,
            keynote: "A20",
            elementIds: footings.map(f => f.globalId).filter(Boolean) as string[],
            tags: ["sapata", "fundação", "betão"],
          }],
        }],
      });
    }

    // ── Slabs (structural) ───────────
    const slabs = groups.get("IFCSLAB") ?? [];
    if (slabs.length > 0) {
      const totalArea = slabs.reduce((s, sl) => s + (sl.quantities.area ?? 0), 0);
      const totalVol = slabs.reduce((s, sl) => s + (sl.quantities.volume ?? 0), 0);
      // Use m2 for slab area measurement (matches Portuguese quantity surveying practice)
      const qty = totalArea > 0 ? Math.round(totalArea) : slabs.length * 80;
      chapters.push({
        code: "06", name: "Estruturas de betão armado",
        subChapters: [{
          code: "06.04", name: "Lajes (do modelo IFC)",
          articles: [{
            code: "06.04.001",
            description: `Laje aligeirada de betão armado C25/30, horizontal (${slabs.length} lajes do modelo BIM, ${qty} m²)`,
            unit: "m2",
            quantity: qty,
            keynote: "B10",
            elementIds: slabs.map(s => s.globalId).filter(Boolean) as string[],
            tags: ["laje", "betão", "estrutura", "C25/30"],
          }],
        }],
      });
    }
  }

  if (specialty === "plumbing") {
    const pipes = [...(groups.get("IFCPIPESEGMENT") ?? []), ...(groups.get("IFCFLOWSEGMENT") ?? [])];
    const fittings = groups.get("IFCPIPEFITTING") ?? [];
    const terminals = [...(groups.get("IFCSANITARYTERMINAL") ?? []), ...(groups.get("IFCFLOWTERMINAL") ?? [])];

    const articles: WbsArticle[] = [];
    if (pipes.length > 0) {
      const totalLength = pipes.reduce((s, p) => s + (p.quantities.length ?? 0), 0);
      articles.push({
        code: "20.01.001",
        description: `Rede de tubagem (${pipes.length} troços, ${totalLength > 0 ? totalLength.toFixed(0) + "m" : "medir no modelo"})`,
        unit: "Ud",
        quantity: 1,
        keynote: "D10",
        tags: ["tubagem", "água", "rede"],
      });
    }
    if (terminals.length > 0) {
      // Group terminals by name
      const terminalGroups = new Map<string, number>();
      for (const t of terminals) {
        const key = t.name.toLowerCase();
        terminalGroups.set(key, (terminalGroups.get(key) ?? 0) + 1);
      }
      let artIdx = 2;
      for (const [name, count] of terminalGroups) {
        articles.push({
          code: `20.01.${String(artIdx).padStart(3, "0")}`,
          description: `${name} (×${count})`,
          unit: "Ud",
          quantity: count,
          keynote: "D10",
          tags: ["loiça", "sanitário", name],
        });
        artIdx++;
      }
    }

    if (articles.length > 0) {
      chapters.push({
        code: "20", name: "Instalações de abastecimento de água",
        subChapters: [{ code: "20.01", name: "Rede e equipamentos (do modelo IFC)", articles }],
      });
    }
  }

  if (specialty === "electrical") {
    const cables = [...(groups.get("IFCCABLESEGMENT") ?? []), ...(groups.get("IFCCABLECARRIERSEGMENT") ?? [])];
    const boards = groups.get("IFCELECTRICDISTRIBUTIONBOARD") ?? [];
    const lights = groups.get("IFCLIGHTFIXTURE") ?? [];
    const outlets = groups.get("IFCOUTLET") ?? [];
    const switches = groups.get("IFCSWITCHINGDEVICE") ?? [];

    const articles: WbsArticle[] = [];
    if (boards.length > 0) {
      articles.push({
        code: "23.01.001",
        description: `Quadros elétricos (${boards.length} do modelo)`,
        unit: "Ud",
        quantity: boards.length,
        keynote: "D20",
        tags: ["quadro", "elétrico"],
      });
    }
    if (lights.length > 0) {
      articles.push({
        code: "23.01.002",
        description: `Luminárias (${lights.length} do modelo)`,
        unit: "Ud",
        quantity: lights.length,
        keynote: "D20",
        tags: ["luminária", "iluminação"],
      });
    }
    if (outlets.length > 0) {
      articles.push({
        code: "23.01.003",
        description: `Tomadas elétricas (${outlets.length} do modelo)`,
        unit: "Ud",
        quantity: outlets.length,
        keynote: "D20",
        tags: ["tomada", "elétrica"],
      });
    }
    if (switches.length > 0) {
      articles.push({
        code: "23.01.004",
        description: `Interruptores (${switches.length} do modelo)`,
        unit: "Ud",
        quantity: switches.length,
        keynote: "D20",
        tags: ["interruptor"],
      });
    }

    if (articles.length > 0) {
      chapters.push({
        code: "23", name: "Instalações elétricas",
        subChapters: [{ code: "23.01", name: "Instalação elétrica (do modelo IFC)", articles }],
      });
    }
  }

  if (specialty === "hvac") {
    const ducts = [...(groups.get("IFCDUCTSEGMENT") ?? []), ...(groups.get("IFCDUCTFITTING") ?? [])];
    const terminals = groups.get("IFCAIRTERMINAL") ?? [];
    const equipment = groups.get("IFCUNITARYEQUIPMENT") ?? [];

    const articles: WbsArticle[] = [];
    if (ducts.length > 0) {
      articles.push({
        code: "25.01.001",
        description: `Condutas AVAC (${ducts.length} troços do modelo)`,
        unit: "Ud",
        quantity: 1,
        keynote: "25",
        tags: ["conduta", "AVAC", "ventilação"],
      });
    }
    if (terminals.length > 0) {
      articles.push({
        code: "25.01.002",
        description: `Difusores/grelhas (${terminals.length} do modelo)`,
        unit: "Ud",
        quantity: terminals.length,
        keynote: "25",
        tags: ["difusor", "grelha", "AVAC"],
      });
    }
    if (equipment.length > 0) {
      articles.push({
        code: "25.01.003",
        description: `Equipamentos AVAC (${equipment.length} do modelo)`,
        unit: "Ud",
        quantity: equipment.length,
        keynote: "25",
        tags: ["equipamento", "AVAC", "unidade"],
      });
    }

    if (articles.length > 0) {
      chapters.push({
        code: "25", name: "AVAC e ventilação",
        subChapters: [{ code: "25.01", name: "AVAC (do modelo IFC)", articles }],
      });
    }
  }

  return chapters;
}

// ============================================================
// Full Analysis Pipeline
// ============================================================

export interface SpecialtyAnalysisResult {
  specialty: IfcSpecialty;
  /** Raw quantity data extracted */
  quantities: IfcQuantityData[];
  /** Generated WBS chapters from the model */
  chapters: WbsChapter[];
  /** Optimization findings */
  optimizations: OptimizationFinding[];
  /** Summary statistics */
  summary: {
    totalElements: number;
    elementsByType: Record<string, number>;
    totalArea?: number;
    totalVolume?: number;
    totalLength?: number;
    storeys: string[];
    materialsUsed: string[];
  };
}

/**
 * Full analysis pipeline: parse IFC content for a specific specialty,
 * extract quantities, generate WBS articles, and find optimizations.
 */
export function analyzeIfcSpecialty(content: string): SpecialtyAnalysisResult {
  const specialty = detectSpecialty(content);
  const quantities = extractDetailedQuantities(content);
  const chapters = ifcToWbsArticles(quantities, specialty);
  const optimizations = findOptimizations(quantities, specialty);

  // Summary statistics
  const elementsByType: Record<string, number> = {};
  const storeySet = new Set<string>();
  const materialSet = new Set<string>();
  let totalArea = 0;
  let totalVolume = 0;
  let totalLength = 0;

  for (const q of quantities) {
    elementsByType[q.entityType] = (elementsByType[q.entityType] ?? 0) + 1;
    if (q.storey) storeySet.add(q.storey);
    for (const m of q.materials) materialSet.add(m);
    totalArea += q.quantities.area ?? 0;
    totalVolume += q.quantities.volume ?? 0;
    totalLength += q.quantities.length ?? 0;
  }

  return {
    specialty,
    quantities,
    chapters,
    optimizations,
    summary: {
      totalElements: quantities.length,
      elementsByType,
      totalArea: totalArea > 0 ? Math.round(totalArea * 100) / 100 : undefined,
      totalVolume: totalVolume > 0 ? Math.round(totalVolume * 100) / 100 : undefined,
      totalLength: totalLength > 0 ? Math.round(totalLength * 100) / 100 : undefined,
      storeys: Array.from(storeySet).sort(),
      materialsUsed: Array.from(materialSet).sort(),
    },
  };
}

// ============================================================
// IFC → WBS Project Conversion
// ============================================================

import type { WbsProject } from "./wbs-types";

/**
 * Convert multiple IFC specialty analyses into a complete WbsProject.
 * Merges chapters from all specialties and deduplicates where necessary.
 *
 * This enables "IFC-only" workflows where users upload only IFC files
 * without a separate BOQ, and the system auto-generates the WBS structure.
 *
 * @param analyses - Array of specialty analysis results (Architecture, Structure, MEP, etc.)
 * @param projectName - Optional project name (defaults to "Projeto do Modelo IFC")
 * @returns Complete WbsProject ready for CYPE matching and scheduling
 */
export function createWbsFromIfc(
  analyses: SpecialtyAnalysisResult[],
  projectName?: string
): WbsProject {
  if (analyses.length === 0) {
    throw new Error("Nenhuma análise IFC fornecida para conversão em WBS");
  }

  // Merge all chapters from all specialties
  const chapterMap = new Map<string, WbsChapter>();

  for (const analysis of analyses) {
    for (const chapter of analysis.chapters) {
      const existing = chapterMap.get(chapter.code);

      if (existing) {
        // Chapter already exists, merge subchapters
        const subChapterMap = new Map<string, WbsSubChapter>();

        // Add existing subchapters
        for (const sub of existing.subChapters) {
          subChapterMap.set(sub.code, sub);
        }

        // Merge new subchapters
        for (const sub of chapter.subChapters) {
          const existingSub = subChapterMap.get(sub.code);

          if (existingSub) {
            // Subchapter exists, merge articles (avoid duplicates by code)
            const articleCodes = new Set(existingSub.articles.map(a => a.code));
            const newArticles = sub.articles.filter(a => !articleCodes.has(a.code));
            existingSub.articles.push(...newArticles);
          } else {
            // New subchapter
            subChapterMap.set(sub.code, sub);
          }
        }

        existing.subChapters = Array.from(subChapterMap.values()).sort((a, b) =>
          a.code.localeCompare(b.code)
        );
      } else {
        // New chapter
        chapterMap.set(chapter.code, chapter);
      }
    }
  }

  // Calculate project metadata from IFC data
  const allQuantities = analyses.flatMap(a => a.quantities);
  const storeys = Array.from(new Set(allQuantities.map(q => q.storey).filter(Boolean)));
  const numberOfFloors = storeys.length || undefined;

  // Estimate gross floor area from slabs
  const slabs = allQuantities.filter(q => q.entityType.includes("SLAB"));
  const totalSlabArea = slabs.reduce((sum, s) => sum + (s.quantities.area ?? 0), 0);
  const grossFloorArea = totalSlabArea > 0 ? Math.round(totalSlabArea) : undefined;

  // Estimate building height from storey elevations (if available in properties)
  let buildingHeight: number | undefined = undefined;
  const elevations = allQuantities
    .map(q => q.properties["Elevation"] as number)
    .filter(e => typeof e === "number" && e > 0);
  if (elevations.length > 0) {
    buildingHeight = Math.round(Math.max(...elevations) * 10) / 10;
  }

  // Detect building type from specialty mix
  let buildingType: "residential" | "commercial" | "mixed" | "industrial" | undefined = undefined;
  const hasResidentialIndicators = allQuantities.some(q =>
    q.entityType.includes("DOOR") ||
    q.entityType.includes("WINDOW") ||
    (q.properties["OccupancyType"] as string)?.toLowerCase().includes("residential")
  );
  const hasCommercialIndicators = allQuantities.some(q =>
    (q.properties["OccupancyType"] as string)?.toLowerCase().includes("commercial") ||
    (q.properties["OccupancyType"] as string)?.toLowerCase().includes("office")
  );
  if (hasResidentialIndicators && hasCommercialIndicators) {
    buildingType = "mixed";
  } else if (hasResidentialIndicators) {
    buildingType = "residential";
  } else if (hasCommercialIndicators) {
    buildingType = "commercial";
  }

  // Sort chapters by code
  const chapters = Array.from(chapterMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  // Generate project name from specialty mix
  const specialties = analyses.map(a => a.specialty);
  const specialtyNames: Record<IfcSpecialty, string> = {
    architecture: "ARQ",
    structure: "EST",
    plumbing: "ÁGUAS",
    electrical: "ELET",
    hvac: "AVAC",
    fire_safety: "SCIE",
    telecom: "ITED",
    gas: "GÁS",
    unknown: "?"
  };
  const projectNameFromSpecialties = projectName ||
    `Projeto IFC (${specialties.map(s => specialtyNames[s]).join(" + ")})`;

  return {
    id: `ifc-${Date.now()}`,
    name: projectNameFromSpecialties,
    classification: "ProNIC",
    startDate: new Date().toISOString().split("T")[0],
    chapters,
    grossFloorArea,
    numberOfFloors,
    buildingHeight,
    buildingType,
  };
}

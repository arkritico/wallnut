/**
 * Keynote Resolver — IFC ↔ BOQ Linking
 *
 * Bridges IFC model elements to BOQ line items and CYPE prices.
 * Supports two workflows:
 *
 * 1. **No BOQ present**: Generates a WbsProject from IFC analysis results
 *    by mapping IFC entity types + classification references to ProNIC chapters.
 *
 * 2. **BOQ present**: Matches IFC elements to existing BOQ articles via shared
 *    keynotes, classification codes, or type+description heuristics.
 *
 * Confidence tiers:
 * - Direct classification reference match: 95%
 * - Uniformat/ProNIC keynote code match: 85%
 * - Entity type mapping: 60-80%
 * - Name heuristic fallback: 40-60%
 */

import type { IfcQuantityData, SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
import type { WbsProject, WbsChapter, WbsSubChapter, WbsArticle } from "./wbs-types";
import { PRONIC_CHAPTERS } from "./wbs-types";

// ============================================================
// Types
// ============================================================

export interface KeynoteResolution {
  /** IFC GlobalId or element name */
  elementId: string;
  /** IFC entity type (e.g. IFCCOLUMN) */
  entityType: string;
  /** Resolved ProNIC chapter code */
  chapterCode: string;
  /** Generated/matched article code */
  articleCode: string;
  /** Confidence 0-100 */
  confidence: number;
  /** How the resolution was determined */
  method: "classification" | "keynote_code" | "entity_type" | "name_heuristic" | "boq_match";
  /** IFC classification reference if present */
  classificationRef?: string;
  /** Storey where element is located */
  storey?: string;
}

export interface GeneratedBoq {
  /** The generated WbsProject */
  project: WbsProject;
  /** Per-element resolution details */
  resolutions: KeynoteResolution[];
  /** Statistics */
  stats: {
    totalElements: number;
    resolved: number;
    unresolved: number;
    coveragePercent: number;
    byMethod: Record<string, number>;
  };
}

export interface BoqMatchResult {
  /** Per-element linking to BOQ articles */
  links: ElementBoqLink[];
  /** Elements with no BOQ match */
  unlinked: string[];
  /** BOQ articles with no IFC elements */
  orphanArticles: string[];
  stats: {
    totalElements: number;
    linked: number;
    unlinked: number;
    orphanArticles: number;
    coveragePercent: number;
  };
}

export interface ElementBoqLink {
  /** IFC GlobalId or element name */
  elementId: string;
  entityType: string;
  /** Matched BOQ article code */
  articleCode: string;
  articleDescription: string;
  /** Confidence 0-100 */
  confidence: number;
  method: KeynoteResolution["method"];
  /** Keynote/classification code used for matching */
  matchKey?: string;
  storey?: string;
}

export interface MappingTableRow {
  elementId: string;
  entityType: string;
  elementName: string;
  storey: string;
  classification: string;
  resolvedChapter: string;
  articleCode: string;
  articleDescription: string;
  confidence: number;
  method: string;
  /** User can override this */
  overrideArticleCode?: string;
}

// ============================================================
// Uniformat → ProNIC Chapter Mapping
// ============================================================

/**
 * Maps Uniformat II / OmniClass / custom keynote prefixes to ProNIC chapters.
 * When an IFC element has a classification reference, we look up its prefix here
 * before falling back to entity type mapping.
 */
const CLASSIFICATION_TO_PRONIC: Record<string, { chapter: string; subChapter: string; description: string; confidence: number }> = {
  // Uniformat II Level 2
  "A10": { chapter: "03", subChapter: "03.01", description: "Movimento de terras", confidence: 85 },
  "A20": { chapter: "04", subChapter: "04.01", description: "Fundações", confidence: 85 },
  "B10": { chapter: "06", subChapter: "06.01", description: "Estruturas", confidence: 85 },
  "B1010": { chapter: "06", subChapter: "06.03", description: "Lajes", confidence: 90 },
  "B1020": { chapter: "06", subChapter: "06.01", description: "Pilares", confidence: 90 },
  "B1030": { chapter: "06", subChapter: "06.02", description: "Vigas", confidence: 90 },
  "B20": { chapter: "08", subChapter: "08.01", description: "Paredes exteriores", confidence: 85 },
  "B2010": { chapter: "08", subChapter: "08.01", description: "Alvenaria exterior", confidence: 90 },
  "B2020": { chapter: "15", subChapter: "15.01", description: "Caixilharia exterior", confidence: 90 },
  "B2050": { chapter: "17", subChapter: "17.01", description: "Portas exteriores", confidence: 85 },
  "B30": { chapter: "09", subChapter: "09.01", description: "Coberturas", confidence: 85 },
  "C10": { chapter: "08", subChapter: "08.02", description: "Divisórias interiores", confidence: 85 },
  "C1010": { chapter: "08", subChapter: "08.02", description: "Paredes interiores", confidence: 90 },
  "C1020": { chapter: "17", subChapter: "17.01", description: "Portas interiores", confidence: 85 },
  "C20": { chapter: "06", subChapter: "06.04", description: "Escadas", confidence: 80 },
  "C30": { chapter: "13", subChapter: "13.01", description: "Pavimentos interiores", confidence: 85 },
  "D10": { chapter: "25", subChapter: "25.01", description: "Sistemas AVAC", confidence: 80 },
  "D20": { chapter: "20", subChapter: "20.01", description: "Instalações hidráulicas", confidence: 80 },
  "D2010": { chapter: "20", subChapter: "20.01", description: "Rede de abastecimento de água", confidence: 85 },
  "D2020": { chapter: "21", subChapter: "21.01", description: "Rede de esgotos", confidence: 85 },
  "D30": { chapter: "22", subChapter: "22.01", description: "Rede de gás", confidence: 80 },
  "D40": { chapter: "27", subChapter: "27.01", description: "Segurança contra incêndio", confidence: 80 },
  "D50": { chapter: "23", subChapter: "23.01", description: "Instalações elétricas", confidence: 80 },
  "D5010": { chapter: "23", subChapter: "23.01", description: "Quadros elétricos", confidence: 85 },
  "D5020": { chapter: "23", subChapter: "23.03", description: "Iluminação", confidence: 85 },
  "D60": { chapter: "24", subChapter: "24.01", description: "Telecomunicações", confidence: 80 },
  "D70": { chapter: "23", subChapter: "23.05", description: "Controlo e automação", confidence: 75 },
  "E10": { chapter: "26", subChapter: "26.01", description: "Elevadores", confidence: 85 },

  // ProNIC direct chapter codes
  "01": { chapter: "01", subChapter: "01.01", description: "Estaleiro", confidence: 90 },
  "02": { chapter: "02", subChapter: "02.01", description: "Demolições", confidence: 90 },
  "03": { chapter: "03", subChapter: "03.01", description: "Movimento de terras", confidence: 90 },
  "04": { chapter: "04", subChapter: "04.01", description: "Fundações", confidence: 90 },
  "06": { chapter: "06", subChapter: "06.01", description: "Estruturas betão armado", confidence: 90 },
  "07": { chapter: "07", subChapter: "07.01", description: "Estruturas metálicas", confidence: 90 },
  "08": { chapter: "08", subChapter: "08.01", description: "Alvenarias", confidence: 90 },
  "09": { chapter: "09", subChapter: "09.01", description: "Coberturas", confidence: 90 },
  "15": { chapter: "15", subChapter: "15.01", description: "Caixilharias", confidence: 90 },
  "17": { chapter: "17", subChapter: "17.01", description: "Carpintarias", confidence: 90 },
  "20": { chapter: "20", subChapter: "20.01", description: "Rede de água", confidence: 90 },
  "21": { chapter: "21", subChapter: "21.01", description: "Rede de esgotos", confidence: 90 },
  "23": { chapter: "23", subChapter: "23.01", description: "Instalações elétricas", confidence: 90 },
  "25": { chapter: "25", subChapter: "25.01", description: "AVAC", confidence: 90 },
  "27": { chapter: "27", subChapter: "27.01", description: "Segurança incêndio", confidence: 90 },
};

// ============================================================
// IFC Entity → ProNIC Chapter Mapping
// ============================================================

const ENTITY_CHAPTER_MAP: { pattern: string; chapter: string; subChapter: string; description: string; unit: string; confidence: number }[] = [
  // Structure (Chapter 06) — CURTAINWALL before WALL
  { pattern: "CURTAINWALL", chapter: "11", subChapter: "11.01", description: "Fachada cortina", unit: "m2", confidence: 75 },
  { pattern: "COLUMN", chapter: "06", subChapter: "06.01", description: "Pilares de betão armado", unit: "m", confidence: 80 },
  { pattern: "BEAM", chapter: "06", subChapter: "06.02", description: "Vigas de betão armado", unit: "m", confidence: 80 },
  { pattern: "SLAB", chapter: "06", subChapter: "06.03", description: "Lajes de betão armado", unit: "m2", confidence: 75 },
  { pattern: "FOOTING", chapter: "04", subChapter: "04.01", description: "Sapatas de fundação", unit: "m3", confidence: 75 },
  { pattern: "PILE", chapter: "04", subChapter: "04.02", description: "Estacas de fundação", unit: "m", confidence: 70 },
  { pattern: "STAIR", chapter: "06", subChapter: "06.04", description: "Escadas de betão armado", unit: "m2", confidence: 70 },
  { pattern: "MEMBER", chapter: "07", subChapter: "07.01", description: "Elementos estruturais metálicos", unit: "kg", confidence: 65 },
  { pattern: "REINFORCING", chapter: "06", subChapter: "06.05", description: "Armaduras de aço", unit: "kg", confidence: 70 },

  // Masonry (Chapter 08)
  { pattern: "WALL", chapter: "08", subChapter: "08.01", description: "Alvenaria de tijolo", unit: "m2", confidence: 70 },

  // Roof (Chapter 09)
  { pattern: "ROOF", chapter: "09", subChapter: "09.01", description: "Cobertura", unit: "m2", confidence: 75 },
  { pattern: "COVERING", chapter: "09", subChapter: "09.02", description: "Revestimento de cobertura", unit: "m2", confidence: 65 },

  // Frames & Doors (Chapter 15/17)
  { pattern: "WINDOW", chapter: "15", subChapter: "15.01", description: "Caixilharia exterior", unit: "m2", confidence: 80 },
  { pattern: "DOOR", chapter: "17", subChapter: "17.01", description: "Portas interiores", unit: "Ud", confidence: 70 },

  // Metalwork (Chapter 16)
  { pattern: "RAILING", chapter: "16", subChapter: "16.01", description: "Guardas e corrimãos", unit: "m", confidence: 70 },

  // MEP — Plumbing (Chapter 20/21)
  { pattern: "PIPESEGMENT", chapter: "20", subChapter: "20.01", description: "Tubagem de abastecimento de água", unit: "m", confidence: 65 },
  { pattern: "PIPEFITTING", chapter: "20", subChapter: "20.02", description: "Acessórios de tubagem", unit: "Ud", confidence: 60 },
  { pattern: "SANITARYTERMINAL", chapter: "21", subChapter: "21.01", description: "Aparelhos sanitários", unit: "Ud", confidence: 75 },
  { pattern: "FLOWSTORAGE", chapter: "20", subChapter: "20.03", description: "Reservatório de água", unit: "Ud", confidence: 70 },

  // MEP — Electrical (Chapter 23)
  { pattern: "CABLESEGMENT", chapter: "23", subChapter: "23.01", description: "Cablagem elétrica", unit: "m", confidence: 65 },
  { pattern: "CABLECARRIER", chapter: "23", subChapter: "23.02", description: "Caminhos de cabos", unit: "m", confidence: 65 },
  { pattern: "LIGHTFIXTURE", chapter: "23", subChapter: "23.03", description: "Luminárias", unit: "Ud", confidence: 75 },
  { pattern: "OUTLET", chapter: "23", subChapter: "23.04", description: "Tomadas elétricas", unit: "Ud", confidence: 75 },
  { pattern: "SWITCHINGDEVICE", chapter: "23", subChapter: "23.05", description: "Aparelhagem de comando", unit: "Ud", confidence: 70 },
  { pattern: "ELECTRICDISTRIBUTION", chapter: "23", subChapter: "23.06", description: "Quadro elétrico", unit: "Ud", confidence: 80 },

  // MEP — HVAC (Chapter 25)
  { pattern: "DUCTSEGMENT", chapter: "25", subChapter: "25.01", description: "Condutas de AVAC", unit: "m", confidence: 65 },
  { pattern: "DUCTFITTING", chapter: "25", subChapter: "25.02", description: "Acessórios de condutas", unit: "Ud", confidence: 60 },
  { pattern: "AIRTERMINAL", chapter: "25", subChapter: "25.03", description: "Grelhas e difusores", unit: "Ud", confidence: 70 },
  { pattern: "UNITARYEQUIPMENT", chapter: "25", subChapter: "25.04", description: "Equipamento AVAC", unit: "Ud", confidence: 60 },

  // Fire safety (Chapter 27)
  { pattern: "FIRESUPPRESSION", chapter: "27", subChapter: "27.01", description: "Equipamento de combate a incêndio", unit: "Ud", confidence: 70 },
  { pattern: "ALARM", chapter: "27", subChapter: "27.02", description: "Sistema de alarme de incêndio", unit: "Ud", confidence: 70 },

  // Gas (Chapter 22)
  { pattern: "VALVE", chapter: "22", subChapter: "22.01", description: "Válvulas", unit: "Ud", confidence: 50 },
];

// ============================================================
// Dimension Parsing
// ============================================================

/**
 * Parse dimensions from Revit family names.
 * e.g. "Concrete-Rectangular-Column:250 x 450mm" → { width: 0.25, depth: 0.45 }
 */
export function parseDimensionsFromName(name: string): { width?: number; depth?: number; diameter?: number } {
  const rectMatch = name.match(/(\d+)\s*[xX×]\s*(\d+)\s*(?:mm)?/);
  if (rectMatch) {
    return {
      width: parseInt(rectMatch[1], 10) / 1000,
      depth: parseInt(rectMatch[2], 10) / 1000,
    };
  }

  const diaMatch = name.match(/[ØDd](\d+)\s*(?:mm)?/);
  if (diaMatch) {
    return { diameter: parseInt(diaMatch[1], 10) / 1000 };
  }

  return {};
}

// ============================================================
// Resolution Logic (Priority: classification > keynote > entity_type > name)
// ============================================================

function resolveElement(element: IfcQuantityData): KeynoteResolution | null {
  const entityNorm = element.entityType.toUpperCase().replace("IFC", "");

  // Skip TYPE entities (definitions, not instances)
  if (entityNorm.endsWith("TYPE") || entityNorm.endsWith("STYLE")) {
    return null;
  }

  const elementId = element.globalId ?? element.name;

  // 1. Try classification reference (highest confidence: 95%)
  if (element.classification) {
    const classMatch = resolveClassification(element.classification);
    if (classMatch) {
      return {
        elementId,
        entityType: element.entityType,
        chapterCode: classMatch.chapter,
        articleCode: `${classMatch.subChapter}.001`,
        confidence: 95,
        method: "classification",
        classificationRef: element.classification,
        storey: element.storey,
      };
    }
  }

  // 2. Try Uniformat/ProNIC keynote code lookup (85%)
  if (element.classification) {
    const keynoteMatch = resolveKeynoteCode(element.classification);
    if (keynoteMatch) {
      return {
        elementId,
        entityType: element.entityType,
        chapterCode: keynoteMatch.chapter,
        articleCode: `${keynoteMatch.subChapter}.001`,
        confidence: keynoteMatch.confidence,
        method: "keynote_code",
        classificationRef: element.classification,
        storey: element.storey,
      };
    }
  }

  // 3. Entity type mapping (60-80%)
  for (const mapping of ENTITY_CHAPTER_MAP) {
    if (entityNorm.includes(mapping.pattern)) {
      return {
        elementId,
        entityType: element.entityType,
        chapterCode: mapping.chapter,
        articleCode: `${mapping.subChapter}.001`,
        confidence: mapping.confidence,
        method: "entity_type",
        storey: element.storey,
      };
    }
  }

  // 4. Name heuristic fallback (40-60%)
  const nameMatch = resolveByName(element.name, entityNorm);
  if (nameMatch) {
    return {
      elementId,
      entityType: element.entityType,
      chapterCode: nameMatch.chapter,
      articleCode: `${nameMatch.subChapter}.001`,
      confidence: nameMatch.confidence,
      method: "name_heuristic",
      storey: element.storey,
    };
  }

  return null;
}

/**
 * Try exact match of classification reference value against known codes.
 * Returns match only if the classification string IS a known CYPE or ProNIC code.
 */
function resolveClassification(classification: string): { chapter: string; subChapter: string } | null {
  // Direct ProNIC chapter code (e.g., "06.01", "23")
  const pronicMatch = classification.match(/^(\d{2})(?:\.(\d{2}))?/);
  if (pronicMatch) {
    const ch = pronicMatch[1];
    const sc = pronicMatch[2] ? `${ch}.${pronicMatch[2]}` : `${ch}.01`;
    if (PRONIC_CHAPTERS.some((p) => p.code === ch)) {
      return { chapter: ch, subChapter: sc };
    }
  }

  // CYPE item code (e.g., "EHS010" → chapter 06 for structures)
  const cypeMatch = classification.match(/^([A-Z]{2,4})\d{3}/);
  if (cypeMatch) {
    const cypeChapter = CYPE_PREFIX_TO_PRONIC[cypeMatch[1]];
    if (cypeChapter) return cypeChapter;
  }

  return null;
}

/**
 * Look up Uniformat / ProNIC prefix codes in the mapping table.
 */
function resolveKeynoteCode(classification: string): { chapter: string; subChapter: string; confidence: number } | null {
  // Try progressively shorter prefixes: B1020 → B10 → B
  const clean = classification.replace(/[.\-\s]/g, "").toUpperCase();

  for (let len = Math.min(clean.length, 5); len >= 2; len--) {
    const prefix = clean.substring(0, len);
    const match = CLASSIFICATION_TO_PRONIC[prefix];
    if (match) return match;
  }

  return null;
}

/**
 * Last-resort name heuristic: look for Portuguese construction keywords.
 */
function resolveByName(
  name: string,
  _entityNorm: string,
): { chapter: string; subChapter: string; confidence: number } | null {
  const lower = name.toLowerCase();

  const NAME_HINTS: { keywords: string[]; chapter: string; subChapter: string; confidence: number }[] = [
    { keywords: ["pilar", "coluna"], chapter: "06", subChapter: "06.01", confidence: 55 },
    { keywords: ["viga"], chapter: "06", subChapter: "06.02", confidence: 55 },
    { keywords: ["laje", "slab"], chapter: "06", subChapter: "06.03", confidence: 50 },
    { keywords: ["sapata", "fundação", "fundacao"], chapter: "04", subChapter: "04.01", confidence: 50 },
    { keywords: ["parede", "wall", "alvenaria"], chapter: "08", subChapter: "08.01", confidence: 45 },
    { keywords: ["janela", "window"], chapter: "15", subChapter: "15.01", confidence: 50 },
    { keywords: ["porta", "door"], chapter: "17", subChapter: "17.01", confidence: 45 },
    { keywords: ["cobertura", "roof", "telhado"], chapter: "09", subChapter: "09.01", confidence: 50 },
    { keywords: ["escada", "stair"], chapter: "06", subChapter: "06.04", confidence: 45 },
    { keywords: ["tubo", "pipe", "canalização"], chapter: "20", subChapter: "20.01", confidence: 40 },
    { keywords: ["cabo", "cable", "elétric"], chapter: "23", subChapter: "23.01", confidence: 40 },
    { keywords: ["conduta", "duct", "avac"], chapter: "25", subChapter: "25.01", confidence: 40 },
    { keywords: ["extintor", "sprinkler", "incêndio"], chapter: "27", subChapter: "27.01", confidence: 45 },
    { keywords: ["elevador", "lift"], chapter: "26", subChapter: "26.01", confidence: 50 },
  ];

  for (const hint of NAME_HINTS) {
    if (hint.keywords.some((kw) => lower.includes(kw))) {
      return hint;
    }
  }

  return null;
}

/** Maps CYPE 2-3 letter prefixes to ProNIC chapters */
const CYPE_PREFIX_TO_PRONIC: Record<string, { chapter: string; subChapter: string }> = {
  EHS: { chapter: "06", subChapter: "06.01" }, // Pilares
  EHV: { chapter: "06", subChapter: "06.02" }, // Vigas
  EHL: { chapter: "06", subChapter: "06.03" }, // Lajes maciças
  EHU: { chapter: "06", subChapter: "06.03" }, // Lajes aligeiradas
  EHB: { chapter: "06", subChapter: "06.02" }, // Sistemas de lajes
  EHE: { chapter: "06", subChapter: "06.04" }, // Escadas
  EHN: { chapter: "06", subChapter: "06.01" }, // Núcleos
  FSS: { chapter: "04", subChapter: "04.01" }, // Sapatas
  FPC: { chapter: "04", subChapter: "04.02" }, // Estacas
  SMA: { chapter: "07", subChapter: "07.01" }, // Metálicas
  ABT: { chapter: "08", subChapter: "08.01" }, // Alvenaria tijolo
  CXA: { chapter: "15", subChapter: "15.01" }, // Caixilharia alumínio
  CXP: { chapter: "15", subChapter: "15.01" }, // Caixilharia PVC
  CPI: { chapter: "17", subChapter: "17.01" }, // Carpintaria interior
  CTM: { chapter: "09", subChapter: "09.01" }, // Cobertura telha
  IFA: { chapter: "20", subChapter: "20.01" }, // Água fria
  ISS: { chapter: "21", subChapter: "21.01" }, // Esgotos
  IEI: { chapter: "23", subChapter: "23.01" }, // Instalação elétrica
  IVC: { chapter: "25", subChapter: "25.01" }, // AVAC climatização
  IOD: { chapter: "27", subChapter: "27.01" }, // Deteção incêndio
  SAE: { chapter: "26", subChapter: "26.01" }, // Elevadores
  NAF: { chapter: "28", subChapter: "28.01" }, // Isolamento térmico fachadas
};

// ============================================================
// Utility
// ============================================================

function getQuantityForUnit(element: IfcQuantityData, unit: string): number {
  const q = element.quantities;
  switch (unit) {
    case "m": return q.length ?? q.height ?? 1;
    case "m2": return q.area ?? 1;
    case "m3": return q.volume ?? 1;
    case "kg": return q.weight ?? 1;
    case "Ud": return q.count ?? 1;
    default: return 1;
  }
}

function getUnitForResolution(resolution: KeynoteResolution): string {
  // Find in entity map
  const entityNorm = resolution.entityType.toUpperCase().replace("IFC", "");
  const mapping = ENTITY_CHAPTER_MAP.find((m) => entityNorm.includes(m.pattern));
  return mapping?.unit ?? "Ud";
}

// ============================================================
// BOQ Generation (No BOQ present)
// ============================================================

/**
 * Generate a WbsProject from IFC specialty analysis results.
 * Groups IFC elements by ProNIC chapter and generates articles
 * with aggregated quantities.
 */
export function generateBoqFromIfc(
  analyses: SpecialtyAnalysisResult[],
  projectName: string,
  startDate: string,
): GeneratedBoq {
  const resolutions: KeynoteResolution[] = [];

  const allElements: IfcQuantityData[] = [];
  for (const analysis of analyses) {
    for (const q of analysis.quantities) {
      allElements.push(q);
    }
  }
  const totalElements = allElements.length;

  type ArticleAgg = {
    code: string;
    subChapter: string;
    chapter: string;
    description: string;
    unit: string;
    totalQuantity: number;
    elementCount: number;
    elementIds: string[];
  };

  const articleMap = new Map<string, ArticleAgg>();

  for (const element of allElements) {
    const resolution = resolveElement(element);
    if (!resolution) continue;

    resolutions.push(resolution);

    // Find unit from entity map or default
    const unit = getUnitForResolution(resolution);

    // Find description from entity map or classification map
    const entityNorm = element.entityType.toUpperCase().replace("IFC", "");
    const entityMapping = ENTITY_CHAPTER_MAP.find((m) => entityNorm.includes(m.pattern));
    const classMapping = resolution.classificationRef
      ? CLASSIFICATION_TO_PRONIC[resolution.classificationRef.substring(0, 4)] ??
        CLASSIFICATION_TO_PRONIC[resolution.classificationRef.substring(0, 3)] ??
        CLASSIFICATION_TO_PRONIC[resolution.classificationRef.substring(0, 2)]
      : null;

    const description = classMapping?.description ?? entityMapping?.description ?? `Elemento ${element.entityType}`;

    const key = resolution.articleCode;
    const existing = articleMap.get(key);
    const qty = getQuantityForUnit(element, unit);

    if (existing) {
      existing.totalQuantity += qty;
      existing.elementCount += 1;
      existing.elementIds.push(resolution.elementId);
    } else {
      articleMap.set(key, {
        code: key,
        subChapter: resolution.articleCode.split(".").slice(0, 2).join("."),
        chapter: resolution.chapterCode,
        description,
        unit,
        totalQuantity: qty,
        elementCount: 1,
        elementIds: [resolution.elementId],
      });
    }
  }

  // Build WbsProject
  const chapterGroups = new Map<string, Map<string, ArticleAgg>>();
  for (const [, agg] of articleMap) {
    let ch = chapterGroups.get(agg.chapter);
    if (!ch) {
      ch = new Map();
      chapterGroups.set(agg.chapter, ch);
    }
    ch.set(agg.code, agg);
  }

  const chapters: WbsChapter[] = [];
  for (const [chCode, articles] of chapterGroups) {
    const pronicChapter = PRONIC_CHAPTERS.find((c) => c.code === chCode);

    const subChapterMap = new Map<string, WbsArticle[]>();
    for (const [, agg] of articles) {
      let scArticles = subChapterMap.get(agg.subChapter);
      if (!scArticles) {
        scArticles = [];
        subChapterMap.set(agg.subChapter, scArticles);
      }
      scArticles.push({
        code: agg.code,
        description: `${agg.description} (${agg.elementCount} elementos IFC)`,
        unit: agg.unit,
        quantity: Math.round(agg.totalQuantity * 100) / 100,
        elementIds: agg.elementIds,
      });
    }

    const subChapters: WbsSubChapter[] = [];
    for (const [scCode, scArticles] of subChapterMap) {
      subChapters.push({
        code: scCode,
        name: scArticles[0]?.description ?? scCode,
        articles: scArticles,
      });
    }

    chapters.push({
      code: chCode,
      name: pronicChapter?.name ?? `Capítulo ${chCode}`,
      subChapters,
    });
  }

  chapters.sort((a, b) => a.code.localeCompare(b.code));

  const project: WbsProject = {
    id: `ifc-generated-${Date.now()}`,
    name: projectName,
    classification: "ProNIC",
    startDate,
    chapters,
  };

  const resolved = resolutions.length;
  const byMethod: Record<string, number> = {};
  for (const r of resolutions) {
    byMethod[r.method] = (byMethod[r.method] ?? 0) + 1;
  }

  return {
    project,
    resolutions,
    stats: {
      totalElements,
      resolved,
      unresolved: totalElements - resolved,
      coveragePercent: totalElements > 0 ? Math.round((resolved / totalElements) * 100) : 0,
      byMethod,
    },
  };
}

// ============================================================
// BOQ Matching (BOQ IS present)
// ============================================================

/**
 * Match IFC elements to existing BOQ articles when the user uploads both
 * an IFC model and a BOQ spreadsheet.
 *
 * Matching strategy (priority order):
 * 1. Shared classification reference → BOQ article keynote (95%)
 * 2. Entity type → BOQ article chapter code (70%)
 * 3. Description keyword similarity (50-60%)
 */
export function matchIfcToBoq(
  analyses: SpecialtyAnalysisResult[],
  boqProject: WbsProject,
): BoqMatchResult {
  const links: ElementBoqLink[] = [];
  const unlinkedIds: string[] = [];

  // Flatten all BOQ articles
  const boqArticles: (WbsArticle & { chapterCode: string })[] = [];
  for (const ch of boqProject.chapters) {
    for (const sc of ch.subChapters) {
      for (const art of sc.articles) {
        boqArticles.push({ ...art, chapterCode: ch.code });
      }
    }
  }

  // Build lookup indices
  const articlesByKeynote = new Map<string, typeof boqArticles[0]>();
  const articlesByChapter = new Map<string, typeof boqArticles>();

  for (const art of boqArticles) {
    if (art.keynote) articlesByKeynote.set(art.keynote, art);
    const ch = articlesByChapter.get(art.chapterCode) ?? [];
    ch.push(art);
    articlesByChapter.set(art.chapterCode, ch);
  }

  const linkedArticleCodes = new Set<string>();

  // Process all IFC elements
  const allElements: IfcQuantityData[] = [];
  for (const analysis of analyses) {
    for (const q of analysis.quantities) allElements.push(q);
  }

  for (const element of allElements) {
    const entityNorm = element.entityType.toUpperCase().replace("IFC", "");
    if (entityNorm.endsWith("TYPE") || entityNorm.endsWith("STYLE")) continue;

    const elementId = element.globalId ?? element.name;
    let matched = false;

    // 1. Try classification reference → BOQ keynote
    if (element.classification) {
      const art = articlesByKeynote.get(element.classification);
      if (art) {
        links.push({
          elementId,
          entityType: element.entityType,
          articleCode: art.code,
          articleDescription: art.description,
          confidence: 95,
          method: "classification",
          matchKey: element.classification,
          storey: element.storey,
        });
        linkedArticleCodes.add(art.code);
        matched = true;
      }
    }

    if (matched) continue;

    // 2. Try entity type → chapter code → BOQ articles in that chapter
    const resolution = resolveElement(element);
    if (resolution) {
      const chapterArticles = articlesByChapter.get(resolution.chapterCode);
      if (chapterArticles && chapterArticles.length > 0) {
        // Pick best matching article in the chapter by description similarity
        const best = findBestDescriptionMatch(element, chapterArticles);
        if (best) {
          links.push({
            elementId,
            entityType: element.entityType,
            articleCode: best.article.code,
            articleDescription: best.article.description,
            confidence: best.confidence,
            method: "boq_match",
            storey: element.storey,
          });
          linkedArticleCodes.add(best.article.code);
          matched = true;
        }
      }
    }

    if (!matched) {
      unlinkedIds.push(elementId);
    }
  }

  // Find orphan BOQ articles (no IFC element linked)
  const orphanArticles = boqArticles
    .filter((a) => !linkedArticleCodes.has(a.code))
    .map((a) => a.code);

  const totalElements = allElements.filter((e) => {
    const n = e.entityType.toUpperCase().replace("IFC", "");
    return !n.endsWith("TYPE") && !n.endsWith("STYLE");
  }).length;

  return {
    links,
    unlinked: unlinkedIds,
    orphanArticles,
    stats: {
      totalElements,
      linked: links.length,
      unlinked: unlinkedIds.length,
      orphanArticles: orphanArticles.length,
      coveragePercent: totalElements > 0 ? Math.round((links.length / totalElements) * 100) : 0,
    },
  };
}

/**
 * Find the best matching BOQ article for an IFC element by description keywords.
 */
function findBestDescriptionMatch(
  element: IfcQuantityData,
  articles: (WbsArticle & { chapterCode: string })[],
): { article: typeof articles[0]; confidence: number } | null {
  const entityNorm = element.entityType.toUpperCase().replace("IFC", "");
  const elementWords = new Set(
    `${element.name} ${element.entityType}`.toLowerCase().split(/[\s_\-:]+/).filter((w) => w.length >= 3),
  );

  let bestScore = 0;
  let bestArticle: typeof articles[0] | null = null;

  for (const art of articles) {
    const artWords = new Set(
      art.description.toLowerCase().split(/[\s_\-:,()]+/).filter((w) => w.length >= 3),
    );

    // Score: count shared words
    let shared = 0;
    for (const w of elementWords) {
      if (artWords.has(w)) shared++;
    }

    // Bonus for entity type keyword appearing in description
    const entityKeywords: Record<string, string[]> = {
      COLUMN: ["pilar", "coluna"], BEAM: ["viga"], SLAB: ["laje"],
      WALL: ["parede", "alvenaria"], WINDOW: ["janela", "caixilharia"],
      DOOR: ["porta"], ROOF: ["cobertura", "telhado"], STAIR: ["escada"],
      PIPE: ["tubo", "tubagem", "água"], CABLE: ["cabo", "elétric"],
      DUCT: ["conduta", "avac"], LIGHT: ["luminária", "iluminação"],
    };

    for (const [key, words] of Object.entries(entityKeywords)) {
      if (entityNorm.includes(key) && words.some((w) => art.description.toLowerCase().includes(w))) {
        shared += 3;
        break;
      }
    }

    if (shared > bestScore) {
      bestScore = shared;
      bestArticle = art;
    }
  }

  if (!bestArticle || bestScore === 0) return null;

  // Confidence: 50 base + up to 20 from keyword matches
  const confidence = Math.min(70, 50 + bestScore * 5);
  return { article: bestArticle, confidence };
}

// ============================================================
// Mapping Export Table
// ============================================================

/**
 * Export a flat mapping table for user review/override.
 * Each row represents one IFC element → BOQ article link.
 */
export function exportMappingTable(
  analyses: SpecialtyAnalysisResult[],
  resolutions: KeynoteResolution[],
): MappingTableRow[] {
  // Build element lookup
  const elementMap = new Map<string, IfcQuantityData>();
  for (const analysis of analyses) {
    for (const q of analysis.quantities) {
      const id = q.globalId ?? q.name;
      elementMap.set(id, q);
    }
  }

  // Build chapter/description lookup from resolved articles
  const articleDescriptions = new Map<string, string>();
  for (const mapping of ENTITY_CHAPTER_MAP) {
    articleDescriptions.set(`${mapping.subChapter}.001`, mapping.description);
  }
  for (const [, mapping] of Object.entries(CLASSIFICATION_TO_PRONIC)) {
    articleDescriptions.set(`${mapping.subChapter}.001`, mapping.description);
  }

  return resolutions.map((r) => {
    const element = elementMap.get(r.elementId);
    const pronicChapter = PRONIC_CHAPTERS.find((c) => c.code === r.chapterCode);

    return {
      elementId: r.elementId,
      entityType: r.entityType,
      elementName: element?.name ?? r.elementId,
      storey: r.storey ?? element?.storey ?? "",
      classification: r.classificationRef ?? "",
      resolvedChapter: pronicChapter?.name ?? `Capítulo ${r.chapterCode}`,
      articleCode: r.articleCode,
      articleDescription: articleDescriptions.get(r.articleCode) ?? "",
      confidence: r.confidence,
      method: r.method,
    };
  });
}

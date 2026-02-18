/**
 * Cross-project intelligence engine.
 *
 * Finds similar projects from history and suggests missing documents
 * based on what similar projects had. Uses project fingerprinting
 * and weighted similarity scoring to rank historical projects.
 */

import type { BuildingType, BuildingProject, AnalysisResult, RegulationArea } from "./types";
import type { ChecklistResult, ChecklistItem } from "./document-checklist";
import type { DocumentCategory } from "./zip-processor";
import type { CloudProject } from "./supabase-storage";

// ============================================================
// Types
// ============================================================

export interface ProjectFingerprint {
  buildingType: BuildingType;
  grossFloorArea: number;
  numberOfFloors: number;
  numberOfDwellings: number;
  isRehabilitation: boolean;
  district: string;
  municipality: string;
  /** Which document categories were present */
  documentCategories: DocumentCategory[];
  /** Which specialty areas had findings */
  areasWithFindings: RegulationArea[];
  /** Overall compliance score */
  overallScore: number;
  /** Energy class */
  energyClass: string;
  /** Project phase */
  projectPhase: string;
}

export interface SimilarProject {
  /** Project ID */
  projectId: string;
  /** Project name */
  projectName: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** How similarity was computed */
  matchFactors: string[];
  /** Documents this project had that the current one is missing */
  additionalDocuments: DocumentCategory[];
  /** Key differences */
  differences: string[];
}

export interface DocumentSuggestion {
  /** Document category to add */
  category: DocumentCategory;
  /** Portuguese name */
  namePt: string;
  /** Why it's suggested */
  reason: string;
  /** How many similar projects had this document */
  prevalence: number;
  /** Percentage of similar projects that had it */
  prevalencePercent: number;
  /** Priority */
  priority: "high" | "medium" | "low";
}

export interface SimilarityResult {
  /** Similar projects ranked by similarity */
  similarProjects: SimilarProject[];
  /** Suggested documents based on what similar projects had */
  documentSuggestions: DocumentSuggestion[];
  /** Number of projects analyzed */
  projectsAnalyzed: number;
  /** General insights */
  insights: string[];
}

// ============================================================
// Portuguese region grouping
// ============================================================

const REGIONS: Record<string, string[]> = {
  Norte: ["Braga", "Porto", "Viana do Castelo", "Vila Real", "Bragança"],
  Centro: ["Aveiro", "Coimbra", "Viseu", "Guarda", "Castelo Branco", "Leiria"],
  Lisboa: ["Lisboa", "Setúbal", "Santarém"],
  Alentejo: ["Évora", "Portalegre", "Beja"],
  Algarve: ["Faro"],
};

/**
 * Get the region name for a given district.
 * Returns null if the district is not recognized.
 */
function getRegion(district: string): string | null {
  const normalized = district.trim();
  for (const [region, districts] of Object.entries(REGIONS)) {
    if (districts.some(d => d.toLowerCase() === normalized.toLowerCase())) {
      return region;
    }
  }
  return null;
}

// ============================================================
// Similarity weights
// ============================================================

const WEIGHTS = {
  buildingType: 0.25,
  gfaProximity: 0.20,
  district: 0.10,
  floorCount: 0.10,
  rehabilitation: 0.10,
  phase: 0.10,
  scoreProximity: 0.05,
  energyClass: 0.05,
  documentOverlap: 0.05,
} as const;

// ============================================================
// Energy class ordering (for proximity calculation)
// ============================================================

const ENERGY_CLASS_ORDER: Record<string, number> = {
  "A+": 0,
  "A": 1,
  "B": 2,
  "B-": 3,
  "C": 4,
  "D": 5,
  "E": 6,
  "F": 7,
};

const TOTAL_ENERGY_CLASSES = Object.keys(ENERGY_CLASS_ORDER).length;

// ============================================================
// Portuguese document category names
// ============================================================

const CATEGORY_NAMES_PT: Partial<Record<DocumentCategory, string>> = {
  memoria_descritiva: "Memória Descritiva",
  caderneta_predial: "Caderneta Predial",
  certidao_registo: "Certidão de Registo Predial",
  planta_localizacao: "Planta de Localização",
  levantamento_topografico: "Levantamento Topográfico",
  planta_implantacao: "Planta de Implantação",
  plantas_arquitetura: "Plantas de Arquitetura",
  alcados: "Alçados",
  cortes: "Cortes",
  pormenores: "Pormenores Construtivos",
  projeto_estruturas: "Projeto de Estruturas",
  projeto_scie: "Projeto de SCIE",
  projeto_avac: "Projeto de AVAC",
  projeto_aguas: "Projeto de Águas e Esgotos",
  projeto_gas: "Projeto de Gás",
  projeto_eletrico: "Projeto Elétrico",
  projeto_ited: "Projeto ITED/ITUR",
  projeto_acustico: "Projeto de Acústica",
  projeto_termico: "Projeto Térmico / Energético",
  boq: "Mapa de Quantidades",
  orcamento: "Orçamento",
  regulamento_municipal: "Regulamento Municipal",
  parecer_entidade: "Parecer de Entidade",
  fotografias: "Fotografias",
  other: "Outros",
};

// ============================================================
// Core functions
// ============================================================

/**
 * Create a fingerprint from a BuildingProject, optionally enriched
 * with document categories and analysis results.
 */
export function createFingerprint(
  project: BuildingProject,
  documentCategories?: DocumentCategory[],
  analysis?: AnalysisResult,
): ProjectFingerprint {
  // Extract areas with findings from the analysis
  const areasWithFindings: RegulationArea[] = [];
  if (analysis) {
    const areaSet = new Set<RegulationArea>();
    for (const finding of analysis.findings) {
      areaSet.add(finding.area);
    }
    areasWithFindings.push(...areaSet);
  }

  return {
    buildingType: project.buildingType,
    grossFloorArea: project.grossFloorArea,
    numberOfFloors: project.numberOfFloors,
    numberOfDwellings: project.numberOfDwellings ?? 1,
    isRehabilitation: project.isRehabilitation,
    district: project.location.district,
    municipality: project.location.municipality,
    documentCategories: documentCategories ?? [],
    areasWithFindings,
    overallScore: analysis?.overallScore ?? 0,
    energyClass: analysis?.energyClass ?? "",
    projectPhase: project.licensing?.projectPhase ?? "licensing",
  };
}

/**
 * Compute similarity between two project fingerprints.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function computeSimilarity(a: ProjectFingerprint, b: ProjectFingerprint): number {
  let score = 0;

  // 1. Building type match (0.25): exact match = 1, else 0
  const buildingTypeScore = a.buildingType === b.buildingType ? 1 : 0;
  score += WEIGHTS.buildingType * buildingTypeScore;

  // 2. GFA proximity (0.20): 1 - |a-b|/max(a,b), capped at 0
  const maxGFA = Math.max(a.grossFloorArea, b.grossFloorArea);
  const gfaScore = maxGFA > 0
    ? Math.max(0, 1 - Math.abs(a.grossFloorArea - b.grossFloorArea) / maxGFA)
    : 1;
  score += WEIGHTS.gfaProximity * gfaScore;

  // 3. District match (0.10): exact = 1, same region = 0.5, else 0
  let districtScore = 0;
  if (a.district.toLowerCase() === b.district.toLowerCase()) {
    districtScore = 1;
  } else {
    const regionA = getRegion(a.district);
    const regionB = getRegion(b.district);
    if (regionA && regionB && regionA === regionB) {
      districtScore = 0.5;
    }
  }
  score += WEIGHTS.district * districtScore;

  // 4. Floor count proximity (0.10)
  const maxFloors = Math.max(a.numberOfFloors, b.numberOfFloors);
  const floorScore = maxFloors > 0
    ? Math.max(0, 1 - Math.abs(a.numberOfFloors - b.numberOfFloors) / maxFloors)
    : 1;
  score += WEIGHTS.floorCount * floorScore;

  // 5. Rehabilitation match (0.10): exact match = 1, else 0
  const rehabScore = a.isRehabilitation === b.isRehabilitation ? 1 : 0;
  score += WEIGHTS.rehabilitation * rehabScore;

  // 6. Phase match (0.10): exact match = 1, else 0
  const phaseScore = a.projectPhase === b.projectPhase ? 1 : 0;
  score += WEIGHTS.phase * phaseScore;

  // 7. Score proximity (0.05): 1 - |a-b|/100
  const overallScoreProximity = 1 - Math.abs(a.overallScore - b.overallScore) / 100;
  score += WEIGHTS.scoreProximity * Math.max(0, overallScoreProximity);

  // 8. Energy class proximity (0.05)
  const energyOrderA = ENERGY_CLASS_ORDER[a.energyClass];
  const energyOrderB = ENERGY_CLASS_ORDER[b.energyClass];
  let energyScore = 0;
  if (energyOrderA !== undefined && energyOrderB !== undefined) {
    energyScore = 1 - Math.abs(energyOrderA - energyOrderB) / (TOTAL_ENERGY_CLASSES - 1);
  } else if (a.energyClass === b.energyClass) {
    // Both unknown or both the same non-standard class
    energyScore = 1;
  }
  score += WEIGHTS.energyClass * Math.max(0, energyScore);

  // 9. Document overlap (0.05): Jaccard similarity on document categories
  const docsA = new Set(a.documentCategories);
  const docsB = new Set(b.documentCategories);
  const union = new Set([...docsA, ...docsB]);
  let intersection = 0;
  for (const doc of docsA) {
    if (docsB.has(doc)) intersection++;
  }
  const documentOverlapScore = union.size > 0 ? intersection / union.size : 1;
  score += WEIGHTS.documentOverlap * documentOverlapScore;

  return Math.min(1, Math.max(0, score));
}

/**
 * Describe the match factors between two fingerprints (human-readable).
 */
function describeMatchFactors(a: ProjectFingerprint, b: ProjectFingerprint): string[] {
  const factors: string[] = [];

  if (a.buildingType === b.buildingType) {
    factors.push(`Mesmo tipo de edifício: ${a.buildingType}`);
  }

  const maxGFA = Math.max(a.grossFloorArea, b.grossFloorArea);
  if (maxGFA > 0) {
    const gfaRatio = 1 - Math.abs(a.grossFloorArea - b.grossFloorArea) / maxGFA;
    if (gfaRatio > 0.7) {
      factors.push(`Área bruta semelhante (${a.grossFloorArea}m² vs ${b.grossFloorArea}m²)`);
    }
  }

  if (a.district.toLowerCase() === b.district.toLowerCase()) {
    factors.push(`Mesmo distrito: ${a.district}`);
  } else {
    const regionA = getRegion(a.district);
    const regionB = getRegion(b.district);
    if (regionA && regionB && regionA === regionB) {
      factors.push(`Mesma região: ${regionA}`);
    }
  }

  if (a.numberOfFloors === b.numberOfFloors) {
    factors.push(`Mesmo número de pisos: ${a.numberOfFloors}`);
  }

  if (a.isRehabilitation === b.isRehabilitation) {
    factors.push(a.isRehabilitation ? "Ambos reabilitação" : "Ambos construção nova");
  }

  if (a.projectPhase === b.projectPhase) {
    factors.push(`Mesma fase de projeto: ${a.projectPhase}`);
  }

  if (a.energyClass && b.energyClass && a.energyClass === b.energyClass) {
    factors.push(`Mesma classe energética: ${a.energyClass}`);
  }

  return factors;
}

/**
 * Describe differences between two fingerprints (human-readable).
 */
function describeDifferences(a: ProjectFingerprint, b: ProjectFingerprint): string[] {
  const diffs: string[] = [];

  if (a.buildingType !== b.buildingType) {
    diffs.push(`Tipo diferente: ${a.buildingType} vs ${b.buildingType}`);
  }

  const gfaDiff = Math.abs(a.grossFloorArea - b.grossFloorArea);
  if (gfaDiff > 100) {
    diffs.push(`Diferença de área: ${gfaDiff.toFixed(0)}m²`);
  }

  if (a.district.toLowerCase() !== b.district.toLowerCase()) {
    diffs.push(`Distrito diferente: ${a.district} vs ${b.district}`);
  }

  if (a.numberOfFloors !== b.numberOfFloors) {
    diffs.push(`Pisos diferentes: ${a.numberOfFloors} vs ${b.numberOfFloors}`);
  }

  if (a.isRehabilitation !== b.isRehabilitation) {
    diffs.push(
      a.isRehabilitation
        ? "Atual é reabilitação, referência é construção nova"
        : "Atual é construção nova, referência é reabilitação",
    );
  }

  if (a.projectPhase !== b.projectPhase) {
    diffs.push(`Fase diferente: ${a.projectPhase} vs ${b.projectPhase}`);
  }

  if (a.energyClass && b.energyClass && a.energyClass !== b.energyClass) {
    diffs.push(`Classe energética diferente: ${a.energyClass} vs ${b.energyClass}`);
  }

  return diffs;
}

/**
 * Find similar projects from a list of historical projects and suggest
 * missing documents based on what similar projects had.
 */
export function findSimilarProjects(
  currentFingerprint: ProjectFingerprint,
  historicalProjects: Array<{
    fingerprint: ProjectFingerprint;
    projectId: string;
    projectName: string;
  }>,
  maxResults: number = 10,
): SimilarityResult {
  // Compute similarity for each historical project
  const scored: SimilarProject[] = historicalProjects.map((hp) => {
    const similarity = computeSimilarity(currentFingerprint, hp.fingerprint);
    const matchFactors = describeMatchFactors(currentFingerprint, hp.fingerprint);
    const differences = describeDifferences(currentFingerprint, hp.fingerprint);

    // Documents that the historical project had but the current one is missing
    const currentDocs = new Set(currentFingerprint.documentCategories);
    const additionalDocuments = hp.fingerprint.documentCategories.filter(
      (doc) => !currentDocs.has(doc),
    );

    return {
      projectId: hp.projectId,
      projectName: hp.projectName,
      similarity,
      matchFactors,
      additionalDocuments,
      differences,
    };
  });

  // Sort by similarity descending and take top results
  scored.sort((a, b) => b.similarity - a.similarity);
  const similarProjects = scored.slice(0, maxResults);

  // ── Document suggestion logic ────────────────────────────
  // Consider only projects with similarity > 0.5
  const relevantProjects = scored.filter((p) => p.similarity > 0.5);
  const relevantCount = relevantProjects.length;

  // Count how many relevant projects have each document category
  // that the current project is missing
  const currentDocs = new Set(currentFingerprint.documentCategories);
  const categoryCounts = new Map<DocumentCategory, number>();

  for (const rp of relevantProjects) {
    const seen = new Set<DocumentCategory>();
    for (const doc of rp.additionalDocuments) {
      if (!seen.has(doc)) {
        seen.add(doc);
        categoryCounts.set(doc, (categoryCounts.get(doc) ?? 0) + 1);
      }
    }
  }

  // Build suggestions: suggest if >= 60% of similar projects had it
  const documentSuggestions: DocumentSuggestion[] = [];

  if (relevantCount > 0) {
    for (const [category, count] of categoryCounts.entries()) {
      const prevalencePercent = Math.round((count / relevantCount) * 100);

      if (prevalencePercent >= 60) {
        let priority: "high" | "medium" | "low";
        if (prevalencePercent >= 80) {
          priority = "high";
        } else {
          priority = "medium";
        }

        const namePt = CATEGORY_NAMES_PT[category] ?? category;

        documentSuggestions.push({
          category,
          namePt,
          reason: `${prevalencePercent}% dos projetos semelhantes incluíram este documento (${count} de ${relevantCount}).`,
          prevalence: count,
          prevalencePercent,
          priority,
        });
      }
    }
  }

  // Sort suggestions: high priority first, then by prevalence descending
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  documentSuggestions.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.prevalencePercent - a.prevalencePercent;
  });

  // ── Generate insights ────────────────────────────────────
  const insights: string[] = [];

  if (relevantProjects.length === 0) {
    insights.push(
      "Não foram encontrados projetos suficientemente semelhantes na base de dados histórica.",
    );
  } else {
    insights.push(
      `Encontrados ${relevantProjects.length} projetos semelhantes (similaridade > 50%) de ${historicalProjects.length} analisados.`,
    );
  }

  if (documentSuggestions.length > 0) {
    const highPriority = documentSuggestions.filter((s) => s.priority === "high");
    if (highPriority.length > 0) {
      insights.push(
        `${highPriority.length} documento(s) recomendado(s) com alta prioridade com base em projetos semelhantes.`,
      );
    }
  }

  // Check if similar projects in the same district tend to have higher scores
  const sameDistrictProjects = relevantProjects.filter(
    (rp) => {
      const hp = historicalProjects.find((h) => h.projectId === rp.projectId);
      return hp && hp.fingerprint.district.toLowerCase() === currentFingerprint.district.toLowerCase();
    },
  );
  if (sameDistrictProjects.length >= 2) {
    insights.push(
      `${sameDistrictProjects.length} projetos semelhantes encontrados no mesmo distrito (${currentFingerprint.district}).`,
    );
  }

  // Rehabilitation insight
  if (currentFingerprint.isRehabilitation) {
    const rehabCount = relevantProjects.filter((rp) => {
      const hp = historicalProjects.find((h) => h.projectId === rp.projectId);
      return hp?.fingerprint.isRehabilitation;
    }).length;
    if (rehabCount > 0) {
      insights.push(
        `${rehabCount} dos projetos semelhantes são também de reabilitação.`,
      );
    }
  }

  return {
    similarProjects,
    documentSuggestions,
    projectsAnalyzed: historicalProjects.length,
    insights,
  };
}

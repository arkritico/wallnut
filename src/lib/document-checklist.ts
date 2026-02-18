/**
 * RJUE Document Completeness Checklist.
 *
 * Based on RJUE (DL 555/99, as amended by DL 136/2014) articles 11º-13º
 * and Portaria 113/2015 (Ficha de Elementos Estatísticos).
 *
 * Determines which documents are required for a given project phase,
 * building type, and characteristics, then checks which are present.
 */

import type { BuildingType } from "./types";
import type { DocumentCategory } from "./zip-processor";

// ============================================================
// Types
// ============================================================

export type ProjectPhase =
  | "pip"            // Pedido de Informação Prévia (RJUE Art. 14º)
  | "licensing"      // Licenciamento (RJUE Art. 4º nº 2)
  | "communication"  // Comunicação Prévia (RJUE Art. 4º nº 4)
  | "utilization";   // Licença de Utilização (RJUE Art. 62º-63º)

export interface RequiredDocument {
  /** Document identifier */
  id: string;
  /** Portuguese name */
  namePt: string;
  /** English name */
  nameEn: string;
  /** Legal basis (article reference) */
  legalBasis: string;
  /** Which ZIP document categories satisfy this requirement */
  matchCategories: DocumentCategory[];
  /** Whether this is absolutely required or sometimes required */
  requirement: "mandatory" | "conditional" | "recommended";
  /** Condition description (when requirement is conditional) */
  condition?: string;
  /** Condition function — returns true if this document is required */
  isRequired: (ctx: ChecklistContext) => boolean;
  /** Document group for display */
  group: "administrative" | "architecture" | "specialty" | "other";
}

export interface ChecklistContext {
  projectPhase: ProjectPhase;
  buildingType: BuildingType;
  grossFloorArea: number;
  numberOfFloors: number;
  numberOfDwellings: number;
  isRehabilitation: boolean;
  isInARU: boolean;
  isProtectedArea: boolean;
  buildingHeight: number;
  hasElevator: boolean;
  hasGasInstallation: boolean;
  isUrbanization: boolean;
}

export interface ChecklistItem {
  document: RequiredDocument;
  /** Is this document required for this project? */
  isRequired: boolean;
  /** Is this document present in the uploaded files? */
  isPresent: boolean;
  /** Status */
  status: "present" | "missing" | "not_required";
}

export interface ChecklistResult {
  /** All checklist items */
  items: ChecklistItem[];
  /** Summary counts */
  summary: {
    totalRequired: number;
    present: number;
    missing: number;
    notRequired: number;
    completenessPercent: number;
  };
  /** Missing mandatory documents */
  missingMandatory: ChecklistItem[];
  /** Missing conditional/recommended documents */
  missingOptional: ChecklistItem[];
}

// ============================================================
// Document definitions (RJUE-based)
// ============================================================

const REQUIRED_DOCUMENTS: RequiredDocument[] = [
  // ── Administrative ──────────────────────────────────────
  {
    id: "caderneta_predial",
    namePt: "Caderneta Predial",
    nameEn: "Property Registration Card",
    legalBasis: "RJUE Art. 11º nº 1 a)",
    matchCategories: ["caderneta_predial"],
    requirement: "mandatory",
    isRequired: () => true,
    group: "administrative",
  },
  {
    id: "certidao_registo",
    namePt: "Certidão de Registo Predial",
    nameEn: "Property Registry Certificate",
    legalBasis: "RJUE Art. 11º nº 1 b)",
    matchCategories: ["certidao_registo"],
    requirement: "mandatory",
    isRequired: () => true,
    group: "administrative",
  },
  {
    id: "memoria_descritiva",
    namePt: "Memória Descritiva e Justificativa",
    nameEn: "Descriptive and Justificative Memoir",
    legalBasis: "RJUE Art. 11º nº 1 c); Portaria 113/2015",
    matchCategories: ["memoria_descritiva"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase !== "pip",
    group: "architecture",
  },

  // ── Architecture drawings ───────────────────────────────
  {
    id: "planta_localizacao",
    namePt: "Planta de Localização",
    nameEn: "Location Plan",
    legalBasis: "RJUE Art. 11º nº 1 d); Portaria 113/2015 Anexo I",
    matchCategories: ["planta_localizacao"],
    requirement: "mandatory",
    isRequired: () => true,
    group: "architecture",
  },
  {
    id: "levantamento_topografico",
    namePt: "Levantamento Topográfico",
    nameEn: "Topographic Survey",
    legalBasis: "Portaria 113/2015 Anexo I",
    matchCategories: ["levantamento_topografico"],
    requirement: "conditional",
    condition: "Obrigatório para obras novas e ampliações",
    isRequired: (ctx) => !ctx.isRehabilitation || ctx.projectPhase === "licensing",
    group: "architecture",
  },
  {
    id: "planta_implantacao",
    namePt: "Planta de Implantação",
    nameEn: "Site Implantation Plan",
    legalBasis: "Portaria 113/2015 Anexo I",
    matchCategories: ["planta_implantacao"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase !== "pip",
    group: "architecture",
  },
  {
    id: "plantas_arquitetura",
    namePt: "Plantas de Arquitetura (todos os pisos)",
    nameEn: "Architecture Floor Plans (all floors)",
    legalBasis: "Portaria 113/2015 Anexo I",
    matchCategories: ["plantas_arquitetura"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase !== "pip",
    group: "architecture",
  },
  {
    id: "alcados",
    namePt: "Alçados (todas as fachadas)",
    nameEn: "Elevations (all facades)",
    legalBasis: "Portaria 113/2015 Anexo I",
    matchCategories: ["alcados"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase !== "pip",
    group: "architecture",
  },
  {
    id: "cortes",
    namePt: "Cortes (longitudinal e transversal)",
    nameEn: "Sections (longitudinal and transverse)",
    legalBasis: "Portaria 113/2015 Anexo I",
    matchCategories: ["cortes"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase !== "pip",
    group: "architecture",
  },
  {
    id: "pormenores",
    namePt: "Pormenores Construtivos",
    nameEn: "Construction Details",
    legalBasis: "Portaria 113/2015 Anexo I",
    matchCategories: ["pormenores"],
    requirement: "recommended",
    isRequired: () => false,
    group: "architecture",
  },

  // ── Specialty projects ──────────────────────────────────
  {
    id: "projeto_estruturas",
    namePt: "Projeto de Estabilidade / Estruturas",
    nameEn: "Structural Project",
    legalBasis: "RJUE Art. 11º nº 4; Portaria 701-H/2008",
    matchCategories: ["projeto_estruturas"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase === "licensing" || ctx.projectPhase === "communication",
    group: "specialty",
  },
  {
    id: "projeto_scie",
    namePt: "Projeto de Segurança Contra Incêndio (SCIE)",
    nameEn: "Fire Safety Project (SCIE)",
    legalBasis: "DL 220/2008 Art. 17º",
    matchCategories: ["projeto_scie"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase === "licensing" || ctx.projectPhase === "communication",
    group: "specialty",
  },
  {
    id: "projeto_aguas",
    namePt: "Projeto de Redes de Águas e Esgotos",
    nameEn: "Water Supply and Drainage Project",
    legalBasis: "RGSPPDADAR DL 23/95",
    matchCategories: ["projeto_aguas"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase === "licensing" || ctx.projectPhase === "communication",
    group: "specialty",
  },
  {
    id: "projeto_eletrico",
    namePt: "Projeto de Instalações Elétricas",
    nameEn: "Electrical Installations Project",
    legalBasis: "RTIEBT Portaria 949-A/2006",
    matchCategories: ["projeto_eletrico"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase === "licensing" || ctx.projectPhase === "communication",
    group: "specialty",
  },
  {
    id: "projeto_ited",
    namePt: "Projeto ITED / ITUR",
    nameEn: "Telecommunications Project (ITED/ITUR)",
    legalBasis: "DL 123/2009; Manual ITED 4ª Ed.",
    matchCategories: ["projeto_ited"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase === "licensing" || ctx.projectPhase === "communication",
    group: "specialty",
  },
  {
    id: "projeto_termico",
    namePt: "Projeto de Comportamento Térmico / Energético",
    nameEn: "Thermal/Energy Performance Project",
    legalBasis: "REH DL 118/2013; Portaria 349-B/2013",
    matchCategories: ["projeto_termico"],
    requirement: "mandatory",
    isRequired: (ctx) => ctx.projectPhase === "licensing" || ctx.projectPhase === "communication",
    group: "specialty",
  },
  {
    id: "projeto_acustico",
    namePt: "Projeto de Condicionamento Acústico",
    nameEn: "Acoustic Project",
    legalBasis: "RRAE DL 129/2002",
    matchCategories: ["projeto_acustico"],
    requirement: "conditional",
    condition: "Obrigatório para edifícios com múltiplos fogos ou uso misto",
    isRequired: (ctx) =>
      (ctx.numberOfDwellings > 1 || ctx.buildingType === "mixed" || ctx.buildingType === "commercial") &&
      (ctx.projectPhase === "licensing" || ctx.projectPhase === "communication"),
    group: "specialty",
  },
  {
    id: "projeto_gas",
    namePt: "Projeto de Instalações de Gás",
    nameEn: "Gas Installations Project",
    legalBasis: "DL 521/99; Portaria 361/98",
    matchCategories: ["projeto_gas"],
    requirement: "conditional",
    condition: "Obrigatório quando há instalação de gás",
    isRequired: (ctx) =>
      ctx.hasGasInstallation &&
      (ctx.projectPhase === "licensing" || ctx.projectPhase === "communication"),
    group: "specialty",
  },
  {
    id: "projeto_avac",
    namePt: "Projeto de AVAC / Ventilação",
    nameEn: "HVAC/Ventilation Project",
    legalBasis: "RECS DL 118/2013; RSECE",
    matchCategories: ["projeto_avac"],
    requirement: "conditional",
    condition: "Obrigatório para edifícios comerciais/serviços ou > 1000m²",
    isRequired: (ctx) =>
      (ctx.buildingType === "commercial" || ctx.buildingType === "mixed" || ctx.grossFloorArea > 1000) &&
      (ctx.projectPhase === "licensing" || ctx.projectPhase === "communication"),
    group: "specialty",
  },

  // ── Other ───────────────────────────────────────────────
  {
    id: "boq",
    namePt: "Mapa de Quantidades / Orçamento",
    nameEn: "Bill of Quantities / Budget",
    legalBasis: "Portaria 701-H/2008",
    matchCategories: ["boq", "orcamento"],
    requirement: "recommended",
    condition: "Recomendado para orçamentação e planeamento",
    isRequired: () => false,
    group: "other",
  },
  {
    id: "regulamento_municipal",
    namePt: "Regulamento Municipal / PDM",
    nameEn: "Municipal Regulation / PDM",
    legalBasis: "RJUE Art. 10º",
    matchCategories: ["regulamento_municipal"],
    requirement: "recommended",
    condition: "Recomendado para verificação de conformidade municipal",
    isRequired: () => false,
    group: "other",
  },
  {
    id: "fotografias",
    namePt: "Fotografias do Local / Existente",
    nameEn: "Site / Existing Photographs",
    legalBasis: "Portaria 113/2015",
    matchCategories: ["fotografias"],
    requirement: "conditional",
    condition: "Obrigatório em reabilitações",
    isRequired: (ctx) => ctx.isRehabilitation,
    group: "other",
  },
];

// ============================================================
// Checklist evaluation
// ============================================================

/**
 * Evaluate document completeness given uploaded file categories.
 */
export function evaluateChecklist(
  ctx: ChecklistContext,
  uploadedCategories: DocumentCategory[],
): ChecklistResult {
  const items: ChecklistItem[] = [];

  for (const doc of REQUIRED_DOCUMENTS) {
    const isRequired = doc.isRequired(ctx);
    const isPresent = doc.matchCategories.some(cat => uploadedCategories.includes(cat));

    items.push({
      document: doc,
      isRequired,
      isPresent,
      status: !isRequired ? "not_required" : isPresent ? "present" : "missing",
    });
  }

  const requiredItems = items.filter(i => i.isRequired);
  const present = requiredItems.filter(i => i.isPresent).length;
  const missing = requiredItems.filter(i => !i.isPresent).length;
  const notRequired = items.filter(i => !i.isRequired).length;

  return {
    items,
    summary: {
      totalRequired: requiredItems.length,
      present,
      missing,
      notRequired,
      completenessPercent: requiredItems.length > 0
        ? Math.round((present / requiredItems.length) * 100)
        : 100,
    },
    missingMandatory: items.filter(
      i => i.status === "missing" && i.document.requirement === "mandatory",
    ),
    missingOptional: items.filter(
      i => i.status === "missing" && i.document.requirement !== "mandatory",
    ),
  };
}

/**
 * Build a ChecklistContext from a BuildingProject.
 */
export function contextFromProject(project: {
  buildingType: BuildingType;
  grossFloorArea: number;
  numberOfFloors: number;
  numberOfDwellings?: number;
  buildingHeight: number;
  isRehabilitation: boolean;
  licensing?: {
    projectPhase?: string;
    isInARU?: boolean;
    isProtectedArea?: boolean;
  };
  elevators?: { hasElevator?: boolean };
  gas?: { hasGasInstallation?: boolean };
  telecommunications?: { isUrbanization?: boolean };
}): ChecklistContext {
  const phase = project.licensing?.projectPhase ?? "licensing";
  const phaseMap: Record<string, ProjectPhase> = {
    prior_info: "pip",
    pip: "pip",
    licensing: "licensing",
    communication: "communication",
    utilization: "utilization",
  };

  return {
    projectPhase: phaseMap[phase] ?? "licensing",
    buildingType: project.buildingType,
    grossFloorArea: project.grossFloorArea,
    numberOfFloors: project.numberOfFloors,
    numberOfDwellings: project.numberOfDwellings ?? 1,
    isRehabilitation: project.isRehabilitation,
    isInARU: project.licensing?.isInARU ?? false,
    isProtectedArea: project.licensing?.isProtectedArea ?? false,
    buildingHeight: project.buildingHeight,
    hasElevator: project.elevators?.hasElevator ?? false,
    hasGasInstallation: project.gas?.hasGasInstallation ?? false,
    isUrbanization: project.telecommunications?.isUrbanization ?? false,
  };
}

/**
 * Get all required document definitions for reference.
 */
export function getAllDocumentDefinitions(): RequiredDocument[] {
  return [...REQUIRED_DOCUMENTS];
}

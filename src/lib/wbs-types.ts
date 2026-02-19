/**
 * WBS (Work Breakdown Structure) types based on ISO 12006-2 and
 * Portuguese ProNIC chapter structure.
 *
 * Each article carries a keynote that maps to BIM model elements,
 * enabling automated quantity takeoff and CYPE cost matching.
 */

// ============================================================
// Core WBS Types
// ============================================================

export interface WbsProject {
  /** Project identifier */
  id: string;
  name: string;
  /** ISO 12006-2 classification system used */
  classification: "ProNIC" | "Uniclass" | "OmniClass" | "custom";
  /** Start date for scheduling */
  startDate: string; // ISO date
  /** Location for cost adjustment */
  district?: string;
  buildingType?: "residential" | "commercial" | "mixed" | "industrial";
  /** Gross floor area in m² (for productivity estimation) */
  grossFloorArea?: number;
  usableFloorArea?: number;
  numberOfFloors?: number;
  numberOfDwellings?: number;
  /** Building height in meters */
  buildingHeight?: number;
  /** Whether this is a rehabilitation project */
  isRehabilitation?: boolean;
  /** WBS chapters */
  chapters: WbsChapter[];
}

export interface WbsChapter {
  /** Chapter code (e.g., "01", "06", "23") */
  code: string;
  /** Chapter name (e.g., "Estruturas de betão armado") */
  name: string;
  /** Sub-chapters */
  subChapters: WbsSubChapter[];
}

export interface WbsSubChapter {
  /** Sub-chapter code (e.g., "06.01", "23.02") */
  code: string;
  name: string;
  articles: WbsArticle[];
}

export interface WbsArticle {
  /** Full article code (e.g., "06.01.003") */
  code: string;
  /** Article description */
  description: string;
  /** Measurement unit */
  unit: string;
  /** Measured quantity (from model or manual) */
  quantity: number;
  /** Unit price if already known */
  unitPrice?: number;
  /** BIM keynote linking to model elements */
  keynote?: string;
  /** Revit/IFC element IDs this article corresponds to */
  elementIds?: string[];
  /** Manual CYPE code override (if user already knows the match) */
  cypeCodeOverride?: string;
  /** Additional search terms for matching */
  tags?: string[];
}

// ============================================================
// CYPE Match Results
// ============================================================

export interface CypeMatch {
  /** The WBS article that was matched */
  articleCode: string;
  articleDescription: string;
  /** CYPE work item code */
  cypeCode: string;
  cypeDescription: string;
  cypeChapter: string;
  /** Match confidence 0-100 */
  confidence: number;
  /** How the match was determined */
  matchMethod: "exact_code" | "keynote" | "description" | "category" | "fallback";
  /** Matched CYPE unit cost */
  unitCost: number;
  /** Cost breakdown */
  breakdown: { materials: number; labor: number; machinery: number };
  /** CYPE unit */
  cypeUnit: string;
  /** Unit conversion factor if units differ */
  unitConversion: number;
  /** Issues with the match */
  warnings: string[];
  /** Article quantity from WBS (for total cost calculation) */
  articleQuantity?: number;
  /** Article unit from WBS */
  articleUnit?: string;
  /** Total estimated cost (unitCost × articleQuantity × unitConversion) */
  estimatedCost?: number;
  /** Full breakdown array from CYPE database (for resource aggregation) */
  fullBreakdown?: Array<{
    code: string;
    unit: string;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    total: number | null;
    type: 'material' | 'labor' | 'machinery';
  }>;
}

export interface MatchReport {
  /** All matches found */
  matches: CypeMatch[];
  /** Articles with no match (need manual review) */
  unmatched: { articleCode: string; description: string; suggestedSearch: string }[];
  /** Overall statistics */
  stats: {
    totalArticles: number;
    matched: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    unmatched: number;
    coveragePercent: number;
    totalEstimatedCost?: number;
  };
}

// ============================================================
// Schedule Types
// ============================================================

export interface ScheduleTask {
  /** Unique task ID */
  uid: number;
  /** WBS code for hierarchy */
  wbs: string;
  /** Task name */
  name: string;
  /** Duration in working days */
  durationDays: number;
  /** Duration in hours */
  durationHours: number;
  /** Start date (ISO) */
  startDate: string;
  /** Finish date (ISO) */
  finishDate: string;
  /** Predecessor task UIDs with relationship type */
  predecessors: { uid: number; type: "FS" | "SS" | "FF" | "SF"; lag?: number }[];
  /** Is this a summary/group task? */
  isSummary: boolean;
  /** Construction phase for sequencing */
  phase: ConstructionPhase;
  /** Resources assigned */
  resources: TaskResource[];
  /** Cost from CYPE match */
  cost: number;
  /** Material cost */
  materialCost: number;
  /** Outline level (1 = chapter, 2 = sub-chapter, 3 = article) */
  outlineLevel: number;
  /** Percent complete (0 for planning) */
  percentComplete: number;
  /** Physical percent complete (0-100); distinct from schedule % complete */
  physicalPercentComplete?: number;
  /** Is this a milestone (zero-duration marker)? */
  isMilestone?: boolean;
  /** Notes/remarks */
  notes?: string;
}

export interface TaskResource {
  /** Resource name */
  name: string;
  /** Resource type */
  type: "labor" | "material" | "machinery" | "subcontractor";
  /** Number of units assigned */
  units: number;
  /** Cost per hour (labor/machinery) or per unit (material) */
  rate: number;
  /** Total hours for this assignment */
  hours: number;
  /** For subcontractors: team size they bring (informational) */
  teamSize?: number;
}

export type ConstructionPhase =
  | "site_setup"
  | "demolition"
  | "earthworks"
  | "foundations"
  | "structure"
  | "external_walls"
  | "roof"
  | "waterproofing"
  | "external_frames"
  | "rough_in_plumbing"
  | "rough_in_electrical"
  | "rough_in_hvac"
  | "rough_in_gas"
  | "rough_in_telecom"
  | "internal_walls"
  | "insulation"
  | "external_finishes"
  | "internal_finishes"
  | "flooring"
  | "ceilings"
  | "carpentry"
  | "plumbing_fixtures"
  | "electrical_fixtures"
  | "painting"
  | "metalwork"
  | "elevators"
  | "fire_safety"
  | "external_works"
  | "testing"
  | "cleanup"
  // Pre-construction licensing phases (DL 10/2024)
  | "licensing_preparation"
  | "specialty_projects"
  | "external_consultations"
  | "licensing_approval"
  | "construction_authorization"
  // Post-construction
  | "utilization_authorization";

export interface ProjectSchedule {
  projectName: string;
  startDate: string;
  finishDate: string;
  totalDurationDays: number;
  totalCost: number;
  tasks: ScheduleTask[];
  resources: ProjectResource[];
  /** Critical path task UIDs */
  criticalPath: number[];
  /** Team summary */
  teamSummary: {
    maxWorkers: number;
    averageWorkers: number;
    totalManHours: number;
    peakWeek: string;
  };
  /** Critical Chain (Goldratt) data — present when CCPM mode is used */
  criticalChain?: CriticalChainData;
}

// ============================================================
// Critical Chain (Goldratt CCPM) Types
// ============================================================

export interface CriticalChainBuffer {
  /** Unique ID for this buffer */
  uid: number;
  /** Buffer type */
  type: "project" | "feeding" | "resource";
  /** Human-readable name */
  name: string;
  /** Buffer duration in working days */
  durationDays: number;
  /** Buffer consumption: 0 = unused, 100 = fully consumed */
  consumedPercent: number;
  /** Buffer status zone: green < 33%, yellow 33-66%, red > 66% */
  zone: "green" | "yellow" | "red";
  /** Start date of the buffer */
  startDate: string;
  /** End date of the buffer */
  finishDate: string;
  /** Which task chain feeds into this buffer (task UIDs) */
  feedingChain: number[];
  /** Where this buffer protects (task UID it precedes) */
  protectsTask?: number;
}

export interface CriticalChainData {
  /** The critical chain task UIDs (resource-leveled critical path) */
  chainTaskUids: number[];
  /** All buffers */
  buffers: CriticalChainBuffer[];
  /** Project buffer (at the end) */
  projectBuffer: CriticalChainBuffer;
  /** Feeding buffers (at merge points) */
  feedingBuffers: CriticalChainBuffer[];
  /** Original duration before CCPM (with safety padding) */
  originalDurationDays: number;
  /** Aggressive duration (safety removed from tasks) */
  aggressiveDurationDays: number;
  /** Final duration (aggressive + project buffer) */
  ccpmDurationDays: number;
  /** Safety removed per task (percentage) */
  safetyReductionPercent: number;
  /** Overall buffer ratio (project buffer / aggressive duration) */
  bufferRatio: number;
}

export interface ProjectResource {
  uid: number;
  name: string;
  type: "labor" | "material" | "machinery" | "subcontractor";
  /** Standard rate (EUR/hour for labor, EUR/unit for material) */
  standardRate: number;
  /** Total assigned hours across all tasks */
  totalHours: number;
  /** Total cost */
  totalCost: number;
  /** For subcontractor resources: how many workers they represent */
  teamSize?: number;
}

// ============================================================
// ProNIC Standard Chapters (Portuguese WBS)
// ============================================================

export const PRONIC_CHAPTERS: { code: string; name: string; phase: ConstructionPhase }[] = [
  { code: "01", name: "Estaleiro e trabalhos preparatórios", phase: "site_setup" },
  { code: "02", name: "Demolições", phase: "demolition" },
  { code: "03", name: "Movimento de terras", phase: "earthworks" },
  { code: "04", name: "Fundações", phase: "foundations" },
  { code: "05", name: "Contenções e muros de suporte", phase: "foundations" },
  { code: "06", name: "Estruturas de betão armado", phase: "structure" },
  { code: "07", name: "Estruturas metálicas", phase: "structure" },
  { code: "08", name: "Alvenarias", phase: "external_walls" },
  { code: "09", name: "Coberturas", phase: "roof" },
  { code: "10", name: "Impermeabilizações", phase: "waterproofing" },
  { code: "11", name: "Revestimentos exteriores", phase: "external_finishes" },
  { code: "12", name: "Revestimentos interiores", phase: "internal_finishes" },
  { code: "13", name: "Pavimentos", phase: "flooring" },
  { code: "14", name: "Tetos", phase: "ceilings" },
  { code: "15", name: "Caixilharias e portas exteriores", phase: "external_frames" },
  { code: "16", name: "Serralharias", phase: "metalwork" },
  { code: "17", name: "Carpintarias", phase: "carpentry" },
  { code: "18", name: "Vidros e espelhos", phase: "external_frames" },
  { code: "19", name: "Pinturas e envernizamentos", phase: "painting" },
  { code: "20", name: "Instalações de abastecimento de água", phase: "rough_in_plumbing" },
  { code: "21", name: "Instalações de esgotos e drenagem", phase: "rough_in_plumbing" },
  { code: "22", name: "Instalações de gás", phase: "rough_in_gas" },
  { code: "23", name: "Instalações elétricas", phase: "rough_in_electrical" },
  { code: "24", name: "ITED / ITUR", phase: "rough_in_telecom" },
  { code: "25", name: "AVAC e ventilação", phase: "rough_in_hvac" },
  { code: "26", name: "Ascensores e plataformas", phase: "elevators" },
  { code: "27", name: "Segurança contra incêndio", phase: "fire_safety" },
  { code: "28", name: "Isolamentos térmicos e acústicos", phase: "insulation" },
  { code: "29", name: "Arranjos exteriores", phase: "external_works" },
  { code: "30", name: "Ensaios, certificações e diversos", phase: "testing" },
];

/**
 * Map a ProNIC chapter code to a construction phase.
 */
export function chapterToPhase(chapterCode: string): ConstructionPhase {
  const ch = PRONIC_CHAPTERS.find(c => c.code === chapterCode);
  return ch?.phase ?? "site_setup";
}

/**
 * Licensing Phase Generator — DL 10/2024 Timeline Bridge
 *
 * Bridges DL 10/2024 (Simplex Urbanístico) regulatory timelines into the
 * construction schedule by generating pre-construction approval milestones
 * and post-construction authorization tasks.
 *
 * Pure module: no side effects, no DB calls.
 */

import type {
  ScheduleTask,
  TaskResource,
  ConstructionPhase,
  ProjectSchedule,
} from "./wbs-types";
import type { BuildingProject, Finding } from "./types";

// ============================================================
// Types
// ============================================================

export type LicensingPathway =
  | "exempt"               // Isento (Art. 6.º/6.º-A)
  | "comunicacao_previa"   // Comunicação prévia (Art. 4.º)
  | "licenciamento"        // Full licensing (Art. 4.º)
  | "public_entity_exempt"; // Public entity (Art. 7.º)

export interface SpecialtyProject {
  id: string;
  name: string;
  abbreviation: string;
  preparationDays: number;
  entity?: string;
}

export interface ExternalConsultation {
  id: string;
  entityName: string;
  entityAbbreviation: string;
  responseDays: number;
  suspendsClock: boolean;
}

export interface LicensingPathwayResult {
  pathway: LicensingPathway;
  reason: string;
  legalBasis: string;
  baseApprovalDays: number;
  requiredSpecialties: SpecialtyProject[];
  requiredConsultations: ExternalConsultation[];
}

export interface LicensingPhasesOptions {
  includePostConstruction?: boolean;
  startingUid?: number;
  includeInformacaoPrevia?: boolean;
}

export interface LicensingPhasesResult {
  pathway: LicensingPathwayResult;
  preConstructionTasks: ScheduleTask[];
  postConstructionTasks: ScheduleTask[];
  allTasks: ScheduleTask[];
  summary: {
    totalPreConstructionDays: number;
    totalPostConstructionDays: number;
    criticalPathEntity: string;
    requiredSpecialties: number;
    requiredConsultations: number;
  };
}

// ============================================================
// Constants
// ============================================================

/** Portuguese display names for licensing phases */
const LICENSING_PHASE_NAMES: Record<string, string> = {
  licensing_preparation: "Preparação Documental",
  specialty_projects: "Projetos de Especialidades",
  external_consultations: "Consultas a Entidades Externas",
  licensing_approval: "Aprovação Municipal",
  construction_authorization: "Título de Operação Urbanística",
  utilization_authorization: "Autorização de Utilização",
};

/** Specialty project configuration */
const SPECIALTY_CONFIG: Omit<SpecialtyProject, "id">[] = [
  { name: "Projeto de Arquitetura", abbreviation: "ARQ", preparationDays: 10, entity: "Câmara Municipal" },
  { name: "Projeto de Estabilidade", abbreviation: "EST", preparationDays: 15, entity: "Câmara Municipal" },
  { name: "Projeto SCIE", abbreviation: "SCIE", preparationDays: 15, entity: "ANPC" },
  { name: "Projeto AVAC", abbreviation: "AVAC", preparationDays: 10, entity: "DGEG" },
  { name: "Projeto de Águas e Drenagem", abbreviation: "AGD", preparationDays: 8, entity: "Câmara Municipal" },
  { name: "Projeto de Gás", abbreviation: "GAS", preparationDays: 8, entity: "DGEG" },
  { name: "Projeto de Instalações Elétricas", abbreviation: "ELE", preparationDays: 10, entity: "DGEG" },
  { name: "Projeto ITED/ITUR", abbreviation: "ITED", preparationDays: 8, entity: "ANACOM" },
  { name: "Projeto de Comportamento Térmico (SCE)", abbreviation: "SCE", preparationDays: 10, entity: "ADENE" },
  { name: "Projeto de Condicionamento Acústico", abbreviation: "ACUS", preparationDays: 8, entity: "Câmara Municipal" },
  { name: "Projeto de Ascensores", abbreviation: "ASC", preparationDays: 8, entity: "Câmara Municipal" },
];

/** External consultation configuration */
const CONSULTATION_CONFIG: Record<string, Omit<ExternalConsultation, "id">> = {
  ANPC: { entityName: "Autoridade Nacional de Proteção Civil", entityAbbreviation: "ANPC", responseDays: 20, suspendsClock: true },
  DGEG: { entityName: "Direção-Geral de Energia e Geologia", entityAbbreviation: "DGEG", responseDays: 30, suspendsClock: true },
  ANACOM: { entityName: "Autoridade Nacional de Comunicações", entityAbbreviation: "ANACOM", responseDays: 20, suspendsClock: true },
  ADENE: { entityName: "Agência para a Energia", entityAbbreviation: "ADENE", responseDays: 20, suspendsClock: true },
  DGPC: { entityName: "Direção-Geral do Património Cultural", entityAbbreviation: "DGPC", responseDays: 30, suspendsClock: true },
};

/** Labor roles for licensing tasks */
const LICENSING_ROLES = {
  coordinator: { name: "Arquiteto Coordenador", rate: 35 },
  engineer: { name: "Engenheiro de Especialidade", rate: 30 },
  admin: { name: "Administrativo", rate: 15 },
};

const HOURS_PER_DAY = 8;

// ============================================================
// Date Utilities
// ============================================================

function addWorkingDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

/** Convert calendar days to working days (×5/7, min 1) */
function calendarToWorkingDays(calendarDays: number): number {
  return Math.max(1, Math.ceil(calendarDays * 5 / 7));
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function parseDate(s: string): Date {
  return new Date(s + "T08:00:00");
}

// ============================================================
// Pathway Determination
// ============================================================

/**
 * Determine the licensing pathway for a project based on DL 10/2024.
 */
export function determineLicensingPathway(project: BuildingProject): LicensingPathwayResult {
  const arch = project.architecture as Record<string, unknown>;

  // Priority 1: Public entity exemption (Art. 7.º)
  if (arch.isPublicEntity === true) {
    return {
      pathway: "public_entity_exempt",
      reason: "Operação de entidade pública isenta de controlo prévio municipal (Art. 7.º DL 10/2024)",
      legalBasis: "DL 10/2024 Art. 7.º",
      baseApprovalDays: 0,
      requiredSpecialties: [],
      requiredConsultations: [],
    };
  }

  // Priority 2: Minor works exempt (Art. 6.º/6.º-A)
  if (arch.isMinorWork === true) {
    return {
      pathway: "exempt",
      reason: "Obra isenta de controlo prévio — notificação obrigatória 5 dias antes do início (DL 10/2024 Art. 6.º)",
      legalBasis: "DL 10/2024 Art. 6.º e 6.º-A",
      baseApprovalDays: 5,
      requiredSpecialties: [],
      requiredConsultations: [],
    };
  }

  const specialties = getRequiredSpecialties(project);

  // Priority 3: Comunicação prévia (lot allotment without licensing requirement)
  if (arch.hasLotAllotment === true && arch.requiresLicensing !== true) {
    const consultations = getRequiredConsultations(project, specialties);
    return {
      pathway: "comunicacao_previa",
      reason: "Comunicação prévia — loteamento em área com plano de pormenor (DL 10/2024 Art. 4.º)",
      legalBasis: "DL 10/2024 Art. 4.º",
      baseApprovalDays: 20,
      requiredSpecialties: specialties,
      requiredConsultations: consultations,
    };
  }

  const consultations = getRequiredConsultations(project, specialties);

  // Priority 4: Licensing with loteamento (45 days)
  if (arch.requiresLicensing === true && arch.hasLotAllotment === true) {
    return {
      pathway: "licenciamento",
      reason: "Licenciamento municipal — loteamento em área sem plano de pormenor (DL 10/2024 Art. 4.º)",
      legalBasis: "DL 10/2024 Art. 4.º",
      baseApprovalDays: 45,
      requiredSpecialties: specialties,
      requiredConsultations: consultations,
    };
  }

  // Priority 5: Standard licensing (20 days)
  return {
    pathway: "licenciamento",
    reason: "Licenciamento municipal — construção/alteração/ampliação (DL 10/2024 Art. 4.º)",
    legalBasis: "DL 10/2024 Art. 4.º",
    baseApprovalDays: 20,
    requiredSpecialties: specialties,
    requiredConsultations: consultations,
  };
}

// ============================================================
// Specialty & Consultation Detection
// ============================================================

/**
 * Determine which specialty projects are required based on project characteristics.
 */
export function getRequiredSpecialties(project: BuildingProject): SpecialtyProject[] {
  const specialties: SpecialtyProject[] = [];
  let idx = 0;

  const addSpecialty = (config: typeof SPECIALTY_CONFIG[number]) => {
    specialties.push({ id: `SP-${String(++idx).padStart(2, "0")}`, ...config });
  };

  // Architecture is always required for licenciamento
  addSpecialty(SPECIALTY_CONFIG[0]); // ARQ

  // Structural: multi-storey or has structural project
  if (project.numberOfFloors > 1 || project.structural?.hasStructuralProject) {
    addSpecialty(SPECIALTY_CONFIG[1]); // EST
  }

  // Fire safety: risk category >= 2 or height > 9m
  const riskCat = parseInt(project.fireSafety?.riskCategory ?? "1", 10);
  if (riskCat >= 2 || project.buildingHeight > 9) {
    addSpecialty(SPECIALTY_CONFIG[2]); // SCIE
  }

  // AVAC: has project or commercial > 500m²
  if (project.avac?.hasHVACProject || (project.buildingType === "commercial" && project.grossFloorArea > 500)) {
    addSpecialty(SPECIALTY_CONFIG[3]); // AVAC
  }

  // Water and drainage: has public connection
  if (project.waterDrainage?.hasPublicWaterConnection !== false) {
    addSpecialty(SPECIALTY_CONFIG[4]); // AGD
  }

  // Gas: has installation
  if (project.gas?.hasGasInstallation) {
    addSpecialty(SPECIALTY_CONFIG[5]); // GAS
  }

  // Electrical: always required
  addSpecialty(SPECIALTY_CONFIG[6]); // ELE

  // ITED/ITUR: always required
  addSpecialty(SPECIALTY_CONFIG[7]); // ITED

  // Thermal (SCE): always required for new or major rehab
  if (!project.isRehabilitation || project.isMajorRehabilitation) {
    addSpecialty(SPECIALTY_CONFIG[8]); // SCE
  }

  // Acoustic: mixed-use or multi-family
  const arch = project.architecture as Record<string, unknown>;
  if (project.buildingType === "mixed" || arch.isMultifamily === true || (project.numberOfDwellings ?? 0) > 1) {
    addSpecialty(SPECIALTY_CONFIG[9]); // ACUS
  }

  // Elevators
  if (project.elevators?.hasElevator) {
    addSpecialty(SPECIALTY_CONFIG[10]); // ASC
  }

  return specialties;
}

/**
 * Determine which external entity consultations are required.
 */
export function getRequiredConsultations(
  project: BuildingProject,
  specialties: SpecialtyProject[],
): ExternalConsultation[] {
  const consultations: ExternalConsultation[] = [];
  const addedEntities = new Set<string>();
  let idx = 0;

  const addConsultation = (key: string) => {
    if (addedEntities.has(key)) return;
    addedEntities.add(key);
    const config = CONSULTATION_CONFIG[key];
    if (config) {
      consultations.push({ id: `EC-${String(++idx).padStart(2, "0")}`, ...config });
    }
  };

  for (const sp of specialties) {
    switch (sp.abbreviation) {
      case "SCIE": addConsultation("ANPC"); break;
      case "AVAC":
      case "GAS":
      case "ELE": addConsultation("DGEG"); break;
      case "ITED": addConsultation("ANACOM"); break;
      case "SCE": addConsultation("ADENE"); break;
    }
  }

  // Heritage
  const arch = project.architecture as Record<string, unknown>;
  if (arch.isClassifiedBuilding === true || arch.isHeritageZone === true) {
    addConsultation("DGPC");
  }

  return consultations;
}

// ============================================================
// Task Generation
// ============================================================

/**
 * Generate licensing phase schedule tasks for a project.
 */
export function generateLicensingPhases(
  project: BuildingProject,
  _findings?: Finding[],
  options?: LicensingPhasesOptions,
): LicensingPhasesResult {
  const opts = options ?? {};
  const includePost = opts.includePostConstruction ?? true;
  let uid = opts.startingUid ?? 8000;
  const today = new Date();
  today.setHours(8, 0, 0, 0);

  const pathway = determineLicensingPathway(project);
  const preConstructionTasks: ScheduleTask[] = [];
  const postConstructionTasks: ScheduleTask[] = [];

  // ─── Exempt pathway: minimal tasks ────────────────────────
  if (pathway.pathway === "exempt" || pathway.pathway === "public_entity_exempt") {
    const tasks = generateExemptTasks(pathway, today, uid);
    uid = tasks.nextUid;
    preConstructionTasks.push(...tasks.tasks);
  }
  // ─── Comunicação prévia: no external consultations ────────
  else if (pathway.pathway === "comunicacao_previa") {
    const tasks = generateComunicacaoPreviaTasks(pathway, today, uid);
    uid = tasks.nextUid;
    preConstructionTasks.push(...tasks.tasks);
  }
  // ─── Full licensing ───────────────────────────────────────
  else {
    const tasks = generateLicenciamentoTasks(pathway, today, uid);
    uid = tasks.nextUid;
    preConstructionTasks.push(...tasks.tasks);
  }

  // ─── Post-construction tasks ──────────────────────────────
  if (includePost && pathway.pathway !== "public_entity_exempt") {
    // Rehabilitation under DL 10/2024 skips autorização de utilização
    const skipUtilization = project.isRehabilitation;
    if (!skipUtilization) {
      const postTasks = generatePostConstructionTasks(uid, today);
      uid = postTasks.nextUid;
      postConstructionTasks.push(...postTasks.tasks);
    }
  }

  const allTasks = [...preConstructionTasks, ...postConstructionTasks];

  // Calculate summary
  const preDays = calculateBlockDuration(preConstructionTasks);
  const postDays = calculateBlockDuration(postConstructionTasks);
  const criticalEntity = findCriticalPathEntity(pathway);

  return {
    pathway,
    preConstructionTasks,
    postConstructionTasks,
    allTasks,
    summary: {
      totalPreConstructionDays: preDays,
      totalPostConstructionDays: postDays,
      criticalPathEntity: criticalEntity,
      requiredSpecialties: pathway.requiredSpecialties.length,
      requiredConsultations: pathway.requiredConsultations.length,
    },
  };
}

// ============================================================
// Task Generators by Pathway
// ============================================================

function generateExemptTasks(
  pathway: LicensingPathwayResult,
  startDate: Date,
  startUid: number,
): { tasks: ScheduleTask[]; nextUid: number } {
  const tasks: ScheduleTask[] = [];
  let uid = startUid;

  const notificationDays = calendarToWorkingDays(pathway.baseApprovalDays || 5);
  const notificationFinish = addWorkingDays(startDate, notificationDays);

  // Summary task
  uid++;
  const summaryUid = uid;
  tasks.push(createTask({
    uid,
    wbs: "LIC.00.00",
    name: "Fase de Licenciamento (Isento)",
    phase: "licensing_preparation",
    durationDays: notificationDays + 1,
    startDate,
    finishDate: addWorkingDays(notificationFinish, 1),
    isSummary: true,
    outlineLevel: 1,
    notes: pathway.legalBasis,
  }));

  // Notification
  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.01.01",
    name: "Notificação ao município (5 dias antes do início)",
    phase: "licensing_preparation",
    durationDays: notificationDays,
    startDate,
    finishDate: notificationFinish,
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: summaryUid, type: "SS" }],
    resources: [{ name: LICENSING_ROLES.admin.name, type: "labor", units: 1, rate: LICENSING_ROLES.admin.rate, hours: 4 }],
    notes: "DL 10/2024 Art. 6.º — notificação obrigatória antes do início de obras isentas",
  }));

  // Tax receipt
  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.05.01",
    name: "Pagamento de taxas / recibo",
    phase: "construction_authorization",
    durationDays: 1,
    startDate: notificationFinish,
    finishDate: addWorkingDays(notificationFinish, 1),
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: uid - 1, type: "FS" }],
    resources: [{ name: LICENSING_ROLES.admin.name, type: "labor", units: 1, rate: LICENSING_ROLES.admin.rate, hours: 2 }],
    notes: "DL 10/2024 Art. 74.º — recibo substitui alvará",
  }));

  return { tasks, nextUid: uid };
}

function generateComunicacaoPreviaTasks(
  pathway: LicensingPathwayResult,
  startDate: Date,
  startUid: number,
): { tasks: ScheduleTask[]; nextUid: number } {
  const tasks: ScheduleTask[] = [];
  let uid = startUid;

  // Phase 1: Document preparation
  const { tasks: prepTasks, nextUid: prepNextUid, summaryUid: prepSummaryUid, finishDate: prepFinish } =
    generatePreparationBlock(startDate, uid);
  tasks.push(...prepTasks);
  uid = prepNextUid;

  // Phase 2: Specialty projects (parallel, SS from preparation)
  const { tasks: specTasks, nextUid: specNextUid, summaryUid: specSummaryUid, finishDate: specFinish } =
    generateSpecialtyBlock(pathway.requiredSpecialties, startDate, uid, prepSummaryUid);
  tasks.push(...specTasks);
  uid = specNextUid;

  // Phase 4: Approval period (20 days comunicação prévia)
  const approvalStartDate = specFinish > prepFinish ? specFinish : prepFinish;
  const approvalWorkingDays = calendarToWorkingDays(pathway.baseApprovalDays);
  const approvalFinish = addWorkingDays(approvalStartDate, approvalWorkingDays);

  uid++;
  const approvalSummaryUid = uid;
  tasks.push(createTask({
    uid,
    wbs: "LIC.04.00",
    name: "Comunicação Prévia — Período de Rejeição",
    phase: "licensing_approval",
    durationDays: approvalWorkingDays,
    startDate: approvalStartDate,
    finishDate: approvalFinish,
    isSummary: true,
    outlineLevel: 1,
    predecessors: [
      { uid: prepSummaryUid, type: "FS" },
      ...(specSummaryUid ? [{ uid: specSummaryUid, type: "FS" as const }] : []),
    ],
    notes: pathway.legalBasis,
  }));

  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.04.01",
    name: `Período de decisão (${pathway.baseApprovalDays} dias corridos)`,
    phase: "licensing_approval",
    durationDays: approvalWorkingDays,
    startDate: approvalStartDate,
    finishDate: approvalFinish,
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: approvalSummaryUid, type: "SS" }],
    notes: `DL 10/2024 Art. 4.º — comunicação prévia: ${pathway.baseApprovalDays} dias corridos para rejeição`,
  }));

  // Phase 5: Tax receipt / title
  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.05.01",
    name: "Pagamento de taxas / recibo (título de operação)",
    phase: "construction_authorization",
    durationDays: 1,
    startDate: approvalFinish,
    finishDate: addWorkingDays(approvalFinish, 1),
    isSummary: false,
    outlineLevel: 1,
    predecessors: [{ uid: approvalSummaryUid, type: "FS" }],
    resources: [{ name: LICENSING_ROLES.admin.name, type: "labor", units: 1, rate: LICENSING_ROLES.admin.rate, hours: 2 }],
    notes: "DL 10/2024 Art. 74.º — recibo substitui alvará",
  }));

  // Insert top-level summary
  const allFinish = addWorkingDays(approvalFinish, 1);
  const totalDays = calculateWorkingDaysBetween(startDate, allFinish);
  tasks.unshift(createTask({
    uid: startUid,
    wbs: "LIC.00.00",
    name: "Fase de Licenciamento (Comunicação Prévia)",
    phase: "licensing_preparation",
    durationDays: totalDays,
    startDate,
    finishDate: allFinish,
    isSummary: true,
    outlineLevel: 0,
    notes: pathway.legalBasis,
  }));

  return { tasks, nextUid: uid };
}

function generateLicenciamentoTasks(
  pathway: LicensingPathwayResult,
  startDate: Date,
  startUid: number,
): { tasks: ScheduleTask[]; nextUid: number } {
  const tasks: ScheduleTask[] = [];
  let uid = startUid;

  // Phase 1: Document preparation
  const { tasks: prepTasks, nextUid: prepNextUid, summaryUid: prepSummaryUid, finishDate: prepFinish } =
    generatePreparationBlock(startDate, uid);
  tasks.push(...prepTasks);
  uid = prepNextUid;

  // Phase 2: Specialty projects (parallel, SS from preparation)
  const { tasks: specTasks, nextUid: specNextUid, summaryUid: specSummaryUid, finishDate: specFinish } =
    generateSpecialtyBlock(pathway.requiredSpecialties, startDate, uid, prepSummaryUid);
  tasks.push(...specTasks);
  uid = specNextUid;

  // Phase 3: External consultations (parallel, FS from specialties)
  let consultFinish = specFinish;
  let consultSummaryUid: number | undefined;
  if (pathway.requiredConsultations.length > 0) {
    const { tasks: consTasks, nextUid: consNextUid, summaryUid, finishDate } =
      generateConsultationBlock(pathway.requiredConsultations, specFinish, uid, specSummaryUid);
    tasks.push(...consTasks);
    uid = consNextUid;
    consultFinish = finishDate;
    consultSummaryUid = summaryUid;
  }

  // Phase 4: Municipal approval
  const approvalStartDate = consultFinish;
  const approvalWorkingDays = calendarToWorkingDays(pathway.baseApprovalDays);
  const approvalFinish = addWorkingDays(approvalStartDate, approvalWorkingDays);

  uid++;
  const approvalSummaryUid = uid;
  const predecessors: { uid: number; type: "FS" | "SS" }[] = [];
  if (consultSummaryUid) {
    predecessors.push({ uid: consultSummaryUid, type: "FS" });
  } else if (specSummaryUid) {
    predecessors.push({ uid: specSummaryUid, type: "FS" });
  } else {
    predecessors.push({ uid: prepSummaryUid, type: "FS" });
  }

  tasks.push(createTask({
    uid,
    wbs: "LIC.04.00",
    name: "Aprovação Municipal",
    phase: "licensing_approval",
    durationDays: approvalWorkingDays,
    startDate: approvalStartDate,
    finishDate: approvalFinish,
    isSummary: true,
    outlineLevel: 1,
    predecessors,
    notes: pathway.legalBasis,
  }));

  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.04.01",
    name: `Período de decisão municipal (${pathway.baseApprovalDays} dias corridos)`,
    phase: "licensing_approval",
    durationDays: approvalWorkingDays,
    startDate: approvalStartDate,
    finishDate: approvalFinish,
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: approvalSummaryUid, type: "SS" }],
    notes: `DL 10/2024 — prazo de decisão: ${pathway.baseApprovalDays} dias corridos. Deferimento tácito se excedido.`,
  }));

  // Phase 5: Tax receipt / title
  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.05.01",
    name: "Pagamento de taxas / recibo (título de operação)",
    phase: "construction_authorization",
    durationDays: 1,
    startDate: approvalFinish,
    finishDate: addWorkingDays(approvalFinish, 1),
    isSummary: false,
    outlineLevel: 1,
    predecessors: [{ uid: approvalSummaryUid, type: "FS" }],
    resources: [{ name: LICENSING_ROLES.admin.name, type: "labor", units: 1, rate: LICENSING_ROLES.admin.rate, hours: 2 }],
    notes: "DL 10/2024 Art. 74.º — recibo substitui alvará como título de operação",
  }));

  // Insert top-level summary
  const allFinish = addWorkingDays(approvalFinish, 1);
  const totalDays = calculateWorkingDaysBetween(startDate, allFinish);
  tasks.unshift(createTask({
    uid: startUid,
    wbs: "LIC.00.00",
    name: `Fase de Licenciamento (${pathway.baseApprovalDays === 45 ? "Loteamento" : "Construção"})`,
    phase: "licensing_preparation",
    durationDays: totalDays,
    startDate,
    finishDate: allFinish,
    isSummary: true,
    outlineLevel: 0,
    notes: pathway.legalBasis,
  }));

  return { tasks, nextUid: uid };
}

// ============================================================
// Block Generators (Reusable)
// ============================================================

function generatePreparationBlock(
  startDate: Date,
  startUid: number,
): { tasks: ScheduleTask[]; nextUid: number; summaryUid: number; finishDate: Date } {
  const tasks: ScheduleTask[] = [];
  let uid = startUid;

  // Preparation tasks are sequential
  const compilationDays = 5;
  const termsDays = 2;
  const submissionDays = 1;
  const totalDays = compilationDays + termsDays + submissionDays;
  const blockFinish = addWorkingDays(startDate, totalDays);

  uid++;
  const summaryUid = uid;
  tasks.push(createTask({
    uid,
    wbs: "LIC.01.00",
    name: LICENSING_PHASE_NAMES.licensing_preparation,
    phase: "licensing_preparation",
    durationDays: totalDays,
    startDate,
    finishDate: blockFinish,
    isSummary: true,
    outlineLevel: 1,
  }));

  // Compilation
  uid++;
  const compilationFinish = addWorkingDays(startDate, compilationDays);
  tasks.push(createTask({
    uid,
    wbs: "LIC.01.01",
    name: "Compilação do projeto de arquitetura",
    phase: "licensing_preparation",
    durationDays: compilationDays,
    startDate,
    finishDate: compilationFinish,
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: summaryUid, type: "SS" }],
    resources: [{ name: LICENSING_ROLES.coordinator.name, type: "labor", units: 1, rate: LICENSING_ROLES.coordinator.rate, hours: compilationDays * HOURS_PER_DAY }],
  }));

  // Terms of responsibility
  uid++;
  const termsFinish = addWorkingDays(compilationFinish, termsDays);
  tasks.push(createTask({
    uid,
    wbs: "LIC.01.02",
    name: "Termos de responsabilidade dos técnicos autores",
    phase: "licensing_preparation",
    durationDays: termsDays,
    startDate: compilationFinish,
    finishDate: termsFinish,
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: uid - 1, type: "FS" }],
    resources: [{ name: LICENSING_ROLES.admin.name, type: "labor", units: 1, rate: LICENSING_ROLES.admin.rate, hours: termsDays * HOURS_PER_DAY }],
  }));

  // Digital submission
  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.01.03",
    name: "Submissão na plataforma eletrónica",
    phase: "licensing_preparation",
    durationDays: submissionDays,
    startDate: termsFinish,
    finishDate: blockFinish,
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: uid - 1, type: "FS" }],
    resources: [{ name: LICENSING_ROLES.admin.name, type: "labor", units: 1, rate: LICENSING_ROLES.admin.rate, hours: 4 }],
    notes: "DL 10/2024 — plataforma eletrónica obrigatória desde 05/01/2026",
  }));

  return { tasks, nextUid: uid, summaryUid, finishDate: blockFinish };
}

function generateSpecialtyBlock(
  specialties: SpecialtyProject[],
  projectStartDate: Date,
  startUid: number,
  prepSummaryUid: number,
): { tasks: ScheduleTask[]; nextUid: number; summaryUid: number | undefined; finishDate: Date } {
  if (specialties.length === 0) {
    return { tasks: [], nextUid: startUid, summaryUid: undefined, finishDate: projectStartDate };
  }

  const tasks: ScheduleTask[] = [];
  let uid = startUid;

  // Specialties run in parallel, starting with SS from preparation
  const longestDays = Math.max(...specialties.map(s => s.preparationDays));
  const blockFinish = addWorkingDays(projectStartDate, longestDays);

  uid++;
  const summaryUid = uid;
  tasks.push(createTask({
    uid,
    wbs: "LIC.02.00",
    name: LICENSING_PHASE_NAMES.specialty_projects,
    phase: "specialty_projects",
    durationDays: longestDays,
    startDate: projectStartDate,
    finishDate: blockFinish,
    isSummary: true,
    outlineLevel: 1,
    predecessors: [{ uid: prepSummaryUid, type: "SS" }],
  }));

  for (let i = 0; i < specialties.length; i++) {
    const sp = specialties[i];
    uid++;
    const spFinish = addWorkingDays(projectStartDate, sp.preparationDays);
    tasks.push(createTask({
      uid,
      wbs: `LIC.02.${String(i + 1).padStart(2, "0")}`,
      name: `${sp.name} (${sp.abbreviation})`,
      phase: "specialty_projects",
      durationDays: sp.preparationDays,
      startDate: projectStartDate,
      finishDate: spFinish,
      isSummary: false,
      outlineLevel: 2,
      predecessors: [{ uid: summaryUid, type: "SS" }],
      resources: [{ name: LICENSING_ROLES.engineer.name, type: "labor", units: 1, rate: LICENSING_ROLES.engineer.rate, hours: sp.preparationDays * HOURS_PER_DAY }],
      notes: sp.entity ? `Entidade: ${sp.entity}` : undefined,
    }));
  }

  return { tasks, nextUid: uid, summaryUid, finishDate: blockFinish };
}

function generateConsultationBlock(
  consultations: ExternalConsultation[],
  startDate: Date,
  startUid: number,
  specSummaryUid: number | undefined,
): { tasks: ScheduleTask[]; nextUid: number; summaryUid: number; finishDate: Date } {
  const tasks: ScheduleTask[] = [];
  let uid = startUid;

  // Consultations run in parallel — longest determines block duration
  const longestDays = Math.max(...consultations.map(c => calendarToWorkingDays(c.responseDays)));
  const blockFinish = addWorkingDays(startDate, longestDays);

  uid++;
  const summaryUid = uid;
  const predecessors: { uid: number; type: "FS" | "SS" }[] = [];
  if (specSummaryUid) predecessors.push({ uid: specSummaryUid, type: "FS" });

  tasks.push(createTask({
    uid,
    wbs: "LIC.03.00",
    name: LICENSING_PHASE_NAMES.external_consultations,
    phase: "external_consultations",
    durationDays: longestDays,
    startDate,
    finishDate: blockFinish,
    isSummary: true,
    outlineLevel: 1,
    predecessors,
  }));

  for (let i = 0; i < consultations.length; i++) {
    const ec = consultations[i];
    const ecWorkingDays = calendarToWorkingDays(ec.responseDays);
    uid++;
    const ecFinish = addWorkingDays(startDate, ecWorkingDays);
    tasks.push(createTask({
      uid,
      wbs: `LIC.03.${String(i + 1).padStart(2, "0")}`,
      name: `Consulta ${ec.entityAbbreviation} — ${ec.entityName}`,
      phase: "external_consultations",
      durationDays: ecWorkingDays,
      startDate,
      finishDate: ecFinish,
      isSummary: false,
      outlineLevel: 2,
      predecessors: [{ uid: summaryUid, type: "SS" }],
      notes: `Prazo legal: ${ec.responseDays} dias corridos${ec.suspendsClock ? " (suspende prazo de licenciamento)" : ""}`,
    }));
  }

  return { tasks, nextUid: uid, summaryUid, finishDate: blockFinish };
}

function generatePostConstructionTasks(
  startUid: number,
  _referenceDate: Date,
): { tasks: ScheduleTask[]; nextUid: number } {
  const tasks: ScheduleTask[] = [];
  let uid = startUid;

  // Post-construction dates are placeholders — they attach after cleanup
  const placeholder = new Date();
  placeholder.setHours(8, 0, 0, 0);

  const vistoriaDays = 10;
  const certificadosDays = 5;
  const fichaDays = 3;
  const autorizacaoDays = calendarToWorkingDays(15);
  const totalDays = vistoriaDays + autorizacaoDays; // parallel certs + ficha during vistoria

  uid++;
  const summaryUid = uid;
  tasks.push(createTask({
    uid,
    wbs: "LIC.90.00",
    name: LICENSING_PHASE_NAMES.utilization_authorization,
    phase: "utilization_authorization",
    durationDays: totalDays,
    startDate: placeholder,
    finishDate: addWorkingDays(placeholder, totalDays),
    isSummary: true,
    outlineLevel: 1,
    notes: "Fases pós-construção — datas ajustadas ao fim da obra",
  }));

  // Vistorias finais
  uid++;
  const vistoriaUid = uid;
  tasks.push(createTask({
    uid,
    wbs: "LIC.90.01",
    name: "Vistorias finais",
    phase: "utilization_authorization",
    durationDays: vistoriaDays,
    startDate: placeholder,
    finishDate: addWorkingDays(placeholder, vistoriaDays),
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: summaryUid, type: "SS" }],
    resources: [{ name: LICENSING_ROLES.coordinator.name, type: "labor", units: 1, rate: LICENSING_ROLES.coordinator.rate, hours: vistoriaDays * 4 }],
  }));

  // Certificados (parallel with vistoria)
  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.90.02",
    name: "Certificados de especialidades (ITED, gás, eletricidade, etc.)",
    phase: "utilization_authorization",
    durationDays: certificadosDays,
    startDate: placeholder,
    finishDate: addWorkingDays(placeholder, certificadosDays),
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: summaryUid, type: "SS" }],
    resources: [{ name: LICENSING_ROLES.engineer.name, type: "labor", units: 1, rate: LICENSING_ROLES.engineer.rate, hours: certificadosDays * HOURS_PER_DAY }],
  }));

  // Ficha técnica da habitação
  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.90.03",
    name: "Ficha técnica da habitação (Portaria 216-B/2008)",
    phase: "utilization_authorization",
    durationDays: fichaDays,
    startDate: placeholder,
    finishDate: addWorkingDays(placeholder, fichaDays),
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: summaryUid, type: "SS" }],
    resources: [{ name: LICENSING_ROLES.coordinator.name, type: "labor", units: 1, rate: LICENSING_ROLES.coordinator.rate, hours: fichaDays * HOURS_PER_DAY }],
  }));

  // Autorização de utilização
  uid++;
  tasks.push(createTask({
    uid,
    wbs: "LIC.90.04",
    name: "Autorização de utilização",
    phase: "utilization_authorization",
    durationDays: autorizacaoDays,
    startDate: addWorkingDays(placeholder, vistoriaDays),
    finishDate: addWorkingDays(placeholder, totalDays),
    isSummary: false,
    outlineLevel: 2,
    predecessors: [{ uid: vistoriaUid, type: "FS" }],
    notes: "DL 10/2024 — autorização de utilização após vistorias finais",
  }));

  return { tasks, nextUid: uid };
}

// ============================================================
// Schedule Merge
// ============================================================

/**
 * Merge licensing phase tasks into an existing construction schedule.
 * Prepends pre-construction tasks before site_setup and appends
 * post-construction tasks after cleanup.
 */
export function mergeScheduleWithLicensing(
  schedule: ProjectSchedule,
  licensingResult: LicensingPhasesResult,
): ProjectSchedule {
  const merged = { ...schedule };
  const mergedTasks = [...schedule.tasks];

  // Find site_setup summary and cleanup summary UIDs
  const siteSetupTask = mergedTasks.find(t => t.isSummary && t.phase === "site_setup");
  const cleanupTask = mergedTasks.find(t => t.isSummary && t.phase === "cleanup");

  // Prepend pre-construction tasks
  if (licensingResult.preConstructionTasks.length > 0) {
    mergedTasks.unshift(...licensingResult.preConstructionTasks);

    // Link last pre-construction task to site_setup
    if (siteSetupTask) {
      const lastPreTask = licensingResult.preConstructionTasks[licensingResult.preConstructionTasks.length - 1];
      siteSetupTask.predecessors.push({ uid: lastPreTask.uid, type: "FS" });
    }

    // Update schedule start date
    const firstTask = licensingResult.preConstructionTasks[0];
    merged.startDate = firstTask.startDate;
  }

  // Append post-construction tasks
  if (licensingResult.postConstructionTasks.length > 0) {
    // Link first post-construction task to cleanup
    if (cleanupTask) {
      const postSummary = licensingResult.postConstructionTasks[0];
      postSummary.predecessors.push({ uid: cleanupTask.uid, type: "FS" });

      // Reschedule post-construction dates relative to cleanup finish
      const cleanupFinish = parseDate(cleanupTask.finishDate);
      rescheduleBlock(licensingResult.postConstructionTasks, cleanupFinish);
    }

    mergedTasks.push(...licensingResult.postConstructionTasks);

    // Update schedule finish date
    const lastPost = licensingResult.postConstructionTasks[licensingResult.postConstructionTasks.length - 1];
    merged.finishDate = lastPost.finishDate;
  }

  merged.tasks = mergedTasks;

  // Recalculate total duration
  const start = parseDate(merged.startDate);
  const finish = parseDate(merged.finishDate);
  merged.totalDurationDays = Math.ceil((finish.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  return merged;
}

// ============================================================
// Helpers
// ============================================================

function createTask(params: {
  uid: number;
  wbs: string;
  name: string;
  phase: ConstructionPhase;
  durationDays: number;
  startDate: Date;
  finishDate: Date;
  isSummary: boolean;
  outlineLevel: number;
  predecessors?: { uid: number; type: "FS" | "SS" | "FF" | "SF"; lag?: number }[];
  resources?: TaskResource[];
  notes?: string;
}): ScheduleTask {
  return {
    uid: params.uid,
    wbs: params.wbs,
    name: params.name,
    durationDays: params.durationDays,
    durationHours: params.durationDays * HOURS_PER_DAY,
    startDate: toISODate(params.startDate),
    finishDate: toISODate(params.finishDate),
    predecessors: params.predecessors ?? [],
    isSummary: params.isSummary,
    phase: params.phase,
    resources: params.resources ?? [],
    cost: 0,
    materialCost: 0,
    outlineLevel: params.outlineLevel,
    percentComplete: 0,
    notes: params.notes,
  };
}

function calculateBlockDuration(tasks: ScheduleTask[]): number {
  if (tasks.length === 0) return 0;
  const starts = tasks.map(t => parseDate(t.startDate).getTime());
  const finishes = tasks.map(t => parseDate(t.finishDate).getTime());
  const earliest = Math.min(...starts);
  const latest = Math.max(...finishes);
  return Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24));
}

function calculateWorkingDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return Math.max(1, count);
}

function findCriticalPathEntity(pathway: LicensingPathwayResult): string {
  if (pathway.requiredConsultations.length === 0) return "Câmara Municipal";
  // The entity with the longest response time is the critical path
  let longest = pathway.requiredConsultations[0];
  for (const ec of pathway.requiredConsultations) {
    if (ec.responseDays > longest.responseDays) longest = ec;
  }
  return longest.entityAbbreviation;
}

function rescheduleBlock(tasks: ScheduleTask[], newStartDate: Date): void {
  if (tasks.length === 0) return;

  // Calculate offset from first task's original start
  const firstStart = parseDate(tasks[0].startDate);
  const offsetMs = newStartDate.getTime() - firstStart.getTime();

  for (const task of tasks) {
    const origStart = parseDate(task.startDate);
    const origFinish = parseDate(task.finishDate);
    const newStart = new Date(origStart.getTime() + offsetMs);
    const newFinish = new Date(origFinish.getTime() + offsetMs);
    task.startDate = toISODate(newStart);
    task.finishDate = toISODate(newFinish);
  }
}

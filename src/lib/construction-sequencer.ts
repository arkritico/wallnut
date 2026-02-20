/**
 * Construction Sequencer & Resource Optimizer
 *
 * Sequences WBS articles into the optimal Portuguese construction order,
 * assigns resources (labor, material, machinery), calculates durations
 * based on productivity rates, and optimizes for a team of ≤10 workers.
 *
 * Uses typical Portuguese construction methodology:
 *   1. Site setup → Earthworks → Foundations → Structure
 *   2. Envelope (walls, roof, waterproofing, windows)
 *   3. Rough-in MEP (plumbing, electrical, HVAC, gas, telecom)
 *   4. Finishes (internal, flooring, ceilings, painting)
 *   5. Final (elevators, testing, cleanup)
 */

import type {
  WbsProject,
  WbsChapter,
  WbsArticle,
  ConstructionPhase,
  ScheduleTask,
  TaskResource,
  ProjectSchedule,
  ProjectResource,
  CriticalChainData,
  CriticalChainBuffer,
} from "./wbs-types";
import { chapterToPhase, PRONIC_CHAPTERS } from "./wbs-types";
import type { PriceMatch } from "./wbs-types";
import { PHASE_OVERLAP_RULES } from "./phase-constraints";

// ============================================================
// Construction Phase Ordering & Dependencies
// ============================================================

/** Canonical construction sequence. Index = execution order. */
export const PHASE_ORDER: ConstructionPhase[] = [
  "site_setup",
  "demolition",
  "earthworks",
  "foundations",
  "structure",
  "external_walls",
  "roof",
  "waterproofing",
  "external_frames",
  "rough_in_plumbing",
  "rough_in_electrical",
  "rough_in_gas",
  "rough_in_telecom",
  "rough_in_hvac",
  "internal_walls",
  "insulation",
  "external_finishes",
  "internal_finishes",
  "flooring",
  "ceilings",
  "carpentry",
  "plumbing_fixtures",
  "electrical_fixtures",
  "painting",
  "metalwork",
  "fire_safety",
  "elevators",
  "external_works",
  "testing",
  "cleanup",
];

/**
 * Phase dependencies: each phase requires certain predecessors to be complete.
 * Not all predecessors are strict FS (Finish-to-Start); some phases can overlap.
 */
const PHASE_DEPS: Record<ConstructionPhase, { phase: ConstructionPhase; type: "FS" | "SS"; lag?: number }[]> = {
  site_setup: [],
  demolition: [{ phase: "site_setup", type: "FS" }],
  earthworks: [{ phase: "site_setup", type: "FS" }, { phase: "demolition", type: "FS" }],
  foundations: [{ phase: "earthworks", type: "FS" }],
  structure: [{ phase: "foundations", type: "FS" }],
  external_walls: [{ phase: "structure", type: "FS" }],
  roof: [{ phase: "structure", type: "FS" }],
  waterproofing: [{ phase: "roof", type: "SS", lag: 2 }],
  external_frames: [{ phase: "external_walls", type: "FS" }],
  rough_in_plumbing: [{ phase: "external_walls", type: "SS", lag: 5 }],
  rough_in_electrical: [{ phase: "external_walls", type: "SS", lag: 5 }],
  rough_in_gas: [{ phase: "external_walls", type: "SS", lag: 7 }],
  rough_in_telecom: [{ phase: "rough_in_electrical", type: "SS", lag: 3 }],
  rough_in_hvac: [{ phase: "external_walls", type: "SS", lag: 5 }],
  internal_walls: [{ phase: "external_walls", type: "FS" }, { phase: "rough_in_plumbing", type: "SS", lag: 3 }],
  insulation: [{ phase: "external_walls", type: "FS" }, { phase: "roof", type: "FS" }],
  external_finishes: [{ phase: "insulation", type: "FS" }, { phase: "waterproofing", type: "FS" }],
  internal_finishes: [{ phase: "internal_walls", type: "FS" }, { phase: "rough_in_electrical", type: "FS" }],
  flooring: [{ phase: "internal_finishes", type: "SS", lag: 5 }],
  ceilings: [{ phase: "rough_in_electrical", type: "FS" }, { phase: "rough_in_hvac", type: "FS" }],
  carpentry: [{ phase: "internal_finishes", type: "FS" }],
  plumbing_fixtures: [{ phase: "internal_finishes", type: "FS" }, { phase: "flooring", type: "SS", lag: 3 }],
  electrical_fixtures: [{ phase: "internal_finishes", type: "FS" }, { phase: "ceilings", type: "FS" }],
  painting: [{ phase: "carpentry", type: "FS" }, { phase: "internal_finishes", type: "FS" }],
  metalwork: [{ phase: "structure", type: "FS" }, { phase: "external_walls", type: "FS" }],
  fire_safety: [{ phase: "rough_in_electrical", type: "FS" }, { phase: "ceilings", type: "FS" }],
  elevators: [{ phase: "structure", type: "FS" }],
  external_works: [{ phase: "external_finishes", type: "SS", lag: 5 }],
  testing: [{ phase: "electrical_fixtures", type: "FS" }, { phase: "plumbing_fixtures", type: "FS" }, { phase: "fire_safety", type: "FS" }],
  cleanup: [{ phase: "testing", type: "FS" }, { phase: "painting", type: "FS" }, { phase: "external_works", type: "FS" }],
  // Licensing phases (managed by licensing-phases.ts, not the construction sequencer)
  licensing_preparation: [],
  specialty_projects: [],
  external_consultations: [],
  licensing_approval: [],
  construction_authorization: [],
  utilization_authorization: [],
};

/** Phase display names (Portuguese) */
const PHASE_NAMES: Record<ConstructionPhase, string> = {
  site_setup: "Estaleiro e Trabalhos Preparatórios",
  demolition: "Demolições",
  earthworks: "Movimento de Terras",
  foundations: "Fundações",
  structure: "Estrutura",
  external_walls: "Alvenarias Exteriores",
  roof: "Cobertura",
  waterproofing: "Impermeabilizações",
  external_frames: "Caixilharias Exteriores",
  rough_in_plumbing: "Redes de Águas e Drenagem (1ª fase)",
  rough_in_electrical: "Instalações Elétricas (1ª fase)",
  rough_in_hvac: "AVAC e Ventilação (1ª fase)",
  rough_in_gas: "Instalação de Gás",
  rough_in_telecom: "ITED / ITUR",
  internal_walls: "Alvenarias Interiores",
  insulation: "Isolamentos",
  external_finishes: "Revestimentos Exteriores",
  internal_finishes: "Revestimentos Interiores",
  flooring: "Pavimentos",
  ceilings: "Tetos Falsos",
  carpentry: "Carpintarias",
  plumbing_fixtures: "Loiças Sanitárias e Torneiras",
  electrical_fixtures: "Aparelhagem Elétrica e Quadros",
  painting: "Pinturas",
  metalwork: "Serralharias",
  fire_safety: "Segurança Contra Incêndio",
  elevators: "Ascensores",
  external_works: "Arranjos Exteriores",
  testing: "Ensaios e Certificações",
  cleanup: "Limpeza Final e Entrega",
  // Licensing phases (managed by licensing-phases.ts)
  licensing_preparation: "Preparação Documental",
  specialty_projects: "Projetos de Especialidades",
  external_consultations: "Consultas a Entidades Externas",
  licensing_approval: "Aprovação Municipal",
  construction_authorization: "Título de Operação Urbanística",
  utilization_authorization: "Autorização de Utilização",
};

// ============================================================
// Labor Productivity Rates
// ============================================================

/**
 * Productivity rates: man-hours per unit of work.
 * Based on typical Portuguese market data.
 */
const PRODUCTIVITY: Record<string, number> = {
  // Earthworks (m³)
  "MTT010": 0.3, "MTT020": 0.8, "MTR010": 0.5,
  // Foundations (m³)
  "FSS010": 6.0, "FSS020": 5.5, "FLE010": 3.0, "FPC010": 4.0,
  // Structure (m³ or m²)
  "SBP010": 10, "SBV010": 9, "SBL010": 2.5, "SBL020": 1.5, "SBE010": 5, "SBM010": 3,
  "SMA010": 0.08, // kg
  // Masonry (m²)
  "ABT010": 1.0, "ABT020": 0.8, "ABB010": 1.1,
  // Roofing (m²)
  "CTM010": 0.8, "CTP010": 1.2, "CTZ010": 0.5,
  // Waterproofing (m²)
  "IMP010": 0.4, "IMP020": 0.3,
  // External finishes (m²)
  "REE010": 0.8, "REP010": 1.5, "REP020": 2.0,
  "ZFF120": 0.9, "ZFF150": 1.0,
  // Internal finishes (m²)
  "RIE010": 0.5, "RIC010": 1.2, "RIG010": 0.8,
  // Flooring (m²)
  "PAC010": 1.0, "PAM010": 0.6, "PAV010": 0.5, "PAB010": 0.4,
  // Ceilings (m²)
  "TFG010": 0.7,
  // Windows (m²)
  "CXA010": 2.5, "CXP010": 2.2, "ZBL010": 3.0,
  // Doors (Ud)
  "PEX010": 4, "CPI010": 3,
  // Painting (m²)
  "PPI010": 0.25, "PPE010": 0.35, "PPT010": 0.3,
  // Plumbing (Ud)
  "IFA010": 40, "ISS010": 60, "ISV010": 0.8,
  "LSB010": 4, "LSC010": 3.5, "LSS010": 2.5, "LSL010": 2, "LCZ010": 5,
  // Electrical (Ud)
  "IEI015": 80, "IEP010": 8, "IEV010": 12,
  // Telecom (Ud)
  "ILA010": 16, "ILA020": 8,
  // Gas (Ud)
  "IGI010": 4,
  // HVAC (Ud)
  "IVC010": 24, "IVV010": 4,
  // Fire safety (Ud)
  "IOD010": 16, "IOD102": 1.5, "IOA010": 1.5, "IOX010": 0.5, "IOB010": 8,
  // Accessibility (m or Ud)
  "HAR010": 6, "SAE010": 120,
  // Acoustic (m² or ensaio)
  "NBB010": 1.0, "NBB020": 0.8, "XRA010": 16,
  // Testing
  "XEE010": 8, "XEC010": 4,
  // Other
  "EES010": 40, "EES020": 0.5,
  "DDA010": 0.6, "DDC010": 0.8, "DDP010": 0.7,
  "SMG010": 2.5, "CPA010": 8,
  "AEP010": 0.8, "AEM010": 2,
  "GRA010": 16,
};

/** Default productivity when not found (man-hours per unit) */
const DEFAULT_PRODUCTIVITY = 2.0;

// ============================================================
// Resource Definitions
// ============================================================

/** Standard Portuguese construction labor roles with hourly rates */
const LABOR_ROLES: Record<string, { name: string; rate: number; phases: ConstructionPhase[] }> = {
  pedreiro: {
    name: "Pedreiro", rate: 14,
    phases: ["foundations", "structure", "external_walls", "internal_walls", "external_finishes", "internal_finishes", "flooring"],
  },
  servente: {
    name: "Servente", rate: 10,
    phases: ["site_setup", "demolition", "earthworks", "foundations", "structure", "external_walls", "internal_walls", "cleanup"],
  },
  carpinteiro: {
    name: "Carpinteiro", rate: 15,
    phases: ["structure", "roof", "carpentry", "external_frames"],
  },
  canalizador: {
    name: "Canalizador", rate: 16,
    phases: ["rough_in_plumbing", "plumbing_fixtures", "rough_in_gas"],
  },
  eletricista: {
    name: "Eletricista", rate: 16,
    phases: ["rough_in_electrical", "electrical_fixtures", "rough_in_telecom", "fire_safety"],
  },
  serralheiro: {
    name: "Serralheiro", rate: 15,
    phases: ["metalwork", "external_frames"],
  },
  pintor: {
    name: "Pintor", rate: 13,
    phases: ["painting", "external_finishes"],
  },
  ladrilhador: {
    name: "Ladrilhador", rate: 15,
    phases: ["flooring", "internal_finishes"],
  },
  impermeabilizador: {
    name: "Impermeabilizador", rate: 15,
    phases: ["waterproofing", "insulation"],
  },
  tecnico_avac: {
    name: "Técnico AVAC", rate: 18,
    phases: ["rough_in_hvac"],
  },
};

/**
 * Get the primary labor role for a construction phase.
 */
function getPrimaryRole(phase: ConstructionPhase): { name: string; rate: number } {
  for (const role of Object.values(LABOR_ROLES)) {
    if (role.phases.includes(phase)) {
      return { name: role.name, rate: role.rate };
    }
  }
  return { name: "Operário", rate: 12 };
}

// ============================================================
// Portuguese Holiday Calendar
// ============================================================

/** Fixed Portuguese public holidays [month, day] (1-indexed). */
const FIXED_HOLIDAYS: [number, number][] = [
  [1, 1],   // Ano Novo
  [4, 25],  // Dia da Liberdade
  [5, 1],   // Dia do Trabalhador
  [6, 10],  // Dia de Portugal
  [6, 13],  // Santo António (Lisboa/Porto) — common construction halt
  [8, 15],  // Assunção de Nossa Senhora
  [10, 5],  // Implantação da República
  [11, 1],  // Todos os Santos
  [12, 1],  // Restauração da Independência
  [12, 8],  // Imaculada Conceição
  [12, 25], // Natal
];

/**
 * Compute Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 * Source: Meeus/Jones/Butcher algorithm (accurate for all Gregorian years).
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Format a Date as YYYY-MM-DD using local time (avoids UTC shift issues). */
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Cache of holiday sets per year for fast lookup. */
const holidayCache = new Map<number, Set<string>>();

function getHolidaysForYear(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const holidays = new Set<string>();

  // Fixed holidays
  for (const [month, day] of FIXED_HOLIDAYS) {
    holidays.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  // Easter-dependent holidays
  const easter = getEasterDate(year);
  // Sexta-feira Santa (Good Friday) = Easter - 2 days
  const goodFriday = new Date(easter);
  goodFriday.setDate(goodFriday.getDate() - 2);
  holidays.add(toLocalDateKey(goodFriday));

  // Corpo de Deus (Corpus Christi) = Easter + 60 days
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(corpusChristi.getDate() + 60);
  holidays.add(toLocalDateKey(corpusChristi));

  holidayCache.set(year, holidays);
  return holidays;
}

/**
 * Check if a date is a Portuguese public holiday.
 */
export function isPortugueseHoliday(date: Date): boolean {
  const key = toLocalDateKey(date);
  return getHolidaysForYear(date.getFullYear()).has(key);
}

/**
 * Check if a date is a working day (not weekend, not holiday).
 */
export function isWorkingDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !isPortugueseHoliday(date);
}

// ============================================================
// Date Utilities
// ============================================================

/**
 * Add working days to a start date, skipping weekends and Portuguese public holidays.
 */
export function addWorkingDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result)) added++;
  }
  return result;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function parseDate(s: string): Date {
  return new Date(s + "T08:00:00");
}

// ============================================================
// Core Sequencer
// ============================================================

interface ArticleWithMeta {
  article: WbsArticle;
  chapter: WbsChapter;
  phase: ConstructionPhase;
  priceMatch?: PriceMatch;
  manhours: number;
}

/** Phases where work is repeated floor-by-floor with overlapping starts */
const FLOOR_STAGGER_PHASES: ConstructionPhase[] = [
  "structure", "external_walls", "internal_walls", "flooring", "ceilings",
];
/** Working days between consecutive floors starting (concrete curing + safety) */
const FLOOR_STAGGER_LAG = 5;

/** Long-lead procurement items — zero-labor tasks starting at project start */
const PROCUREMENT_LEAD_TIMES: Partial<Record<ConstructionPhase, { name: string; days: number }>> = {
  structure:       { name: "Encomenda: Aço estrutural", days: 20 },
  external_frames: { name: "Encomenda: Caixilharias", days: 35 },
  elevators:       { name: "Encomenda: Elevadores", days: 75 },
  roof:            { name: "Encomenda: Cobertura", days: 15 },
  fire_safety:     { name: "Encomenda: Sistema incêndio", days: 25 },
  rough_in_hvac:   { name: "Encomenda: Equipamento AVAC", days: 30 },
};

/** Portuguese seasonal productivity multipliers (1.0 = normal). Index 0 = Jan. */
const PT_SEASONAL: number[] = [
  0.85, // Jan — rain/cold
  0.85, // Feb — rain/cold
  0.95, // Mar — improving
  1.0,  // Apr — normal
  1.0,  // May — normal
  1.0,  // Jun — normal
  1.0,  // Jul — normal
  0.7,  // Aug — férias coletivas
  1.0,  // Sep — normal
  1.0,  // Oct — normal
  0.9,  // Nov — rain starts
  0.85, // Dec — rain + holidays
];

export interface ScheduleOptions {
  maxWorkers?: number;
  /** Enable Goldratt Critical Chain Project Management */
  useCriticalChain?: boolean;
  /**
   * How much safety to strip from individual task estimates (0-1).
   * Goldratt recommends ~50% (0.5). Default: 0.5
   */
  safetyReduction?: number;
  /**
   * Project buffer sizing as ratio of total removed safety.
   * Standard CCPM uses 50% of cut. Default: 0.5
   */
  projectBufferRatio?: number;
  /**
   * Feeding buffer sizing as ratio of the feeding chain's removed safety.
   * Standard CCPM uses 50%. Default: 0.5
   */
  feedingBufferRatio?: number;
  /**
   * Monthly productivity multipliers (index 0 = Jan, 11 = Dec).
   * Applied to man-hour calculations to account for weather/holidays.
   * Default: PT_SEASONAL (Portuguese climate adjustments).
   * Set to array of 12 × 1.0 to disable.
   */
  seasonalFactors?: number[];
}

/**
 * Generate a fully sequenced and resource-optimized construction schedule.
 *
 * @param project - WBS project with chapters and articles
 * @param matches - CYPE matches from the matcher
 * @param maxWorkersOrOpts - Maximum team size (default 10) OR full options
 */
export function generateSchedule(
  project: WbsProject,
  matches: PriceMatch[],
  maxWorkersOrOpts: number | ScheduleOptions = 10,
): ProjectSchedule {
  const opts: ScheduleOptions = typeof maxWorkersOrOpts === "number"
    ? { maxWorkers: maxWorkersOrOpts }
    : maxWorkersOrOpts;
  const maxWorkers = opts.maxWorkers ?? 10;
  // Index matches by article code
  const matchMap = new Map<string, PriceMatch>();
  for (const m of matches) {
    matchMap.set(m.articleCode, m);
  }

  // Collect all articles with metadata
  const articles: ArticleWithMeta[] = [];
  for (const chapter of project.chapters) {
    const phase = chapterToPhase(chapter.code);
    for (const sub of chapter.subChapters) {
      for (const article of sub.articles) {
        const match = matchMap.get(article.code);
        const priceCode = match?.priceCode ?? "";
        const productivity = PRODUCTIVITY[priceCode] ?? DEFAULT_PRODUCTIVITY;
        const manhours = article.quantity * productivity;

        articles.push({
          article,
          chapter,
          phase,
          priceMatch: match,
          manhours,
        });
      }
    }
  }

  // Group articles by phase
  const phaseGroups = new Map<ConstructionPhase, ArticleWithMeta[]>();
  for (const a of articles) {
    const list = phaseGroups.get(a.phase) ?? [];
    list.push(a);
    phaseGroups.set(a.phase, list);
  }

  // Order phases according to construction sequence, skip empty ones
  const activePhases = PHASE_ORDER.filter(p => phaseGroups.has(p));

  // Calculate duration per phase considering max workers
  const HOURS_PER_DAY = 8;
  const startDate = parseDate(project.startDate);
  let taskUid = 0;
  const allTasks: ScheduleTask[] = [];
  const phaseTaskMap = new Map<ConstructionPhase, { summaryUid: number; startDate: Date; finishDate: Date }>();

  // First pass: calculate each phase's total man-hours and duration
  const phaseDurations = new Map<ConstructionPhase, { totalManhours: number; workers: number; days: number }>();
  for (const phase of activePhases) {
    const arts = phaseGroups.get(phase)!;
    const totalManhours = arts.reduce((sum, a) => sum + a.manhours, 0);

    // Determine workers for this phase (up to maxWorkers, but at least 1)
    // Use a heuristic: allocate proportional to manhours, min 1, max team size
    const idealWorkers = Math.ceil(totalManhours / (HOURS_PER_DAY * 5)); // 1 week baseline
    const workers = Math.max(1, Math.min(maxWorkers, idealWorkers));
    const days = Math.max(1, Math.ceil(totalManhours / (workers * HOURS_PER_DAY)));

    phaseDurations.set(phase, { totalManhours, workers, days });
  }

  // Seasonal factor helper: adjusts working days by monthly productivity
  const seasonal = opts.seasonalFactors ?? PT_SEASONAL;
  function applySeasonalFactor(baseDays: number, taskStartDate: Date): number {
    if (baseDays <= 0) return baseDays;
    // Use the average seasonal factor for the months the task spans
    const monthFactors: number[] = [];
    let d = new Date(taskStartDate);
    for (let i = 0; i < baseDays; i++) {
      monthFactors.push(seasonal[d.getMonth()] ?? 1.0);
      d = addWorkingDays(d, 1);
    }
    const avgFactor = monthFactors.reduce((s, f) => s + f, 0) / monthFactors.length;
    // Lower productivity → more days needed
    return Math.max(1, Math.ceil(baseDays / avgFactor));
  }

  // Second pass: schedule phases respecting dependencies
  const phaseSchedule = new Map<ConstructionPhase, { start: Date; finish: Date }>();

  for (const phase of activePhases) {
    const deps = PHASE_DEPS[phase].filter(d => phaseSchedule.has(d.phase));
    const duration = phaseDurations.get(phase)!;
    let phaseStart = new Date(startDate);

    for (const dep of deps) {
      const predSchedule = phaseSchedule.get(dep.phase)!;
      let depDate: Date;
      if (dep.type === "FS") {
        depDate = addWorkingDays(predSchedule.finish, dep.lag ?? 0);
      } else {
        // SS: start-to-start with lag
        depDate = addWorkingDays(predSchedule.start, dep.lag ?? 0);
      }
      if (depDate > phaseStart) phaseStart = depDate;
    }

    // Enforce phase overlap rules (e.g., structure→waterproofing needs 7-day gap)
    for (const rule of PHASE_OVERLAP_RULES) {
      if (rule.canOverlap || rule.phase2 !== phase) continue;
      const pred = phaseSchedule.get(rule.phase1);
      if (!pred) continue;
      const requiredStart = addWorkingDays(pred.finish, rule.minimumGap ?? 0);
      if (requiredStart > phaseStart) phaseStart = requiredStart;
    }

    // Apply seasonal productivity to phase-level duration
    const seasonalDays = applySeasonalFactor(duration.days, phaseStart);
    const phaseFinish = addWorkingDays(phaseStart, seasonalDays);
    phaseSchedule.set(phase, { start: phaseStart, finish: phaseFinish });
  }

  // Insert procurement lead-time tasks (zero-labor predecessors)
  const procurementUids = new Map<ConstructionPhase, number>();
  for (const phase of activePhases) {
    const procurement = PROCUREMENT_LEAD_TIMES[phase];
    if (!procurement) continue;

    taskUid++;
    const procFinish = addWorkingDays(startDate, procurement.days);
    allTasks.push({
      uid: taskUid,
      wbs: "",
      name: procurement.name,
      durationDays: procurement.days,
      durationHours: 0,
      startDate: toISODate(startDate),
      finishDate: toISODate(procFinish),
      predecessors: [],
      isSummary: false,
      phase,
      resources: [],
      cost: 0,
      materialCost: 0,
      outlineLevel: 2,
      percentComplete: 0,
    });
    procurementUids.set(phase, taskUid);
  }

  // Third pass: create tasks
  for (const phase of activePhases) {
    const arts = phaseGroups.get(phase)!;
    const schedule = phaseSchedule.get(phase)!;
    const duration = phaseDurations.get(phase)!;
    const phaseName = PHASE_NAMES[phase];

    // Summary task for phase
    taskUid++;
    const summaryUid = taskUid;
    const summaryTask: ScheduleTask = {
      uid: summaryUid,
      wbs: arts[0]?.chapter.code ?? "",
      name: phaseName,
      durationDays: duration.days,
      durationHours: duration.totalManhours,
      startDate: toISODate(schedule.start),
      finishDate: toISODate(schedule.finish),
      predecessors: [],
      isSummary: true,
      phase,
      resources: [],
      cost: 0,
      materialCost: 0,
      outlineLevel: 1,
      percentComplete: 0,
    };

    // Add predecessor links for summary
    const deps = PHASE_DEPS[phase].filter(d => phaseTaskMap.has(d.phase));
    for (const dep of deps) {
      const pred = phaseTaskMap.get(dep.phase)!;
      summaryTask.predecessors.push({
        uid: pred.summaryUid,
        type: dep.type,
        lag: dep.lag,
      });
    }

    // Link procurement lead-time task as FS predecessor
    const procUid = procurementUids.get(phase);
    if (procUid) {
      summaryTask.predecessors.push({ uid: procUid, type: "FS" });
    }

    allTasks.push(summaryTask);
    phaseTaskMap.set(phase, { summaryUid, startDate: schedule.start, finishDate: schedule.finish });

    // Child tasks for each article within the phase
    // Sort by manhours descending — schedule biggest articles first for better packing
    const sortedArts = [...arts].sort((a, b) => b.manhours - a.manhours);

    const floors = project.numberOfFloors ?? 1;
    const useFloorStagger = FLOOR_STAGGER_PHASES.includes(phase) && floors > 1;

    // Worker-budget parallel scheduling: articles run in parallel when
    // adding them doesn't exceed the phase's allocated worker count.
    // When the budget is full, a new batch starts after the previous batch finishes.
    let batchStart = new Date(schedule.start);
    let batchWorkers = 0;
    let batchLatestFinish = new Date(schedule.start);

    for (const art of sortedArts) {
      // Floor-stagger: split article into per-floor sub-tasks with SS+lag
      const floorCount = useFloorStagger ? floors : 1;

      let prevFloorUid: number | null = null;
      for (let floor = 0; floor < floorCount; floor++) {
        taskUid++;
        const floorManhours = art.manhours / floorCount;
        const floorQty = art.article.quantity / floorCount;
        const artWorkers = Math.max(1, Math.min(duration.workers, Math.ceil(floorManhours / HOURS_PER_DAY)));
        const baseDays = Math.max(1, Math.ceil(floorManhours / (artWorkers * HOURS_PER_DAY)));

        // For floor 0, use worker-budget parallel scheduling
        // For floor N>0, start = previous floor start + lag
        let taskStart: Date;
        if (floor === 0) {
          // If adding this article exceeds the worker budget, start a new batch
          if (batchWorkers + artWorkers > duration.workers && batchWorkers > 0) {
            batchStart = new Date(batchLatestFinish);
            batchWorkers = 0;
            batchLatestFinish = new Date(batchStart);
          }
          taskStart = new Date(batchStart);
          batchWorkers += artWorkers;
        } else {
          // SS+lag from the previous floor of the same article
          const prevFloorTask = allTasks.find(t => t.uid === prevFloorUid)!;
          taskStart = addWorkingDays(parseDate(prevFloorTask.startDate), FLOOR_STAGGER_LAG);
        }

        // Apply seasonal productivity factor (rain, holidays, August vacation)
        const artDays = applySeasonalFactor(baseDays, taskStart);
        const artFinish = addWorkingDays(taskStart, artDays);
        if (artFinish > batchLatestFinish) batchLatestFinish = artFinish;

        const role = getPrimaryRole(phase);
        const resources: TaskResource[] = [];

        // Labor
        resources.push({
          name: role.name,
          type: "labor",
          units: artWorkers,
          rate: role.rate,
          hours: floorManhours,
        });

        // Material & machinery from price breakdown
        if (art.priceMatch) {
          if (art.priceMatch.breakdown.materials > 0) {
            resources.push({
              name: `Materiais - ${art.priceMatch.priceCode}`,
              type: "material",
              units: floorQty,
              rate: art.priceMatch.breakdown.materials,
              hours: 0,
            });
          }
          if (art.priceMatch.breakdown.machinery > 0) {
            resources.push({
              name: `Equipamento - ${art.priceMatch.priceCode}`,
              type: "machinery",
              units: 1,
              rate: art.priceMatch.breakdown.machinery * floorQty,
              hours: floorManhours,
            });
          }
        }

        const unitPrice = art.priceMatch?.unitCost ?? art.article.unitPrice ?? 0;
        const totalCost = unitPrice * floorQty;
        const materialCost = (art.priceMatch?.breakdown.materials ?? 0) * floorQty;

        const floorLabel = floorCount > 1 ? ` — Piso ${floor}` : "";
        const predecessors: ScheduleTask["predecessors"] = floor === 0
          ? [{ uid: summaryUid, type: "SS" as const }]
          : [{ uid: prevFloorUid!, type: "SS" as const, lag: FLOOR_STAGGER_LAG }];

        allTasks.push({
          uid: taskUid,
          wbs: art.article.code,
          name: `${art.article.description}${floorLabel}`,
          durationDays: artDays,
          durationHours: floorManhours,
          startDate: toISODate(taskStart),
          finishDate: toISODate(artFinish),
          predecessors,
          isSummary: false,
          phase,
          resources,
          cost: totalCost,
          materialCost,
          outlineLevel: floorCount > 1 ? 3 : 2,
          percentComplete: 0,
          notes: art.priceMatch ? `Preço: ${art.priceMatch.priceCode} (${art.priceMatch.confidence}% conf.)` : undefined,
        });

        prevFloorUid = taskUid;
      }
    }

    // Update summary task cost and finishDate from actual child tasks
    const childTasks = allTasks.filter(t => t.phase === phase && !t.isSummary);
    summaryTask.cost = childTasks.reduce((sum, t) => sum + t.cost, 0);
    summaryTask.materialCost = childTasks.reduce((sum, t) => sum + t.materialCost, 0);

    // Recompute summary finishDate from actual child task dates
    // (seasonal factors and parallel scheduling may shift children beyond the original estimate)
    if (childTasks.length > 0) {
      const latestFinish = childTasks.reduce((latest, t) => {
        const f = parseDate(t.finishDate);
        return f > latest ? f : latest;
      }, parseDate(childTasks[0].finishDate));
      summaryTask.finishDate = toISODate(latestFinish);
      summaryTask.durationDays = Math.ceil(
        (latestFinish.getTime() - parseDate(summaryTask.startDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      // Update phaseTaskMap so milestones and downstream phases reference correct dates
      const entry = phaseTaskMap.get(phase);
      if (entry) entry.finishDate = latestFinish;
    }
  }

  // ── Insert Portuguese Construction Milestones ──
  const MILESTONES: { name: string; afterPhase: ConstructionPhase }[] = [
    { name: "Marco: Consignação de Obra", afterPhase: "site_setup" },
    { name: "Marco: Vistoria Estrutural", afterPhase: "structure" },
    { name: "Marco: Fecho de Envolvente", afterPhase: "external_frames" },
    { name: "Marco: Vistoria Final", afterPhase: "testing" },
    { name: "Marco: Receção Provisória", afterPhase: "cleanup" },
  ];

  for (const ms of MILESTONES) {
    const predPhase = phaseTaskMap.get(ms.afterPhase);
    if (!predPhase) continue; // Phase not present in this project

    taskUid++;
    const msDate = toISODate(predPhase.finishDate);
    allTasks.push({
      uid: taskUid,
      wbs: "",
      name: ms.name,
      durationDays: 0,
      durationHours: 0,
      startDate: msDate,
      finishDate: msDate,
      predecessors: [{ uid: predPhase.summaryUid, type: "FS" }],
      isSummary: false,
      isMilestone: true,
      phase: ms.afterPhase,
      resources: [],
      cost: 0,
      materialCost: 0,
      outlineLevel: 1,
      percentComplete: 0,
    });
  }

  // Build resource list
  const resourceMap = new Map<string, ProjectResource>();
  let resourceUid = 0;
  for (const task of allTasks) {
    for (const res of task.resources) {
      const key = `${res.type}:${res.name}`;
      if (!resourceMap.has(key)) {
        resourceUid++;
        resourceMap.set(key, {
          uid: resourceUid,
          name: res.name,
          type: res.type,
          standardRate: res.rate,
          totalHours: 0,
          totalCost: 0,
        });
      }
      const r = resourceMap.get(key)!;
      r.totalHours += res.hours;
      r.totalCost += res.type === "material" ? res.units * res.rate : res.hours * res.rate;
    }
  }

  // Critical path: find the longest chain of FS dependencies
  const criticalPath = findCriticalPath(allTasks);

  // Overall dates
  const allFinishes = allTasks.filter(t => t.isSummary).map(t => parseDate(t.finishDate));
  const projectFinish = allFinishes.length > 0 ? new Date(Math.max(...allFinishes.map(d => d.getTime()))) : startDate;
  const totalDurationDays = Math.ceil((projectFinish.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  // Team summary
  const totalManHours = allTasks.filter(t => !t.isSummary).reduce((sum, t) => sum + t.durationHours, 0);
  const avgWorkers = totalDurationDays > 0 ? totalManHours / (totalDurationDays * 8) : 0;

  // Find peak week
  const weekWorkers = new Map<string, number>();
  for (const task of allTasks.filter(t => !t.isSummary)) {
    const start = parseDate(task.startDate);
    const weekKey = `${start.getFullYear()}-W${String(Math.ceil((start.getDate()) / 7)).padStart(2, "0")}`;
    const workers = task.resources
      .filter(r => r.type === "labor" || r.type === "subcontractor")
      .reduce((sum, r) => sum + (r.type === "subcontractor" ? (r.teamSize ?? r.units) : r.units), 0);
    weekWorkers.set(weekKey, (weekWorkers.get(weekKey) ?? 0) + workers);
  }
  let peakWeek = "";
  let peakCount = 0;
  for (const [week, count] of weekWorkers) {
    if (count > peakCount) { peakCount = count; peakWeek = week; }
  }

  const baseSchedule: ProjectSchedule = {
    projectName: project.name,
    startDate: toISODate(startDate),
    finishDate: toISODate(projectFinish),
    totalDurationDays,
    totalCost: allTasks.filter(t => t.isSummary).reduce((sum, t) => sum + t.cost, 0),
    tasks: allTasks,
    resources: Array.from(resourceMap.values()),
    criticalPath,
    teamSummary: {
      maxWorkers,
      averageWorkers: Math.round(avgWorkers * 10) / 10,
      totalManHours: Math.round(totalManHours),
      peakWeek,
    },
  };

  // Apply Critical Chain (Goldratt) if requested
  if (opts.useCriticalChain) {
    baseSchedule.criticalChain = applyCriticalChain(
      baseSchedule,
      phaseSchedule,
      activePhases,
      phaseDurations,
      startDate,
      opts,
    );
    // Update schedule finish date to include project buffer
    if (baseSchedule.criticalChain) {
      const pb = baseSchedule.criticalChain.projectBuffer;
      baseSchedule.finishDate = pb.finishDate;
      baseSchedule.totalDurationDays = baseSchedule.criticalChain.ccpmDurationDays;
    }
  }

  return baseSchedule;
}

/**
 * Find the critical path (longest chain through summary tasks).
 */
function findCriticalPath(tasks: ScheduleTask[]): number[] {
  const summaryTasks = tasks.filter(t => t.isSummary);
  const detailTasks = tasks.filter(t => !t.isSummary && !t.isMilestone);
  const finishMap = new Map<number, Date>();
  for (const t of summaryTasks) {
    finishMap.set(t.uid, parseDate(t.finishDate));
  }

  // Find the summary task with the latest finish date
  let latestTask: ScheduleTask | null = null;
  let latestDate = new Date(0);
  for (const t of summaryTasks) {
    const d = finishMap.get(t.uid)!;
    if (d > latestDate) {
      latestDate = d;
      latestTask = t;
    }
  }

  if (!latestTask) return [];

  // Trace back through predecessors (summary level)
  const summaryPath: number[] = [latestTask.uid];
  let current = latestTask;
  while (current.predecessors.length > 0) {
    let critPred: ScheduleTask | null = null;
    let critDate = new Date(0);
    for (const pred of current.predecessors) {
      const predTask = summaryTasks.find(t => t.uid === pred.uid);
      if (predTask) {
        const d = finishMap.get(predTask.uid)!;
        if (d > critDate) {
          critDate = d;
          critPred = predTask;
        }
      }
    }
    if (!critPred) break;
    summaryPath.unshift(critPred.uid);
    current = critPred;
  }

  // Drill into detail tasks: for each critical summary, find the bottleneck child
  // (the child with the latest finish date — the one that actually drives the phase duration)
  const fullPath: number[] = [];
  for (const summaryUid of summaryPath) {
    fullPath.push(summaryUid);
    const children = detailTasks.filter(t =>
      t.predecessors.some(p => p.uid === summaryUid),
    );
    if (children.length > 0) {
      const bottleneck = children.reduce((a, b) =>
        parseDate(a.finishDate) >= parseDate(b.finishDate) ? a : b,
      );
      fullPath.push(bottleneck.uid);
    }
  }

  return fullPath;
}

// ============================================================
// Critical Chain Project Management (Goldratt CCPM)
// ============================================================

/**
 * Apply Goldratt's Critical Chain methodology:
 *
 * 1. Strip safety padding from individual tasks (aggressive estimates)
 * 2. Resource-level the schedule to resolve contention
 * 3. Identify the Critical Chain (longest resource-leveled path)
 * 4. Insert Project Buffer at the end of the critical chain
 * 5. Insert Feeding Buffers where non-critical chains merge into the CC
 *
 * The key insight: instead of hiding safety in every task (Parkinson's Law,
 * Student Syndrome), pool the safety into strategically placed buffers
 * that protect the project completion date.
 */
function applyCriticalChain(
  schedule: ProjectSchedule,
  phaseSchedule: Map<ConstructionPhase, { start: Date; finish: Date }>,
  activePhases: ConstructionPhase[],
  phaseDurations: Map<ConstructionPhase, { totalManhours: number; workers: number; days: number }>,
  projectStart: Date,
  opts: ScheduleOptions,
): CriticalChainData {
  const safetyReduction = opts.safetyReduction ?? 0.5;
  const projectBufferRatio = opts.projectBufferRatio ?? 0.5;
  const feedingBufferRatio = opts.feedingBufferRatio ?? 0.5;

  const originalDuration = schedule.totalDurationDays;
  const criticalPathUids = new Set(schedule.criticalPath);

  // Step 1: Calculate aggressive durations (strip safety from each phase)
  // Construction typically pads estimates by 50-100%. We cut by safetyReduction.
  const aggressiveDurations = new Map<ConstructionPhase, number>();
  let totalSafetyRemovedDays = 0;
  let criticalChainSafetyRemoved = 0;

  for (const phase of activePhases) {
    const dur = phaseDurations.get(phase);
    if (!dur) continue;
    const originalDays = dur.days;
    const aggressiveDays = Math.max(1, Math.ceil(originalDays * (1 - safetyReduction)));
    const removedDays = originalDays - aggressiveDays;
    aggressiveDurations.set(phase, aggressiveDays);
    totalSafetyRemovedDays += removedDays;

    // Track safety removed from critical chain tasks
    const phaseTask = schedule.tasks.find(t => t.isSummary && t.phase === phase);
    if (phaseTask && criticalPathUids.has(phaseTask.uid)) {
      criticalChainSafetyRemoved += removedDays;
    }
  }

  // Step 2: Reschedule with aggressive durations
  const aggressivePhaseSchedule = new Map<ConstructionPhase, { start: Date; finish: Date }>();
  for (const phase of activePhases) {
    const deps = PHASE_DEPS[phase].filter(d => aggressivePhaseSchedule.has(d.phase));
    const aggressiveDays = aggressiveDurations.get(phase) ?? 1;
    let phaseStart = new Date(projectStart);

    for (const dep of deps) {
      const predSchedule = aggressivePhaseSchedule.get(dep.phase)!;
      let depDate: Date;
      if (dep.type === "FS") {
        depDate = addWorkingDays(predSchedule.finish, dep.lag ?? 0);
      } else {
        depDate = addWorkingDays(predSchedule.start, dep.lag ?? 0);
      }
      if (depDate > phaseStart) phaseStart = depDate;
    }

    const phaseFinish = addWorkingDays(phaseStart, aggressiveDays);
    aggressivePhaseSchedule.set(phase, { start: phaseStart, finish: phaseFinish });
  }

  // Calculate aggressive project end
  let aggressiveEnd = new Date(projectStart);
  for (const sched of aggressivePhaseSchedule.values()) {
    if (sched.finish > aggressiveEnd) aggressiveEnd = sched.finish;
  }
  const aggressiveDurationDays = Math.ceil(
    (aggressiveEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Step 3: Size the Project Buffer
  // Standard CCPM: project buffer = projectBufferRatio * safety removed from critical chain
  // Use Cut & Paste method: square root of sum of squares for statistical sizing
  const criticalPhaseSafetySquares: number[] = [];
  for (const phase of activePhases) {
    const phaseTask = schedule.tasks.find(t => t.isSummary && t.phase === phase);
    if (!phaseTask || !criticalPathUids.has(phaseTask.uid)) continue;
    const orig = phaseDurations.get(phase)?.days ?? 0;
    const aggressive = aggressiveDurations.get(phase) ?? 0;
    const removed = orig - aggressive;
    if (removed > 0) criticalPhaseSafetySquares.push(removed * removed);
  }
  // Root-Sum-of-Squares method provides statistically valid buffer size
  const rssBuffer = Math.sqrt(criticalPhaseSafetySquares.reduce((sum, sq) => sum + sq, 0));
  const projectBufferDays = Math.max(1, Math.ceil(rssBuffer * projectBufferRatio));

  const projectBufferStart = aggressiveEnd;
  const projectBufferEnd = addWorkingDays(projectBufferStart, projectBufferDays);

  let bufferUid = 9000; // Use high UIDs to avoid conflicts

  const projectBuffer: CriticalChainBuffer = {
    uid: ++bufferUid,
    type: "project",
    name: "Buffer de Projeto (Goldratt)",
    durationDays: projectBufferDays,
    consumedPercent: 0,
    zone: "green",
    startDate: toISODate(projectBufferStart),
    finishDate: toISODate(projectBufferEnd),
    feedingChain: schedule.criticalPath,
    protectsTask: undefined,
  };

  // Step 4: Identify feeding chains and insert Feeding Buffers
  // A feeding buffer is placed where a non-critical chain merges into the critical chain
  const feedingBuffers: CriticalChainBuffer[] = [];

  for (const phase of activePhases) {
    const phaseTask = schedule.tasks.find(t => t.isSummary && t.phase === phase);
    if (!phaseTask || !criticalPathUids.has(phaseTask.uid)) continue;

    // Check predecessors: if any predecessor is NOT on the critical path,
    // that's a feeding chain merge point
    for (const pred of phaseTask.predecessors) {
      const predTask = schedule.tasks.find(t => t.uid === pred.uid);
      if (!predTask || criticalPathUids.has(predTask.uid)) continue;

      // Trace back the feeding chain
      const feedingChain = traceFeedingChain(predTask, schedule.tasks, criticalPathUids);

      // Calculate feeding chain's removed safety
      const feedingSafetySquares: number[] = [];
      for (const fcTask of feedingChain) {
        if (!fcTask.isSummary) continue;
        const orig = phaseDurations.get(fcTask.phase)?.days ?? 0;
        const aggressive = aggressiveDurations.get(fcTask.phase) ?? 0;
        const removed = orig - aggressive;
        if (removed > 0) feedingSafetySquares.push(removed * removed);
      }

      if (feedingSafetySquares.length === 0) continue;

      const rssFB = Math.sqrt(feedingSafetySquares.reduce((sum, sq) => sum + sq, 0));
      const fbDays = Math.max(1, Math.ceil(rssFB * feedingBufferRatio));

      // Place the feeding buffer just before the merge point
      const aggressivePredSched = aggressivePhaseSchedule.get(predTask.phase);
      const fbStart = aggressivePredSched?.finish ?? aggressiveEnd;
      const fbEnd = addWorkingDays(fbStart, fbDays);

      feedingBuffers.push({
        uid: ++bufferUid,
        type: "feeding",
        name: `Buffer Alimentação: ${PHASE_NAMES[predTask.phase] ?? predTask.name}`,
        durationDays: fbDays,
        consumedPercent: 0,
        zone: "green",
        startDate: toISODate(fbStart),
        finishDate: toISODate(fbEnd),
        feedingChain: feedingChain.map(t => t.uid),
        protectsTask: phaseTask.uid,
      });
    }
  }

  const ccpmDurationDays = aggressiveDurationDays + projectBufferDays;
  const bufferRatio = aggressiveDurationDays > 0 ? projectBufferDays / aggressiveDurationDays : 0;

  return {
    chainTaskUids: schedule.criticalPath,
    buffers: [projectBuffer, ...feedingBuffers],
    projectBuffer,
    feedingBuffers,
    originalDurationDays: originalDuration,
    aggressiveDurationDays,
    ccpmDurationDays,
    safetyReductionPercent: Math.round(safetyReduction * 100),
    bufferRatio: Math.round(bufferRatio * 100) / 100,
  };
}

/**
 * Trace a feeding chain backwards from a non-critical task.
 * Returns all tasks in the chain (from root to the given task).
 */
function traceFeedingChain(
  task: ScheduleTask,
  allTasks: ScheduleTask[],
  criticalUids: Set<number>,
): ScheduleTask[] {
  const chain: ScheduleTask[] = [task];
  const visited = new Set<number>([task.uid]);

  let current = task;
  while (current.predecessors.length > 0) {
    let best: ScheduleTask | null = null;
    let bestDate = new Date(0);

    for (const pred of current.predecessors) {
      if (visited.has(pred.uid)) continue;
      const predTask = allTasks.find(t => t.uid === pred.uid);
      if (!predTask || criticalUids.has(predTask.uid)) continue;

      const d = parseDate(predTask.finishDate);
      if (d > bestDate) {
        bestDate = d;
        best = predTask;
      }
    }

    if (!best) break;
    chain.unshift(best);
    visited.add(best.uid);
    current = best;
  }

  return chain;
}

/**
 * Update buffer consumption based on actual progress.
 * Call this during project execution to track buffer health.
 *
 * @param buffer - The buffer to update
 * @param chainCompletionPercent - How much of the feeding chain is done (0-100)
 * @param chainDelayDays - How many days behind schedule the chain is
 * @returns Updated buffer with consumption and zone
 */
export function updateBufferConsumption(
  buffer: CriticalChainBuffer,
  chainCompletionPercent: number,
  chainDelayDays: number,
): CriticalChainBuffer {
  // Buffer consumption = delay / buffer size
  const consumedPercent = buffer.durationDays > 0
    ? Math.min(100, Math.max(0, (chainDelayDays / buffer.durationDays) * 100))
    : 0;

  // Fever chart zone determination:
  // Plot (chainCompletion, bufferConsumption) on a fever chart
  // Green zone: buffer consumption < chainCompletion * 0.33
  // Yellow zone: buffer consumption < chainCompletion * 0.67
  // Red zone: buffer consumption >= chainCompletion * 0.67
  const safeCompletion = Math.max(1, chainCompletionPercent);
  const ratio = consumedPercent / safeCompletion;

  let zone: "green" | "yellow" | "red";
  if (ratio < 0.33) {
    zone = "green";
  } else if (ratio < 0.67) {
    zone = "yellow";
  } else {
    zone = "red";
  }

  return { ...buffer, consumedPercent, zone };
}

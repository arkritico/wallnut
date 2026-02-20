/**
 * MS Project XML Full Schedule Importer
 *
 * Parses Microsoft Project XML (2007+) into a complete ProjectSchedule,
 * including tasks with hierarchy, resources, assignments, and predecessor links.
 *
 * Unlike progress-import.ts (which only extracts % complete updates), this
 * module imports the full schedule structure for coordinated analysis.
 *
 * Supports XML exported from MS Project, ProjectLibre, and GanttProject.
 */

import type {
  ProjectSchedule,
  ScheduleTask,
  TaskResource,
  ProjectResource,
  ConstructionPhase,
  WbsProject,
  WbsChapter,
  WbsSubChapter,
  WbsArticle,
} from "./wbs-types";
import { chapterToPhase, PRONIC_CHAPTERS } from "./wbs-types";
import { PHASE_ORDER } from "./construction-sequencer";

// ============================================================
// Public Types
// ============================================================

export interface MSProjectImportResult {
  schedule: ProjectSchedule;
  /** Minimal WbsProject extracted from task hierarchy (for cost matching) */
  wbsProject: WbsProject;
  /** Import diagnostics */
  diagnostics: ScheduleDiagnostic[];
}

export interface ScheduleDiagnostic {
  type: "info" | "warning" | "suggestion";
  message: string;
}

// ============================================================
// XML Detection
// ============================================================

/**
 * Check if an XML string is a MS Project file.
 * Looks for MS Project namespace or <Project> root with <Tasks> child.
 */
export function isMSProjectXML(xml: string): boolean {
  // String-based detection — avoids DOMParser overhead for obvious non-matches
  if (!xml.includes("<Project")) return false;

  // Check for MS Project namespace OR Project root with Tasks+Resources
  const hasNamespace = xml.includes("schemas.microsoft.com/project");
  const hasStructure = xml.includes("<Tasks") && xml.includes("<Resources");
  return hasNamespace || hasStructure;
}

// ============================================================
// Main Parser
// ============================================================

/**
 * Parse a MS Project XML string into a full ProjectSchedule + WbsProject.
 */
export function parseMSProjectXML(xml: string): MSProjectImportResult {
  const diagnostics: ScheduleDiagnostic[] = [];
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;

  // Project metadata
  const projectName = getXmlText(root, "Name") || "Projeto Importado";
  const projectStart = parseXmlDate(getXmlText(root, "StartDate")) || new Date().toISOString().slice(0, 10);
  const projectFinish = parseXmlDate(getXmlText(root, "FinishDate")) || projectStart;

  // ── Parse Resources ──────────────────────────────────────
  const resourceMap = new Map<number, ProjectResource>();
  const resourcesContainer = root.getElementsByTagName("Resources")[0];
  const resourceElements = resourcesContainer
    ? Array.from(resourcesContainer.getElementsByTagName("Resource"))
    : [];
  let resourceIndex = 0;

  for (const el of resourceElements) {
    const uid = parseInt(getXmlText(el, "UID"), 10);
    if (isNaN(uid) || uid === 0) continue; // Skip unassigned placeholder

    const name = getXmlText(el, "Name") || `Resource ${uid}`;
    const msType = parseInt(getXmlText(el, "Type") || "1", 10);
    const standardRate = parseFloat(getXmlText(el, "StandardRate") || "0") || 0;
    const totalCost = parseFloat(getXmlText(el, "Cost") || "0") || 0;

    resourceIndex++;
    resourceMap.set(uid, {
      uid,
      name,
      type: msResourceType(msType),
      standardRate,
      totalHours: 0, // Accumulated from assignments
      totalCost,
    });
  }

  // ── Parse Tasks ──────────────────────────────────────────
  const tasks: ScheduleTask[] = [];
  const criticalPath: number[] = [];
  const tasksContainer = root.getElementsByTagName("Tasks")[0];
  const taskElements = tasksContainer
    ? Array.from(tasksContainer.getElementsByTagName("Task"))
    : [];

  for (const el of taskElements) {
    const uid = parseInt(getXmlText(el, "UID"), 10);
    if (isNaN(uid) || uid === 0) continue; // Skip project summary (UID=0)

    const name = getXmlText(el, "Name") || `Task ${uid}`;
    const wbs = getXmlText(el, "WBS") || "";
    const outlineLevel = parseInt(getXmlText(el, "OutlineLevel") || "1", 10);
    const isSummary = getXmlText(el, "Summary") === "1";
    const isMilestone = getXmlText(el, "Milestone") === "1";
    const isCritical = getXmlText(el, "Critical") === "1";

    // Duration
    const durationStr = getXmlText(el, "Duration");
    const durationHours = durationStr ? parsePTDuration(durationStr) : 0;
    const durationDays = Math.max(isMilestone ? 0 : 1, Math.ceil(durationHours / 8));

    // Dates
    const startDate = parseXmlDate(getXmlText(el, "Start")) || projectStart;
    const finishDate = parseXmlDate(getXmlText(el, "Finish")) || startDate;

    // Progress
    const percentComplete = parseInt(getXmlText(el, "PercentComplete") || "0", 10) || 0;
    const physicalPct = getXmlText(el, "PhysicalPercentComplete");
    const physicalPercentComplete = physicalPct ? parseInt(physicalPct, 10) || 0 : undefined;

    // Cost
    const fixedCost = parseFloat(getXmlText(el, "FixedCost") || "0") || 0;
    const cost = fixedCost || (parseFloat(getXmlText(el, "Cost") || "0") || 0);

    // Predecessors
    const predecessors: ScheduleTask["predecessors"] = [];
    for (const predEl of Array.from(el.getElementsByTagName("PredecessorLink"))) {
      const predUid = parseInt(getXmlText(predEl, "PredecessorUID"), 10);
      if (isNaN(predUid)) continue;

      const typeCode = parseInt(getXmlText(predEl, "Type") || "1", 10);
      const linkLag = parseInt(getXmlText(predEl, "LinkLag") || "0", 10);
      // LinkLag is in tenths-of-minutes; 4800 = 1 working day (480min * 10)
      const lagDays = linkLag !== 0 ? Math.round(linkLag / 4800) : undefined;

      predecessors.push({
        uid: predUid,
        type: msPredType(typeCode),
        lag: lagDays,
      });
    }

    // Phase inference
    const phase = inferPhase(name, wbs);

    if (isCritical) criticalPath.push(uid);

    tasks.push({
      uid,
      wbs,
      name,
      durationDays,
      durationHours,
      startDate,
      finishDate,
      predecessors,
      isSummary,
      phase,
      resources: [], // Populated from assignments below
      cost,
      materialCost: 0,
      outlineLevel,
      percentComplete,
      physicalPercentComplete,
      isMilestone: isMilestone || undefined,
    });
  }

  // ── Parse Assignments ────────────────────────────────────
  const assignmentsContainer = root.getElementsByTagName("Assignments")[0];
  const assignmentElements = assignmentsContainer
    ? Array.from(assignmentsContainer.getElementsByTagName("Assignment"))
    : [];
  const taskMap = new Map(tasks.map((t) => [t.uid, t]));

  for (const el of assignmentElements) {
    const taskUid = parseInt(getXmlText(el, "TaskUID"), 10);
    const resourceUid = parseInt(getXmlText(el, "ResourceUID"), 10);
    if (isNaN(taskUid) || isNaN(resourceUid)) continue;

    const task = taskMap.get(taskUid);
    const resource = resourceMap.get(resourceUid);
    if (!task || !resource) continue;

    const units = parseFloat(getXmlText(el, "Units") || "1") || 1;
    const workStr = getXmlText(el, "Work");
    const workHours = workStr ? parsePTDuration(workStr) : task.durationHours;
    const assignCost = parseFloat(getXmlText(el, "Cost") || "0") || 0;

    const taskResource: TaskResource = {
      name: resource.name,
      type: resource.type,
      units,
      rate: resource.standardRate,
      hours: workHours,
    };

    task.resources.push(taskResource);

    // Accumulate hours on resource
    resource.totalHours += workHours;
    if (resource.totalCost === 0) {
      resource.totalCost += assignCost;
    }

    // Track material cost on task
    if (resource.type === "material") {
      task.materialCost += assignCost;
    }
  }

  // ── Build team summary ───────────────────────────────────
  const laborTasks = tasks.filter((t) => !t.isSummary && t.resources.some((r) => r.type === "labor"));
  const totalManHours = [...resourceMap.values()]
    .filter((r) => r.type === "labor")
    .reduce((sum, r) => sum + r.totalHours, 0);

  const maxWorkers = laborTasks.reduce((max, t) => {
    const w = t.resources
      .filter((r) => r.type === "labor" || r.type === "subcontractor")
      .reduce((s, r) => s + r.units, 0);
    return Math.max(max, w);
  }, 0) || 10;

  const avgWorkers = laborTasks.length > 0
    ? Math.round(laborTasks.reduce((sum, t) => {
        const w = t.resources.filter((r) => r.type === "labor").reduce((s, r) => s + r.units, 0);
        return sum + w;
      }, 0) / laborTasks.length)
    : 0;

  // ── Compute total cost & duration ────────────────────────
  const totalCost = tasks.reduce((sum, t) => t.isSummary ? sum : sum + t.cost, 0);
  const totalDurationDays = tasks.length > 0
    ? Math.ceil(
        (new Date(projectFinish).getTime() - new Date(projectStart).getTime()) / (1000 * 60 * 60 * 24),
      )
    : 0;

  // ── Generate diagnostics ─────────────────────────────────
  generateDiagnostics(tasks, diagnostics);

  // ── Build ProjectSchedule ────────────────────────────────
  const schedule: ProjectSchedule = {
    projectName,
    startDate: projectStart,
    finishDate: projectFinish,
    totalDurationDays: Math.max(1, totalDurationDays),
    totalCost,
    tasks,
    resources: [...resourceMap.values()],
    criticalPath,
    teamSummary: {
      maxWorkers: maxWorkers || 10,
      averageWorkers: avgWorkers,
      totalManHours: Math.round(totalManHours),
      peakWeek: projectStart, // Simplified — no week-by-week histogram
    },
  };

  // ── Extract WBS ──────────────────────────────────────────
  const wbsProject = extractWbsFromSchedule(schedule, diagnostics);

  diagnostics.push({
    type: "info",
    message: `Importado: ${tasks.length} tarefas, ${resourceMap.size} recursos, ${criticalPath.length} tarefas críticas.`,
  });

  return { schedule, wbsProject, diagnostics };
}

// ============================================================
// Phase Inference
// ============================================================

const PHASE_KEYWORDS: Array<{ keywords: string[]; phase: ConstructionPhase }> = [
  { keywords: ["estaleiro", "preparatóri", "site setup", "mobilização", "mobilizaç"], phase: "site_setup" },
  { keywords: ["demoliç", "demolition"], phase: "demolition" },
  { keywords: ["movimento de terra", "escavaç", "earthwork", "aterro"], phase: "earthworks" },
  { keywords: ["fundaç", "foundation", "estaca", "sapata"], phase: "foundations" },
  { keywords: ["contenç", "muro de suporte", "retaining"], phase: "foundations" },
  { keywords: ["estrutura", "betão armado", "structure", "concrete", "pilar", "viga", "laje"], phase: "structure" },
  { keywords: ["estrutura metálica", "steel structure", "metálica"], phase: "structure" },
  { keywords: ["alvenaria exterior", "external wall", "parede exterior"], phase: "external_walls" },
  { keywords: ["cobertura", "telhado", "roof"], phase: "roof" },
  { keywords: ["impermeabilizaç", "waterproof"], phase: "waterproofing" },
  { keywords: ["caixilharia", "janela", "window", "porta exterior", "external frame"], phase: "external_frames" },
  { keywords: ["água", "drenagem", "plumbing", "esgoto", "abastecimento"], phase: "rough_in_plumbing" },
  { keywords: ["eléctrica", "elétrica", "electrical", "quadro eléctrico"], phase: "rough_in_electrical" },
  { keywords: ["avac", "hvac", "ventilação", "climatização", "ar condicionado"], phase: "rough_in_hvac" },
  { keywords: ["gás", "gas installation"], phase: "rough_in_gas" },
  { keywords: ["ited", "itur", "telecom", "telecomunicaç"], phase: "rough_in_telecom" },
  { keywords: ["alvenaria interior", "internal wall", "parede interior", "divisória"], phase: "internal_walls" },
  { keywords: ["isolamento", "insulation", "térmico", "acústico"], phase: "insulation" },
  { keywords: ["revestimento exterior", "external finish", "fachada", "capoto", "etics"], phase: "external_finishes" },
  { keywords: ["revestimento interior", "internal finish", "estuque", "reboco"], phase: "internal_finishes" },
  { keywords: ["pavimento", "flooring", "piso", "cerâmica", "soalho"], phase: "flooring" },
  { keywords: ["teto", "ceiling", "tecto falso"], phase: "ceilings" },
  { keywords: ["carpintaria", "carpentry", "madeira", "porta interior"], phase: "carpentry" },
  { keywords: ["louça sanitária", "loiça", "sanitary", "torneira"], phase: "plumbing_fixtures" },
  { keywords: ["aparelhagem", "interruptor", "tomada", "electrical fixture"], phase: "electrical_fixtures" },
  { keywords: ["pintura", "painting", "envernizamento"], phase: "painting" },
  { keywords: ["serralharia", "metalwork", "gradeamento", "corrimão"], phase: "metalwork" },
  { keywords: ["incêndio", "fire safety", "scie", "extintor"], phase: "fire_safety" },
  { keywords: ["ascensor", "elevador", "elevator", "plataforma elevatória"], phase: "elevators" },
  { keywords: ["arranjo exterior", "external work", "paisagismo", "jardim", "muros"], phase: "external_works" },
  { keywords: ["ensaio", "certificaç", "testing", "comissionamento"], phase: "testing" },
  { keywords: ["limpeza", "cleanup", "entrega"], phase: "cleanup" },
];

function inferPhase(name: string, wbs: string): ConstructionPhase {
  const lower = name.toLowerCase();

  // First try keyword match
  for (const entry of PHASE_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.phase;
    }
  }

  // Fallback: try WBS code → ProNIC chapter mapping
  const chapterCode = wbs.split(".")[0]?.padStart(2, "0");
  if (chapterCode) {
    const ch = PRONIC_CHAPTERS.find((c) => c.code === chapterCode);
    if (ch) return ch.phase;
  }

  return "site_setup";
}

// ============================================================
// WBS Extraction
// ============================================================

function extractWbsFromSchedule(
  schedule: ProjectSchedule,
  diagnostics: ScheduleDiagnostic[],
): WbsProject {
  const chapters: WbsChapter[] = [];
  const chapterMap = new Map<string, WbsChapter>();

  // Group tasks by outline level: 1=chapter, 2=subchapter, 3+=article
  let currentChapter: WbsChapter | null = null;
  let currentSubChapter: WbsSubChapter | null = null;

  for (const task of schedule.tasks) {
    if (task.outlineLevel === 1) {
      // Chapter-level (summary)
      const code = task.wbs.split(".")[0] || String(chapters.length + 1).padStart(2, "0");
      currentChapter = {
        code,
        name: task.name,
        subChapters: [],
      };
      chapters.push(currentChapter);
      chapterMap.set(code, currentChapter);
      currentSubChapter = null;
    } else if (task.outlineLevel === 2 && currentChapter) {
      // Sub-chapter level
      const code = task.wbs || `${currentChapter.code}.${currentChapter.subChapters.length + 1}`;
      currentSubChapter = {
        code,
        name: task.name,
        articles: [],
      };
      currentChapter.subChapters.push(currentSubChapter);
    } else if (!task.isSummary) {
      // Article-level (leaf task)
      const container = currentSubChapter || ensureDefaultSubChapter(currentChapter, chapters);
      if (container) {
        const article: WbsArticle = {
          code: task.wbs || `${container.code}.${container.articles.length + 1}`,
          description: task.name,
          unit: "vg", // "verba global" — no quantities from XML
          quantity: 1,
          unitPrice: task.cost > 0 ? task.cost : undefined,
        };
        container.articles.push(article);
      }
    }
  }

  // Count articles
  const totalArticles = chapters.reduce(
    (sum, ch) => sum + ch.subChapters.reduce((s, sc) => s + sc.articles.length, 0),
    0,
  );

  diagnostics.push({
    type: "info",
    message: `WBS extraído: ${chapters.length} capítulos, ${totalArticles} artigos.`,
  });

  return {
    id: `import-${Date.now()}`,
    name: schedule.projectName,
    classification: "custom",
    startDate: schedule.startDate,
    chapters,
  };
}

function ensureDefaultSubChapter(
  chapter: WbsChapter | null,
  chapters: WbsChapter[],
): WbsSubChapter | null {
  if (!chapter) {
    // No chapter yet — create a default one
    chapter = {
      code: "01",
      name: "Geral",
      subChapters: [],
    };
    chapters.push(chapter);
  }

  if (chapter.subChapters.length === 0) {
    const sc: WbsSubChapter = {
      code: `${chapter.code}.01`,
      name: chapter.name,
      articles: [],
    };
    chapter.subChapters.push(sc);
  }

  return chapter.subChapters[chapter.subChapters.length - 1];
}

// ============================================================
// Diagnostics
// ============================================================

function generateDiagnostics(tasks: ScheduleTask[], diagnostics: ScheduleDiagnostic[]): void {
  const nonSummaryTasks = tasks.filter((t) => !t.isSummary && !t.isMilestone);

  // Check for tasks without predecessors (except first task)
  const noPredTasks = nonSummaryTasks.filter(
    (t, i) => i > 0 && t.predecessors.length === 0,
  );
  if (noPredTasks.length > 0) {
    diagnostics.push({
      type: "warning",
      message: `${noPredTasks.length} tarefa(s) sem predecessores: ${noPredTasks.slice(0, 3).map((t) => t.name).join(", ")}${noPredTasks.length > 3 ? "..." : ""}.`,
    });
  }

  // Check for zero-duration non-milestones
  const zeroDur = nonSummaryTasks.filter((t) => t.durationDays === 0);
  if (zeroDur.length > 0) {
    diagnostics.push({
      type: "suggestion",
      message: `${zeroDur.length} tarefa(s) com duração zero (considerar marcar como milestone): ${zeroDur.slice(0, 3).map((t) => t.name).join(", ")}.`,
    });
  }

  // Check for missing canonical phases
  const presentPhases = new Set(nonSummaryTasks.map((t) => t.phase));
  const corePhases: ConstructionPhase[] = [
    "foundations", "structure", "external_walls", "roof",
    "rough_in_plumbing", "rough_in_electrical",
  ];
  const missingCore = corePhases.filter((p) => !presentPhases.has(p));
  if (missingCore.length > 0) {
    diagnostics.push({
      type: "suggestion",
      message: `Fases de construção não identificadas no cronograma: ${missingCore.join(", ")}. Verifique os nomes das tarefas.`,
    });
  }

  // Check phase sequencing
  const phaseOrder = new Map(PHASE_ORDER.map((p: ConstructionPhase, i: number) => [p, i]));
  for (let i = 1; i < nonSummaryTasks.length; i++) {
    const prev = nonSummaryTasks[i - 1];
    const curr = nonSummaryTasks[i];
    const prevOrder = phaseOrder.get(prev.phase) ?? 99;
    const currOrder = phaseOrder.get(curr.phase) ?? 99;

    // Only flag if a later phase starts before an earlier phase finishes
    if (currOrder < prevOrder && curr.startDate < prev.finishDate) {
      diagnostics.push({
        type: "warning",
        message: `Possível inversão de sequência: "${curr.name}" (${curr.phase}) inicia antes de "${prev.name}" (${prev.phase}) terminar.`,
      });
      break; // Only report first sequence issue to avoid noise
    }
  }
}

// ============================================================
// Helpers
// ============================================================

/** Get text content of a child element (namespace-agnostic). */
function getXmlText(parent: Element, tag: string): string {
  return parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}


/**
 * Parse PT duration format to hours.
 * PT8H0M0S → 8, PT80H0M0S → 80, PT0H0M0S → 0
 * Also handles: PT5D (5 days = 40h), PT2W (2 weeks = 80h)
 */
export function parsePTDuration(pt: string): number {
  if (!pt || !pt.startsWith("PT")) return 0;

  let hours = 0;
  const hMatch = pt.match(/(\d+)H/);
  const mMatch = pt.match(/(\d+)M(?!S)/); // M not followed by S (avoid MS confusion)
  const sMatch = pt.match(/(\d+)S/);
  const dMatch = pt.match(/(\d+)D/);
  const wMatch = pt.match(/(\d+)W/);

  if (hMatch) hours += parseInt(hMatch[1], 10);
  if (mMatch) hours += parseInt(mMatch[1], 10) / 60;
  if (sMatch) hours += parseInt(sMatch[1], 10) / 3600;
  if (dMatch) hours += parseInt(dMatch[1], 10) * 8; // 8h/day
  if (wMatch) hours += parseInt(wMatch[1], 10) * 40; // 40h/week

  return hours;
}

function parseXmlDate(dateStr: string): string | null {
  if (!dateStr) return null;
  // ISO 8601: "2026-03-15T08:00:00" → "2026-03-15"
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Map MS Project predecessor type code to string */
function msPredType(code: number): "FS" | "SS" | "FF" | "SF" {
  switch (code) {
    case 0: return "FF";
    case 1: return "FS";
    case 2: return "SF";
    case 3: return "SS";
    default: return "FS";
  }
}

/** Map MS Project resource type code to our type */
function msResourceType(code: number): "labor" | "material" | "machinery" {
  switch (code) {
    case 0: return "material";
    case 1: return "labor";
    case 2: return "machinery"; // Cost resource → treat as machinery/subcontractor
    default: return "labor";
  }
}

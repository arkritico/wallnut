/**
 * Entity consultation timeline calculator.
 * Generates Gantt-like timeline data for parallel consultation tracks
 * with deadlines based on RJUE legal timelines.
 */

import type { BuildingProject, ConsultedEntity } from "./types";

export interface TimelineTrack {
  entity: string;
  entityType: ConsultedEntity["type"];
  startDate: Date;
  legalDeadline: Date;
  responseDate?: Date;
  status: "pending" | "approved" | "approved_conditions" | "rejected" | "no_response" | "overdue";
  daysRemaining: number;
  daysElapsed: number;
  legalDays: number;
  urgency: "normal" | "warning" | "critical" | "overdue";
}

export interface ConsultationTimeline {
  submissionDate: Date;
  tracks: TimelineTrack[];
  overallDeadline: Date;
  criticalPath: string[];
  alerts: TimelineAlert[];
}

export interface TimelineAlert {
  type: "deadline_approaching" | "deadline_passed" | "no_response" | "all_approved";
  entity: string;
  message: string;
  date: Date;
  urgency: "info" | "warning" | "critical";
}

// RJUE legal deadlines for entity consultations (calendar days)
const ENTITY_DEADLINES: Record<string, number> = {
  "Câmara Municipal": 30,
  "ANPC / Proteção Civil": 30,
  "DGPC / Património Cultural": 30,
  "CCDR": 30,
  "APA / Agência Portuguesa do Ambiente": 30,
  "ICNF": 30,
  "IMT / Infraestruturas de Portugal": 30,
  "DGEG / Energia": 30,
  "ANACOM": 20,
  "DGS / Saúde": 30,
  "DRCA / Regional da Cultura": 30,
  "Turismo de Portugal": 20,
  "default": 30,
};

// Process-level legal deadlines (calendar days from submission)
const PROCESS_DEADLINES: Record<string, number> = {
  pip: 40,
  licensing: 65,
  communication_prior: 20,
  special_authorization: 60,
  utilization_license: 15,
};

export function calculateTimeline(project: BuildingProject): ConsultationTimeline {
  const submissionDate = project.licensing.submissionDate
    ? new Date(project.licensing.submissionDate)
    : new Date();

  const tracks: TimelineTrack[] = [];
  const alerts: TimelineAlert[] = [];
  const now = new Date();

  // Build tracks from consulted entities
  for (const entity of project.localRegulations.consultedEntities) {
    const startDate = entity.consultationDate
      ? new Date(entity.consultationDate)
      : submissionDate;

    const legalDays = ENTITY_DEADLINES[entity.name] || ENTITY_DEADLINES["default"];
    const legalDeadline = addDays(startDate, legalDays);

    const responseDate = entity.responseDate ? new Date(entity.responseDate) : undefined;

    const daysElapsed = diffDays(startDate, now);
    const daysRemaining = diffDays(now, legalDeadline);

    let status: TimelineTrack["status"] = entity.responseStatus || "pending";
    if (status === "pending" && daysRemaining < 0) {
      status = "overdue";
    }

    let urgency: TimelineTrack["urgency"] = "normal";
    if (status === "overdue" || daysRemaining < 0) {
      urgency = "overdue";
    } else if (daysRemaining <= 5) {
      urgency = "critical";
    } else if (daysRemaining <= 10) {
      urgency = "warning";
    }

    tracks.push({
      entity: entity.name,
      entityType: entity.type,
      startDate,
      legalDeadline,
      responseDate,
      status,
      daysRemaining: Math.max(0, daysRemaining),
      daysElapsed,
      legalDays,
      urgency,
    });

    // Generate alerts
    if (urgency === "overdue") {
      alerts.push({
        type: "deadline_passed",
        entity: entity.name,
        message: `Prazo legal expirado há ${Math.abs(daysRemaining)} dias. Efeito de deferimento tácito pode aplicar-se (RJUE Art. 13.º).`,
        date: legalDeadline,
        urgency: "critical",
      });
    } else if (urgency === "critical") {
      alerts.push({
        type: "deadline_approaching",
        entity: entity.name,
        message: `Prazo legal expira em ${daysRemaining} dias (${formatDate(legalDeadline)}).`,
        date: legalDeadline,
        urgency: "warning",
      });
    } else if (status === "no_response" || (status === "pending" && daysElapsed > legalDays * 0.7)) {
      alerts.push({
        type: "no_response",
        entity: entity.name,
        message: `Sem resposta após ${daysElapsed} dias. Considere enviar recordatório.`,
        date: now,
        urgency: "warning",
      });
    }
  }

  // Overall process deadline
  const processType = project.licensing.processType || "licensing";
  const processLegalDays = PROCESS_DEADLINES[processType] || 65;
  const overallDeadline = addDays(submissionDate, processLegalDays);

  // Check overall deadline
  const overallDaysRemaining = diffDays(now, overallDeadline);
  if (overallDaysRemaining < 0) {
    alerts.push({
      type: "deadline_passed",
      entity: "Processo global",
      message: `Prazo legal do processo (${processLegalDays} dias) expirado há ${Math.abs(overallDaysRemaining)} dias.`,
      date: overallDeadline,
      urgency: "critical",
    });
  } else if (overallDaysRemaining <= 7) {
    alerts.push({
      type: "deadline_approaching",
      entity: "Processo global",
      message: `Prazo legal do processo expira em ${overallDaysRemaining} dias.`,
      date: overallDeadline,
      urgency: "warning",
    });
  }

  // All approved check
  if (tracks.length > 0 && tracks.every(t => t.status === "approved" || t.status === "approved_conditions")) {
    alerts.push({
      type: "all_approved",
      entity: "Todas as entidades",
      message: "Todos os pareceres foram obtidos. O processo pode avançar.",
      date: now,
      urgency: "info",
    });
  }

  // Critical path: entities that haven't responded yet, sorted by deadline
  const criticalPath = tracks
    .filter(t => t.status === "pending" || t.status === "overdue" || t.status === "no_response")
    .sort((a, b) => a.legalDeadline.getTime() - b.legalDeadline.getTime())
    .map(t => t.entity);

  // Sort alerts by urgency
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.urgency] - order[b.urgency];
  });

  return {
    submissionDate,
    tracks: tracks.sort((a, b) => a.legalDeadline.getTime() - b.legalDeadline.getTime()),
    overallDeadline,
    criticalPath,
    alerts,
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

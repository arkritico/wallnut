/**
 * Microsoft Project XML Exporter
 *
 * Generates XML files compatible with MS Project 2007+ (and ProjectLibre)
 * from a ProjectSchedule. Includes tasks with WBS hierarchy, resources
 * (labor, material, machinery), assignments, and calendar definitions.
 *
 * Follows the Microsoft Project XML Data Interchange Schema.
 * Reference: https://learn.microsoft.com/en-us/office-project/xml-data-interchange
 */

import type { ProjectSchedule, ScheduleTask, ProjectResource, TaskResource } from "./wbs-types";

// ============================================================
// XML Escaping
// ============================================================

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================
// Duration Formatting
// ============================================================

/** Convert working days to ISO 8601 duration (PT format for MS Project) */
function formatDuration(days: number): string {
  const hours = days * 8;
  return `PT${hours}H0M0S`;
}

/** Format date for MS Project XML (YYYY-MM-DDTHH:MM:SS) */
function formatDateTime(dateStr: string, time: string = "08:00:00"): string {
  return `${dateStr}T${time}`;
}

/** Predecessor type code for MS Project (0=FF, 1=FS, 2=SF, 3=SS) */
function predTypeCode(type: "FS" | "SS" | "FF" | "SF"): number {
  switch (type) {
    case "FF": return 0;
    case "FS": return 1;
    case "SF": return 2;
    case "SS": return 3;
    default: return 1;
  }
}

/** Resource type code (0=Material, 1=Work, 2=Cost) */
function resourceTypeCode(type: "labor" | "material" | "machinery" | "subcontractor"): number {
  switch (type) {
    case "labor": return 1;          // Work resource
    case "material": return 0;       // Material resource
    case "machinery": return 2;      // Cost resource (rented equipment)
    case "subcontractor": return 2;  // Cost resource (subcontract)
    default: return 1;
  }
}

/**
 * AccrueAt code for MS Project.
 * 1 = Start (material: purchased/delivered upfront)
 * 2 = Prorated (labor: accrues as work progresses)
 * 3 = End (subcontractor/equipment: paid on completion)
 */
function accrueAtCode(type: "labor" | "material" | "machinery" | "subcontractor"): number {
  switch (type) {
    case "material": return 1;       // Start
    case "labor": return 2;          // Prorated
    case "machinery": return 3;      // End (rental invoiced on return)
    case "subcontractor": return 3;  // End (paid on milestone completion)
    default: return 2;
  }
}

// ============================================================
// XML Generation
// ============================================================

/**
 * Generate MS Project XML from a ProjectSchedule.
 * The output is compatible with MS Project 2007+, ProjectLibre, and GanttProject.
 */
export function generateMSProjectXML(schedule: ProjectSchedule): string {
  const lines: string[] = [];

  // XML header
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  lines.push('<Project xmlns="http://schemas.microsoft.com/project">');

  // Project properties
  lines.push(`  <Name>${escapeXml(schedule.projectName)}</Name>`);
  lines.push(`  <StartDate>${formatDateTime(schedule.startDate)}</StartDate>`);
  lines.push(`  <FinishDate>${formatDateTime(schedule.finishDate, "17:00:00")}</FinishDate>`);
  lines.push(`  <CalendarUID>1</CalendarUID>`);
  lines.push(`  <MinutesPerDay>480</MinutesPerDay>`);
  lines.push(`  <MinutesPerWeek>2400</MinutesPerWeek>`);
  lines.push(`  <DaysPerMonth>22</DaysPerMonth>`);
  lines.push(`  <CurrencySymbol>€</CurrencySymbol>`);
  lines.push(`  <CurrencyCode>EUR</CurrencyCode>`);
  lines.push(`  <CurrencySymbolPosition>3</CurrencySymbolPosition>`);
  lines.push(`  <CurrencyDigits>2</CurrencyDigits>`);
  lines.push(`  <Author>Wallnut - Portuguese Building Analyzer</Author>`);

  // Project notes: team summary + CCPM info
  const teamNotes = `Gerado por Wallnut. ` +
    `Equipa máx: ${schedule.teamSummary.maxWorkers} trabalhadores. ` +
    `Média: ${schedule.teamSummary.averageWorkers}. ` +
    `Total homens-hora: ${schedule.teamSummary.totalManHours}.` +
    (schedule.criticalChain
      ? ` CCPM Goldratt: buffer projeto ${schedule.criticalChain.projectBuffer.durationDays}d, ` +
        `${schedule.criticalChain.feedingBuffers.length} feeding buffers.`
      : "");
  lines.push(`  <Notes>${escapeXml(teamNotes)}</Notes>`);

  // Extended attribute definitions (custom fields)
  lines.push(`  <ExtendedAttributes>`);
  lines.push(`    <ExtendedAttribute>`);
  lines.push(`      <FieldID>188743731</FieldID>`);
  lines.push(`      <FieldName>Number1</FieldName>`);
  lines.push(`      <Alias>Equipa (trabalhadores)</Alias>`);
  lines.push(`    </ExtendedAttribute>`);
  lines.push(`  </ExtendedAttributes>`);

  // Calendar (Portuguese standard work week)
  lines.push(`  <Calendars>`);
  lines.push(`    <Calendar>`);
  lines.push(`      <UID>1</UID>`);
  lines.push(`      <Name>Calendário Padrão</Name>`);
  lines.push(`      <IsBaseCalendar>1</IsBaseCalendar>`);
  lines.push(`      <WeekDays>`);
  // Monday-Friday: working days (8h, 08:00-12:00, 13:00-17:00)
  for (let day = 2; day <= 6; day++) {
    lines.push(`        <WeekDay>`);
    lines.push(`          <DayType>${day}</DayType>`);
    lines.push(`          <DayWorking>1</DayWorking>`);
    lines.push(`          <TimePeriod>`);
    lines.push(`            <FromTime>08:00:00</FromTime>`);
    lines.push(`            <ToTime>12:00:00</ToTime>`);
    lines.push(`          </TimePeriod>`);
    lines.push(`          <TimePeriod>`);
    lines.push(`            <FromTime>13:00:00</FromTime>`);
    lines.push(`            <ToTime>17:00:00</ToTime>`);
    lines.push(`          </TimePeriod>`);
    lines.push(`        </WeekDay>`);
  }
  // Saturday & Sunday: non-working
  for (const day of [7, 1]) {
    lines.push(`        <WeekDay>`);
    lines.push(`          <DayType>${day}</DayType>`);
    lines.push(`          <DayWorking>0</DayWorking>`);
    lines.push(`        </WeekDay>`);
  }
  // Portuguese public holidays (typical year)
  const holidays = [
    "01-01", "04-18", "04-25", "05-01", "06-10",
    "06-19", "08-15", "10-05", "11-01", "12-01",
    "12-08", "12-25",
  ];
  const year = schedule.startDate.substring(0, 4);
  for (const h of holidays) {
    lines.push(`        <WeekDay>`);
    lines.push(`          <DayType>0</DayType>`);
    lines.push(`          <DayWorking>0</DayWorking>`);
    lines.push(`          <TimePeriod>`);
    lines.push(`            <FromDate>${year}-${h}T00:00:00</FromDate>`);
    lines.push(`            <ToDate>${year}-${h}T23:59:00</ToDate>`);
    lines.push(`          </TimePeriod>`);
    lines.push(`        </WeekDay>`);
  }
  lines.push(`      </WeekDays>`);
  lines.push(`    </Calendar>`);
  lines.push(`  </Calendars>`);

  // Tasks
  lines.push(`  <Tasks>`);

  // Task 0 (project summary - required by MS Project)
  lines.push(`    <Task>`);
  lines.push(`      <UID>0</UID>`);
  lines.push(`      <ID>0</ID>`);
  lines.push(`      <Name>${escapeXml(schedule.projectName)}</Name>`);
  lines.push(`      <Type>1</Type>`);
  lines.push(`      <IsNull>0</IsNull>`);
  lines.push(`      <OutlineLevel>0</OutlineLevel>`);
  lines.push(`      <Summary>1</Summary>`);
  lines.push(`      <Start>${formatDateTime(schedule.startDate)}</Start>`);
  lines.push(`      <Finish>${formatDateTime(schedule.finishDate, "17:00:00")}</Finish>`);
  lines.push(`      <Duration>${formatDuration(schedule.totalDurationDays)}</Duration>`);
  lines.push(`      <FixedCost>${schedule.totalCost.toFixed(2)}</FixedCost>`);
  lines.push(`      <PercentComplete>0</PercentComplete>`);
  lines.push(`      <PhysicalPercentComplete>0</PhysicalPercentComplete>`);
  lines.push(`      <CalendarUID>1</CalendarUID>`);
  lines.push(`    </Task>`);

  // All schedule tasks
  for (let i = 0; i < schedule.tasks.length; i++) {
    const task = schedule.tasks[i];
    lines.push(`    <Task>`);
    lines.push(`      <UID>${task.uid}</UID>`);
    lines.push(`      <ID>${i + 1}</ID>`);
    lines.push(`      <Name>${escapeXml(task.name)}</Name>`);
    lines.push(`      <Type>0</Type>`);
    lines.push(`      <IsNull>0</IsNull>`);
    lines.push(`      <WBS>${escapeXml(task.wbs)}</WBS>`);
    lines.push(`      <OutlineLevel>${task.outlineLevel}</OutlineLevel>`);
    lines.push(`      <Summary>${task.isSummary ? 1 : 0}</Summary>`);
    lines.push(`      <Critical>${schedule.criticalPath.includes(task.uid) ? 1 : 0}</Critical>`);
    lines.push(`      <Start>${formatDateTime(task.startDate)}</Start>`);
    lines.push(`      <Finish>${formatDateTime(task.finishDate, "17:00:00")}</Finish>`);
    lines.push(`      <Duration>${formatDuration(task.durationDays)}</Duration>`);
    lines.push(`      <DurationFormat>7</DurationFormat>`);
    lines.push(`      <Work>${formatDuration(Math.ceil(task.durationHours / 8))}</Work>`);
    lines.push(`      <FixedCost>${task.cost.toFixed(2)}</FixedCost>`);
    lines.push(`      <PercentComplete>${task.percentComplete}</PercentComplete>`);
    lines.push(`      <PhysicalPercentComplete>${task.physicalPercentComplete ?? task.percentComplete}</PhysicalPercentComplete>`);
    lines.push(`      <CalendarUID>1</CalendarUID>`);

    // Team size as ExtendedAttribute (Number1)
    const teamSize = task.resources
      .filter(r => r.type === "labor" || r.type === "subcontractor")
      .reduce((sum, r) => r.type === "subcontractor" ? sum + (r.teamSize ?? r.units) : sum + r.units, 0);
    if (teamSize > 0) {
      lines.push(`      <ExtendedAttribute>`);
      lines.push(`        <FieldID>188743731</FieldID>`);
      lines.push(`        <Value>${teamSize}</Value>`);
      lines.push(`      </ExtendedAttribute>`);
    }

    // Predecessors
    for (const pred of task.predecessors) {
      lines.push(`      <PredecessorLink>`);
      lines.push(`        <PredecessorUID>${pred.uid}</PredecessorUID>`);
      lines.push(`        <Type>${predTypeCode(pred.type)}</Type>`);
      if (pred.lag) {
        lines.push(`        <LinkLag>${pred.lag * 4800}</LinkLag>`);
        lines.push(`        <LagFormat>7</LagFormat>`);
      }
      lines.push(`      </PredecessorLink>`);
    }

    // Notes
    if (task.notes) {
      lines.push(`      <Notes>${escapeXml(task.notes)}</Notes>`);
    }

    lines.push(`    </Task>`);
  }

  // Critical Chain buffers (as special tasks after all regular tasks)
  if (schedule.criticalChain) {
    const cc = schedule.criticalChain;
    const allBuffers = [cc.projectBuffer, ...cc.feedingBuffers];
    for (const buffer of allBuffers) {
      const idx = schedule.tasks.length + allBuffers.indexOf(buffer) + 1;
      const bufferColor = buffer.type === "project" ? "🟢 " : "🔵 ";
      lines.push(`    <Task>`);
      lines.push(`      <UID>${buffer.uid}</UID>`);
      lines.push(`      <ID>${idx}</ID>`);
      lines.push(`      <Name>${escapeXml(buffer.name)}</Name>`);
      lines.push(`      <Type>0</Type>`);
      lines.push(`      <IsNull>0</IsNull>`);
      lines.push(`      <OutlineLevel>1</OutlineLevel>`);
      lines.push(`      <Summary>0</Summary>`);
      lines.push(`      <Critical>${buffer.type === "project" ? 1 : 0}</Critical>`);
      lines.push(`      <Start>${formatDateTime(buffer.startDate)}</Start>`);
      lines.push(`      <Finish>${formatDateTime(buffer.finishDate, "17:00:00")}</Finish>`);
      lines.push(`      <Duration>${formatDuration(buffer.durationDays)}</Duration>`);
      lines.push(`      <DurationFormat>7</DurationFormat>`);
      lines.push(`      <PercentComplete>0</PercentComplete>`);
      lines.push(`      <PhysicalPercentComplete>0</PhysicalPercentComplete>`);
      lines.push(`      <CalendarUID>1</CalendarUID>`);
      lines.push(`      <Notes>${escapeXml(
        `Buffer CCPM (Goldratt Critical Chain). ` +
        `Tipo: ${buffer.type === "project" ? "Projeto" : "Alimentação"}. ` +
        `Duração: ${buffer.durationDays} dias. ` +
        `Consumo: ${buffer.consumedPercent.toFixed(0)}%. ` +
        `Zona: ${buffer.zone === "green" ? "Verde (OK)" : buffer.zone === "yellow" ? "Amarelo (Atenção)" : "Vermelho (Crítico)"}. ` +
        `Cadeia protegida: ${buffer.feedingChain.length} tarefas.`
      )}</Notes>`);
      // Link buffer to the task it follows
      if (buffer.feedingChain.length > 0) {
        const lastInChain = buffer.feedingChain[buffer.feedingChain.length - 1];
        lines.push(`      <PredecessorLink>`);
        lines.push(`        <PredecessorUID>${lastInChain}</PredecessorUID>`);
        lines.push(`        <Type>1</Type>`); // FS
        lines.push(`      </PredecessorLink>`);
      }
      lines.push(`    </Task>`);
    }
  }

  lines.push(`  </Tasks>`);

  // Resources
  lines.push(`  <Resources>`);

  // Resource 0 (unassigned - required by MS Project)
  lines.push(`    <Resource>`);
  lines.push(`      <UID>0</UID>`);
  lines.push(`      <ID>0</ID>`);
  lines.push(`      <Name>Unassigned</Name>`);
  lines.push(`      <Type>1</Type>`);
  lines.push(`      <IsNull>0</IsNull>`);
  lines.push(`    </Resource>`);

  for (const res of schedule.resources) {
    const msType = resourceTypeCode(res.type);
    lines.push(`    <Resource>`);
    lines.push(`      <UID>${res.uid}</UID>`);
    lines.push(`      <ID>${res.uid}</ID>`);
    lines.push(`      <Name>${escapeXml(res.name)}</Name>`);
    lines.push(`      <Type>${msType}</Type>`);
    lines.push(`      <IsNull>0</IsNull>`);
    // Cost resources (Type 2) have no rate — only assignment-level cost
    if (msType !== 2) {
      lines.push(`      <StandardRate>${res.standardRate.toFixed(2)}</StandardRate>`);
      lines.push(`      <StandardRateFormat>${res.type === "material" ? "5" : "2"}</StandardRateFormat>`);
    }
    lines.push(`      <AccrueAt>${accrueAtCode(res.type)}</AccrueAt>`);
    lines.push(`      <Cost>${res.totalCost.toFixed(2)}</Cost>`);
    if (res.type === "material") {
      lines.push(`      <MaterialLabel>un</MaterialLabel>`);
    }
    // Subcontractor: note the team size
    if (res.type === "subcontractor" && res.teamSize) {
      lines.push(`      <Notes>${escapeXml(
        `Subempreiteiro. Equipa: ${res.teamSize} trabalhadores.`
      )}</Notes>`);
    }
    lines.push(`      <CalendarUID>1</CalendarUID>`);
    lines.push(`    </Resource>`);
  }

  lines.push(`  </Resources>`);

  // Assignments
  lines.push(`  <Assignments>`);
  let assignmentUid = 0;

  for (const task of schedule.tasks) {
    if (task.isSummary) continue;

    for (const res of task.resources) {
      // Find the matching project resource
      const projRes = schedule.resources.find(
        r => r.name === res.name && r.type === res.type
      );
      if (!projRes) continue;

      const msType = resourceTypeCode(res.type);
      assignmentUid++;
      lines.push(`    <Assignment>`);
      lines.push(`      <UID>${assignmentUid}</UID>`);
      lines.push(`      <TaskUID>${task.uid}</TaskUID>`);
      lines.push(`      <ResourceUID>${projRes.uid}</ResourceUID>`);

      if (msType === 1) {
        // Work resource (labor): units + work hours
        lines.push(`      <Units>${res.units}</Units>`);
        lines.push(`      <Work>${formatDuration(Math.ceil(res.hours / 8))}</Work>`);
      } else if (msType === 0) {
        // Material resource: units only (no work hours)
        lines.push(`      <Units>${res.units}</Units>`);
      }
      // Cost resources (Type 2): no Units or Work — just Cost

      lines.push(`      <Start>${formatDateTime(task.startDate)}</Start>`);
      lines.push(`      <Finish>${formatDateTime(task.finishDate, "17:00:00")}</Finish>`);

      // Cost calculation per type
      let assignmentCost: number;
      if (res.type === "labor") {
        assignmentCost = res.hours * res.rate;
      } else {
        // material, machinery, subcontractor: units × rate
        assignmentCost = res.units * res.rate;
      }
      lines.push(`      <Cost>${assignmentCost.toFixed(2)}</Cost>`);

      // Subcontractor: note team size on assignment
      if (res.type === "subcontractor" && res.teamSize) {
        lines.push(`      <Notes>${escapeXml(
          `Equipa subempreiteiro: ${res.teamSize} trabalhadores`
        )}</Notes>`);
      }

      lines.push(`    </Assignment>`);
    }
  }

  lines.push(`  </Assignments>`);
  lines.push(`</Project>`);

  return lines.join("\n");
}

/**
 * Generate and trigger download of the MS Project XML file.
 */
export function downloadMSProjectXML(schedule: ProjectSchedule): void {
  const xml = generateMSProjectXML(schedule);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${schedule.projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_schedule.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a summary text report of the schedule (for display in UI).
 */
export function generateScheduleSummary(schedule: ProjectSchedule): string {
  const lines: string[] = [];

  lines.push(`=== ${schedule.projectName} ===`);
  lines.push(`Início: ${schedule.startDate} | Conclusão: ${schedule.finishDate}`);
  lines.push(`Duração total: ${schedule.totalDurationDays} dias úteis (~${Math.ceil(schedule.totalDurationDays / 22)} meses)`);
  lines.push(`Custo total estimado: €${schedule.totalCost.toLocaleString("pt-PT")}`);
  lines.push("");
  lines.push(`--- Equipa ---`);
  lines.push(`Máx. trabalhadores: ${schedule.teamSummary.maxWorkers}`);
  lines.push(`Média trabalhadores: ${schedule.teamSummary.averageWorkers}`);
  lines.push(`Total homens-hora: ${schedule.teamSummary.totalManHours.toLocaleString("pt-PT")}`);
  lines.push("");
  lines.push(`--- Fases ---`);

  const summaryTasks = schedule.tasks.filter(t => t.isSummary);
  for (const task of summaryTasks) {
    const isCritical = schedule.criticalPath.includes(task.uid) ? " [CRÍTICO]" : "";
    lines.push(`  ${task.name}: ${task.startDate} → ${task.finishDate} (${task.durationDays}d)${isCritical}`);
    if (task.cost > 0) {
      lines.push(`    Custo: €${task.cost.toLocaleString("pt-PT")}`);
    }
  }

  lines.push("");
  lines.push(`--- Recursos ---`);
  const laborRes = schedule.resources.filter(r => r.type === "labor");
  for (const r of laborRes) {
    lines.push(`  ${r.name}: ${r.totalHours.toFixed(0)}h (€${r.totalCost.toLocaleString("pt-PT")})`);
  }
  const subRes = schedule.resources.filter(r => r.type === "subcontractor");
  for (const r of subRes) {
    const team = r.teamSize ? ` [equipa: ${r.teamSize}]` : "";
    lines.push(`  ${r.name}: €${r.totalCost.toLocaleString("pt-PT")}${team}`);
  }

  // Critical Chain summary
  if (schedule.criticalChain) {
    const cc = schedule.criticalChain;
    lines.push("");
    lines.push(`--- Critical Chain (Goldratt CCPM) ---`);
    lines.push(`Duração original (com proteção): ${cc.originalDurationDays} dias`);
    lines.push(`Duração agressiva (sem proteção): ${cc.aggressiveDurationDays} dias (-${cc.safetyReductionPercent}%)`);
    lines.push(`Buffer de projeto: ${cc.projectBuffer.durationDays} dias [${cc.projectBuffer.zone.toUpperCase()}]`);
    lines.push(`Duração CCPM final: ${cc.ccpmDurationDays} dias (~${Math.ceil(cc.ccpmDurationDays / 22)} meses)`);
    lines.push(`Rácio buffer/projeto: ${(cc.bufferRatio * 100).toFixed(0)}%`);

    if (cc.feedingBuffers.length > 0) {
      lines.push(`Feeding buffers: ${cc.feedingBuffers.length}`);
      for (const fb of cc.feedingBuffers) {
        lines.push(`  ${fb.name}: ${fb.durationDays}d [${fb.zone.toUpperCase()}]`);
      }
    }
  }

  return lines.join("\n");
}

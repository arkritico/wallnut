import { CalendarClock, Download } from "lucide-react";
import { phaseColor, phaseLabel } from "@/lib/phase-colors";
import type { LicensingPhasesResult } from "@/lib/licensing-phases";
import Section from "./Section";

const LICENSING_PHASE_ORDER = [
  "licensing_preparation", "specialty_projects", "external_consultations",
  "licensing_approval", "construction_authorization", "utilization_authorization",
] as const;

const pathwayLabels: Record<string, { label: string; color: string }> = {
  exempt: { label: "Isento", color: "bg-green-100 text-green-800 border-green-300" },
  comunicacao_previa: { label: "Comunicação Prévia", color: "bg-blue-100 text-blue-800 border-blue-300" },
  licenciamento: { label: "Licenciamento", color: "bg-amber-100 text-amber-800 border-amber-300" },
  public_entity_exempt: { label: "Isento (Entidade Pública)", color: "bg-green-100 text-green-800 border-green-300" },
};

export default function LicensingGantt({ licensingResult, projectName, open, onToggle }: {
  licensingResult: LicensingPhasesResult;
  projectName: string;
  open: boolean;
  onToggle: () => void;
}) {
  const lr = licensingResult;
  const pw = lr.pathway;
  const pwStyle = pathwayLabels[pw.pathway] ?? pathwayLabels.licenciamento;

  const allTasks = lr.preConstructionTasks.concat(lr.postConstructionTasks);
  const tasksByPhase = new Map<string, typeof allTasks>();
  for (const t of allTasks) {
    const list = tasksByPhase.get(t.phase) ?? [];
    list.push(t);
    tasksByPhase.set(t.phase, list);
  }
  const allStarts = allTasks.map(t => new Date(t.startDate).getTime());
  const allFinishes = allTasks.map(t => new Date(t.finishDate).getTime());
  const timelineStart = Math.min(...allStarts);
  const timelineEnd = Math.max(...allFinishes);
  const totalSpan = timelineEnd - timelineStart || 1;

  const activePhases = LICENSING_PHASE_ORDER.filter(p => tasksByPhase.has(p));
  const leafTasks = allTasks.filter(t => !t.isSummary);

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });

  return (
    <Section
      title={`Cronograma de Licenciamento (${lr.summary.totalPreConstructionDays}d pré-obra${lr.summary.totalPostConstructionDays > 0 ? ` + ${lr.summary.totalPostConstructionDays}d pós-obra` : ""})`}
      id="licensing-gantt"
      icon={<CalendarClock className="w-5 h-5 text-blue-600" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        {/* Pathway summary */}
        <div className={`rounded-lg border p-3 ${pwStyle.color}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="font-semibold text-sm">{pwStyle.label}</span>
              <span className="text-xs ml-2 opacity-75">({pw.legalBasis})</span>
            </div>
            <div className="flex gap-3 text-xs">
              <span>{pw.baseApprovalDays}d aprovação</span>
              <span>{lr.summary.requiredSpecialties} especialidades</span>
              <span>{lr.summary.requiredConsultations} consultas</span>
            </div>
          </div>
          <p className="text-xs mt-1 opacity-80">{pw.reason}</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
            <p className="text-2xl font-bold text-blue-700">{lr.summary.totalPreConstructionDays}d</p>
            <p className="text-xs text-blue-600">Pré-construção</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
            <p className="text-2xl font-bold text-purple-700">{lr.summary.totalPostConstructionDays}d</p>
            <p className="text-xs text-purple-600">Pós-construção</p>
          </div>
          <div className="bg-sky-50 rounded-lg p-3 text-center border border-sky-200">
            <p className="text-2xl font-bold text-sky-700">{lr.summary.requiredSpecialties}</p>
            <p className="text-xs text-sky-600">Especialidades</p>
          </div>
          <div className="bg-indigo-50 rounded-lg p-3 text-center border border-indigo-200">
            <p className="text-2xl font-bold text-indigo-700">{lr.summary.criticalPathEntity}</p>
            <p className="text-xs text-indigo-600">Caminho crítico</p>
          </div>
        </div>

        {/* Inline Gantt */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">
            {formatDate(allTasks[0]?.startDate ?? "")} — {formatDate(allTasks[allTasks.length - 1]?.finishDate ?? "")}
          </p>
          <div className="space-y-1">
            {activePhases.map(phase => {
              const phaseTasks = tasksByPhase.get(phase) ?? [];
              const phaseStarts = phaseTasks.map(t => new Date(t.startDate).getTime());
              const phaseFinishes = phaseTasks.map(t => new Date(t.finishDate).getTime());
              const pStart = Math.min(...phaseStarts);
              const pEnd = Math.max(...phaseFinishes);
              const leftPct = ((pStart - timelineStart) / totalSpan) * 100;
              const widthPct = Math.max(1, ((pEnd - pStart) / totalSpan) * 100);
              const durationDays = Math.ceil((pEnd - pStart) / (1000 * 60 * 60 * 24));
              const taskNames = phaseTasks.filter(t => !t.isSummary).map(t => t.name).join(", ");

              return (
                <div key={phase} className="flex items-center gap-1" style={{ height: 22 }}>
                  <div className="flex-shrink-0 text-[10px] text-gray-600 truncate text-right pr-1" style={{ width: 100 }}>
                    {phaseLabel(phase)}
                  </div>
                  <div className="flex-1 relative h-full bg-gray-100 rounded-sm">
                    <div
                      className="absolute top-0.5 rounded-sm transition-all"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        height: 16,
                        backgroundColor: phaseColor(phase),
                        minWidth: 4,
                      }}
                      title={`${phaseLabel(phase)}: ${formatDate(new Date(pStart).toISOString())} — ${formatDate(new Date(pEnd).toISOString())}\n${taskNames}`}
                    >
                      {widthPct > 12 && (
                        <span className="text-[8px] text-white px-1 truncate block leading-4">{durationDays}d</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-[9px] text-gray-400 w-6 text-right">{durationDays}d</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Task detail table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-1.5 px-2 text-left font-medium">WBS</th>
                <th className="py-1.5 px-2 text-left font-medium">Tarefa</th>
                <th className="py-1.5 px-2 text-right font-medium">Duração</th>
                <th className="py-1.5 px-2 text-left font-medium">Início</th>
                <th className="py-1.5 px-2 text-left font-medium">Fim</th>
                <th className="py-1.5 px-2 text-left font-medium hidden md:table-cell">Nota</th>
              </tr>
            </thead>
            <tbody>
              {leafTasks.map(task => (
                <tr key={task.uid} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-1.5 px-2 font-mono text-gray-400">{task.wbs}</td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: phaseColor(task.phase) }} />
                      <span className="text-gray-800">{task.name}</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-right text-gray-600">{task.durationDays}d</td>
                  <td className="py-1.5 px-2 text-gray-500">{formatDate(task.startDate)}</td>
                  <td className="py-1.5 px-2 text-gray-500">{formatDate(task.finishDate)}</td>
                  <td className="py-1.5 px-2 text-gray-400 hidden md:table-cell max-w-[200px] truncate">{task.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Export button */}
        <button
          onClick={() => {
            const json = JSON.stringify(lr, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `licensing-timeline-${projectName.replace(/\s+/g, "-")}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Download className="w-4 h-4" /> Exportar Cronograma de Licenciamento
        </button>
      </div>
    </Section>
  );
}

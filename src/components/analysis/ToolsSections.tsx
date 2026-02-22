import { lazy, Suspense } from "react";
import type { AnalysisResult, Finding } from "@/lib/types";
import type { BuildingProject } from "@/lib/types";
import { ClipboardList, MessageSquare, CalendarClock, GitCompareArrows, Wrench, Download } from "lucide-react";
import type { Checklist } from "@/lib/checklist-generator";
import { findingsToWbs } from "@/lib/findings-to-wbs";
import Section from "./Section";

const AiAssistant = lazy(() => import("@/components/AiAssistant"));
const ConsultationTimelineView = lazy(() => import("@/components/ConsultationTimelineView"));
const VersionDiffView = lazy(() => import("@/components/VersionDiffView"));

export function ChecklistsSection({ checklists, open, onToggle }: {
  checklists: Checklist[];
  open: boolean;
  onToggle: () => void;
}) {
  if (checklists.length === 0) return null;

  return (
    <Section
      title={`Checklists (${checklists.length} especialidades)`}
      id="checklists"
      icon={<ClipboardList className="w-5 h-5 text-gray-500" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        {checklists.map(cl => (
          <div key={cl.specialty} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-gray-500" />
              <h4 className="font-semibold text-sm text-gray-800">{cl.title}</h4>
              <span className="text-xs text-gray-500 ml-auto">{cl.items.length} itens</span>
            </div>
            <div className="p-3 space-y-2">
              {cl.items.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 ${item.critical ? "text-red-400" : "text-gray-300"}`}>
                    {item.critical ? "!" : "-"}
                  </span>
                  <div>
                    <p className="text-gray-700">{item.description}</p>
                    <p className="text-xs text-gray-500">{item.regulation} - {item.article}</p>
                  </div>
                </div>
              ))}
              {cl.items.length > 5 && (
                <p className="text-xs text-gray-500">+{cl.items.length - 5} itens adicionais</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function AiAssistantSection({ project, result, open, onToggle }: {
  project: BuildingProject;
  result: AnalysisResult;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Section
      title="Assistente IA Regulamentar"
      id="ai-assistant"
      icon={<MessageSquare className="w-5 h-5 text-accent" />}
      open={open}
      onToggle={onToggle}
    >
      <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
        <AiAssistant project={project} analysis={result} />
      </Suspense>
    </Section>
  );
}

export function ConsultationTimelineSection({ project, open, onToggle }: {
  project: BuildingProject;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Section
      title="Cronograma de Consultas (RJUE)"
      id="consultation-timeline"
      icon={<CalendarClock className="w-5 h-5 text-emerald-600" />}
      open={open}
      onToggle={onToggle}
    >
      <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
        <ConsultationTimelineView project={project} />
      </Suspense>
    </Section>
  );
}

export function VersionDiffSection({ project, result, open, onToggle }: {
  project: BuildingProject;
  result: AnalysisResult;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Section
      title="Histórico de Versões"
      id="version-diff"
      icon={<GitCompareArrows className="w-5 h-5 text-violet-600" />}
      open={open}
      onToggle={onToggle}
    >
      <Suspense fallback={<div className="text-sm text-gray-400 py-4 text-center">A carregar...</div>}>
        <VersionDiffView project={project} analysis={result} />
      </Suspense>
    </Section>
  );
}

export function RemediationSection({ findings, result, remediationSummary, open, onToggle }: {
  findings: Finding[];
  result: AnalysisResult;
  remediationSummary: { criticalCount: number; warningCount: number; totalTasks: number; estimatedTotalDays: number };
  open: boolean;
  onToggle: () => void;
}) {
  if (remediationSummary.totalTasks === 0) return null;

  return (
    <Section
      title={`Plano de Remediação (${remediationSummary.criticalCount} críticas, ${remediationSummary.warningCount} avisos)`}
      id="remediation-wbs"
      icon={<Wrench className="w-5 h-5 text-orange-600" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
            <p className="text-2xl font-bold text-red-700">{remediationSummary.criticalCount}</p>
            <p className="text-xs text-red-600">Não-conformidades</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
            <p className="text-2xl font-bold text-amber-700">{remediationSummary.warningCount}</p>
            <p className="text-xs text-amber-600">Avisos</p>
          </div>
          <div className="bg-accent-light rounded-lg p-3 text-center border border-accent">
            <p className="text-2xl font-bold text-accent">{remediationSummary.totalTasks}</p>
            <p className="text-xs text-accent">Tarefas WBS</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
            <p className="text-2xl font-bold text-purple-700">~{remediationSummary.estimatedTotalDays}d</p>
            <p className="text-xs text-purple-600">Duração estimada</p>
          </div>
        </div>

        <button
          onClick={() => {
            const articles = findingsToWbs(findings);
            const json = JSON.stringify(articles, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `remediation-wbs-${result.projectName.replace(/\s+/g, "-")}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
        >
          <Download className="w-4 h-4" /> Exportar WBS de Remediação
        </button>
      </div>
    </Section>
  );
}

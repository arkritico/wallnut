"use client";

import { useMemo } from "react";
import type { BuildingProject } from "@/lib/types";
import {
  calculateTimeline,
  type ConsultationTimeline,
  type TimelineTrack,
  type TimelineAlert,
} from "@/lib/consultation-timeline";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Info,
} from "lucide-react";

interface ConsultationTimelineViewProps {
  project: BuildingProject;
}

function formatDatePT(d: Date): string {
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export default function ConsultationTimelineView({ project }: ConsultationTimelineViewProps) {
  const timeline = useMemo(() => calculateTimeline(project), [project]);

  if (!project.localRegulations.consultedEntities.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm mb-2">Nenhuma entidade consultada registada.</p>
        <p className="text-xs text-gray-400">
          Adicione as entidades consultadas no formulário do projeto (secção &quot;Regulamentação Municipal&quot;)
          para visualizar prazos e estado das consultas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-sm">
          <span className="text-gray-500">Submissão:</span>{" "}
          <span className="font-medium text-gray-800">{formatDatePT(timeline.submissionDate)}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">Prazo global:</span>{" "}
          <span className="font-medium text-gray-800">{formatDatePT(timeline.overallDeadline)}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">Entidades:</span>{" "}
          <span className="font-medium text-gray-800">{timeline.tracks.length}</span>
        </div>
      </div>

      {/* Alerts */}
      {timeline.alerts.length > 0 && (
        <div className="space-y-2">
          {timeline.alerts.map((alert, i) => (
            <AlertCard key={i} alert={alert} />
          ))}
        </div>
      )}

      {/* Timeline tracks */}
      <div className="space-y-2">
        {timeline.tracks.map((track, i) => (
          <TrackBar key={i} track={track} />
        ))}
      </div>

      {/* Critical path */}
      {timeline.criticalPath.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-800 mb-1">Caminho crítico (entidades pendentes):</p>
          <div className="flex flex-wrap gap-2">
            {timeline.criticalPath.map((entity, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded">
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackBar({ track }: { track: TimelineTrack }) {
  const urgencyColors = {
    normal: "bg-green-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    overdue: "bg-red-700",
  };

  const statusLabels: Record<TimelineTrack["status"], string> = {
    pending: "Pendente",
    approved: "Aprovado",
    approved_conditions: "Aprovado c/ condições",
    rejected: "Rejeitado",
    no_response: "Sem resposta",
    overdue: "Prazo expirado",
  };

  const statusIcons: Record<TimelineTrack["status"], React.ReactNode> = {
    pending: <Clock className="w-4 h-4 text-gray-400" />,
    approved: <CheckCircle className="w-4 h-4 text-green-500" />,
    approved_conditions: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    rejected: <XCircle className="w-4 h-4 text-red-500" />,
    no_response: <Clock className="w-4 h-4 text-gray-400" />,
    overdue: <XCircle className="w-4 h-4 text-red-700" />,
  };

  const totalDays = track.legalDays;
  const elapsed = track.daysElapsed;
  const progress = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));

  return (
    <div className="p-3 bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {statusIcons[track.status]}
          <span className="text-sm font-medium text-gray-800">{track.entity}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{statusLabels[track.status]}</span>
          {track.daysRemaining > 0 && track.status === "pending" && (
            <span className={`font-medium ${
              track.urgency === "critical" ? "text-red-600" :
              track.urgency === "warning" ? "text-amber-600" : "text-gray-600"
            }`}>
              {track.daysRemaining}d restantes
            </span>
          )}
        </div>
      </div>
      {/* Progress bar */}
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${urgencyColors[track.urgency]}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-400">
        <span>{formatDateShort(track.startDate)}</span>
        <span>{track.legalDays} dias legais</span>
        <span>{formatDateShort(track.legalDeadline)}</span>
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: TimelineAlert }) {
  const urgencyStyles = {
    critical: "bg-red-50 border-red-200 text-red-700",
    warning: "bg-amber-50 border-amber-200 text-amber-700",
    info: "bg-accent-light border-accent text-accent",
  };

  const urgencyIcons = {
    critical: <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-accent flex-shrink-0" />,
  };

  return (
    <div className={`flex items-start gap-2 p-3 border rounded-lg text-sm ${urgencyStyles[alert.urgency]}`}>
      {urgencyIcons[alert.urgency]}
      <div>
        <span className="font-medium">{alert.entity}:</span> {alert.message}
      </div>
    </div>
  );
}

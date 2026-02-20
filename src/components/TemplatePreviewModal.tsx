"use client";

import { X } from "lucide-react";
import type { ProjectTemplate } from "@/lib/templates";
import { useI18n } from "@/lib/i18n";

interface TemplatePreviewModalProps {
  template: ProjectTemplate;
  onClose: () => void;
  onSelect: () => void;
}

export default function TemplatePreviewModal({
  template,
  onClose,
  onSelect,
}: TemplatePreviewModalProps) {
  const { t, lang } = useI18n();
  const p = template.project;

  const features: string[] = [];
  if (p.structural?.structuralSystem) features.push(`${lang === "pt" ? "Estrutura" : "Structure"}: ${p.structural.structuralSystem.replace(/_/g, " ")}`);
  if (p.systems?.hasSolarPV) features.push(`Solar PV: ${p.systems.solarPVCapacity ?? "?"} kW`);
  if (p.systems?.hasSolarThermal) features.push(`${lang === "pt" ? "Solar térmico" : "Solar thermal"}: ${p.systems.solarThermalArea ?? "?"} m²`);
  if (p.fireSafety?.hasSprinklers) features.push(lang === "pt" ? "Sprinklers" : "Sprinklers");
  if (p.accessibility?.hasElevator) features.push(lang === "pt" ? "Elevador acessível" : "Accessible elevator");
  if (p.avac?.hasHVACProject) features.push(lang === "pt" ? "Projeto AVAC completo" : "Full HVAC project");
  if (p.electrical?.hasEVCharging) features.push(lang === "pt" ? "Carregamento EV" : "EV charging");
  if (p.electrical?.hasEmergencyCircuit) features.push(lang === "pt" ? "Circuito emergência" : "Emergency circuit");
  if (p.envelope?.hasHRV) features.push("HRV");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{template.icon}</span>
            <h2 className="text-lg font-bold text-gray-900">
              {t[template.nameKey as keyof typeof t] || p.name}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5">
          <p className="text-sm text-gray-500">
            {t[template.descriptionKey as keyof typeof t] || ""}
          </p>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label={lang === "pt" ? "Área bruta" : "Gross area"}
              value={`${p.grossFloorArea} m²`}
            />
            <MetricCard
              label={lang === "pt" ? "Pisos" : "Floors"}
              value={`${p.numberOfFloors}`}
            />
            <MetricCard
              label={lang === "pt" ? "Tipo" : "Type"}
              value={p.buildingType?.replace(/_/g, " ") ?? "-"}
            />
            <MetricCard
              label={lang === "pt" ? "Potência" : "Power"}
              value={`${p.electrical?.contractedPower ?? "-"} kVA`}
            />
          </div>

          {/* Features */}
          {features.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                {lang === "pt" ? "Características" : "Features"}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {features.map((f, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-full"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Specialty coverage */}
          <div>
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              {lang === "pt" ? "Especialidades pré-preenchidas" : "Pre-filled specialties"}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["architecture", "Arq."],
                ["structural", "Est."],
                ["fireSafety", "SCIE"],
                ["avac", "AVAC"],
                ["electrical", "Elét."],
                ["envelope", "Env."],
                ["systems", "Sist."],
                ["accessibility", "Acess."],
                ["licensing", "Lic."],
              ].map(([key, label]) => (
                <span
                  key={key}
                  className={`px-2 py-0.5 text-[10px] rounded-full ${
                    p[key as keyof typeof p]
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {lang === "pt" ? "Cancelar" : "Cancel"}
          </button>
          <button
            onClick={() => { onSelect(); onClose(); }}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            {lang === "pt" ? "Usar este modelo" : "Use this template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 p-3 rounded-lg">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-base font-semibold text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback } from "react";
import type { BuildingProject } from "@/lib/types";
import { CLIMATE_DATA } from "@/lib/regulations";
import { DEFAULT_PROJECT } from "@/lib/defaults";
import { calculateSectionCompletion, getRelevantSections, computeEngineReadiness } from "@/lib/section-completion";
import { getFieldHelp } from "@/lib/contextual-help";
import { useI18n } from "@/lib/i18n";
import DynamicFormSection from "./DynamicFormSection";
import IfcEnrichmentBanner from "./IfcEnrichmentBanner";
import { getFieldMappingsByPlugin } from "@/lib/plugins";
import type { IfcEnrichmentReport } from "@/lib/ifc-enrichment";
import { FORM_SECTIONS, getSectionPriority } from "@/lib/form-section-registry";

// Custom section components (Tier 3)
import ContextSection from "./form-sections/ContextSection";
import GeneralSection from "./form-sections/GeneralSection";
import LocalRegulationsSection from "./form-sections/LocalRegulationsSection";

interface ProjectFormProps {
  onSubmit: (project: BuildingProject) => void;
  isLoading: boolean;
  initialProject?: BuildingProject;
  /** Auto-expand this section on mount (from results → form bridge) */
  initialSection?: string;
}

export default function ProjectForm({ onSubmit, isLoading, initialProject, initialSection }: ProjectFormProps) {
  const { t } = useI18n();
  const [project, setProject] = useState<BuildingProject>(initialProject ?? DEFAULT_PROJECT);
  const [activeSection, setActiveSection] = useState<string>(initialSection || "context");
  const [showAllSections, setShowAllSections] = useState(false);
  const [helpField, setHelpField] = useState<string | null>(null);

  // Section completion indicators
  const completion = useMemo(() => calculateSectionCompletion(project), [project]);

  // Progressive disclosure: only show relevant sections
  const relevantSections = useMemo(
    () => getRelevantSections(project.buildingType, project.isRehabilitation),
    [project.buildingType, project.isRehabilitation],
  );

  // Section priority per building type
  const sectionPriority = useMemo(
    () => getSectionPriority(project.buildingType),
    [project.buildingType],
  );

  // Engine readiness (which deep analyzers can run with current data)
  const engineReadiness = useMemo(() => computeEngineReadiness(project), [project]);
  const readyCount = engineReadiness.filter(e => e.ready).length;

  // Tab definitions from registry
  const sections = useMemo(
    () => FORM_SECTIONS.map(s => ({ id: s.sectionId, label: t[s.labelKey] as string })),
    [t],
  );

  const visibleSections = showAllSections
    ? sections
    : sections.filter(s => relevantSections.includes(s.id));

  // Field mappings for dynamic form sections (from plugin JSON)
  const fieldMappingsByPlugin = useMemo(() => {
    try {
      return getFieldMappingsByPlugin();
    } catch {
      return {};
    }
  }, []);

  // ---- Update helpers ----

  function updateField<K extends keyof BuildingProject>(key: K, value: BuildingProject[K]) {
    setProject(prev => ({ ...prev, [key]: value }));
  }

  function updateLocation(field: string, value: string | number) {
    setProject(prev => {
      const newLocation = { ...prev.location, [field]: value };
      if (field === "district" && typeof value === "string" && CLIMATE_DATA[value]) {
        const climate = CLIMATE_DATA[value];
        newLocation.climateZoneWinter = climate.winter;
        newLocation.climateZoneSummer = climate.summer;
      }
      return { ...prev, location: newLocation };
    });
  }

  function updateProjectContext(field: string, value: string | string[]) {
    setProject(prev => ({
      ...prev,
      projectContext: { ...prev.projectContext, [field]: value },
    }));
  }

  function updateLocalRegulations(field: string, value: string) {
    setProject(prev => ({
      ...prev,
      localRegulations: { ...prev.localRegulations, [field]: value },
    }));
  }

  // Generic update for dynamic form fields (dot-notation path)
  const updateDynamicField = useCallback((fieldPath: string, value: unknown) => {
    setProject(prev => {
      const parts = fieldPath.split(".");
      if (parts.length === 1) {
        return { ...prev, [parts[0]]: value };
      }

      const [section, ...rest] = parts;
      const sectionData = (prev as Record<string, unknown>)[section];
      const sectionObj = (typeof sectionData === "object" && sectionData !== null)
        ? { ...(sectionData as Record<string, unknown>) }
        : {};

      let current = sectionObj;
      for (let i = 0; i < rest.length - 1; i++) {
        const part = rest[i];
        if (typeof current[part] !== "object" || current[part] === null) {
          current[part] = {};
        } else {
          current[part] = { ...(current[part] as Record<string, unknown>) };
        }
        current = current[part] as Record<string, unknown>;
      }
      current[rest[rest.length - 1]] = value;

      return { ...prev, [section]: sectionObj };
    });
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(project);
  }

  // IFC enrichment report (attached when IFC files were uploaded in wizard)
  const ifcReport = (initialProject as Record<string, unknown> | undefined)?._ifcEnrichmentReport as IfcEnrichmentReport | undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* IFC enrichment banner */}
      {ifcReport && <IfcEnrichmentBanner report={ifcReport} />}

      {/* Section tabs with completion + priority indicators */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3" role="tablist" aria-label={t.projectData}>
        {visibleSections.map(s => {
          const comp = completion[s.id];
          const dotColor = comp?.status === "complete"
            ? "bg-green-400"
            : comp?.status === "partial"
              ? "bg-amber-400"
              : "bg-gray-300";
          const priority = sectionPriority[s.id] ?? "optional";
          const isActive = activeSection === s.id;

          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`section-${s.id}`}
              id={`tab-${s.id}`}
              onClick={() => setActiveSection(s.id)}
              className={`relative px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : priority === "essential"
                    ? "bg-gray-100 text-gray-800 hover:bg-gray-200 ring-1 ring-gray-300"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              title={priority === "essential" ? "Secção essencial para esta tipologia" : priority === "recommended" ? "Secção recomendada" : "Secção opcional"}
            >
              {s.label}
              {priority === "essential" && !isActive && (
                <span className="ml-1 text-xs text-accent opacity-70">*</span>
              )}
              <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${dotColor} border-2 border-white`} aria-hidden="true" />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowAllSections(!showAllSections)}
          className="px-3 py-2 text-xs text-gray-500 hover:text-accent transition-colors"
          title={showAllSections ? "Mostrar apenas relevantes" : "Mostrar todas as secções"}
        >
          {showAllSections ? "Menos" : `+${sections.length - visibleSections.length}`}
        </button>
      </div>

      {/* Priority legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="text-accent font-medium">*</span> Essencial
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Completa
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Parcial
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Vazia
        </span>
      </div>

      {/* Engine readiness bar */}
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="text-gray-500 font-medium">Motores:</span>
        {engineReadiness.map(e => (
          <button
            key={e.id}
            type="button"
            onClick={() => setActiveSection(e.section)}
            className={`px-2 py-0.5 rounded-full border transition-colors ${
              e.ready
                ? "bg-green-50 border-green-300 text-green-700"
                : "bg-gray-50 border-gray-200 text-gray-400 hover:border-accent hover:text-accent"
            }`}
            title={e.ready ? `${e.label} pronto` : `${e.label} — dados em falta`}
          >
            {e.ready ? "\u2713" : "\u25CB"} {e.label}
          </button>
        ))}
        <span className="text-gray-400 ml-1">{readyCount}/4</span>
      </div>

      {/* Contextual help tooltip */}
      {helpField && (() => {
        const help = getFieldHelp(helpField);
        if (!help) return null;
        return (
          <div className="bg-accent-light border border-accent rounded-lg p-4 text-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-accent">{help.label}</p>
                <p className="text-accent text-xs mt-0.5">{help.regulation} - {help.article}</p>
              </div>
              <button type="button" onClick={() => setHelpField(null)} className="text-accent/60 hover:text-accent text-lg leading-none">&times;</button>
            </div>
            <p className="text-accent mt-2">{help.description}</p>
            {help.requirement && <p className="text-accent mt-1 text-xs"><strong>Requisito:</strong> {help.requirement}</p>}
            {help.example && <p className="text-accent mt-1 text-xs">Exemplo: {help.example}</p>}
          </div>
        );
      })()}

      {/* ---- Tier 3: Custom section components ---- */}

      {activeSection === "context" && (
        <ContextSection
          project={project}
          updateProjectContext={updateProjectContext}
          t={t}
        />
      )}

      {activeSection === "general" && (
        <GeneralSection
          project={project}
          updateField={updateField}
          updateLocation={updateLocation}
          updateDynamicField={updateDynamicField}
          dynamicFields={fieldMappingsByPlugin["general"]?.fields}
          t={t}
        />
      )}

      {activeSection === "local" && (
        <LocalRegulationsSection
          project={project}
          setProject={setProject}
          updateLocalRegulations={updateLocalRegulations}
          updateDynamicField={updateDynamicField}
          dynamicFields={fieldMappingsByPlugin["municipal"]?.fields}
        />
      )}

      {/* ---- Tier 1/2: Dynamic sections from field-mappings.json ---- */}

      {FORM_SECTIONS.filter(s => !s.hasCustomRenderer).map(sectionConfig => {
        if (activeSection !== sectionConfig.sectionId) return null;
        const pluginId = sectionConfig.pluginId;
        if (!pluginId) return null;
        const pluginData = fieldMappingsByPlugin[pluginId];
        if (!pluginData?.fields?.length) return null;

        return (
          <div key={sectionConfig.sectionId} id={`section-${sectionConfig.sectionId}`} role="tabpanel" aria-labelledby={`tab-${sectionConfig.sectionId}`}>
            <DynamicFormSection
              fields={pluginData.fields}
              values={project as unknown as Record<string, unknown>}
              onChange={updateDynamicField}
              pluginName={t[sectionConfig.labelKey] as string}
              buildingType={project.buildingType}
              defaultExpanded={true}
            />
          </div>
        );
      })}

      <button
        type="submit"
        disabled={isLoading || !project.name}
        className="w-full py-3 px-6 bg-accent text-white font-semibold rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? t.analyzing : t.analyze}
      </button>
    </form>
  );
}

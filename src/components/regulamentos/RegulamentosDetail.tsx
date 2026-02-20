"use client";

import type { SpecialtyPlugin, RegulationDocument, DeclarativeRule } from "@/lib/plugins/types";
import DashboardOverview from "./detail/DashboardOverview";
import SpecialtyDetail from "./detail/SpecialtyDetail";
import RegulationDetail from "./detail/RegulationDetail";
import RuleDetail from "./detail/RuleDetail";

interface RegulamentosDetailProps {
  plugins: SpecialtyPlugin[];
  selectedPlugin: SpecialtyPlugin | null;
  selectedRegulation: RegulationDocument | null;
  selectedRule: DeclarativeRule | null;
  selectedSpecialtyId: string | null;
  selectedRegulationId: string | null;
  severityFilter: string;
  searchQuery: string;
  onSelectSpecialty: (id: string | null) => void;
  onSelectRegulation: (specialtyId: string, regulationId: string | null) => void;
  onSelectRule: (specialtyId: string, regulationId: string, ruleId: string | null) => void;
  onStartIngestion: (pluginId: string) => void;
}

export default function RegulamentosDetail({
  plugins,
  selectedPlugin,
  selectedRegulation,
  selectedRule,
  selectedSpecialtyId,
  selectedRegulationId,
  severityFilter,
  searchQuery,
  onSelectSpecialty,
  onSelectRegulation,
  onSelectRule,
  onStartIngestion,
}: RegulamentosDetailProps) {
  // Rule detail view
  if (selectedPlugin && selectedRegulation && selectedRule) {
    return (
      <RuleDetail
        rule={selectedRule}
        regulation={selectedRegulation}
        plugin={selectedPlugin}
        onBack={() =>
          onSelectRule(selectedPlugin.id, selectedRegulation.id, null)
        }
      />
    );
  }

  // Regulation detail view (rules table)
  if (selectedPlugin && selectedRegulation) {
    return (
      <RegulationDetail
        plugin={selectedPlugin}
        regulation={selectedRegulation}
        severityFilter={severityFilter}
        searchQuery={searchQuery}
        onSelectRule={(specId, regId, ruleId) => onSelectRule(specId, regId, ruleId)}
        onBack={() => onSelectRegulation(selectedPlugin.id, null)}
      />
    );
  }

  // Specialty detail view (regulations list)
  if (selectedPlugin) {
    return (
      <SpecialtyDetail
        plugin={selectedPlugin}
        onSelectRegulation={onSelectRegulation}
        onStartIngestion={onStartIngestion}
      />
    );
  }

  // Dashboard overview (no selection)
  return (
    <DashboardOverview
      plugins={plugins}
      onSelectSpecialty={(id) => onSelectSpecialty(id)}
    />
  );
}

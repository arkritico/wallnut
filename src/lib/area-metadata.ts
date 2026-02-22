/**
 * Shared area metadata — labels, icons, and form-section mappings
 * used across AnalysisResults sub-components and analyzer modules.
 */

/** Map field namespace prefixes to ProjectForm section IDs */
export const FIELD_TO_SECTION: Record<string, string> = {
  fireSafety: "fire",
  acoustic: "acoustic",
  accessibility: "accessibility",
  electrical: "electrical",
  gas: "gas",
  structural: "structural",
  architecture: "architecture",
  general: "general",
  envelope: "envelope",
  systems: "systems",
  avac: "avac",
  hvac: "avac",
  water: "water",
  waterDrainage: "water",
  drainage: "water",
  telecommunications: "telecom",
  ited: "telecom",
  itur: "telecom",
  elevator: "elevators",
  elevators: "elevators",
  energy: "envelope",
  thermal: "envelope",
  licensing: "licensing",
  waste: "waste",
  drawings: "drawings",
  municipal: "local",
  localRegulations: "local",
  location: "context",
  building: "context",
};

/** Map regulation areas to ProjectWizard form section IDs */
export const AREA_TO_FORM_SECTION: Record<string, string> = {
  architecture: "architecture",
  structural: "structural",
  fire_safety: "fire",
  hvac: "avac",
  water_drainage: "water",
  gas: "gas",
  electrical: "electrical",
  telecommunications: "telecom",
  thermal: "envelope",
  acoustic: "acoustic",
  accessibility: "accessibility",
  energy: "envelope",
  elevators: "elevators",
  licensing: "licensing",
  waste: "waste",
  municipal: "local",
  drawings: "drawings",
  general: "general",
};

/** Short labels for area filter chips and tiles */
export const AREA_SHORT_LABELS: Record<string, string> = {
  architecture: "Arquitetura",
  structural: "Estruturas",
  fire_safety: "Incêndio",
  hvac: "AVAC",
  water_drainage: "Águas",
  gas: "Gás",
  electrical: "Elétrico",
  telecommunications: "ITED/ITUR",
  thermal: "Térmico",
  acoustic: "Acústica",
  accessibility: "Acessibilidade",
  energy: "Energia",
  elevators: "Ascensores",
  licensing: "Licenciamento",
  waste: "Resíduos",
  municipal: "Municipal",
  drawings: "Desenhos",
  general: "Geral",
};

/**
 * Given a list of missing field paths, find the form section
 * that dominates (most missing fields map to).
 */
export function findDominantSection(missingFields: string[]): string | undefined {
  const counts: Record<string, number> = {};
  for (const field of missingFields) {
    const ns = field.split(".")[0];
    const section = FIELD_TO_SECTION[ns];
    if (section) counts[section] = (counts[section] || 0) + 1;
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [section, count] of Object.entries(counts)) {
    if (count > bestCount) { best = section; bestCount = count; }
  }
  return best;
}

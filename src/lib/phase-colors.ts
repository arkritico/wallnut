/**
 * Phase Color Palette & Portuguese Labels
 *
 * Central registry mapping all 30 ConstructionPhase values to
 * hex colors (for THREE.Color and CSS) and Portuguese display labels.
 *
 * Hue groups:
 *   reds/browns  = structural (foundations, structure, walls)
 *   blues        = plumbing (water, drainage)
 *   yellows      = electrical
 *   purples      = HVAC, finishes
 *   greens       = exterior works, cleanup
 */

import type { ConstructionPhase } from "./wbs-types";

export interface PhaseVisual {
  hex: string;   // e.g. "#dc2626"
  label: string; // Portuguese display name
}

const PHASE_VISUALS: Record<ConstructionPhase, PhaseVisual> = {
  site_setup:          { hex: "#78716c", label: "Estaleiro" },
  demolition:          { hex: "#ef4444", label: "Demolições" },
  earthworks:          { hex: "#a16207", label: "Mov. terras" },
  foundations:         { hex: "#92400e", label: "Fundações" },
  structure:           { hex: "#dc2626", label: "Estrutura" },
  external_walls:      { hex: "#ea580c", label: "Alvenarias ext." },
  roof:                { hex: "#b45309", label: "Cobertura" },
  waterproofing:       { hex: "#0891b2", label: "Impermeab." },
  external_frames:     { hex: "#0d9488", label: "Caixilharias" },
  rough_in_plumbing:   { hex: "#2563eb", label: "Águas/esgotos" },
  rough_in_electrical: { hex: "#f59e0b", label: "Eletricidade" },
  rough_in_hvac:       { hex: "#7c3aed", label: "AVAC" },
  rough_in_gas:        { hex: "#e11d48", label: "Gás" },
  rough_in_telecom:    { hex: "#06b6d4", label: "ITED/ITUR" },
  internal_walls:      { hex: "#f97316", label: "Paredes int." },
  insulation:          { hex: "#84cc16", label: "Isolamento" },
  external_finishes:   { hex: "#14b8a6", label: "Acab. ext." },
  internal_finishes:   { hex: "#8b5cf6", label: "Acab. int." },
  flooring:            { hex: "#d946ef", label: "Pavimentos" },
  ceilings:            { hex: "#a855f7", label: "Tetos" },
  carpentry:           { hex: "#c2410c", label: "Carpintarias" },
  plumbing_fixtures:   { hex: "#3b82f6", label: "Louças sanit." },
  electrical_fixtures: { hex: "#eab308", label: "Ap. elétricos" },
  painting:            { hex: "#ec4899", label: "Pinturas" },
  metalwork:           { hex: "#6b7280", label: "Serralharias" },
  elevators:           { hex: "#4f46e5", label: "Elevadores" },
  fire_safety:         { hex: "#b91c1c", label: "Seg. incêndio" },
  external_works:      { hex: "#16a34a", label: "Arranjos ext." },
  testing:             { hex: "#475569", label: "Ensaios" },
  cleanup:             { hex: "#22c55e", label: "Limpeza" },
};

/** Get the hex color for a construction phase. */
export function phaseColor(phase: ConstructionPhase): string {
  return PHASE_VISUALS[phase]?.hex ?? "#6b7280";
}

/** Get the Portuguese label for a construction phase. */
export function phaseLabel(phase: ConstructionPhase): string {
  return PHASE_VISUALS[phase]?.label ?? phase.replace(/_/g, " ");
}

/** Get the full visual info for a construction phase. */
export function phaseVisual(phase: ConstructionPhase): PhaseVisual {
  return PHASE_VISUALS[phase] ?? { hex: "#6b7280", label: phase.replace(/_/g, " ") };
}

/** Full map — useful for iterating all phases. */
export { PHASE_VISUALS };

/**
 * Shared phase constraints for Portuguese construction scheduling.
 *
 * Single source of truth for:
 * - Phase overlap rules (which phases can/cannot run concurrently)
 * - Equipment-phase mapping (which phases need which equipment)
 *
 * Used by both construction-sequencer.ts (initial scheduling)
 * and site-capacity-optimizer.ts (violation detection).
 */

import type { ConstructionPhase } from "./wbs-types";

// ============================================================
// Interfaces
// ============================================================

export interface PhaseOverlapRule {
  phase1: ConstructionPhase;
  phase2: ConstructionPhase;
  canOverlap: boolean;
  minimumGap?: number; // Days
  reason: string;
}

export interface PhaseEquipmentEntry {
  phase: ConstructionPhase;
  equipment: string[];
}

// ============================================================
// Phase Overlap Rules (26 Portuguese construction rules)
// ============================================================

export const PHASE_OVERLAP_RULES: PhaseOverlapRule[] = [
  // Structure phase
  {
    phase1: "structure",
    phase2: "rough_in_electrical",
    canOverlap: true,
    reason: "Condutas elétricas podem ser embebidas durante betonagem",
  },
  {
    phase1: "structure",
    phase2: "rough_in_plumbing",
    canOverlap: true,
    reason: "Tubagens podem ser embebidas durante betonagem",
  },
  {
    phase1: "structure",
    phase2: "waterproofing",
    canOverlap: false,
    minimumGap: 7,
    reason: "Betão deve curar antes de impermeabilizar (mínimo 7 dias)",
  },

  // Waterproofing
  {
    phase1: "waterproofing",
    phase2: "external_finishes",
    canOverlap: false,
    minimumGap: 2,
    reason: "Impermeabilização deve curar antes de revestir (mínimo 2 dias)",
  },
  {
    phase1: "waterproofing",
    phase2: "internal_finishes",
    canOverlap: false,
    minimumGap: 2,
    reason: "Impermeabilização deve secar antes de acabamentos interiores",
  },

  // Internal finishes
  {
    phase1: "internal_finishes",
    phase2: "painting",
    canOverlap: false,
    minimumGap: 3,
    reason: "Estuque/reboco deve secar 3 dias antes de pintar",
  },
  {
    phase1: "internal_finishes",
    phase2: "flooring",
    canOverlap: false,
    minimumGap: 2,
    reason: "Paredes devem estar rebocadas antes de assentar pavimentos",
  },
  {
    phase1: "internal_finishes",
    phase2: "carpentry",
    canOverlap: true,
    reason: "Carpintarias podem ser instaladas durante acabamentos",
  },

  // Painting
  {
    phase1: "painting",
    phase2: "flooring",
    canOverlap: false,
    minimumGap: 1,
    reason: "Pintura deve secar antes de assentar pavimentos (risco de manchas)",
  },
  {
    phase1: "painting",
    phase2: "carpentry",
    canOverlap: false,
    reason: "Pintura antes de carpintarias (para não sujar)",
  },
  {
    phase1: "painting",
    phase2: "electrical_fixtures",
    canOverlap: true,
    reason: "Aparelhagem pode ser instalada após pintura",
  },

  // Flooring
  {
    phase1: "flooring",
    phase2: "carpentry",
    canOverlap: true,
    reason: "Áreas diferentes, sem risco de contaminação",
  },
  {
    phase1: "flooring",
    phase2: "plumbing_fixtures",
    canOverlap: true,
    reason: "Loiças sanitárias podem ser instaladas durante pavimentação",
  },

  // External works
  {
    phase1: "external_finishes",
    phase2: "external_works",
    canOverlap: true,
    reason: "Arranjos exteriores podem começar durante acabamentos de fachada",
  },

  // Rough-in phases (can overlap with each other)
  {
    phase1: "rough_in_electrical",
    phase2: "rough_in_plumbing",
    canOverlap: true,
    reason: "Instalações elétricas e canalizações em áreas diferentes",
  },
  {
    phase1: "rough_in_electrical",
    phase2: "rough_in_hvac",
    canOverlap: true,
    reason: "Elétrica e AVAC podem trabalhar em paralelo",
  },
  {
    phase1: "rough_in_plumbing",
    phase2: "rough_in_hvac",
    canOverlap: true,
    reason: "Canalizações e AVAC podem trabalhar em paralelo",
  },

  // Ceilings
  {
    phase1: "ceilings",
    phase2: "painting",
    canOverlap: false,
    minimumGap: 1,
    reason: "Tetos falsos devem estar completos antes de pintar",
  },
  {
    phase1: "ceilings",
    phase2: "electrical_fixtures",
    canOverlap: true,
    reason: "Luminárias podem ser instaladas após tetos falsos",
  },

  // Fire safety
  {
    phase1: "fire_safety",
    phase2: "testing",
    canOverlap: false,
    reason: "Sistema de incêndio deve estar instalado antes de testar",
  },
];

// ============================================================
// Equipment-Phase Mapping
// ============================================================

export const PHASE_EQUIPMENT: PhaseEquipmentEntry[] = [
  { phase: "earthworks", equipment: ["crane"] },
  { phase: "foundations", equipment: ["crane", "concrete_pump"] },
  { phase: "structure", equipment: ["crane", "concrete_pump", "scaffolding"] },
  { phase: "external_walls", equipment: ["scaffolding"] },
  { phase: "roof", equipment: ["crane", "scaffolding"] },
  { phase: "external_finishes", equipment: ["scaffolding"] },
  { phase: "painting", equipment: ["scaffolding"] },
  { phase: "elevators", equipment: ["crane"] },
];

// ============================================================
// Lookup Helpers
// ============================================================

/**
 * Get equipment needed by a given construction phase.
 */
export function getPhaseEquipment(phase: ConstructionPhase): string[] {
  return PHASE_EQUIPMENT.find((pe) => pe.phase === phase)?.equipment ?? [];
}

/**
 * Find an overlap rule between two phases (bidirectional lookup).
 * Returns the rule if found, null otherwise.
 */
export function getOverlapRule(
  phase1: ConstructionPhase,
  phase2: ConstructionPhase,
): PhaseOverlapRule | null {
  return (
    PHASE_OVERLAP_RULES.find(
      (r) =>
        (r.phase1 === phase1 && r.phase2 === phase2) ||
        (r.phase1 === phase2 && r.phase2 === phase1),
    ) ?? null
  );
}

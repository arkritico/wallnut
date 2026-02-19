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
// Phase Overlap Rules (30 Portuguese construction rules)
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
    canOverlap: false,
    minimumGap: 1,
    reason: "Pavimentos devem estar assentes antes de fixar loiças sanitárias",
  },

  // External works (must wait for scaffolding removal)
  {
    phase1: "external_finishes",
    phase2: "external_works",
    canOverlap: false,
    minimumGap: 0,
    reason: "Fachadas terminadas e andaimes removidos antes de arranjos exteriores",
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
    canOverlap: false,
    minimumGap: 0,
    reason: "Tetos falsos completos antes de instalar aparelhagem definitiva",
  },

  // Fire safety
  {
    phase1: "fire_safety",
    phase2: "testing",
    canOverlap: false,
    minimumGap: 2,
    reason: "Sistema de incêndio deve estar instalado e verificado antes de ensaios",
  },

  // ── Additional constraints (rules 21-30) ──

  // Insulation must cure before external finishes
  {
    phase1: "insulation",
    phase2: "external_finishes",
    canOverlap: false,
    minimumGap: 3,
    reason: "Isolamento necessita cura antes de acabamentos exteriores",
  },

  // Metalwork and painting cannot overlap (shared scaffolding)
  {
    phase1: "metalwork",
    phase2: "painting",
    canOverlap: false,
    minimumGap: 0,
    reason: "Andaimes partilhados entre serralharia e pintura",
  },

  // Gas rough-in must finish before testing
  {
    phase1: "rough_in_gas",
    phase2: "testing",
    canOverlap: false,
    minimumGap: 3,
    reason: "Instalação de gás deve estar completa e estanque antes de ensaios",
  },

  // External walls before insulation
  {
    phase1: "external_walls",
    phase2: "insulation",
    canOverlap: false,
    minimumGap: 2,
    reason: "Alvenaria exterior deve secar antes de aplicar isolamento",
  },

  // Roof before external frames (waterproofing sequence)
  {
    phase1: "roof",
    phase2: "external_frames",
    canOverlap: false,
    minimumGap: 1,
    reason: "Cobertura deve estar estanque antes de instalar caixilharias",
  },

  // HVAC rough-in can overlap with telecom
  {
    phase1: "rough_in_hvac",
    phase2: "rough_in_telecom",
    canOverlap: true,
    reason: "AVAC e telecomunicações podem trabalhar em paralelo",
  },

  // Gas rough-in can overlap with electrical
  {
    phase1: "rough_in_gas",
    phase2: "rough_in_electrical",
    canOverlap: true,
    reason: "Gás e elétrica em zonas distintas — podem trabalhar em paralelo",
  },

  // Telecom rough-in can overlap with plumbing
  {
    phase1: "rough_in_telecom",
    phase2: "rough_in_plumbing",
    canOverlap: true,
    reason: "Telecomunicações e canalizações em zonas distintas",
  },

  // Elevators need structure complete and shaft clear
  {
    phase1: "structure",
    phase2: "elevators",
    canOverlap: false,
    minimumGap: 5,
    reason: "Caixa de elevador deve estar completa e curada antes de instalação",
  },

  // Cleanup cannot overlap with testing
  {
    phase1: "testing",
    phase2: "cleanup",
    canOverlap: false,
    minimumGap: 0,
    reason: "Ensaios devem estar concluídos antes de limpeza final",
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
  { phase: "waterproofing", equipment: ["scaffolding"] },
  { phase: "external_finishes", equipment: ["scaffolding"] },
  { phase: "metalwork", equipment: ["scaffolding"] },
  { phase: "painting", equipment: ["scaffolding"] },
  { phase: "elevators", equipment: ["crane"] },
  { phase: "external_works", equipment: ["crane"] },
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

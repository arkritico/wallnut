/**
 * Resource Aggregator
 *
 * Aggregates total project resources from matched CYPE items.
 * Consolidates materials, labor by trade, and equipment across all WBS items.
 */

import type {
  WbsProject,
  WbsArticle,
  CypeMatch,
  ConstructionPhase,
  ProjectSchedule,
  ScheduleTask,
} from "./wbs-types";

// ============================================================
// Interfaces
// ============================================================

export interface ProjectResources {
  materials: MaterialResource[];      // Aggregated by material code
  labor: LaborResource[];              // Aggregated by trade
  equipment: EquipmentResource[];      // Aggregated by equipment type
  totalMaterialCost: number;
  totalLaborCost: number;
  totalLaborHours: number;
  totalEquipmentCost: number;
  grandTotal: number;
}

export interface MaterialResource {
  code: string;              // "mt35ttc010d"
  description: string;
  unit: string;
  totalQuantity: number;     // Sum across all WBS items
  unitCost: number;
  totalCost: number;
  usedInArticles: string[];  // WBS article codes
}

export interface LaborResource {
  trade: string;                   // "Oficial Electricista", "Pedreiro"
  totalHours: number;
  hourlyRate: number;               // Average across items
  totalCost: number;
  peakConcurrentWorkers: number;    // Max simultaneous workers
  usedInPhases: ConstructionPhase[];
}

export interface EquipmentResource {
  code: string;
  description: string;
  unit: string;              // Usually "h" or "day"
  totalQuantity: number;
  unitCost: number;
  totalCost: number;
  usedInPhases: ConstructionPhase[];
}

// ============================================================
// Trade Extraction (Portuguese Labor Patterns)
// ============================================================

/**
 * Extract trade/role from Portuguese labor description.
 * Patterns based on common CYPE Gerador de Preços conventions.
 */
function extractTrade(description: string): string {
  const patterns = [
    // Electricians
    { pattern: /oficial.*1.*electri/i, trade: "Oficial Electricista" },
    { pattern: /oficial.*2.*electri/i, trade: "Oficial Electricista" },
    { pattern: /ajudante.*electri/i, trade: "Ajudante Electricista" },
    { pattern: /electricista/i, trade: "Oficial Electricista" },

    // Plumbers / Pipe fitters
    { pattern: /oficial.*1.*canali/i, trade: "Oficial Canalizador" },
    { pattern: /oficial.*2.*canali/i, trade: "Oficial Canalizador" },
    { pattern: /ajudante.*canali/i, trade: "Ajudante Canalizador" },
    { pattern: /canalizador/i, trade: "Oficial Canalizador" },

    // Masons / Bricklayers
    { pattern: /oficial.*1.*pedreiro/i, trade: "Oficial Pedreiro" },
    { pattern: /oficial.*2.*pedreiro/i, trade: "Oficial Pedreiro" },
    { pattern: /ajudante.*pedreiro/i, trade: "Ajudante Pedreiro" },
    { pattern: /pedreiro/i, trade: "Oficial Pedreiro" },

    // Carpenters
    { pattern: /oficial.*1.*carpint/i, trade: "Oficial Carpinteiro" },
    { pattern: /oficial.*2.*carpint/i, trade: "Oficial Carpinteiro" },
    { pattern: /ajudante.*carpint/i, trade: "Ajudante Carpinteiro" },
    { pattern: /carpinteiro/i, trade: "Oficial Carpinteiro" },

    // Painters
    { pattern: /pintor/i, trade: "Pintor" },

    // HVAC
    { pattern: /oficial.*montador/i, trade: "Oficial Montador AVAC" },
    { pattern: /ajudante.*montador/i, trade: "Ajudante Montador" },

    // General labor
    { pattern: /servente/i, trade: "Servente" },
    { pattern: /manobrador/i, trade: "Manobrador" },
    { pattern: /ajudante/i, trade: "Ajudante Geral" },

    // Specialized
    { pattern: /soldador/i, trade: "Soldador" },
    { pattern: /serralheiro/i, trade: "Serralheiro" },
    { pattern: /telhadeiro/i, trade: "Telhadeiro" },
  ];

  for (const { pattern, trade } of patterns) {
    if (pattern.test(description)) return trade;
  }

  return "Mão de Obra Geral";
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Find a WBS article by code in the project.
 */
function findArticleByCode(project: WbsProject, articleCode: string): WbsArticle | null {
  for (const chapter of project.chapters) {
    for (const sub of chapter.subChapters) {
      const article = sub.articles.find(a => a.code === articleCode);
      if (article) return article;
    }
  }
  return null;
}

/**
 * Calculate peak concurrent workers from schedule.
 */
function calculatePeakWorkers(
  laborMap: Map<string, LaborResource>,
  schedule: ProjectSchedule
): void {
  // Build a daily worker allocation timeline
  const dailyAllocation = new Map<string, Map<string, number>>();

  for (const task of schedule.tasks) {
    const currentDate = new Date(task.startDate);
    const endDate = new Date(task.finishDate);

    // For each day this task runs
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];

      if (!dailyAllocation.has(dateKey)) {
        dailyAllocation.set(dateKey, new Map());
      }

      const dayData = dailyAllocation.get(dateKey)!;

      // Allocate workers from task resources
      for (const resource of task.resources) {
        if (resource.type === "labor" && resource.name) {
          const current = dayData.get(resource.name) || 0;
          dayData.set(resource.name, current + (resource.units || 1));
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Find peak for each trade
  for (const [trade, laborResource] of laborMap.entries()) {
    let peak = 0;
    for (const dayData of dailyAllocation.values()) {
      const count = dayData.get(trade) || 0;
      if (count > peak) peak = count;
    }
    laborResource.peakConcurrentWorkers = peak;
  }
}

/**
 * Collect unique phases used by each labor trade.
 */
function collectUsedPhases(
  laborMap: Map<string, LaborResource>,
  matches: CypeMatch[],
  project: WbsProject
): void {
  // For simplicity, we'll infer phases from chapter structure
  // In a full implementation, would map WBS chapters to ConstructionPhase
  // For now, just mark as empty array (can be enhanced)
  for (const labor of laborMap.values()) {
    labor.usedInPhases = [];
  }
}

/**
 * Collect unique phases used by equipment.
 */
function collectEquipmentPhases(
  equipmentMap: Map<string, EquipmentResource>
): void {
  // For simplicity, mark as empty array
  for (const equipment of equipmentMap.values()) {
    equipment.usedInPhases = [];
  }
}

// ============================================================
// Main Aggregation Function
// ============================================================

/**
 * Aggregate total project resources from matched CYPE items.
 *
 * @param project - The WBS project structure
 * @param matches - CYPE matches from the matcher
 * @param schedule - Optional schedule for peak worker calculation
 * @returns Aggregated project resources
 */
export function aggregateProjectResources(
  project: WbsProject,
  matches: CypeMatch[],
  schedule?: ProjectSchedule
): ProjectResources {
  const materialMap = new Map<string, MaterialResource>();
  const laborMap = new Map<string, LaborResource>();
  const equipmentMap = new Map<string, EquipmentResource>();

  // For each match, use fullBreakdown from match (no database reload needed)
  for (const match of matches) {
    // Use fullBreakdown from match if available
    const breakdown = match.fullBreakdown || [];
    if (breakdown.length === 0) continue;

    const wbsArticle = findArticleByCode(project, match.articleCode);
    if (!wbsArticle) continue;

    // WBS article quantity
    const wbsQuantity = wbsArticle.quantity || 1;

    // Process each component in the CYPE breakdown
    for (const component of breakdown) {
      // Skip header row or invalid entries (has null quantity or total)
      if (component.quantity === null || component.quantity === undefined) continue;
      if (component.total === null || component.total === undefined) continue;

      const totalQty = component.quantity * wbsQuantity;
      const totalCost = component.total * wbsQuantity;

      if (component.type === "material") {
        // Aggregate material
        const existing = materialMap.get(component.code);
        if (existing) {
          existing.totalQuantity += totalQty;
          existing.totalCost += totalCost;
          if (!existing.usedInArticles.includes(wbsArticle.code)) {
            existing.usedInArticles.push(wbsArticle.code);
          }
        } else {
          materialMap.set(component.code, {
            code: component.code,
            description: component.description || "Material",
            unit: component.unit,
            totalQuantity: totalQty,
            unitCost: component.unitPrice || 0,
            totalCost: totalCost,
            usedInArticles: [wbsArticle.code],
          });
        }
      } else if (component.type === "labor") {
        // Extract trade from Portuguese description
        const trade = extractTrade(component.description);
        const hours = totalQty;

        const existing = laborMap.get(trade);
        if (existing) {
          const prevTotalCost = existing.totalCost;
          const prevTotalHours = existing.totalHours;
          existing.totalHours += hours;
          existing.totalCost += totalCost;
          // Recalculate weighted average hourly rate
          existing.hourlyRate = existing.totalCost / existing.totalHours;
        } else {
          laborMap.set(trade, {
            trade,
            totalHours: hours,
            hourlyRate: component.unitPrice || 0,
            totalCost: totalCost,
            peakConcurrentWorkers: 0, // Calculate later from schedule
            usedInPhases: [],
          });
        }
      } else if (component.type === "machinery") {
        // Aggregate equipment
        const existing = equipmentMap.get(component.code);
        if (existing) {
          existing.totalQuantity += totalQty;
          existing.totalCost += totalCost;
        } else {
          equipmentMap.set(component.code, {
            code: component.code,
            description: component.description || "Equipamento",
            unit: component.unit,
            totalQuantity: totalQty,
            unitCost: component.unitPrice || 0,
            totalCost: totalCost,
            usedInPhases: [],
          });
        }
      }
    }
  }

  // Calculate peak workers from schedule if provided
  if (schedule) {
    calculatePeakWorkers(laborMap, schedule);
  }

  // Collect used phases
  collectUsedPhases(laborMap, matches, project);
  collectEquipmentPhases(equipmentMap);

  // Calculate totals
  const totalMaterialCost = Array.from(materialMap.values()).reduce((sum, r) => sum + r.totalCost, 0);
  const totalLaborCost = Array.from(laborMap.values()).reduce((sum, r) => sum + r.totalCost, 0);
  const totalLaborHours = Array.from(laborMap.values()).reduce((sum, r) => sum + r.totalHours, 0);
  const totalEquipmentCost = Array.from(equipmentMap.values()).reduce((sum, r) => sum + r.totalCost, 0);
  const grandTotal = totalMaterialCost + totalLaborCost + totalEquipmentCost;

  return {
    materials: Array.from(materialMap.values()).sort((a, b) => b.totalCost - a.totalCost),
    labor: Array.from(laborMap.values()).sort((a, b) => b.totalCost - a.totalCost),
    equipment: Array.from(equipmentMap.values()).sort((a, b) => b.totalCost - a.totalCost),
    totalMaterialCost,
    totalLaborCost,
    totalLaborHours,
    totalEquipmentCost,
    grandTotal,
  };
}

/**
 * Get a summary of resource counts.
 */
export function getResourceSummary(resources: ProjectResources): {
  materialCount: number;
  laborTradeCount: number;
  equipmentCount: number;
  totalCost: number;
} {
  return {
    materialCount: resources.materials.length,
    laborTradeCount: resources.labor.length,
    equipmentCount: resources.equipment.length,
    totalCost: resources.grandTotal,
  };
}

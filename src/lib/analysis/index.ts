/**
 * Modular analysis engine entry point.
 * Re-exports the core analyzer with a cleaner interface.
 *
 * Usage:
 *   import { analyzeProject, analyzeArea } from "@/lib/analysis";
 *
 * This module wraps the monolithic analyzer.ts and exposes
 * per-specialty analysis functions for more granular use.
 */

export { analyzeProject } from "../analyzer";
export type { AnalysisResult, Finding, Recommendation, RegulationSummary } from "../types";

// Re-export calculation engines
export { calculateThermal, calculateThermalMonthly } from "../calculations";
export { estimateCosts, formatCost } from "../cost-estimation";
export { generateChecklists } from "../checklist-generator";
export { compareVersions } from "../version-diff";
export { calculateTimeline } from "../consultation-timeline";
export { analyzeDxf } from "../dxf-analyzer";
export { parseIfc, ifcToProjectFields } from "../ifc-parser";

// WBS → Price → MS Project pipeline
export { matchWbsToPrice, searchPriceDb, getPriceDatabase } from "../price-matcher";
export { generateSchedule } from "../construction-sequencer";
export { generateMSProjectXML, downloadMSProjectXML, generateScheduleSummary } from "../msproject-export";

// Parametric pricing & IFC specialty analysis
export { calculateParametricPrice, parsePriceExport, importPrices, getAllParametricItems } from "../parametric-pricing";
export { analyzeIfcSpecialty, detectSpecialty } from "../ifc-specialty-analyzer";

// Critical Chain (Goldratt) & buffer management
export { updateBufferConsumption } from "../construction-sequencer";

// Project stage extrapolation
export { extrapolateProject, detectProjectStage, fromBuildingProject } from "../project-extrapolator";

// PDM municipal zoning
export { checkPdmCompliance, getPdmConstraints, detectPdmZone, getAvailableMunicipalities, getPdmZoneOptions } from "../pdm-database";

// Remediation guidance
export { getRemediation } from "../remediation-guidance";

// Findings → WBS bridge
export { findingsToWbs, generateRemediationSummary } from "../findings-to-wbs";

// Analysis hierarchy — grouped, human-readable report structure
export { buildAnalysisHierarchy, getDomainForArea, DOMAINS } from "../analysis-hierarchy";
export type { AnalysisHierarchy, DomainGroup, SpecialtyGroup, RegulationGroup, DomainDefinition } from "../analysis-hierarchy";

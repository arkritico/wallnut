// ============================================================
// PLUGIN SYSTEM — Public API
// ============================================================
//
// Usage:
//
//   import { loadElectricalPlugin, evaluatePlugin, RegulationRegistry } from "./plugins";
//
//   // 1. Load plugin and evaluate against a project
//   const plugin = loadElectricalPlugin();
//   const result = evaluatePlugin(plugin, project);
//
//   // 2. Manage regulation lifecycle
//   const registry = new RegulationRegistry(plugin);
//   registry.supersedeRegulation("old-id", newRegDoc, "eng. silva");
//   const activeRules = registry.getActiveRules();
//
//   // 3. Add new regulations from PDFs
//   import { createRegulationDocument, createBooleanRule } from "./plugins";
//   const newReg = createRegulationDocument({ ... });
//   registry.addRegulation(newReg, "eng. silva");
//   registry.addRules(newReg.id, extractedRules, "eng. silva");
//

// Types
export type {
  RegulationDocument,
  RegulationStatus,
  SourceType,
  LegalForce,
  IngestionStatus,
  DeclarativeRule,
  RuleOperator,
  RuleCondition,
  SpecialtyPlugin,
  PluginEvaluationResult,
  IngestionJob,
  RegistryEvent,
  RegistryEventType,
  // Lookup tables
  LookupTable,
  // Computed fields
  ComputedField,
  ArithmeticComputation,
  TierComputation,
  TierStep,
  ConditionalComputation,
} from "./types";

// Registry (lifecycle management)
export { RegulationRegistry } from "./registry";

// Rule Engine (evaluation)
export { evaluatePlugin, evaluateFromRegistry, resetPluginFindingCounter, evaluateComputedFields } from "./rule-engine";

// Loader (plugin discovery + hot-reload)
export {
  loadElectricalPlugin,
  reloadElectricalPlugin,
  getAvailablePlugins,
  getPluginForArea,
  loadPluginFromJson,
  mergeRulesIntoPlugin,
  // Hot-reload API
  registerPlugin,
  unregisterPlugin,
  getDynamicPlugins,
  reloadBuiltinPlugin,
  resetPluginSystem,
  // Field mappings
  getFieldMappings,
  getFieldMappingsByPlugin,
} from "./loader";

// Ingestion (adding new regulations)
export {
  createRegulationDocument,
  createBooleanRule,
  createThresholdRule,
  createIngestionJob,
  validateExtractedRules,
  getIngestionWorkflowGuide,
  RULE_EXTRACTION_PROMPT,
} from "./ingestion";

// ============================================================
// PLUGIN LOADER — Discovery and loading of specialty plugins
// ============================================================
//
// Loads plugin definitions from src/data/plugins/<specialty>/
// Each plugin directory contains:
//   plugin.json        — Plugin metadata
//   regulations/
//     registry.json    — All regulation documents
//     <reg-id>/
//       rules.json     — Declarative rules
//       source.pdf     — Source document (optional, may be gitignored)
//

import type {
  SpecialtyPlugin,
  RegulationDocument,
  DeclarativeRule,
  LookupTable,
  ComputedField,
} from "./types";
import type { RegulationArea } from "../types";

// ----------------------------------------------------------
// Static imports for all bundled plugins
// ----------------------------------------------------------

// Phase 1 plugins
import electricalPlugin from "../../data/plugins/electrical/plugin.json";
import electricalRegistry from "../../data/plugins/electrical/regulations/registry.json";
import electricalRtiebtRules from "../../data/plugins/electrical/regulations/rtiebt/rules.json";
import electricalTables from "../../data/plugins/electrical/lookup-tables.json";

import fireSafetyPlugin from "../../data/plugins/fire-safety/plugin.json";
import fireSafetyRegistry from "../../data/plugins/fire-safety/regulations/registry.json";
import fireSafetyScieRules from "../../data/plugins/fire-safety/regulations/scie/rules.json";
import fireSafetyTables from "../../data/plugins/fire-safety/lookup-tables.json";
import fireSafetyComputed from "../../data/plugins/fire-safety/computed-fields.json";

import thermalPlugin from "../../data/plugins/thermal/plugin.json";
import thermalRegistry from "../../data/plugins/thermal/regulations/registry.json";
import thermalRehRules from "../../data/plugins/thermal/regulations/reh/rules.json";
import thermalDespacho15793kRules from "../../data/plugins/thermal/regulations/despacho-15793k/rules.json";
import thermalEnIso13788Rules from "../../data/plugins/thermal/regulations/en-iso-13788/rules.json";
import thermalNzebRules from "../../data/plugins/thermal/regulations/nzeb/rules.json";
import thermalEn16798Rules from "../../data/plugins/thermal/regulations/en-16798/rules.json";
import thermalEnIso10211Rules from "../../data/plugins/thermal/regulations/en-iso-10211/rules.json";
import thermalPortaria379aRules from "../../data/plugins/thermal/regulations/portaria-379a/rules.json";
import thermalRecsRules from "../../data/plugins/thermal/regulations/recs-thermal/rules.json";
import thermalTables from "../../data/plugins/thermal/lookup-tables.json";
import thermalComputed from "../../data/plugins/thermal/computed-fields.json";

// Phase 2 plugins
import acousticPlugin from "../../data/plugins/acoustic/plugin.json";
import acousticRegistry from "../../data/plugins/acoustic/regulations/registry.json";
import acousticRraeRules from "../../data/plugins/acoustic/regulations/rrae/rules.json";
import acousticTables from "../../data/plugins/acoustic/lookup-tables.json";
import acousticComputed from "../../data/plugins/acoustic/computed-fields.json";

import structuralPlugin from "../../data/plugins/structural/plugin.json";
import structuralRegistry from "../../data/plugins/structural/regulations/registry.json";
import structuralEurocodesRules from "../../data/plugins/structural/regulations/eurocodes/rules.json";
import structuralTables from "../../data/plugins/structural/lookup-tables.json";
import structuralComputed from "../../data/plugins/structural/computed-fields.json";

import waterDrainagePlugin from "../../data/plugins/water-drainage/plugin.json";
import waterDrainageRegistry from "../../data/plugins/water-drainage/regulations/registry.json";
import waterDrainageRgspRules from "../../data/plugins/water-drainage/regulations/rgsppdadar/rules.json";
import waterDrainageTables from "../../data/plugins/water-drainage/lookup-tables.json";
import waterDrainageComputed from "../../data/plugins/water-drainage/computed-fields.json";

import gasPlugin from "../../data/plugins/gas/plugin.json";
import gasRegistry from "../../data/plugins/gas/regulations/registry.json";
import gasDl521Rules from "../../data/plugins/gas/regulations/dl-521-99/rules.json";
import gasTables from "../../data/plugins/gas/lookup-tables.json";
import gasComputed from "../../data/plugins/gas/computed-fields.json";

import hvacPlugin from "../../data/plugins/hvac/plugin.json";
import hvacRegistry from "../../data/plugins/hvac/regulations/registry.json";
import hvacRecsRules from "../../data/plugins/hvac/regulations/recs/rules.json";
import hvacPortaria353aRules from "../../data/plugins/hvac/regulations/portaria-353a/rules.json";
import hvacFgasRules from "../../data/plugins/hvac/regulations/fgas/rules.json";
import hvacDl306Rules from "../../data/plugins/hvac/regulations/dl-306-2007/rules.json";
import hvacEn16798Rules from "../../data/plugins/hvac/regulations/en-16798-1/rules.json";
import hvacNp1037Rules from "../../data/plugins/hvac/regulations/np-1037-1/rules.json";
import hvacPortaria349bRules from "../../data/plugins/hvac/regulations/portaria-349b/rules.json";
import hvacDl68aRules from "../../data/plugins/hvac/regulations/dl-68a-2015/rules.json";
import hvacEn15232Rules from "../../data/plugins/hvac/regulations/en-15232/rules.json";
import hvacBestPracticesRules from "../../data/plugins/hvac/regulations/best-practices/rules.json";
import hvacScieRules from "../../data/plugins/hvac/regulations/scie-hvac/rules.json";
import hvacRtiebtRules from "../../data/plugins/hvac/regulations/rtiebt-hvac/rules.json";
import hvacEcodesignRules from "../../data/plugins/hvac/regulations/ecodesign-erp/rules.json";
import hvacEn378Rules from "../../data/plugins/hvac/regulations/en-378/rules.json";
import hvacPedRules from "../../data/plugins/hvac/regulations/ped/rules.json";
import hvacAcousticRules from "../../data/plugins/hvac/regulations/acoustic-hvac/rules.json";
import hvacPortaria349dRules from "../../data/plugins/hvac/regulations/portaria-349d/rules.json";
import hvacAtexRules from "../../data/plugins/hvac/regulations/atex/rules.json";
import hvacDgsLegionellaRules from "../../data/plugins/hvac/regulations/dgs-legionella/rules.json";
import hvacTables from "../../data/plugins/hvac/lookup-tables.json";
import hvacComputed from "../../data/plugins/hvac/computed-fields.json";

import telecomPlugin from "../../data/plugins/telecommunications/plugin.json";
import telecomRegistry from "../../data/plugins/telecommunications/regulations/registry.json";
import telecomItedRules from "../../data/plugins/telecommunications/regulations/ited/rules.json";
import telecomTables from "../../data/plugins/telecommunications/lookup-tables.json";
import telecomComputed from "../../data/plugins/telecommunications/computed-fields.json";

import accessibilityPlugin from "../../data/plugins/accessibility/plugin.json";
import accessibilityRegistry from "../../data/plugins/accessibility/regulations/registry.json";
import accessibilityDl163Rules from "../../data/plugins/accessibility/regulations/dl-163-2006/rules.json";
import accessibilityTables from "../../data/plugins/accessibility/lookup-tables.json";
import accessibilityComputed from "../../data/plugins/accessibility/computed-fields.json";

import energyPlugin from "../../data/plugins/energy/plugin.json";
import energyRegistry from "../../data/plugins/energy/regulations/registry.json";
import energySceRules from "../../data/plugins/energy/regulations/sce/rules.json";
import energyDespacho15793iRules from "../../data/plugins/energy/regulations/despacho-15793i/rules.json";
import energyDespacho15793eRules from "../../data/plugins/energy/regulations/despacho-15793e/rules.json";
import energyEn15232Rules from "../../data/plugins/energy/regulations/en-15232/rules.json";
import energyEn14511Rules from "../../data/plugins/energy/regulations/en-14511/rules.json";
import energyPortaria349dRules from "../../data/plugins/energy/regulations/portaria-349d/rules.json";
import energyDl68aRules from "../../data/plugins/energy/regulations/dl-68a-2015/rules.json";
import energyPortaria42Rules from "../../data/plugins/energy/regulations/portaria-42-2019/rules.json";
import energyTables from "../../data/plugins/energy/lookup-tables.json";
import energyComputed from "../../data/plugins/energy/computed-fields.json";

import elevatorsPlugin from "../../data/plugins/elevators/plugin.json";
import elevatorsRegistry from "../../data/plugins/elevators/regulations/registry.json";
import elevatorsDl320Rules from "../../data/plugins/elevators/regulations/dl-320-2002/rules.json";
import elevatorsTables from "../../data/plugins/elevators/lookup-tables.json";
import elevatorsComputed from "../../data/plugins/elevators/computed-fields.json";

import licensingPlugin from "../../data/plugins/licensing/plugin.json";
import licensingRegistry from "../../data/plugins/licensing/regulations/registry.json";
import licensingRjueRules from "../../data/plugins/licensing/regulations/rjue/rules.json";
import licensingTables from "../../data/plugins/licensing/lookup-tables.json";
import licensingComputed from "../../data/plugins/licensing/computed-fields.json";

import wastePlugin from "../../data/plugins/waste/plugin.json";
import wasteRegistry from "../../data/plugins/waste/regulations/registry.json";
import wasteDl46Rules from "../../data/plugins/waste/regulations/dl-46-2008/rules.json";
import wasteTables from "../../data/plugins/waste/lookup-tables.json";
import wasteComputed from "../../data/plugins/waste/computed-fields.json";

import drawingsPlugin from "../../data/plugins/drawings/plugin.json";
import drawingsRegistry from "../../data/plugins/drawings/regulations/registry.json";
import drawingsPortariaRules from "../../data/plugins/drawings/regulations/portaria-701h/rules.json";
import drawingsTables from "../../data/plugins/drawings/lookup-tables.json";
import drawingsComputed from "../../data/plugins/drawings/computed-fields.json";

import architecturePlugin from "../../data/plugins/architecture/plugin.json";
import architectureRegistry from "../../data/plugins/architecture/regulations/registry.json";
import architectureRgeuRules from "../../data/plugins/architecture/regulations/rgeu/rules.json";
import architectureTables from "../../data/plugins/architecture/lookup-tables.json";
import architectureComputed from "../../data/plugins/architecture/computed-fields.json";

import generalPlugin from "../../data/plugins/general/plugin.json";
import generalRegistry from "../../data/plugins/general/regulations/registry.json";
import generalRgeuRules from "../../data/plugins/general/regulations/rgeu/rules.json";
import generalTables from "../../data/plugins/general/lookup-tables.json";
import generalComputed from "../../data/plugins/general/computed-fields.json";

// Field mappings (for context builder enrichment)
import fireSafetyFieldMappings from "../../data/plugins/fire-safety/field-mappings.json";
import accessibilityFieldMappings from "../../data/plugins/accessibility/field-mappings.json";
import generalFieldMappings from "../../data/plugins/general/field-mappings.json";
import acousticFieldMappings from "../../data/plugins/acoustic/field-mappings.json";
import architectureFieldMappings from "../../data/plugins/architecture/field-mappings.json";
import drawingsFieldMappings from "../../data/plugins/drawings/field-mappings.json";
import electricalFieldMappings from "../../data/plugins/electrical/field-mappings.json";
import energyFieldMappings from "../../data/plugins/energy/field-mappings.json";
import thermalFieldMappings from "../../data/plugins/thermal/field-mappings.json";
import gasFieldMappings from "../../data/plugins/gas/field-mappings.json";
import hvacFieldMappings from "../../data/plugins/hvac/field-mappings.json";
import elevatorsFieldMappings from "../../data/plugins/elevators/field-mappings.json";
import licensingFieldMappings from "../../data/plugins/licensing/field-mappings.json";
import municipalFieldMappings from "../../data/plugins/municipal/field-mappings.json";
import wasteFieldMappings from "../../data/plugins/waste/field-mappings.json";
import structuralFieldMappings from "../../data/plugins/structural/field-mappings.json";
import telecomFieldMappings from "../../data/plugins/telecommunications/field-mappings.json";
import waterDrainageFieldMappings from "../../data/plugins/water-drainage/field-mappings.json";

import municipalPlugin from "../../data/plugins/municipal/plugin.json";
import municipalRegistry from "../../data/plugins/municipal/regulations/registry.json";
import municipalPdmRules from "../../data/plugins/municipal/regulations/pdm/rules.json";
import municipalTables from "../../data/plugins/municipal/lookup-tables.json";
import municipalComputed from "../../data/plugins/municipal/computed-fields.json";

/**
 * Assemble a plugin from its JSON definition files.
 */
function assemblePlugin(
  pluginDef: { id: string; name: string; version: string; areas: string[]; description: string; author: string; lastUpdated: string },
  registry: { regulations: unknown[] },
  ruleSets: Array<{ rules: unknown[] }>,
  lookupTables?: { tables: unknown[] },
  computedFields?: { fields: unknown[] }
): SpecialtyPlugin {
  const regulations = registry.regulations as RegulationDocument[];
  const rules: DeclarativeRule[] = [];

  for (const ruleSet of ruleSets) {
    rules.push(...(ruleSet.rules as DeclarativeRule[]));
  }

  return {
    id: pluginDef.id,
    name: pluginDef.name,
    version: pluginDef.version,
    areas: pluginDef.areas as SpecialtyPlugin["areas"],
    description: pluginDef.description,
    author: pluginDef.author,
    lastUpdated: pluginDef.lastUpdated,
    regulations,
    rules,
    lookupTables: lookupTables?.tables as LookupTable[] | undefined,
    computedFields: computedFields?.fields as ComputedField[] | undefined,
  };
}

// ----------------------------------------------------------
// Built-in plugin catalog — cached instances
// ----------------------------------------------------------

const _pluginCache = new Map<string, SpecialtyPlugin>();

function loadCached(
  id: string,
  pluginDef: Parameters<typeof assemblePlugin>[0],
  registry: Parameters<typeof assemblePlugin>[1],
  ruleSets: Parameters<typeof assemblePlugin>[2],
  lookupTables?: Parameters<typeof assemblePlugin>[3],
  computedFields?: Parameters<typeof assemblePlugin>[4]
): SpecialtyPlugin {
  if (!_pluginCache.has(id)) {
    _pluginCache.set(id, assemblePlugin(pluginDef, registry, ruleSets, lookupTables, computedFields));
  }
  return _pluginCache.get(id)!;
}

// ----------------------------------------------------------
// Phase 1 plugins
// ----------------------------------------------------------

/** Load the built-in electrical plugin */
export function loadElectricalPlugin(): SpecialtyPlugin {
  return loadCached("electrical", electricalPlugin, electricalRegistry, [electricalRtiebtRules], electricalTables);
}

/** Reload the electrical plugin (after adding new rules) */
export function reloadElectricalPlugin(): SpecialtyPlugin {
  _pluginCache.delete("electrical");
  return loadElectricalPlugin();
}

/** Load the built-in fire safety plugin */
export function loadFireSafetyPlugin(): SpecialtyPlugin {
  return loadCached("fire-safety", fireSafetyPlugin, fireSafetyRegistry, [fireSafetyScieRules], fireSafetyTables, fireSafetyComputed);
}

/** Load the built-in thermal plugin */
export function loadThermalPlugin(): SpecialtyPlugin {
  return loadCached("thermal", thermalPlugin, thermalRegistry, [
    thermalRehRules, thermalDespacho15793kRules, thermalEnIso13788Rules,
    thermalNzebRules, thermalEn16798Rules, thermalEnIso10211Rules,
    thermalPortaria379aRules, thermalRecsRules,
  ], thermalTables, thermalComputed);
}

// ----------------------------------------------------------
// Phase 2 plugins
// ----------------------------------------------------------

export function loadAcousticPlugin(): SpecialtyPlugin {
  return loadCached("acoustic", acousticPlugin, acousticRegistry, [acousticRraeRules], acousticTables, acousticComputed);
}

export function loadStructuralPlugin(): SpecialtyPlugin {
  return loadCached("structural", structuralPlugin, structuralRegistry, [structuralEurocodesRules], structuralTables, structuralComputed);
}

export function loadWaterDrainagePlugin(): SpecialtyPlugin {
  return loadCached("water-drainage", waterDrainagePlugin, waterDrainageRegistry, [waterDrainageRgspRules], waterDrainageTables, waterDrainageComputed);
}

export function loadGasPlugin(): SpecialtyPlugin {
  return loadCached("gas", gasPlugin, gasRegistry, [gasDl521Rules], gasTables, gasComputed);
}

export function loadHvacPlugin(): SpecialtyPlugin {
  return loadCached("hvac", hvacPlugin, hvacRegistry, [
    hvacRecsRules,
    hvacPortaria353aRules,
    hvacFgasRules,
    hvacDl306Rules,
    hvacEn16798Rules,
    hvacNp1037Rules,
    hvacPortaria349bRules,
    hvacDl68aRules,
    hvacEn15232Rules,
    hvacBestPracticesRules,
    hvacScieRules,
    hvacRtiebtRules,
    hvacEcodesignRules,
    hvacEn378Rules,
    hvacPedRules,
    hvacAcousticRules,
    hvacPortaria349dRules,
    hvacAtexRules,
    hvacDgsLegionellaRules,
  ], hvacTables, hvacComputed);
}

export function loadTelecomPlugin(): SpecialtyPlugin {
  return loadCached("telecommunications", telecomPlugin, telecomRegistry, [telecomItedRules], telecomTables, telecomComputed);
}

export function loadAccessibilityPlugin(): SpecialtyPlugin {
  return loadCached("accessibility", accessibilityPlugin, accessibilityRegistry, [accessibilityDl163Rules], accessibilityTables, accessibilityComputed);
}

export function loadEnergyPlugin(): SpecialtyPlugin {
  return loadCached("energy", energyPlugin, energyRegistry, [
    energySceRules,
    energyDespacho15793iRules,
    energyDespacho15793eRules,
    energyEn15232Rules,
    energyEn14511Rules,
    energyPortaria349dRules,
    energyDl68aRules,
    energyPortaria42Rules,
  ], energyTables, energyComputed);
}

export function loadElevatorsPlugin(): SpecialtyPlugin {
  return loadCached("elevators", elevatorsPlugin, elevatorsRegistry, [elevatorsDl320Rules], elevatorsTables, elevatorsComputed);
}

export function loadLicensingPlugin(): SpecialtyPlugin {
  return loadCached("licensing", licensingPlugin, licensingRegistry, [licensingRjueRules], licensingTables, licensingComputed);
}

export function loadWastePlugin(): SpecialtyPlugin {
  return loadCached("waste", wastePlugin, wasteRegistry, [wasteDl46Rules], wasteTables, wasteComputed);
}

export function loadDrawingsPlugin(): SpecialtyPlugin {
  return loadCached("drawings", drawingsPlugin, drawingsRegistry, [drawingsPortariaRules], drawingsTables, drawingsComputed);
}

export function loadArchitecturePlugin(): SpecialtyPlugin {
  return loadCached("architecture", architecturePlugin, architectureRegistry, [architectureRgeuRules], architectureTables, architectureComputed);
}

export function loadGeneralPlugin(): SpecialtyPlugin {
  return loadCached("general", generalPlugin, generalRegistry, [generalRgeuRules], generalTables, generalComputed);
}

export function loadMunicipalPlugin(): SpecialtyPlugin {
  return loadCached("municipal", municipalPlugin, municipalRegistry, [municipalPdmRules], municipalTables, municipalComputed);
}

/**
 * Get all built-in plugins (all 18 specialties).
 */
function getBuiltinPlugins(): SpecialtyPlugin[] {
  return [
    // Phase 1
    loadElectricalPlugin(),
    loadFireSafetyPlugin(),
    loadThermalPlugin(),
    // Phase 2
    loadAcousticPlugin(),
    loadStructuralPlugin(),
    loadWaterDrainagePlugin(),
    loadGasPlugin(),
    loadHvacPlugin(),
    loadTelecomPlugin(),
    loadAccessibilityPlugin(),
    loadEnergyPlugin(),
    loadElevatorsPlugin(),
    loadLicensingPlugin(),
    loadWastePlugin(),
    loadDrawingsPlugin(),
    loadArchitecturePlugin(),
    loadGeneralPlugin(),
    loadMunicipalPlugin(),
  ];
}

// ----------------------------------------------------------
// Dynamic Plugin Registry — hot-reload without rebuild
// ----------------------------------------------------------

const _dynamicPlugins = new Map<string, SpecialtyPlugin>();

/**
 * Register a dynamic plugin (loaded from JSON at runtime).
 * If a plugin with the same ID exists, it replaces the previous version.
 * Dynamic plugins take precedence over built-in plugins with the same ID.
 */
export function registerPlugin(plugin: SpecialtyPlugin): void {
  _dynamicPlugins.set(plugin.id, plugin);
}

/**
 * Unregister a dynamic plugin by ID.
 * Returns true if a plugin was removed, false if no dynamic plugin with that ID existed.
 */
export function unregisterPlugin(pluginId: string): boolean {
  return _dynamicPlugins.delete(pluginId);
}

/**
 * Get all registered dynamic plugins.
 */
export function getDynamicPlugins(): SpecialtyPlugin[] {
  return Array.from(_dynamicPlugins.values());
}

/**
 * Reload a built-in plugin (clears its cache so it's reassembled from JSON).
 * Useful after modifying plugin JSON files during development.
 */
export function reloadBuiltinPlugin(pluginId: string): SpecialtyPlugin | undefined {
  _pluginCache.delete(pluginId);
  const builtins = getBuiltinPlugins();
  return builtins.find(p => p.id === pluginId);
}

/**
 * Clear all caches and dynamic plugins.
 * Forces a full reload on the next call to getAvailablePlugins().
 */
export function resetPluginSystem(): void {
  _pluginCache.clear();
  _dynamicPlugins.clear();
}

/**
 * Get all available plugins (built-in + dynamic).
 * Dynamic plugins override built-in plugins with the same ID.
 */
export function getAvailablePlugins(): SpecialtyPlugin[] {
  const builtins = getBuiltinPlugins();

  if (_dynamicPlugins.size === 0) return builtins;

  // Dynamic plugins replace built-ins with the same ID
  const dynamicIds = new Set(_dynamicPlugins.keys());
  const merged = builtins.filter(p => !dynamicIds.has(p.id));
  merged.push(..._dynamicPlugins.values());
  return merged;
}

/**
 * Get a plugin by its specialty area.
 */
export function getPluginForArea(area: string): SpecialtyPlugin | undefined {
  const plugins = getAvailablePlugins();
  return plugins.find(p => p.areas.includes(area as RegulationArea));
}

// ----------------------------------------------------------
// Dynamic plugin loading (for user-added plugins)
// ----------------------------------------------------------

/**
 * Load a plugin dynamically from JSON data.
 * This is used when engineers add new plugins or regulations
 * without rebuilding the application.
 *
 * Usage:
 *   const pluginJson = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
 *   const registryJson = JSON.parse(fs.readFileSync('registry.json', 'utf8'));
 *   const rulesJson = JSON.parse(fs.readFileSync('rules.json', 'utf8'));
 *   const plugin = loadPluginFromJson(pluginJson, registryJson, [rulesJson]);
 *   registerPlugin(plugin);  // Makes it available to the analysis engine
 */
export function loadPluginFromJson(
  pluginDef: Record<string, unknown>,
  registry: { regulations: RegulationDocument[] },
  ruleSets: Array<{ rules: DeclarativeRule[] }>,
  lookupTables?: { tables: LookupTable[] },
  computedFields?: { fields: ComputedField[] }
): SpecialtyPlugin {
  const regulations = registry.regulations;
  const rules: DeclarativeRule[] = [];

  for (const ruleSet of ruleSets) {
    rules.push(...ruleSet.rules);
  }

  return {
    id: pluginDef.id as string,
    name: pluginDef.name as string,
    version: pluginDef.version as string,
    areas: pluginDef.areas as SpecialtyPlugin["areas"],
    description: pluginDef.description as string,
    author: pluginDef.author as string,
    lastUpdated: pluginDef.lastUpdated as string,
    regulations,
    rules,
    lookupTables: lookupTables?.tables,
    computedFields: computedFields?.fields,
  };
}

/**
 * Merge a new rule set into an existing plugin.
 * Used when ingesting a new regulation's rules into an existing specialty plugin.
 *
 * Example: Adding DL 96/2017 rules to the electrical plugin
 */
export function mergeRulesIntoPlugin(
  plugin: SpecialtyPlugin,
  newRegulation: RegulationDocument,
  newRules: DeclarativeRule[]
): SpecialtyPlugin {
  return {
    ...plugin,
    regulations: [...plugin.regulations, newRegulation],
    rules: [...plugin.rules, ...newRules],
    lastUpdated: new Date().toISOString(),
  };
}

// ----------------------------------------------------------
// Field Mappings — for context builder enrichment
// ----------------------------------------------------------

import type { FieldMapping } from "../context-builder";

/**
 * Get all available field mappings from plugins that have them.
 * These are used by the context builder to:
 * - Extract specialty-specific fields from IFC data
 * - Apply smart defaults per building type
 * - Generate dynamic form sections
 */
export function getFieldMappings(): FieldMapping[] {
  const allMappings: FieldMapping[] = [];

  // Combine field mappings from all plugins that have them
  const sources = [
    fireSafetyFieldMappings,
    accessibilityFieldMappings,
    generalFieldMappings,
    acousticFieldMappings,
    architectureFieldMappings,
    drawingsFieldMappings,
    electricalFieldMappings,
    energyFieldMappings,
    thermalFieldMappings,
    gasFieldMappings,
    hvacFieldMappings,
    elevatorsFieldMappings,
    licensingFieldMappings,
    municipalFieldMappings,
    wasteFieldMappings,
    structuralFieldMappings,
    telecomFieldMappings,
    waterDrainageFieldMappings,
  ] as Array<{ fields: FieldMapping[] }>;

  for (const source of sources) {
    if (source?.fields) {
      allMappings.push(...source.fields);
    }
  }

  return allMappings;
}

/**
 * Get field mappings grouped by plugin ID.
 * Useful for generating per-specialty form sections.
 */
export function getFieldMappingsByPlugin(): Record<string, { pluginId: string; version: string; fields: FieldMapping[] }> {
  const result: Record<string, { pluginId: string; version: string; fields: FieldMapping[] }> = {};

  const sources = [
    fireSafetyFieldMappings,
    accessibilityFieldMappings,
    generalFieldMappings,
    acousticFieldMappings,
    architectureFieldMappings,
    drawingsFieldMappings,
    electricalFieldMappings,
    energyFieldMappings,
    thermalFieldMappings,
    gasFieldMappings,
    hvacFieldMappings,
    elevatorsFieldMappings,
    licensingFieldMappings,
    municipalFieldMappings,
    wasteFieldMappings,
    structuralFieldMappings,
    telecomFieldMappings,
    waterDrainageFieldMappings,
  ] as Array<{ pluginId: string; version: string; fields: FieldMapping[] }>;

  for (const source of sources) {
    if (source?.pluginId) {
      result[source.pluginId] = source;
    }
  }

  return result;
}

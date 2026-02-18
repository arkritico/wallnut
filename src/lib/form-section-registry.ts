/**
 * Form Section Registry — maps form sections to plugins.
 * Defines which sections are shown in the project form,
 * their order, priority per building type, and plugin association.
 */

import type { BuildingType } from "./types";
import type { Translations } from "./i18n";

export interface FormSectionConfig {
  /** Section ID used in tabs, completion tracking, etc. */
  sectionId: string;
  /** Plugin ID from field-mappings.json (null for custom-only sections) */
  pluginId: string | null;
  /** i18n key for the section tab label */
  labelKey: keyof Translations;
  /** Priority per building type */
  priority: Record<BuildingType, "essential" | "recommended" | "optional">;
  /** Whether this section requires a custom React component (Tier 3) */
  hasCustomRenderer: boolean;
  /** Sort order in the tab bar */
  order: number;
}

/**
 * All 19 form sections in display order.
 * Sections with hasCustomRenderer=true use dedicated React components.
 * Others are rendered entirely by DynamicFormSection from field-mappings.json.
 */
export const FORM_SECTIONS: FormSectionConfig[] = [
  {
    sectionId: "context",
    pluginId: null,
    labelKey: "context",
    priority: { residential: "essential", commercial: "essential", mixed: "essential", industrial: "essential" },
    hasCustomRenderer: true,
    order: 0,
  },
  {
    sectionId: "general",
    pluginId: "general",
    labelKey: "general",
    priority: { residential: "essential", commercial: "essential", mixed: "essential", industrial: "essential" },
    hasCustomRenderer: true,
    order: 1,
  },
  {
    sectionId: "architecture",
    pluginId: "architecture",
    labelKey: "architecture",
    priority: { residential: "essential", commercial: "essential", mixed: "essential", industrial: "essential" },
    hasCustomRenderer: false,
    order: 2,
  },
  {
    sectionId: "structural",
    pluginId: "structural",
    labelKey: "structural",
    priority: { residential: "recommended", commercial: "recommended", mixed: "recommended", industrial: "essential" },
    hasCustomRenderer: false,
    order: 3,
  },
  {
    sectionId: "fire",
    pluginId: "fire-safety",
    labelKey: "fireSafety",
    priority: { residential: "essential", commercial: "essential", mixed: "essential", industrial: "essential" },
    hasCustomRenderer: false,
    order: 4,
  },
  {
    sectionId: "avac",
    pluginId: "hvac",
    labelKey: "avac",
    priority: { residential: "recommended", commercial: "essential", mixed: "essential", industrial: "essential" },
    hasCustomRenderer: false,
    order: 5,
  },
  {
    sectionId: "water",
    pluginId: "water-drainage",
    labelKey: "water",
    priority: { residential: "recommended", commercial: "recommended", mixed: "recommended", industrial: "recommended" },
    hasCustomRenderer: false,
    order: 6,
  },
  {
    sectionId: "gas",
    pluginId: "gas",
    labelKey: "gas",
    priority: { residential: "optional", commercial: "optional", mixed: "optional", industrial: "optional" },
    hasCustomRenderer: false,
    order: 7,
  },
  {
    sectionId: "electrical",
    pluginId: "electrical",
    labelKey: "electrical",
    priority: { residential: "essential", commercial: "essential", mixed: "essential", industrial: "essential" },
    hasCustomRenderer: false,
    order: 8,
  },
  {
    sectionId: "telecom",
    pluginId: "telecommunications",
    labelKey: "telecom",
    priority: { residential: "recommended", commercial: "optional", mixed: "optional", industrial: "optional" },
    hasCustomRenderer: false,
    order: 9,
  },
  {
    sectionId: "envelope",
    pluginId: "thermal",
    labelKey: "envelope",
    priority: { residential: "essential", commercial: "essential", mixed: "essential", industrial: "essential" },
    hasCustomRenderer: false,
    order: 10,
  },
  {
    sectionId: "systems",
    pluginId: "energy",
    labelKey: "systems",
    priority: { residential: "recommended", commercial: "recommended", mixed: "recommended", industrial: "recommended" },
    hasCustomRenderer: false,
    order: 11,
  },
  {
    sectionId: "acoustic",
    pluginId: "acoustic",
    labelKey: "acoustic",
    priority: { residential: "essential", commercial: "recommended", mixed: "essential", industrial: "recommended" },
    hasCustomRenderer: false,
    order: 12,
  },
  {
    sectionId: "accessibility",
    pluginId: "accessibility",
    labelKey: "accessibility",
    priority: { residential: "recommended", commercial: "recommended", mixed: "recommended", industrial: "recommended" },
    hasCustomRenderer: false,
    order: 13,
  },
  {
    sectionId: "elevators",
    pluginId: "elevators",
    labelKey: "elevators",
    priority: { residential: "optional", commercial: "optional", mixed: "optional", industrial: "optional" },
    hasCustomRenderer: false,
    order: 14,
  },
  {
    sectionId: "licensing",
    pluginId: "licensing",
    labelKey: "licensing",
    priority: { residential: "recommended", commercial: "recommended", mixed: "recommended", industrial: "recommended" },
    hasCustomRenderer: false,
    order: 15,
  },
  {
    sectionId: "waste",
    pluginId: "waste",
    labelKey: "waste",
    priority: { residential: "optional", commercial: "optional", mixed: "optional", industrial: "optional" },
    hasCustomRenderer: false,
    order: 16,
  },
  {
    sectionId: "drawings",
    pluginId: "drawings",
    labelKey: "drawings",
    priority: { residential: "optional", commercial: "optional", mixed: "optional", industrial: "optional" },
    hasCustomRenderer: false,
    order: 17,
  },
  {
    sectionId: "local",
    pluginId: "municipal",
    labelKey: "municipal",
    priority: { residential: "optional", commercial: "optional", mixed: "optional", industrial: "optional" },
    hasCustomRenderer: true,
    order: 18,
  },
];

/** Get section priority for a given building type */
export function getSectionPriority(
  buildingType: BuildingType,
): Record<string, "essential" | "recommended" | "optional"> {
  const result: Record<string, "essential" | "recommended" | "optional"> = {};
  for (const section of FORM_SECTIONS) {
    result[section.sectionId] = section.priority[buildingType];
  }
  return result;
}

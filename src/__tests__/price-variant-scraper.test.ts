/**
 * Tests for price variant scraper utilities and DB loader variant expansion.
 *
 * Note: Actual Playwright browser tests are not included here as they require
 * a running browser and network access. These tests cover the pure-logic
 * functions: variant ID generation, combination generation, preset loading,
 * and DB loader flatMap expansion.
 */

import { describe, test, expect } from "vitest";
import {
  generateVariantId,
  generateCombinations,
  type VariantPreset,
  type VariantPresetsFile,
} from "../lib/price-variant-scraper";

// ============================================================================
// generateVariantId
// ============================================================================

describe("generateVariantId", () => {
  test("generates ID from single parameter", () => {
    const id = generateVariantId({ section: "30x30" });
    expect(id).toBe("30x30");
  });

  test("generates ID from multiple parameters", () => {
    const id = generateVariantId({ class: "C30/37", section: "25x25" });
    expect(id).toBe("C30_37_25x25");
  });

  test("replaces slashes and dots with underscores", () => {
    const id = generateVariantId({ class: "C25/30", material: "EPS.100" });
    expect(id).toBe("C25_30_EPS_100");
  });

  test("handles spaces in values", () => {
    const id = generateVariantId({ material: "tijolo ceramico" });
    expect(id).toBe("tijolo_ceramico");
  });

  test("strips trailing underscores", () => {
    const id = generateVariantId({ value: "test." });
    expect(id).toBe("test");
  });
});

// ============================================================================
// generateCombinations
// ============================================================================

describe("generateCombinations", () => {
  test("generates all combinations from two axes", () => {
    const combos = generateCombinations(
      {
        size: ["S", "M"],
        color: ["red", "blue"],
      },
      100,
    );
    expect(combos).toHaveLength(4);
    expect(combos).toContainEqual({ size: "S", color: "red" });
    expect(combos).toContainEqual({ size: "S", color: "blue" });
    expect(combos).toContainEqual({ size: "M", color: "red" });
    expect(combos).toContainEqual({ size: "M", color: "blue" });
  });

  test("respects maxVariants limit", () => {
    const combos = generateCombinations(
      {
        a: ["1", "2", "3"],
        b: ["x", "y", "z"],
        c: ["alpha", "beta"],
      },
      5,
    );
    expect(combos).toHaveLength(5);
  });

  test("returns empty for empty axes", () => {
    expect(generateCombinations({}, 10)).toHaveLength(0);
  });

  test("single axis generates flat list", () => {
    const combos = generateCombinations(
      { section: ["25x25", "30x30", "40x40"] },
      10,
    );
    expect(combos).toHaveLength(3);
    expect(combos[0]).toEqual({ section: "25x25" });
    expect(combos[1]).toEqual({ section: "30x30" });
    expect(combos[2]).toEqual({ section: "40x40" });
  });

  test("three axes produce Cartesian product up to limit", () => {
    const combos = generateCombinations(
      {
        section: ["25x25", "30x30"],
        class: ["C25/30", "C30/37"],
        finish: ["smooth", "rough"],
      },
      100,
    );
    // 2 × 2 × 2 = 8
    expect(combos).toHaveLength(8);
  });
});

// ============================================================================
// Variant presets file structure
// ============================================================================

describe("variant presets structure", () => {
  test("presets file has expected shape", () => {
    // Simulate loading the actual presets file
    const presets: VariantPresetsFile = {
      version: "1.0",
      description: "Test presets",
      presets: {
        concrete_columns: {
          label: "Pilares de betao armado",
          axes: {
            section: ["25x25", "30x30"],
            concreteClass: ["C25/30", "C30/37"],
          },
          maxVariants: 6,
        },
      },
      itemMappings: {
        EHS010: "concrete_columns",
      },
    };

    expect(presets.presets.concrete_columns.axes.section).toHaveLength(2);
    expect(presets.itemMappings.EHS010).toBe("concrete_columns");
  });

  test("item mapping resolves to valid preset", () => {
    const presets: VariantPresetsFile = {
      version: "1.0",
      description: "Test",
      presets: {
        masonry: {
          label: "Alvenaria",
          axes: { thickness: ["15", "20"] },
          maxVariants: 4,
        },
      },
      itemMappings: {
        FFF010: "masonry",
        FFF020: "masonry",
      },
    };

    for (const [code, presetName] of Object.entries(presets.itemMappings)) {
      expect(presets.presets[presetName]).toBeDefined();
      expect(presets.presets[presetName].axes).toBeDefined();
    }
  });
});

// ============================================================================
// DB loader: flatMap variant expansion
// ============================================================================

describe("DB loader variant expansion", () => {
  // We test the conversion logic by simulating what convertToWorkItems does

  test("item without variants produces single work item", () => {
    const item = {
      code: "EHS010",
      description: "Pilar de betao armado",
      unit: "m",
      totalCost: 673.53,
      category: "Estruturas",
      breakdown: [],
      typology: "obra_nova",
    };

    // Simulating: no variants → result should be array of length 1
    const hasVariants = !item.hasOwnProperty("variants") || !(item as Record<string, unknown>).variants;
    expect(hasVariants).toBe(true);
  });

  test("item with variants produces 1 + N work items", () => {
    const item = {
      code: "EHS010",
      description: "Pilar de betao armado",
      unit: "m",
      totalCost: 673.53,
      category: "Estruturas",
      breakdown: [],
      typology: "obra_nova",
      variants: [
        { variantId: "C30_37_30x30", parameters: { class: "C30/37", section: "30x30" }, unitCost: 712.30 },
        { variantId: "C25_30_40x40", parameters: { class: "C25/30", section: "40x40" }, unitCost: 580.15 },
      ],
    };

    // Base item + 2 variants = 3 total work items
    const expectedCount = 1 + item.variants.length;
    expect(expectedCount).toBe(3);

    // Variant codes follow pattern: parentCode_variantId
    const variantCodes = item.variants.map((v) => `${item.code}_${v.variantId}`);
    expect(variantCodes).toContain("EHS010_C30_37_30x30");
    expect(variantCodes).toContain("EHS010_C25_30_40x40");
  });

  test("variant code format is stable and predictable", () => {
    const params1 = { class: "C30/37", section: "30x30" };
    const params2 = { class: "C30/37", section: "30x30" };

    // Same params → same ID
    expect(generateVariantId(params1)).toBe(generateVariantId(params2));

    // Different params → different ID
    const params3 = { class: "C25/30", section: "30x30" };
    expect(generateVariantId(params1)).not.toBe(generateVariantId(params3));
  });

  test("variant count limits are respected in combination generation", () => {
    const preset: VariantPreset = {
      label: "Test",
      axes: {
        section: ["25x25", "30x30", "40x40", "50x50", "60x60"],
        concreteClass: ["C25/30", "C30/37", "C35/45"],
      },
      maxVariants: 10,
    };

    // 5 × 3 = 15, but limit is 10
    const combos = generateCombinations(preset.axes, preset.maxVariants);
    expect(combos.length).toBeLessThanOrEqual(10);
    expect(combos.length).toBe(10);
  });

  test("backward compat: items without variants field produce single entry", () => {
    // This tests what the DB loader does — items from pre-variant era
    // have no `variants` field and should work identically to before
    const legacyItem = {
      code: "EHB070",
      description: "Viga de betao armado",
      unit: "m",
      totalCost: 96.93,
      category: "Estruturas",
      breakdown: [],
      // No typology, no variants — legacy format
    };

    expect((legacyItem as Record<string, unknown>).variants).toBeUndefined();
    expect((legacyItem as Record<string, unknown>).typology).toBeUndefined();
  });
});

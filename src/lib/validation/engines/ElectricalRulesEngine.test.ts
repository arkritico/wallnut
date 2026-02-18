import { describe, it, expect, beforeAll } from "vitest";
import {
  ElectricalRulesEngine,
  ElectricalRule,
  ValidationContext,
} from "../electrical-rules-engine";

// ============================================================
// HELPERS
// ============================================================

function makeRule(overrides: Partial<ElectricalRule>): ElectricalRule {
  return {
    id: "TEST_R001",
    reference: "Test",
    category: "Instalações Elétricas",
    subcategory: "Test subcategory",
    rule_text: "Test rule",
    parameters: {},
    validation_type: "formula",
    severity: "mandatory",
    formula: "",
    conditions: undefined,
    lookup_tables: null,
    error_message: "Test failed",
    success_message: "Test passed",
    source: { regulation: "RTIEBT", article: "Test", version: "1.0", date: "2026-01-01" },
    metadata: { complexity: "simple", requires_calculation: true, application_scope: ["Geral"] },
    ...overrides,
  };
}

function makeContext(params: Record<string, any>): ValidationContext {
  return {
    projectType: "residential",
    scope: "general",
    parameters: params,
  };
}

// ============================================================
// TESTS
// ============================================================

describe("ElectricalRulesEngine", () => {
  // ----------------------------------------------------------
  // Formula Classification
  // ----------------------------------------------------------
  describe("Formula Classification", () => {
    let engine: ElectricalRulesEngine;

    beforeAll(() => {
      engine = new ElectricalRulesEngine([]);
    });

    it("classifies boolean formulas", () => {
      expect(engine.classifyFormula("all_circuits_have_DR == True")).toBe("boolean");
      expect(engine.classifyFormula("sockets_in_sauna == False")).toBe("boolean");
    });

    it("classifies conditional formulas", () => {
      expect(engine.classifyFormula("IF Cu THEN S_PEN>=10; IF Al THEN S_PEN>=16")).toBe("conditional");
      expect(engine.classifyFormula("IF S_fase<=16 THEN S_pe>=S_fase")).toBe("conditional");
    });

    it("classifies lookup formulas", () => {
      expect(engine.classifyFormula("I_service <= lookup_52C1(material, section_mm2, method)")).toBe("lookup");
      expect(engine.classifyFormula("R_earth_ohm <= lookup_53GD(IDn)")).toBe("lookup");
    });

    it("classifies correction factor formulas", () => {
      expect(engine.classifyFormula("Iz_corrected = Iz_base * lookup_52D1(temp_ambient, insulation_type)")).toBe("correction");
    });

    it("classifies math formulas", () => {
      expect(engine.classifyFormula("S_pe >= sqrt(I²t) / k")).toBe("math");
      expect(engine.classifyFormula("Icc^2 * t <= k^2 * S^2")).toBe("math");
      expect(engine.classifyFormula("Zs_ohm * Ia_A <= Uo_V")).toBe("math");
    });

    it("classifies compound formulas", () => {
      expect(engine.classifyFormula("IB_A <= In_A AND In_A <= Iz_A")).toBe("compound");
      expect(engine.classifyFormula("S_neutral >= MAX(16, S_phase/2)")).toBe("compound");
    });

    it("classifies simple comparison formulas", () => {
      expect(engine.classifyFormula("IDn_mA <= 30")).toBe("simple");
      expect(engine.classifyFormula("dimension_mm >= 700")).toBe("simple");
      expect(engine.classifyFormula("burial_depth_m >= 0.5")).toBe("simple");
    });
  });

  // ----------------------------------------------------------
  // Category A: Simple Comparison
  // ----------------------------------------------------------
  describe("Simple Comparison", () => {
    it("passes when value meets threshold", async () => {
      const rule = makeRule({ formula: "IDn_mA <= 30" });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({ rcdSensitivity: 30 }));
      const result = report.results.find(r => r.ruleId === "TEST_R001");
      expect(result?.passed).toBe(true);
    });

    it("fails when value exceeds threshold", async () => {
      const rule = makeRule({ formula: "IDn_mA <= 30" });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({ rcdSensitivity: 100 }));
      const result = report.results.find(r => r.ruleId === "TEST_R001");
      expect(result?.passed).toBe(false);
    });

    it("skips when variable not in context", async () => {
      const rule = makeRule({ formula: "dimension_mm >= 700" });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({}));
      const result = report.results.find(r => r.ruleId === "TEST_R001");
      expect(result?.passed).toBe(true); // Skipped = pass
      expect(result?.details?.calculation?.result).toContain("skipped");
    });

    it("handles ABS() expressions", async () => {
      const rule = makeRule({ formula: "ABS(voltage_variation_percent) <= 8" });
      const engine = new ElectricalRulesEngine([rule]);

      const passReport = await engine.validate(makeContext({ voltageVariation: -5 }));
      expect(passReport.results[0]?.passed).toBe(true);

      const failReport = await engine.validate(makeContext({ voltageVariation: -10 }));
      expect(failReport.results[0]?.passed).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // Category B: Lookup Comparison
  // ----------------------------------------------------------
  describe("Lookup Comparison", () => {
    const lookupTable = {
      lookup_table: {
        Cu: {
          "10": { A: 46, B: 57, C: 63 },
          "16": { A: 61, B: 76, C: 85 },
        },
        Al: {
          "10": { A: 36, B: 44, C: 49 },
        },
      },
    };

    it("passes when service current is below admissible", async () => {
      const rule = makeRule({
        formula: "I_service <= lookup_52C1(material, section_mm2, method)",
        lookup_tables: lookupTable,
      });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(
        makeContext({ serviceCurrent: 50, conductorMaterial: "Cu", conductorSection: 10, installationMethod: "B" })
      );
      const result = report.results[0];
      expect(result?.passed).toBe(true);
      expect(result?.details?.calculation?.result?.lookupValue).toBe(57);
    });

    it("fails when service current exceeds admissible", async () => {
      const rule = makeRule({
        formula: "I_service <= lookup_52C1(material, section_mm2, method)",
        lookup_tables: lookupTable,
      });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(
        makeContext({ serviceCurrent: 60, conductorMaterial: "Cu", conductorSection: 10, installationMethod: "B" })
      );
      expect(report.results[0]?.passed).toBe(false);
    });

    it("skips when lookup args not in context", async () => {
      const rule = makeRule({
        formula: "I_service <= lookup_52C1(material, section_mm2, method)",
        lookup_tables: lookupTable,
      });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({ serviceCurrent: 50 }));
      expect(report.results[0]?.passed).toBe(true);
      expect(report.results[0]?.details?.calculation?.result).toContain("skipped");
    });
  });

  // ----------------------------------------------------------
  // Category C: Correction Factor
  // ----------------------------------------------------------
  describe("Correction Factor", () => {
    it("passes when corrected value matches base * factor", async () => {
      const rule = makeRule({
        formula: "Iz_corrected = Iz_base * lookup_52D1(temp_ambient, insulation_type)",
        lookup_tables: {
          lookup_table: { "40": { PVC: 0.87, XLPE: 0.91 } },
        },
      });
      const engine = new ElectricalRulesEngine([rule]);
      // Iz_base=100, factor=0.87, Iz_corrected=87 (100*0.87)
      const report = await engine.validate(
        makeContext({
          admissibleCurrent: 100,
          correctedAdmissibleCurrent: 87,
          ambientTemperature: 40,
          insulationType: "PVC",
        })
      );
      expect(report.results[0]?.passed).toBe(true);
    });

    it("skips when Iz values not in context", async () => {
      const rule = makeRule({
        formula: "Iz_corrected = Iz_base * lookup_52D1(temp_ambient, insulation_type)",
        lookup_tables: { lookup_table: { "40": { PVC: 0.87 } } },
      });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({ ambientTemperature: 40, insulationType: "PVC" }));
      expect(report.results[0]?.passed).toBe(true); // Skipped
    });
  });

  // ----------------------------------------------------------
  // Category D: Math Formulas
  // ----------------------------------------------------------
  describe("Math Formulas", () => {
    it("passes impedance loop check: Zs * Ia <= Uo", async () => {
      const rule = makeRule({ formula: "Zs_ohm * Ia_A <= Uo_V" });
      const engine = new ElectricalRulesEngine([rule]);
      // 0.5 * 200 = 100 <= 230
      const report = await engine.validate(
        makeContext({ loopImpedance: 0.5, faultDisconnectCurrent: 200, nominalVoltage: 230 })
      );
      expect(report.results[0]?.passed).toBe(true);
    });

    it("fails impedance loop when product exceeds Uo", async () => {
      const rule = makeRule({ formula: "Zs_ohm * Ia_A <= Uo_V" });
      const engine = new ElectricalRulesEngine([rule]);
      // 2.0 * 200 = 400 > 230
      const report = await engine.validate(
        makeContext({ loopImpedance: 2.0, faultDisconnectCurrent: 200, nominalVoltage: 230 })
      );
      expect(report.results[0]?.passed).toBe(false);
    });

    it("passes earth resistance check: RA * Ia <= 50", async () => {
      const rule = makeRule({ formula: "RA_ohm * Ia_A <= 50" });
      const engine = new ElectricalRulesEngine([rule]);
      // 2 * 20 = 40 <= 50
      const report = await engine.validate(
        makeContext({ earthingResistance: 2, faultDisconnectCurrent: 20 })
      );
      expect(report.results[0]?.passed).toBe(true);
    });

    it("passes conventional tripping: I2 <= 1.45 * Iz", async () => {
      const rule = makeRule({ formula: "I2_A <= 1.45 * Iz_A" });
      const engine = new ElectricalRulesEngine([rule]);
      // I2=80, Iz=63, 1.45*63=91.35, 80<=91.35 ✓
      const report = await engine.validate(
        makeContext({ conventionalTrippingCurrent: 80, admissibleCurrent: 63 })
      );
      expect(report.results[0]?.passed).toBe(true);
    });

    it("skips PE sizing when variables missing", async () => {
      const rule = makeRule({ formula: "S_pe >= sqrt(I²t) / k" });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({}));
      expect(report.results[0]?.passed).toBe(true); // Skipped
    });
  });

  // ----------------------------------------------------------
  // Category E: Conditional
  // ----------------------------------------------------------
  describe("Conditional", () => {
    it("evaluates correct branch for Cu material", async () => {
      const rule = makeRule({
        formula: "IF Cu THEN S_PEN>=10; IF Al THEN S_PEN>=16",
      });
      const engine = new ElectricalRulesEngine([rule]);
      // Cu with PEN=10 → passes (10>=10)
      const report = await engine.validate(
        makeContext({ conductorMaterial: "Cu", penSection: 10 })
      );
      expect(report.results[0]?.passed).toBe(true);
    });

    it("fails when Cu PEN section too small", async () => {
      const rule = makeRule({
        formula: "IF Cu THEN S_PEN>=10; IF Al THEN S_PEN>=16",
      });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(
        makeContext({ conductorMaterial: "Cu", penSection: 6 })
      );
      expect(report.results[0]?.passed).toBe(false);
    });

    it("evaluates correct branch for Al material", async () => {
      const rule = makeRule({
        formula: "IF Cu THEN S_PEN>=10; IF Al THEN S_PEN>=16",
      });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(
        makeContext({ conductorMaterial: "Al", penSection: 16 })
      );
      expect(report.results[0]?.passed).toBe(true);
    });

    it("handles cascaded section conditions", async () => {
      const rule = makeRule({
        formula: "IF S_fase<=16 THEN S_pe>=S_fase; IF 16<S_fase<=35 THEN S_pe>=16; IF S_fase>35 THEN S_pe>=S_fase/2",
      });
      const engine = new ElectricalRulesEngine([rule]);

      // S_fase=10, S_pe=10 → first condition: 10<=16, S_pe(10)>=S_fase(10) ✓
      const r1 = await engine.validate(makeContext({ conductorSection: 10, peSection: 10 }));
      expect(r1.results[0]?.passed).toBe(true);

      // S_fase=25, S_pe=16 → second condition: 16<25<=35, S_pe(16)>=16 ✓
      const r2 = await engine.validate(makeContext({ conductorSection: 25, peSection: 16 }));
      expect(r2.results[0]?.passed).toBe(true);

      // S_fase=50, S_pe=25 → third condition: 50>35, S_pe(25)>=50/2=25 ✓
      const r3 = await engine.validate(makeContext({ conductorSection: 50, peSection: 25 }));
      expect(r3.results[0]?.passed).toBe(true);

      // S_fase=50, S_pe=20 → third condition: 50>35, S_pe(20)>=25 ✗
      const r4 = await engine.validate(makeContext({ conductorSection: 50, peSection: 20 }));
      expect(r4.results[0]?.passed).toBe(false);
    });

    it("skips when condition variables missing", async () => {
      const rule = makeRule({
        formula: "IF Cu THEN S_PEN>=10; IF Al THEN S_PEN>=16",
      });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({}));
      expect(report.results[0]?.passed).toBe(true); // No condition matched = skip
    });
  });

  // ----------------------------------------------------------
  // Category F: Boolean
  // ----------------------------------------------------------
  describe("Boolean", () => {
    it("passes when boolean variable matches True", async () => {
      const rule = makeRule({ formula: "all_circuits_have_DR == True" });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({ hasResidualCurrentDevice: true }));
      expect(report.results[0]?.passed).toBe(true);
    });

    it("fails when boolean variable is false but True required", async () => {
      const rule = makeRule({ formula: "all_circuits_have_DR == True" });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({ hasResidualCurrentDevice: false }));
      expect(report.results[0]?.passed).toBe(false);
    });

    it("skips when boolean variable not in context", async () => {
      const rule = makeRule({
        formula: "floor_heating_has_metallic_grid_earthed == True",
      });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({}));
      expect(report.results[0]?.passed).toBe(true); // Skipped
    });
  });

  // ----------------------------------------------------------
  // Category G: Compound
  // ----------------------------------------------------------
  describe("Compound", () => {
    it("passes when all compound parts pass", async () => {
      const rule = makeRule({ formula: "IB_A <= In_A AND In_A <= Iz_A" });
      const engine = new ElectricalRulesEngine([rule]);
      // IB=40, In=50, Iz=63 → 40<=50 AND 50<=63 ✓
      const report = await engine.validate(
        makeContext({ serviceCurrent: 40, nominalCurrent: 50, admissibleCurrent: 63 })
      );
      expect(report.results[0]?.passed).toBe(true);
    });

    it("fails when one compound part fails", async () => {
      const rule = makeRule({ formula: "IB_A <= In_A AND In_A <= Iz_A" });
      const engine = new ElectricalRulesEngine([rule]);
      // IB=40, In=70, Iz=63 → 40<=70 AND 70<=63 ✗
      const report = await engine.validate(
        makeContext({ serviceCurrent: 40, nominalCurrent: 70, admissibleCurrent: 63 })
      );
      expect(report.results[0]?.passed).toBe(false);
    });

    it("evaluates MAX() in compound expressions", async () => {
      const rule = makeRule({ formula: "S_neutral >= MAX(16, S_phase/2)" });
      const engine = new ElectricalRulesEngine([rule]);
      // S_phase=50 → MAX(16, 25) = 25, S_neutral=25 >= 25 ✓
      const report = await engine.validate(
        makeContext({ neutralSection: 25, conductorSection: 50 })
      );
      expect(report.results[0]?.passed).toBe(true);
    });

    it("handles cable_area/void_area compound", async () => {
      const rule = makeRule({
        formula: "cable_area/void_area <= 0.25 AND void_min_dim >= 20",
      });
      const engine = new ElectricalRulesEngine([rule]);
      // 10/100=0.1 <= 0.25 AND 25 >= 20 ✓
      const report = await engine.validate(
        makeContext({ cableArea: 10, voidArea: 100, voidMinDim: 25 })
      );
      expect(report.results[0]?.passed).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // Table Navigation
  // ----------------------------------------------------------
  describe("Table Navigation (via Lookup)", () => {
    it("navigates nested Cu -> 10 -> B lookup", async () => {
      const lookupTable = {
        lookup_table: {
          Cu: { "10": { A: 46, B: 57, C: 63 }, "16": { A: 61, B: 76, C: 85 } },
        },
      };
      const rule = makeRule({
        formula: "I_service <= lookup_52C1(material, section_mm2, method)",
        lookup_tables: lookupTable,
      });
      const engine = new ElectricalRulesEngine([rule]);
      // Cu → 10 → B = 57, I_service=57 → 57<=57 ✓
      const report = await engine.validate(
        makeContext({ serviceCurrent: 57, conductorMaterial: "Cu", conductorSection: 10, installationMethod: "B" })
      );
      expect(report.results[0]?.passed).toBe(true);
      expect(report.results[0]?.details?.calculation?.result?.lookupValue).toBe(57);
    });

    it("uses closest numeric key for section sizes", async () => {
      const lookupTable = {
        lookup_table: {
          Cu: { "4": { B: 32 }, "6": { B: 41 }, "10": { B: 57 } },
        },
      };
      const rule = makeRule({
        formula: "I_service <= lookup_52C1(material, section_mm2, method)",
        lookup_tables: lookupTable,
      });
      const engine = new ElectricalRulesEngine([rule]);
      // Section 8 → closest <= 8 is 6, Cu→6→B=41
      const report = await engine.validate(
        makeContext({ serviceCurrent: 40, conductorMaterial: "Cu", conductorSection: 8, installationMethod: "B" })
      );
      expect(report.results[0]?.passed).toBe(true);
      expect(report.results[0]?.details?.calculation?.result?.lookupValue).toBe(41);
    });
  });

  // ----------------------------------------------------------
  // Integration: Full Validate
  // ----------------------------------------------------------
  describe("Integration", () => {
    it("handles empty context gracefully (all rules skipped)", async () => {
      const rules = [
        makeRule({ id: "R1", formula: "IDn_mA <= 30" }),
        makeRule({ id: "R2", formula: "all_circuits_have_DR == True" }),
        makeRule({ id: "R3", formula: "I_service <= lookup_52C1(material, section_mm2, method)", lookup_tables: { lookup_table: { Cu: { "10": { B: 57 } } } } }),
      ];
      const engine = new ElectricalRulesEngine(rules);
      const report = await engine.validate(makeContext({}));

      // All should pass (skipped due to missing context)
      expect(report.results.every(r => r.passed)).toBe(true);
      expect(report.summary.failed).toBe(0);
    });

    it("report summary counts are correct", async () => {
      const rules = [
        makeRule({ id: "R1", formula: "IDn_mA <= 30" }),
        makeRule({ id: "R2", formula: "dimension_mm >= 700" }),
      ];
      const engine = new ElectricalRulesEngine(rules);
      // R1: 100 > 30 → fail, R2: 800 >= 700 → pass
      const report = await engine.validate(
        makeContext({ rcdSensitivity: 100, dimensionMm: 800 })
      );
      expect(report.summary.total).toBe(2);
      expect(report.summary.passed).toBe(1);
      expect(report.summary.failed).toBe(1);
      expect(report.summary.critical).toBe(1); // mandatory severity
    });

    it("no longer returns stub message", async () => {
      const rule = makeRule({ formula: "IDn_mA <= 30" });
      const engine = new ElectricalRulesEngine([rule]);
      const report = await engine.validate(makeContext({ rcdSensitivity: 30 }));
      const calc = report.results[0]?.details?.calculation;
      expect(calc?.result).not.toBe("Formula evaluation not yet implemented");
    });
  });
});

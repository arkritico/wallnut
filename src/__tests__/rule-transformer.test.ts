import { describe, it, expect } from "vitest";
import {
  transformExtractedRule,
  transformAndMerge,
  type ExtractedRuleInput,
} from "@/lib/plugins/rule-transformer";
import type { DeclarativeRule } from "@/lib/plugins/types";

function makeRule(overrides: Partial<ExtractedRuleInput> = {}): ExtractedRuleInput {
  return {
    id: "R001",
    artigo: "Art. 10.º",
    regulamento: "RGEU",
    categoria: "arquitetura",
    descricao: "Pé-direito mínimo em compartimentos habitáveis",
    contexto: "O pé-direito deve ser >= 2.40m",
    parametro: "architecture.ceilingHeight",
    tipo_validacao: "threshold",
    valores: { min: 2.4, unidade: "m" },
    ambito: "residential",
    severidade: "mandatory",
    ...overrides,
  };
}

describe("transformExtractedRule", () => {
  it("generates correct ID format PF-{PLUGIN}-{ruleId}", () => {
    const result = transformExtractedRule(makeRule({ id: "R042" }), "general");
    expect(result.id).toBe("PF-GENERAL-R042");
  });

  it("uppercases pluginId in generated ID", () => {
    const result = transformExtractedRule(makeRule(), "fire-safety");
    expect(result.id).toBe("PF-FIRE-SAFETY-R001");
  });

  it("maps mandatory severity to critical", () => {
    const result = transformExtractedRule(makeRule({ severidade: "mandatory" }), "general");
    expect(result.severity).toBe("critical");
  });

  it("maps recommended severity to warning", () => {
    const result = transformExtractedRule(makeRule({ severidade: "recommended" }), "general");
    expect(result.severity).toBe("warning");
  });

  it("maps informative severity to info", () => {
    const result = transformExtractedRule(makeRule({ severidade: "informative" }), "general");
    expect(result.severity).toBe("info");
  });

  it("defaults unknown severity to warning", () => {
    const result = transformExtractedRule(makeRule({ severidade: "unknown" as "mandatory" }), "general");
    expect(result.severity).toBe("warning");
  });

  it("uses regulationId parameter over rule.regulamento", () => {
    const result = transformExtractedRule(makeRule({ regulamento: "RGEU" }), "general", "general-rgeu");
    expect(result.regulationId).toBe("general-rgeu");
  });

  it("falls back to rule.regulamento when regulationId not provided", () => {
    const result = transformExtractedRule(makeRule({ regulamento: "RGEU" }), "general");
    expect(result.regulationId).toBe("RGEU");
  });

  it("uses contexto as remediation text", () => {
    const result = transformExtractedRule(makeRule({ contexto: "Corrigir pé-direito" }), "general");
    expect(result.remediation).toBe("Corrigir pé-direito");
  });

  it("falls back to artigo-based remediation when no contexto", () => {
    const result = transformExtractedRule(makeRule({ contexto: undefined }), "general");
    expect(result.remediation).toBe("Verificar conforme Art. 10.º");
  });

  it("builds tags from categoria and ambito", () => {
    const result = transformExtractedRule(makeRule({ categoria: "térmica", ambito: "residential" }), "general");
    expect(result.tags).toEqual(["térmica", "residential"]);
  });

  it("filters falsy values from tags", () => {
    const result = transformExtractedRule(makeRule({ categoria: "", ambito: "commercial" }), "general");
    expect(result.tags).toEqual(["commercial"]);
  });

  it("sets enabled to true", () => {
    const result = transformExtractedRule(makeRule(), "general");
    expect(result.enabled).toBe(true);
  });

  describe("condition building", () => {
    it("threshold with min generates < condition", () => {
      const result = transformExtractedRule(
        makeRule({ tipo_validacao: "threshold", valores: { min: 2.4 } }),
        "general",
      );
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0]).toEqual({
        field: "architecture.ceilingHeight",
        operator: "<",
        value: 2.4,
      });
    });

    it("threshold with max generates > condition", () => {
      const result = transformExtractedRule(
        makeRule({ tipo_validacao: "threshold", valores: { max: 100 } }),
        "general",
      );
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].operator).toBe(">");
      expect(result.conditions[0].value).toBe(100);
    });

    it("range with min+max generates not_in_range condition", () => {
      const result = transformExtractedRule(
        makeRule({ tipo_validacao: "range", valores: { min: 2.4, max: 4.0 } }),
        "general",
      );
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].operator).toBe("not_in_range");
      expect(result.conditions[0].value).toEqual([2.4, 4.0]);
    });

    it("range with only min falls back to < condition", () => {
      const result = transformExtractedRule(
        makeRule({ tipo_validacao: "range", valores: { min: 2.4 } }),
        "general",
      );
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].operator).toBe("<");
    });

    it("formula generates formula_gt condition with formula string", () => {
      const result = transformExtractedRule(
        makeRule({ tipo_validacao: "formula", valores: { formula: "A * 0.5 + B" } }),
        "general",
      );
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].operator).toBe("formula_gt");
      expect(result.conditions[0].formula).toBe("A * 0.5 + B");
    });

    it("lookup uses first table value", () => {
      const result = transformExtractedRule(
        makeRule({
          tipo_validacao: "lookup",
          valores: { tabela: { zona_I1: 1.7, zona_I2: 1.5, zona_I3: 1.3 } },
        }),
        "general",
      );
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].operator).toBe("<");
      expect(result.conditions[0].value).toBe(1.7);
    });

    it("conditional with min generates < condition", () => {
      const result = transformExtractedRule(
        makeRule({ tipo_validacao: "conditional", valores: { min: 0.87 } }),
        "general",
      );
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0].operator).toBe("<");
      expect(result.conditions[0].value).toBe(0.87);
    });
  });
});

describe("transformAndMerge", () => {
  it("transforms and adds new rules", () => {
    const rules = [makeRule({ id: "R001" }), makeRule({ id: "R002" })];
    const { added, skipped } = transformAndMerge(rules, [], "general");
    expect(added).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(added[0].id).toBe("PF-GENERAL-R001");
    expect(added[1].id).toBe("PF-GENERAL-R002");
  });

  it("skips rules that already exist", () => {
    const existing: DeclarativeRule[] = [
      {
        id: "PF-GENERAL-R001",
        regulationId: "RGEU",
        article: "Art. 10.º",
        description: "Existing rule",
        severity: "critical",
        conditions: [],
        enabled: true,
      },
    ];
    const rules = [makeRule({ id: "R001" }), makeRule({ id: "R002" })];
    const { added, skipped } = transformAndMerge(rules, existing, "general");
    expect(added).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(added[0].id).toBe("PF-GENERAL-R002");
  });

  it("deduplicates within the batch itself", () => {
    const rules = [makeRule({ id: "R001" }), makeRule({ id: "R001" })];
    const { added, skipped } = transformAndMerge(rules, [], "general");
    expect(added).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it("passes regulationId through to all transformed rules", () => {
    const rules = [makeRule({ id: "R001" })];
    const { added } = transformAndMerge(rules, [], "general", "general-rgeu");
    expect(added[0].regulationId).toBe("general-rgeu");
  });
});

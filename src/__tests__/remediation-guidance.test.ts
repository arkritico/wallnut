import { describe, it, expect } from "vitest";
import { getRemediation } from "@/lib/remediation-guidance";
import type { Finding } from "@/lib/types";

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: "F-1",
    area: "architecture",
    regulation: "RGEU",
    article: "Art. 65",
    description: "Test finding",
    severity: "critical",
    ...overrides,
  };
}

describe("getRemediation", () => {
  describe("architecture area", () => {
    it("provides remediation for ceiling height issues", () => {
      const finding = makeFinding({
        area: "architecture",
        description: "O pé-direito (2.40m) é inferior ao mínimo",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("pé-direito");
    });

    it("provides remediation for natural light issues", () => {
      const finding = makeFinding({
        area: "architecture",
        description: "Todos os compartimentos devem ter iluminação natural",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("envidraçados");
    });

    it("provides remediation for cross ventilation", () => {
      const finding = makeFinding({
        area: "architecture",
        description: "ventilação cruzada nos fogos de habitação",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("fachadas");
    });
  });

  describe("fire safety area", () => {
    it("provides remediation for detection system issues", () => {
      const finding = makeFinding({
        area: "fire_safety",
        description: "O edifício não possui sistema de deteção de incêndio",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("SADI");
    });

    it("provides remediation for evacuation issues", () => {
      const finding = makeFinding({
        area: "fire_safety",
        description: "distância máxima de evacuação excedida",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("saída");
    });
  });

  describe("thermal area", () => {
    it("provides remediation for wall U-value", () => {
      const finding = makeFinding({
        area: "thermal",
        description: "parede exterior U-value excede o máximo",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("ETICS");
    });

    it("provides remediation for roof U-value", () => {
      const finding = makeFinding({
        area: "thermal",
        description: "cobertura com U-value elevado",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("cobertura");
    });
  });

  describe("electrical area", () => {
    it("provides remediation for RCD issues", () => {
      const finding = makeFinding({
        area: "electrical",
        description: "proteção diferencial insuficiente",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("30mA");
    });
  });

  describe("accessibility area", () => {
    it("provides remediation for door width", () => {
      const finding = makeFinding({
        area: "accessibility",
        description: "largura da porta insuficiente",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("0.87m");
    });

    it("provides remediation for ramp issues", () => {
      const finding = makeFinding({
        area: "accessibility",
        description: "inclinação da rampa excede o máximo",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("6%");
    });
  });

  describe("fallback behavior", () => {
    it("provides generic remediation for critical unmatched findings", () => {
      const finding = makeFinding({
        area: "general",
        severity: "critical",
        description: "some unrecognized issue xyz abc",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("Corrigir");
    });

    it("provides generic remediation for warning unmatched findings", () => {
      const finding = makeFinding({
        area: "general",
        severity: "warning",
        description: "some unrecognized warning xyz abc",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeDefined();
      expect(rem).toContain("Verificar");
    });

    it("returns undefined for pass findings", () => {
      const finding = makeFinding({
        area: "general",
        severity: "pass",
        description: "everything is fine",
      });
      const rem = getRemediation(finding);
      expect(rem).toBeUndefined();
    });
  });
});

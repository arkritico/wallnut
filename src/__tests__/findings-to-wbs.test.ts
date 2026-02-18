import { describe, it, expect } from "vitest";
import { findingsToWbs, generateRemediationSummary } from "@/lib/findings-to-wbs";
import type { Finding } from "@/lib/types";

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: "F-1",
    area: "architecture",
    regulation: "RGEU",
    article: "Art. 65",
    description: "Test finding description",
    severity: "critical",
    ...overrides,
  };
}

describe("findingsToWbs", () => {
  it("returns empty array for no actionable findings", () => {
    const findings = [
      makeFinding({ severity: "pass" }),
      makeFinding({ severity: "info" }),
    ];
    expect(findingsToWbs(findings)).toEqual([]);
  });

  it("generates articles for critical findings", () => {
    const findings = [
      makeFinding({ id: "F-1", area: "thermal", severity: "critical", description: "Wall U-value too high" }),
      makeFinding({ id: "F-2", area: "thermal", severity: "critical", description: "Roof U-value too high" }),
    ];
    const articles = findingsToWbs(findings);
    // 1 revision task + 2 specific tasks + 1 coordination = 4
    expect(articles.length).toBe(4);
    expect(articles[0].code).toBe("REM.09.01"); // thermal chapter
    expect(articles[0].description).toContain("Revisão de projeto");
    expect(articles[articles.length - 1].code).toBe("REM.99.01"); // coordination
  });

  it("generates articles for warning findings", () => {
    const findings = [
      makeFinding({ area: "fire_safety", severity: "warning", description: "Warning about fire" }),
    ];
    const articles = findingsToWbs(findings);
    // 1 revision task + 0 specific (warnings don't get individual tasks) + 1 coordination = 2
    expect(articles.length).toBe(2);
    expect(articles[0].code).toBe("REM.03.01"); // fire safety chapter
  });

  it("groups findings by area", () => {
    const findings = [
      makeFinding({ area: "thermal", severity: "critical", description: "Thermal issue" }),
      makeFinding({ area: "electrical", severity: "critical", description: "Electrical issue" }),
      makeFinding({ area: "thermal", severity: "warning", description: "Thermal warning" }),
    ];
    const articles = findingsToWbs(findings);
    // thermal: 1 revision + 1 specific, electrical: 1 revision + 1 specific, + 1 coord = 5
    expect(articles.length).toBe(5);
    const codes = articles.map(a => a.code);
    expect(codes).toContain("REM.09.01"); // thermal
    expect(codes).toContain("REM.07.01"); // electrical
    expect(codes).toContain("REM.99.01"); // coordination
  });

  it("articles have valid WbsArticle format", () => {
    const findings = [
      makeFinding({ area: "acoustic", severity: "critical", description: "Acoustic problem" }),
    ];
    const articles = findingsToWbs(findings);
    for (const a of articles) {
      expect(a.code).toBeDefined();
      expect(a.description).toBeDefined();
      expect(a.unit).toBe("vg");
      expect(a.quantity).toBe(1);
    }
  });

  it("includes tags with specialty info", () => {
    const findings = [
      makeFinding({ area: "accessibility", severity: "critical", description: "Door too narrow" }),
    ];
    const articles = findingsToWbs(findings);
    const revision = articles[0];
    expect(revision.tags).toBeDefined();
    expect(revision.tags).toContain("Acessibilidade");
  });
});

describe("generateRemediationSummary", () => {
  it("returns zero counts for pass-only findings", () => {
    const findings = [makeFinding({ severity: "pass" })];
    const summary = generateRemediationSummary(findings);
    expect(summary.totalTasks).toBe(0);
    expect(summary.criticalCount).toBe(0);
    expect(summary.warningCount).toBe(0);
  });

  it("counts criticals and warnings correctly", () => {
    const findings = [
      makeFinding({ area: "thermal", severity: "critical" }),
      makeFinding({ area: "thermal", severity: "critical" }),
      makeFinding({ area: "electrical", severity: "warning" }),
      makeFinding({ area: "acoustic", severity: "pass" }),
    ];
    const summary = generateRemediationSummary(findings);
    expect(summary.criticalCount).toBe(2);
    expect(summary.warningCount).toBe(1);
    expect(summary.totalTasks).toBeGreaterThan(0);
  });

  it("lists affected areas", () => {
    const findings = [
      makeFinding({ area: "thermal", severity: "critical" }),
      makeFinding({ area: "electrical", severity: "warning" }),
    ];
    const summary = generateRemediationSummary(findings);
    expect(summary.affectedAreas).toContain("Térmica");
    expect(summary.affectedAreas).toContain("Eletricidade");
  });

  it("estimates positive duration for actionable findings", () => {
    const findings = [
      makeFinding({ area: "structural", severity: "critical" }),
    ];
    const summary = generateRemediationSummary(findings);
    expect(summary.estimatedTotalDays).toBeGreaterThan(5);
  });
});

import { describe, it, expect } from "vitest";
import { buildRegulationGraph } from "../lib/regulation-graph";
import { getAvailablePlugins } from "../lib/plugins/loader";

describe("buildRegulationGraph", () => {
  const plugins = getAvailablePlugins();
  const graph = buildRegulationGraph(plugins);

  it("produces nodes for all 18 specialties", () => {
    const specialties = graph.nodes.filter(n => n.type === "specialty");
    expect(specialties).toHaveLength(18);
  });

  it("each specialty node has a unique color", () => {
    const specialties = graph.nodes.filter(n => n.type === "specialty");
    const colors = specialties.map(n => n.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("produces regulation nodes matching total regulations", () => {
    const regs = graph.nodes.filter(n => n.type === "regulation");
    expect(regs.length).toBe(graph.stats.totalRegulations);
  });

  it("produces rule nodes matching total rules", () => {
    const rules = graph.nodes.filter(n => n.type === "rule");
    expect(rules.length).toBe(graph.stats.totalRules);
  });

  it("all node IDs are unique", () => {
    const ids = graph.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("containment links = regulations + rules count", () => {
    const containLinks = graph.links.filter(l => l.type === "contains");
    expect(containLinks.length).toBe(
      graph.stats.totalRegulations + graph.stats.totalRules,
    );
  });

  it("detects cross-specialty links", () => {
    expect(graph.stats.crossSpecialtyLinks).toBeGreaterThan(0);
    const crossLinks = graph.links.filter(l => l.type === "cross-specialty");
    expect(crossLinks.length).toBe(graph.stats.crossSpecialtyLinks);
  });

  it("severity counts sum to total rules", () => {
    const { critical, warning, info, pass } = graph.stats.severityCounts;
    expect(critical + warning + info + pass).toBe(graph.stats.totalRules);
  });

  it("rule nodes have severity color", () => {
    const rules = graph.nodes.filter(n => n.type === "rule");
    for (const rule of rules.slice(0, 50)) {
      expect(["#ef4444", "#f59e0b", "#3b82f6", "#22c55e"]).toContain(rule.color);
    }
  });

  it("specialty and regulation nodes have consistent specialtyId", () => {
    const regs = graph.nodes.filter(n => n.type === "regulation");
    const specialtyIds = new Set(graph.nodes.filter(n => n.type === "specialty").map(n => n.specialtyId));
    for (const reg of regs) {
      expect(specialtyIds).toContain(reg.specialtyId);
    }
  });

  it("node size values follow hierarchy: specialty > regulation > rule", () => {
    const spec = graph.nodes.find(n => n.type === "specialty")!;
    const reg = graph.nodes.find(n => n.type === "regulation")!;
    const rule = graph.nodes.find(n => n.type === "rule")!;
    expect(spec.val).toBeGreaterThan(reg.val);
    expect(reg.val).toBeGreaterThan(rule.val);
  });

  // Browsing metadata
  it("detects building types from rule conditions", () => {
    expect(graph.stats.buildingTypes.length).toBeGreaterThan(0);
    expect(graph.stats.buildingTypes).toContain("residential");
  });

  it("rule nodes have projectScope", () => {
    const rules = graph.nodes.filter(n => n.type === "rule");
    for (const rule of rules) {
      expect(["new", "rehab", "all"]).toContain(rule.projectScope);
    }
  });

  it("some rules have applicableTypes, some are universal", () => {
    const rules = graph.nodes.filter(n => n.type === "rule");
    const withTypes = rules.filter(r => r.applicableTypes && r.applicableTypes.length > 0);
    const universal = rules.filter(r => !r.applicableTypes || r.applicableTypes.length === 0);
    expect(withTypes.length).toBeGreaterThan(0);
    expect(universal.length).toBeGreaterThan(0);
  });

  it("most rules have a subTopic derived from tags", () => {
    const rules = graph.nodes.filter(n => n.type === "rule");
    const withSubTopic = rules.filter(r => r.subTopic);
    // At least 50% should have sub-topics
    expect(withSubTopic.length).toBeGreaterThan(rules.length * 0.5);
  });
});

import { describe, it, expect } from "vitest";
import {
  PHASE_OVERLAP_RULES,
  PHASE_EQUIPMENT,
  getPhaseEquipment,
  getOverlapRule,
} from "@/lib/phase-constraints";

describe("PHASE_OVERLAP_RULES", () => {
  it("has 20 rules", () => {
    expect(PHASE_OVERLAP_RULES.length).toBe(20);
  });

  it("includes structure→waterproofing non-overlap with 7-day gap", () => {
    const rule = PHASE_OVERLAP_RULES.find(
      (r) => r.phase1 === "structure" && r.phase2 === "waterproofing",
    );
    expect(rule).toBeDefined();
    expect(rule!.canOverlap).toBe(false);
    expect(rule!.minimumGap).toBe(7);
  });

  it("allows rough-in phases to overlap", () => {
    const rule = PHASE_OVERLAP_RULES.find(
      (r) =>
        r.phase1 === "rough_in_electrical" &&
        r.phase2 === "rough_in_plumbing",
    );
    expect(rule).toBeDefined();
    expect(rule!.canOverlap).toBe(true);
  });

  it("all rules have Portuguese reason text", () => {
    for (const rule of PHASE_OVERLAP_RULES) {
      expect(rule.reason.length).toBeGreaterThan(5);
    }
  });
});

describe("PHASE_EQUIPMENT", () => {
  it("has 8 entries", () => {
    expect(PHASE_EQUIPMENT.length).toBe(8);
  });

  it("maps structure to crane, concrete_pump, scaffolding", () => {
    const entry = PHASE_EQUIPMENT.find((e) => e.phase === "structure");
    expect(entry).toBeDefined();
    expect(entry!.equipment).toContain("crane");
    expect(entry!.equipment).toContain("concrete_pump");
    expect(entry!.equipment).toContain("scaffolding");
  });
});

describe("getPhaseEquipment", () => {
  it("returns crane for earthworks", () => {
    expect(getPhaseEquipment("earthworks")).toEqual(["crane"]);
  });

  it("returns empty array for phases without equipment", () => {
    expect(getPhaseEquipment("internal_finishes")).toEqual([]);
  });

  it("returns crane and scaffolding for roof", () => {
    const equip = getPhaseEquipment("roof");
    expect(equip).toContain("crane");
    expect(equip).toContain("scaffolding");
  });
});

describe("getOverlapRule", () => {
  it("finds rule by exact phase order", () => {
    const rule = getOverlapRule("structure", "waterproofing");
    expect(rule).not.toBeNull();
    expect(rule!.canOverlap).toBe(false);
  });

  it("finds rule with reversed phase order (bidirectional)", () => {
    const rule = getOverlapRule("waterproofing", "structure");
    expect(rule).not.toBeNull();
    expect(rule!.minimumGap).toBe(7);
  });

  it("returns null for phases without a rule", () => {
    const rule = getOverlapRule("site_setup", "cleanup");
    expect(rule).toBeNull();
  });
});

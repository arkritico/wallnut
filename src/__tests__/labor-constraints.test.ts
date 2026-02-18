import { describe, it, expect } from "vitest";
import { inferMaxWorkers } from "@/lib/labor-constraints";

describe("inferMaxWorkers", () => {
  it("returns 6 workers for budget under 500K", () => {
    const result = inferMaxWorkers(300_000);
    expect(result.maxWorkers).toBe(6);
    expect(result.budgetRange).toBe("< 500K €");
  });

  it("returns 10 workers for budget 500K-1.5M", () => {
    const result = inferMaxWorkers(800_000);
    expect(result.maxWorkers).toBe(10);
    expect(result.budgetRange).toBe("500K – 1.5M €");
  });

  it("returns 20 workers for budget 1.5M-5M", () => {
    const result = inferMaxWorkers(3_000_000);
    expect(result.maxWorkers).toBe(20);
    expect(result.budgetRange).toBe("1.5M – 5M €");
  });

  it("returns 40 workers for budget over 5M", () => {
    const result = inferMaxWorkers(10_000_000);
    expect(result.maxWorkers).toBe(40);
    expect(result.budgetRange).toBe("> 5M €");
  });

  // Boundary tests
  it("budget exactly at 500K falls into 500K-1.5M bracket", () => {
    const result = inferMaxWorkers(500_000);
    expect(result.maxWorkers).toBe(10);
  });

  it("budget exactly at 1.5M falls into 1.5M-5M bracket", () => {
    const result = inferMaxWorkers(1_500_000);
    expect(result.maxWorkers).toBe(20);
  });

  it("budget exactly at 5M falls into >5M bracket", () => {
    const result = inferMaxWorkers(5_000_000);
    expect(result.maxWorkers).toBe(40);
  });

  it("zero budget defaults to 6 workers", () => {
    const result = inferMaxWorkers(0);
    expect(result.maxWorkers).toBe(6);
  });

  it("negative budget treated as zero (6 workers)", () => {
    const result = inferMaxWorkers(-100_000);
    expect(result.maxWorkers).toBe(6);
  });

  it("includes Portuguese rationale mentioning director de obra", () => {
    const result = inferMaxWorkers(1_000_000);
    expect(result.rationale).toContain("director de obra");
    expect(result.rationale).toContain("€");
  });
});

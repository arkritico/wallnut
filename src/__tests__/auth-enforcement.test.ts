/**
 * Auth enforcement tests
 *
 * Tests for isAllowedEmail(), signUpWithDomainCheck(),
 * and signInWithDomainCheck() domain validation.
 */

import { describe, it, expect } from "vitest";
import { isAllowedEmail } from "../lib/auth-guard";

describe("isAllowedEmail", () => {
  it("accepts valid @wallnut.pt emails", () => {
    expect(isAllowedEmail("user@wallnut.pt")).toBe(true);
    expect(isAllowedEmail("pedro.silva@wallnut.pt")).toBe(true);
    expect(isAllowedEmail("test123@wallnut.pt")).toBe(true);
  });

  it("accepts case-insensitive domain", () => {
    expect(isAllowedEmail("user@Wallnut.PT")).toBe(true);
    expect(isAllowedEmail("user@WALLNUT.PT")).toBe(true);
    expect(isAllowedEmail("user@Wallnut.Pt")).toBe(true);
  });

  it("rejects other domains", () => {
    expect(isAllowedEmail("user@gmail.com")).toBe(false);
    expect(isAllowedEmail("user@outlook.com")).toBe(false);
    expect(isAllowedEmail("user@example.pt")).toBe(false);
  });

  it("rejects domain bypass attempts", () => {
    // Subdomain attack
    expect(isAllowedEmail("user@evil.wallnut.pt")).toBe(false);
    // Suffix attack
    expect(isAllowedEmail("user@wallnut.pt.attacker.com")).toBe(false);
    // Prefix attack
    expect(isAllowedEmail("user@notwallnut.pt")).toBe(false);
  });

  it("rejects malformed emails", () => {
    expect(isAllowedEmail("")).toBe(false);
    expect(isAllowedEmail("@wallnut.pt")).toBe(false);
    expect(isAllowedEmail("noatsign")).toBe(false);
    expect(isAllowedEmail("user@")).toBe(false);
    expect(isAllowedEmail("user@@wallnut.pt")).toBe(false);
  });
});

describe("signUpWithDomainCheck", () => {
  it("rejects non-wallnut.pt emails before calling Supabase", async () => {
    // Dynamic import to avoid Supabase initialization issues
    const { signUpWithDomainCheck } = await import("../lib/auth-guard");

    const result = await signUpWithDomainCheck("user@gmail.com", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("@wallnut.pt");
  });

  it("rejects bypass attempts before calling Supabase", async () => {
    const { signUpWithDomainCheck } = await import("../lib/auth-guard");

    const result = await signUpWithDomainCheck("user@wallnut.pt.evil.com", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("@wallnut.pt");
  });
});

describe("signInWithDomainCheck", () => {
  it("rejects non-wallnut.pt emails before calling Supabase", async () => {
    const { signInWithDomainCheck } = await import("../lib/auth-guard");

    const result = await signInWithDomainCheck("attacker@evil.com", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("@wallnut.pt");
  });

  it("rejects empty email", async () => {
    const { signInWithDomainCheck } = await import("../lib/auth-guard");

    const result = await signInWithDomainCheck("", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("@wallnut.pt");
  });
});

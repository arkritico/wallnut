/**
 * Auth guard utilities for Wallnut.
 *
 * Enforces:
 * 1. Only @wallnut.pt emails can sign up / sign in
 * 2. MFA (TOTP) is required — users at AAL1 must enroll and verify
 *
 * Supabase Dashboard setup required:
 *   - Authentication → Settings → Restrict email domain → "wallnut.pt"
 *   - Authentication → MFA → Enable TOTP
 *
 * Additional RLS policy (add to Supabase SQL Editor):
 *   CREATE POLICY "Require MFA on projects"
 *     ON projects FOR ALL
 *     USING (
 *       auth.jwt() ->> 'aal' = 'aal2'
 *       AND auth.jwt() ->> 'email' LIKE '%@wallnut.pt'
 *     );
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";

const ALLOWED_DOMAIN = "wallnut.pt";

// ============================================================
// Email domain validation
// ============================================================

export function isAllowedEmail(email: string): boolean {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0]) return false;
  return parts[1].toLowerCase() === ALLOWED_DOMAIN;
}

// ============================================================
// Sign up with domain check
// ============================================================

export interface AuthResult {
  success: boolean;
  error?: string;
  needsMfaEnrollment?: boolean;
  needsMfaVerification?: boolean;
  mfaFactorId?: string;
}

export async function signUpWithDomainCheck(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isAllowedEmail(email)) {
    return {
      success: false,
      error: `Apenas emails @${ALLOWED_DOMAIN} são permitidos.`,
    };
  }

  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase não configurado." };

  const { error } = await sb.auth.signUp({ email, password });
  if (error) return { success: false, error: error.message };

  return { success: true, needsMfaEnrollment: true };
}

// ============================================================
// Sign in with domain check + MFA flow
// ============================================================

export async function signInWithDomainCheck(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isAllowedEmail(email)) {
    return {
      success: false,
      error: `Apenas emails @${ALLOWED_DOMAIN} são permitidos.`,
    };
  }

  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase não configurado." };

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };

  // Check if MFA challenge is required
  if (data.session?.user) {
    // Check user's MFA factors
    const { data: factors } = await sb.auth.mfa.listFactors();
    const totpFactors = factors?.totp ?? [];

    if (totpFactors.length === 0) {
      // User has no TOTP factor — needs enrollment
      return { success: true, needsMfaEnrollment: true };
    }

    // Has a verified factor — check if session is aal2
    const verifiedFactor = totpFactors.find(f => f.status === "verified");
    if (verifiedFactor) {
      // Need to present TOTP challenge
      const { data: challenge, error: challengeError } =
        await sb.auth.mfa.challenge({ factorId: verifiedFactor.id });

      if (challengeError) {
        return { success: false, error: challengeError.message };
      }

      return {
        success: true,
        needsMfaVerification: true,
        mfaFactorId: challenge.id,
      };
    }

    // Has unverified factor — re-enroll
    return { success: true, needsMfaEnrollment: true };
  }

  return { success: true };
}

// ============================================================
// MFA Enrollment (TOTP)
// ============================================================

export interface MfaEnrollmentResult {
  success: boolean;
  error?: string;
  factorId?: string;
  qrCode?: string; // SVG or data URI for the QR code
  secret?: string; // Manual entry secret
  uri?: string; // otpauth:// URI
}

export async function enrollMfaTOTP(): Promise<MfaEnrollmentResult> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase não configurado." };

  const { data, error } = await sb.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Wallnut Authenticator",
  });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

// ============================================================
// MFA Verification
// ============================================================

export async function verifyMfaTOTP(
  factorId: string,
  challengeId: string,
  code: string,
): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase não configurado." };

  const { error } = await sb.auth.mfa.verify({
    factorId,
    challengeId,
    code,
  });

  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Challenge + verify a TOTP factor in one step.
 * Used after enrollment or for returning users.
 */
export async function challengeAndVerifyMfa(
  factorId: string,
  code: string,
): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: "Supabase não configurado." };

  // Create a challenge first
  const { data: challenge, error: challengeError } =
    await sb.auth.mfa.challenge({ factorId });

  if (challengeError) {
    return { success: false, error: challengeError.message };
  }

  // Verify the challenge
  const { error: verifyError } = await sb.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });

  if (verifyError) {
    return { success: false, error: verifyError.message };
  }

  return { success: true };
}

// ============================================================
// Session AAL check
// ============================================================

export type AuthAssuranceLevel = "aal1" | "aal2";

export async function getSessionAAL(): Promise<AuthAssuranceLevel | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return null;

  return data.currentLevel as AuthAssuranceLevel;
}

/**
 * Check whether the current session meets the required assurance level.
 * Returns true if:
 *   - Supabase is not configured (local-only mode)
 *   - Session is at AAL2 (MFA verified)
 */
export async function isFullyAuthenticated(): Promise<boolean> {
  if (!isSupabaseConfigured()) return true; // local-only mode
  const aal = await getSessionAAL();
  return aal === "aal2";
}

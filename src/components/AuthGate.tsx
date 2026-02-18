"use client";

/**
 * AuthGate — Login component with @wallnut.pt restriction and TOTP 2FA.
 *
 * Flow:
 * 1. User enters email (@wallnut.pt only) + password
 * 2. If new user → sign up → enroll TOTP → verify code
 * 3. If existing user → sign in → verify TOTP code
 * 4. Once at AAL2, callback fires and app unlocks
 */

import { useState } from "react";
import {
  signInWithDomainCheck,
  signUpWithDomainCheck,
  enrollMfaTOTP,
  challengeAndVerifyMfa,
  isAllowedEmail,
  type AuthResult,
  type MfaEnrollmentResult,
} from "@/lib/auth-guard";
import { useI18n } from "@/lib/i18n";
import { Shield, Loader2, KeyRound, Smartphone } from "lucide-react";

interface AuthGateProps {
  onAuthenticated: () => void;
}

type AuthStep = "login" | "signup" | "mfa-enroll" | "mfa-verify";

export default function AuthGate({ onAuthenticated }: AuthGateProps) {
  const { lang } = useI18n();
  const [step, setStep] = useState<AuthStep>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // MFA state
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollmentResult | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const txt = {
    title: lang === "pt" ? "Entrar no Wallnut" : "Sign in to Wallnut",
    subtitle: lang === "pt"
      ? "Acesso restrito a utilizadores @wallnut.pt"
      : "Access restricted to @wallnut.pt users",
    emailLabel: "Email",
    passwordLabel: lang === "pt" ? "Palavra-passe" : "Password",
    signIn: lang === "pt" ? "Entrar" : "Sign In",
    signUp: lang === "pt" ? "Criar Conta" : "Create Account",
    noAccount: lang === "pt" ? "Não tem conta?" : "No account?",
    hasAccount: lang === "pt" ? "Já tem conta?" : "Have an account?",
    mfaTitle: lang === "pt"
      ? "Configurar Autenticação de 2 Fatores"
      : "Set Up Two-Factor Authentication",
    mfaInstructions: lang === "pt"
      ? "Leia o código QR com a sua aplicação de autenticação (Google Authenticator, Authy, etc.)"
      : "Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)",
    mfaManual: lang === "pt" ? "Ou introduza a chave manualmente:" : "Or enter the key manually:",
    verifyTitle: lang === "pt"
      ? "Verificação de 2 Fatores"
      : "Two-Factor Verification",
    verifyInstructions: lang === "pt"
      ? "Introduza o código de 6 dígitos da sua aplicação de autenticação."
      : "Enter the 6-digit code from your authenticator app.",
    verifyButton: lang === "pt" ? "Verificar" : "Verify",
    codeLabel: lang === "pt" ? "Código TOTP" : "TOTP Code",
  };

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isAllowedEmail(email)) {
      setError(lang === "pt"
        ? "Apenas emails @wallnut.pt são permitidos."
        : "Only @wallnut.pt emails are allowed.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await signInWithDomainCheck(email, password);
      handleAuthResult(result);
    } catch {
      setError(lang === "pt" ? "Erro de autenticação." : "Authentication error.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isAllowedEmail(email)) {
      setError(lang === "pt"
        ? "Apenas emails @wallnut.pt são permitidos."
        : "Only @wallnut.pt emails are allowed.");
      return;
    }

    if (password.length < 8) {
      setError(lang === "pt"
        ? "A palavra-passe deve ter no mínimo 8 caracteres."
        : "Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await signUpWithDomainCheck(email, password);
      handleAuthResult(result);
    } catch {
      setError(lang === "pt" ? "Erro ao criar conta." : "Error creating account.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleAuthResult(result: AuthResult) {
    if (!result.success) {
      setError(result.error ?? "Unknown error");
      return;
    }

    if (result.needsMfaEnrollment) {
      startMfaEnrollment();
    } else if (result.needsMfaVerification && result.mfaFactorId) {
      setMfaFactorId(result.mfaFactorId);
      setStep("mfa-verify");
    } else {
      onAuthenticated();
    }
  }

  async function startMfaEnrollment() {
    setIsLoading(true);
    try {
      const enrollment = await enrollMfaTOTP();
      if (!enrollment.success) {
        setError(enrollment.error ?? "MFA enrollment failed");
        return;
      }
      setMfaEnrollment(enrollment);
      setMfaFactorId(enrollment.factorId ?? null);
      setStep("mfa-enroll");
    } catch {
      setError(lang === "pt" ? "Erro ao configurar 2FA." : "Error setting up 2FA.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!mfaFactorId || totpCode.length !== 6) {
      setError(lang === "pt" ? "Introduza o código de 6 dígitos." : "Enter the 6-digit code.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await challengeAndVerifyMfa(mfaFactorId, totpCode);
      if (!result.success) {
        setError(result.error ?? "Verification failed");
        return;
      }
      onAuthenticated();
    } catch {
      setError(lang === "pt" ? "Código inválido." : "Invalid code.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Login / Signup Form ──────────────────────────────────
  if (step === "login" || step === "signup") {
    const isSignUp = step === "signup";
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-light rounded-2xl mb-4">
              <Shield className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{txt.title}</h1>
            <p className="text-sm text-gray-500 mt-1">{txt.subtitle}</p>
          </div>

          <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 mb-1">
                {txt.emailLabel}
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nome@wallnut.pt"
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-sm"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">
                {txt.passwordLabel}
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-sm"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {isSignUp ? txt.signUp : txt.signIn}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setError(null); setStep(isSignUp ? "login" : "signup"); }}
              className="text-sm text-accent hover:text-accent-hover"
            >
              {isSignUp ? txt.hasAccount : txt.noAccount} {isSignUp ? txt.signIn : txt.signUp}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MFA Enrollment ───────────────────────────────────────
  if (step === "mfa-enroll") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-50 rounded-2xl mb-4">
              <Smartphone className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{txt.mfaTitle}</h2>
            <p className="text-sm text-gray-500 mt-1">{txt.mfaInstructions}</p>
          </div>

          {mfaEnrollment?.qrCode && (
            <div className="flex justify-center mb-4">
              {/* QR code from Supabase is an SVG string */}
              <div
                className="bg-white p-4 rounded-lg border"
                dangerouslySetInnerHTML={{ __html: mfaEnrollment.qrCode }}
              />
            </div>
          )}

          {mfaEnrollment?.secret && (
            <div className="mb-6">
              <p className="text-xs text-gray-500 mb-1">{txt.mfaManual}</p>
              <code className="block text-center text-sm font-mono bg-gray-100 p-2 rounded select-all break-all">
                {mfaEnrollment.secret}
              </code>
            </div>
          )}

          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div>
              <label htmlFor="totp-code" className="block text-sm font-medium text-gray-700 mb-1">
                {txt.codeLabel}
              </label>
              <input
                id="totp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
                autoComplete="one-time-code"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-center text-lg font-mono tracking-widest"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {txt.verifyButton}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── MFA Verification (returning user) ────────────────────
  if (step === "mfa-verify") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-light rounded-2xl mb-4">
              <KeyRound className="w-8 h-8 text-accent" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{txt.verifyTitle}</h2>
            <p className="text-sm text-gray-500 mt-1">{txt.verifyInstructions}</p>
          </div>

          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div>
              <label htmlFor="totp-verify" className="block text-sm font-medium text-gray-700 mb-1">
                {txt.codeLabel}
              </label>
              <input
                id="totp-verify"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
                autoComplete="one-time-code"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-center text-lg font-mono tracking-widest"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {txt.verifyButton}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return null;
}

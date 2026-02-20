"use client";

import { useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  signInWithDomainCheck,
  signUpWithDomainCheck,
  type AuthResult,
} from "@/lib/auth-guard";
import { LogIn, UserPlus, Loader2, AlertCircle, Lock } from "lucide-react";

interface AuthGateProps {
  children: React.ReactNode;
  user: { email?: string } | null;
  checked: boolean;
  onAuthChange: () => void;
}

/**
 * Full-screen auth gate.
 *
 * - Supabase not configured → renders children (local-only mode)
 * - Auth check pending → loading spinner
 * - Not authenticated → full-screen login/signup form (@wallnut.pt only)
 * - Authenticated → renders children
 */
export default function AuthGate({
  children,
  user,
  checked,
  onAuthChange,
}: AuthGateProps) {
  if (!isSupabaseConfigured()) return <>{children}</>;

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto mb-3" />
          <p className="text-sm text-gray-500">A verificar sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onAuthChange={onAuthChange} />;
  }

  return <>{children}</>;
}

// ============================================================
// Full-screen login
// ============================================================

function LoginScreen({ onAuthChange }: { onAuthChange: () => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      let result: AuthResult;
      if (isSignUp) {
        result = await signUpWithDomainCheck(email, password);
      } else {
        result = await signInWithDomainCheck(email, password);
      }

      if (!result.success) {
        setError(result.error ?? "Erro desconhecido.");
        return;
      }

      if (isSignUp) {
        setSuccess("Conta criada. Verifique o seu email para confirmar.");
        setEmail("");
        setPassword("");
        return;
      }

      // Successful sign-in
      setEmail("");
      setPassword("");
      onAuthChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-accent/10 rounded-2xl mb-4">
            <Lock className="w-7 h-7 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Wallnut</h1>
          <p className="text-sm text-gray-500 mt-1">
            Plataforma de automação para construção
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {isSignUp ? "Criar Conta" : "Iniciar Sessão"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
                placeholder="nome@wallnut.pt"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Apenas emails @wallnut.pt
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Palavra-passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="text-sm text-green-700 bg-green-50 rounded-lg p-2.5">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover font-medium text-sm disabled:opacity-50 transition-colors min-h-[40px]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-4 h-4" /> Criar Conta
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" /> Entrar
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setSuccess(null);
              }}
              className="text-sm text-accent hover:text-accent-hover"
            >
              {isSignUp
                ? "Já tem conta? Entrar"
                : "Não tem conta? Criar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

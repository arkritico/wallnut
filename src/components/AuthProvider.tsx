"use client";

import { useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { signInWithEmail, signUpWithEmail, signOut } from "@/lib/supabase-storage";
import { useI18n } from "@/lib/i18n";
import { LogIn, LogOut, UserPlus, Loader2, AlertCircle } from "lucide-react";

interface AuthProviderProps {
  user: { email?: string } | null;
  onAuthChange: () => void;
}

export default function AuthProvider({ user, onAuthChange }: AuthProviderProps) {
  const { lang } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured()) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUpWithEmail(email, password);
        if (error) throw error;
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) throw error;
      }
      setShowModal(false);
      setEmail("");
      setPassword("");
      onAuthChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    onAuthChange();
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 hidden md:inline">{user.email}</span>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          title={lang === "pt" ? "Terminar sessão" : "Sign out"}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => { setShowModal(true); setIsSignUp(false); }}
        className="flex items-center gap-1 text-sm text-accent hover:text-accent-hover font-medium"
      >
        <LogIn className="w-4 h-4" />
        {lang === "pt" ? "Entrar" : "Sign in"}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {isSignUp
                ? (lang === "pt" ? "Criar Conta" : "Create Account")
                : (lang === "pt" ? "Iniciar Sessão" : "Sign In")}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent"
                  placeholder="email@exemplo.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {lang === "pt" ? "Palavra-passe" : "Password"}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover font-medium text-sm disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isSignUp ? (
                  <><UserPlus className="w-4 h-4" /> {lang === "pt" ? "Criar Conta" : "Create Account"}</>
                ) : (
                  <><LogIn className="w-4 h-4" /> {lang === "pt" ? "Entrar" : "Sign In"}</>
                )}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                className="text-sm text-accent hover:text-accent-hover"
              >
                {isSignUp
                  ? (lang === "pt" ? "Já tem conta? Entrar" : "Already have an account? Sign in")
                  : (lang === "pt" ? "Não tem conta? Criar" : "Don't have an account? Create one")}
              </button>
            </div>

            <div className="mt-3 text-center">
              <button
                onClick={() => setShowModal(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {lang === "pt" ? "Fechar" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

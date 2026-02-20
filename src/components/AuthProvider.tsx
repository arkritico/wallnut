"use client";

import { isSupabaseConfigured } from "@/lib/supabase";
import { signOut } from "@/lib/supabase-storage";
import { useI18n } from "@/lib/i18n";
import { LogOut } from "lucide-react";

interface AuthProviderProps {
  user: { email?: string } | null;
  onAuthChange: () => void;
}

/**
 * Header-only auth display: shows current user email + sign-out button.
 * Login/signup is handled by AuthGate at the page level.
 */
export default function AuthProvider({ user, onAuthChange }: AuthProviderProps) {
  const { lang } = useI18n();

  if (!isSupabaseConfigured() || !user) return null;

  async function handleSignOut() {
    await signOut();
    onAuthChange();
  }

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

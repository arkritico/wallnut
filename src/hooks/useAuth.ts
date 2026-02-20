"use client";

import { useState, useEffect, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getCurrentUser, onAuthStateChange } from "@/lib/supabase-storage";

export interface AuthUser {
  email?: string;
}

export interface AuthState {
  user: AuthUser | null;
  checked: boolean;
  refresh: () => Promise<void>;
}

/**
 * Reusable auth state hook.
 * - When Supabase is not configured, returns checked=true immediately (local-only mode).
 * - When Supabase is configured, checks for current user and subscribes to auth changes.
 */
export function useAuth(): AuthState {
  const supabaseReady = isSupabaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(!supabaseReady);

  const refresh = useCallback(async () => {
    if (!supabaseReady) return;
    try {
      const u = await getCurrentUser();
      setUser(u ? { email: u.email ?? undefined } : null);
    } catch {
      setUser(null);
    }
  }, [supabaseReady]);

  useEffect(() => {
    if (!supabaseReady) return;

    getCurrentUser()
      .then((u) => {
        setUser(u ? { email: u.email ?? undefined } : null);
        setChecked(true);
      })
      .catch(() => {
        setChecked(true);
      });

    const {
      data: { subscription },
    } = onAuthStateChange((u) => {
      if (u && typeof u === "object" && "email" in u) {
        setUser({ email: (u as { email?: string }).email });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabaseReady]);

  return { user, checked, refresh };
}

"use client";

/**
 * Plumbing Rules Browser Page
 *
 * Demonstration page showing the 331 integrated plumbing rules
 * from RGSPPDADAR, RT-SCIE, DL 69/2023, EN 806, and EN 12056
 */

import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/hooks/useAuth";

export default function PlumbingRulesPage() {
  const { user, checked, refresh } = useAuth();

  return (
    <AuthGate user={user} checked={checked} onAuthChange={refresh}>
      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              🚰 Regulamentos Hidráulicos
            </h1>
            <p className="text-gray-600 mb-4">
              331 regras de RGSPPDADAR + RT-SCIE + DL 69/2023 + EN 806 + EN 12056
            </p>
            <div className="bg-accent-light border border-accent rounded-lg p-4">
              <p className="text-accent">
                Página de teste - navegação funcionou! ✅
              </p>
              <p className="text-sm text-accent mt-2">
                A carregar componente completo...
              </p>
            </div>
          </div>
        </div>
      </main>
    </AuthGate>
  );
}

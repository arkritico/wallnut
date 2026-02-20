"use client";

/**
 * Electrical Rules Browser Page
 *
 * Demonstration page showing the 292 electrical rules
 * from RTIEBT, RSRDEEBT, and SCIE regulations
 */

import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/hooks/useAuth";

export default function ElectricalRulesPage() {
  const { user, checked, refresh } = useAuth();

  return (
    <AuthGate user={user} checked={checked} onAuthChange={refresh}>
      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              ⚡ Regulamentos Elétricos
            </h1>
            <p className="text-gray-600 mb-4">
              292 regras de RTIEBT + RSRDEEBT + SCIE
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800">
                Página de teste - navegação funcionou! ✅
              </p>
              <p className="text-sm text-amber-600 mt-2">
                A carregar componente completo...
              </p>
            </div>
          </div>
        </div>
      </main>
    </AuthGate>
  );
}

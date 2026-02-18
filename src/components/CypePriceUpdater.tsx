"use client";

/**
 * CYPE Price Updater Component
 * Allows manual triggering of price updates with progress tracking
 */

import { useState } from "react";
import { RefreshCw, Database, CheckCircle, AlertCircle, Clock } from "lucide-react";

interface UpdateJob {
  id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  total_items: number;
  errors: number;
}

export default function CypePriceUpdater() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentJob, setCurrentJob] = useState<UpdateJob | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerUpdate = async () => {
    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch("/api/cype/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: ["Isolamentos", "Instalacoes", "Fachadas"],
          region: "Lisboa",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start update");
      }

      setCurrentJob({ id: data.jobId, status: "running", started_at: new Date().toISOString(), total_items: 0, errors: 0 });

      // Poll for status
      pollJobStatus(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsUpdating(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/cype/update?jobId=${jobId}`);
        const data = await response.json();

        if (data.job) {
          setCurrentJob(data.job);

          if (data.job.status === "completed" || data.job.status === "failed") {
            clearInterval(interval);
            setIsUpdating(false);
            setLastUpdate(data.job.completed_at);
          }
        }
      } catch (err) {
        console.error("Error polling status:", err);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 10 minutes
    setTimeout(() => clearInterval(interval), 600000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            Base de Dados CYPE
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Preços de construção para Lisboa/Cascais
          </p>
        </div>

        <button
          onClick={triggerUpdate}
          disabled={isUpdating}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
            ${
              isUpdating
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-hover active:scale-95"
            }
          `}
        >
          <RefreshCw className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
          {isUpdating ? "A atualizar..." : "Atualizar Preços"}
        </button>
      </div>

      {/* Status */}
      {currentJob && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            {currentJob.status === "running" && (
              <>
                <Clock className="w-4 h-4 text-accent animate-pulse" />
                <span className="text-sm font-medium text-accent">A processar...</span>
              </>
            )}
            {currentJob.status === "completed" && (
              <>
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-900">Concluído!</span>
              </>
            )}
            {currentJob.status === "failed" && (
              <>
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-900">Erro</span>
              </>
            )}
          </div>

          <div className="text-xs text-gray-600 space-y-1">
            {currentJob.total_items > 0 && (
              <div>Items processados: <span className="font-medium">{currentJob.total_items}</span></div>
            )}
            {currentJob.errors > 0 && (
              <div className="text-red-600">Erros: <span className="font-medium">{currentJob.errors}</span></div>
            )}
            {currentJob.completed_at && (
              <div>Concluído: <span className="font-medium">{new Date(currentJob.completed_at).toLocaleString("pt-PT")}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 rounded-lg">
          <div className="flex items-center gap-2 text-red-900">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* Last Update */}
      {lastUpdate && !isUpdating && (
        <div className="mt-4 text-xs text-gray-500">
          Última atualização: {new Date(lastUpdate).toLocaleString("pt-PT")}
        </div>
      )}

      {/* Info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          💡 <strong>Nota:</strong> A atualização completa pode demorar várias horas.
          Os preços são atualizados automaticamente no dia 1 de cada mês.
        </p>
      </div>
    </div>
  );
}

"use client";

/**
 * Rule Verification Panel — Interactive AI + Web Search verification
 *
 * Iterative workflow:
 * 1. Engineer selects rules to verify
 * 2. AI + web search cross-references against official sources
 * 3. Results displayed with discrepancies highlighted
 * 4. Engineer provides feedback
 * 5. Re-verification with refined context
 */

import { useState, useCallback } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  Loader2,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Send,
  AlertTriangle,
  AlertCircle,
  Info,
  Globe,
  X,
} from "lucide-react";
import type {
  VerificationResult,
  VerificationResponse,
  VerificationStatus,
  DiscrepancyDetail,
  RuleToVerify,
} from "@/lib/rule-verification";

// ============================================================
// Types
// ============================================================

interface RuleVerificationPanelProps {
  /** Rules selected for verification */
  rules: RuleToVerify[];
  /** Callback when verification completes (to update annotations) */
  onVerified?: (results: VerificationResult[]) => void;
  /** Callback to close the panel */
  onClose?: () => void;
}

// ============================================================
// Constants
// ============================================================

const STATUS_CONFIG: Record<VerificationStatus, {
  icon: typeof Shield;
  color: string;
  bg: string;
  border: string;
  label: string;
  description: string;
}> = {
  verified: {
    icon: ShieldCheck,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    label: "Verificada",
    description: "Regra corresponde ao texto oficial",
  },
  discrepancy: {
    icon: ShieldAlert,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    label: "Discrepância",
    description: "Diferenças encontradas em relação ao texto oficial",
  },
  outdated: {
    icon: ShieldX,
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    label: "Desatualizada",
    description: "Regulamento foi alterado ou revogado",
  },
  unverifiable: {
    icon: ShieldQuestion,
    color: "text-gray-600",
    bg: "bg-gray-50",
    border: "border-gray-200",
    label: "Inverificável",
    description: "Não foi possível encontrar fonte oficial",
  },
  misinterpretation: {
    icon: ShieldX,
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    label: "Má Interpretação",
    description: "A regra interpreta incorretamente o regulamento",
  },
  pending: {
    icon: Shield,
    color: "text-gray-400",
    bg: "bg-gray-50",
    border: "border-gray-200",
    label: "Pendente",
    description: "Ainda não verificada",
  },
};

const DISCREPANCY_TYPE_LABELS: Record<DiscrepancyDetail["type"], string> = {
  value_mismatch: "Valor incorreto",
  article_reference: "Artigo errado",
  scope_error: "Erro de âmbito",
  missing_condition: "Condição em falta",
  outdated_value: "Valor desatualizado",
  interpretation_error: "Erro de interpretação",
};

const SEVERITY_ICONS: Record<DiscrepancyDetail["severity"], typeof AlertCircle> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

// ============================================================
// Component
// ============================================================

export default function RuleVerificationPanel({
  rules,
  onVerified,
  onClose,
}: RuleVerificationPanelProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [searchProvider, setSearchProvider] = useState<string>("");
  const [iteration, setIteration] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [customQueries, setCustomQueries] = useState("");
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("standard");

  // ============================================================
  // Verification
  // ============================================================

  const runVerification = useCallback(async () => {
    setIsVerifying(true);
    setError(null);

    try {
      const response = await fetch("/api/verify-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules,
          feedback: feedback.trim() || undefined,
          customSearchQueries: customQueries.trim()
            ? customQueries.split("\n").filter(q => q.trim())
            : undefined,
          analysisDepth: depth,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${response.status}`);
      }

      const data: VerificationResponse & { searchProvider?: string } = await response.json();

      setResults(data.results);
      setNextSteps(data.nextSteps);
      setSearchProvider(data.searchProvider ?? "");
      setIteration(prev => prev + 1);
      setFeedback(""); // Clear feedback after use

      // Expand all results that have issues
      const toExpand = new Set<string>();
      for (const r of data.results) {
        if (r.status !== "verified") {
          toExpand.add(r.ruleId);
        }
      }
      setExpandedResults(toExpand);

      onVerified?.(data.results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(msg);
    } finally {
      setIsVerifying(false);
    }
  }, [rules, feedback, customQueries, depth, onVerified]);

  const toggleExpanded = useCallback((ruleId: string) => {
    setExpandedResults(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }, []);

  // ============================================================
  // Summary stats
  // ============================================================

  const summary = {
    verified: results.filter(r => r.status === "verified").length,
    discrepancies: results.filter(r => r.status === "discrepancy").length,
    outdated: results.filter(r => r.status === "outdated").length,
    misinterpretations: results.filter(r => r.status === "misinterpretation").length,
    unverifiable: results.filter(r => r.status === "unverifiable").length,
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="font-semibold text-gray-900">
              Verificação de Regras
              {iteration > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  Iteração {iteration}
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500">
              {rules.length} regra(s) selecionada(s)
              {searchProvider && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {searchProvider === "brave" ? "Brave Search" :
                   searchProvider === "google" ? "Google Search" :
                   "Sem pesquisa web (apenas conhecimento AI)"}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Depth selector */}
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value as "quick" | "standard" | "deep")}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="quick">Rápida</option>
            <option value="standard">Padrão</option>
            <option value="deep">Profunda</option>
          </select>
          {onClose && (
            <button onClick={onClose} className="p-1.5 hover:bg-white/80 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Rules being verified */}
      {results.length === 0 && (
        <div className="px-6 py-4 space-y-2">
          <p className="text-sm text-gray-600 mb-3">Regras a verificar:</p>
          {rules.map(rule => (
            <div key={rule.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg text-sm">
              <Shield className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-mono text-xs text-gray-500">{rule.id}</span>
                <span className="mx-1 text-gray-300">|</span>
                <span className="text-gray-600">{rule.regulationRef} {rule.article}</span>
                <p className="text-gray-500 text-xs mt-0.5">{rule.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards (after verification) */}
      {results.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          {(["verified", "discrepancy", "outdated", "misinterpretation", "unverifiable"] as const).map(status => {
            const count = summary[status === "misinterpretation" ? "misinterpretations" : status === "discrepancy" ? "discrepancies" : status];
            if (count === 0) return null;
            const cfg = STATUS_CONFIG[status];
            const Icon = cfg.icon;
            return (
              <div key={status} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                <Icon className="w-3.5 h-3.5" />
                {count} {cfg.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="divide-y divide-gray-100">
          {results.map(result => {
            const cfg = STATUS_CONFIG[result.status];
            const StatusIcon = cfg.icon;
            const isExpanded = expandedResults.has(result.ruleId);
            const rule = rules.find(r => r.id === result.ruleId);

            return (
              <div key={result.ruleId} className={isExpanded ? cfg.bg : ""}>
                {/* Result header */}
                <button
                  onClick={() => toggleExpanded(result.ruleId)}
                  className="w-full px-6 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors text-left"
                >
                  <StatusIcon className={`w-5 h-5 flex-shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">{result.ruleId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {Math.round(result.confidence * 100)}% confiança
                      </span>
                      {result.regulationUpdated && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                          Regulamento atualizado
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 truncate">
                      {rule?.regulationRef} {rule?.article} — {rule?.description}
                    </p>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />
                  }
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-6 pb-4 space-y-4">
                    {/* Explanation */}
                    <div className="p-3 bg-white rounded-lg border border-gray-200">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Análise</h4>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{result.explanation}</p>
                    </div>

                    {/* Official text */}
                    {result.officialText && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="text-xs font-semibold text-blue-600 uppercase mb-1">Texto Oficial</h4>
                        <p className="text-sm text-blue-900 whitespace-pre-wrap font-mono">{result.officialText}</p>
                      </div>
                    )}

                    {/* Discrepancies */}
                    {result.discrepancies.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase">Discrepâncias</h4>
                        {result.discrepancies.map((d, i) => {
                          const SevIcon = SEVERITY_ICONS[d.severity];
                          const sevColor = d.severity === "critical" ? "text-red-600" : d.severity === "warning" ? "text-amber-600" : "text-blue-600";
                          const sevBg = d.severity === "critical" ? "bg-red-50 border-red-200" : d.severity === "warning" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
                          return (
                            <div key={i} className={`p-3 rounded-lg border ${sevBg}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <SevIcon className={`w-4 h-4 ${sevColor}`} />
                                <span className={`text-xs font-medium ${sevColor}`}>
                                  {DISCREPANCY_TYPE_LABELS[d.type]}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-xs text-gray-500 block mb-0.5">A regra diz:</span>
                                  <p className="text-gray-700 bg-white/60 p-2 rounded">{d.ruleClaim}</p>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500 block mb-0.5">Fonte oficial:</span>
                                  <p className="text-gray-700 bg-white/60 p-2 rounded">{d.officialValue}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Suggested correction */}
                    {result.suggestedCorrection && (
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <h4 className="text-xs font-semibold text-green-700 uppercase mb-1">Correção Sugerida</h4>
                        <p className="text-sm text-green-900">{result.suggestedCorrection}</p>
                      </div>
                    )}

                    {/* Sources */}
                    {result.sources.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Fontes Consultadas</h4>
                        <div className="space-y-1">
                          {result.sources.map((s, i) => (
                            <a
                              key={i}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-2 p-2 rounded hover:bg-white/80 transition-colors group"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0 group-hover:text-indigo-500" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-indigo-600 group-hover:underline truncate">{s.title}</p>
                                <p className="text-xs text-gray-500 truncate">{s.excerpt}</p>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Next steps */}
      {nextSteps.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-100 bg-indigo-50/50">
          <h4 className="text-xs font-semibold text-indigo-600 uppercase mb-1">Próximos Passos</h4>
          <ul className="space-y-1">
            {nextSteps.map((step, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                <span className="text-indigo-400 mt-0.5">-</span>
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Feedback area (for iterative refinement) */}
      {results.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <h4 className="text-sm font-medium text-gray-700">Feedback para próxima iteração</h4>
          </div>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Descreva problemas na verificação, forneça contexto adicional, ou indique o que o AI errou...&#10;&#10;Ex: &quot;O Art. 42º foi revogado pelo DL 123/2024. Verificar a versão consolidada no DRE.&quot;"
            className="w-full h-24 px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
          />

          {/* Custom search queries */}
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
              <Search className="w-3 h-3 inline mr-1" />
              Pesquisas personalizadas (opcional)
            </summary>
            <textarea
              value={customQueries}
              onChange={(e) => setCustomQueries(e.target.value)}
              placeholder="Uma pesquisa por linha:&#10;RTIEBT Art. 42 secção mínima condutores&#10;Portaria 949-A/2006 texto consolidado"
              className="w-full h-16 mt-2 px-3 py-2 text-xs border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 font-mono"
            />
          </details>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3">
        {results.length === 0 ? (
          <button
            onClick={runVerification}
            disabled={isVerifying || rules.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verificando com AI{searchProvider && searchProvider !== "none" ? " + Web Search" : ""}...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Verificar {rules.length} Regra(s)
              </>
            )}
          </button>
        ) : (
          <>
            <button
              onClick={runVerification}
              disabled={isVerifying}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Re-verificando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Re-verificar {feedback.trim() ? "com Feedback" : ""}
                </>
              )}
            </button>
            {feedback.trim() && (
              <button
                onClick={runVerification}
                disabled={isVerifying}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
                Enviar Feedback
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

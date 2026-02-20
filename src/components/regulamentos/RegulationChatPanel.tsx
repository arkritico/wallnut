"use client";

import { useState, useRef, useCallback, useEffect, Fragment, useMemo } from "react";
import { MessageSquare, Send, Loader2, X } from "lucide-react";
import type { SpecialtyPlugin } from "@/lib/plugins/types";
import { SPECIALTY_NAMES } from "@/lib/regulation-constants";

// ── Types ──────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ruleReferences?: string[];
  rulesInContext?: number;
  timestamp: Date;
}

interface RulesAskResponse {
  answer: string;
  ruleReferences: string[];
  regulationReferences: string[];
  rulesInContext: number;
  error?: string;
}

interface RegulationChatPanelProps {
  selectedSpecialtyIds: Set<string>;
  selectedRegulationId: string | null;
  selectedRuleId: string | null;
  onSelectRule: (specialtyId: string, regulationId: string, ruleId: string) => void;
  plugins: SpecialtyPlugin[];
}

// ── Suggested questions ────────────────────────────────────

function getSuggestedQuestions(
  selectedSpecialtyIds: Set<string>,
  selectedRegulationId: string | null,
  plugins: SpecialtyPlugin[],
): string[] {
  // Regulation selected → regulation-specific questions
  if (selectedRegulationId && selectedSpecialtyIds.size === 1) {
    const pluginId = [...selectedSpecialtyIds][0];
    const plugin = plugins.find((p) => p.id === pluginId);
    const reg = plugin?.regulations.find((r) => r.id === selectedRegulationId);
    const shortRef = reg?.shortRef ?? selectedRegulationId;
    return [
      `Que regras tem o ${shortRef}?`,
      `Quais as obrigações mais críticas do ${shortRef}?`,
      `Que artigos são mais importantes no ${shortRef}?`,
    ];
  }

  // Multi-select AND mode
  if (selectedSpecialtyIds.size >= 2) {
    const names = [...selectedSpecialtyIds]
      .slice(0, 2)
      .map((id) => SPECIALTY_NAMES[id] ?? id);
    return [
      `Que regras cruzam ${names[0]} e ${names[1]}?`,
      `Quais campos são partilhados entre ${names[0]} e ${names[1]}?`,
      `Que conflitos podem existir entre ${names[0]} e ${names[1]}?`,
    ];
  }

  // Single specialty
  if (selectedSpecialtyIds.size === 1) {
    const id = [...selectedSpecialtyIds][0];
    const name = SPECIALTY_NAMES[id] ?? id;

    if (id === "structural")
      return [
        "Quais regras estruturais são críticas?",
        "Que verificações sísmicas são obrigatórias?",
        "Quais os coeficientes do Anexo Nacional?",
      ];
    if (id === "fire-safety")
      return [
        "Quais regras de incêndio se aplicam?",
        "Que meios de evacuação são obrigatórios?",
        "Qual a resistência ao fogo exigida?",
      ];
    if (id === "electrical")
      return [
        "Quais regras elétricas são críticas?",
        "Que proteções são obrigatórias?",
        "Quais os requisitos de quadros elétricos?",
      ];
    if (id === "thermal")
      return [
        "Quais os U-values máximos exigidos?",
        "Que requisitos de eficiência existem?",
        "Quais regras térmicas são críticas?",
      ];

    return [
      `Quais regras de ${name} são críticas?`,
      `Explique as regras mais importantes de ${name}.`,
      `Que requisitos de ${name} se aplicam a habitação?`,
    ];
  }

  // No selection
  return [
    "Quais especialidades têm regras críticas?",
    "Que regras se aplicam a habitação nova?",
    "Quais os principais regulamentos portugueses?",
  ];
}

// ── Rule reference rendering ───────────────────────────────

function renderAnswer(
  text: string,
  onClickRule: (ruleId: string) => void,
): React.ReactNode {
  const parts = text.split(/(\[[A-Z][\w-]+-\d+(?:-\d+)*\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([A-Z][\w-]+-\d+(?:-\d+)*)\]$/);
    if (match) {
      const ruleId = match[1];
      return (
        <button
          key={i}
          onClick={() => onClickRule(ruleId)}
          className="inline px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[11px] font-mono hover:bg-blue-200 transition-colors"
        >
          {ruleId}
        </button>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// ── Component ──────────────────────────────────────────────

export default function RegulationChatPanel({
  selectedSpecialtyIds,
  selectedRegulationId,
  selectedRuleId,
  onSelectRule,
  plugins,
}: RegulationChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Build a rule-ID → (pluginId, regulationId) lookup for click navigation
  const ruleLookup = useMemo(() => {
    const map = new Map<string, { pluginId: string; regulationId: string }>();
    for (const plugin of plugins) {
      for (const rule of plugin.rules) {
        map.set(rule.id, { pluginId: plugin.id, regulationId: rule.regulationId });
      }
    }
    return map;
  }, [plugins]);

  const handleClickRule = useCallback(
    (ruleId: string) => {
      const info = ruleLookup.get(ruleId);
      if (info) {
        onSelectRule(info.pluginId, info.regulationId, ruleId);
      }
    },
    [ruleLookup, onSelectRule],
  );

  // Context label for header
  const contextLabel = useMemo(() => {
    if (selectedSpecialtyIds.size === 0) return "Todas";
    if (selectedSpecialtyIds.size === 1) {
      const id = [...selectedSpecialtyIds][0];
      return SPECIALTY_NAMES[id] ?? id;
    }
    return `${selectedSpecialtyIds.size} especialidades`;
  }, [selectedSpecialtyIds]);

  const suggestedQuestions = useMemo(
    () => getSuggestedQuestions(selectedSpecialtyIds, selectedRegulationId, plugins),
    [selectedSpecialtyIds, selectedRegulationId, plugins],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));

        // Map selection state to API params
        const specialty =
          selectedSpecialtyIds.size === 1
            ? [...selectedSpecialtyIds][0]
            : undefined;

        const res = await fetch("/api/rules/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: text.trim(),
            specialty,
            regulationId: selectedRegulationId || undefined,
            conversationHistory: history.slice(-8),
          }),
        });

        const data: RulesAskResponse = await res.json();

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: data.error || data.answer || "Sem resposta.",
          ruleReferences: data.ruleReferences,
          rulesInContext: data.rulesInContext,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Erro de ligação. Tente novamente.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, selectedSpecialtyIds, selectedRegulationId],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  // ── Collapsed: floating button ─────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-colors text-sm"
      >
        <MessageSquare className="w-4 h-4" />
        Perguntar sobre regras
      </button>
    );
  }

  // ── Expanded: chat panel ───────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-30 w-[420px] max-h-[65vh] bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-sm font-medium text-gray-900 truncate">
            Assistente de Regras
          </span>
          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] shrink-0">
            {contextLabel}
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-600 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-gray-400 text-xs mb-3">
              Faça perguntas sobre as regras regulamentares
            </p>
            <div className="flex flex-col gap-1.5">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left px-3 py-2 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-50 text-blue-900"
                  : "bg-gray-50 text-gray-800"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="whitespace-pre-wrap">
                  {renderAnswer(msg.content, handleClickRule)}
                  {msg.rulesInContext != null && (
                    <p className="text-[10px] text-gray-400 mt-2">
                      {msg.rulesInContext} regras analisadas
                    </p>
                  )}
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
              <span className="text-xs text-gray-400">A analisar regras...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre as regras..."
            rows={1}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

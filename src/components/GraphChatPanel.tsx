"use client";

import { useState, useRef, useCallback, useEffect, Fragment } from "react";
import {
  MessageSquare, Send, Loader2, X, ChevronDown,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface BrowsePath {
  buildingType: string | null;
  buildingCategory: string | null;
  phase: string | null;
  system: string | null;
  specialty: string | null;
  subTopic: string | null;
  regulationId: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ruleReferences?: string[];
  rulesInContext?: number;
  timestamp: Date;
}

interface GraphChatPanelProps {
  browsePath: BrowsePath;
  onSelectRule: (ruleLabel: string) => void;
}

interface RulesAskResponse {
  answer: string;
  ruleReferences: string[];
  regulationReferences: string[];
  rulesInContext: number;
  error?: string;
}

// ============================================================
// Constants
// ============================================================

const SPECIALTY_LABELS: Record<string, string> = {
  electrical: "Elétrica",
  "fire-safety": "Incêndio",
  thermal: "Térmica",
  acoustic: "Acústica",
  structural: "Estruturas",
  "water-drainage": "Águas",
  gas: "Gás",
  hvac: "AVAC",
  telecommunications: "Telecomunicações",
  accessibility: "Acessibilidade",
  energy: "Energia",
  elevators: "Elevadores",
  licensing: "Licenciamento",
  waste: "Resíduos",
  drawings: "Desenhos",
  architecture: "Arquitetura",
  general: "Geral",
  municipal: "Municipal",
};

function getSuggestedQuestions(path: BrowsePath): string[] {
  if (path.specialty === "structural") {
    return [
      "Quais regras estruturais são críticas?",
      "Que verificações sísmicas são obrigatórias?",
      "Quais os coeficientes do Anexo Nacional?",
    ];
  }
  if (path.specialty === "fire-safety") {
    return [
      "Quais regras de incêndio se aplicam?",
      "Que meios de evacuação são obrigatórios?",
      "Qual a resistência ao fogo exigida?",
    ];
  }
  if (path.specialty === "electrical") {
    return [
      "Quais regras elétricas são críticas?",
      "Que proteções são obrigatórias?",
      "Quais os requisitos de quadros elétricos?",
    ];
  }
  if (path.specialty === "thermal") {
    return [
      "Quais os U-values máximos exigidos?",
      "Que requisitos de eficiência existem?",
      "Quais regras térmicas são críticas?",
    ];
  }
  if (path.specialty) {
    return [
      `Quais regras de ${SPECIALTY_LABELS[path.specialty] || path.specialty} são críticas?`,
      "Explique as regras mais importantes.",
      "Que requisitos se aplicam a habitação?",
    ];
  }
  return [
    "Quais regras se aplicam a este contexto?",
    "Que regras críticas existem?",
    "Quais especialidades têm mais regras?",
  ];
}

// ============================================================
// Rule reference rendering
// ============================================================

/** Parse answer text and render [RULE_ID] as clickable buttons */
function renderAnswer(
  text: string,
  onSelectRule: (id: string) => void,
): React.ReactNode {
  const parts = text.split(/(\[[A-Z][\w-]+-\d+(?:-\d+)*\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([A-Z][\w-]+-\d+(?:-\d+)*)\]$/);
    if (match) {
      const ruleId = match[1];
      return (
        <button
          key={i}
          onClick={() => onSelectRule(ruleId)}
          className="inline px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded text-[11px] font-mono hover:bg-blue-600/40 transition-colors"
        >
          {ruleId}
        </button>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// ============================================================
// Component
// ============================================================

export default function GraphChatPanel({ browsePath, onSelectRule }: GraphChatPanelProps) {
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

  const browseLabel = browsePath.specialty
    ? SPECIALTY_LABELS[browsePath.specialty] || browsePath.specialty
    : "Todas";

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Build conversation history (exclude the current message)
      const history = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/rules/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          specialty: browsePath.specialty || undefined,
          buildingType: browsePath.buildingType && browsePath.buildingType !== "_all"
            ? browsePath.buildingType : undefined,
          regulationId: browsePath.regulationId || undefined,
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
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Erro de ligação. Tente novamente.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, browsePath]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  const suggestedQuestions = getSuggestedQuestions(browsePath);

  // ── Collapsed: floating button ─────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute bottom-4 right-4 z-10 flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-colors text-sm"
      >
        <MessageSquare className="w-4 h-4" />
        Perguntar sobre regras
      </button>
    );
  }

  // ── Expanded: chat panel ───────────────────────────────────
  return (
    <div className="absolute bottom-4 right-4 z-20 w-96 max-h-[60vh] bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-sm font-medium text-white truncate">Assistente de Regras</span>
          <span className="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-[10px] shrink-0">
            {browseLabel}
          </span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-300 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-gray-500 text-xs mb-3">Faça perguntas sobre as regras regulamentares</p>
            <div className="flex flex-col gap-1.5">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left px-3 py-2 text-xs text-gray-400 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
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
                  ? "bg-blue-600/20 text-blue-100"
                  : "bg-gray-800/80 text-gray-200"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="whitespace-pre-wrap">
                  {renderAnswer(msg.content, onSelectRule)}
                  {msg.rulesInContext != null && (
                    <p className="text-[10px] text-gray-600 mt-2">
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
            <div className="bg-gray-800/80 rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
              <span className="text-xs text-gray-400">A analisar regras...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-800 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre as regras..."
            rows={1}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

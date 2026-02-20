"use client";

import { useState, useRef } from "react";
import type { BuildingProject, AnalysisResult, RegulationArea } from "@/lib/types";
import type { AIAnalysisResponse } from "@/lib/ai-analysis";
import {
  MessageSquare,
  Send,
  Loader2,
  BookOpen,
  AlertCircle,
} from "lucide-react";

interface AiAssistantProps {
  project: BuildingProject;
  analysis?: AnalysisResult;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  regulationReferences?: string[];
  confidence?: "high" | "medium" | "low";
  timestamp: Date;
}

const REGULATION_AREAS: { value: RegulationArea | ""; label: string }[] = [
  { value: "", label: "Todas as áreas" },
  { value: "architecture", label: "Arquitetura / RGEU" },
  { value: "structural", label: "Estruturas / Eurocódigos" },
  { value: "fire_safety", label: "SCIE / Incêndio" },
  { value: "thermal", label: "Térmico / REH" },
  { value: "acoustic", label: "Acústica / RRAE" },
  { value: "electrical", label: "Elétrica / RTIEBT" },
  { value: "water_drainage", label: "Águas / RGSPPDADAR" },
  { value: "gas", label: "Gás / DL 521/99" },
  { value: "telecommunications", label: "ITED / ITUR" },
  { value: "accessibility", label: "Acessibilidade / DL 163" },
  { value: "energy", label: "Energia / SCE" },
  { value: "licensing", label: "Licenciamento / RJUE" },
];

const SUGGESTED_QUESTIONS = [
  "Quais são os requisitos do SCIE para este edifício?",
  "O projeto cumpre os requisitos de acessibilidade?",
  "Quais os valores máximos de U-value para esta zona climática?",
  "Que entidades devem ser consultadas no licenciamento?",
];

export default function AiAssistant({ project, analysis }: AiAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regulationArea, setRegulationArea] = useState<RegulationArea | "">("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function buildProjectContext(): string {
    const parts: string[] = [];
    parts.push(`Projeto: ${project.name}`);
    parts.push(`Tipo: ${project.buildingType}`);
    parts.push(`Localização: ${project.location.municipality}, ${project.location.district}`);
    parts.push(`Área bruta: ${project.grossFloorArea} m² | Útil: ${project.usableFloorArea} m²`);
    parts.push(`Pisos: ${project.numberOfFloors} | Altura: ${project.buildingHeight} m`);
    parts.push(`Reabilitação: ${project.isRehabilitation ? "Sim" : "Não"}`);
    parts.push(`Zona climática: ${project.location.climateZoneWinter}/${project.location.climateZoneSummer}`);

    if (analysis) {
      parts.push(`\nPontuação global: ${analysis.overallScore}/100`);
      parts.push(`Classe energética: ${analysis.energyClass}`);
      const criticals = analysis.findings.filter(f => f.severity === "critical");
      if (criticals.length > 0) {
        parts.push(`Não-conformidades críticas: ${criticals.length}`);
        criticals.slice(0, 5).forEach(f => {
          parts.push(`  - [${f.regulation}] ${f.description}`);
        });
      }
    }

    return parts.join("\n");
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage.content,
          projectContext: buildProjectContext(),
          regulationArea: regulationArea || undefined,
        }),
      });

      const data: AIAnalysisResponse = await response.json();

      if (data.error && !data.answer) {
        setError(data.error);
      } else {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.answer,
          regulationReferences: data.regulationReferences,
          confidence: data.confidence,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao contactar o serviço de IA.");
    } finally {
      setIsLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="space-y-4">
      {/* Regulation area filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Foco regulamentar:</label>
        <select
          value={regulationArea}
          onChange={e => setRegulationArea(e.target.value as RegulationArea | "")}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
        >
          {REGULATION_AREAS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="border border-gray-200 rounded-lg bg-gray-50 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-6 text-center">
            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">
              Faça perguntas sobre regulamentação portuguesa de construção.<br />
              O assistente tem contexto do seu projeto e análise.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setInput(q)}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full hover:border-accent hover:text-accent transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                  msg.role === "user"
                    ? "bg-accent text-white"
                    : "bg-white border border-gray-200 text-gray-800"
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.regulationReferences && msg.regulationReferences.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <BookOpen className="w-3 h-3" />
                        Referências regulamentares:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {msg.regulationReferences.map((ref, j) => (
                          <span key={j} className="text-xs px-2 py-0.5 bg-accent-light text-accent rounded">
                            {ref}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {msg.confidence && msg.role === "assistant" && (
                    <div className="mt-1 text-xs text-gray-400">
                      Confiança: {msg.confidence === "high" ? "Alta" : msg.confidence === "medium" ? "Média" : "Baixa"}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  A analisar...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte sobre regulamentação..."
          rows={2}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent resize-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

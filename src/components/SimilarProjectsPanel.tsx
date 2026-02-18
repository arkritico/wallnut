"use client";

/**
 * Similar Projects Panel — displays projects from history that are
 * similar to the current one, and suggests missing documents based
 * on what similar projects had.
 */

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { SimilarityResult, SimilarProject, DocumentSuggestion } from "@/lib/project-similarity";
import {
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
  Star,
  AlertCircle,
  Lightbulb,
  TrendingUp,
} from "lucide-react";

interface SimilarProjectsPanelProps {
  result: SimilarityResult;
}

export default function SimilarProjectsPanel({ result }: SimilarProjectsPanelProps) {
  const { lang } = useI18n();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  const txt = {
    title: lang === "pt" ? "Projetos Semelhantes" : "Similar Projects",
    subtitle: lang === "pt"
      ? `${result.projectsAnalyzed} projetos analisados`
      : `${result.projectsAnalyzed} projects analyzed`,
    similarity: lang === "pt" ? "Semelhança" : "Similarity",
    matchFactors: lang === "pt" ? "Fatores de correspondência" : "Match factors",
    differences: lang === "pt" ? "Diferenças" : "Differences",
    additionalDocs: lang === "pt" ? "Documentos adicionais" : "Additional documents",
    docSuggestions: lang === "pt" ? "Sugestões de Documentos" : "Document Suggestions",
    docSuggestionsSubtitle: lang === "pt"
      ? "Baseado no que projetos semelhantes incluíram"
      : "Based on what similar projects included",
    priority: lang === "pt" ? "Prioridade" : "Priority",
    high: lang === "pt" ? "Alta" : "High",
    medium: lang === "pt" ? "Média" : "Medium",
    low: lang === "pt" ? "Baixa" : "Low",
    prevalence: lang === "pt" ? "Prevalência" : "Prevalence",
    insights: lang === "pt" ? "Observações" : "Insights",
    noSimilar: lang === "pt"
      ? "Não foram encontrados projetos suficientemente semelhantes."
      : "No sufficiently similar projects found.",
    showMore: lang === "pt" ? "Ver mais" : "Show more",
    showLess: lang === "pt" ? "Ver menos" : "Show less",
  };

  const priorityColors: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-accent-medium text-accent",
  };
  const priorityLabels: Record<string, string> = {
    high: txt.high,
    medium: txt.medium,
    low: txt.low,
  };

  if (result.similarProjects.length === 0 && result.documentSuggestions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">{txt.noSimilar}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Document Suggestions (most actionable — show first) */}
      {result.documentSuggestions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <div>
              <h4 className="font-semibold text-gray-900">{txt.docSuggestions}</h4>
              <p className="text-xs text-gray-500">{txt.docSuggestionsSubtitle}</p>
            </div>
          </div>

          <div className="space-y-2">
            {(showAllSuggestions
              ? result.documentSuggestions
              : result.documentSuggestions.slice(0, 5)
            ).map((suggestion, idx) => (
              <DocumentSuggestionCard
                key={idx}
                suggestion={suggestion}
                priorityColors={priorityColors}
                priorityLabels={priorityLabels}
                lang={lang}
              />
            ))}
          </div>

          {result.documentSuggestions.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllSuggestions(!showAllSuggestions)}
              className="text-sm text-accent hover:text-accent-hover mt-2"
            >
              {showAllSuggestions ? txt.showLess : `${txt.showMore} (${result.documentSuggestions.length - 5})`}
            </button>
          )}
        </div>
      )}

      {/* Insights */}
      {result.insights.length > 0 && (
        <div className="p-3 bg-accent-light border border-accent rounded-lg">
          <p className="text-xs font-medium text-accent mb-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {txt.insights}
          </p>
          {result.insights.map((insight, i) => (
            <p key={i} className="text-xs text-accent">{insight}</p>
          ))}
        </div>
      )}

      {/* Similar projects list */}
      {result.similarProjects.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-accent" />
            <div>
              <h4 className="font-semibold text-gray-900">{txt.title}</h4>
              <p className="text-xs text-gray-500">{txt.subtitle}</p>
            </div>
          </div>

          <div className="space-y-2">
            {result.similarProjects.slice(0, 10).map((project) => (
              <SimilarProjectCard
                key={project.projectId}
                project={project}
                lang={lang}
                txt={txt}
                isExpanded={expandedProject === project.projectId}
                onToggle={() =>
                  setExpandedProject(
                    expandedProject === project.projectId ? null : project.projectId,
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentSuggestionCard({
  suggestion,
  priorityColors,
  priorityLabels,
}: {
  suggestion: DocumentSuggestion;
  priorityColors: Record<string, string>;
  priorityLabels: Record<string, string>;
  lang: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{suggestion.namePt}</p>
        <p className="text-xs text-gray-500">{suggestion.reason}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${priorityColors[suggestion.priority]}`}>
          {priorityLabels[suggestion.priority]}
        </span>
        <span className="text-xs text-gray-400">{suggestion.prevalencePercent}%</span>
      </div>
    </div>
  );
}

function SimilarProjectCard({
  project,
  txt,
  isExpanded,
  onToggle,
}: {
  project: SimilarProject;
  lang: string;
  txt: Record<string, string>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const similarityPercent = Math.round(project.similarity * 100);
  const similarityColor =
    similarityPercent >= 70
      ? "text-green-600 bg-green-50"
      : similarityPercent >= 50
        ? "text-amber-600 bg-amber-50"
        : "text-gray-500 bg-gray-50";

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{project.projectName}</p>
          {project.matchFactors.length > 0 && (
            <p className="text-xs text-gray-500 truncate">
              {project.matchFactors.slice(0, 2).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-bold px-2 py-1 rounded ${similarityColor}`}>
            {similarityPercent}%
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-3">
          {/* Match factors */}
          {project.matchFactors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                <Star className="w-3 h-3" />
                {txt.matchFactors}
              </p>
              <div className="flex flex-wrap gap-1">
                {project.matchFactors.map((factor, i) => (
                  <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                    {factor}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Differences */}
          {project.differences.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {txt.differences}
              </p>
              <div className="flex flex-wrap gap-1">
                {project.differences.map((diff, i) => (
                  <span key={i} className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded">
                    {diff}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Additional documents */}
          {project.additionalDocuments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {txt.additionalDocs}
              </p>
              <div className="flex flex-wrap gap-1">
                {project.additionalDocuments.map((doc, i) => (
                  <span key={i} className="text-xs bg-accent-light text-accent px-2 py-0.5 rounded">
                    {doc}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

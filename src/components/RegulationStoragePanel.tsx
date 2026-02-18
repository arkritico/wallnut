"use client";

/**
 * Regulation Storage Management Panel — UI for browsing, uploading,
 * searching, and managing municipality-specific regulation documents.
 */

import { useState, useRef, useMemo, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import type {
  RegulationIndex,
  StoredRegulation,
  RegulationSearchResult,
} from "@/lib/regulation-store";
import {
  createRegulationIndex,
  addRegulation,
  searchRegulations,
  getLatestRegulations,
  getMissingRegulations,
  processRegulationZip,
} from "@/lib/regulation-store";
import {
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  FolderOpen,
  X,
} from "lucide-react";

interface RegulationStoragePanelProps {
  municipality?: string;
  initialIndex?: RegulationIndex;
  onIndexChange?: (index: RegulationIndex) => void;
}

const DOC_TYPE_LABELS: Record<string, { pt: string; en: string }> = {
  pdm: { pt: "PDM", en: "PDM" },
  regulamento_municipal: { pt: "Regulamento Municipal", en: "Municipal Regulation" },
  parecer: { pt: "Parecer", en: "Opinion" },
  plano_pormenor: { pt: "Plano de Pormenor", en: "Detailed Plan" },
  regulamento_urbanistico: { pt: "Regulamento Urbanístico", en: "Urban Regulation" },
  other: { pt: "Outro", en: "Other" },
};

export default function RegulationStoragePanel({
  municipality,
  initialIndex,
  onIndexChange,
}: RegulationStoragePanelProps) {
  const { lang } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<RegulationIndex>(
    initialIndex ?? createRegulationIndex(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>(
    municipality ?? "",
  );
  const [expandedRegId, setExpandedRegId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showMuniDropdown, setShowMuniDropdown] = useState(false);

  const txt = {
    title: lang === "pt" ? "Regulamentos Municipais" : "Municipal Regulations",
    subtitle: lang === "pt"
      ? "Carregue e pesquise regulamentos por município"
      : "Upload and search regulations by municipality",
    searchPlaceholder: lang === "pt"
      ? "Pesquisar regulamentos..."
      : "Search regulations...",
    uploadZip: lang === "pt" ? "Carregar ZIP de Regulamentos" : "Upload Regulation ZIP",
    noRegulations: lang === "pt"
      ? "Nenhum regulamento armazenado."
      : "No regulations stored.",
    selectMunicipality: lang === "pt" ? "Selecionar Município" : "Select Municipality",
    allMunicipalities: lang === "pt" ? "Todos os Municípios" : "All Municipalities",
    missingDocs: lang === "pt" ? "Documentos em falta" : "Missing documents",
    latestVersion: lang === "pt" ? "Última versão" : "Latest version",
    version: lang === "pt" ? "Versão" : "Version",
    uploaded: lang === "pt" ? "Carregado" : "Uploaded",
    size: lang === "pt" ? "Tamanho" : "Size",
    delete: lang === "pt" ? "Apagar" : "Delete",
    view: lang === "pt" ? "Ver" : "View",
    totalDocs: lang === "pt" ? "documentos armazenados" : "documents stored",
    municipalities: lang === "pt" ? "municípios" : "municipalities",
    results: lang === "pt" ? "resultado(s)" : "result(s)",
    excerpt: lang === "pt" ? "Excerto" : "Excerpt",
    addRegulation: lang === "pt" ? "Adicionar Regulamento" : "Add Regulation",
    municipalityRequired: lang === "pt"
      ? "Selecione um município antes de carregar."
      : "Select a municipality before uploading.",
  };

  // Municipality filter
  const municipalities = useMemo(
    () => index.municipalities,
    [index.municipalities],
  );

  // Search results
  const searchResults = useMemo((): RegulationSearchResult[] => {
    if (!searchQuery.trim()) return [];
    return searchRegulations(index, searchQuery, selectedMunicipality || undefined);
  }, [index, searchQuery, selectedMunicipality]);

  // Regulations for the currently selected municipality
  const currentRegulations = useMemo((): StoredRegulation[] => {
    if (!selectedMunicipality) {
      // Show all latest
      const all: StoredRegulation[] = [];
      for (const regs of index.byMunicipality.values()) {
        all.push(...regs.filter((r) => r.isLatest));
      }
      return all.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    }
    return getLatestRegulations(index, selectedMunicipality);
  }, [index, selectedMunicipality]);

  // Missing regulations for the selected municipality
  const missingRegulations = useMemo(() => {
    if (!selectedMunicipality) return [];
    return getMissingRegulations(index, selectedMunicipality, []);
  }, [index, selectedMunicipality]);

  const updateIndex = useCallback(
    (newIndex: RegulationIndex) => {
      setIndex(newIndex);
      onIndexChange?.(newIndex);
    },
    [onIndexChange],
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!selectedMunicipality) {
        alert(txt.municipalityRequired);
        return;
      }

      setIsUploading(true);

      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file);

        // Build a simple file array from the ZIP
        const files: Array<{
          name: string;
          path: string;
          extension: string;
          size: number;
          data: ArrayBuffer;
          category: string;
        }> = [];

        for (const [path, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          const ext = path.split(".").pop()?.toLowerCase() ?? "";
          if (!["pdf", "doc", "docx", "txt"].includes(ext)) continue;
          const data = await entry.async("arraybuffer");
          files.push({
            name: path.split("/").pop() ?? path,
            path,
            extension: ext,
            size: data.byteLength,
            data,
            category: "regulamento_municipal",
          });
        }

        const regulations = processRegulationZip(
          { files },
          selectedMunicipality,
        );

        const newIndex = { ...index, byMunicipality: new Map(index.byMunicipality) };
        for (const reg of regulations) {
          addRegulation(newIndex, reg);
        }
        updateIndex(newIndex);
      } catch (err) {
        console.error("Regulation upload error:", err);
      } finally {
        setIsUploading(false);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [index, selectedMunicipality, updateIndex, txt.municipalityRequired],
  );

  const handleDelete = useCallback(
    (regulationId: string) => {
      const newIndex: RegulationIndex = {
        ...index,
        byMunicipality: new Map(index.byMunicipality),
        totalCount: index.totalCount,
        municipalities: [...index.municipalities],
        lastUpdated: new Date().toISOString(),
      };

      for (const [muni, regs] of newIndex.byMunicipality.entries()) {
        const filtered = regs.filter((r) => r.id !== regulationId);
        if (filtered.length !== regs.length) {
          newIndex.byMunicipality.set(muni, filtered);
          newIndex.totalCount = Math.max(0, newIndex.totalCount - 1);
          break;
        }
      }

      updateIndex(newIndex);
    },
    [index, updateIndex],
  );

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-semibold text-gray-900">{txt.title}</h3>
          </div>
          <div className="text-xs text-gray-500">
            {index.totalCount} {txt.totalDocs} · {index.municipalities.length} {txt.municipalities}
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-1">{txt.subtitle}</p>
      </div>

      {/* Municipality selector + search */}
      <div className="flex gap-3">
        {/* Municipality dropdown */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowMuniDropdown(!showMuniDropdown)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
          >
            <Building2 className="w-4 h-4 text-gray-400" />
            <span className="truncate max-w-[140px]">
              {selectedMunicipality || txt.allMunicipalities}
            </span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {showMuniDropdown && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  setSelectedMunicipality("");
                  setShowMuniDropdown(false);
                }}
              >
                {txt.allMunicipalities}
              </button>
              {municipalities.map((muni) => (
                <button
                  key={muni}
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    selectedMunicipality === muni ? "bg-accent-light text-accent" : ""
                  }`}
                  onClick={() => {
                    setSelectedMunicipality(muni);
                    setShowMuniDropdown(false);
                  }}
                >
                  {muni}
                </button>
              ))}
              {/* Always allow typing a new municipality */}
              <div className="border-t border-gray-100 p-2">
                <input
                  type="text"
                  placeholder={txt.selectMunicipality}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.currentTarget.value.trim()) {
                      setSelectedMunicipality(e.currentTarget.value.trim());
                      setShowMuniDropdown(false);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={txt.searchPlaceholder}
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Upload button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {isUploading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {lang === "pt" ? "A carregar..." : "Uploading..."}
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              {txt.uploadZip}
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleUpload}
          className="hidden"
        />

        {!selectedMunicipality && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {txt.municipalityRequired}
          </p>
        )}
      </div>

      {/* Missing regulations warning */}
      {missingRegulations.length > 0 && selectedMunicipality && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs font-medium text-yellow-700 flex items-center gap-1 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {txt.missingDocs}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingRegulations.map((m, i) => (
              <span key={i} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                {m.namePt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search results */}
      {isSearching && (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            {searchResults.length} {txt.results}
          </p>
          <div className="space-y-2">
            {searchResults.map((sr) => (
              <RegulationCard
                key={sr.regulation.id}
                regulation={sr.regulation}
                lang={lang}
                score={sr.score}
                excerpt={sr.excerpt}
                isExpanded={expandedRegId === sr.regulation.id}
                onToggle={() =>
                  setExpandedRegId(expandedRegId === sr.regulation.id ? null : sr.regulation.id)
                }
                onDelete={handleDelete}
                txt={txt}
              />
            ))}
          </div>
        </div>
      )}

      {/* Regulation list (when not searching) */}
      {!isSearching && (
        <div className="space-y-2">
          {currentRegulations.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <FolderOpen className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">{txt.noRegulations}</p>
            </div>
          )}
          {currentRegulations.map((reg) => (
            <RegulationCard
              key={reg.id}
              regulation={reg}
              lang={lang}
              isExpanded={expandedRegId === reg.id}
              onToggle={() => setExpandedRegId(expandedRegId === reg.id ? null : reg.id)}
              onDelete={handleDelete}
              txt={txt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RegulationCard({
  regulation,
  lang,
  score,
  excerpt,
  isExpanded,
  onToggle,
  onDelete,
  txt,
}: {
  regulation: StoredRegulation;
  lang: string;
  score?: number;
  excerpt?: string;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  txt: Record<string, string>;
}) {
  const docTypeLabel =
    DOC_TYPE_LABELS[regulation.documentType]?.[lang === "pt" ? "pt" : "en"] ??
    regulation.documentType;

  const sizeFormatted =
    regulation.fileSize > 1024 * 1024
      ? `${(regulation.fileSize / (1024 * 1024)).toFixed(1)} MB`
      : `${(regulation.fileSize / 1024).toFixed(0)} KB`;

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{regulation.name}</p>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs">
                {docTypeLabel}
              </span>
              <span>{regulation.municipality}</span>
              {score !== undefined && (
                <span className="text-accent">{Math.round(score * 100)}%</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {regulation.isLatest && (
            <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
              {txt.latestVersion}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-2">
          <p className="text-xs text-gray-600">{regulation.description}</p>

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {txt.uploaded}: {new Date(regulation.uploadedAt).toLocaleDateString(lang === "pt" ? "pt-PT" : "en-GB")}
            </div>
            <div>{txt.size}: {sizeFormatted}</div>
            <div>{txt.version}: v{regulation.version}</div>
            <div>{regulation.fileName}</div>
          </div>

          {/* Search excerpt */}
          {excerpt && (
            <div className="p-2 bg-yellow-50 rounded text-xs text-gray-700">
              <p className="font-medium text-yellow-700 mb-0.5">{txt.excerpt}:</p>
              <p className="italic">&ldquo;{excerpt}&rdquo;</p>
            </div>
          )}

          {/* Tags */}
          {regulation.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {regulation.tags.map((tag, i) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onDelete(regulation.id)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              {txt.delete}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

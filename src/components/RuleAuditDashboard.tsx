"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  Download,
  Upload,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Filter,
  X,
  Eye,
  EyeOff,
  Wrench,
  MessageSquare,
  CheckSquare,
  Square,
  Minus,
  BarChart3,
  Shield,
} from "lucide-react";
import RuleVerificationPanel from "./RuleVerificationPanel";
import type { RuleToVerify } from "@/lib/rule-verification";
import {
  getAnnotations,
  setAnnotation as saveAnnotation,
  removeAnnotation,
  importAnnotations,
  type RuleAnnotation,
  type AnnotationStatus,
} from "@/lib/rule-annotations";

// ============================================================
// Types
// ============================================================

interface AuditRule {
  id: string;
  specialtyId: string;
  specialtyName: string;
  regulationId: string;
  regulationRef: string;
  article: string;
  description: string;
  severity: "critical" | "warning" | "info" | "pass";
  conditionCount: number;
  conditions: string[];
  exclusions: string[];
  remediation: string;
  tags: string[];
  enabled: boolean;
  applicableTypes: string[];
  projectScope: "new" | "rehab" | "all";
}

interface AuditRegulation {
  id: string;
  shortRef: string;
  title: string;
  status: string;
  sourceType: string;
  sourceUrl: string | null;
  legalForce: string;
  ingestionStatus: string;
  rulesCount: number;
  specialties: string[];
}

interface AuditData {
  rules: AuditRule[];
  regulations: AuditRegulation[];
  validation: {
    totalErrors: number;
    byPlugin: Record<string, { errors: string[]; warnings: string[] }>;
  };
  coverage: {
    bySpecialty: Record<string, { score: number; total: number; covered: number }>;
    overall: number;
  };
  stats: {
    totalRules: number;
    totalRegulations: number;
    bySpecialty: Record<string, number>;
    bySeverity: Record<string, number>;
    enabledRules: number;
    disabledRules: number;
  };
}

type Tab = "rules" | "regulations" | "validation" | "coverage" | "progress";
type SortDir = "asc" | "desc";

// ============================================================
// Constants
// ============================================================

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Crítico" },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", label: "Aviso" },
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", label: "Info" },
  pass: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", label: "OK" },
} as const;

const ANNOTATION_CONFIG: Record<AnnotationStatus, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string; label: string }> = {
  reviewed: { icon: Eye, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: "Revista" },
  irrelevant: { icon: EyeOff, color: "text-gray-500", bg: "bg-gray-100", border: "border-gray-300", label: "Irrelevante" },
  "needs-fix": { icon: Wrench, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", label: "Corrigir" },
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  amended: "bg-yellow-100 text-yellow-800",
  superseded: "bg-gray-100 text-gray-600",
  revoked: "bg-red-100 text-red-800",
  draft: "bg-blue-100 text-blue-800",
};

const INGESTION_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  partial: "bg-yellow-100 text-yellow-800",
  complete: "bg-green-100 text-green-800",
  verified: "bg-emerald-100 text-emerald-800",
};

const PAGE_SIZE = 50;

// ============================================================
// Component
// ============================================================

export default function RuleAuditDashboard() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("rules");

  // Annotations
  const [annotations, setAnnotations] = useState<Record<string, RuleAnnotation>>(() => getAnnotations());

  // Filters
  const [search, setSearch] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<string[]>([]);
  const [filterRegulation, setFilterRegulation] = useState("");
  const [filterScope, setFilterScope] = useState("");
  const [filterEnabled, setFilterEnabled] = useState<"" | "enabled" | "disabled">("");
  const [filterAnnotation, setFilterAnnotation] = useState<"" | AnnotationStatus | "none">("");
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sortCol, setSortCol] = useState<string>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Pagination
  const [page, setPage] = useState(0);

  // Expanded rows
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [expandedRegs, setExpandedRegs] = useState<Set<string>>(new Set());
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());

  // Bulk selection
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const lastCheckedRef = useRef<string | null>(null);

  // Import ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Verification panel
  const [showVerification, setShowVerification] = useState(false);

  // Fetch data
  useEffect(() => {
    fetch("/api/rule-audit")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Annotation handlers
  const handleSetAnnotation = useCallback((ruleId: string, status: AnnotationStatus, note?: string) => {
    const ann: RuleAnnotation = { status, note, updatedAt: new Date().toISOString() };
    saveAnnotation(ruleId, ann);
    setAnnotations((prev) => ({ ...prev, [ruleId]: ann }));
  }, []);

  const handleRemoveAnnotation = useCallback((ruleId: string) => {
    removeAnnotation(ruleId);
    setAnnotations((prev) => {
      const next = { ...prev };
      delete next[ruleId];
      return next;
    });
  }, []);

  // Batch annotation handler
  const handleBatchAnnotate = useCallback((status: AnnotationStatus) => {
    const now = new Date().toISOString();
    const updated: Record<string, RuleAnnotation> = {};
    for (const ruleId of selectedRules) {
      const ann: RuleAnnotation = { status, updatedAt: now };
      saveAnnotation(ruleId, ann);
      updated[ruleId] = ann;
    }
    setAnnotations((prev) => ({ ...prev, ...updated }));
    setSelectedRules(new Set());
  }, [selectedRules]);

  // Import handler
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        // Support both direct annotations object and full audit export format
        const anns: Record<string, RuleAnnotation> = json.annotations ?? json;
        const count = importAnnotations(anns);
        setAnnotations(getAnnotations());
        setImportMessage(`${count} anotações importadas`);
        setTimeout(() => setImportMessage(null), 3000);
      } catch {
        setImportMessage("Erro: ficheiro JSON inválido");
        setTimeout(() => setImportMessage(null), 3000);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = "";
  }, []);

  // Annotation stats
  const annotationStats = useMemo(() => {
    const stats = { reviewed: 0, irrelevant: 0, "needs-fix": 0 };
    for (const ann of Object.values(annotations)) {
      stats[ann.status] = (stats[ann.status] ?? 0) + 1;
    }
    return stats;
  }, [annotations]);

  // Derive specialty list
  const specialties = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, string>();
    for (const r of data.rules) map.set(r.specialtyId, r.specialtyName);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  // Derive regulation list for filter dropdown
  const regulationOptions = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return data.rules
      .filter((r) => {
        if (seen.has(r.regulationId)) return false;
        seen.add(r.regulationId);
        return true;
      })
      .map((r) => ({ id: r.regulationId, ref: r.regulationRef }))
      .sort((a, b) => a.ref.localeCompare(b.ref));
  }, [data]);

  // Per-specialty audit progress
  const specialtyProgress = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; total: number; reviewed: number; irrelevant: number; needsFix: number }>();
    for (const r of data.rules) {
      if (!map.has(r.specialtyId)) {
        map.set(r.specialtyId, { name: r.specialtyName, total: 0, reviewed: 0, irrelevant: 0, needsFix: 0 });
      }
      const entry = map.get(r.specialtyId)!;
      entry.total++;
      const ann = annotations[r.id];
      if (ann?.status === "reviewed") entry.reviewed++;
      else if (ann?.status === "irrelevant") entry.irrelevant++;
      else if (ann?.status === "needs-fix") entry.needsFix++;
    }
    return Array.from(map.entries())
      .map(([id, s]) => ({ id, ...s, annotated: s.reviewed + s.irrelevant + s.needsFix }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, annotations]);

  // Filter + sort rules
  const filteredRules = useMemo(() => {
    if (!data) return [];
    let rules = data.rules;

    if (filterSpecialty) rules = rules.filter((r) => r.specialtyId === filterSpecialty);
    if (filterSeverity.length > 0) rules = rules.filter((r) => filterSeverity.includes(r.severity));
    if (filterRegulation) rules = rules.filter((r) => r.regulationId === filterRegulation);
    if (filterScope) rules = rules.filter((r) => r.projectScope === filterScope);
    if (filterEnabled === "enabled") rules = rules.filter((r) => r.enabled);
    if (filterEnabled === "disabled") rules = rules.filter((r) => !r.enabled);
    if (filterAnnotation === "none") {
      rules = rules.filter((r) => !annotations[r.id]);
    } else if (filterAnnotation) {
      rules = rules.filter((r) => annotations[r.id]?.status === filterAnnotation);
    }
    if (search) {
      const q = search.toLowerCase();
      rules = rules.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          r.regulationRef.toLowerCase().includes(q),
      );
    }

    // Sort
    rules = [...rules].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortCol) {
        case "id": va = a.id; vb = b.id; break;
        case "specialty": va = a.specialtyName; vb = b.specialtyName; break;
        case "regulation": va = a.regulationRef; vb = b.regulationRef; break;
        case "severity": {
          const order = { critical: 0, warning: 1, info: 2, pass: 3 };
          va = order[a.severity]; vb = order[b.severity]; break;
        }
        case "audit": {
          const order: Record<string, number> = { "needs-fix": 0, reviewed: 1, irrelevant: 2 };
          va = annotations[a.id] ? order[annotations[a.id].status] ?? 3 : 4;
          vb = annotations[b.id] ? order[annotations[b.id].status] ?? 3 : 4;
          break;
        }
        default: va = a.id; vb = b.id;
      }
      const cmp = typeof va === "number" ? va - (vb as number) : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rules;
  }, [data, annotations, filterSpecialty, filterSeverity, filterRegulation, filterScope, filterEnabled, filterAnnotation, search, sortCol, sortDir]);

  // Paged rules
  const pagedRules = useMemo(() => filteredRules.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredRules, page]);
  const totalPages = Math.ceil(filteredRules.length / PAGE_SIZE);

  // Reset page when filters change
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional derived-state reset
  useEffect(() => { setPage(0); }, [filterSpecialty, filterSeverity, filterRegulation, filterScope, filterEnabled, filterAnnotation, search]);

  // Clear selection when page or filters change
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional derived-state reset
  useEffect(() => { setSelectedRules(new Set()); }, [page, filterSpecialty, filterSeverity, filterRegulation, filterScope, filterEnabled, filterAnnotation, search]);

  // Sort handler
  const handleSort = useCallback((col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }, [sortCol]);

  // Toggle expand
  const toggleRule = useCallback((id: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleReg = useCallback((id: string) => {
    setExpandedRegs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const togglePlugin = useCallback((id: string) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Bulk selection handlers
  const handleCheckbox = useCallback((ruleId: string, shiftKey: boolean) => {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastCheckedRef.current) {
        // Shift+click: select range
        const ids = pagedRules.map((r) => r.id);
        const start = ids.indexOf(lastCheckedRef.current);
        const end = ids.indexOf(ruleId);
        if (start !== -1 && end !== -1) {
          const [lo, hi] = start < end ? [start, end] : [end, start];
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
        }
      } else {
        if (next.has(ruleId)) next.delete(ruleId);
        else next.add(ruleId);
      }
      lastCheckedRef.current = ruleId;
      return next;
    });
  }, [pagedRules]);

  const handleSelectAll = useCallback(() => {
    setSelectedRules((prev) => {
      const pageIds = pagedRules.map((r) => r.id);
      const allSelected = pageIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(pageIds);
    });
  }, [pagedRules]);

  // Keyboard shortcuts
  useEffect(() => {
    if (tab !== "rules") return;
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Only when exactly one rule is expanded
      if (expandedRules.size !== 1) return;
      const ruleId = [...expandedRules][0];

      switch (e.key) {
        case "r": handleSetAnnotation(ruleId, "reviewed"); break;
        case "i": handleSetAnnotation(ruleId, "irrelevant"); break;
        case "f": handleSetAnnotation(ruleId, "needs-fix"); break;
        case "j":
        case "k": {
          // Navigate to next/previous rule
          const ids = pagedRules.map((r) => r.id);
          const idx = ids.indexOf(ruleId);
          if (idx === -1) return;
          const nextIdx = e.key === "j" ? Math.min(idx + 1, ids.length - 1) : Math.max(idx - 1, 0);
          if (nextIdx !== idx) {
            setExpandedRules(new Set([ids[nextIdx]]));
          }
          break;
        }
        default: return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [tab, expandedRules, pagedRules, handleSetAnnotation]);

  // CSV export (with annotation columns)
  const exportCSV = useCallback(() => {
    if (!filteredRules.length) return;
    const headers = ["ID", "Specialty", "Regulation", "Article", "Severity", "Description", "Conditions", "Remediation", "Tags", "Enabled", "Scope", "Audit Status", "Audit Note"];
    const rows = filteredRules.map((r) => {
      const ann = annotations[r.id];
      return [
        r.id, r.specialtyName, r.regulationRef, r.article, r.severity,
        `"${r.description.replace(/"/g, '""')}"`,
        r.conditionCount,
        `"${r.remediation.replace(/"/g, '""')}"`,
        `"${r.tags.join(", ")}"`,
        r.enabled ? "Yes" : "No",
        r.projectScope,
        ann?.status ?? "",
        ann?.note ? `"${ann.note.replace(/"/g, '""')}"` : "",
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallnut-rules-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRules, annotations]);

  // JSON export (with annotations)
  const exportJSON = useCallback(() => {
    if (!data) return;
    const exported = { ...data, annotations };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallnut-rules-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, annotations]);

  // Convert selected AuditRules to RuleToVerify for verification panel
  const selectedRulesForVerification = useMemo((): RuleToVerify[] => {
    if (!data || selectedRules.size === 0) return [];
    return data.rules
      .filter(r => selectedRules.has(r.id))
      .slice(0, 5) // API max 5 per batch
      .map(r => ({
        id: r.id,
        article: r.article,
        regulationRef: r.regulationRef,
        description: r.description,
        severity: r.severity,
        conditions: r.conditions,
        remediation: r.remediation,
        specialtyId: r.specialtyId,
        sourceUrl: null,
      }));
  }, [data, selectedRules]);

  // Active filter count
  const activeFilterCount = [filterSpecialty, filterRegulation, filterScope, filterEnabled, filterAnnotation].filter(Boolean).length + filterSeverity.length;

  const clearFilters = useCallback(() => {
    setFilterSpecialty("");
    setFilterSeverity([]);
    setFilterRegulation("");
    setFilterScope("");
    setFilterEnabled("");
    setFilterAnnotation("");
    setSearch("");
  }, []);

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-accent rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-24 text-red-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        <p>Erro ao carregar dados: {error}</p>
      </div>
    );
  }

  const totalAnnotated = Object.keys(annotations).length;
  const pageCheckState = pagedRules.length > 0 && pagedRules.every((r) => selectedRules.has(r.id))
    ? "all" : pagedRules.some((r) => selectedRules.has(r.id)) ? "some" : "none";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auditoria de Regras</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.stats.totalRules} regras &middot; {data.stats.totalRegulations} regulamentos &middot; Cobertura: {data.coverage.overall}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Upload className="w-3.5 h-3.5" /> Importar
          </button>
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={exportJSON} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
        </div>
      </div>

      {/* Import feedback */}
      {importMessage && (
        <div className={`text-sm px-4 py-2 rounded-lg ${importMessage.startsWith("Erro") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {importMessage}
        </div>
      )}

      {/* Severity + annotation summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {(["critical", "warning", "info", "pass"] as const).map((sev) => {
          const cfg = SEVERITY_CONFIG[sev];
          const Icon = cfg.icon;
          const count = data.stats.bySeverity[sev] ?? 0;
          return (
            <button
              key={sev}
              onClick={() => {
                setFilterSeverity((prev) =>
                  prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev],
                );
                setTab("rules");
              }}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                filterSeverity.includes(sev) ? `${cfg.bg} ${cfg.border}` : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <Icon className={`w-5 h-5 ${cfg.color}`} />
              <div className="text-left">
                <div className="text-lg font-bold text-gray-900">{count}</div>
                <div className="text-xs text-gray-500">{cfg.label}</div>
              </div>
            </button>
          );
        })}
        {(["reviewed", "irrelevant", "needs-fix"] as const).map((status) => {
          const cfg = ANNOTATION_CONFIG[status];
          const Icon = cfg.icon;
          const count = annotationStats[status];
          return (
            <button
              key={status}
              onClick={() => {
                setFilterAnnotation((prev) => prev === status ? "" : status);
                setTab("rules");
              }}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                filterAnnotation === status ? `${cfg.bg} ${cfg.border}` : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <Icon className={`w-5 h-5 ${cfg.color}`} />
              <div className="text-left">
                <div className="text-lg font-bold text-gray-900">{count}</div>
                <div className="text-xs text-gray-500">{cfg.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Audit progress bar */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-500">Progresso da auditoria:</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${data.stats.totalRules > 0 ? Math.round((totalAnnotated / data.stats.totalRules) * 100) : 0}%` }} />
        </div>
        <span className="text-gray-700 font-medium">{totalAnnotated}/{data.stats.totalRules}</span>
        <span className="text-gray-400">({data.stats.totalRules > 0 ? Math.round((totalAnnotated / data.stats.totalRules) * 100) : 0}%)</span>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([
            { key: "rules" as Tab, label: "Regras", count: data.stats.totalRules },
            { key: "progress" as Tab, label: "Progresso" },
            { key: "regulations" as Tab, label: "Regulamentos", count: data.stats.totalRegulations },
            { key: "validation" as Tab, label: "Validação", count: data.validation.totalErrors },
            { key: "coverage" as Tab, label: "Cobertura" },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? "border-accent text-accent" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
              {count !== undefined && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  key === "validation" && count > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Rules */}
      {tab === "rules" && (
        <div>
          {/* Batch action bar */}
          {selectedRules.size > 0 && (
            <div className="mb-4 flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
              <span className="text-sm font-medium text-gray-700">{selectedRules.size} selecionada(s)</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-gray-500 mr-1">Marcar como:</span>
                {(["reviewed", "irrelevant", "needs-fix"] as const).map((status) => {
                  const cfg = ANNOTATION_CONFIG[status];
                  const AnnIcon = cfg.icon;
                  return (
                    <button
                      key={status}
                      onClick={() => handleBatchAnnotate(status)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors bg-white border-gray-200 text-gray-600 hover:${cfg.bg} hover:${cfg.border}`}
                    >
                      <AnnIcon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </button>
                  );
                })}
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <button
                  onClick={() => setShowVerification(true)}
                  disabled={selectedRules.size > 5}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={selectedRules.size > 5 ? "Máximo 5 regras por verificação" : "Verificar regras com AI + Web Search"}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Verificar
                  {selectedRules.size > 5 && <span className="text-[10px]">(max 5)</span>}
                </button>
                <button onClick={() => setSelectedRules(new Set())} className="ml-2 text-xs text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Search + filter bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar regras (ID, descrição, tags, regulamento)..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
                activeFilterCount > 0 ? "border-accent text-accent bg-accent/5" : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="ml-1 w-5 h-5 flex items-center justify-center text-xs bg-accent text-white rounded-full">{activeFilterCount}</span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Especialidade</label>
                <select value={filterSpecialty} onChange={(e) => setFilterSpecialty(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                  <option value="">Todas</option>
                  {specialties.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Regulamento</label>
                <select value={filterRegulation} onChange={(e) => setFilterRegulation(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                  <option value="">Todos</option>
                  {regulationOptions.map((r) => <option key={r.id} value={r.id}>{r.ref}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Âmbito</label>
                <select value={filterScope} onChange={(e) => setFilterScope(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                  <option value="">Todos</option>
                  <option value="new">Construção nova</option>
                  <option value="rehab">Reabilitação</option>
                  <option value="all">Universal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                <select value={filterEnabled} onChange={(e) => setFilterEnabled(e.target.value as "" | "enabled" | "disabled")} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                  <option value="">Todos</option>
                  <option value="enabled">Ativa</option>
                  <option value="disabled">Desativada</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Auditoria</label>
                <select value={filterAnnotation} onChange={(e) => setFilterAnnotation(e.target.value as "" | AnnotationStatus | "none")} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                  <option value="">Todas</option>
                  <option value="reviewed">Revista</option>
                  <option value="irrelevant">Irrelevante</option>
                  <option value="needs-fix">Corrigir</option>
                  <option value="none">Sem anotação</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Severidade</label>
                <div className="flex flex-wrap gap-1">
                  {(["critical", "warning", "info", "pass"] as const).map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setFilterSeverity((prev) => prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev])}
                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                        filterSeverity.includes(sev)
                          ? `${SEVERITY_CONFIG[sev].bg} ${SEVERITY_CONFIG[sev].border} ${SEVERITY_CONFIG[sev].color}`
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {SEVERITY_CONFIG[sev].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Results count + keyboard hint */}
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>
              {filteredRules.length} regra(s) encontrada(s)
              {totalPages > 1 && ` — Página ${page + 1} de ${totalPages}`}
            </span>
            {expandedRules.size === 1 && (
              <span className="text-gray-400">
                <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">r</kbd> revista
                <kbd className="ml-2 px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">i</kbd> irrelevante
                <kbd className="ml-2 px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">f</kbd> corrigir
                <kbd className="ml-2 px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">j</kbd>/<kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">k</kbd> navegar
              </span>
            )}
          </div>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <button onClick={handleSelectAll} className="text-gray-400 hover:text-gray-600">
                      {pageCheckState === "all" ? <CheckSquare className="w-4 h-4" /> : pageCheckState === "some" ? <Minus className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="w-8 px-1 py-2" />
                  {[
                    { key: "id", label: "ID" },
                    { key: "specialty", label: "Especialidade" },
                    { key: "regulation", label: "Regulamento" },
                    { key: "severity", label: "Severidade" },
                    { key: "audit", label: "Auditoria" },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-3 py-2 text-left font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    >
                      {label}
                      {sortCol === key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedRules.map((rule) => {
                  const isExpanded = expandedRules.has(rule.id);
                  const ann = annotations[rule.id];
                  const isSelected = selectedRules.has(rule.id);
                  return (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      annotation={ann}
                      isExpanded={isExpanded}
                      isSelected={isSelected}
                      onToggle={toggleRule}
                      onCheck={handleCheckbox}
                      onSetAnnotation={handleSetAnnotation}
                      onRemoveAnnotation={handleRemoveAnnotation}
                    />
                  );
                })}
                {pagedRules.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nenhuma regra encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
                Anterior
              </button>
              <span className="text-sm text-gray-600">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
                Seguinte
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Progress */}
      {tab === "progress" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <BarChart3 className="w-6 h-6 text-gray-400" />
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {totalAnnotated}/{data.stats.totalRules}
              </div>
              <div className="text-sm text-gray-500">
                regras anotadas ({data.stats.totalRules > 0 ? Math.round((totalAnnotated / data.stats.totalRules) * 100) : 0}%)
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {specialtyProgress.map((sp) => {
              const pct = sp.total > 0 ? Math.round((sp.annotated / sp.total) * 100) : 0;
              const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-gray-300";
              return (
                <button
                  key={sp.id}
                  onClick={() => { setFilterSpecialty(sp.id); setTab("rules"); }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-48 text-sm font-medium text-gray-700 truncate" title={sp.name}>{sp.name}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-20 text-right text-sm font-medium text-gray-700">{sp.annotated}/{sp.total}</div>
                  <div className="w-40 flex items-center gap-1.5 text-xs">
                    {sp.reviewed > 0 && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded">{sp.reviewed} rev</span>}
                    {sp.irrelevant > 0 && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{sp.irrelevant} irr</span>}
                    {sp.needsFix > 0 && <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded">{sp.needsFix} fix</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Regulations */}
      {tab === "regulations" && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 text-left font-medium text-gray-600">Referência</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Título</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Estado</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Tipo Fonte</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Força Legal</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Regras</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Ingestão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.regulations.map((reg) => {
                const isExpanded = expandedRegs.has(reg.id);
                return (
                  <RegulationRow
                    key={reg.id}
                    reg={reg}
                    isExpanded={isExpanded}
                    onToggle={toggleReg}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Validation */}
      {tab === "validation" && (
        <div className="space-y-3">
          {Object.entries(data.validation.byPlugin).map(([pluginId, { errors, warnings }]) => {
            const isExpanded = expandedPlugins.has(pluginId);
            const hasErrors = errors.length > 0;
            const hasWarnings = warnings.length > 0;
            const statusColor = hasErrors ? "text-red-600" : hasWarnings ? "text-amber-600" : "text-green-600";
            const statusBg = hasErrors ? "bg-red-50" : hasWarnings ? "bg-amber-50" : "bg-green-50";
            return (
              <div key={pluginId} className={`border rounded-lg overflow-hidden ${hasErrors ? "border-red-200" : hasWarnings ? "border-amber-200" : "border-green-200"}`}>
                <button
                  onClick={() => togglePlugin(pluginId)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left ${statusBg}`}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                    <span className="font-medium text-gray-900">{pluginId}</span>
                    <span className={`text-xs font-bold ${statusColor}`}>
                      {hasErrors ? `${errors.length} erro(s)` : hasWarnings ? `${warnings.length} aviso(s)` : "OK"}
                    </span>
                  </div>
                </button>
                {isExpanded && (errors.length > 0 || warnings.length > 0) && (
                  <div className="px-4 py-3 bg-white space-y-1.5">
                    {errors.map((e, i) => (
                      <div key={`e-${i}`} className="flex items-start gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-red-700">{e}</span>
                      </div>
                    ))}
                    {warnings.map((w, i) => (
                      <div key={`w-${i}`} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <span className="text-amber-700">{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Coverage */}
      {tab === "coverage" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-gray-900">{data.coverage.overall}%</div>
            <div className="text-sm text-gray-500">Cobertura global</div>
          </div>
          <div className="space-y-2">
            {Object.entries(data.coverage.bySpecialty)
              .sort(([, a], [, b]) => b.score - a.score)
              .map(([pluginId, cov]) => {
                const name = specialties.find(([id]) => id === pluginId)?.[1] ?? pluginId;
                const barColor = cov.score >= 70 ? "bg-green-500" : cov.score >= 30 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={pluginId} className="flex items-center gap-3">
                    <div className="w-48 text-sm text-gray-700 truncate" title={name}>{name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${cov.score}%` }} />
                    </div>
                    <div className="w-16 text-right text-sm font-medium text-gray-700">{cov.score}%</div>
                    <div className="w-24 text-right text-xs text-gray-400">{cov.covered} regras</div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Verification Panel Overlay */}
      {showVerification && selectedRulesForVerification.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <RuleVerificationPanel
              rules={selectedRulesForVerification}
              onVerified={(results) => {
                // Auto-annotate verified rules
                for (const r of results) {
                  if (r.status === "verified" && r.confidence >= 0.8) {
                    const ann: RuleAnnotation = {
                      status: "reviewed",
                      note: `Verificada por AI (${Math.round(r.confidence * 100)}% confiança)`,
                      updatedAt: new Date().toISOString(),
                    };
                    saveAnnotation(r.ruleId, ann);
                    setAnnotations((prev) => ({ ...prev, [r.ruleId]: ann }));
                  } else if (r.status === "misinterpretation" || r.status === "discrepancy") {
                    const ann: RuleAnnotation = {
                      status: "needs-fix",
                      note: `AI: ${r.explanation.slice(0, 200)}`,
                      updatedAt: new Date().toISOString(),
                    };
                    saveAnnotation(r.ruleId, ann);
                    setAnnotations((prev) => ({ ...prev, [r.ruleId]: ann }));
                  }
                }
              }}
              onClose={() => setShowVerification(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function RuleRow({
  rule,
  annotation,
  isExpanded,
  isSelected,
  onToggle,
  onCheck,
  onSetAnnotation,
  onRemoveAnnotation,
}: {
  rule: AuditRule;
  annotation?: RuleAnnotation;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onCheck: (id: string, shiftKey: boolean) => void;
  onSetAnnotation: (ruleId: string, status: AnnotationStatus, note?: string) => void;
  onRemoveAnnotation: (ruleId: string) => void;
}) {
  const sev = SEVERITY_CONFIG[rule.severity];
  const SevIcon = sev.icon;
  const isIrrelevant = annotation?.status === "irrelevant";
  const [noteText, setNoteText] = useState(annotation?.note ?? "");
  const [showNote, setShowNote] = useState(false);

  // Sync note text when annotation changes externally
  // eslint-disable-next-line react-hooks/set-state-in-effect -- prop-driven state sync
  useEffect(() => { setNoteText(annotation?.note ?? ""); }, [annotation?.note]);

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-gray-50 transition-colors ${!rule.enabled ? "opacity-50" : ""} ${isIrrelevant ? "opacity-40" : ""} ${isSelected ? "bg-accent/5" : ""}`}
      >
        <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); onCheck(rule.id, e.shiftKey); }}>
          {isSelected ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4 text-gray-300 hover:text-gray-500" />}
        </td>
        <td className="px-1 py-2" onClick={() => onToggle(rule.id)}>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </td>
        <td className="px-3 py-2 font-mono text-xs" onClick={() => onToggle(rule.id)}>{rule.id}</td>
        <td className="px-3 py-2 text-gray-600" onClick={() => onToggle(rule.id)}>{rule.specialtyName}</td>
        <td className="px-3 py-2 text-gray-600" onClick={() => onToggle(rule.id)}>{rule.regulationRef}</td>
        <td className="px-3 py-2" onClick={() => onToggle(rule.id)}>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sev.bg} ${sev.color}`}>
            <SevIcon className="w-3 h-3" />
            {sev.label}
          </span>
        </td>
        <td className="px-3 py-2" onClick={() => onToggle(rule.id)}>
          {annotation ? (() => {
            const cfg = ANNOTATION_CONFIG[annotation.status];
            const AnnIcon = cfg.icon;
            return (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                <AnnIcon className="w-3 h-3" />
                {cfg.label}
              </span>
            );
          })() : (
            <span className="text-xs text-gray-300">&mdash;</span>
          )}
        </td>
        <td className={`px-3 py-2 text-gray-700 truncate max-w-[300px] ${isIrrelevant ? "line-through" : ""}`} onClick={() => onToggle(rule.id)}>{rule.description}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50 px-6 py-4">
            {/* Annotation toolbar */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-500 mr-1">Classificar:</span>
              {(["reviewed", "irrelevant", "needs-fix"] as const).map((status) => {
                const cfg = ANNOTATION_CONFIG[status];
                const AnnIcon = cfg.icon;
                const isActive = annotation?.status === status;
                return (
                  <button
                    key={status}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isActive) {
                        onRemoveAnnotation(rule.id);
                      } else {
                        onSetAnnotation(rule.id, status, noteText || undefined);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      isActive
                        ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    <AnnIcon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </button>
                );
              })}
              <button
                onClick={(e) => { e.stopPropagation(); setShowNote(!showNote); }}
                className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition-colors ${
                  showNote || annotation?.note ? "border-blue-300 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-400 hover:text-gray-600"
                }`}
                title="Adicionar nota"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {annotation?.note ? "Nota" : ""}
              </button>
            </div>

            {/* Note field */}
            {showNote && (
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && annotation) {
                      onSetAnnotation(rule.id, annotation.status, noteText || undefined);
                      setShowNote(false);
                    }
                  }}
                  placeholder="Nota do engenheiro..."
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (annotation) {
                      onSetAnnotation(rule.id, annotation.status, noteText || undefined);
                    }
                    setShowNote(false);
                  }}
                  className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover"
                >
                  Guardar
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Descrição completa</h4>
                <p className="text-gray-700">{rule.description}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Remediação</h4>
                <p className="text-gray-700">{rule.remediation}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Condições ({rule.conditionCount})</h4>
                <ul className="space-y-1">
                  {rule.conditions.map((c, i) => (
                    <li key={i} className="text-gray-600 flex items-start gap-1.5">
                      <span className="text-gray-400 mt-0.5">•</span>
                      {c}
                    </li>
                  ))}
                </ul>
                {rule.exclusions.length > 0 && (
                  <>
                    <h4 className="font-medium text-gray-900 mt-3 mb-1">Exclusões</h4>
                    <ul className="space-y-1">
                      {rule.exclusions.map((e, i) => (
                        <li key={i} className="text-gray-600 flex items-start gap-1.5">
                          <span className="text-gray-400 mt-0.5">•</span>
                          {e}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Metadados</h4>
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-gray-500">Artigo:</span>
                    <span className="text-gray-800">{rule.article}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">Âmbito:</span>
                    <span className="text-gray-800">
                      {rule.projectScope === "new" ? "Construção nova" : rule.projectScope === "rehab" ? "Reabilitação" : "Universal"}
                    </span>
                  </div>
                  {rule.applicableTypes.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-gray-500">Tipos:</span>
                      <span className="text-gray-800">{rule.applicableTypes.join(", ")}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-gray-500">Ativa:</span>
                    <span className={rule.enabled ? "text-green-700" : "text-red-600"}>{rule.enabled ? "Sim" : "Não"}</span>
                  </div>
                  {rule.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {rule.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RegulationRow({
  reg,
  isExpanded,
  onToggle,
}: {
  reg: AuditRegulation;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <tr onClick={() => onToggle(reg.id)} className="cursor-pointer hover:bg-gray-50 transition-colors">
        <td className="px-3 py-2">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </td>
        <td className="px-3 py-2 font-medium text-gray-900">{reg.shortRef}</td>
        <td className="px-3 py-2 text-gray-700 truncate max-w-[300px]">{reg.title}</td>
        <td className="px-3 py-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[reg.status] ?? "bg-gray-100 text-gray-600"}`}>
            {reg.status}
          </span>
        </td>
        <td className="px-3 py-2 text-gray-500 text-xs">{reg.sourceType}</td>
        <td className="px-3 py-2 text-gray-500 text-xs">{reg.legalForce}</td>
        <td className="px-3 py-2 text-center text-gray-600">{reg.rulesCount}</td>
        <td className="px-3 py-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${INGESTION_COLORS[reg.ingestionStatus] ?? "bg-gray-100 text-gray-600"}`}>
            {reg.ingestionStatus}
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50 px-6 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Especialidades</h4>
                <div className="flex flex-wrap gap-1">
                  {reg.specialties.map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">{s}</span>
                  ))}
                </div>
              </div>
              {reg.sourceUrl && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">Fonte</h4>
                  <a href={reg.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs break-all">
                    {reg.sourceUrl}
                  </a>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

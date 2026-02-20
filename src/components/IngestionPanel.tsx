"use client";

/**
 * Regulation Ingestion Panel — UI for the full lifecycle of adding
 * new regulation documents to specialty plugins:
 *
 *   1. REGISTER — upload PDF + fill metadata
 *   2. EXTRACT  — LLM-assisted or manual rule extraction
 *   3. REVIEW   — inspect and edit extracted rules
 *   4. VERIFY   — engineer marks rules as verified
 *   5. ACTIVATE — rules become part of the analysis
 *
 * For proprietary documents (IEC, IPQ, EN), only the extracted rules
 * are persisted — never the source text. The PDF stays local and gitignored.
 */

import { useState, useRef, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import type {
  RegulationDocument,
  DeclarativeRule,
  SourceType,
  LegalForce,
  SpecialtyPlugin,
} from "@/lib/plugins/types";
import type { RegulationArea, Severity } from "@/lib/types";
import {
  createRegulationDocument,
  validateExtractedRules,
  RULE_EXTRACTION_PROMPT,
} from "@/lib/plugins/ingestion";
import { extractTextFromFile } from "@/lib/document-parser";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  XCircle,
  Sparkles,
  PenLine,
  ShieldCheck,
  Eye,
  Plus,
  Trash2,
  Copy,
  Download,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface IngestionPanelProps {
  /** Target specialty plugin to add the regulation to */
  targetPlugin: SpecialtyPlugin;
  /** Called when rules are ready to be merged into the plugin */
  onRulesReady: (regulation: RegulationDocument, rules: DeclarativeRule[]) => void;
  /** Called to cancel */
  onCancel?: () => void;
}

type IngestionStep = "register" | "extract" | "review" | "verify";

interface RegulationFormData {
  id: string;
  shortRef: string;
  title: string;
  effectiveDate: string;
  sourceType: SourceType;
  sourceUrl: string;
  legalForce: LegalForce;
  area: RegulationArea;
  tags: string;
  notes: string;
}

// ============================================================
// Constants
// ============================================================

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string; labelEn: string }[] = [
  { value: "public_dre", label: "Diário da República (DRE)", labelEn: "Official Gazette (DRE)" },
  { value: "public_erse", label: "ERSE (publicações)", labelEn: "ERSE (publications)" },
  { value: "public_operator", label: "Operador (E-REDES, REN)", labelEn: "Operator (E-REDES, REN)" },
  { value: "proprietary_iec", label: "IEC (norma paga)", labelEn: "IEC (paid standard)" },
  { value: "proprietary_ipq", label: "IPQ / NP (norma paga)", labelEn: "IPQ / NP (paid standard)" },
  { value: "proprietary_en", label: "EN (norma europeia paga)", labelEn: "EN (paid European standard)" },
  { value: "manual_extract", label: "Extração manual", labelEn: "Manual extraction" },
];

const LEGAL_FORCE_OPTIONS: { value: LegalForce; label: string; labelEn: string }[] = [
  { value: "legal", label: "Legislação (DL, Lei, Portaria)", labelEn: "Legislation" },
  { value: "regulatory", label: "Regulamento", labelEn: "Regulation" },
  { value: "normative", label: "Norma técnica (IEC, NP, EN)", labelEn: "Technical standard" },
  { value: "contractual", label: "Contratual (operador)", labelEn: "Contractual (operator)" },
  { value: "informative", label: "Informativo / boas práticas", labelEn: "Informative / best practice" },
];

const AREA_OPTIONS: { value: RegulationArea; label: string }[] = [
  { value: "architecture", label: "Arquitetura" },
  { value: "structural", label: "Estruturas" },
  { value: "fire_safety", label: "SCIE" },
  { value: "hvac", label: "AVAC" },
  { value: "water_drainage", label: "Águas e Drenagem" },
  { value: "gas", label: "Gás" },
  { value: "electrical", label: "Elétrico" },
  { value: "telecommunications", label: "ITED/ITUR" },
  { value: "thermal", label: "Térmico" },
  { value: "acoustic", label: "Acústica" },
  { value: "accessibility", label: "Acessibilidade" },
  { value: "energy", label: "Energia" },
  { value: "elevators", label: "Ascensores" },
  { value: "licensing", label: "Licenciamento" },
  { value: "waste", label: "Resíduos" },
  { value: "drawings", label: "Desenhos" },
  { value: "municipal", label: "Municipal" },
  { value: "general", label: "Geral" },
];

const SEVERITY_OPTIONS: { value: Severity; label: string; color: string }[] = [
  { value: "critical", label: "Crítico", color: "text-red-600" },
  { value: "warning", label: "Aviso", color: "text-amber-600" },
  { value: "info", label: "Informação", color: "text-accent" },
  { value: "pass", label: "Conforme", color: "text-green-600" },
];

// ============================================================
// Component
// ============================================================

export default function IngestionPanel({
  targetPlugin,
  onRulesReady,
  onCancel,
}: IngestionPanelProps) {
  const { lang } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<IngestionStep>("register");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Registration
  const [form, setForm] = useState<RegulationFormData>({
    id: "",
    shortRef: "",
    title: "",
    effectiveDate: "",
    sourceType: "public_dre",
    sourceUrl: "",
    legalForce: "legal",
    area: targetPlugin.areas[0] ?? "general",
    tags: "",
    notes: "",
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");

  // Step 2–3: Extracted rules
  const [extractedRules, setExtractedRules] = useState<DeclarativeRule[]>([]);
  const [validationErrors, setValidationErrors] = useState<
    { ruleId: string; errors: string[] }[]
  >([]);
  const [editingRuleIdx, setEditingRuleIdx] = useState<number | null>(null);

  const isProprietary = form.sourceType.startsWith("proprietary");

  const txt = {
    title: lang === "pt" ? "Adicionar Regulamento" : "Add Regulation",
    step1: lang === "pt" ? "Registar" : "Register",
    step2: lang === "pt" ? "Extrair Regras" : "Extract Rules",
    step3: lang === "pt" ? "Rever" : "Review",
    step4: lang === "pt" ? "Verificar" : "Verify",
    next: lang === "pt" ? "Seguinte" : "Next",
    back: lang === "pt" ? "Anterior" : "Back",
    cancel: lang === "pt" ? "Cancelar" : "Cancel",
    upload: lang === "pt" ? "Carregar PDF" : "Upload PDF",
    uploadDesc: lang === "pt"
      ? "O PDF ficará apenas no seu computador (não é commitado)."
      : "The PDF stays on your machine only (not committed).",
    proprietaryWarning: lang === "pt"
      ? "Documento proprietário — apenas as regras extraídas serão guardadas. O texto integral da norma NÃO será incluído no código."
      : "Proprietary document — only extracted rules will be stored. The full norm text will NOT be included in the code.",
    extractLlm: lang === "pt" ? "Extrair com IA" : "Extract with AI",
    extractManual: lang === "pt" ? "Adicionar Regra Manualmente" : "Add Rule Manually",
    extracting: lang === "pt" ? "A extrair regras..." : "Extracting rules...",
    rulesExtracted: lang === "pt" ? "regra(s) extraída(s)" : "rule(s) extracted",
    noRules: lang === "pt" ? "Nenhuma regra extraída." : "No rules extracted.",
    addRule: lang === "pt" ? "Adicionar Regra" : "Add Rule",
    deleteRule: lang === "pt" ? "Apagar" : "Delete",
    editRule: lang === "pt" ? "Editar" : "Edit",
    validationOk: lang === "pt" ? "Todas as regras são válidas." : "All rules are valid.",
    validationFailed: lang === "pt" ? "Erros de validação encontrados." : "Validation errors found.",
    verifyAndActivate: lang === "pt" ? "Verificar e Ativar" : "Verify & Activate",
    copyPrompt: lang === "pt" ? "Copiar Prompt" : "Copy Prompt",
    exportJson: lang === "pt" ? "Exportar JSON" : "Export JSON",
    textExtracted: lang === "pt" ? "Texto extraído do PDF" : "Text extracted from PDF",
    chars: lang === "pt" ? "caracteres" : "characters",
    pluginTarget: lang === "pt" ? "Plugin destino" : "Target plugin",
    requiredField: lang === "pt" ? "Campo obrigatório" : "Required field",
  };

  // ── Step navigation ─────────────────────────────────────
  const steps: IngestionStep[] = ["register", "extract", "review", "verify"];
  const stepIndex = steps.indexOf(step);

  function canAdvance(): boolean {
    if (step === "register") {
      return !!form.id && !!form.shortRef && !!form.title && !!form.effectiveDate;
    }
    if (step === "extract") {
      return extractedRules.length > 0;
    }
    if (step === "review") {
      return extractedRules.length > 0 && validationErrors.length === 0;
    }
    return true;
  }

  function goNext() {
    if (step === "review") {
      // Run validation before allowing advance
      const errors = validateExtractedRules(extractedRules);
      setValidationErrors(errors);
      if (errors.length > 0) return;
    }
    if (stepIndex < steps.length - 1) {
      setStep(steps[stepIndex + 1]);
      setError(null);
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setStep(steps[stepIndex - 1]);
      setError(null);
    }
  }

  // ── File upload ─────────────────────────────────────────
  const handleFileUpload = useCallback(
    async (file: File) => {
      setUploadedFile(file);
      setIsProcessing(true);
      setError(null);

      try {
        const text = await extractTextFromFile(file);
        setExtractedText(text);

        // Auto-fill ID from filename if empty
        if (!form.id) {
          const nameNoExt = file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[_\s]+/g, "-")
            .toLowerCase();
          setForm((prev) => ({ ...prev, id: nameNoExt }));
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to extract text from PDF",
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [form.id],
  );

  // ── LLM extraction ─────────────────────────────────────
  async function handleLlmExtraction() {
    if (!extractedText) {
      setError(
        lang === "pt"
          ? "Carregue um PDF primeiro para extrair texto."
          : "Upload a PDF first to extract text.",
      );
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch("/api/parse-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentText: extractedText.slice(0, 30000),
          prompt: RULE_EXTRACTION_PROMPT,
          currentProject: {},
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // The API might return rules in different shapes
      let rules: DeclarativeRule[] = [];
      if (data.rules && Array.isArray(data.rules)) {
        rules = data.rules;
      } else if (data.fields?.rules && Array.isArray(data.fields.rules)) {
        rules = data.fields.rules;
      }

      // Ensure all rules have the correct regulationId
      for (const rule of rules) {
        if (!rule.regulationId) rule.regulationId = form.id;
        if (rule.enabled === undefined) rule.enabled = true;
        if (!rule.tags) rule.tags = [];
      }

      setExtractedRules((prev) => [...prev, ...rules]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "LLM extraction failed",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  // ── Add blank rule ──────────────────────────────────────
  function addBlankRule() {
    const ruleCount = extractedRules.length;
    const newRule: DeclarativeRule = {
      id: `${form.id.toUpperCase()}-${String(ruleCount + 1).padStart(3, "0")}`,
      regulationId: form.id,
      article: "",
      description: "",
      severity: "warning",
      conditions: [{ field: "", operator: "exists", value: null }],
      remediation: "",
      requiredValue: "",
      enabled: true,
      tags: [],
    };
    setExtractedRules((prev) => [...prev, newRule]);
    setEditingRuleIdx(ruleCount);
  }

  // ── Delete rule ─────────────────────────────────────────
  function deleteRule(idx: number) {
    setExtractedRules((prev) => prev.filter((_, i) => i !== idx));
    if (editingRuleIdx === idx) setEditingRuleIdx(null);
  }

  // ── Update rule field ───────────────────────────────────
  function updateRule(idx: number, updates: Partial<DeclarativeRule>) {
    setExtractedRules((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...updates } : r)),
    );
  }

  // ── Copy prompt ─────────────────────────────────────────
  function copyPromptToClipboard() {
    navigator.clipboard.writeText(RULE_EXTRACTION_PROMPT);
  }

  // ── Export JSON ─────────────────────────────────────────
  function exportRulesJson() {
    const data = {
      regulationRef: form.id,
      description: `Regras extraídas de ${form.shortRef}`,
      extractedAt: new Date().toISOString().slice(0, 10),
      rules: extractedRules,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.id}-rules.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Final activation ────────────────────────────────────
  function handleVerifyAndActivate() {
    const regulation = createRegulationDocument({
      id: form.id,
      shortRef: form.shortRef,
      title: form.title,
      effectiveDate: form.effectiveDate,
      sourceType: form.sourceType,
      sourceUrl: form.sourceUrl || undefined,
      legalForce: form.legalForce,
      area: form.area,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: form.notes,
    });

    // Mark as verified
    regulation.ingestionStatus = "verified";
    regulation.ingestionDate = new Date().toISOString();
    regulation.rulesCount = extractedRules.length;

    onRulesReady(regulation, extractedRules);
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{txt.title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {txt.pluginTarget}: <span className="font-medium">{targetPlugin.name}</span>
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => {
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          const labels = [txt.step1, txt.step2, txt.step3, txt.step4];

          return (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isDone
                    ? "bg-green-100 text-green-700"
                    : isActive
                      ? "bg-accent-medium text-accent"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">
                    {i + 1}
                  </span>
                )}
                {labels[i]}
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── STEP 1: Register ────────────────────────────── */}
      {step === "register" && (
        <div className="space-y-4">
          {/* PDF Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{txt.upload}</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer border-gray-300 hover:border-accent hover:bg-gray-50 transition-colors"
            >
              {uploadedFile ? (
                <div className="flex items-center justify-center gap-2 text-sm text-green-700">
                  <FileText className="w-4 h-4" />
                  {uploadedFile.name}
                  {extractedText && (
                    <span className="text-gray-400 ml-2">
                      ({extractedText.length.toLocaleString()} {txt.chars})
                    </span>
                  )}
                </div>
              ) : (
                <div>
                  <Upload className="w-6 h-6 text-gray-400 mx-auto" />
                  <p className="text-sm text-gray-600 mt-1">{txt.upload}</p>
                  <p className="text-xs text-gray-400">{txt.uploadDesc}</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
              className="hidden"
            />
          </div>

          {/* Proprietary warning */}
          {isProprietary && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{txt.proprietaryWarning}</span>
            </div>
          )}

          {/* Metadata form */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="ID (kebab-case)" required>
              <input
                type="text"
                value={form.id}
                onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))}
                placeholder="dl-220-2008"
                className="input-field"
              />
            </FormField>
            <FormField label={lang === "pt" ? "Referência Curta" : "Short Ref"} required>
              <input
                type="text"
                value={form.shortRef}
                onChange={(e) => setForm((p) => ({ ...p, shortRef: e.target.value }))}
                placeholder="DL 220/2008"
                className="input-field"
              />
            </FormField>
          </div>

          <FormField label={lang === "pt" ? "Título Completo" : "Full Title"} required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Regime Jurídico de Segurança Contra Incêndio em Edifícios"
              className="input-field"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={lang === "pt" ? "Data de Vigor" : "Effective Date"} required>
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm((p) => ({ ...p, effectiveDate: e.target.value }))}
                className="input-field"
              />
            </FormField>
            <FormField label={lang === "pt" ? "Tipo de Fonte" : "Source Type"}>
              <select
                value={form.sourceType}
                onChange={(e) => setForm((p) => ({ ...p, sourceType: e.target.value as SourceType }))}
                className="input-field"
              >
                {SOURCE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {lang === "pt" ? o.label : o.labelEn}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={lang === "pt" ? "Força Legal" : "Legal Force"}>
              <select
                value={form.legalForce}
                onChange={(e) => setForm((p) => ({ ...p, legalForce: e.target.value as LegalForce }))}
                className="input-field"
              >
                {LEGAL_FORCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {lang === "pt" ? o.label : o.labelEn}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={lang === "pt" ? "Especialidade" : "Area"}>
              <select
                value={form.area}
                onChange={(e) => setForm((p) => ({ ...p, area: e.target.value as RegulationArea }))}
                className="input-field"
              >
                {AREA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="URL">
            <input
              type="url"
              value={form.sourceUrl}
              onChange={(e) => setForm((p) => ({ ...p, sourceUrl: e.target.value }))}
              placeholder="https://diariodarepublica.pt/..."
              className="input-field"
            />
          </FormField>

          <FormField label="Tags (separadas por vírgula)">
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="BT, proteção, circuitos"
              className="input-field"
            />
          </FormField>

          <FormField label={lang === "pt" ? "Notas" : "Notes"}>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="input-field"
              placeholder={lang === "pt" ? "Notas adicionais sobre este regulamento..." : "Additional notes..."}
            />
          </FormField>
        </div>
      )}

      {/* ── STEP 2: Extract ─────────────────────────────── */}
      {step === "extract" && (
        <div className="space-y-4">
          {/* Extraction methods */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleLlmExtraction}
              disabled={isProcessing || !extractedText}
              className="flex items-center gap-2 p-4 border-2 rounded-lg text-left transition-colors hover:border-accent hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed border-gray-200"
            >
              <Sparkles className="w-5 h-5 text-accent" />
              <div>
                <p className="text-sm font-medium text-gray-900">{txt.extractLlm}</p>
                <p className="text-xs text-gray-500">
                  {lang === "pt"
                    ? "Envia o texto do PDF à IA para extração automática"
                    : "Sends PDF text to AI for automatic extraction"}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={addBlankRule}
              className="flex items-center gap-2 p-4 border-2 rounded-lg text-left transition-colors hover:border-accent hover:bg-accent-light border-gray-200"
            >
              <PenLine className="w-5 h-5 text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{txt.extractManual}</p>
                <p className="text-xs text-gray-500">
                  {lang === "pt"
                    ? "Criar regras manualmente uma a uma"
                    : "Create rules manually one by one"}
                </p>
              </div>
            </button>
          </div>

          {/* Copy prompt button (for external LLM use) */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyPromptToClipboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              <Copy className="w-3 h-3" />
              {txt.copyPrompt}
            </button>
            {extractedText && (
              <span className="text-xs text-gray-400 self-center">
                {txt.textExtracted}: {extractedText.length.toLocaleString()} {txt.chars}
              </span>
            )}
          </div>

          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-accent">
              <Loader2 className="w-4 h-4 animate-spin" />
              {txt.extracting}
            </div>
          )}

          {/* Rules list */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              {extractedRules.length} {txt.rulesExtracted}
            </p>
            {extractedRules.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">{txt.noRules}</p>
            )}
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {extractedRules.map((rule, idx) => (
                <RuleCard
                  key={idx}
                  rule={rule}
                  idx={idx}
                  lang={lang}
                  isEditing={editingRuleIdx === idx}
                  onToggleEdit={() => setEditingRuleIdx(editingRuleIdx === idx ? null : idx)}
                  onUpdate={(updates) => updateRule(idx, updates)}
                  onDelete={() => deleteRule(idx)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: Review ──────────────────────────────── */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {extractedRules.length} {txt.rulesExtracted}
            </p>
            <button
              type="button"
              onClick={() => {
                const errors = validateExtractedRules(extractedRules);
                setValidationErrors(errors);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-medium text-accent rounded hover:bg-accent-medium transition-colors"
            >
              <ShieldCheck className="w-3 h-3" />
              {lang === "pt" ? "Validar Regras" : "Validate Rules"}
            </button>
          </div>

          {/* Validation result */}
          {validationErrors.length === 0 && extractedRules.length > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {txt.validationOk}
            </div>
          )}
          {validationErrors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 space-y-1">
              <p className="font-medium flex items-center gap-1">
                <XCircle className="w-4 h-4" />
                {txt.validationFailed}
              </p>
              {validationErrors.map((ve, i) => (
                <div key={i} className="text-xs ml-5">
                  <code>{ve.ruleId}</code>: {ve.errors.join(", ")}
                </div>
              ))}
            </div>
          )}

          {/* Rules list (read-only summary) */}
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {extractedRules.map((rule, idx) => (
              <RuleCard
                key={idx}
                rule={rule}
                idx={idx}
                lang={lang}
                isEditing={editingRuleIdx === idx}
                onToggleEdit={() => setEditingRuleIdx(editingRuleIdx === idx ? null : idx)}
                onUpdate={(updates) => updateRule(idx, updates)}
                onDelete={() => deleteRule(idx)}
              />
            ))}
          </div>

          {/* Export */}
          <button
            type="button"
            onClick={exportRulesJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            <Download className="w-3 h-3" />
            {txt.exportJson}
          </button>
        </div>
      )}

      {/* ── STEP 4: Verify ──────────────────────────────── */}
      {step === "verify" && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h4 className="font-medium text-gray-900">{lang === "pt" ? "Resumo" : "Summary"}</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">{lang === "pt" ? "Regulamento" : "Regulation"}</div>
              <div className="font-medium">{form.shortRef}</div>
              <div className="text-gray-500">{lang === "pt" ? "Título" : "Title"}</div>
              <div className="font-medium text-sm">{form.title}</div>
              <div className="text-gray-500">{lang === "pt" ? "Tipo" : "Type"}</div>
              <div className="font-medium">
                {SOURCE_TYPE_OPTIONS.find((o) => o.value === form.sourceType)?.[
                  lang === "pt" ? "label" : "labelEn"
                ]}
              </div>
              <div className="text-gray-500">{lang === "pt" ? "Regras" : "Rules"}</div>
              <div className="font-medium">{extractedRules.length}</div>
              <div className="text-gray-500">{lang === "pt" ? "Especialidade" : "Area"}</div>
              <div className="font-medium">
                {AREA_OPTIONS.find((o) => o.value === form.area)?.label}
              </div>
            </div>
          </div>

          {isProprietary && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  {lang === "pt" ? "Documento proprietário" : "Proprietary document"}
                </p>
                <p>
                  {lang === "pt"
                    ? "O PDF original NÃO será incluído no repositório. Apenas as regras extraídas serão commitadas."
                    : "The original PDF will NOT be included in the repository. Only extracted rules will be committed."}
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleVerifyAndActivate}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
          >
            <ShieldCheck className="w-5 h-5" />
            {txt.verifyAndActivate}
          </button>
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <div>
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {txt.back}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {txt.cancel}
            </button>
          )}
          {step !== "verify" && (
            <button
              type="button"
              onClick={goNext}
              disabled={!canAdvance()}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {txt.next}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function RuleCard({
  rule,
  lang,
  isEditing,
  onToggleEdit,
  onUpdate,
  onDelete,
}: {
  rule: DeclarativeRule;
  idx: number;
  lang: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (updates: Partial<DeclarativeRule>) => void;
  onDelete: () => void;
}) {
  const severityConfig: Record<string, { bg: string; text: string }> = {
    critical: { bg: "bg-red-50 border-red-200", text: "text-red-700" },
    warning: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
    info: { bg: "bg-accent-light border-accent", text: "text-accent" },
    pass: { bg: "bg-green-50 border-green-200", text: "text-green-700" },
  };
  const sc = severityConfig[rule.severity] ?? severityConfig.info;

  return (
    <div className={`rounded-lg border ${sc.bg}`}>
      {/* Header */}
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono text-gray-500">{rule.id}</code>
            <span className={`text-xs font-medium ${sc.text}`}>{rule.severity}</span>
            {rule.article && (
              <span className="text-xs text-gray-400">{rule.article}</span>
            )}
            {!rule.enabled && (
              <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                {lang === "pt" ? "desativada" : "disabled"}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-800 mt-1">{rule.description || "—"}</p>
          {!isEditing && rule.conditions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {rule.conditions.map((c, ci) => (
                <code key={ci} className="text-[10px] bg-white/50 px-1.5 py-0.5 rounded text-gray-500">
                  {c.field} {c.operator} {String(c.value ?? "")}
                </code>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onToggleEdit}
            className="p-1 text-gray-400 hover:text-accent transition-colors"
            title={lang === "pt" ? "Editar" : "Edit"}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title={lang === "pt" ? "Apagar" : "Delete"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Edit form */}
      {isEditing && (
        <div className="px-3 pb-3 border-t border-gray-200/50 pt-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-gray-500">ID</label>
              <input
                type="text"
                value={rule.id}
                onChange={(e) => onUpdate({ id: e.target.value })}
                className="input-field-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">
                {lang === "pt" ? "Artigo" : "Article"}
              </label>
              <input
                type="text"
                value={rule.article}
                onChange={(e) => onUpdate({ article: e.target.value })}
                placeholder="Art. X.º"
                className="input-field-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">
                {lang === "pt" ? "Gravidade" : "Severity"}
              </label>
              <select
                value={rule.severity}
                onChange={(e) => onUpdate({ severity: e.target.value as Severity })}
                className="input-field-sm"
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-500">
              {lang === "pt" ? "Descrição" : "Description"}
            </label>
            <textarea
              value={rule.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              rows={2}
              className="input-field-sm"
            />
          </div>

          {/* Conditions editor */}
          <div>
            <label className="text-[10px] text-gray-500">
              {lang === "pt" ? "Condições" : "Conditions"}
            </label>
            {rule.conditions.map((cond, ci) => (
              <div key={ci} className="flex gap-1 mt-1">
                <input
                  type="text"
                  value={cond.field}
                  onChange={(e) => {
                    const newConds = [...rule.conditions];
                    newConds[ci] = { ...newConds[ci], field: e.target.value };
                    onUpdate({ conditions: newConds });
                  }}
                  placeholder="field.path"
                  className="input-field-sm flex-1"
                />
                <select
                  value={cond.operator}
                  onChange={(e) => {
                    const newConds = [...rule.conditions];
                    newConds[ci] = { ...newConds[ci], operator: e.target.value as DeclarativeRule["conditions"][0]["operator"] };
                    onUpdate({ conditions: newConds });
                  }}
                  className="input-field-sm w-20"
                >
                  {[">", ">=", "<", "<=", "==", "!=", "exists", "not_exists", "in", "between"].map(
                    (op) => (
                      <option key={op} value={op}>{op}</option>
                    ),
                  )}
                </select>
                <input
                  type="text"
                  value={String(cond.value ?? "")}
                  onChange={(e) => {
                    const newConds = [...rule.conditions];
                    const raw = e.target.value;
                    const numVal = Number(raw);
                    newConds[ci] = {
                      ...newConds[ci],
                      value: raw === "" ? null : isNaN(numVal) ? raw : numVal,
                    };
                    onUpdate({ conditions: newConds });
                  }}
                  placeholder="value"
                  className="input-field-sm w-24"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newConds = rule.conditions.filter((_, i) => i !== ci);
                    onUpdate({ conditions: newConds });
                  }}
                  className="p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  conditions: [...rule.conditions, { field: "", operator: "exists", value: null }],
                })
              }
              className="text-[10px] text-accent mt-1 flex items-center gap-0.5 hover:text-accent-hover"
            >
              <Plus className="w-2.5 h-2.5" />
              {lang === "pt" ? "Adicionar condição" : "Add condition"}
            </button>
          </div>

          <div>
            <label className="text-[10px] text-gray-500">
              {lang === "pt" ? "Remediação" : "Remediation"}
            </label>
            <textarea
              value={rule.remediation}
              onChange={(e) => onUpdate({ remediation: e.target.value })}
              rows={2}
              className="input-field-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500">
                {lang === "pt" ? "Valor Exigido" : "Required Value"}
              </label>
              <input
                type="text"
                value={rule.requiredValue ?? ""}
                onChange={(e) => onUpdate({ requiredValue: e.target.value })}
                className="input-field-sm"
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => onUpdate({ enabled: e.target.checked })}
                  className="rounded"
                />
                {lang === "pt" ? "Ativa" : "Enabled"}
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

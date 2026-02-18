"use client";

/**
 * RuleEditor — Standalone form for creating and editing declarative rules.
 *
 * Features:
 * - Full field editing: id, article, description, severity, conditions, exclusions
 * - Condition builder with operator picker and value input
 * - Lookup table reference (for lookup_* operators)
 * - Live JSON preview
 * - Validation feedback
 * - Available field paths autocomplete reference
 */

import { useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import type {
  DeclarativeRule,
  RuleCondition,
  RuleOperator,
} from "@/lib/plugins/types";
import type { Severity } from "@/lib/types";
import { validateExtractedRules } from "@/lib/plugins/ingestion";
import {
  Plus,
  Trash2,
  Save,
  Copy,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code,
  Eye,
  EyeOff,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface RuleEditorProps {
  /** Rule to edit, or undefined for new rule creation */
  initialRule?: DeclarativeRule;
  /** Regulation ID this rule belongs to */
  regulationId: string;
  /** Called when the user saves the rule */
  onSave: (rule: DeclarativeRule) => void;
  /** Called to cancel editing */
  onCancel?: () => void;
}

// ============================================================
// Constants
// ============================================================

const SEVERITY_OPTIONS: { value: Severity; label: string; labelEn: string; color: string }[] = [
  { value: "critical", label: "Crítico", labelEn: "Critical", color: "bg-red-100 text-red-700" },
  { value: "warning", label: "Aviso", labelEn: "Warning", color: "bg-amber-100 text-amber-700" },
  { value: "info", label: "Informação", labelEn: "Info", color: "bg-accent-medium text-accent" },
  { value: "pass", label: "Conforme", labelEn: "Pass", color: "bg-green-100 text-green-700" },
];

const OPERATOR_GROUPS: { label: string; operators: { value: RuleOperator; label: string }[] }[] = [
  {
    label: "Comparação",
    operators: [
      { value: ">", label: "> maior que" },
      { value: ">=", label: ">= maior ou igual" },
      { value: "<", label: "< menor que" },
      { value: "<=", label: "<= menor ou igual" },
      { value: "==", label: "== igual" },
      { value: "!=", label: "!= diferente" },
    ],
  },
  {
    label: "Existência",
    operators: [
      { value: "exists", label: "exists (existe/verdadeiro)" },
      { value: "not_exists", label: "not_exists (não existe/falso)" },
    ],
  },
  {
    label: "Conjunto",
    operators: [
      { value: "in", label: "in (está na lista)" },
      { value: "not_in", label: "not_in (não está na lista)" },
      { value: "between", label: "between (entre [min, max])" },
    ],
  },
  {
    label: "Lookup Table",
    operators: [
      { value: "lookup_gt", label: "lookup_gt (> valor da tabela)" },
      { value: "lookup_gte", label: "lookup_gte (>= valor da tabela)" },
      { value: "lookup_lt", label: "lookup_lt (< valor da tabela)" },
      { value: "lookup_lte", label: "lookup_lte (<= valor da tabela)" },
      { value: "lookup_eq", label: "lookup_eq (== valor da tabela)" },
      { value: "lookup_neq", label: "lookup_neq (!= valor da tabela)" },
    ],
  },
  {
    label: "Ordinal",
    operators: [
      { value: "ordinal_lt", label: "ordinal_lt (rank inferior)" },
      { value: "ordinal_lte", label: "ordinal_lte (rank inferior ou igual)" },
      { value: "ordinal_gt", label: "ordinal_gt (rank superior)" },
      { value: "ordinal_gte", label: "ordinal_gte (rank superior ou igual)" },
    ],
  },
];

/** Common project field paths for reference */
const FIELD_REFERENCE: { group: string; fields: string[] }[] = [
  {
    group: "Elétrico",
    fields: [
      "electrical.supplyType",
      "electrical.contractedPower",
      "electrical.hasResidualCurrentDevice",
      "electrical.rcdSensitivity",
      "electrical.hasEarthingSystem",
      "electrical.earthingResistance",
      "electrical.hasEquipotentialBonding",
      "electrical.hasMainCircuitBreaker",
      "electrical.hasIndividualCircuitProtection",
      "electrical.hasSurgeProtection",
      "electrical.numberOfCircuits",
      "electrical.hasBathroomZoneCompliance",
      "electrical.hasSchematicDiagram",
      "electrical.hasEVCharging",
      "electrical.hasProjectApproval",
    ],
  },
  {
    group: "Edifício",
    fields: [
      "buildingType",
      "isRehabilitation",
      "grossFloorArea",
      "numberOfFloors",
      "numberOfDwellings",
      "buildingHeight",
    ],
  },
  {
    group: "Computado",
    fields: [
      "computed.avgFloorHeight",
      "computed.minCircuitsByArea",
    ],
  },
];

// ============================================================
// Helpers
// ============================================================

function emptyRule(regulationId: string): DeclarativeRule {
  return {
    id: "",
    regulationId,
    article: "",
    description: "",
    severity: "warning",
    conditions: [{ field: "", operator: "exists", value: null }],
    remediation: "",
    enabled: true,
    tags: [],
  };
}

function parseConditionValue(raw: string): unknown {
  if (raw === "" || raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  // Try JSON parse for arrays
  if (raw.startsWith("[")) {
    try { return JSON.parse(raw); } catch { /* ignore */ }
  }
  const num = Number(raw);
  return isNaN(num) ? raw : num;
}

// ============================================================
// Component
// ============================================================

export default function RuleEditor({
  initialRule,
  regulationId,
  onSave,
  onCancel,
}: RuleEditorProps) {
  const { lang } = useI18n();
  const pt = lang === "pt";

  const [rule, setRule] = useState<DeclarativeRule>(
    initialRule ?? emptyRule(regulationId),
  );
  const [showJson, setShowJson] = useState(false);
  const [showFieldRef, setShowFieldRef] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const update = useCallback(
    (patch: Partial<DeclarativeRule>) => {
      setRule((prev) => ({ ...prev, ...patch }));
      setSaved(false);
      setValidationErrors([]);
    },
    [],
  );

  // -- Condition management --
  function updateCondition(idx: number, patch: Partial<RuleCondition>) {
    const newConds = [...rule.conditions];
    newConds[idx] = { ...newConds[idx], ...patch };
    update({ conditions: newConds });
  }

  function addCondition() {
    update({
      conditions: [...rule.conditions, { field: "", operator: "exists", value: null }],
    });
  }

  function removeCondition(idx: number) {
    update({ conditions: rule.conditions.filter((_, i) => i !== idx) });
  }

  // -- Exclusion management --
  function addExclusion() {
    update({
      exclusions: [...(rule.exclusions ?? []), { field: "", operator: "exists", value: null }],
    });
  }

  function updateExclusion(idx: number, patch: Partial<RuleCondition>) {
    const newExcl = [...(rule.exclusions ?? [])];
    newExcl[idx] = { ...newExcl[idx], ...patch };
    update({ exclusions: newExcl });
  }

  function removeExclusion(idx: number) {
    const newExcl = (rule.exclusions ?? []).filter((_, i) => i !== idx);
    update({ exclusions: newExcl.length > 0 ? newExcl : undefined });
  }

  // -- Tag management --
  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !rule.tags.includes(trimmed)) {
      update({ tags: [...rule.tags, trimmed] });
    }
  }

  function removeTag(idx: number) {
    update({ tags: rule.tags.filter((_, i) => i !== idx) });
  }

  // -- Validation & Save --
  function handleSave() {
    const issues = validateExtractedRules([rule]);
    if (issues.length > 0) {
      setValidationErrors(issues[0].errors);
      return;
    }
    setValidationErrors([]);
    setSaved(true);
    onSave(rule);
  }

  function copyJson() {
    navigator.clipboard.writeText(JSON.stringify(rule, null, 2));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {initialRule
            ? (pt ? "Editar Regra" : "Edit Rule")
            : (pt ? "Nova Regra" : "New Rule")}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowJson(!showJson)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200"
          >
            <Code className="w-3.5 h-3.5" />
            JSON
          </button>
          <button
            type="button"
            onClick={() => setShowFieldRef(!showFieldRef)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200"
          >
            {showFieldRef ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {pt ? "Campos" : "Fields"}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-red-700 mb-1">
              <AlertTriangle className="w-4 h-4" />
              {pt ? "Erros de validação" : "Validation errors"}
            </div>
            <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
              {validationErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Success message */}
        {saved && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" />
            {pt ? "Regra guardada com sucesso" : "Rule saved successfully"}
          </div>
        )}

        {/* Field reference panel */}
        {showFieldRef && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">
              {pt ? "Campos Disponíveis" : "Available Fields"}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {FIELD_REFERENCE.map((group) => (
                <div key={group.group}>
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                    {group.group}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {group.fields.map((f) => (
                      <code key={f} className="block text-[11px] text-gray-600 font-mono">
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* JSON preview */}
        {showJson && (
          <div className="rounded-lg bg-gray-900 p-3 relative">
            <button
              type="button"
              onClick={copyJson}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white"
              title="Copy JSON"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <pre className="text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(rule, null, 2)}
            </pre>
          </div>
        )}

        {/* Row 1: ID + Article + Severity */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {pt ? "ID da Regra" : "Rule ID"} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={rule.id}
              onChange={(e) => update({ id: e.target.value })}
              placeholder="RTIEBT-311-01"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {pt ? "Artigo / Secção" : "Article / Section"} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={rule.article}
              onChange={(e) => update({ article: e.target.value })}
              placeholder="Art. 311.º, n.º 3"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {pt ? "Gravidade" : "Severity"} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1.5">
              {SEVERITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ severity: opt.value })}
                  className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                    rule.severity === opt.value
                      ? `${opt.color} border-current font-semibold ring-2 ring-offset-1 ring-current/20`
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {pt ? opt.label : opt.labelEn}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {pt ? "Descrição" : "Description"} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={rule.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder={
              pt
                ? "A instalação deve dispor de proteção diferencial com sensibilidade de {electrical.rcdSensitivity} mA"
                : "The installation must have RCD protection with sensitivity of {electrical.rcdSensitivity} mA"
            }
            rows={3}
            className="input-field"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">
            {pt
              ? "Use {campo} para interpolação de valores do projeto"
              : "Use {field} for project value interpolation"}
          </p>
        </div>

        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700">
              {pt ? "Condições" : "Conditions"} <span className="text-red-500">*</span>
            </label>
            <span className="text-[10px] text-gray-400">
              {pt ? "Todas devem ser verdadeiras (AND)" : "All must be true (AND)"}
            </span>
          </div>
          <div className="space-y-2">
            {rule.conditions.map((cond, ci) => (
              <ConditionRow
                key={ci}
                condition={cond}
                onChange={(patch) => updateCondition(ci, patch)}
                onRemove={() => removeCondition(ci)}
                canRemove={rule.conditions.length > 1}
                lang={lang}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addCondition}
            className="mt-2 flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
          >
            <Plus className="w-3 h-3" />
            {pt ? "Adicionar condição" : "Add condition"}
          </button>
        </div>

        {/* Exclusions (optional) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700">
              {pt ? "Exclusões (opcional)" : "Exclusions (optional)"}
            </label>
            <span className="text-[10px] text-gray-400">
              {pt ? "Se alguma for verdadeira, a regra é ignorada (OR)" : "If any is true, rule is skipped (OR)"}
            </span>
          </div>
          {(rule.exclusions ?? []).length > 0 && (
            <div className="space-y-2">
              {(rule.exclusions ?? []).map((excl, ei) => (
                <ConditionRow
                  key={ei}
                  condition={excl}
                  onChange={(patch) => updateExclusion(ei, patch)}
                  onRemove={() => removeExclusion(ei)}
                  canRemove
                  lang={lang}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addExclusion}
            className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <Plus className="w-3 h-3" />
            {pt ? "Adicionar exclusão" : "Add exclusion"}
          </button>
        </div>

        {/* Remediation */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {pt ? "Remediação" : "Remediation"} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={rule.remediation}
            onChange={(e) => update({ remediation: e.target.value })}
            placeholder={pt ? "Ação corretiva recomendada..." : "Recommended corrective action..."}
            rows={2}
            className="input-field"
          />
        </div>

        {/* Required Value + Current Value Template */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {pt ? "Valor Exigido" : "Required Value"}
            </label>
            <input
              type="text"
              value={rule.requiredValue ?? ""}
              onChange={(e) => update({ requiredValue: e.target.value || undefined })}
              placeholder="≤ 30 mA"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {pt ? "Template de Valor Atual" : "Current Value Template"}
            </label>
            <input
              type="text"
              value={rule.currentValueTemplate ?? ""}
              onChange={(e) => update({ currentValueTemplate: e.target.value || undefined })}
              placeholder="{electrical.rcdSensitivity} mA"
              className="input-field"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Tags
          </label>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {rule.tags.map((tag, ti) => (
              <span
                key={ti}
                className="inline-flex items-center gap-0.5 text-xs bg-accent-light text-accent px-2 py-0.5 rounded-full"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(ti)}
                  className="text-accent/60 hover:text-accent-hover"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            placeholder={pt ? "Escreva e prima Enter para adicionar tag..." : "Type and press Enter to add tag..."}
            className="input-field"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(e.currentTarget.value);
                e.currentTarget.value = "";
              }
            }}
          />
        </div>

        {/* Enabled toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">
              {pt ? "Regra ativa" : "Rule enabled"}
            </span>
          </label>
          {!rule.enabled && (
            <span className="text-xs text-gray-400">
              {pt
                ? "(a regra não será avaliada até ser ativada)"
                : "(rule won't be evaluated until enabled)"}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {pt ? "Cancelar" : "Cancel"}
            </button>
          )}
          <button
            type="button"
            onClick={copyJson}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Copy className="w-3.5 h-3.5" />
            {pt ? "Copiar JSON" : "Copy JSON"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors"
        >
          <Save className="w-4 h-4" />
          {pt ? "Guardar Regra" : "Save Rule"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ConditionRow — Reusable condition editor row
// ============================================================

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
  lang,
}: {
  condition: RuleCondition;
  onChange: (patch: Partial<RuleCondition>) => void;
  onRemove: () => void;
  canRemove: boolean;
  lang: string;
}) {
  const pt = lang === "pt";
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isLookup = condition.operator.startsWith("lookup_");
  const needsValue = !["exists", "not_exists"].includes(condition.operator);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
      <div className="flex gap-2 items-start">
        {/* Field path */}
        <div className="flex-1">
          <label className="text-[10px] text-gray-500">{pt ? "Campo" : "Field"}</label>
          <input
            type="text"
            value={condition.field}
            onChange={(e) => onChange({ field: e.target.value })}
            placeholder="electrical.contractedPower"
            className="input-field-sm"
          />
        </div>

        {/* Operator */}
        <div className="w-44">
          <label className="text-[10px] text-gray-500">{pt ? "Operador" : "Operator"}</label>
          <select
            value={condition.operator}
            onChange={(e) => onChange({ operator: e.target.value as RuleOperator })}
            className="input-field-sm"
          >
            {OPERATOR_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.operators.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.value}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Value */}
        {needsValue && (
          <div className="w-32">
            <label className="text-[10px] text-gray-500">{pt ? "Valor" : "Value"}</label>
            <input
              type="text"
              value={condition.value === null ? "" : String(condition.value)}
              onChange={(e) => onChange({ value: parseConditionValue(e.target.value) })}
              placeholder={condition.operator === "between" ? "[min, max]" : "valor"}
              className="input-field-sm"
            />
          </div>
        )}

        {/* Remove button */}
        <div className="pt-4">
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Advanced: lookup table + keys, ordinal scale */}
      {(isLookup || condition.operator.startsWith("ordinal_")) && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-gray-700"
          >
            {showAdvanced ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            {pt ? "Opções avançadas" : "Advanced options"}
          </button>
          {showAdvanced && (
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {isLookup && (
                <>
                  <div>
                    <label className="text-[10px] text-gray-500">
                      {pt ? "Tabela de Lookup" : "Lookup Table ID"}
                    </label>
                    <input
                      type="text"
                      value={condition.table ?? ""}
                      onChange={(e) =>
                        onChange({ table: e.target.value || undefined })
                      }
                      placeholder="fire_resistance"
                      className="input-field-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">
                      {pt ? "Chaves (separadas por vírgula)" : "Keys (comma-separated)"}
                    </label>
                    <input
                      type="text"
                      value={(condition.keys ?? []).join(", ")}
                      onChange={(e) =>
                        onChange({
                          keys: e.target.value
                            .split(",")
                            .map((k) => k.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="buildingType, fireSafety.riskCategory"
                      className="input-field-sm"
                    />
                  </div>
                </>
              )}
              {condition.operator.startsWith("ordinal_") && (
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-500">
                    {pt ? "Escala ordinal (mais baixo → mais alto, separado por vírgula)" : "Ordinal scale (lowest → highest, comma-separated)"}
                  </label>
                  <input
                    type="text"
                    value={(condition.scale ?? []).join(", ")}
                    onChange={(e) =>
                      onChange({
                        scale: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="I1, I2, I3"
                    className="input-field-sm"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import {
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Tag,
  AlertTriangle,
  Info,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type {
  SpecialtyPlugin,
  RegulationDocument,
  DeclarativeRule,
  RuleCondition,
} from "@/lib/plugins/types";
import { SPECIALTY_NAMES, SEVERITY_BG } from "@/lib/regulation-constants";

interface RuleDetailProps {
  rule: DeclarativeRule;
  regulation: RegulationDocument;
  plugin: SpecialtyPlugin;
  onBack: () => void;
}

/** Format an operator to a readable label */
function operatorLabel(op: string): string {
  const map: Record<string, string> = {
    ">": ">",
    "<": "<",
    ">=": "\u2265",
    "<=": "\u2264",
    "==": "=",
    "!=": "\u2260",
    exists: "existe",
    not_exists: "nao existe",
    in: "\u2208 (em)",
    not_in: "\u2209 (nao em)",
    between: "entre",
    lookup_gt: "> tabela",
    lookup_gte: "\u2265 tabela",
    lookup_lt: "< tabela",
    lookup_lte: "\u2264 tabela",
    lookup_eq: "= tabela",
    lookup_neq: "\u2260 tabela",
    ordinal_gt: "> (ordinal)",
    ordinal_gte: "\u2265 (ordinal)",
    ordinal_lt: "< (ordinal)",
    ordinal_lte: "\u2264 (ordinal)",
    formula_gt: "> formula",
    formula_gte: "\u2265 formula",
    formula_lt: "< formula",
    formula_lte: "\u2264 formula",
    computed_gt: "> calculado",
    computed_gte: "\u2265 calculado",
    computed_lt: "< calculado",
    computed_lte: "\u2264 calculado",
    not_in_range: "fora do intervalo",
    reaction_class_lt: "< classe",
    reaction_class_lte: "\u2264 classe",
    reaction_class_gt: "> classe",
    reaction_class_gte: "\u2265 classe",
  };
  return map[op] ?? op;
}

/** Format a condition value for display */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "\u2014";
  if (typeof v === "boolean") return v ? "Sim" : "Nao";
  if (Array.isArray(v)) return `[${v.map(formatValue).join(", ")}]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Scope label mapping */
const SCOPE_LABELS: Record<string, string> = {
  new: "Obra Nova",
  rehab: "Reabilitacao",
  all: "Todos",
};

/** Building type label mapping */
const BUILDING_TYPE_LABELS: Record<string, string> = {
  residential: "Habitacao Unifamiliar",
  habitacional: "Habitacao Multifamiliar",
  commercial: "Comercio",
  office: "Escritorios",
  industrial: "Industrial",
  mixed: "Misto",
  hospital: "Hospitalar",
  school: "Escolar",
  hotel: "Hotelaria",
  warehouse: "Armazem",
  parking: "Estacionamento",
  cultural: "Cultural/Desporto",
  assembly: "Reuniao",
  public: "Publico/Institucional",
  clinic: "Clinica",
  university: "Universitario",
  retail: "Retalho",
  restaurant: "Restauracao",
  alojamento: "Alojamento",
  temporary: "Temporario",
  historic: "Historico",
};

export default function RuleDetail({
  rule,
  regulation,
  plugin,
  onBack,
}: RuleDetailProps) {
  // Derive scope from conditions if present
  const projectScope = (() => {
    for (const cond of rule.conditions) {
      if (cond.field === "isRehabilitation" && cond.operator === "==") {
        return cond.value === true ? "rehab" : "new";
      }
    }
    return "all";
  })();

  // Extract applicable building types from conditions
  const applicableTypes: string[] = [];
  for (const cond of rule.conditions) {
    if (cond.field === "buildingType") {
      if (cond.operator === "==" && typeof cond.value === "string") {
        applicableTypes.push(cond.value);
      } else if (cond.operator === "in" && Array.isArray(cond.value)) {
        for (const v of cond.value) {
          if (typeof v === "string") applicableTypes.push(v);
        }
      }
    }
  }

  const severityIcon = () => {
    switch (rule.severity) {
      case "critical":
        return <ShieldAlert className="w-5 h-5" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5" />;
      case "info":
        return <Info className="w-5 h-5" />;
      case "pass":
        return <ShieldCheck className="w-5 h-5" />;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <button
          onClick={onBack}
          className="hover:text-gray-900 transition-colors"
        >
          {SPECIALTY_NAMES[plugin.id] ?? plugin.name}
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <button
          onClick={onBack}
          className="hover:text-gray-900 transition-colors"
        >
          {regulation.shortRef}
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium font-mono text-xs">
          {rule.id}
        </span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-mono">
              {rule.id}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Artigo: {rule.article}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${SEVERITY_BG[rule.severity]}`}>
              {severityIcon()}
              {rule.severity}
            </span>
            {rule.enabled ? (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ativo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
                <XCircle className="w-3.5 h-3.5" />
                Desativado
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Descricao</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          {rule.description}
        </p>
      </div>

      {/* Scope badges */}
      {(applicableTypes.length > 0 || projectScope !== "all") && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-medium text-gray-700">
            Ambito de Aplicacao
          </h2>

          <div className="flex flex-wrap gap-2">
            {applicableTypes.map((type) => (
              <span
                key={type}
                className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-medium"
              >
                {BUILDING_TYPE_LABELS[type] ?? type}
              </span>
            ))}

            {projectScope !== "all" && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 font-medium">
                {SCOPE_LABELS[projectScope]}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Conditions */}
      {rule.conditions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-700">Condicoes</h2>

          {rule.conditions.map((cond, idx) => (
            <ConditionCard key={idx} condition={cond} index={idx} />
          ))}
        </div>
      )}

      {/* Required value */}
      {rule.requiredValue && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-medium text-blue-800 mb-1">
            Valor Requerido
          </h2>
          <p className="text-sm text-blue-700">{rule.requiredValue}</p>
        </div>
      )}

      {/* Remediation */}
      {rule.remediation && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h2 className="text-sm font-medium text-green-800 mb-1">
            Recomendacao
          </h2>
          <p className="text-sm text-green-700">{rule.remediation}</p>
        </div>
      )}

      {/* Tags */}
      {rule.tags.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5">
          <Tag className="w-3.5 h-3.5 text-gray-400" />
          {rule.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>
    </div>
  );
}

// ── Condition card sub-component ──

function ConditionCard({
  condition,
  index,
}: {
  condition: RuleCondition;
  index: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>Condicao {index + 1}</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {/* Field */}
        <span className="font-mono text-sm text-gray-800 bg-gray-50 px-2 py-1 rounded">
          {condition.field}
        </span>

        {/* Operator */}
        <span className="text-sm font-medium text-indigo-600">
          {operatorLabel(condition.operator)}
        </span>

        {/* Value */}
        <span className="text-sm text-gray-700 bg-amber-50 px-2 py-1 rounded">
          {formatValue(condition.value)}
        </span>
      </div>

      {/* Formula (if present) */}
      {condition.formula && (
        <div className="mt-1">
          <span className="text-xs text-gray-500">Formula: </span>
          <code className="text-xs font-mono text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
            {condition.formula}
          </code>
        </div>
      )}

      {/* Table (if present) */}
      {condition.table && (
        <div className="mt-1">
          <span className="text-xs text-gray-500">Tabela: </span>
          <span className="text-xs font-mono text-gray-700">{condition.table}</span>
        </div>
      )}

      {/* Scale (if present) */}
      {condition.scale && condition.scale.length > 0 && (
        <div className="mt-1">
          <span className="text-xs text-gray-500">Escala: </span>
          <span className="text-xs text-gray-600">
            {condition.scale.join(" < ")}
          </span>
        </div>
      )}

      {/* Keys (if present) */}
      {condition.keys && condition.keys.length > 0 && (
        <div className="mt-1">
          <span className="text-xs text-gray-500">Chaves: </span>
          <span className="text-xs font-mono text-gray-600">
            {condition.keys.join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

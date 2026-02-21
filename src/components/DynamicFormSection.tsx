"use client";

import { useState, useMemo, useCallback } from "react";
import type { FieldMapping } from "@/lib/context-builder";
import { ChevronDown, ChevronUp, Check, AlertCircle, HelpCircle } from "lucide-react";

// ----------------------------------------------------------
// Types
// ----------------------------------------------------------

interface DynamicFormSectionProps {
  /** Field mappings for this specialty */
  fields: FieldMapping[];
  /** Current project data (dot-notation paths resolved against this) */
  values: Record<string, unknown>;
  /** Called when a field value changes: (fieldPath, value) */
  onChange: (fieldPath: string, value: unknown) => void;
  /** Plugin display name */
  pluginName?: string;
  /** Building type for filtering defaults */
  buildingType?: string;
  /** Whether to start expanded or collapsed */
  defaultExpanded?: boolean;
}

interface FieldGroup {
  name: string;
  fields: FieldMapping[];
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

/** Resolve a dot-notation path against an object */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Group fields by _group metadata, filtering out entries without a field property */
function groupFields(fields: FieldMapping[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  const groupMap = new Map<string, FieldMapping[]>();

  for (const field of fields) {
    // Skip _group separator entries that have no field path
    if (!field.field) continue;
    const groupName = (field as unknown as Record<string, unknown>)["_group"] as string ?? "Outros";
    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, []);
    }
    groupMap.get(groupName)!.push(field);
  }

  for (const [name, gFields] of groupMap) {
    groups.push({ name, fields: gFields });
  }

  return groups;
}

// ----------------------------------------------------------
// Component
// ----------------------------------------------------------

export default function DynamicFormSection({
  fields,
  values,
  onChange,
  pluginName,
  defaultExpanded = true,
}: DynamicFormSectionProps) {
  const groups = useMemo(() => groupFields(fields), [fields]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(defaultExpanded ? groups.map(g => g.name) : [])
  );

  const toggleGroup = useCallback((name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Only count fields with a valid field path
  const validFields = useMemo(() => fields.filter(f => f.field), [fields]);

  // Coverage stats for this section
  const stats = useMemo(() => {
    let populated = 0;
    let required = 0;
    let requiredPopulated = 0;
    for (const f of validFields) {
      const val = getNestedValue(values, f.field);
      const has = val !== undefined && val !== null && val !== "";
      if (has) populated++;
      if (f.required) {
        required++;
        if (has) requiredPopulated++;
      }
    }
    return { total: validFields.length, populated, required, requiredPopulated };
  }, [validFields, values]);

  if (validFields.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Section header with coverage */}
      {pluginName && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{pluginName}</h3>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              {stats.requiredPopulated === stats.required ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              )}
              {stats.requiredPopulated}/{stats.required} obrigatórios
            </span>
            <span>{stats.populated}/{stats.total} preenchidos</span>
            {/* Mini progress bar */}
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${stats.total > 0 ? (stats.populated / stats.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Field groups */}
      {groups.map(group => {
        const isExpanded = expandedGroups.has(group.name);
        const groupPopulated = group.fields.filter(
          f => {
            const v = getNestedValue(values, f.field);
            return v !== undefined && v !== null && v !== "";
          }
        ).length;

        return (
          <div key={group.name} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleGroup(group.name)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-sm font-medium text-gray-700">{group.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {groupPopulated}/{group.fields.length}
                </span>
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />
                }
              </div>
            </button>

            {isExpanded && (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.fields.map(field => (
                  <FieldInput
                    key={field.field}
                    mapping={field}
                    value={getNestedValue(values, field.field)}
                    onChange={val => onChange(field.field, val)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------
// Individual field renderer
// ----------------------------------------------------------

function FieldInput({
  mapping,
  value,
  onChange,
}: {
  mapping: FieldMapping;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { field, label, type, unit, options, required } = mapping;
  const description = (mapping as unknown as Record<string, unknown>).description as string | undefined;
  const tooltip = (mapping as unknown as Record<string, unknown>).tooltip as string | undefined;
  const min = (mapping as unknown as Record<string, unknown>).min as number | undefined;
  const max = (mapping as unknown as Record<string, unknown>).max as number | undefined;
  const [showTooltip, setShowTooltip] = useState(false);

  const id = `dynamic-${field.replace(/\./g, "-")}`;
  const hasValue = value !== undefined && value !== null && value !== "";
  const helpText = tooltip || description;

  const inputClasses = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent ${
    hasValue ? "border-gray-300" : "border-gray-200"
  }`;

  function renderFieldLabel(showUnit?: boolean) {
    return (
      <div className="flex items-center gap-1 mb-1">
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
          {showUnit && unit && <span className="text-gray-400 font-normal ml-1">({unit})</span>}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {helpText && (
          <button
            type="button"
            onClick={() => setShowTooltip(!showTooltip)}
            className="text-gray-400 hover:text-accent"
            title={helpText}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={id}
          checked={Boolean(value)}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
        />
        <label htmlFor={id} className="text-sm text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {helpText && (
          <button
            type="button"
            onClick={() => setShowTooltip(!showTooltip)}
            className="text-gray-400 hover:text-accent"
            title={helpText}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        )}
        {showTooltip && helpText && (
          <p className="text-xs text-gray-500 ml-6">{helpText}</p>
        )}
      </div>
    );
  }

  if (type === "select" && options) {
    return (
      <div>
        {renderFieldLabel()}
        {showTooltip && helpText && <p className="text-xs text-gray-500 mb-1">{helpText}</p>}
        <select
          id={id}
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value || undefined)}
          className={`${inputClasses} ${!hasValue ? "text-gray-400" : ""}`}
        >
          <option value="">-- Selecionar --</option>
          {options.map(opt => {
            const val = typeof opt === "string" ? opt : opt.value;
            const lbl = typeof opt === "string" ? opt : opt.label;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
      </div>
    );
  }

  if (type === "number") {
    return (
      <div>
        {renderFieldLabel(true)}
        {showTooltip && helpText && <p className="text-xs text-gray-500 mb-1">{helpText}</p>}
        <input
          type="number"
          id={id}
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={e => {
            const v = e.target.value;
            onChange(v === "" ? undefined : parseFloat(v));
          }}
          step="any"
          min={min}
          max={max}
          className={inputClasses}
          placeholder={unit ? `(${unit})` : undefined}
        />
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div className="sm:col-span-2 lg:col-span-3">
        {renderFieldLabel()}
        {showTooltip && helpText && <p className="text-xs text-gray-500 mb-1">{helpText}</p>}
        <textarea
          id={id}
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value || undefined)}
          rows={3}
          className={inputClasses}
        />
      </div>
    );
  }

  // Default: string
  return (
    <div>
      {renderFieldLabel()}
      {showTooltip && helpText && <p className="text-xs text-gray-500 mb-1">{helpText}</p>}
      <input
        type="text"
        id={id}
        value={String(value ?? "")}
        onChange={e => onChange(e.target.value || undefined)}
        className={inputClasses}
      />
    </div>
  );
}

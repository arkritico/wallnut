// ============================================================
// REGULATION INGESTION PIPELINE
// ============================================================
//
// Handles the workflow for adding new regulation documents:
//
// 1. REGISTER — Add the regulation document to the registry
// 2. INGEST   — Extract rules from the document (manual or LLM-assisted)
// 3. REVIEW   — Engineer reviews extracted rules
// 4. VERIFY   — Engineer marks rules as verified
// 5. ACTIVATE — Rules become part of the analysis
//
// For proprietary documents (IEC, IPQ), only the extracted rules
// are stored — never the source text. This respects copyright.
//

import type {
  RegulationDocument,
  DeclarativeRule,
  RuleCondition,
  IngestionJob,
  SourceType,
  LegalForce,
  IngestionStatus,
} from "./types";
import type { RegulationArea, Severity } from "../types";

// ----------------------------------------------------------
// Templates: Create regulation documents from minimal input
// ----------------------------------------------------------

/**
 * Create a new RegulationDocument from minimal metadata.
 * This is the first step when adding a new regulation.
 */
export function createRegulationDocument(params: {
  id: string;
  shortRef: string;
  title: string;
  effectiveDate: string;
  sourceType: SourceType;
  sourceUrl?: string;
  sourceFile?: string;
  legalForce: LegalForce;
  area: RegulationArea;
  tags?: string[];
  notes?: string;
}): RegulationDocument {
  return {
    id: params.id,
    shortRef: params.shortRef,
    title: params.title,
    status: "active",
    effectiveDate: params.effectiveDate,
    revocationDate: null,
    amendedBy: [],
    supersededBy: null,
    amends: [],
    sourceType: params.sourceType,
    sourceUrl: params.sourceUrl ?? null,
    sourceFile: params.sourceFile ?? null,
    legalForce: params.legalForce,
    area: params.area,
    ingestionStatus: "pending",
    ingestionDate: null,
    verifiedBy: null,
    rulesCount: 0,
    tags: params.tags ?? [],
    notes: params.notes ?? "",
  };
}

// ----------------------------------------------------------
// Rule Templates: Create rules from minimal input
// ----------------------------------------------------------

/**
 * Create a simple boolean check rule.
 * Example: "hasEarthingSystem must be true"
 */
export function createBooleanRule(params: {
  id: string;
  regulationId: string;
  article: string;
  field: string;
  expectedValue: boolean;
  description: string;
  severity: Severity;
  remediation: string;
  requiredValue?: string;
  tags?: string[];
}): DeclarativeRule {
  return {
    id: params.id,
    regulationId: params.regulationId,
    article: params.article,
    description: params.description,
    severity: params.severity,
    conditions: [
      {
        field: params.field,
        operator: params.expectedValue ? "not_exists" : "exists",
        value: null,
      },
    ],
    remediation: params.remediation,
    requiredValue: params.requiredValue,
    enabled: true,
    tags: params.tags ?? [],
  };
}

/**
 * Create a threshold comparison rule.
 * Example: "earthingResistance must be <= 20 Ohm"
 */
export function createThresholdRule(params: {
  id: string;
  regulationId: string;
  article: string;
  field: string;
  operator: ">" | ">=" | "<" | "<=" | "==" | "!=";
  threshold: number;
  description: string;
  severity: Severity;
  remediation: string;
  currentValueTemplate?: string;
  requiredValue?: string;
  tags?: string[];
}): DeclarativeRule {
  return {
    id: params.id,
    regulationId: params.regulationId,
    article: params.article,
    description: params.description,
    severity: params.severity,
    conditions: [
      {
        field: params.field,
        operator: params.operator,
        value: params.threshold,
      },
    ],
    remediation: params.remediation,
    currentValueTemplate: params.currentValueTemplate,
    requiredValue: params.requiredValue,
    enabled: true,
    tags: params.tags ?? [],
  };
}

// ----------------------------------------------------------
// Ingestion Job Management
// ----------------------------------------------------------

/**
 * Create a new ingestion job for processing a regulation document.
 */
export function createIngestionJob(
  regulationId: string,
  sourcePath: string,
  method: IngestionJob["method"] = "manual"
): IngestionJob {
  const now = new Date().toISOString();
  return {
    regulationId,
    sourcePath,
    method,
    status: "queued",
    pendingRules: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ----------------------------------------------------------
// PDF Processing Helpers
// ----------------------------------------------------------

/**
 * Basic instruction template for LLM-assisted rule extraction.
 * @deprecated Use generateExtractionPrompt() from prompt-generator.ts instead.
 * The new prompt generator creates per-sector prompts with:
 * - All 28 operators (not just basic comparison)
 * - Sector-specific fields from field-mappings.json
 * - Existing rule examples for style guidance
 * - Lookup table references
 */
export const RULE_EXTRACTION_PROMPT = `
Analisa o seguinte texto de regulamento português e extrai regras verificáveis.

Para cada requisito que possa ser verificado num projeto de construção, cria uma regra com:
- id: Identificador único (formato: "{REGULAMENTO}-{SECÇÃO}-{NN}")
- article: Referência ao artigo/secção específica
- description: Descrição em português do requisito (pode usar {campo} para interpolação)
- severity: "critical" (obrigatório legal), "warning" (recomendado/boas práticas), "info" (informativo)
- conditions: Condições que devem ser verdadeiras para esta regra disparar
  - field: Caminho para o campo do projeto (e.g., "electrical.contractedPower")
  - operator: ">", ">=", "<", "<=", "==", "!=", "exists", "not_exists"
  - value: Valor de comparação
- remediation: Texto de orientação para corrigir a não-conformidade
- requiredValue: Valor exigido pelo regulamento

Campos disponíveis no modelo de projeto:
- electrical.supplyType ("single_phase" | "three_phase")
- electrical.contractedPower (number, kVA)
- electrical.hasResidualCurrentDevice (boolean)
- electrical.rcdSensitivity (number, mA)
- electrical.hasEarthingSystem (boolean)
- electrical.earthingResistance (number, Ohms)
- electrical.hasEquipotentialBonding (boolean)
- electrical.hasMainCircuitBreaker (boolean)
- electrical.hasIndividualCircuitProtection (boolean)
- electrical.hasSurgeProtection (boolean)
- electrical.numberOfCircuits (number)
- electrical.hasBathroomZoneCompliance (boolean)
- electrical.hasSeparateLightingCircuits (boolean)
- electrical.hasSeparateSocketCircuits (boolean)
- electrical.hasDedicatedApplianceCircuits (boolean)
- electrical.hasSchematicDiagram (boolean)
- electrical.hasDistributionBoardLabelling (boolean)
- electrical.hasEVCharging (boolean)
- electrical.hasOutdoorIPProtection (boolean)
- electrical.hasProjectApproval (boolean)
- isRehabilitation (boolean)
- buildingType ("residential" | "commercial" | "mixed" | "industrial")
- grossFloorArea (number, m²)
- numberOfFloors (number)
- numberOfDwellings (number)

Responde APENAS com JSON válido no formato:
{
  "rules": [
    {
      "id": "...",
      "regulationId": "...",
      "article": "...",
      "description": "...",
      "severity": "...",
      "conditions": [{ "field": "...", "operator": "...", "value": ... }],
      "remediation": "...",
      "requiredValue": "...",
      "enabled": true,
      "tags": ["..."]
    }
  ]
}
`.trim();

/** All valid operators supported by the rule engine */
const ALL_VALID_OPERATORS = new Set([
  // Direct comparison
  ">", ">=", "<", "<=", "==", "!=",
  // Existence
  "exists", "not_exists",
  // Set membership
  "in", "not_in", "between", "not_in_range",
  // Lookup table
  "lookup_gt", "lookup_gte", "lookup_lt", "lookup_lte", "lookup_eq", "lookup_neq",
  // Ordinal
  "ordinal_lt", "ordinal_lte", "ordinal_gt", "ordinal_gte",
  // Formula
  "formula_gt", "formula_gte", "formula_lt", "formula_lte",
  // Computed
  "computed_lt", "computed_lte", "computed_gt", "computed_gte",
  // Fire reaction class
  "reaction_class_lt", "reaction_class_lte", "reaction_class_gt", "reaction_class_gte",
]);

/** Operators that require numeric values */
const NUMERIC_VALUE_OPERATORS = new Set([">", ">=", "<", "<="]);
/** Operators that require array values */
const ARRAY_VALUE_OPERATORS = new Set(["in", "not_in", "between", "not_in_range"]);
/** Operators that require a lookup table reference */
const LOOKUP_OPERATORS = new Set(["lookup_gt", "lookup_gte", "lookup_lt", "lookup_lte", "lookup_eq", "lookup_neq"]);
/** Operators that require an ordinal scale */
const ORDINAL_OPERATORS = new Set(["ordinal_lt", "ordinal_lte", "ordinal_gt", "ordinal_gte"]);
/** Operators that require a formula string as value */
const FORMULA_OPERATORS = new Set(["formula_gt", "formula_gte", "formula_lt", "formula_lte"]);
/** Operators that use the condition.formula field */
const COMPUTED_OPERATORS = new Set(["computed_lt", "computed_lte", "computed_gt", "computed_gte"]);

/**
 * Validate a single condition against the operator schema.
 */
function validateCondition(c: RuleCondition, index: number): string[] {
  const errors: string[] = [];
  const prefix = `conditions[${index}]`;

  if (!c.field) errors.push(`${prefix}: missing field path`);
  if (!c.operator) {
    errors.push(`${prefix}: missing operator`);
    return errors;
  }
  if (!ALL_VALID_OPERATORS.has(c.operator)) {
    errors.push(`${prefix}: invalid operator "${c.operator}"`);
    return errors;
  }

  // Type-check value based on operator
  if (NUMERIC_VALUE_OPERATORS.has(c.operator)) {
    if (typeof c.value !== "number") {
      errors.push(`${prefix}: operator "${c.operator}" requires numeric value, got ${typeof c.value}`);
    }
  }

  if (ARRAY_VALUE_OPERATORS.has(c.operator)) {
    if (!Array.isArray(c.value)) {
      errors.push(`${prefix}: operator "${c.operator}" requires array value`);
    } else if ((c.operator === "between" || c.operator === "not_in_range") && c.value.length !== 2) {
      errors.push(`${prefix}: operator "${c.operator}" requires array of exactly 2 elements [min, max]`);
    }
  }

  if (LOOKUP_OPERATORS.has(c.operator)) {
    if (!c.table) {
      errors.push(`${prefix}: lookup operator "${c.operator}" requires "table" field`);
    }
  }

  if (ORDINAL_OPERATORS.has(c.operator)) {
    if (!c.scale || !Array.isArray(c.scale) || c.scale.length < 2) {
      errors.push(`${prefix}: ordinal operator "${c.operator}" requires "scale" array with at least 2 elements`);
    }
  }

  if (FORMULA_OPERATORS.has(c.operator)) {
    if (typeof c.value !== "string" || !c.value.trim()) {
      errors.push(`${prefix}: formula operator "${c.operator}" requires a formula string as value`);
    }
  }

  if (COMPUTED_OPERATORS.has(c.operator)) {
    const formula = (c as unknown as { formula?: string }).formula;
    if (!formula || typeof formula !== "string") {
      errors.push(`${prefix}: computed operator "${c.operator}" requires a "formula" field`);
    }
  }

  return errors;
}

export interface ValidationOptions {
  /** Set of valid field paths to check against (from field-mappings) */
  validFields?: Set<string>;
  /** Set of valid lookup table IDs */
  validTables?: Set<string>;
  /** Set of valid regulation IDs */
  validRegulationIds?: Set<string>;
}

/**
 * Validate extracted rules against the full schema.
 * Returns errors found in the rules.
 *
 * Enhanced validation includes:
 * - All 28 operator types
 * - Value type checking per operator
 * - Lookup table reference validation
 * - Ordinal scale validation
 * - Formula expression validation
 * - Field path validation (when validFields provided)
 * - Duplicate detection
 */
export function validateExtractedRules(
  rules: DeclarativeRule[],
  options?: ValidationOptions,
): { ruleId: string; errors: string[]; warnings: string[] }[] {
  const issues: { ruleId: string; errors: string[]; warnings: string[] }[] = [];
  const seenIds = new Set<string>();

  for (const rule of rules) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!rule.id) errors.push("Missing rule ID");
    if (seenIds.has(rule.id)) errors.push(`Duplicate rule ID: ${rule.id}`);
    seenIds.add(rule.id);

    if (!rule.regulationId) errors.push("Missing regulationId");
    if (!rule.article) errors.push("Missing article reference");
    if (!rule.description) errors.push("Missing description");

    if (!["critical", "warning", "info", "pass"].includes(rule.severity)) {
      errors.push(`Invalid severity: "${rule.severity}"`);
    }

    // Conditions validation
    if (!rule.conditions || rule.conditions.length === 0) {
      errors.push("No conditions defined");
    } else {
      for (let i = 0; i < rule.conditions.length; i++) {
        errors.push(...validateCondition(rule.conditions[i], i));

        // Field path validation
        if (options?.validFields && rule.conditions[i].field) {
          const field = rule.conditions[i].field;
          if (!field.startsWith("computed.") && !options.validFields.has(field)) {
            warnings.push(`conditions[${i}]: field "${field}" not found in field-mappings`);
          }
        }

        // Lookup table validation
        if (options?.validTables && rule.conditions[i].table) {
          if (!options.validTables.has(rule.conditions[i].table!)) {
            warnings.push(`conditions[${i}]: table "${rule.conditions[i].table}" not found in lookup-tables`);
          }
        }
      }
    }

    // Exclusions validation (same as conditions)
    if (rule.exclusions) {
      for (let i = 0; i < rule.exclusions.length; i++) {
        const excErrors = validateCondition(rule.exclusions[i], i);
        errors.push(...excErrors.map(e => e.replace("conditions[", "exclusions[")));
      }
    }

    // Regulation ID validation
    if (options?.validRegulationIds && rule.regulationId) {
      if (!options.validRegulationIds.has(rule.regulationId)) {
        warnings.push(`regulationId "${rule.regulationId}" not found in registry`);
      }
    }

    if (!rule.remediation) errors.push("Missing remediation guidance");

    // Quality warnings
    if (rule.description && rule.description.length < 10) {
      warnings.push("Description is very short — consider adding more detail");
    }
    if (rule.tags && rule.tags.length === 0) {
      warnings.push("No tags defined — consider adding relevant keywords");
    }
    if (rule.enabled === undefined) {
      warnings.push("'enabled' field not set — will default to undefined (falsy)");
    }

    if (errors.length > 0 || warnings.length > 0) {
      issues.push({ ruleId: rule.id, errors, warnings });
    }
  }

  return issues;
}

// ----------------------------------------------------------
// Workflow Summary
// ----------------------------------------------------------

/**
 * Generates a human-readable summary of the ingestion workflow
 * for a regulation document.
 *
 * This is useful for documentation and for guiding engineers
 * through the process of adding new regulations.
 */
export function getIngestionWorkflowGuide(sourceType: SourceType): string {
  switch (sourceType) {
    case "public_dre":
      return `
## Fluxo de Ingestão — Regulamento Público (DRE)

1. **Obter PDF**: Descarregar do Diário da República
2. **Colocar na pasta**: src/data/plugins/<especialidade>/regulations/sources/
3. **Registar no registry.json**: Adicionar entrada com sourceType "public_dre"
4. **Extrair regras**:
   - Opção A: Manualmente, criando rules.json
   - Opção B: Usando o prompt LLM com o texto do regulamento
5. **Validar**: Verificar regras com validateExtractedRules()
6. **Rever**: Engenheiro revê cada regra extraída
7. **Verificar**: Marcar ingestionStatus como "verified"
`;

    case "proprietary_iec":
    case "proprietary_ipq":
    case "proprietary_en":
      return `
## Fluxo de Ingestão — Norma Proprietária (IEC/IPQ/EN)

⚠️  O texto integral da norma NÃO pode ser incluído no código-fonte.
    Apenas os requisitos verificáveis, expressos como regras, são armazenados.

1. **Adquirir norma**: Via webstore IEC, IPQ, ou CEN
2. **Colocar PDF na pasta local** (gitignored):
   src/data/plugins/<especialidade>/regulations/sources/
3. **Registar no registry.json**: Adicionar com sourceType "proprietary_iec"
4. **Extrair regras manualmente**:
   - Ler a norma e identificar requisitos verificáveis
   - Para cada requisito, criar uma regra em rules.json
   - A regra contém apenas: condição + threshold + descrição + remediação
   - NUNCA copiar texto integral da norma
5. **Validar e verificar**: Como nos regulamentos públicos
6. **Adicionar ao .gitignore**: O ficheiro PDF (source.pdf) deve estar em .gitignore
`;

    case "public_operator":
      return `
## Fluxo de Ingestão — Documentação de Operador (E-REDES, REN, ERSE)

1. **Obter documento**: Descarregar do site do operador
2. **Atenção à versão**: Estes documentos são actualizados frequentemente
3. **Registar no registry.json**: Incluir URL e data de versão
4. **Extrair regras**: Focando nos requisitos técnicos verificáveis
5. **Monitorizar actualizações**: Verificar periodicamente se há nova versão
6. **Quando actualizar**: Usar supersedeRegulation() para substituir a versão antiga
`;

    default:
      return `
## Fluxo de Ingestão — Documento Genérico

1. Obter e colocar na pasta de sources
2. Registar no registry.json
3. Extrair regras (manual ou LLM)
4. Validar e verificar
`;
  }
}

// ============================================================
// EXTRACTION PROMPT GENERATOR — Per-sector LLM prompts
// ============================================================
//
// Generates self-contained prompts for extracting regulation rules
// from Portuguese legal documents. Each prompt is tailored to a
// specific plugin/sector using its field-mappings, existing rules
// as examples, and the full operator catalog.
//
// Usage:
//   import { generateExtractionPrompt } from "./prompt-generator";
//   const prompt = generateExtractionPrompt("electrical");
//   // Copy this prompt + paste regulation text into a separate Claude instance
//
// CLI:
//   npx tsx scripts/generate-extraction-prompts.ts [--plugin <id>] [--all]
//

import { getFieldMappingsByPlugin, getAvailablePlugins } from "./loader";
import type { SpecialtyPlugin, DeclarativeRule, RuleCondition, LookupTable } from "./types";

// ----------------------------------------------------------
// Operator catalog with examples
// ----------------------------------------------------------

interface OperatorDoc {
  op: string;
  description: string;
  example: RuleCondition;
  notes?: string;
}

const OPERATOR_CATALOG: OperatorDoc[] = [
  // Direct comparison
  { op: ">", description: "Maior que (number)", example: { field: "electrical.contractedPower", operator: ">", value: 13.8 } },
  { op: ">=", description: "Maior ou igual (number)", example: { field: "numberOfFloors", operator: ">=", value: 4 } },
  { op: "<", description: "Menor que (number)", example: { field: "thermal.uValueWalls", operator: "<", value: 0.5 } },
  { op: "<=", description: "Menor ou igual (number)", example: { field: "acoustic.dntw", operator: "<=", value: 50 } },
  { op: "==", description: "Igual a (string/number/boolean)", example: { field: "buildingType", operator: "==", value: "residential" } },
  { op: "!=", description: "Diferente de", example: { field: "electrical.supplyType", operator: "!=", value: "three_phase" } },
  // Existence
  { op: "exists", description: "Campo existe e é verdadeiro (truthy)", example: { field: "fireSafety.hasFireAlarm", operator: "exists", value: null } },
  { op: "not_exists", description: "Campo não existe, é falso ou vazio", example: { field: "electrical.hasEarthingSystem", operator: "not_exists", value: null } },
  // Set membership
  { op: "in", description: "Valor está numa lista", example: { field: "buildingType", operator: "in", value: ["residential", "mixed"] } },
  { op: "not_in", description: "Valor não está numa lista", example: { field: "fireSafety.riskCategory", operator: "not_in", value: ["1", "2"] } },
  { op: "between", description: "Valor entre [min, max] inclusive", example: { field: "grossFloorArea", operator: "between", value: [50, 200] } },
  { op: "not_in_range", description: "Valor fora do intervalo [min, max]", example: { field: "electrical.rcdSensitivity", operator: "not_in_range", value: [10, 30] } },
  // Lookup table
  { op: "lookup_gt", description: "Campo > valor da tabela de consulta", example: { field: "thermal.uValueWalls", operator: "lookup_gt", value: null, table: "u_value_limits", keys: ["location.climateZoneWinter"] }, notes: "Requer 'table' e opcionalmente 'keys'" },
  { op: "lookup_gte", description: "Campo >= valor da tabela", example: { field: "fireSafety.fireResistance", operator: "lookup_gte", value: null, table: "fire_resistance" } },
  { op: "lookup_lt", description: "Campo < valor da tabela", example: { field: "acoustic.dntw", operator: "lookup_lt", value: null, table: "acoustic_limits" } },
  { op: "lookup_lte", description: "Campo <= valor da tabela", example: { field: "structural.soilFactor", operator: "lookup_lte", value: null, table: "soil_factors" } },
  { op: "lookup_eq", description: "Campo == valor da tabela (string/boolean)", example: { field: "fireSafety.hasDetection", operator: "lookup_eq", value: null, table: "detection_requirements" } },
  { op: "lookup_neq", description: "Campo != valor da tabela", example: { field: "gas.ventilationType", operator: "lookup_neq", value: null, table: "ventilation_types" } },
  // Ordinal
  { op: "ordinal_lt", description: "Campo classifica-se abaixo do limiar numa escala ordenada", example: { field: "energy.energyClass", operator: "ordinal_lt", value: "B-", scale: ["A+", "A", "B", "B-", "C", "D", "E", "F"] }, notes: "Requer 'scale' — array ordenado do melhor para o pior" },
  { op: "ordinal_lte", description: "Campo classifica-se no limiar ou abaixo", example: { field: "energy.energyClass", operator: "ordinal_lte", value: "C" } },
  { op: "ordinal_gt", description: "Campo classifica-se acima do limiar", example: { field: "acoustic.comfortClass", operator: "ordinal_gt", value: "D" } },
  { op: "ordinal_gte", description: "Campo classifica-se no limiar ou acima", example: { field: "accessibility.accessLevel", operator: "ordinal_gte", value: "AA" } },
  // Formula
  { op: "formula_gt", description: "Campo > resultado de uma fórmula (expressão JS)", example: { field: "electrical.numberOfCircuits", operator: "formula_gt", value: "grossFloorArea / 20 + 2" }, notes: "O 'value' é uma expressão que acede aos campos do projeto" },
  { op: "formula_gte", description: "Campo >= fórmula", example: { field: "fireSafety.exitWidth", operator: "formula_gte", value: "occupancy * 0.01" } },
  { op: "formula_lt", description: "Campo < fórmula", example: { field: "thermal.solarGain", operator: "formula_lt", value: "usableFloorArea * 0.15" } },
  { op: "formula_lte", description: "Campo <= fórmula", example: { field: "energy.ntc", operator: "formula_lte", value: "energy.nt * 1.0" } },
  // Computed (formula in separate field)
  { op: "computed_lt", description: "Como formula_lt mas fórmula no campo 'formula'", example: { field: "plumbing.pipeSize", operator: "computed_lt", value: null, formula: "waterDrainage.peakFlow * 0.5 + 15" } as unknown as RuleCondition, notes: "Útil quando o 'value' precisa ser null e a fórmula é complexa" },
  { op: "computed_lte", description: "Campo <= fórmula (no campo 'formula')", example: { field: "electrical.circuitCurrent", operator: "computed_lte", value: null } as unknown as RuleCondition },
  { op: "computed_gt", description: "Campo > fórmula (no campo 'formula')", example: { field: "hvac.airflow", operator: "computed_gt", value: null } as unknown as RuleCondition },
  { op: "computed_gte", description: "Campo >= fórmula (no campo 'formula')", example: { field: "structural.loadCapacity", operator: "computed_gte", value: null } as unknown as RuleCondition },
  // Fire reaction class
  { op: "reaction_class_lt", description: "Euroclasse de reação ao fogo pior que o limiar (A1=melhor, F=pior)", example: { field: "fireSafety.wallReactionClass", operator: "reaction_class_lt", value: "C" }, notes: "Escala: A1, A2, B, C, D, E, F, CFL-s1, CFL-s2, DFL-s1, EFL, FFL" },
  { op: "reaction_class_lte", description: "Euroclasse igual ou pior", example: { field: "fireSafety.floorReactionClass", operator: "reaction_class_lte", value: "DFL-s1" } },
  { op: "reaction_class_gt", description: "Euroclasse melhor que o limiar", example: { field: "fireSafety.ceilingReactionClass", operator: "reaction_class_gt", value: "D" } },
  { op: "reaction_class_gte", description: "Euroclasse igual ou melhor", example: { field: "fireSafety.facadeReactionClass", operator: "reaction_class_gte", value: "B" } },
];

// ----------------------------------------------------------
// Field formatter
// ----------------------------------------------------------

interface FieldInfo {
  field: string;
  label: string;
  type: string;
  unit?: string;
  options?: Array<{ value: string; label: string }>;
  description?: string;
}

function formatFieldList(fields: FieldInfo[]): string {
  const lines: string[] = [];
  let currentGroup = "";

  for (const f of fields) {
    const group = (f as unknown as Record<string, string>)._group ?? "";
    if (group && group !== currentGroup) {
      currentGroup = group;
      lines.push(`\n  ### ${group}`);
    }

    let line = `  - \`${f.field}\``;
    if (f.type === "select" && f.options) {
      const opts = f.options.map(o => `"${o.value}"`).join(" | ");
      line += ` (${opts})`;
    } else if (f.type === "boolean") {
      line += ` (boolean)`;
    } else if (f.type === "number") {
      line += ` (number${f.unit ? `, ${f.unit}` : ""})`;
    } else {
      line += ` (${f.type})`;
    }
    if (f.description) {
      line += ` — ${f.description}`;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

// ----------------------------------------------------------
// Example rules formatter
// ----------------------------------------------------------

function formatExampleRules(rules: DeclarativeRule[], maxExamples = 5): string {
  // Pick diverse examples: different severities, different operator types
  const seen = new Set<string>();
  const examples: DeclarativeRule[] = [];

  // Priority: one critical, one warning, one with lookup, one with formula, one with exists
  const priorities = [
    (r: DeclarativeRule) => r.severity === "critical" && !seen.has("critical"),
    (r: DeclarativeRule) => r.conditions.some(c => c.operator.startsWith("lookup_")) && !seen.has("lookup"),
    (r: DeclarativeRule) => r.conditions.some(c => c.operator.startsWith("formula_")) && !seen.has("formula"),
    (r: DeclarativeRule) => r.conditions.some(c => c.operator === "exists" || c.operator === "not_exists") && !seen.has("exists"),
    (r: DeclarativeRule) => r.severity === "warning" && !seen.has("warning"),
    (r: DeclarativeRule) => r.conditions.length >= 2 && !seen.has("multi"),
  ];

  for (const pred of priorities) {
    if (examples.length >= maxExamples) break;
    const match = rules.find(r => r.enabled && pred(r) && !examples.includes(r));
    if (match) {
      examples.push(match);
      if (match.severity === "critical") seen.add("critical");
      if (match.severity === "warning") seen.add("warning");
      if (match.conditions.some(c => c.operator.startsWith("lookup_"))) seen.add("lookup");
      if (match.conditions.some(c => c.operator.startsWith("formula_"))) seen.add("formula");
      if (match.conditions.some(c => c.operator === "exists" || c.operator === "not_exists")) seen.add("exists");
      if (match.conditions.length >= 2) seen.add("multi");
    }
  }

  // Fill remaining slots with diverse rules
  for (const rule of rules) {
    if (examples.length >= maxExamples) break;
    if (rule.enabled && !examples.includes(rule)) {
      examples.push(rule);
    }
  }

  return JSON.stringify(examples.map(r => ({
    id: r.id,
    regulationId: r.regulationId,
    article: r.article,
    description: r.description,
    severity: r.severity,
    conditions: r.conditions,
    ...(r.exclusions?.length ? { exclusions: r.exclusions } : {}),
    remediation: r.remediation,
    ...(r.currentValueTemplate ? { currentValueTemplate: r.currentValueTemplate } : {}),
    ...(r.requiredValue ? { requiredValue: r.requiredValue } : {}),
    enabled: true,
    tags: r.tags,
  })), null, 2);
}

// ----------------------------------------------------------
// Lookup tables summary
// ----------------------------------------------------------

function formatLookupTablesSummary(tables: LookupTable[]): string {
  if (!tables.length) return "  (nenhuma tabela de consulta definida para esta especialidade)";
  return tables.map(t =>
    `  - \`${t.id}\` — ${t.description} (keys: ${t.keys.map(k => `\`${k}\``).join(", ")})`
  ).join("\n");
}

// ----------------------------------------------------------
// Regulation registry summary
// ----------------------------------------------------------

function formatRegistrySummary(plugin: SpecialtyPlugin): string {
  const lines: string[] = [];
  for (const reg of plugin.regulations) {
    const status = reg.ingestionStatus === "verified" ? "verified"
      : reg.ingestionStatus === "complete" ? "complete"
      : reg.ingestionStatus === "partial" ? "PARTIAL"
      : "PENDING";
    lines.push(`  - **${reg.shortRef}** — ${reg.title} [${status}, ${reg.rulesCount} rules]`);
  }
  return lines.join("\n");
}

// ----------------------------------------------------------
// Main prompt generator
// ----------------------------------------------------------

export interface PromptGeneratorOptions {
  /** Plugin ID to generate prompt for */
  pluginId: string;
  /** Target regulation ID (if extracting from a specific regulation) */
  targetRegulationId?: string;
  /** Target regulation short reference */
  targetRegulationRef?: string;
  /** Maximum example rules to include */
  maxExamples?: number;
  /** Include the full operator catalog (default: true) */
  includeOperatorCatalog?: boolean;
  /** Include lookup table examples (default: true) */
  includeLookupTables?: boolean;
}

/**
 * Generate a complete, self-contained extraction prompt for a specific sector.
 * The returned prompt can be pasted into a separate Claude instance along with
 * the regulation text to extract structured rules.
 */
export function generateExtractionPrompt(options: PromptGeneratorOptions): string {
  const {
    pluginId,
    targetRegulationId,
    targetRegulationRef,
    maxExamples = 5,
    includeOperatorCatalog = true,
    includeLookupTables = true,
  } = options;

  // Load plugin
  const plugins = getAvailablePlugins();
  const plugin = plugins.find(p => p.id === pluginId);
  if (!plugin) {
    throw new Error(`Plugin "${pluginId}" not found. Available: ${plugins.map(p => p.id).join(", ")}`);
  }

  // Load field mappings
  const mappingsByPlugin = getFieldMappingsByPlugin();
  const pluginMappings = mappingsByPlugin[pluginId];
  const fields: FieldInfo[] = pluginMappings?.fields?.map(f => ({
    field: f.field,
    label: (f as unknown as Record<string, string>).label ?? f.field,
    type: (f as unknown as Record<string, string>).type ?? "string",
    unit: (f as unknown as Record<string, string>).unit,
    options: (f as unknown as Record<string, unknown>).options as FieldInfo["options"],
    description: (f as unknown as Record<string, string>).description,
    _group: (f as unknown as Record<string, string>)._group,
  } as unknown as FieldInfo)) ?? [];

  // Also include common project fields that are available across all plugins
  const generalMappings = mappingsByPlugin["general"];
  const commonFields: FieldInfo[] = generalMappings?.fields?.map(f => ({
    field: f.field,
    label: (f as unknown as Record<string, string>).label ?? f.field,
    type: (f as unknown as Record<string, string>).type ?? "string",
    unit: (f as unknown as Record<string, string>).unit,
    options: (f as unknown as Record<string, unknown>).options as FieldInfo["options"],
    description: (f as unknown as Record<string, string>).description,
    _group: (f as unknown as Record<string, string>)._group,
  } as unknown as FieldInfo)) ?? [];

  // Build regulation context
  const regTarget = targetRegulationRef
    ? `do regulamento **${targetRegulationRef}**`
    : `da especialidade **${plugin.name}**`;

  const regIdInstruction = targetRegulationId
    ? `Usa \`"regulationId": "${targetRegulationId}"\` para todas as regras.`
    : `Usa o ID do regulamento em formato kebab-case (ex: "dl-220-2008", "portaria-949a-2006").`;

  // Rule ID prefix
  const prefix = targetRegulationId
    ? targetRegulationId.toUpperCase().replace(/-/g, "_")
    : pluginId.toUpperCase().replace(/-/g, "_");

  // Build sections
  const sections: string[] = [];

  // Header
  sections.push(`# Extração de Regras — ${plugin.name}

Analisa o texto regulamentar ${regTarget} e extrai **todas** as regras verificáveis num projeto de construção português.

> **IMPORTANTE**: Responde APENAS com JSON válido. Não incluas comentários, explicações ou markdown.
> O JSON deve seguir exatamente o schema abaixo.`);

  // Rule schema
  sections.push(`## Schema da Regra

\`\`\`json
{
  "id": "${prefix}-NNN",
  "regulationId": "<id-do-regulamento>",
  "article": "Art. X.º, n.º Y",
  "description": "Descrição em português do requisito. Pode usar {campo} para interpolação.",
  "severity": "critical | warning | info",
  "conditions": [
    { "field": "namespace.campo", "operator": "<operador>", "value": <valor> }
  ],
  "exclusions": [],
  "remediation": "Orientação para corrigir a não-conformidade.",
  "currentValueTemplate": "{namespace.campo} (opcional, usa interpolação)",
  "requiredValue": "Valor exigido pelo regulamento (opcional)",
  "enabled": true,
  "tags": ["tag1", "tag2"]
}
\`\`\`

### Regras de preenchimento:

- **id**: Formato \`${prefix}-NNN\` com numeração sequencial (001, 002, ...).
  ${regIdInstruction}
- **article**: Referência precisa ao artigo/secção/alínea do regulamento.
- **description**: Em português, descreve o requisito de forma verificável. Usa \`{campo}\` para interpolar valores do projeto (ex: "A potência contratada ({electrical.contractedPower} kVA) excede o limite").
- **severity**:
  - \`"critical"\` — Obrigatório por lei; incumprimento impede licenciamento
  - \`"warning"\` — Boas práticas ou recomendações normativas
  - \`"info"\` — Informativo; sem impacto no licenciamento
- **conditions**: Array de condições que devem ser TODAS verdadeiras para a regra disparar. A regra dispara quando o projeto está em incumprimento (não quando está conforme).
- **exclusions**: Array de condições de exclusão (qualquer verdadeira = regra não se aplica). Usar para exceções explícitas no regulamento.
- **remediation**: Em português, orientação concreta para corrigir.
- **tags**: Palavras-chave relevantes (em português).`);

  // Severity guidance
  sections.push(`## Critérios de Severidade

| Severidade | Quando usar | Exemplos |
|------------|-------------|----------|
| \`critical\` | Requisito legal obrigatório (DL, Portaria, Lei). Incumprimento impede licenciamento ou constitui infração. | "deve", "é obrigatório", "não é permitido" |
| \`warning\` | Boas práticas, normas técnicas (NP, EN), ou requisitos que permitem alternativas. | "recomenda-se", "preferencialmente", regras de cálculo com tolerâncias |
| \`info\` | Informativo, referências cruzadas, ou requisitos sem impacto direto no licenciamento. | "nota", "para informação", condições já verificadas por outra regra |`);

  // Available fields
  sections.push(`## Campos Disponíveis — ${plugin.name}

Estes são os campos que as condições das regras podem referenciar:

${formatFieldList(fields)}

### Campos Comuns (disponíveis em todas as especialidades)

${formatFieldList(commonFields)}`);

  // Operator catalog
  if (includeOperatorCatalog) {
    const opLines = OPERATOR_CATALOG.map(o => {
      let line = `| \`${o.op}\` | ${o.description} | \`${JSON.stringify(o.example)}\` |`;
      if (o.notes) line += ` ${o.notes}`;
      return line;
    });

    sections.push(`## Operadores Disponíveis

| Operador | Descrição | Exemplo |
|----------|-----------|---------|
${opLines.join("\n")}

### Notas sobre operadores:

- **Comparação direta** (\`>\`, \`>=\`, \`<\`, \`<=\`, \`==\`, \`!=\`): Para a maioria das regras com limiares fixos.
- **Existência** (\`exists\`, \`not_exists\`): Para verificar se um campo obrigatório foi preenchido.
- **Tabelas de consulta** (\`lookup_*\`): Quando o limiar depende de variáveis do projeto (zona climática, tipo de edifício, etc.). Requer campo \`"table"\` e opcionalmente \`"keys"\`.
- **Fórmulas** (\`formula_*\`): Quando o limiar é calculado a partir de outros campos. O \`"value"\` contém uma expressão JavaScript (ex: \`"grossFloorArea / 20 + 2"\`).
- **Ordinal** (\`ordinal_*\`): Para escalas ordenadas (classes energéticas, classificações). Requer campo \`"scale"\`.
- **Reação ao fogo** (\`reaction_class_*\`): Para Euroclasses de reação ao fogo (A1=melhor, F=pior).

**Regra de ouro**: Se o regulamento diz "deve ser pelo menos X", a regra que deteta incumprimento é \`campo < X\` (ou \`campo "not_exists"\` se o campo pode não estar preenchido).`);
  }

  // Lookup tables
  if (includeLookupTables && plugin.lookupTables?.length) {
    sections.push(`## Tabelas de Consulta Existentes

As seguintes tabelas já estão definidas e podem ser referenciadas nas condições:

${formatLookupTablesSummary(plugin.lookupTables)}

Para referenciá-las, usa:
\`\`\`json
{ "field": "campo.a.verificar", "operator": "lookup_gte", "value": null, "table": "id_da_tabela" }
\`\`\`

Se precisares de uma nova tabela, indica-o num campo \`"_newTable"\` no topo do JSON:
\`\`\`json
{
  "_newTables": [
    {
      "id": "nome_da_tabela",
      "description": "Descrição da tabela",
      "keys": ["campo.chave1", "campo.chave2"],
      "values": { "valor1": { "valor2": 123 } }
    }
  ],
  "rules": [...]
}
\`\`\``);
  }

  // Current regulation status
  sections.push(`## Estado Atual — ${plugin.name}

Regulamentos registados nesta especialidade:

${formatRegistrySummary(plugin)}

Total: ${plugin.rules.length} regras existentes.`);

  // Example rules
  if (plugin.rules.length > 0) {
    sections.push(`## Exemplos de Regras Existentes

Estas são regras já extraídas para esta especialidade. Segue o mesmo estilo e nível de detalhe:

\`\`\`json
${formatExampleRules(plugin.rules, maxExamples)}
\`\`\``);
  }

  // Output format
  sections.push(`## Formato de Resposta

Responde APENAS com um objeto JSON válido:

\`\`\`json
{
  "regulationRef": "<id-do-regulamento>",
  "description": "Regras extraídas de <referência curta do regulamento>",
  "extractedBy": "claude-extraction",
  "extractedAt": "${new Date().toISOString().slice(0, 10)}",
  "rules": [
    { ... },
    { ... }
  ]
}
\`\`\`

### Checklist antes de responder:

- [ ] Cada regra tem ID único no formato \`${prefix}-NNN\`
- [ ] Cada regra referencia o artigo/secção exata do regulamento
- [ ] Os campos usados existem na lista acima
- [ ] Os operadores são válidos (consulta a tabela de operadores)
- [ ] As regras detetam **incumprimento** (não conformidade)
- [ ] A severidade está correta (critical = lei, warning = norma, info = informativo)
- [ ] A remediação é concreta e em português
- [ ] Não há regras duplicadas
- [ ] Tags são palavras-chave relevantes em português`);

  // Final instruction
  sections.push(`---

**Cola o texto do regulamento abaixo desta linha e responde com o JSON das regras extraídas.**`);

  return sections.join("\n\n");
}

/**
 * Generate extraction prompts for all plugins.
 * Returns a Map of pluginId -> prompt text.
 */
export function generateAllExtractionPrompts(
  options?: Partial<Omit<PromptGeneratorOptions, "pluginId">>
): Map<string, string> {
  const plugins = getAvailablePlugins();
  const prompts = new Map<string, string>();

  for (const plugin of plugins) {
    try {
      const prompt = generateExtractionPrompt({
        pluginId: plugin.id,
        ...options,
      });
      prompts.set(plugin.id, prompt);
    } catch (e) {
      console.error(`Error generating prompt for ${plugin.id}:`, e);
    }
  }

  return prompts;
}

/**
 * Get a summary of all plugins with their current state,
 * useful for building an extraction roadmap.
 */
export function getExtractionRoadmap(): ExtractionRoadmapEntry[] {
  const plugins = getAvailablePlugins();
  const mappings = getFieldMappingsByPlugin();

  return plugins.map(plugin => {
    const totalRegs = plugin.regulations.length;
    const pendingRegs = plugin.regulations.filter(
      r => r.ingestionStatus === "pending" || r.ingestionStatus === "partial"
    );
    const verifiedRegs = plugin.regulations.filter(r => r.ingestionStatus === "verified");
    const completeRegs = plugin.regulations.filter(r => r.ingestionStatus === "complete");
    const fieldCount = mappings[plugin.id]?.fields?.length ?? 0;
    const hasLookupTables = (plugin.lookupTables?.length ?? 0) > 0;
    const hasComputedFields = (plugin.computedFields?.length ?? 0) > 0;

    // Calculate priority score (higher = more urgent)
    let priority = 0;
    priority += pendingRegs.length * 10; // Each pending regulation adds urgency
    if (plugin.rules.length < 50) priority += 5; // Low rule count
    if (pendingRegs.length > 5) priority += 20; // Large backlog
    if (!hasLookupTables && plugin.rules.some(r => r.conditions.some(c => c.operator.startsWith("lookup_")))) {
      priority += 10; // Missing tables that rules reference
    }

    return {
      pluginId: plugin.id,
      pluginName: plugin.name,
      totalRules: plugin.rules.length,
      totalRegulations: totalRegs,
      pendingRegulations: pendingRegs.map(r => ({
        id: r.id,
        shortRef: r.shortRef,
        title: r.title,
        sourceType: r.sourceType,
      })),
      verifiedCount: verifiedRegs.length,
      completeCount: completeRegs.length,
      pendingCount: pendingRegs.length,
      fieldCount,
      hasLookupTables,
      lookupTableCount: plugin.lookupTables?.length ?? 0,
      hasComputedFields,
      computedFieldCount: plugin.computedFields?.length ?? 0,
      priority,
      coveragePercent: totalRegs > 0
        ? Math.round(((verifiedRegs.length + completeRegs.length) / totalRegs) * 100)
        : 0,
    };
  }).sort((a, b) => b.priority - a.priority);
}

export interface ExtractionRoadmapEntry {
  pluginId: string;
  pluginName: string;
  totalRules: number;
  totalRegulations: number;
  pendingRegulations: Array<{
    id: string;
    shortRef: string;
    title: string;
    sourceType: string;
  }>;
  verifiedCount: number;
  completeCount: number;
  pendingCount: number;
  fieldCount: number;
  hasLookupTables: boolean;
  lookupTableCount: number;
  hasComputedFields: boolean;
  computedFieldCount: number;
  priority: number;
  coveragePercent: number;
}

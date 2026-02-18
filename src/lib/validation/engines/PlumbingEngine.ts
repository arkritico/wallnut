/**
 * PlumbingEngine - RGSPPDADAR Validation Engine
 *
 * Implements validation for Portuguese plumbing regulations:
 * - RGSPPDADAR (Decreto Regulamentar 23/95)
 * - NP EN 806 (Parts 1-5)
 * - NP EN 1717
 * - NP EN 12056 (Parts 1-5)
 *
 * Covers:
 * - Water supply (pressures, flows, diameters)
 * - Wastewater drainage (slopes, diameters, ventilation)
 * - Stormwater drainage (rational method, sizing)
 * - Materials and equipment specifications
 */

import type {
  UniversalRule,
  SpecialtyType
} from '../universal-types';
import type {
  ValidationContext,
  ValidationResult
} from '../plumbing-rules-engine';

interface PlumbingRule extends UniversalRule {
  specialty: 'plumbing';
}

interface PlumbingContext extends ValidationContext {
  // Water supply parameters
  pressao_servico?: number; // kPa
  pressao_rede_publica?: number; // kPa
  numero_pisos?: number;
  diametro_tubagem_ligacao?: number; // mm
  profundidade_assentamento?: number; // m
  velocidade_escoamento?: number; // m/s
  area_sem_trafego?: boolean;
  tem_servico_incendio?: boolean;
  tem_reservatorio_regularizacao?: boolean;
  tem_protecao_retorno?: boolean;
  aplica_coeficiente_simultaneidade?: boolean;
  capacidade_reservatorio?: number; // L
  consumo_diario_edificio?: number; // L

  // Wastewater parameters
  diametro_tubagem_drenagem?: number; // mm
  declive_tubagem?: number; // mm/m or %
  diametro_coletor?: number; // mm
  altura_coluna_ventilacao?: number; // m
  cobertura_utilizada_outros_fins?: boolean;
  distancia_de_vaos?: number; // m
  elevacao_acima_verga?: number; // m
  dimensao_caixa_inspecao?: number; // m
  profundidade_caixa?: number; // m
  afastamento_entre_caixas?: number; // m

  // Spatial parameters (form-declared distances for RGSPPDADAR Art. 24, 136)
  distancia_colector_propriedade?: number; // m — R064, R071
  distancia_agua_residuais?: number;       // m — R070
  agua_acima_residuais?: boolean;          // R070

  // Stormwater parameters
  coeficiente_escoamento?: number;
  intensidade_precipitacao?: number; // mm/h
  area_bacia?: number; // km²
  caudal_pluvial?: number; // m³/s
  declive_area?: number; // %
  tempo_concentracao?: number; // min
}

export class PlumbingEngine {
  private rules: PlumbingRule[] = [];
  private lookupTables: Map<string, any> = new Map();

  constructor() {
    this.loadRules();
    this.loadLookupTables();
  }

  /**
   * Load rules from rules.json
   */
  private async loadRules(): Promise<void> {
    try {
      const rulesModule = await import('../../../../regulamentos/plumbing/rgsppdadar/rules.json');
      this.rules = (rulesModule.rules || rulesModule.default?.rules || []) as PlumbingRule[];
      console.log(`✅ Loaded ${this.rules.length} plumbing rules`);
    } catch (error) {
      console.error('❌ Failed to load plumbing rules:', error);
      this.rules = [];
    }
  }

  /**
   * Load lookup tables
   */
  private async loadLookupTables(): Promise<void> {
    try {
      // Load diameter tables
      const diametrosModule = await import(
        '../../../../regulamentos/plumbing/rgsppdadar/tables/diametros-minimos-aparelhos.json'
      );
      this.lookupTables.set('diametros_minimos', diametrosModule.default || diametrosModule);

      // Load slope tables
      const declivesModule = await import(
        '../../../../regulamentos/plumbing/rgsppdadar/tables/declives-minimos.json'
      );
      this.lookupTables.set('declives_minimos', declivesModule.default || declivesModule);

      console.log(`✅ Loaded ${this.lookupTables.size} lookup tables`);
    } catch (error) {
      console.warn('⚠️  Some lookup tables not available:', error);
    }
  }

  /**
   * Validate all applicable plumbing rules
   */
  async validate(context: PlumbingContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rule of this.rules) {
      // Check if rule applies to this context
      if (!this.isRuleApplicable(rule, context)) {
        continue;
      }

      // Validate based on type
      let result: ValidationResult;

      switch (rule.validation_type) {
        case 'range':
          result = this.validateRange(rule, context);
          break;
        case 'conditional':
          result = this.validateConditional(rule, context);
          break;
        case 'formula':
          result = this.validateFormula(rule, context);
          break;
        case 'boolean':
          result = this.validateBoolean(rule, context);
          break;
        case 'lookup':
          result = this.validateLookup(rule, context);
          break;
        case 'spatial':
          result = this.validateSpatial(rule, context);
          break;
        default:
          result = {
            ruleId: rule.id,
            ruleName: rule.rule_text || 'Unknown rule',
            passed: false,
            message: `Unknown validation type: ${rule.validation_type}`,
            severity: rule.severity === 'optional' ? 'informative' : rule.severity as 'mandatory' | 'recommended' | 'informative',
            metadata: {
              reference: rule.reference || '',
              parameter: rule.category || '',
              unit: ''
            }
          };
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Check if rule applies to current context
   */
  private isRuleApplicable(rule: PlumbingRule, context: PlumbingContext): boolean {
    const ctx = context as any; // Use type assertion for dynamic properties

    // Check building type
    if (ctx.building_type && rule.metadata?.building_types) {
      if (!rule.metadata.building_types.includes(ctx.building_type)) {
        return false;
      }
    }

    // Check application scope
    if (rule.metadata?.application_scope) {
      const scope = rule.metadata.application_scope;

      // Check specific scope conditions
      if (scope.includes('fire_protection') && !ctx.tem_servico_incendio) {
        return false;
      }
      if (scope.includes('with_reservoir') && context.capacidade_reservatorio === undefined) {
        return false;
      }
      if (scope.includes('accessible_roofs') && !context.cobertura_utilizada_outros_fins) {
        return false;
      }
    }

    return true;
  }

  /**
   * Map from rule-parameters Portuguese keys to context variable names and min/max.
   * Used when rules don't have a validation.parameter field (legacy format).
   */
  private static readonly PARAM_RESOLUTION: Record<string, {
    param: string;
    minKey?: string;
    maxKey?: string;
  }> = {
    'PLUMB_R001': { param: 'diametro_tubagem_ligacao', minKey: 'diametro_minimo_mm' },
    'PLUMB_R002': { param: 'diametro_tubagem_ligacao', minKey: 'diametro_minimo_incendio_mm' },
    'PLUMB_R003': { param: 'profundidade_assentamento', minKey: 'profundidade_minima_m' },
    'PLUMB_R004': { param: 'profundidade_assentamento', minKey: 'profundidade_minima_sem_trafego_m' },
    'PLUMB_R005': { param: 'pressao_servico', minKey: 'pressao_minima_kPa' },
    'PLUMB_R007': { param: 'pressao_servico', maxKey: 'pressao_maxima_kPa' },
    'PLUMB_R008': { param: 'pressao_servico', minKey: 'pressao_recomendada_min_kPa', maxKey: 'pressao_recomendada_max_kPa' },
    'PLUMB_R010': { param: 'velocidade_escoamento', minKey: 'velocidade_minima_ms', maxKey: 'velocidade_maxima_ms' },
    'PLUMB_R011': { param: 'diametro_tubagem_drenagem', minKey: 'diametro_minimo_mm' },
    'PLUMB_R012': { param: 'declive_tubagem', minKey: 'declive_minimo_mm_m', maxKey: 'declive_maximo_mm_m' },
    'PLUMB_R013': { param: 'diametro_coletor', minKey: 'diametro_minimo_coletor_mm' },
    'PLUMB_R014': { param: 'altura_coluna_ventilacao', minKey: 'altura_minima_cobertura_acessivel_m' },
    'PLUMB_R015': { param: 'altura_coluna_ventilacao', minKey: 'altura_minima_cobertura_nao_acessivel_m' },
    'PLUMB_R016': { param: 'elevacao_acima_verga', minKey: 'elevacao_minima_m' },
    'PLUMB_R017': { param: 'dimensao_caixa_inspecao', minKey: 'dimensao_minima_caixa_m' },
    'PLUMB_R018': { param: 'afastamento_entre_caixas', maxKey: 'afastamento_maximo_m' },
  };

  /**
   * Resolve context parameter and min/max from a rule (handles both new validation format and legacy parameters format)
   */
  private resolveRangeValidation(rule: PlumbingRule): { param: string; min?: number; max?: number; unit?: string } | null {
    const ruleAny = rule as any;

    // Try new format first: validation.parameter
    if (ruleAny.validation?.parameter) {
      return {
        param: ruleAny.validation.parameter,
        min: ruleAny.validation.min,
        max: ruleAny.validation.max,
        unit: ruleAny.validation.unit,
      };
    }

    // Fall back to explicit rule ID mapping
    const resolution = PlumbingEngine.PARAM_RESOLUTION[rule.id];
    if (resolution && ruleAny.parameters) {
      const params = ruleAny.parameters;
      return {
        param: resolution.param,
        min: resolution.minKey ? params[resolution.minKey] : undefined,
        max: resolution.maxKey ? params[resolution.maxKey] : undefined,
        unit: params.unit,
      };
    }

    return null;
  }

  /**
   * Validate range-type rules (min/max values)
   */
  private validateRange(rule: PlumbingRule, context: PlumbingContext): ValidationResult {
    const resolved = this.resolveRangeValidation(rule);

    if (!resolved) {
      return this.createErrorResult(rule, 'Range validation missing parameter name');
    }

    const { param: parameterName, min, max, unit } = resolved;
    const value = (context as any)[parameterName];

    if (value === undefined || value === null) {
      return this.createErrorResult(rule, `Parameter ${parameterName} not provided in context`);
    }

    // Check min
    if (min !== null && min !== undefined && value < min) {
      return {
        ruleId: rule.id,
        ruleName: rule.rule_text || rule.id,
        passed: false,
        message: this.interpolateMessage(rule.error_message, { value, min, max }),
        severity: rule.severity === 'optional' ? 'informative' : rule.severity as 'mandatory' | 'recommended' | 'informative',
        details: {
          expected: min,
          actual: value
        },
        metadata: {
          reference: rule.reference || '',
          parameter: parameterName,
          unit: unit || ''
        }
      };
    }

    // Check max
    if (max !== null && max !== undefined && value > max) {
      return {
        ruleId: rule.id,
        ruleName: rule.rule_text || rule.id,
        passed: false,
        message: this.interpolateMessage(rule.error_message, { value, min, max }),
        severity: rule.severity === 'optional' ? 'informative' : rule.severity as 'mandatory' | 'recommended' | 'informative',
        details: {
          expected: max,
          actual: value
        },
        metadata: {
          reference: rule.reference || '',
          parameter: parameterName,
          unit: unit || ''
        }
      };
    }

    return {
      ruleId: rule.id,
      ruleName: rule.rule_text || rule.id,
      passed: true,
      message: this.interpolateMessage(rule.success_message, { value, min, max }),
      severity: rule.severity === 'optional' ? 'informative' : rule.severity as 'mandatory' | 'recommended' | 'informative',
      metadata: {
        reference: rule.reference || '',
        parameter: parameterName,
        unit: unit || ''
      }
    };
  }

  /**
   * Context aliases: maps abstract variable names used in conditional logic to real context keys.
   * Some rule JSON files use abstract names (e.g., "dimensao_minima") instead of actual context vars.
   */
  private static readonly CONTEXT_ALIASES: Record<string, string> = {
    'dimensao_minima': 'dimensao_caixa_inspecao',
    'elevacao': 'elevacao_acima_verga',
    'distancia_vaos': 'distancia_de_vaos',
  };

  /**
   * Validate conditional rules (if-then logic)
   */
  private validateConditional(rule: PlumbingRule, context: PlumbingContext): ValidationResult {
    const logic = (rule as any).conditional_logic;

    if (!logic?.conditions) {
      return this.createErrorResult(rule, 'Conditional logic missing conditions');
    }

    // Build enriched context with aliases
    const enrichedContext = { ...context } as Record<string, unknown>;
    for (const [alias, realKey] of Object.entries(PlumbingEngine.CONTEXT_ALIASES)) {
      if (enrichedContext[realKey] !== undefined && enrichedContext[alias] === undefined) {
        enrichedContext[alias] = enrichedContext[realKey];
      }
    }

    for (const condition of logic.conditions) {
      const ifCondition = condition.if;
      const thenRequirement = condition.then;

      // Evaluate if condition
      const conditionMet = this.evaluateCondition(ifCondition, enrichedContext as unknown as PlumbingContext);

      if (conditionMet) {
        // Evaluate then requirement
        const requirementMet = this.evaluateCondition(thenRequirement, enrichedContext as unknown as PlumbingContext);

        if (!requirementMet) {
          return this.toValidationResult(rule, false, this.interpolateMessage(rule.error_message, context));
        }

        // Condition met and requirement satisfied
        return this.toValidationResult(rule, true, this.interpolateMessage(rule.success_message, context));
      }
    }

    // No applicable condition - rule passes by default
    return this.toValidationResult(rule, true, 'Rule not applicable to current context');
  }

  /**
   * Validate formula-based rules
   */
  private validateFormula(rule: PlumbingRule, context: PlumbingContext): ValidationResult {
    const formula = (rule as any).formula;

    if (!formula) {
      return this.createErrorResult(rule, 'Formula validation missing formula');
    }

    try {
      // Evaluate formula with context variables
      const result = this.evaluateFormula(formula, context);

      if (!result) {
        return this.toValidationResult(rule, false, this.interpolateMessage(rule.error_message, context));
      }

      return this.toValidationResult(rule, true, this.interpolateMessage(rule.success_message, context));
    } catch (error) {
      return this.createErrorResult(rule, `Formula evaluation error: ${error}`);
    }
  }

  /**
   * Explicit mapping for boolean rules where parameters key != context variable name.
   */
  private static readonly BOOLEAN_RESOLUTION: Record<string, { param: string; expected: boolean }> = {
    'PLUMB_R009': { param: 'aplica_coeficiente_simultaneidade', expected: true },
    'PLUMB_R021': { param: 'tem_reservatorio_regularizacao', expected: true },
    'PLUMB_R022': { param: 'tem_protecao_retorno', expected: true },
    'PLUMB_R023': { param: 'tem_reservatorio_regularizacao', expected: true },
    'PLUMB_R024': { param: 'tem_protecao_retorno', expected: true },
  };

  /**
   * Resolve boolean validation parameter and expected value from rule.
   * Handles both new validation format and legacy parameters format.
   */
  private resolveBooleanValidation(rule: PlumbingRule): { param: string; expected: boolean } | null {
    const ruleAny = rule as any;

    // Try new format first
    if (ruleAny.validation?.parameter !== undefined) {
      return { param: ruleAny.validation.parameter, expected: ruleAny.validation.expected };
    }

    // Check explicit boolean resolution map
    const explicit = PlumbingEngine.BOOLEAN_RESOLUTION[rule.id];
    if (explicit) return explicit;

    // Legacy: infer from parameters object — look for boolean value keys
    if (ruleAny.parameters) {
      const params = ruleAny.parameters as Record<string, unknown>;
      // Find keys whose value is a boolean (only if key matches context variable)
      for (const [key, val] of Object.entries(params)) {
        if (typeof val === 'boolean') {
          return { param: key, expected: val };
        }
      }
    }

    return null;
  }

  /**
   * Validate boolean rules (yes/no checks)
   */
  private validateBoolean(rule: PlumbingRule, context: PlumbingContext): ValidationResult {
    const resolved = this.resolveBooleanValidation(rule);

    if (!resolved) {
      return this.createErrorResult(rule, 'Boolean validation missing parameter name');
    }

    const { param: parameterName, expected } = resolved;
    const value = (context as any)[parameterName];

    if (value === undefined || value === null) {
      return this.createErrorResult(rule, `Parameter ${parameterName} not provided in context`);
    }

    if (value !== expected) {
      return this.toValidationResult(rule, false, this.interpolateMessage(rule.error_message, context), {
        expected,
        actual: value
      });
    }

    return this.toValidationResult(rule, true, this.interpolateMessage(rule.success_message, context));
  }

  /**
   * Validate lookup table rules.
   *
   * Supports three lookup strategies based on lookup_logic:
   * - range-based: numeric range brackets (e.g., population → per-capita consumption)
   * - material-list: check if a material is in the allowed list for the given context
   * - device-match: find a matching device row and compare values
   *
   * Rules carry their thresholds in `parameters` and navigation hints in `lookup_tables`.
   */
  private validateLookup(rule: PlumbingRule, context: PlumbingContext): ValidationResult {
    const ruleAny = rule as unknown as Record<string, unknown>;
    const lookupConfig = ruleAny.lookup_tables as {
      table_name?: string;
      input_parameters?: string[];
      output_parameter?: string;
      lookup_logic?: string;
      values?: { table?: Array<{ dispositivo: string; min: number }> };
      unit?: string;
    } | undefined;

    if (!lookupConfig) {
      return this.createErrorResult(rule, 'Lookup table configuration missing');
    }

    const params = ruleAny.parameters as Record<string, unknown> | undefined;
    const ctx = context as unknown as Record<string, unknown>;

    // Resolve input parameter values from context
    const inputs: Record<string, unknown> = {};
    for (const param of lookupConfig.input_parameters ?? []) {
      inputs[param] = ctx[param];
    }

    // If all inputs are missing, skip validation (context not available)
    const allMissing = Object.values(inputs).every(v => v === undefined || v === null);
    if (allMissing && Object.keys(inputs).length > 0) {
      return this.toValidationResult(rule, true,
        this.interpolateMessage(rule.success_message ?? 'Lookup inputs not in context', context));
    }

    const logic = lookupConfig.lookup_logic ?? '';

    // Strategy 1: Range-based lookup (e.g., population brackets → capitação)
    if (logic.startsWith('range-based') && params) {
      return this.validateRangeLookup(rule, params, inputs, context);
    }

    // Strategy 2: Material-list validation
    if (logic.includes('material') || logic.includes('all:') || lookupConfig.table_name?.includes('materiais')) {
      return this.validateMaterialLookup(rule, params, inputs, context);
    }

    // Strategy 3: Device-match with embedded table data
    if (lookupConfig.values?.table) {
      return this.validateDeviceLookup(rule, lookupConfig.values.table, inputs, lookupConfig.output_parameter, context);
    }

    // Strategy 4: External table reference
    if (lookupConfig.table_name) {
      const tableData = this.lookupTables.get(lookupConfig.table_name);
      if (tableData) {
        return this.validateExternalTableLookup(rule, tableData, inputs, lookupConfig.output_parameter, context);
      }
    }

    // No matching strategy — pass with info
    return this.toValidationResult(rule, true,
      this.interpolateMessage(rule.success_message ?? 'Lookup table not available for validation', context));
  }

  /**
   * Range-based lookup: find the bracket for a numeric input
   * Example: numero_habitantes=5000 → capitação ≥ 100 l/hab/dia
   */
  private validateRangeLookup(
    rule: PlumbingRule,
    params: Record<string, unknown>,
    inputs: Record<string, unknown>,
    context: PlumbingContext
  ): ValidationResult {
    // Extract range thresholds from parameter names
    // Pattern: "capitacao_ate_1000_hab_l_dia": 80, "capitacao_1000_10000_hab_l_dia": 100, ...
    const ranges: Array<{ min: number; max: number; value: number; label: string }> = [];

    for (const [key, val] of Object.entries(params)) {
      if (typeof val !== 'number') continue;

      // Parse range boundaries from key name
      const ateMatch = key.match(/ate_(\d+)/);
      const rangeMatch = key.match(/(\d+)_(\d+)/);
      const maisMatch = key.match(/mais_(\d+)/);

      if (ateMatch) {
        ranges.push({ min: 0, max: parseInt(ateMatch[1], 10), value: val, label: key });
      } else if (maisMatch) {
        ranges.push({ min: parseInt(maisMatch[1], 10), max: Infinity, value: val, label: key });
      } else if (rangeMatch) {
        const n1 = parseInt(rangeMatch[1], 10);
        const n2 = parseInt(rangeMatch[2], 10);
        if (n1 < n2) {
          ranges.push({ min: n1, max: n2, value: val, label: key });
        }
      }
    }

    if (ranges.length === 0) {
      return this.toValidationResult(rule, true, 'No range thresholds found in rule parameters');
    }

    // Sort by min ascending
    ranges.sort((a, b) => a.min - b.min);

    // Find the matching range for the input value
    const inputKey = Object.keys(inputs)[0];
    const inputValue = typeof inputs[inputKey] === 'number' ? inputs[inputKey] as number : undefined;

    if (inputValue === undefined) {
      return this.toValidationResult(rule, true,
        this.interpolateMessage(rule.success_message ?? 'Input not available', context));
    }

    const matchedRange = ranges.find(r => inputValue >= r.min && inputValue <= r.max);
    if (!matchedRange) {
      return this.toValidationResult(rule, true, 'Input value outside all defined ranges');
    }

    // Check if the actual value meets the required minimum
    // Look for the output parameter in context
    const outputParam = (rule as unknown as Record<string, unknown>).lookup_tables as { output_parameter?: string } | undefined;
    const outputKey = outputParam?.output_parameter;
    const actualValue = outputKey ? (context as unknown as Record<string, unknown>)[outputKey] : undefined;

    if (actualValue === undefined || typeof actualValue !== 'number') {
      return this.toValidationResult(rule, true,
        this.interpolateMessage(rule.success_message ?? `Required: ≥ ${matchedRange.value}`, context));
    }

    const passed = actualValue >= matchedRange.value;
    return this.toValidationResult(rule, passed,
      this.interpolateMessage(passed ? (rule.success_message ?? '') : (rule.error_message ?? ''), context),
      { expected: matchedRange.value, actual: actualValue, range: `${matchedRange.min}-${matchedRange.max}` }
    );
  }

  /**
   * Material-list lookup: check if a material is in the allowed list
   */
  private validateMaterialLookup(
    rule: PlumbingRule,
    params: Record<string, unknown> | undefined,
    inputs: Record<string, unknown>,
    context: PlumbingContext
  ): ValidationResult {
    if (!params) {
      return this.toValidationResult(rule, true, 'No material parameters defined');
    }

    // Find allowed materials lists from parameters
    const allowedLists: Array<{ key: string; materials: string[] }> = [];
    for (const [key, val] of Object.entries(params)) {
      if (Array.isArray(val) && val.every(v => typeof v === 'string')) {
        allowedLists.push({ key, materials: val as string[] });
      }
    }

    if (allowedLists.length === 0) {
      return this.toValidationResult(rule, true, 'No material lists found');
    }

    // Check context material against allowed lists
    const ctxAny = context as unknown as Record<string, unknown>;
    const materialValue = ctxAny.material_rede_interior ?? ctxAny.material_colector;

    if (!materialValue || typeof materialValue !== 'string') {
      return this.toValidationResult(rule, true,
        this.interpolateMessage(rule.success_message ?? 'Material not specified in context', context));
    }

    // Check if material is in any allowed list
    const isAllowed = allowedLists.some(list => list.materials.includes(materialValue));

    return this.toValidationResult(rule, isAllowed,
      this.interpolateMessage(isAllowed ? (rule.success_message ?? '') : (rule.error_message ?? ''), context),
      { material: materialValue, allowedLists: allowedLists.map(l => l.key) }
    );
  }

  /**
   * Device-match lookup: find device in embedded table, compare value
   */
  private validateDeviceLookup(
    rule: PlumbingRule,
    tableData: Array<{ dispositivo: string; min: number }>,
    inputs: Record<string, unknown>,
    outputParam: string | undefined,
    context: PlumbingContext
  ): ValidationResult {
    const deviceName = inputs.dispositivo ?? inputs.tipo_aparelho;

    if (!deviceName || typeof deviceName !== 'string') {
      return this.toValidationResult(rule, true,
        this.interpolateMessage(rule.success_message ?? 'Device not specified', context));
    }

    const deviceRow = tableData.find(row => row.dispositivo === deviceName);
    if (!deviceRow) {
      return this.toValidationResult(rule, true, `Device "${deviceName}" not found in lookup table`);
    }

    const ctxAny = context as unknown as Record<string, unknown>;
    const actualValue = outputParam ? ctxAny[outputParam] : ctxAny.caudal_instantaneo;

    if (actualValue === undefined || typeof actualValue !== 'number') {
      return this.toValidationResult(rule, true,
        this.interpolateMessage(rule.success_message ?? `Required: ≥ ${deviceRow.min}`, context));
    }

    const passed = actualValue >= deviceRow.min;
    return this.toValidationResult(rule, passed,
      this.interpolateMessage(passed ? (rule.success_message ?? '') : (rule.error_message ?? ''), context),
      { expected: deviceRow.min, actual: actualValue, device: deviceName }
    );
  }

  /**
   * External table lookup: navigate loaded table data (array of records)
   */
  private validateExternalTableLookup(
    rule: PlumbingRule,
    tableData: Record<string, unknown>,
    inputs: Record<string, unknown>,
    outputParam: string | undefined,
    context: PlumbingContext
  ): ValidationResult {
    const dataArray = (tableData as { data?: unknown[] }).data;
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return this.toValidationResult(rule, true, 'External lookup table has no data');
    }

    // Try to find matching row by input parameters
    const matchingRow = dataArray.find((row: unknown) => {
      if (typeof row !== 'object' || row === null) return false;
      const rowObj = row as Record<string, unknown>;
      return Object.entries(inputs).every(([key, value]) => {
        if (value === undefined || value === null) return true;
        return rowObj[key] === value || String(rowObj[key]) === String(value);
      });
    }) as Record<string, unknown> | undefined;

    if (!matchingRow) {
      return this.toValidationResult(rule, true,
        this.interpolateMessage(rule.success_message ?? 'No matching row in lookup table', context));
    }

    // Extract the output value from the matched row
    const expectedValue = outputParam ? matchingRow[outputParam] : undefined;
    if (expectedValue === undefined) {
      return this.toValidationResult(rule, true, 'Output parameter not found in matched row');
    }

    // Compare with context value
    const ctxAny = context as unknown as Record<string, unknown>;
    const actualOutputKey = outputParam ?? '';
    const actualValue = ctxAny[actualOutputKey];

    if (actualValue === undefined || typeof actualValue !== 'number' || typeof expectedValue !== 'number') {
      return this.toValidationResult(rule, true,
        this.interpolateMessage(rule.success_message ?? `Required: ${expectedValue}`, context));
    }

    const passed = actualValue >= expectedValue;
    return this.toValidationResult(rule, passed,
      this.interpolateMessage(passed ? (rule.success_message ?? '') : (rule.error_message ?? ''), context),
      { expected: expectedValue, actual: actualValue }
    );
  }

  /**
   * Validate spatial rules (distances, areas, etc.)
   */
  private validateSpatial(rule: PlumbingRule, context: PlumbingContext): ValidationResult {
    const check = (rule as any).spatial_check;
    if (!check) {
      return this.toValidationResult(rule, true, 'No spatial check defined');
    }

    switch (check.type) {
      case 'distance': {
        const actual = context.distancia_colector_propriedade;
        if (actual === undefined) {
          return this.toValidationResult(rule, true, 'Spatial: distance not provided (skipped)');
        }
        const passed = actual >= check.min_distance;
        return this.toValidationResult(rule, passed,
          this.interpolateMessage(passed ? (rule.success_message ?? '') : (rule.error_message ?? ''), context),
          { expected: `≥ ${check.min_distance} m`, actual: `${actual} m` }
        );
      }
      case 'distance_and_height': {
        const dist = context.distancia_agua_residuais;
        const above = context.agua_acima_residuais;
        if (dist === undefined && above === undefined) {
          return this.toValidationResult(rule, true, 'Spatial: distance/height not provided (skipped)');
        }
        const distOk = dist === undefined || dist >= check.min_distance;
        const heightOk = above === undefined || above === true;
        const passed = distOk && heightOk;
        return this.toValidationResult(rule, passed,
          this.interpolateMessage(passed ? (rule.success_message ?? '') : (rule.error_message ?? ''), context),
          { expected: `≥ ${check.min_distance} m, above`, actual: `${dist ?? '?'} m, ${above ? 'above' : 'below/same'}` }
        );
      }
      default:
        return this.toValidationResult(rule, true, `Spatial check type "${check.type}" not supported`);
    }
  }

  /**
   * Evaluate a condition string against context
   */
  private evaluateCondition(condition: string, context: PlumbingContext): boolean {
    try {
      // Normalize the expression
      let expression = condition;

      // Replace logical operators with JavaScript equivalents
      expression = expression.replace(/\bAND\b/g, '&&');
      expression = expression.replace(/\bOR\b/g, '||');
      expression = expression.replace(/\bNOT\b/g, '!');

      // Replace comparison operators if needed
      // Single = to === (but not for >=, <=, !=, ==)
      expression = expression.replace(/([^><!])=([^=])/g, '$1===$2');

      // Replace context variables with their values
      for (const [key, value] of Object.entries(context)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        expression = expression.replace(regex, JSON.stringify(value));
      }

      // Handle undefined variables gracefully
      // Replace any remaining lowercase identifiers with false
      // (these are likely undefined context variables)
      const undefinedVars = expression.match(/\b[a-z_][a-z0-9_]*\b/gi);
      if (undefinedVars) {
        // Don't evaluate if critical variables are missing
        return false;
      }

      // Evaluate the expression
      // eslint-disable-next-line no-eval
      return eval(expression);
    } catch (error) {
      // Silently fail for missing context variables
      if (error instanceof ReferenceError) {
        return false;
      }
      console.error('Condition evaluation error:', error, 'condition:', condition);
      return false;
    }
  }

  /**
   * Evaluate a formula string against context
   */
  private evaluateFormula(formula: string, context: PlumbingContext): boolean {
    try {
      // Normalize the expression
      let expression = formula;

      // Replace logical operators
      expression = expression.replace(/\bAND\b/g, '&&');
      expression = expression.replace(/\bOR\b/g, '||');
      expression = expression.replace(/\bNOT\b/g, '!');

      // Replace single = with === (assignment-style formulas → equality check)
      expression = expression.replace(/([^><!])=([^=])/g, '$1===$2');

      // Replace variable names with values from context
      for (const [key, value] of Object.entries(context)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        expression = expression.replace(regex, JSON.stringify(value));
      }

      // Check for undefined variables
      const undefinedVars = expression.match(/\b[a-z_][a-z0-9_]*\b/gi);
      if (undefinedVars) {
        // Formula requires variables not in context
        return false;
      }

      // Evaluate the formula
      // eslint-disable-next-line no-eval
      return eval(expression);
    } catch (error) {
      // Silently fail for missing context variables
      if (error instanceof ReferenceError) {
        return false;
      }
      console.error('Formula evaluation error:', error, 'formula:', formula);
      return false;
    }
  }

  /**
   * Interpolate message with context values
   */
  private interpolateMessage(message: string, values: Record<string, any>): string {
    let result = message;

    for (const [key, value] of Object.entries(values)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value));
    }

    return result;
  }

  /**
   * Create an error result
   */
  /**
   * Helper to convert legacy result format to ValidationResult
   */
  private toValidationResult(rule: PlumbingRule, passed: boolean, message: string, details?: any): ValidationResult {
    return {
      ruleId: rule.id,
      ruleName: rule.rule_text || rule.id,
      passed,
      message,
      severity: rule.severity === 'optional' ? 'informative' : rule.severity as 'mandatory' | 'recommended' | 'informative',
      details,
      metadata: {
        reference: rule.reference || '',
        parameter: rule.category || '',
        unit: ''
      }
    };
  }

  private createErrorResult(rule: PlumbingRule, message: string): ValidationResult {
    return this.toValidationResult(rule, false, message);
  }

  /**
   * Get all rules
   */
  getRules(): PlumbingRule[] {
    return this.rules;
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: string): PlumbingRule[] {
    return this.rules.filter(rule => rule.category === category);
  }

  /**
   * Get rule by ID
   */
  getRuleById(id: string): PlumbingRule | undefined {
    return this.rules.find(rule => rule.id === id);
  }

  /**
   * Get statistics
   */
  getStats() {
    const byCategory = this.rules.reduce((acc, rule) => {
      acc[rule.category] = (acc[rule.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySeverity = this.rules.reduce((acc, rule) => {
      acc[rule.severity] = (acc[rule.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byType = this.rules.reduce((acc, rule) => {
      acc[rule.validation_type] = (acc[rule.validation_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: this.rules.length,
      by_category: byCategory,
      by_severity: bySeverity,
      by_type: byType
    };
  }
}

export default PlumbingEngine;

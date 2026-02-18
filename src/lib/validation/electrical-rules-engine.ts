/**
 * ⚡ Electrical Rules Validation Engine
 *
 * Engine de validação para regras de instalações elétricas portuguesas
 */

export interface ElectricalRule {
  id: string;
  reference: string;
  category: string;
  subcategory: string;
  rule_text: string;
  parameters: any;
  validation_type: string;
  severity: 'mandatory' | 'recommended' | 'informative';
  formula?: string;
  conditions?: any;
  lookup_tables?: any;
  error_message: string;
  success_message: string;
  source: {
    regulation: string;
    article: string;
    version: string;
    date: string;
  };
  metadata: {
    complexity: 'simple' | 'medium' | 'complex';
    requires_calculation: boolean;
    application_scope: string[];
  };
}

export interface ValidationContext {
  projectType: 'residential' | 'commercial' | 'industrial' | 'other';
  scope: string; // 'bathroom', 'pool', 'general', etc.
  parameters: Record<string, any>;
}

export interface ValidationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: 'mandatory' | 'recommended' | 'informative';
  message: string;
  details?: {
    expected: any;
    actual: any;
    calculation?: any;
  };
  metadata: {
    reference: string;
    category: string;
  };
}

export interface ValidationReport {
  timestamp: string;
  projectId?: string;
  context: ValidationContext;
  results: ValidationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    critical: number;
  };
}

type FormulaCategory = 'boolean' | 'simple' | 'conditional' | 'lookup' | 'correction' | 'math' | 'compound';

type FormulaResult = { valid: boolean; result?: any; error?: string };

export class ElectricalRulesEngine {
  private rules: Map<string, ElectricalRule> = new Map();
  private rulesByCategory: Map<string, ElectricalRule[]> = new Map();
  private rulesByScope: Map<string, ElectricalRule[]> = new Map();

  /** Maps formula variable names → context parameter keys */
  private static readonly FORMULA_VAR_MAP: Record<string, string> = {
    // RCD / protection
    IDn_mA: 'rcdSensitivity', IDn_A: 'rcdSensitivity', IDn: 'rcdSensitivity',
    // Conductors
    section_mm2: 'conductorSection', S_fase: 'conductorSection', S_phase: 'conductorSection',
    S: 'conductorSection',
    S_pe: 'peSection', S_pe_mm2: 'peSection',
    S_neutral: 'neutralSection', S_PEN: 'penSection',
    S_equip_main: 'mainBondingSection', S_equip_supp: 'suppBondingSection',
    S_PE_separate_protected: 'peSeparateProtected', S_PE_separate_unprotected: 'peSeparateUnprotected',
    // Currents
    I_service: 'serviceCurrent', IB_A: 'serviceCurrent', IB: 'serviceCurrent',
    In_A: 'nominalCurrent', In: 'nominalCurrent',
    Iz_A: 'admissibleCurrent', Iz: 'admissibleCurrent', Iz_base: 'admissibleCurrent',
    Iz_corrected: 'correctedAdmissibleCurrent',
    I2_A: 'conventionalTrippingCurrent',
    I_fault_A: 'faultCurrent', Icc_presumed_kA: 'presumedFaultCurrent',
    Ia_A: 'faultDisconnectCurrent',
    leakage_current: 'leakageCurrent',
    // Voltage & impedance
    Uo_V: 'nominalVoltage', voltage: 'nominalVoltage',
    Zs_ohm: 'loopImpedance', RA_ohm: 'earthingResistance', R_earth_ohm: 'earthingResistance',
    RB_ohm: 'rbResistance', RE_ohm: 'reResistance',
    // Voltage drop
    voltage_drop_individual_percent: 'voltageDropIndividual',
    voltage_drop_entrada_percent: 'voltageDropEntrada',
    voltage_drop_coluna_percent: 'voltageDropColuna',
    'voltage_drop_coluna+entrada_percent': 'voltageDropColunaEntrada',
    voltage_variation_percent: 'voltageVariation',
    voltage_variation_urban_percent: 'voltageVariationUrban',
    // Time
    t_s: 'disconnectionTime', t_disconnect_s: 'disconnectionTime',
    t_disconnect_distribution_s: 'disconnectionTimeDistribution',
    // Material & method
    material: 'conductorMaterial', method: 'installationMethod',
    insulation_type: 'insulationType', config: 'cableConfiguration',
    // Temperature & grouping
    temp_ambient: 'ambientTemperature', temp_soil: 'soilTemperature',
    n_circuits: 'numberOfGroupedCircuits', n_cables: 'numberOfCables',
    disposition: 'cableDisposition', soil_resistivity: 'soilResistivity',
    conductor_temp_C: 'conductorTemperature',
    // Dimensions & physical
    dimension_mm: 'dimensionMm', burial_depth_m: 'burialDepth',
    floor_resistance: 'floorResistance', contact_gap_mm: 'contactGap',
    sum_gaps: 'sumGaps', simple_gap: 'simpleGap',
    floor_opening_width: 'floorOpeningWidth', floor_opening_depth: 'floorOpeningDepth',
    clearance: 'clearance', door_angle: 'doorAngle',
    cable_area: 'cableArea', void_area: 'voidArea', void_min_dim: 'voidMinDim',
    void_min_dimension_mm: 'voidMinDimension',
    channel_bottom_height_cm: 'channelBottomHeight',
    socket_height_mm: 'socketHeight',
    // IP / IK ratings
    floor_socket_IP: 'floorSocketIP', floor_socket_IK: 'floorSocketIK',
    enclosure_IP: 'enclosureIP', equipment_IP: 'equipmentIP',
    // Booleans
    all_circuits_have_DR: 'hasResidualCurrentDevice',
    floor_heating_has_metallic_grid_earthed: 'floorHeatingGridEarthed',
    ev_point_has_dedicated_circuit: 'evDedicatedCircuit',
    sockets_in_sauna: 'socketsInSauna',
    PE_continuity_verified: 'peContinuityVerified',
    // Capacity / breaking
    breaking_capacity_kA: 'breakingCapacity',
    // Power
    design_power_kVA: 'designPower',
    column_section: 'columnSection',
    max_entry_section: 'maxEntrySection',
    // Pool/bath
    wiring_class: 'wiringClass',
    dist: 'distanceFromBath',
    n_rooms: 'numberOfRooms', supply_type: 'supplyType',
    n_installations: 'numberOfInstallations',
    // Correction factor multipliers
    multi_layer_factor: 'multiLayerFactor', tube_factor: 'tubeFactor',
    soil_factor: 'soilFactor',
  };

  constructor(rules: ElectricalRule[]) {
    this.loadRules(rules);
  }

  private loadRules(rules: ElectricalRule[]) {
    for (const rule of rules) {
      this.rules.set(rule.id, rule);

      // Index by category
      if (!this.rulesByCategory.has(rule.subcategory)) {
        this.rulesByCategory.set(rule.subcategory, []);
      }
      this.rulesByCategory.get(rule.subcategory)!.push(rule);

      // Index by scope
      for (const scope of rule.metadata.application_scope) {
        if (!this.rulesByScope.has(scope)) {
          this.rulesByScope.set(scope, []);
        }
        this.rulesByScope.get(scope)!.push(rule);
      }
    }
  }

  /**
   * Valida um contexto contra todas as regras aplicáveis
   */
  async validate(context: ValidationContext): Promise<ValidationReport> {
    const applicableRules = this.getApplicableRules(context);
    const results: ValidationResult[] = [];

    for (const rule of applicableRules) {
      try {
        const result = await this.validateRule(rule, context);
        results.push(result);
      } catch (error) {
        console.error(`Error validating rule ${rule.id}:`, error);
        results.push({
          ruleId: rule.id,
          ruleName: rule.subcategory,
          passed: false,
          severity: rule.severity,
          message: `Erro na validação: ${error}`,
          metadata: {
            reference: rule.reference,
            category: rule.category
          }
        });
      }
    }

    return this.generateReport(context, results);
  }

  /**
   * Valida uma regra específica
   */
  private async validateRule(
    rule: ElectricalRule,
    context: ValidationContext
  ): Promise<ValidationResult> {
    // Check if rule conditions are met
    if (rule.conditions && !this.evaluateConditions(rule.conditions, context)) {
      return {
        ruleId: rule.id,
        ruleName: rule.subcategory,
        passed: true,
        severity: rule.severity,
        message: 'Regra não aplicável neste contexto',
        metadata: {
          reference: rule.reference,
          category: rule.category
        }
      };
    }

    let passed = false;
    let details: any = {};

    switch (rule.validation_type) {
      case 'minimum':
        passed = this.validateMinimum(rule, context, details);
        break;
      case 'maximum':
        passed = this.validateMaximum(rule, context, details);
        break;
      case 'range':
        passed = this.validateRange(rule, context, details);
        break;
      case 'formula':
        passed = await this.validateFormula(rule, context, details);
        break;
      case 'lookup_table':
        passed = this.validateLookupTable(rule, context, details);
        break;
      case 'conditional':
        passed = this.validateConditional(rule, context, details);
        break;
      default:
        throw new Error(`Unknown validation type: ${rule.validation_type}`);
    }

    return {
      ruleId: rule.id,
      ruleName: rule.subcategory,
      passed,
      severity: rule.severity,
      message: passed ? rule.success_message : rule.error_message,
      details: Object.keys(details).length > 0 ? details : undefined,
      metadata: {
        reference: rule.reference,
        category: rule.category
      }
    };
  }

  private validateMinimum(
    rule: ElectricalRule,
    context: ValidationContext,
    details: any
  ): boolean {
    // Extract minimum value from parameters
    const minValue = this.extractValue(rule.parameters, 'min', 'minimum');
    const actualValue = this.extractValue(context.parameters, this.getParameterKey(rule));

    details.expected = `>= ${minValue}`;
    details.actual = actualValue;

    return actualValue >= minValue;
  }

  private validateMaximum(
    rule: ElectricalRule,
    context: ValidationContext,
    details: any
  ): boolean {
    const maxValue = this.extractValue(rule.parameters, 'max', 'maximum');
    const actualValue = this.extractValue(context.parameters, this.getParameterKey(rule));

    details.expected = `<= ${maxValue}`;
    details.actual = actualValue;

    return actualValue <= maxValue;
  }

  private validateRange(
    rule: ElectricalRule,
    context: ValidationContext,
    details: any
  ): boolean {
    const minValue = this.extractValue(rule.parameters, 'min', 'minimum');
    const maxValue = this.extractValue(rule.parameters, 'max', 'maximum');
    const actualValue = this.extractValue(context.parameters, this.getParameterKey(rule));

    details.expected = `${minValue} - ${maxValue}`;
    details.actual = actualValue;

    return actualValue >= minValue && actualValue <= maxValue;
  }

  private async validateFormula(
    rule: ElectricalRule,
    context: ValidationContext,
    details: any
  ): Promise<boolean> {
    if (!rule.formula) {
      throw new Error('Formula validation requires a formula');
    }

    try {
      const augmentedParams = { ...rule.parameters, __lookupTables: rule.lookup_tables };
      const result = await this.evaluateFormula(rule.formula, context.parameters, augmentedParams);
      details.calculation = result;
      details.formula = rule.formula;
      details.category = this.classifyFormula(rule.formula);
      return result.valid;
    } catch (error) {
      details.error = `Erro ao avaliar fórmula: ${error}`;
      return false;
    }
  }

  private validateLookupTable(
    rule: ElectricalRule,
    context: ValidationContext,
    details: any
  ): boolean {
    if (!rule.lookup_tables) {
      throw new Error('Lookup table validation requires lookup_tables');
    }

    try {
      const result = this.lookupValue(rule.lookup_tables, context.parameters);
      details.lookup_result = result;
      return result.valid;
    } catch (error) {
      details.error = `Erro na consulta de tabela: ${error}`;
      return false;
    }
  }

  private validateConditional(
    rule: ElectricalRule,
    context: ValidationContext,
    details: any
  ): boolean {
    // Implementar lógica condicional baseada nas condições da regra
    if (!rule.conditions) {
      return true;
    }

    return this.evaluateConditions(rule.conditions, context);
  }

  private evaluateConditions(conditions: any, context: ValidationContext): boolean {
    // Implementar avaliação de condições
    // Exemplo: { "scope": "bathroom", "voltage": "<=50V" }

    for (const [key, value] of Object.entries(conditions)) {
      const contextValue = this.extractValue(context, key) ||
                          this.extractValue(context.parameters, key);

      if (!this.compareValues(contextValue, value)) {
        return false;
      }
    }

    return true;
  }

  // ============================================================
  // FORMULA EVALUATION ENGINE
  // ============================================================

  private async evaluateFormula(
    formula: string,
    contextParams: any,
    ruleParams: any
  ): Promise<FormulaResult> {
    try {
      const category = this.classifyFormula(formula);
      const lookupTables = ruleParams?.__lookupTables;

      switch (category) {
        case 'boolean':
          return this.handleBoolean(formula, contextParams, ruleParams);
        case 'simple':
          return this.handleSimpleComparison(formula, contextParams, ruleParams);
        case 'lookup':
          return this.handleLookupComparison(formula, contextParams, ruleParams, lookupTables);
        case 'correction':
          return this.handleCorrectionFactor(formula, contextParams, ruleParams, lookupTables);
        case 'math':
          return this.handleMathFormula(formula, contextParams, ruleParams, lookupTables);
        case 'conditional':
          return this.handleConditional(formula, contextParams, ruleParams);
        case 'compound':
          return this.handleCompound(formula, contextParams, ruleParams);
        default:
          return { valid: true, result: 'Unknown formula category (skipped)' };
      }
    } catch (error) {
      return { valid: true, result: `Formula evaluation error: ${error} (treated as pass)` };
    }
  }

  // ============================================================
  // LOOKUP TABLE NAVIGATION
  // ============================================================

  private lookupValue(
    lookupTable: any,
    parameters: any
  ): { valid: boolean; result?: any; error?: string } {
    try {
      const table = lookupTable?.lookup_table || lookupTable;
      if (!table || typeof table !== 'object') {
        return { valid: true, result: 'No lookup table data' };
      }

      // Determine navigation keys from context parameters
      const keys: (string | number)[] = [];
      if (parameters.conductorMaterial || parameters.material)
        keys.push(parameters.conductorMaterial || parameters.material);
      if (parameters.conductorSection || parameters.section_mm2)
        keys.push(parameters.conductorSection || parameters.section_mm2);
      if (parameters.installationMethod || parameters.method)
        keys.push(parameters.installationMethod || parameters.method);

      if (keys.length === 0) {
        return { valid: true, result: 'No lookup keys available in context (skipped)' };
      }

      const value = this.navigateTable(table, keys);
      if (value === undefined) {
        return { valid: true, result: `Lookup path not found: ${keys.join(' → ')} (skipped)` };
      }

      return { valid: true, result: { lookedUpValue: value, path: keys } };
    } catch (error) {
      return { valid: false, error: `${error}` };
    }
  }

  // ============================================================
  // CLASSIFICATION
  // ============================================================

  /** Classify formula string into evaluation category */
  classifyFormula(formula: string): FormulaCategory {
    const f = formula.trim();

    // F: Boolean — "variable == True/False"
    if (/^\w+\s*==\s*(True|False)$/i.test(f)) return 'boolean';

    // E: Conditional — starts with "IF " or contains "; IF "
    if (/^IF\s/i.test(f) || /;\s*IF\s/i.test(f)) return 'conditional';

    // C: Correction factor — "Iz_corrected = Iz_base * ..." (check BEFORE generic lookup)
    if (/Iz_corrected\s*=\s*Iz_base\s*\*/.test(f)) return 'correction';

    // B: Lookup — contains "lookup_xxx(...)"
    if (/lookup_\w+\(/.test(f)) return 'lookup';

    // D: Math — contains ^, sqrt, I²t, or multi-variable products with comparison
    if (/\^|sqrt|I\u00b2t|Icc\^2/i.test(f)) return 'math';
    if (/\w+\s*\*\s*\w+\s*(<=|>=|<|>)\s*\w+/.test(f)) return 'math';

    // G: Compound — contains AND or MAX/MIN (but not IF-THEN which was caught above)
    if (/\bAND\b|\bOR\b/i.test(f)) return 'compound';
    if (/\bMAX\b|\bMIN\b/i.test(f)) return 'compound';

    // A: Simple comparison — default
    return 'simple';
  }

  // ============================================================
  // VARIABLE RESOLUTION
  // ============================================================

  /** Resolve a formula variable name to its value from context or rule parameters */
  private resolveVariable(
    varName: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): number | string | boolean | undefined {
    // 1. Direct match in context
    if (contextParams[varName] !== undefined) return contextParams[varName];

    // 2. Alias map
    const alias = ElectricalRulesEngine.FORMULA_VAR_MAP[varName];
    if (alias && contextParams[alias] !== undefined) return contextParams[alias];

    // 3. Rule parameters (some constants embedded in rules)
    if (ruleParams[varName] !== undefined && varName !== '__lookupTables') return ruleParams[varName];

    // 4. Unit-stripped fuzzy match
    const stripped = varName.replace(/_mA$|_mm2$|_A$|_V$|_ohm$|_s$|_C$|_percent$|_kA$|_kVA$/, '');
    if (stripped !== varName) {
      if (contextParams[stripped] !== undefined) return contextParams[stripped];
      const strippedAlias = ElectricalRulesEngine.FORMULA_VAR_MAP[stripped];
      if (strippedAlias && contextParams[strippedAlias] !== undefined) return contextParams[strippedAlias];
    }

    return undefined;
  }

  // ============================================================
  // TABLE NAVIGATION
  // ============================================================

  /** Navigate nested lookup table by key sequence */
  private navigateTable(table: any, keys: (string | number)[]): any {
    let current = table;
    for (const key of keys) {
      if (current === undefined || current === null || typeof current !== 'object') return undefined;

      const strKey = String(key);
      // Exact string match
      if (current[strKey] !== undefined) {
        current = current[strKey];
        continue;
      }

      // Numeric closest-key fallback (for section sizes like 4, 6, 10, 16, 25...)
      if (typeof key === 'number' || !isNaN(Number(key))) {
        const numKey = Number(key);
        const numKeys = Object.keys(current)
          .map(Number)
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);

        if (numKeys.length > 0) {
          // Find the largest key <= the requested value (conservative: don't exceed rating)
          const floorKey = numKeys.filter(k => k <= numKey).pop();
          const chosen = floorKey !== undefined ? floorKey : numKeys[0];
          current = current[String(chosen)];
          continue;
        }
      }

      return undefined;
    }
    return current;
  }

  // ============================================================
  // NUMERIC COMPARISON
  // ============================================================

  private compareNumeric(actual: number, operator: string, expected: number): boolean {
    switch (operator) {
      case '<=': return actual <= expected;
      case '>=': return actual >= expected;
      case '<':  return actual < expected;
      case '>':  return actual > expected;
      case '==': return Math.abs(actual - expected) < 0.001;
      case '!=': return Math.abs(actual - expected) >= 0.001;
      default: return false;
    }
  }

  /** Evaluate a single comparison expression like "var <= 30" or "var1 <= var2" */
  private evaluateSingleComparison(
    expr: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): boolean | undefined {
    const e = expr.trim();

    // "var op constant"
    const constMatch = e.match(/^([\w.+]+)\s*(<=|>=|<|>|==|!=)\s*([\d.]+)$/);
    if (constMatch) {
      const val = this.resolveVariable(constMatch[1], contextParams, ruleParams);
      if (val === undefined) return undefined;
      return this.compareNumeric(Number(val), constMatch[2], parseFloat(constMatch[3]));
    }

    // "var op var"
    const varMatch = e.match(/^([\w.]+)\s*(<=|>=|<|>|==|!=)\s*([\w.]+)$/);
    if (varMatch) {
      const left = this.resolveVariable(varMatch[1], contextParams, ruleParams);
      const right = this.resolveVariable(varMatch[3], contextParams, ruleParams);
      if (left === undefined || right === undefined) return undefined;
      return this.compareNumeric(Number(left), varMatch[2], Number(right));
    }

    // "var/var op constant" (e.g., cable_area/void_area <= 0.25)
    const divMatch = e.match(/^([\w.]+)\s*\/\s*([\w.]+)\s*(<=|>=|<|>)\s*([\d.]+)$/);
    if (divMatch) {
      const num = this.resolveVariable(divMatch[1], contextParams, ruleParams);
      const den = this.resolveVariable(divMatch[2], contextParams, ruleParams);
      if (num === undefined || den === undefined || Number(den) === 0) return undefined;
      return this.compareNumeric(Number(num) / Number(den), divMatch[3], parseFloat(divMatch[4]));
    }

    return undefined;
  }

  // ============================================================
  // CATEGORY HANDLERS
  // ============================================================

  /** F: Boolean checks — "variable == True/False" */
  private handleBoolean(
    formula: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): FormulaResult {
    const match = formula.trim().match(/^(\w+)\s*==\s*(True|False)$/i);
    if (!match) return { valid: true, result: 'Unparseable boolean formula (skipped)' };

    const [, varName, expectedStr] = match;
    const expected = expectedStr.toLowerCase() === 'true';
    const actual = this.resolveVariable(varName, contextParams, ruleParams);

    if (actual === undefined) {
      return { valid: true, result: `Variable ${varName} not in context (skipped)` };
    }

    const passed = Boolean(actual) === expected;
    return { valid: passed, result: { variable: varName, actual: Boolean(actual), expected } };
  }

  /** A: Simple comparison — "variable <= constant" */
  private handleSimpleComparison(
    formula: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): FormulaResult {
    // Try parsing "var op constant"
    const match = formula.trim().match(/^([\w.+]+)\s*(<=|>=|<|>|==|!=)\s*([\d.]+)$/);
    if (!match) {
      // Try IP rating comparison like "enclosure_IP >= 'IP2X'"
      const ipMatch = formula.trim().match(/^(\w+)\s*>=\s*'?(IP\w+)'?$/);
      if (ipMatch) {
        const actual = this.resolveVariable(ipMatch[1], contextParams, ruleParams);
        if (actual === undefined) return { valid: true, result: `Variable ${ipMatch[1]} not in context (skipped)` };
        // IP rating comparison: extract numeric part
        const actualIP = String(actual).replace(/[^\d]/g, '');
        const requiredIP = ipMatch[2].replace(/[^\d]/g, '');
        if (!actualIP || !requiredIP) return { valid: true, result: 'IP rating not comparable (skipped)' };
        const passed = parseInt(actualIP) >= parseInt(requiredIP);
        return { valid: passed, result: { variable: ipMatch[1], actual, required: ipMatch[2] } };
      }
      // Try "ABS(var) <= constant"
      const absMatch = formula.trim().match(/^ABS\((\w+)\)\s*(<=|>=|<|>)\s*([\d.]+)$/);
      if (absMatch) {
        const val = this.resolveVariable(absMatch[1], contextParams, ruleParams);
        if (val === undefined) return { valid: true, result: `Variable ${absMatch[1]} not in context (skipped)` };
        const passed = this.compareNumeric(Math.abs(Number(val)), absMatch[2], parseFloat(absMatch[3]));
        return { valid: passed, result: { variable: absMatch[1], actual: Math.abs(Number(val)), operator: absMatch[2], expected: parseFloat(absMatch[3]) } };
      }
      return { valid: true, result: 'Unparseable simple formula (skipped)' };
    }

    const [, varName, operator, constantStr] = match;
    const constant = parseFloat(constantStr);
    const actual = this.resolveVariable(varName, contextParams, ruleParams);

    if (actual === undefined) {
      return { valid: true, result: `Variable ${varName} not in context (skipped)` };
    }

    const numActual = typeof actual === 'number' ? actual : parseFloat(String(actual));
    if (isNaN(numActual)) {
      return { valid: true, result: `Variable ${varName} is not numeric (skipped)` };
    }

    const passed = this.compareNumeric(numActual, operator, constant);
    return { valid: passed, result: { variable: varName, actual: numActual, operator, expected: constant } };
  }

  /** B: Lookup comparison — "variable <= lookup_XXX(arg1, arg2, ...)" */
  private handleLookupComparison(
    formula: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>,
    lookupTables: any
  ): FormulaResult {
    // Parse: "var op lookup_XXX(arg1, arg2, ...)" or "var = lookup_..."
    const match = formula.match(/^(\w+)\s*(<=|>=|<|>|==|=)\s*lookup_\w+\(([^)]+)\)/);
    if (!match) {
      // Some formulas have "result = value * lookup_xxx(...)" — handle as correction
      if (/=.*\*.*lookup_/.test(formula)) {
        return this.handleCorrectionFactor(formula, contextParams, ruleParams, lookupTables);
      }
      // Some like "simultaneity_factor = lookup_803A(n_installations)"
      const assignMatch = formula.match(/^(\w+)\s*=\s*lookup_\w+\(([^)]+)\)/);
      if (assignMatch) {
        // This is an assignment, not a comparison — just verify the lookup resolves
        const args = assignMatch[2].split(',').map(a => a.trim());
        const resolvedArgs = this.resolveAllArgs(args, contextParams, ruleParams);
        if (!resolvedArgs) return { valid: true, result: 'Lookup args not in context (skipped)' };
        const table = lookupTables?.lookup_table || ruleParams?.lookup_table;
        if (!table) return { valid: true, result: 'No lookup table (skipped)' };
        const value = this.navigateTable(table, resolvedArgs);
        return { valid: true, result: { assignment: assignMatch[1], lookupValue: value, path: resolvedArgs } };
      }
      return { valid: true, result: 'Unparseable lookup formula (skipped)' };
    }

    const [, varName, operator, argsStr] = match;
    const args = argsStr.split(',').map(a => a.trim());

    const actual = this.resolveVariable(varName, contextParams, ruleParams);
    if (actual === undefined) {
      return { valid: true, result: `Variable ${varName} not in context (skipped)` };
    }

    const resolvedArgs = this.resolveAllArgs(args, contextParams, ruleParams);
    if (!resolvedArgs) {
      return { valid: true, result: 'Lookup args not in context (skipped)' };
    }

    const table = lookupTables?.lookup_table || ruleParams?.lookup_table;
    if (!table) {
      return { valid: true, result: 'No lookup table available (skipped)' };
    }

    const lookedUp = this.navigateTable(table, resolvedArgs);
    if (lookedUp === undefined || typeof lookedUp === 'object') {
      return { valid: true, result: `Lookup path ${resolvedArgs.join(' → ')} not found (skipped)` };
    }

    const numActual = Number(actual);
    const numExpected = Number(lookedUp);
    const op = operator === '=' ? '<=' : operator; // "=" in formulas typically means "must not exceed"

    const passed = this.compareNumeric(numActual, op, numExpected);
    return { valid: passed, result: { variable: varName, actual: numActual, operator: op, lookupValue: numExpected, path: resolvedArgs } };
  }

  /** Resolve all formula arguments to values, returns null if any are missing */
  private resolveAllArgs(
    args: string[],
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): (string | number)[] | null {
    const resolved: (string | number)[] = [];
    for (const arg of args) {
      const val = this.resolveVariable(arg, contextParams, ruleParams);
      if (val === undefined) return null;
      resolved.push(val as string | number);
    }
    return resolved;
  }

  /** C: Correction factor — "Iz_corrected = Iz_base * lookup_XXX(...) [* factor]" */
  private handleCorrectionFactor(
    formula: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>,
    lookupTables: any
  ): FormulaResult {
    // Collect all lookup factors
    const lookupPattern = /lookup_\w+\(([^)]+)\)/g;
    const factors: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = lookupPattern.exec(formula)) !== null) {
      const args = match[1].split(',').map(a => a.trim());
      const resolvedArgs = this.resolveAllArgs(args, contextParams, ruleParams);
      if (!resolvedArgs) {
        return { valid: true, result: 'Correction factor args not in context (skipped)' };
      }

      const table = lookupTables?.lookup_table || ruleParams?.lookup_table;
      if (!table) return { valid: true, result: 'No correction factor table (skipped)' };

      const factor = this.navigateTable(table, resolvedArgs);
      if (typeof factor !== 'number') {
        return { valid: true, result: `Correction factor not found for ${resolvedArgs.join(' → ')} (skipped)` };
      }
      factors.push(factor);
    }

    // Check for extra multiplier variables like "* multi_layer_factor"
    const extraFactors = formula.match(/\*\s*(\w+)(?:\s|$)/g);
    if (extraFactors) {
      for (const ef of extraFactors) {
        const varName = ef.replace(/\*\s*/, '').trim();
        if (varName.startsWith('lookup_')) continue; // Already handled
        const val = this.resolveVariable(varName, contextParams, ruleParams);
        if (typeof val === 'number') factors.push(val);
      }
    }

    const izBase = this.resolveVariable('Iz_base', contextParams, ruleParams);
    const izCorrected = this.resolveVariable('Iz_corrected', contextParams, ruleParams);

    if (izBase === undefined || izCorrected === undefined) {
      // Can't verify — check if factors were at least resolvable
      if (factors.length > 0) {
        return { valid: true, result: { factors, note: 'Iz values not in context — factors resolved but not verified' } };
      }
      return { valid: true, result: 'Iz_base or Iz_corrected not in context (skipped)' };
    }

    const expected = (izBase as number) * factors.reduce((a, b) => a * b, 1);
    const tolerance = 0.05; // 5% tolerance for rounding
    const passed = expected > 0 ? Math.abs((izCorrected as number) - expected) / expected <= tolerance : true;

    return { valid: passed, result: { izBase, izCorrected, factors, expectedCorrected: Math.round(expected * 100) / 100 } };
  }

  /** D: Mathematical formulas — algebraic expressions with specific sub-patterns */
  private handleMathFormula(
    formula: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>,
    lookupTables: any
  ): FormulaResult {
    const f = formula.trim();

    // D1: Product check — "Zs_ohm * Ia_A <= Uo_V" or "RA_ohm * Ia_A <= 50"
    const productMatch = f.match(/^(\w+)\s*\*\s*(\w+)\s*(<=|>=|<|>)\s*([\d.]+|\w+)$/);
    if (productMatch) {
      const [, v1, v2, op, rhs] = productMatch;
      const left1 = this.resolveVariable(v1, contextParams, ruleParams);
      const left2 = this.resolveVariable(v2, contextParams, ruleParams);
      if (left1 === undefined || left2 === undefined) {
        return { valid: true, result: `Variables ${v1}/${v2} not in context (skipped)` };
      }
      const product = Number(left1) * Number(left2);
      const rhsVal = isNaN(Number(rhs))
        ? this.resolveVariable(rhs, contextParams, ruleParams)
        : Number(rhs);
      if (rhsVal === undefined) return { valid: true, result: `RHS ${rhs} not in context (skipped)` };
      const passed = this.compareNumeric(product, op, Number(rhsVal));
      return { valid: passed, result: { left: `${v1}*${v2}`, product, operator: op, expected: Number(rhsVal) } };
    }

    // D2: PE sizing — "S_pe >= sqrt(I²t) / k" or "S_pe_mm2 >= sqrt(I_fault_A^2 * t_s) / k"
    if (/S_pe.*>=.*sqrt/.test(f) || /S\s*=\s*sqrt/.test(f)) {
      const sPe = this.resolveVariable('S_pe', contextParams, ruleParams)
        ?? this.resolveVariable('S_pe_mm2', contextParams, ruleParams);
      const iFault = this.resolveVariable('I_fault_A', contextParams, ruleParams)
        ?? this.resolveVariable('faultCurrent', contextParams, ruleParams);
      const t = this.resolveVariable('t_s', contextParams, ruleParams)
        ?? this.resolveVariable('disconnectionTime', contextParams, ruleParams);

      // k value from lookup tables
      let k: number | undefined;
      const kTable = lookupTables?.lookup_table || ruleParams?.lookup_table;
      if (kTable) {
        const insulation = this.resolveVariable('insulation_type', contextParams, ruleParams);
        const mat = this.resolveVariable('material', contextParams, ruleParams);
        if (insulation && mat) {
          const kVal = this.navigateTable(kTable, [String(insulation), String(mat)]);
          if (typeof kVal === 'number') k = kVal;
        }
      }
      if (k === undefined) k = ruleParams?.k as number | undefined;

      if (sPe === undefined || iFault === undefined || t === undefined || k === undefined) {
        return { valid: true, result: 'PE sizing variables not in context (skipped)' };
      }

      const required = Math.sqrt(Number(iFault) ** 2 * Number(t)) / Number(k);
      const passed = Number(sPe) >= required;
      return { valid: passed, result: { sPe: Number(sPe), required: Math.round(required * 100) / 100, iFault: Number(iFault), t: Number(t), k: Number(k) } };
    }

    // D3: Energy let-through — "Icc^2 * t <= k^2 * S^2"
    if (/Icc\^2\s*\*\s*t\s*<=\s*k\^2\s*\*\s*S\^2/.test(f)) {
      const Icc = this.resolveVariable('Icc_presumed_kA', contextParams, ruleParams);
      const t = this.resolveVariable('t_s', contextParams, ruleParams);
      const k = ruleParams?.k ?? this.resolveVariable('k', contextParams, ruleParams);
      const S = this.resolveVariable('S', contextParams, ruleParams);
      if (Icc === undefined || t === undefined || k === undefined || S === undefined) {
        return { valid: true, result: 'Energy let-through variables not in context (skipped)' };
      }
      const leftSide = Number(Icc) ** 2 * Number(t);
      const rightSide = Number(k) ** 2 * Number(S) ** 2;
      const passed = leftSide <= rightSide;
      return { valid: passed, result: { 'Icc²t': leftSide, 'k²S²': rightSide } };
    }

    // D4: Coordination — "IB_A <= In_A AND In_A <= Iz_A" (classified as math due to chained <=)
    if (/IB.*<=.*In.*<=.*Iz|IB.*<=.*In.*AND.*In.*<=.*Iz/i.test(f)) {
      const IB = this.resolveVariable('IB_A', contextParams, ruleParams);
      const In = this.resolveVariable('In_A', contextParams, ruleParams);
      const Iz = this.resolveVariable('Iz_A', contextParams, ruleParams);
      if (IB === undefined || In === undefined || Iz === undefined) {
        return { valid: true, result: 'Coordination variables not in context (skipped)' };
      }
      const passed = Number(IB) <= Number(In) && Number(In) <= Number(Iz);
      return { valid: passed, result: { IB: Number(IB), In: Number(In), Iz: Number(Iz), 'IB<=In': Number(IB) <= Number(In), 'In<=Iz': Number(In) <= Number(Iz) } };
    }

    // D5: Conventional tripping — "I2_A <= 1.45 * Iz_A"
    if (/I2_A\s*<=\s*([\d.]+)\s*\*\s*Iz_A/.test(f)) {
      const m = f.match(/I2_A\s*<=\s*([\d.]+)\s*\*\s*Iz_A/);
      const I2 = this.resolveVariable('I2_A', contextParams, ruleParams);
      const Iz = this.resolveVariable('Iz_A', contextParams, ruleParams);
      if (I2 === undefined || Iz === undefined || !m) {
        return { valid: true, result: 'Tripping current variables not in context (skipped)' };
      }
      const factor = parseFloat(m[1]);
      const limit = factor * Number(Iz);
      const passed = Number(I2) <= limit;
      return { valid: passed, result: { I2: Number(I2), limit, Iz: Number(Iz), factor } };
    }

    // D6: Polynomial — "I_admissivel = A * S^m - B * S^n" (informational, no comparison)
    if (/A\s*\*\s*S\^m/.test(f) || /I_admissivel\s*=/.test(f)) {
      const S = this.resolveVariable('S', contextParams, ruleParams);
      if (S === undefined) {
        return { valid: true, result: 'Section S not in context for polynomial (skipped)' };
      }
      // Try to compute I using formula_params
      const formulaParams = ruleParams?.formula_params;
      if (!formulaParams) {
        return { valid: true, result: 'No formula_params for polynomial (skipped)' };
      }
      // This rule is informational — it defines the general formula, not a specific check
      return { valid: true, result: { note: 'General formula definition', S: Number(S) } };
    }

    // D7: RB formula — "RB_ohm <= (50 * RE_ohm) / (Uo_V - 50)"
    if (/RB_ohm\s*<=/.test(f) && /RE_ohm/.test(f)) {
      const RB = this.resolveVariable('RB_ohm', contextParams, ruleParams);
      const RE = this.resolveVariable('RE_ohm', contextParams, ruleParams);
      const Uo = this.resolveVariable('Uo_V', contextParams, ruleParams);
      if (RB === undefined || RE === undefined || Uo === undefined) {
        return { valid: true, result: 'RB/RE/Uo not in context (skipped)' };
      }
      const limit = (50 * Number(RE)) / (Number(Uo) - 50);
      const passed = Number(RB) <= limit;
      return { valid: passed, result: { RB: Number(RB), limit: Math.round(limit * 100) / 100, RE: Number(RE), Uo: Number(Uo) } };
    }

    // D8: Leakage — "leakage_current <= IDn * 0.33"
    if (/leakage_current\s*<=\s*(\w+)\s*\*\s*([\d.]+)/.test(f)) {
      const m = f.match(/leakage_current\s*<=\s*(\w+)\s*\*\s*([\d.]+)/);
      if (!m) return { valid: true, result: 'Unparseable leakage formula (skipped)' };
      const leakage = this.resolveVariable('leakage_current', contextParams, ruleParams);
      const base = this.resolveVariable(m[1], contextParams, ruleParams);
      if (leakage === undefined || base === undefined) {
        return { valid: true, result: 'Leakage variables not in context (skipped)' };
      }
      const limit = Number(base) * parseFloat(m[2]);
      const passed = Number(leakage) <= limit;
      return { valid: passed, result: { leakage: Number(leakage), limit } };
    }

    // D9: IDn fraction — "IDn_A <= 0.15 * Iz_neutral_A"
    if (/IDn_A\s*<=\s*([\d.]+)\s*\*\s*(\w+)/.test(f)) {
      const m = f.match(/IDn_A\s*<=\s*([\d.]+)\s*\*\s*(\w+)/);
      if (!m) return { valid: true, result: 'Unparseable IDn fraction (skipped)' };
      const IDn = this.resolveVariable('IDn_A', contextParams, ruleParams);
      const base = this.resolveVariable(m[2], contextParams, ruleParams);
      if (IDn === undefined || base === undefined) {
        return { valid: true, result: 'IDn/base not in context (skipped)' };
      }
      const limit = parseFloat(m[1]) * Number(base);
      const passed = Number(IDn) <= limit;
      return { valid: passed, result: { IDn: Number(IDn), limit } };
    }

    // Fallback for unrecognized math patterns
    return { valid: true, result: `Complex math formula not yet handled: ${f.substring(0, 60)} (skipped)` };
  }

  /** E: Conditional — "IF condition THEN requirement [; IF ...]" */
  private handleConditional(
    formula: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): FormulaResult {
    // Split on "; IF " and normalize first clause
    const rawClauses = formula.split(/;\s*IF\s+/i);
    rawClauses[0] = rawClauses[0].replace(/^IF\s+/i, '');

    for (const clause of rawClauses) {
      const thenMatch = clause.match(/(.+?)\s+THEN\s+(.+)/i);
      if (!thenMatch) continue;

      const [, condition, requirement] = thenMatch;

      // Evaluate condition
      const condResult = this.evaluateConditionExpr(condition.trim(), contextParams, ruleParams);
      if (condResult === undefined) continue; // Variables missing, try next
      if (!condResult) continue; // Condition not met, try next

      // Condition met — evaluate requirement
      const reqResult = this.evaluateRequirementExpr(requirement.trim(), contextParams, ruleParams);
      if (reqResult === undefined) {
        return { valid: true, result: `Requirement variables not in context (skipped)` };
      }

      return { valid: reqResult, result: { matchedCondition: condition, requirement, satisfied: reqResult } };
    }

    return { valid: true, result: 'No applicable condition matched (skipped)' };
  }

  /** Evaluate a condition expression like "Cu", "S_fase<=16", "protected" */
  private evaluateConditionExpr(
    cond: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): boolean | undefined {
    const c = cond.trim();

    // Range check: "16<S_fase<=35"
    const rangeMatch = c.match(/^([\d.]+)\s*<\s*(\w+)\s*<=\s*([\d.]+)$/);
    if (rangeMatch) {
      const val = this.resolveVariable(rangeMatch[2], contextParams, ruleParams);
      if (val === undefined) return undefined;
      return Number(val) > parseFloat(rangeMatch[1]) && Number(val) <= parseFloat(rangeMatch[3]);
    }

    // Comparison: "S_fase<=16", "S_fase>35"
    const cmpMatch = c.match(/^(\w+)\s*(<=|>=|<|>|==)\s*([\d.]+)$/);
    if (cmpMatch) {
      const val = this.resolveVariable(cmpMatch[1], contextParams, ruleParams);
      if (val === undefined) return undefined;
      return this.compareNumeric(Number(val), cmpMatch[2], parseFloat(cmpMatch[3]));
    }

    // Material check: bare "Cu" or "Al"
    if (c === 'Cu' || c === 'Al') {
      const mat = this.resolveVariable('material', contextParams, ruleParams);
      if (mat === undefined) return undefined;
      return String(mat) === c;
    }

    // Boolean flag: "protected", "unprotected", "monophasic", "steel", etc.
    if (/^[a-z_]+$/i.test(c)) {
      const val = this.resolveVariable(c, contextParams, ruleParams);
      if (val === undefined) return undefined;
      return Boolean(val);
    }

    // Compound with OR: "S_phase_Cu<=16 OR monophasic"
    if (/\bOR\b/i.test(c)) {
      const parts = c.split(/\s+OR\s+/i);
      for (const part of parts) {
        const r = this.evaluateConditionExpr(part.trim(), contextParams, ruleParams);
        if (r === true) return true;
      }
      return false;
    }

    return undefined;
  }

  /** Evaluate a requirement expression like "S_pe>=S_fase", "S_pe>=16", "S>=2.5" */
  private evaluateRequirementExpr(
    req: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): boolean | undefined {
    const r = req.trim();

    // Handle compound requirements with AND
    if (/\s+AND\s+/i.test(r)) {
      const parts = r.split(/\s+AND\s+/i);
      const results: boolean[] = [];
      for (const part of parts) {
        const result = this.evaluateRequirementExpr(part.trim(), contextParams, ruleParams);
        if (result === undefined) return undefined;
        results.push(result);
      }
      return results.every(Boolean);
    }

    // "var >= var/constant" e.g. "S_pe>=S_fase/2"
    const divReqMatch = r.match(/^(\w+)\s*(>=|<=|>|<|==)\s*(\w+)\s*\/\s*([\d.]+)$/);
    if (divReqMatch) {
      const left = this.resolveVariable(divReqMatch[1], contextParams, ruleParams);
      const right = this.resolveVariable(divReqMatch[3], contextParams, ruleParams);
      if (left === undefined || right === undefined) return undefined;
      return this.compareNumeric(Number(left), divReqMatch[2], Number(right) / parseFloat(divReqMatch[4]));
    }

    // "var >= constant"
    const constMatch = r.match(/^(\w+)\s*(>=|<=|>|<|==)\s*([\d.]+)$/);
    if (constMatch) {
      const val = this.resolveVariable(constMatch[1], contextParams, ruleParams);
      if (val === undefined) return undefined;
      return this.compareNumeric(Number(val), constMatch[2], parseFloat(constMatch[3]));
    }

    // "var >= var"
    const varMatch = r.match(/^(\w+)\s*(>=|<=|>|<|==)\s*(\w+)$/);
    if (varMatch) {
      const left = this.resolveVariable(varMatch[1], contextParams, ruleParams);
      const right = this.resolveVariable(varMatch[3], contextParams, ruleParams);
      if (left === undefined || right === undefined) return undefined;
      return this.compareNumeric(Number(left), varMatch[2], Number(right));
    }

    // "var==var" (no spaces)
    const noSpaceMatch = r.match(/^(\w+)(>=|<=|>|<|==)(\w+)$/);
    if (noSpaceMatch) {
      const left = this.resolveVariable(noSpaceMatch[1], contextParams, ruleParams);
      const right = this.resolveVariable(noSpaceMatch[3], contextParams, ruleParams);
      if (left === undefined || right === undefined) return undefined;
      return this.compareNumeric(Number(left), noSpaceMatch[2], Number(right));
    }

    // Boolean requirement: "source_outside_012"
    if (/^[a-z_]+$/i.test(r)) {
      const val = this.resolveVariable(r, contextParams, ruleParams);
      if (val === undefined) return undefined;
      return Boolean(val);
    }

    return undefined;
  }

  /** G: Compound comparison — "expr1 AND expr2 [AND ...]" or with MAX/MIN */
  private handleCompound(
    formula: string,
    contextParams: Record<string, any>,
    ruleParams: Record<string, any>
  ): FormulaResult {
    let resolved = formula;

    // Replace MAX(a, b) with computed value
    const maxPattern = /MAX\(([^)]+)\)/gi;
    let maxMatch: RegExpExecArray | null;
    while ((maxMatch = maxPattern.exec(resolved)) !== null) {
      const args = maxMatch[1].split(',').map(a => a.trim());
      const numArgs = args.map(a => {
        const num = parseFloat(a);
        if (!isNaN(num)) return num;
        // Expression like "S_phase/2"
        const exprM = a.match(/^(\w+)\s*\/\s*([\d.]+)$/);
        if (exprM) {
          const val = this.resolveVariable(exprM[1], contextParams, ruleParams);
          if (typeof val === 'number') return val / parseFloat(exprM[2]);
        }
        // Expression like "0.5*S_max_PE"
        const mulM = a.match(/^([\d.]+)\s*\*\s*(\w+)$/);
        if (mulM) {
          const val = this.resolveVariable(mulM[2], contextParams, ruleParams);
          if (typeof val === 'number') return parseFloat(mulM[1]) * val;
        }
        const val = this.resolveVariable(a, contextParams, ruleParams);
        return typeof val === 'number' ? val : NaN;
      });

      if (numArgs.some(isNaN)) {
        return { valid: true, result: 'MAX() args not resolvable (skipped)' };
      }
      resolved = resolved.replace(maxMatch[0], String(Math.max(...numArgs)));
    }

    // Split on AND
    const parts = resolved.split(/\s+AND\s+/i);
    const results: { expr: string; passed: boolean }[] = [];

    for (const part of parts) {
      const partResult = this.evaluateSingleComparison(part.trim(), contextParams, ruleParams);
      if (partResult === undefined) {
        return { valid: true, result: 'Some compound variables not in context (skipped)' };
      }
      results.push({ expr: part.trim(), passed: partResult });
    }

    const allPassed = results.every(r => r.passed);
    return { valid: allPassed, result: { parts: results } };
  }

  private extractValue(obj: any, ...keys: string[]): any {
    for (const key of keys) {
      if (obj && typeof obj === 'object' && key in obj) {
        return obj[key];
      }
    }
    return undefined;
  }

  private getParameterKey(rule: ElectricalRule): string {
    // Determinar a chave do parâmetro baseado na categoria da regra
    if (rule.subcategory.toLowerCase().includes('corrente')) return 'current';
    if (rule.subcategory.toLowerCase().includes('secção')) return 'section';
    if (rule.subcategory.toLowerCase().includes('potência')) return 'power';
    if (rule.subcategory.toLowerCase().includes('tensão')) return 'voltage';

    return 'value';
  }

  private compareValues(actual: any, expected: any): boolean {
    // Comparar valores com suporte para operadores
    if (typeof expected === 'string' && expected.includes('<=')) {
      const value = parseFloat(expected.replace('<=', ''));
      return actual <= value;
    }
    if (typeof expected === 'string' && expected.includes('>=')) {
      const value = parseFloat(expected.replace('>=', ''));
      return actual >= value;
    }
    if (typeof expected === 'string' && expected.includes('<')) {
      const value = parseFloat(expected.replace('<', ''));
      return actual < value;
    }
    if (typeof expected === 'string' && expected.includes('>')) {
      const value = parseFloat(expected.replace('>', ''));
      return actual > value;
    }

    return actual === expected;
  }

  private getApplicableRules(context: ValidationContext): ElectricalRule[] {
    // Obter regras aplicáveis baseado no contexto
    const rules: ElectricalRule[] = [];

    // Por scope
    if (this.rulesByScope.has(context.scope)) {
      rules.push(...this.rulesByScope.get(context.scope)!);
    }

    // Regras gerais sempre aplicam
    if (this.rulesByScope.has('Geral')) {
      rules.push(...this.rulesByScope.get('Geral')!);
    }

    // Por tipo de projeto
    const projectScopes: Record<string, string[]> = {
      residential: ['Habitação', 'Geral'],
      commercial: ['Comercial', 'Geral'],
      industrial: ['Industrial', 'Geral']
    };

    for (const scope of projectScopes[context.projectType] || ['Geral']) {
      if (this.rulesByScope.has(scope)) {
        rules.push(...this.rulesByScope.get(scope)!);
      }
    }

    // Remover duplicados
    return Array.from(new Set(rules));
  }

  private generateReport(
    context: ValidationContext,
    results: ValidationResult[]
  ): ValidationReport {
    const summary = {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      warnings: results.filter(r => !r.passed && r.severity === 'recommended').length,
      critical: results.filter(r => !r.passed && r.severity === 'mandatory').length
    };

    return {
      timestamp: new Date().toISOString(),
      context,
      results,
      summary
    };
  }

  /**
   * Obtém estatísticas sobre as regras carregadas
   */
  getStatistics() {
    return {
      totalRules: this.rules.size,
      byCategory: Array.from(this.rulesByCategory.entries()).map(([cat, rules]) => ({
        category: cat,
        count: rules.length
      })),
      byScope: Array.from(this.rulesByScope.entries()).map(([scope, rules]) => ({
        scope,
        count: rules.length
      })),
      bySeverity: {
        mandatory: Array.from(this.rules.values()).filter(r => r.severity === 'mandatory').length,
        recommended: Array.from(this.rules.values()).filter(r => r.severity === 'recommended').length,
        informative: Array.from(this.rules.values()).filter(r => r.severity === 'informative').length
      },
      byComplexity: {
        simple: Array.from(this.rules.values()).filter(r => r.metadata.complexity === 'simple').length,
        medium: Array.from(this.rules.values()).filter(r => r.metadata.complexity === 'medium').length,
        complex: Array.from(this.rules.values()).filter(r => r.metadata.complexity === 'complex').length
      }
    };
  }

  /**
   * Obtém regras por categoria
   */
  getRulesByCategory(category: string): ElectricalRule[] {
    return this.rulesByCategory.get(category) || [];
  }

  /**
   * Obtém uma regra específica
   */
  getRule(ruleId: string): ElectricalRule | undefined {
    return this.rules.get(ruleId);
  }
}

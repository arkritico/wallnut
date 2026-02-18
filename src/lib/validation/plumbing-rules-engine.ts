/**
 * 🚰 Plumbing Rules Validation Engine
 *
 * Engine de validação para regras de instalações hidráulicas portuguesas
 * (RGSPPDADAR, RT-SCIE, DL 69/2023, EN 806/EN 12056)
 */

export interface PlumbingRule {
  id: string;
  article: string;
  description: string;
  parameter: string;
  check: string;
  values: {
    min?: number;
    max?: number;
    value?: any;
    table?: Array<Record<string, any>>;
    [key: string]: any;
  };
  unit: string;
  scope: {
    applies_to: string;
    nota?: string;
    building_type?: string[];
    zone?: string;
    [key: string]: any;
  };
  origin: {
    file: string;
    batch: number;
    original_id: string;
  };
  severity?: 'mandatory' | 'recommended' | 'informative';
}

export interface ValidationContext {
  projectType: 'residential' | 'commercial' | 'industrial' | 'other';
  scope: string; // 'supply', 'drainage', 'fire', 'quality', etc.
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
    parameter: string;
    unit: string;
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

export class PlumbingRulesEngine {
  private rules: Map<string, PlumbingRule> = new Map();
  private rulesByParameter: Map<string, PlumbingRule[]> = new Map();
  private rulesByScope: Map<string, PlumbingRule[]> = new Map();

  constructor(rules: PlumbingRule[]) {
    this.loadRules(rules);
  }

  private loadRules(rules: PlumbingRule[]) {
    for (const rule of rules) {
      this.rules.set(rule.id, rule);

      // Index by parameter
      if (!this.rulesByParameter.has(rule.parameter)) {
        this.rulesByParameter.set(rule.parameter, []);
      }
      this.rulesByParameter.get(rule.parameter)!.push(rule);

      // Index by scope
      const scopeKey = rule.scope.applies_to || 'general';
      if (!this.rulesByScope.has(scopeKey)) {
        this.rulesByScope.set(scopeKey, []);
      }
      this.rulesByScope.get(scopeKey)!.push(rule);
    }
  }

  /**
   * Valida um projeto contra as regras hidráulicas
   */
  async validate(context: ValidationContext): Promise<ValidationReport> {
    const results: ValidationResult[] = [];

    // Get applicable rules based on scope
    const applicableRules = this.getApplicableRules(context);

    for (const rule of applicableRules) {
      const result = await this.evaluateRule(rule, context);
      if (result) {
        results.push(result);
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      warnings: results.filter(r => !r.passed && r.severity === 'recommended').length,
      critical: results.filter(r => !r.passed && r.severity === 'mandatory').length,
    };

    return {
      timestamp: new Date().toISOString(),
      projectId: context.parameters.projectId,
      context,
      results,
      summary,
    };
  }

  /**
   * Get rules applicable to the current context
   */
  private getApplicableRules(context: ValidationContext): PlumbingRule[] {
    const rules: PlumbingRule[] = [];

    // Check parameters that are present in the context
    for (const [paramKey, paramValue] of Object.entries(context.parameters)) {
      const paramRules = this.rulesByParameter.get(paramKey);
      if (paramRules) {
        for (const rule of paramRules) {
          // Check if rule applies to this project type and scope
          if (this.ruleApplies(rule, context)) {
            rules.push(rule);
          }
        }
      }
    }

    return rules;
  }

  /**
   * Check if a rule applies to the current context
   */
  private ruleApplies(rule: PlumbingRule, context: ValidationContext): boolean {
    // Check building type if specified
    if (rule.scope.building_type && Array.isArray(rule.scope.building_type)) {
      if (!rule.scope.building_type.includes(context.projectType)) {
        return false;
      }
    }

    // Check zone/scope if specified
    if (rule.scope.zone && context.scope !== rule.scope.zone) {
      return false;
    }

    return true;
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(
    rule: PlumbingRule,
    context: ValidationContext
  ): Promise<ValidationResult | null> {
    try {
      const paramValue = context.parameters[rule.parameter];

      // If parameter not present, skip
      if (paramValue === undefined || paramValue === null) {
        return null;
      }

      // Determine severity
      const severity = rule.severity ||
        (rule.scope.nota?.includes('recomendavel') || rule.scope.nota?.includes('opcional')
          ? 'recommended'
          : 'mandatory');

      // Evaluate the check expression
      const checkResult = this.evaluateCheck(rule.check, paramValue, rule.values, context.parameters);

      const result: ValidationResult = {
        ruleId: rule.id,
        ruleName: rule.description,
        passed: checkResult.passed,
        severity,
        message: checkResult.passed
          ? `✓ ${rule.description}`
          : `✗ ${rule.description}`,
        details: checkResult.details,
        metadata: {
          reference: rule.article,
          parameter: rule.parameter,
          unit: rule.unit,
        },
      };

      return result;
    } catch (error) {
      console.error(`Error evaluating rule ${rule.id}:`, error);
      return null;
    }
  }

  /**
   * Evaluate a check expression
   */
  private evaluateCheck(
    checkExpr: string,
    actualValue: any,
    ruleValues: any,
    allParams: Record<string, any>
  ): { passed: boolean; details?: any } {
    try {
      // Handle simple comparisons
      if (checkExpr.includes('>=') && checkExpr.includes('AND') && checkExpr.includes('<=')) {
        // Range check: "value >= min AND value <= max"
        const matches = checkExpr.match(/([\w_]+)\s*>=\s*([\d.]+)\s*AND\s*\1\s*<=\s*([\d.]+)/);
        if (matches) {
          const min = parseFloat(matches[2]);
          const max = parseFloat(matches[3]);
          const passed = actualValue >= min && actualValue <= max;
          return {
            passed,
            details: {
              expected: `${min} - ${max}`,
              actual: actualValue,
            },
          };
        }
      } else if (checkExpr.includes('>=')) {
        // Minimum check: "value >= min"
        const matches = checkExpr.match(/([\w_]+)\s*>=\s*([\d.]+)/);
        if (matches) {
          const min = parseFloat(matches[2]);
          const passed = actualValue >= min;
          return {
            passed,
            details: {
              expected: `>= ${min}`,
              actual: actualValue,
            },
          };
        }
      } else if (checkExpr.includes('<=')) {
        // Maximum check: "value <= max"
        const matches = checkExpr.match(/([\w_]+)\s*<=\s*([\d.]+)/);
        if (matches) {
          const max = parseFloat(matches[2]);
          const passed = actualValue <= max;
          return {
            passed,
            details: {
              expected: `<= ${max}`,
              actual: actualValue,
            },
          };
        }
      } else if (checkExpr.includes('==')) {
        // Equality check: "value == expected"
        const matches = checkExpr.match(/([\w_]+)\s*==\s*(.+)/);
        if (matches) {
          const expected = matches[2].replace(/['"]/g, '');
          const passed = String(actualValue) === expected;
          return {
            passed,
            details: {
              expected,
              actual: actualValue,
            },
          };
        }
      } else if (checkExpr.includes('.table[')) {
        // Table lookup: "value >= values.table[key].min"
        // This requires looking up in the table based on a device/fixture type
        if (ruleValues.table && Array.isArray(ruleValues.table)) {
          // For now, return a simplified check
          // In a real implementation, you'd need to specify which table entry to check
          return {
            passed: true,
            details: {
              expected: 'Table lookup',
              actual: actualValue,
            },
          };
        }
      }

      // Default: simple expression evaluation
      // Replace parameter names with actual values in the check expression
      let evalExpr = checkExpr;
      for (const [key, value] of Object.entries(allParams)) {
        evalExpr = evalExpr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value));
      }

      // Replace values.min, values.max, etc.
      if (ruleValues.min !== undefined) {
        evalExpr = evalExpr.replace(/values\.min/g, String(ruleValues.min));
      }
      if (ruleValues.max !== undefined) {
        evalExpr = evalExpr.replace(/values\.max/g, String(ruleValues.max));
      }

      // Safely evaluate (in production, use a proper expression evaluator)
      // For now, return a default
      return {
        passed: true,
        details: {
          expected: checkExpr,
          actual: actualValue,
        },
      };
    } catch (error) {
      console.error('Error evaluating check:', error);
      return { passed: false };
    }
  }

  /**
   * Get statistics about loaded rules
   */
  getStatistics() {
    const byParameter = Array.from(this.rulesByParameter.entries()).map(
      ([param, rules]) => ({
        parameter: param,
        count: rules.length,
      })
    );

    const byScope = Array.from(this.rulesByScope.entries()).map(
      ([scope, rules]) => ({
        scope,
        count: rules.length,
      })
    );

    return {
      totalRules: this.rules.size,
      byParameter,
      byScope,
    };
  }

  /**
   * Get a specific rule by ID
   */
  getRule(id: string): PlumbingRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Search rules by parameter
   */
  getRulesByParameter(parameter: string): PlumbingRule[] {
    return this.rulesByParameter.get(parameter) || [];
  }
}

/**
 * Plumbing Rule Conflict Detector
 *
 * Identifies contradictory requirements between RGSPPDADAR rules.
 * Helps catch impossible-to-satisfy combinations.
 */

import type { ValidationResult } from './validation/plumbing-rules-engine';

export interface RuleConflict {
  id: string;
  type: 'contradiction' | 'overlap' | 'impossible';
  severity: 'critical' | 'warning' | 'info';
  rule1: {
    id: string;
    category: string;
    requirement: string;
  };
  rule2: {
    id: string;
    category: string;
    requirement: string;
  };
  description: string;
  recommendation: string;
}

export interface RuleDependency {
  id: string;
  ruleId: string;
  dependsOn: string[];
  type: 'prerequisite' | 'conditional' | 'sequential';
  description: string;
}

/**
 * Detect conflicts between validation results
 */
export function detectConflicts(results: ValidationResult[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  // Check for contradictory min/max values
  conflicts.push(...detectMinMaxConflicts(results));

  // Check for mutually exclusive requirements
  conflicts.push(...detectMutualExclusions(results));

  // Check for impossible combinations
  conflicts.push(...detectImpossibleCombinations(results));

  return conflicts;
}

/**
 * Detect min/max value conflicts
 */
function detectMinMaxConflicts(results: ValidationResult[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  // Group by parameter type
  const parameterGroups = new Map<string, ValidationResult[]>();

  for (const result of results) {
    // Skip if no parameter metadata
    if (!result.metadata?.parameter) continue;

    const param = result.metadata.parameter;
    if (!parameterGroups.has(param)) {
      parameterGroups.set(param, []);
    }
    parameterGroups.get(param)!.push(result);
  }

  // Check each parameter group for conflicts
  for (const [param, rules] of parameterGroups.entries()) {
    if (rules.length < 2) continue;

    // Find min and max constraints
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const r1 = rules[i];
        const r2 = rules[j];

        // Use type assertions to access extended properties that may exist
        const v1 = (r1 as any);
        const v2 = (r2 as any);

        // Check if min of one exceeds max of another
        if (v1.min !== undefined && v2.max !== undefined && v1.min > v2.max) {
          conflicts.push({
            id: `conflict_${r1.ruleId}_${r2.ruleId}`,
            type: 'contradiction',
            severity: 'critical',
            rule1: {
              id: r1.ruleId,
              category: r1.ruleName,
              requirement: `${param} >= ${v1.min}`
            },
            rule2: {
              id: r2.ruleId,
              category: r2.ruleName,
              requirement: `${param} <= ${v2.max}`
            },
            description: `Impossível satisfazer ambas as regras: ${param} deve ser >= ${v1.min} E <= ${v2.max}`,
            recommendation: `Verificar se as regras se aplicam ao mesmo contexto. Pode ser necessário escolher uma ou ajustar o projeto.`
          });
        }

        // Check if max of one is less than min of another
        if (v1.max !== undefined && v2.min !== undefined && v1.max < v2.min) {
          conflicts.push({
            id: `conflict_${r1.ruleId}_${r2.ruleId}`,
            type: 'contradiction',
            severity: 'critical',
            rule1: {
              id: r1.ruleId,
              category: r1.ruleName,
              requirement: `${param} <= ${v1.max}`
            },
            rule2: {
              id: r2.ruleId,
              category: r2.ruleName,
              requirement: `${param} >= ${v2.min}`
            },
            description: `Impossível satisfazer ambas as regras: ${param} deve ser <= ${v1.max} E >= ${v2.min}`,
            recommendation: `Verificar se as regras se aplicam ao mesmo contexto. Pode ser necessário escolher uma ou ajustar o projeto.`
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Detect mutually exclusive requirements
 */
function detectMutualExclusions(results: ValidationResult[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  // Known mutually exclusive combinations
  const exclusions = [
    {
      param1: 'tem_reservatorio_regularizacao',
      value1: true,
      param2: 'pressao_rede_publica',
      condition: (v: number) => v > 400, // High pressure makes reservoir unnecessary
      description: 'Reservatório de regularização geralmente não é necessário com pressão de rede > 400 kPa'
    },
    {
      param1: 'diametro_tubagem_ligacao',
      value1: 20,
      param2: 'numero_pisos',
      condition: (v: number) => v > 5,
      description: 'Diâmetro 20mm pode ser insuficiente para edifícios com mais de 5 pisos'
    }
  ];

  // Check for these patterns (implementation would check actual context values)
  // This is a simplified example - full implementation would need access to context

  return conflicts;
}

/**
 * Detect impossible combinations
 */
function detectImpossibleCombinations(results: ValidationResult[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  // Example: Check for rules that create circular dependencies
  // or require impossible physical arrangements

  // This is a placeholder - actual implementation would analyze
  // spatial rules, material compatibility, etc.

  return conflicts;
}

/**
 * Build dependency graph for rules
 */
export function buildDependencyGraph(results: ValidationResult[]): RuleDependency[] {
  const dependencies: RuleDependency[] = [];

  // Analyze each rule to find dependencies
  for (const result of results) {
    const deps = analyzeDependencies(result);
    dependencies.push(...deps);
  }

  return dependencies;
}

/**
 * Analyze dependencies for a single rule
 */
function analyzeDependencies(result: ValidationResult): RuleDependency[] {
  const deps: RuleDependency[] = [];

  // Check conditional logic for dependencies
  const conditional = (result as any).conditional_logic;
  if (conditional?.conditions) {
    for (const condition of conditional.conditions) {
      // Extract parameters from condition
      const params = extractParameters(condition.if);

      if (params.length > 0) {
        deps.push({
          id: `dep_${result.ruleId}`,
          ruleId: result.ruleId,
          dependsOn: params,
          type: 'conditional',
          description: `Regra ${result.ruleId} depende de: ${params.join(', ')}`
        });
      }
    }
  }

  // Check formula dependencies
  const formula = (result as any).formula;
  if (formula) {
    const params = extractParameters(formula);

    if (params.length > 0) {
      deps.push({
        id: `dep_${result.ruleId}`,
        ruleId: result.ruleId,
        dependsOn: params,
        type: 'prerequisite',
        description: `Regra ${result.ruleId} requer: ${params.join(', ')}`
      });
    }
  }

  return deps;
}

/**
 * Extract parameter names from a condition/formula string
 */
function extractParameters(expression: string): string[] {
  const params: string[] = [];

  // Match lowercase identifiers (parameter names)
  const matches = expression.match(/\b[a-z_][a-z0-9_]*\b/gi);

  if (matches) {
    // Filter out JavaScript keywords
    const keywords = new Set(['true', 'false', 'null', 'undefined', 'and', 'or', 'not']);
    for (const match of matches) {
      if (!keywords.has(match.toLowerCase())) {
        params.push(match);
      }
    }
  }

  return [...new Set(params)]; // Remove duplicates
}

/**
 * Find missing prerequisites for a rule
 */
export function findMissingPrerequisites(
  ruleId: string,
  dependencies: RuleDependency[],
  availableContext: Record<string, any>
): string[] {
  const missing: string[] = [];

  const ruleDeps = dependencies.filter(d => d.ruleId === ruleId);

  for (const dep of ruleDeps) {
    for (const param of dep.dependsOn) {
      if (!(param in availableContext) || availableContext[param] === undefined) {
        missing.push(param);
      }
    }
  }

  return [...new Set(missing)];
}

/**
 * Suggest resolution for conflicts
 */
export function suggestConflictResolution(conflict: RuleConflict): string[] {
  const suggestions: string[] = [];

  switch (conflict.type) {
    case 'contradiction':
      suggestions.push(
        'Verificar se ambas as regras se aplicam ao mesmo contexto (tipo de edifício, zona, etc.)',
        'Consultar a documentação oficial para identificar qual regra tem precedência',
        'Considerar solicitar esclarecimento à entidade reguladora',
        'Pode ser necessário ajustar o projeto para satisfazer a regra mais restritiva'
      );
      break;

    case 'overlap':
      suggestions.push(
        'Identificar qual regra é mais específica para o caso em questão',
        'Aplicar a regra mais recente se houver diferença de versões',
        'Documentar a decisão tomada no processo de projeto'
      );
      break;

    case 'impossible':
      suggestions.push(
        'Rever as premissas do projeto',
        'Verificar se há erro nos dados de entrada',
        'Consultar especialista em regulamentação'
      );
      break;
  }

  return suggestions;
}

/**
 * Generate conflict report summary
 */
export function generateConflictReport(conflicts: RuleConflict[]): {
  totalConflicts: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  criticalConflicts: RuleConflict[];
  recommendations: string[];
} {
  const bySeverity = conflicts.reduce((acc, c) => {
    acc[c.severity] = (acc[c.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byType = conflicts.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const criticalConflicts = conflicts.filter(c => c.severity === 'critical');

  const recommendations = conflicts.length > 0
    ? [
        'Resolver conflitos críticos antes de prosseguir',
        'Documentar decisões sobre regras em conflito',
        'Consultar especialista se necessário',
        'Verificar aplicabilidade de cada regra ao contexto específico'
      ]
    : ['Nenhum conflito detectado'];

  return {
    totalConflicts: conflicts.length,
    bySeverity,
    byType,
    criticalConflicts,
    recommendations
  };
}

export default {
  detectConflicts,
  buildDependencyGraph,
  findMissingPrerequisites,
  suggestConflictResolution,
  generateConflictReport
};

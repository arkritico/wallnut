/**
 * Universal Validation Framework - Base Types
 *
 * Sistema unificado para validação de todas as especialidades de projeto,
 * seguindo o padrão estabelecido pelo RTIEBT.
 */

// ============================================================================
// SPECIALTY TYPES
// ============================================================================

export type SpecialtyType =
  | 'electrical'          // ⚡ Elétrica (RTIEBT)
  | 'plumbing'           // 💧 Águas e esgotos
  | 'fire_safety'        // 🔥 Segurança contra incêndios
  | 'hvac'               // ❄️ AVAC
  | 'gas'                // ⛽ Gás
  | 'structures'         // 🏗️ Estruturas
  | 'thermal'            // 🌡️ Térmica
  | 'acoustic'           // 🔊 Acústica
  | 'accessibility'      // ♿ Acessibilidades
  | 'exterior'           // 🌳 Espaços exteriores
  | 'renewable_energy'   // 🔋 Energias renováveis
  | 'natural_lighting'   // ☀️ Iluminação natural
  | 'windows'            // 🚪 Vãos e caixilharias
  | 'walls'              // 🧱 Paredes e divisórias
  | 'roofs'              // 🏚️ Coberturas
  | 'telecom'            // 📡 Telecomunicações (ITED/ITUR)
  | 'special_systems'    // 🎬 Sistemas especiais
  | 'health'             // 🏥 Saúde e higiene
  ;

export const SPECIALTY_METADATA: Record<SpecialtyType, {
  symbol: string;
  name: string;
  prefix: string;
  color: string;
}> = {
  electrical: {
    symbol: '⚡',
    name: 'Instalações Elétricas',
    prefix: 'ELEC_',
    color: '#FFD700'
  },
  plumbing: {
    symbol: '💧',
    name: 'Águas e Esgotos',
    prefix: 'PLUMB_',
    color: '#1E90FF'
  },
  fire_safety: {
    symbol: '🔥',
    name: 'Segurança Contra Incêndios',
    prefix: 'FIRE_',
    color: '#FF4500'
  },
  hvac: {
    symbol: '❄️',
    name: 'AVAC',
    prefix: 'HVAC_',
    color: '#00CED1'
  },
  gas: {
    symbol: '⛽',
    name: 'Instalações de Gás',
    prefix: 'GAS_',
    color: '#FFA500'
  },
  structures: {
    symbol: '🏗️',
    name: 'Estruturas',
    prefix: 'STRUCT_',
    color: '#808080'
  },
  thermal: {
    symbol: '🌡️',
    name: 'Térmica de Edifícios',
    prefix: 'THERM_',
    color: '#FF6347'
  },
  acoustic: {
    symbol: '🔊',
    name: 'Acústica',
    prefix: 'ACOUS_',
    color: '#9370DB'
  },
  accessibility: {
    symbol: '♿',
    name: 'Acessibilidades',
    prefix: 'ACCESS_',
    color: '#4169E1'
  },
  exterior: {
    symbol: '🌳',
    name: 'Espaços Exteriores',
    prefix: 'EXTR_',
    color: '#228B22'
  },
  renewable_energy: {
    symbol: '🔋',
    name: 'Energias Renováveis',
    prefix: 'RENEW_',
    color: '#32CD32'
  },
  natural_lighting: {
    symbol: '☀️',
    name: 'Iluminação Natural',
    prefix: 'NATLT_',
    color: '#FFD700'
  },
  windows: {
    symbol: '🚪',
    name: 'Vãos e Caixilharias',
    prefix: 'WIND_',
    color: '#87CEEB'
  },
  walls: {
    symbol: '🧱',
    name: 'Paredes e Divisórias',
    prefix: 'WALL_',
    color: '#CD853F'
  },
  roofs: {
    symbol: '🏚️',
    name: 'Coberturas',
    prefix: 'ROOF_',
    color: '#8B4513'
  },
  telecom: {
    symbol: '📡',
    name: 'Telecomunicações',
    prefix: 'ITED_',
    color: '#4682B4'
  },
  special_systems: {
    symbol: '🎬',
    name: 'Sistemas Especiais',
    prefix: 'SPEC_',
    color: '#9932CC'
  },
  health: {
    symbol: '🏥',
    name: 'Saúde e Higiene',
    prefix: 'HLTH_',
    color: '#DC143C'
  }
};

// ============================================================================
// UNIVERSAL RULE STRUCTURE
// ============================================================================

export type ValidationType =
  | 'formula'      // Fórmula matemática
  | 'lookup'       // Tabela de consulta
  | 'range'        // Verificação de intervalo
  | 'boolean'      // Verificação booleana
  | 'spatial'      // Análise espacial (distâncias, áreas, etc.)
  | 'conditional'  // Regra condicional complexa
  ;

export type SeverityLevel =
  | 'mandatory'      // Obrigatório por lei
  | 'recommended'    // Recomendado mas não obrigatório
  | 'optional'       // Boa prática
  ;

export interface UniversalRule {
  // ===== IDENTIFICAÇÃO =====
  id: string;                     // Ex: "PLUMB_R042", "FIRE_R128"
  specialty: SpecialtyType;
  category: string;
  subcategory: string;

  // ===== REGULAMENTO =====
  reference: string;              // Ex: "RGSPPDADAR Art. 42"
  regulation: string;             // Ex: "NP EN 806-2"
  article: string;
  version: string;
  date: string;

  // ===== REGRA =====
  rule_text: string;              // Descrição humana legível
  parameters: Record<string, any>;
  validation_type: ValidationType;

  // ===== VALIDAÇÃO =====
  formula?: string;               // Para validation_type = 'formula'
  lookup_tables?: Record<string, any>;  // Para validation_type = 'lookup'
  spatial_check?: {               // Para validation_type = 'spatial'
    type: 'distance' | 'area' | 'height' | 'slope' | 'volume';
    condition: string;
    parameters: Record<string, any>;
  };
  conditional_logic?: {           // Para validation_type = 'conditional'
    conditions: Array<{
      if: string;
      then: string;
      else?: string;
    }>;
  };

  // ===== SEVERIDADE =====
  severity: SeverityLevel;

  // ===== MENSAGENS =====
  error_message: string;
  success_message: string;
  recommendation?: string;
  explanation?: string;            // Explicação técnica adicional

  // ===== METADADOS =====
  metadata: {
    complexity: 'simple' | 'medium' | 'complex';
    requires_calculation: boolean;
    requires_spatial_analysis: boolean;
    requires_external_data: boolean;
    application_scope: string[];
    building_types?: string[];
    zones?: string[];
    excluded_cases?: string[];
  };

  // ===== FONTE =====
  source: {
    regulation: string;
    article: string;
    section?: string;
    paragraph?: string;
    version: string;
    date: string;
    document_url?: string;
    pdf_page?: number;
  };

  // ===== RELACIONAMENTOS =====
  related_rules?: string[];        // IDs de regras relacionadas
  supersedes?: string[];           // IDs de regras que esta substitui
  depends_on?: string[];           // IDs de regras das quais esta depende
}

// ============================================================================
// SPECIALTY ENGINE
// ============================================================================

export interface SpecialtyEngineConfig {
  specialty: SpecialtyType;
  version: string;
  enabled: boolean;
  rules: UniversalRule[];
  regulations: RegulationInfo[];
}

export interface RegulationInfo {
  code: string;                    // Ex: "RTIEBT", "SCIE", "RGSPPDADAR"
  name: string;
  version: string;
  date: string;
  url?: string;
  coverage: {
    categories: string[];
    total_rules: number;
  };
}

export interface SpecialtyAnalysisContext {
  buildingType: string;
  zones?: string[];
  specialRequirements?: string[];
  existingConditions?: Record<string, any>;
  projectPhase?: 'preliminary' | 'basic' | 'execution' | 'as_built';
}

export interface SpecialtyAnalysisResult {
  specialty: SpecialtyType;
  engineType: string;              // Ex: "PLUMBING_SPECIALIZED"
  symbol: string;                  // Ex: "💧"
  engineVersion: string;

  statistics: {
    totalRules: number;
    rulesEvaluated: number;
    passed: number;
    failed: number;
    critical: number;
    warnings: number;
    recommendations: number;
    notApplicable: number;
  };

  findings: SpecialtyFinding[];

  regulationSources: string[];
  regulationVersion: string;

  scopesAnalyzed: string[];
  buildingContext: SpecialtyAnalysisContext;

  executionTime: number;           // milliseconds
  timestamp: string;
}

export interface SpecialtyFinding {
  id: string;
  area: string;
  specialty: SpecialtyType;
  severity: 'critical' | 'warning' | 'info';

  title: string;
  description: string;

  // Marcação especializada (como RTIEBT)
  regulation: string;              // Com símbolo: "💧 RGSPPDADAR Art.42"
  regulationSource: string;

  details?: string[];
  recommendation?: string;

  metadata: {
    engineType: string;            // Ex: "PLUMBING_SPECIALIZED"
    ruleId: string;
    category: string;
    subcategory?: string;
    reference: string;
    validationType: ValidationType;
    calculationDetails?: Record<string, any>;
  };

  location?: {
    zone?: string;
    floor?: string;
    room?: string;
    element?: string;
  };
}

// ============================================================================
// ABSTRACT ENGINE CLASS
// ============================================================================

export abstract class SpecialtyEngine {
  protected config: SpecialtyEngineConfig;
  protected rules: Map<string, UniversalRule>;

  constructor(config: SpecialtyEngineConfig) {
    this.config = config;
    this.rules = new Map();

    // Index rules by ID
    for (const rule of config.rules) {
      this.rules.set(rule.id, rule);
    }
  }

  // ===== MÉTODOS ABSTRATOS (implementar em cada engine) =====

  abstract canAnalyze(project: any): boolean;
  abstract analyze(project: any, context: SpecialtyAnalysisContext): Promise<SpecialtyAnalysisResult>;

  // ===== MÉTODOS COMUNS =====

  getSpecialty(): SpecialtyType {
    return this.config.specialty;
  }

  getSymbol(): string {
    return SPECIALTY_METADATA[this.config.specialty].symbol;
  }

  getName(): string {
    return SPECIALTY_METADATA[this.config.specialty].name;
  }

  getVersion(): string {
    return this.config.version;
  }

  getTotalRules(): number {
    return this.config.rules.length;
  }

  getRule(ruleId: string): UniversalRule | undefined {
    return this.rules.get(ruleId);
  }

  getRulesByCategory(category: string): UniversalRule[] {
    return this.config.rules.filter(r => r.category === category);
  }

  getRegulations(): RegulationInfo[] {
    return this.config.regulations;
  }

  // Validar uma regra individual
  protected validateRule(
    rule: UniversalRule,
    data: Record<string, any>
  ): { passed: boolean; details?: any } {
    switch (rule.validation_type) {
      case 'formula':
        return this.validateFormula(rule, data);

      case 'range':
        return this.validateRange(rule, data);

      case 'boolean':
        return this.validateBoolean(rule, data);

      case 'lookup':
        return this.validateLookup(rule, data);

      case 'spatial':
        return this.validateSpatial(rule, data);

      case 'conditional':
        return this.validateConditional(rule, data);

      default:
        return { passed: false, details: { error: 'Unknown validation type' } };
    }
  }

  protected validateFormula(rule: UniversalRule, data: Record<string, any>): { passed: boolean; details?: any } {
    if (!rule.formula) {
      return { passed: false, details: { error: 'No formula defined' } };
    }

    try {
      // Substituir variáveis na fórmula
      let formula = rule.formula;
      for (const [key, value] of Object.entries(data)) {
        formula = formula.replace(new RegExp(key, 'g'), String(value));
      }

      // Avaliar (seguro - apenas operações matemáticas básicas)
      const result = this.evaluateFormula(formula);
      return { passed: result, details: { formula, result, data } };
    } catch (error) {
      return { passed: false, details: { error: String(error) } };
    }
  }

  protected validateRange(rule: UniversalRule, data: Record<string, any>): { passed: boolean; details?: any } {
    const { parameter, min, max } = rule.parameters;
    const value = data[parameter];

    if (value === undefined) {
      return { passed: false, details: { error: 'Parameter not found' } };
    }

    const passed = value >= min && value <= max;
    return { passed, details: { value, min, max } };
  }

  protected validateBoolean(rule: UniversalRule, data: Record<string, any>): { passed: boolean; details?: any } {
    const { parameter, expected } = rule.parameters;
    const value = data[parameter];

    const passed = value === expected;
    return { passed, details: { value, expected } };
  }

  protected validateLookup(rule: UniversalRule, data: Record<string, any>): { passed: boolean; details?: any } {
    if (!rule.lookup_tables) {
      return { passed: false, details: { error: 'No lookup table defined' } };
    }

    // Implementar lookup em tabelas
    // (específico para cada tipo de tabela)
    return { passed: true, details: {} };
  }

  protected validateSpatial(rule: UniversalRule, data: Record<string, any>): { passed: boolean; details?: any } {
    if (!rule.spatial_check) {
      return { passed: false, details: { error: 'No spatial check defined' } };
    }

    // Implementar verificações espaciais
    // (distâncias, áreas, volumes, etc.)
    return { passed: true, details: {} };
  }

  protected validateConditional(rule: UniversalRule, data: Record<string, any>): { passed: boolean; details?: any } {
    if (!rule.conditional_logic) {
      return { passed: false, details: { error: 'No conditional logic defined' } };
    }

    // Implementar lógica condicional
    return { passed: true, details: {} };
  }

  // Avaliador seguro de fórmulas matemáticas simples
  private evaluateFormula(formula: string): boolean {
    // Lista branca de operadores permitidos
    const allowedChars = /^[0-9+\-*/.()>=<! &|]+$/;

    if (!allowedChars.test(formula)) {
      throw new Error('Invalid formula characters');
    }

    // Converter operadores lógicos
    formula = formula
      .replace(/&&/g, '&')
      .replace(/\|\|/g, '|')
      .replace(/==/g, '===');

    try {
      // Usar Function (mais seguro que eval)
      return new Function(`return ${formula}`)();
    } catch (error) {
      throw new Error(`Formula evaluation failed: ${error}`);
    }
  }

  // Criar finding a partir de regra validada
  protected createFinding(
    rule: UniversalRule,
    validationResult: { passed: boolean; details?: any },
    project: any
  ): SpecialtyFinding {
    const metadata = SPECIALTY_METADATA[this.config.specialty];

    return {
      id: `${rule.id}_${Date.now()}`,
      area: this.config.specialty,
      specialty: this.config.specialty,
      severity: validationResult.passed ? 'info' :
                (rule.severity === 'mandatory' ? 'critical' : 'warning'),

      title: rule.rule_text.split(':')[0].trim(),
      description: validationResult.passed ? rule.success_message : rule.error_message,

      regulation: `${metadata.symbol} ${rule.reference}`,
      regulationSource: rule.source.regulation,

      details: validationResult.details ? [JSON.stringify(validationResult.details)] : undefined,
      recommendation: rule.recommendation,

      metadata: {
        engineType: `${metadata.prefix}SPECIALIZED`,
        ruleId: rule.id,
        category: rule.category,
        subcategory: rule.subcategory,
        reference: rule.reference,
        validationType: rule.validation_type,
        calculationDetails: validationResult.details
      }
    };
  }
}

// ============================================================================
// RULE LOADER
// ============================================================================

export class UniversalRuleLoader {
  private rulesCache: Map<SpecialtyType, UniversalRule[]> = new Map();

  async loadRulesForSpecialty(specialty: SpecialtyType): Promise<UniversalRule[]> {
    // Verificar cache
    if (this.rulesCache.has(specialty)) {
      return this.rulesCache.get(specialty)!;
    }

    // Carregar de ficheiros JSON
    const rules = await this.loadRulesFromFiles(specialty);

    // Cache
    this.rulesCache.set(specialty, rules);

    return rules;
  }

  private async loadRulesFromFiles(specialty: SpecialtyType): Promise<UniversalRule[]> {
    const metadata = SPECIALTY_METADATA[specialty];
    const basePath = `regulamentos/${specialty}`;

    // Implementar carregamento de ficheiros
    // (scan directory, load JSON files, parse rules)

    return [];
  }

  clearCache(specialty?: SpecialtyType): void {
    if (specialty) {
      this.rulesCache.delete(specialty);
    } else {
      this.rulesCache.clear();
    }
  }
}

// ============================================================================
// UNIVERSAL ANALYZER
// ============================================================================

export class UniversalAnalyzer {
  private engines: Map<SpecialtyType, SpecialtyEngine> = new Map();
  private loader: UniversalRuleLoader;

  constructor() {
    this.loader = new UniversalRuleLoader();
  }

  registerEngine(engine: SpecialtyEngine): void {
    this.engines.set(engine.getSpecialty(), engine);
  }

  async analyzeAllSpecialties(
    project: any,
    options?: {
      specialties?: SpecialtyType[];
      context?: SpecialtyAnalysisContext;
    }
  ): Promise<UniversalAnalysisResult> {
    const startTime = Date.now();
    const results: SpecialtyAnalysisResult[] = [];

    const specialtiesToAnalyze = options?.specialties || Array.from(this.engines.keys());

    for (const specialty of specialtiesToAnalyze) {
      const engine = this.engines.get(specialty);

      if (!engine || !engine.canAnalyze(project)) {
        continue;
      }

      const result = await engine.analyze(project, options?.context || {} as SpecialtyAnalysisContext);
      results.push(result);
    }

    return this.aggregateResults(results, Date.now() - startTime);
  }

  private aggregateResults(
    results: SpecialtyAnalysisResult[],
    executionTime: number
  ): UniversalAnalysisResult {
    const allFindings: SpecialtyFinding[] = [];
    const bySpecialty: Record<string, SpecialtyAnalysisResult> = {};

    let totalFindings = 0;
    let totalCritical = 0;
    let totalWarnings = 0;
    let totalPassed = 0;

    for (const result of results) {
      bySpecialty[result.specialty] = result;
      allFindings.push(...result.findings);

      totalFindings += result.findings.length;
      totalCritical += result.statistics.critical;
      totalWarnings += result.statistics.warnings;
      totalPassed += result.statistics.passed;
    }

    return {
      summary: {
        totalSpecialties: results.length,
        specialtiesAnalyzed: results.map(r => r.specialty),
        totalFindings,
        critical: totalCritical,
        warnings: totalWarnings,
        passed: totalPassed,
        executionTime
      },
      bySpecialty,
      findings: allFindings,
      regulationCompliance: this.calculateRegulationCompliance(results),
      timestamp: new Date().toISOString()
    };
  }

  private calculateRegulationCompliance(
    results: SpecialtyAnalysisResult[]
  ): Record<string, RegulationCompliance> {
    const compliance: Record<string, RegulationCompliance> = {};

    for (const result of results) {
      for (const regulation of result.regulationSources) {
        if (!compliance[regulation]) {
          compliance[regulation] = {
            total: 0,
            passed: 0,
            failed: 0,
            coverage: 0
          };
        }

        compliance[regulation].total += result.statistics.rulesEvaluated;
        compliance[regulation].passed += result.statistics.passed;
        compliance[regulation].failed += result.statistics.failed;
      }
    }

    // Calcular cobertura
    for (const reg of Object.keys(compliance)) {
      const c = compliance[reg];
      c.coverage = c.total > 0 ? (c.passed / c.total) * 100 : 0;
    }

    return compliance;
  }
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface UniversalAnalysisResult {
  summary: {
    totalSpecialties: number;
    specialtiesAnalyzed: string[];
    totalFindings: number;
    critical: number;
    warnings: number;
    passed: number;
    executionTime: number;
  };

  bySpecialty: Record<string, SpecialtyAnalysisResult>;
  findings: SpecialtyFinding[];

  regulationCompliance: Record<string, RegulationCompliance>;
  timestamp: string;
}

export interface RegulationCompliance {
  total: number;
  passed: number;
  failed: number;
  coverage: number;  // 0-100%
}

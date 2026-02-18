/**
 * ⚡ Electrical Analysis Integration
 *
 * Integra o engine de regras elétricas RTIEBT no sistema de análise do Wallnut
 * de forma clara e visível para o utilizador.
 */

import type { BuildingProject, Finding } from "./types";
import { ElectricalRulesEngine, ValidationContext, ValidationReport } from "./validation/electrical-rules-engine";
import electricalRulesData from "../../regulamentos/electrical-rules.json";

// ============================================================================
// TIPOS
// ============================================================================

export interface ElectricalAnalysisResult {
  /** Indica que esta análise usa o engine RTIEBT especializado */
  engineType: "RTIEBT_SPECIALIZED";

  /** Versão das regras RTIEBT */
  regulationVersion: string;

  /** Fontes regulamentares consultadas */
  sources: string[];

  /** Relatório de validação do engine */
  validationReport: ValidationReport;

  /** Findings convertidos para formato Wallnut */
  findings: Finding[];

  /** Estatísticas da validação */
  statistics: {
    totalRules: number;
    rulesEvaluated: number;
    passed: number;
    failed: number;
    critical: number;
    warnings: number;
  };

  /** Âmbitos analisados */
  scopesAnalyzed: string[];
}

// ============================================================================
// ENGINE SINGLETON
// ============================================================================

let engineInstance: ElectricalRulesEngine | null = null;

function getElectricalEngine(): ElectricalRulesEngine {
  if (!engineInstance) {
    engineInstance = new ElectricalRulesEngine(electricalRulesData.rules as any);
  }
  return engineInstance;
}

// ============================================================================
// CONVERSÃO DE CONTEXTO
// ============================================================================

/**
 * Extrai contexto elétrico do BuildingProject
 */
function extractElectricalContext(project: BuildingProject): ValidationContext {
  const electrical = project.electrical || {};

  // Determinar tipo de projeto
  const projectType = project.buildingType === 'residential' ? 'residential' :
                      project.buildingType === 'commercial' ? 'commercial' :
                      project.buildingType === 'industrial' ? 'industrial' : 'other';

  // Determinar âmbito baseado nos dados disponíveis
  let scope = 'general';
  if ((electrical as any).hasBathrooms) scope = 'bathroom';
  if ((electrical as any).hasPool) scope = 'pool';
  if ((electrical as any).constructionSite) scope = 'construction_site';

  // Extrair parâmetros — enrich with mapped field names for formula resolution
  const elec = electrical as any;
  const parameters: Record<string, any> = {
    ...electrical,
    totalPower: elec.totalPower || 0,
    voltage: elec.voltage || 230,
    numberOfCircuits: elec.numberOfCircuits || 0,
    groundingSystem: elec.groundingSystem || 'TN',
    hasRCD: elec.hasRCD !== false, // Default true
    rcdRating: elec.rcdRating || 30,
    // Mapped names for formula variable resolution
    conductorSection: elec.conductorSection ?? elec.seccao_mm2,
    conductorMaterial: elec.conductorMaterial ?? elec.material ?? 'Cu',
    installationMethod: elec.installationMethod ?? elec.metodoInstalacao ?? 'B',
    insulationType: elec.insulationType ?? elec.tipoIsolamento ?? 'PVC',
    rcdSensitivity: elec.rcdSensitivity ?? elec.sensibilidadeDR ?? elec.rcdRating ?? 30,
    serviceCurrent: elec.serviceCurrent ?? elec.correnteServico,
    nominalCurrent: elec.nominalCurrent ?? elec.correnteNominal,
    admissibleCurrent: elec.admissibleCurrent ?? elec.correnteAdmissivel,
    nominalVoltage: elec.nominalVoltage ?? elec.voltage ?? 230,
    loopImpedance: elec.loopImpedance ?? elec.impedanciaAnca,
    earthingResistance: elec.earthingResistance ?? elec.resistenciaTerra,
    ambientTemperature: elec.ambientTemperature ?? elec.temperaturaAmbiente ?? 30,
    soilTemperature: elec.soilTemperature ?? elec.temperaturaSolo ?? 20,
    peSection: elec.peSection ?? elec.seccaoPE,
    neutralSection: elec.neutralSection ?? elec.seccaoNeutro,
    faultCurrent: elec.faultCurrent ?? elec.correnteCurtoCircuito,
    disconnectionTime: elec.disconnectionTime ?? elec.tempoCorte ?? 0.4,
    voltageDrop: elec.voltageDrop ?? elec.voltageDropLighting,
    hasResidualCurrentDevice: elec.hasRCD !== false,
    designPower: elec.designPower ?? elec.totalPower,
    breakingCapacity: elec.breakingCapacity ?? elec.poderCorte,
  };

  return {
    projectType,
    scope,
    parameters
  };
}

// ============================================================================
// CONVERSÃO DE RESULTADOS
// ============================================================================

/**
 * Converte resultado do engine RTIEBT para Finding do Wallnut
 */
function convertToFindings(validationReport: ValidationReport): Finding[] {
  return validationReport.results.map((result, index) => {
    const severity = !result.passed && result.severity === 'mandatory' ? 'critical' :
                     !result.passed && result.severity === 'recommended' ? 'warning' :
                     'pass';

    const finding: Finding = {
      id: `RTIEBT_${result.ruleId}_${index}`,
      area: 'electrical',
      severity,
      description: result.message,
      regulation: `⚡ RTIEBT ${result.metadata.reference}`,
      article: result.ruleName,
      currentValue: result.details?.actual,
      requiredValue: result.details?.expected,
      remediation: result.details?.calculation ? `Cálculo: ${JSON.stringify(result.details.calculation)}` : undefined,
    } as Finding;

    return finding;
  });
}

// ============================================================================
// ANÁLISE PRINCIPAL
// ============================================================================

/**
 * Analisa instalações elétricas usando o engine RTIEBT especializado
 *
 * @param project - Projeto de construção
 * @returns Resultado da análise elétrica com marcação clara RTIEBT
 */
export async function analyzeElectricalRTIEBT(
  project: BuildingProject
): Promise<ElectricalAnalysisResult> {

  console.log('🔌 Iniciando análise elétrica com engine RTIEBT especializado...');

  // 1. Obter engine
  const engine = getElectricalEngine();

  // 2. Extrair contexto
  const context = extractElectricalContext(project);

  console.log(`   Tipo: ${context.projectType}`);
  console.log(`   Âmbito: ${context.scope}`);

  // 3. Validar
  const validationReport = await engine.validate(context);

  // 4. Converter para findings
  const findings = convertToFindings(validationReport);

  // 5. Estatísticas
  const statistics = {
    totalRules: engine.getStatistics().totalRules,
    rulesEvaluated: validationReport.summary.total,
    passed: validationReport.summary.passed,
    failed: validationReport.summary.failed,
    critical: validationReport.summary.critical,
    warnings: validationReport.summary.warnings
  };

  console.log(`✅ Análise RTIEBT completa:`);
  console.log(`   Regras avaliadas: ${statistics.rulesEvaluated}`);
  console.log(`   Passou: ${statistics.passed}`);
  console.log(`   Falhou: ${statistics.failed}`);

  return {
    engineType: 'RTIEBT_SPECIALIZED',
    regulationVersion: electricalRulesData.metadata.version,
    sources: electricalRulesData.metadata.sources,
    validationReport,
    findings,
    statistics,
    scopesAnalyzed: [context.scope]
  };
}

/**
 * Verifica se o projeto tem dados suficientes para análise elétrica
 */
export function canAnalyzeElectrical(project: BuildingProject): boolean {
  const electrical = project.electrical;

  if (!electrical || typeof electrical !== 'object') {
    return false;
  }

  // Precisa de pelo menos um destes campos
  const elec = electrical as any;
  const hasMinimalData =
    elec.totalPower !== undefined ||
    elec.numberOfCircuits !== undefined ||
    elec.groundingSystem !== undefined ||
    elec.voltage !== undefined;

  return hasMinimalData;
}

/**
 * Obtém estatísticas do engine sem executar validação
 */
export function getElectricalEngineInfo() {
  const engine = getElectricalEngine();
  const stats = engine.getStatistics();

  return {
    engineType: 'RTIEBT_SPECIALIZED',
    version: electricalRulesData.metadata.version,
    sources: electricalRulesData.metadata.sources,
    totalRules: stats.totalRules,
    categories: stats.byCategory.length,
    scopes: stats.byScope,
    description: 'Engine especializado para validação de instalações elétricas segundo regulamentação portuguesa (RTIEBT, RSRDEEBT, SCIE)',
  };
}


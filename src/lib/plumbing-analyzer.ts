/**
 * Plumbing Analyzer - RGSPPDADAR Validation Integration
 *
 * Integrates PlumbingEngine into the main building analyzer.
 * Validates plumbing installations against Portuguese regulations:
 * - RGSPPDADAR (Decreto Regulamentar 23/95)
 * - NP EN 806 (Water supply systems)
 * - NP EN 1717 (Backflow prevention)
 * - NP EN 12056 (Gravity drainage systems)
 */

import type { BuildingProject, Finding } from './types';
import { PlumbingEngine } from './validation/engines/PlumbingEngine';

let plumbingEngine: PlumbingEngine | null = null;

/**
 * Get or create PlumbingEngine instance (singleton pattern)
 */
function getPlumbingEngine(): PlumbingEngine {
  if (!plumbingEngine) {
    plumbingEngine = new PlumbingEngine();
  }
  return plumbingEngine;
}

/**
 * Check if project has plumbing data available for validation
 */
export function canAnalyzePlumbing(project: BuildingProject): boolean {
  // Check if we have relevant plumbing parameters
  const proj = project as any;
  const hasWaterSupply =
    proj.pressaoRedePublica !== undefined ||
    proj.numeroPisos !== undefined ||
    proj.tipologia !== undefined;

  const hasDrainage =
    proj.areaCoberturaM2 !== undefined ||
    proj.tipologia !== undefined;

  return hasWaterSupply || hasDrainage;
}

/**
 * Get information about available plumbing validation rules
 */
export function getPlumbingEngineInfo() {
  const engine = getPlumbingEngine();
  const stats = engine.getStats();

  return {
    name: 'RGSPPDADAR Validation Engine',
    version: '1.1',
    regulation: 'RGSPPDADAR - Decreto Regulamentar 23/95',
    totalRules: stats.total,
    rulesByCategory: stats.by_category,
    rulesBySeverity: stats.by_severity,
    rulesByType: stats.by_type,
    status: 'production-ready',
    coverage: {
      waterSupply: stats.by_category['Abastecimento de água'] || 0,
      wastewater: stats.by_category['Drenagem de águas residuais'] || 0,
      stormwater: stats.by_category['Drenagem de águas pluviais'] || 0
    }
  };
}

/**
 * Analyze plumbing installation against RGSPPDADAR rules
 */
export async function analyzePlumbingRGSPPDADAR(project: BuildingProject): Promise<{
  findings: Finding[];
  statistics: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    byCategory: Record<string, { passed: number; failed: number }>;
  };
}> {
  const engine = getPlumbingEngine();

  // Build PlumbingContext from BuildingProject
  const context = buildPlumbingContext(project);

  // Run validation
  const results = await engine.validate(context);

  // Convert ValidationResult[] to Finding[]
  const findings: Finding[] = results
    .map(result => ({
      id: `plumbing-${result.ruleId}`,
      area: 'water_drainage' as const,
      severity: !result.passed
        ? (result.severity === 'mandatory' ? 'critical' : 'warning')
        : 'pass' as const,
      regulation: 'RGSPPDADAR',
      article: result.ruleId,
      description: result.message,
      remediation: result.details?.calculation ? `Cálculo: ${JSON.stringify(result.details.calculation)}` : undefined,
      currentValue: result.details?.actual !== undefined ? String(result.details.actual) : undefined,
      requiredValue: result.details?.expected !== undefined ? String(result.details.expected) : undefined,
    }));

  // Calculate statistics
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const error = 0; // No error status in current ValidationResult

  // Statistics by rule name (used as category)
  const byCategory: Record<string, { passed: number; failed: number }> = {};
  for (const result of results) {
    const category = result.ruleName || 'Other';
    if (!byCategory[category]) {
      byCategory[category] = { passed: 0, failed: 0 };
    }
    if (result.passed) {
      byCategory[category].passed++;
    } else {
      byCategory[category].failed++;
    }
  }

  return {
    findings,
    statistics: {
      total,
      passed,
      failed,
      error,
      byCategory
    }
  };
}

/**
 * Build PlumbingContext from BuildingProject
 */
function buildPlumbingContext(project: BuildingProject): any {
  const proj = project as any;
  const context: any = {
    building_type: mapBuildingType(proj.tipo),

    // Water supply parameters
    numero_pisos: proj.numeroPisos,
    diametro_tubagem_ligacao: proj.diametroTubagem,
    profundidade_assentamento: proj.profundidadeAssentamento,
    velocidade_escoamento: proj.velocidadeEscoamento,
    area_sem_trafego: proj.areaSemTrafego,
    tem_servico_incendio: proj.temServicoIncendio,
    tem_reservatorio_regularizacao: proj.temReservatorio,
    tem_protecao_retorno: proj.temProtecaoRetorno,
    capacidade_reservatorio: proj.capacidadeReservatorio,

    // Pressures (convert from bar to kPa if needed)
    pressao_rede_publica: proj.pressaoRedePublica
      ? (proj.pressaoRedePublica < 100 ? proj.pressaoRedePublica * 100 : proj.pressaoRedePublica)
      : undefined,
    pressao_servico: proj.pressaoServico
      ? (proj.pressaoServico < 100 ? proj.pressaoServico * 100 : proj.pressaoServico)
      : undefined,

    // Drainage parameters
    diametro_tubagem_drenagem: proj.diametroTubagemDrenagem,
    declive_tubagem: proj.decliveTubagem,
    diametro_coletor: proj.diametroColetor,
    altura_coluna_ventilacao: proj.alturaVentilacao,
    cobertura_utilizada_outros_fins: proj.coberturaUtilizada,
    distancia_de_vaos: proj.distanciaVaos,

    // Spatial parameters (form-declared distances)
    distancia_colector_propriedade: proj.waterDrainage?.collectorDistanceToProperty ?? proj.distanciaColectorPropriedade,
    distancia_agua_residuais: proj.waterDrainage?.waterToWastewaterDistance ?? proj.distanciaAguaResiduais,
    agua_acima_residuais: proj.waterDrainage?.waterAboveWastewater ?? proj.aguaAcimaResiduais,

    // Stormwater parameters (from building data)
    area_bacia: proj.areaCoberturaM2 ? proj.areaCoberturaM2 / 1000000 : undefined, // m² to km²
    coeficiente_escoamento: proj.coeficienteEscoamento || 0.9, // default for urban areas
    intensidade_precipitacao: proj.intensidadePrecipitacao || 100, // default 100 mm/h
  };

  // Remove undefined values
  Object.keys(context).forEach(key => {
    if (context[key] === undefined) {
      delete context[key];
    }
  });

  return context;
}

/**
 * Map BuildingProject type to UniversalRule building_type
 */
function mapBuildingType(tipo?: string): string | undefined {
  if (!tipo) return undefined;

  const typeMap: Record<string, string> = {
    'residential': 'residential',
    'habitacional': 'residential',
    'comercial': 'commercial',
    'commercial': 'commercial',
    'industrial': 'industrial',
    'serviços': 'commercial',
    'services': 'commercial',
    'público': 'public',
    'public': 'public',
  };

  return typeMap[tipo.toLowerCase()] || 'residential';
}

export default {
  canAnalyzePlumbing,
  analyzePlumbingRGSPPDADAR,
  getPlumbingEngineInfo
};

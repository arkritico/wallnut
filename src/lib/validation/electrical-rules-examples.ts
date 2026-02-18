/**
 * ⚡ Exemplos de Uso do Electrical Rules Engine
 *
 * Demonstra como usar o engine de validação de regras elétricas
 */

import { ElectricalRulesEngine, ElectricalRule, ValidationContext } from './electrical-rules-engine';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Carrega as regras elétricas do ficheiro JSON
 */
export function loadElectricalRules(): ElectricalRule[] {
  const rulesPath = join(process.cwd(), 'regulamentos', 'electrical-rules.json');
  const data = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  return data.rules;
}

/**
 * Exemplo 1: Validar instalação residencial básica
 */
export async function exampleResidentialValidation() {
  console.log('\n🏠 EXEMPLO 1: Instalação Residencial');
  console.log('═══════════════════════════════════════════════\n');

  const rules = loadElectricalRules();
  const engine = new ElectricalRulesEngine(rules);

  const context: ValidationContext = {
    projectType: 'residential',
    scope: 'general',
    parameters: {
      totalPower: 10350, // Watts
      voltage: 230, // V
      supplyType: 'single-phase',
      numberOfCircuits: 8,
      groundingSystem: 'TN'
    }
  };

  const report = await engine.validate(context);

  console.log('📊 Resultado da Validação:');
  console.log(`   Total de regras: ${report.summary.total}`);
  console.log(`   ✅ Passou: ${report.summary.passed}`);
  console.log(`   ❌ Falhou: ${report.summary.failed}`);
  console.log(`   ⚠️  Avisos: ${report.summary.warnings}`);
  console.log(`   🚨 Críticos: ${report.summary.critical}`);

  if (report.summary.failed > 0) {
    console.log('\n❌ Regras que falharam:');
    report.results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`   - ${r.ruleName}`);
        console.log(`     ${r.message}`);
        console.log(`     Referência: ${r.metadata.reference}`);
      });
  }

  return report;
}

/**
 * Exemplo 2: Validar casa de banho (volumes de segurança)
 */
export async function exampleBathroomValidation() {
  console.log('\n🚿 EXEMPLO 2: Casa de Banho');
  console.log('═══════════════════════════════════════════════\n');

  const rules = loadElectricalRules();
  const engine = new ElectricalRulesEngine(rules);

  const context: ValidationContext = {
    projectType: 'residential',
    scope: 'bathroom',
    parameters: {
      volume0: {
        hasEquipment: false
      },
      volume1: {
        ipRating: 'IPX4',
        hasEquipmentClass2: true
      },
      volume2: {
        ipRating: 'IPX4',
        hasRCD: true,
        rcdRating: 30 // mA
      },
      equipotentialBonding: true
    }
  };

  const report = await engine.validate(context);

  console.log('📊 Resultado da Validação:');
  console.log(`   ✅ Passou: ${report.summary.passed}`);
  console.log(`   ❌ Falhou: ${report.summary.failed}`);

  // Mostrar regras específicas de casas de banho
  const bathroomRules = report.results.filter(r =>
    r.ruleName.toLowerCase().includes('casa') ||
    r.ruleName.toLowerCase().includes('banho')
  );

  console.log(`\n📋 Regras de Casas de Banho aplicadas: ${bathroomRules.length}`);
  bathroomRules.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`   ${icon} ${r.ruleName}`);
  });

  return report;
}

/**
 * Exemplo 3: Validar piscina
 */
export async function examplePoolValidation() {
  console.log('\n🏊 EXEMPLO 3: Piscina');
  console.log('═══════════════════════════════════════════════\n');

  const rules = loadElectricalRules();
  const engine = new ElectricalRulesEngine(rules);

  const context: ValidationContext = {
    projectType: 'residential',
    scope: 'pool',
    parameters: {
      volume0: {
        hasMetalParts: false,
        hasJunctionBoxes: false
      },
      volume1: {
        ipRating: 'IPX5',
        trsProtection: true, // Transformador de Segurança
        hasMetalParts: false
      },
      volume2: {
        ipRating: 'IPX4',
        hasRCD: true,
        rcdRating: 30
      }
    }
  };

  const report = await engine.validate(context);

  console.log('📊 Resultado da Validação:');
  console.log(`   ✅ Passou: ${report.summary.passed}`);
  console.log(`   ❌ Falhou: ${report.summary.failed}`);

  const poolRules = report.results.filter(r =>
    r.ruleName.toLowerCase().includes('piscina')
  );

  console.log(`\n📋 Regras de Piscinas aplicadas: ${poolRules.length}`);
  poolRules.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`   ${icon} ${r.ruleName}`);
    if (!r.passed) {
      console.log(`      ${r.message}`);
    }
  });

  return report;
}

/**
 * Exemplo 4: Validar instalação comercial
 */
export async function exampleCommercialValidation() {
  console.log('\n🏢 EXEMPLO 4: Instalação Comercial');
  console.log('═══════════════════════════════════════════════\n');

  const rules = loadElectricalRules();
  const engine = new ElectricalRulesEngine(rules);

  const context: ValidationContext = {
    projectType: 'commercial',
    scope: 'general',
    parameters: {
      shopArea: 150, // m²
      minimumPowerRequired: 75, // W/m² (50 base + 25 per m²)
      totalPower: 15000, // Watts
      hasEmergencyLighting: true,
      hasFireProtection: true
    }
  };

  const report = await engine.validate(context);

  console.log('📊 Resultado da Validação:');
  console.log(`   ✅ Passou: ${report.summary.passed}`);
  console.log(`   ❌ Falhou: ${report.summary.failed}`);

  return report;
}

/**
 * Exemplo 5: Consultar estatísticas do engine
 */
export function exampleEngineStatistics() {
  console.log('\n📈 EXEMPLO 5: Estatísticas do Engine');
  console.log('═══════════════════════════════════════════════\n');

  const rules = loadElectricalRules();
  const engine = new ElectricalRulesEngine(rules);

  const stats = engine.getStatistics();

  console.log(`📊 Total de regras: ${stats.totalRules}`);

  console.log('\n📂 Por Severidade:');
  console.log(`   Obrigatórias: ${stats.bySeverity.mandatory}`);
  console.log(`   Recomendadas: ${stats.bySeverity.recommended}`);
  console.log(`   Informativas: ${stats.bySeverity.informative}`);

  console.log('\n⚙️ Por Complexidade:');
  console.log(`   Simples: ${stats.byComplexity.simple}`);
  console.log(`   Médias: ${stats.byComplexity.medium}`);
  console.log(`   Complexas: ${stats.byComplexity.complex}`);

  console.log('\n🎯 Top 10 Âmbitos:');
  stats.byScope
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.scope}: ${s.count} regras`);
    });

  console.log('\n📋 Top 15 Categorias:');
  stats.byCategory
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.category}: ${c.count} regras`);
    });

  return stats;
}

/**
 * Exemplo 6: Validar regra específica
 */
export async function exampleSpecificRuleValidation() {
  console.log('\n🔍 EXEMPLO 6: Validação de Regra Específica');
  console.log('═══════════════════════════════════════════════\n');

  const rules = loadElectricalRules();
  const engine = new ElectricalRulesEngine(rules);

  // Procurar regra de DR em habitações
  const drRule = rules.find(r =>
    r.subcategory.includes('Habitação') &&
    r.rule_text.includes('DR')
  );

  if (drRule) {
    console.log(`📋 Regra: ${drRule.subcategory}`);
    console.log(`   ID: ${drRule.id}`);
    console.log(`   Referência: ${drRule.reference}`);
    console.log(`   Severidade: ${drRule.severity}`);
    console.log(`   Complexidade: ${drRule.metadata.complexity}`);
    console.log(`\n   Descrição: ${drRule.rule_text}`);

    // Validar
    const context: ValidationContext = {
      projectType: 'residential',
      scope: 'general',
      parameters: {
        rcdInstalled: true,
        rcdRating: 30 // mA
      }
    };

    const report = await engine.validate(context);
    const result = report.results.find(r => r.ruleId === drRule.id);

    if (result) {
      console.log(`\n   Resultado: ${result.passed ? '✅ PASSOU' : '❌ FALHOU'}`);
      console.log(`   Mensagem: ${result.message}`);
    }
  } else {
    console.log('Regra não encontrada');
  }
}

/**
 * Executa todos os exemplos
 */
export async function runAllExamples() {
  console.log('⚡ ELECTRICAL RULES ENGINE - EXEMPLOS DE USO');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    await exampleResidentialValidation();
    await exampleBathroomValidation();
    await examplePoolValidation();
    await exampleCommercialValidation();
    exampleEngineStatistics();
    await exampleSpecificRuleValidation();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Todos os exemplos executados com sucesso!');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Erro ao executar exemplos:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runAllExamples();
}

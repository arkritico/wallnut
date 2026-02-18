# 🚀 Quickstart: Primeira Especialidade

Guia passo-a-passo para implementar a primeira especialidade completa (💧 Águas e Esgotos).

---

## 📋 Pré-requisitos

- [x] Sistema base criado ([universal-types.ts](../src/lib/validation/universal-types.ts))
- [x] Template de investigação ([regulation-research-template.md](../prompts/regulation-research-template.md))
- [x] Framework documentado ([UNIVERSAL_VALIDATION_FRAMEWORK.md](./UNIVERSAL_VALIDATION_FRAMEWORK.md))

---

## 🎯 Exemplo Completo: 💧 Águas e Esgotos

### PASSO 1: Investigar Regulamento (8-12 horas)

#### 1.1 Obter Regulamento
```bash
# Download RGSPPDADAR (Decreto Regulamentar 23/95)
# Fonte: https://dre.pt/
```

#### 1.2 Usar Prompt de Investigação

Copiar prompt de [regulation-research-template.md](../prompts/regulation-research-template.md) e adaptar:

```
Sou engenheiro a desenvolver um sistema de validação automática de projetos de construção em Portugal.

Preciso de analisar o regulamento RGSPPDADAR para extrair TODAS as regras técnicas validáveis.

## CONTEXTO

**Especialidade:** Águas e Esgotos
**Símbolo:** 💧
**Regulamento:** RGSPPDADAR - Decreto Regulamentar 23/95
**Versão:** 1995 (com alterações)
**Data:** 23 de Agosto de 1995

[... resto do prompt ...]
```

Execute no Claude e obtenha ~100 regras estruturadas.

### PASSO 2: Estruturar Ficheiros (2-3 horas)

#### 2.1 Criar Estrutura de Diretórios

```bash
mkdir -p regulamentos/plumbing/rgsppdadar/tables
```

#### 2.2 Criar metadata.json

```json
{
  "specialty": "plumbing",
  "symbol": "💧",
  "regulation": {
    "code": "RGSPPDADAR",
    "name": "Regulamento Geral dos Sistemas Públicos e Prediais de Distribuição de Água e de Drenagem de Águas Residuais",
    "reference": "Decreto Regulamentar 23/95",
    "version": "1995",
    "date": "1995-08-23",
    "url": "https://dre.pt/web/guest/legislacao-consolidada/-/lc/34570075/view",
    "last_updated": "1995-08-23"
  },
  "coverage": {
    "total_rules": 100,
    "categories": [
      "Abastecimento de água",
      "Drenagem de águas residuais",
      "Drenagem de águas pluviais",
      "Materiais e equipamentos"
    ],
    "building_types": ["residential", "commercial", "industrial"],
    "application_scope": ["all"]
  },
  "version": "1.0",
  "last_generated": "2026-02-16"
}
```

#### 2.3 Criar rules.json (Exemplo com 3 regras)

```json
{
  "specialty": "plumbing",
  "regulation": "RGSPPDADAR",
  "version": "1.0",
  "rules": [
    {
      "id": "PLUMB_R001",
      "specialty": "plumbing",
      "category": "Abastecimento de água",
      "subcategory": "Pressões",

      "reference": "RGSPPDADAR Art. 42, n.º 1",
      "regulation": "RGSPPDADAR",
      "article": "Art. 42",
      "version": "1995",
      "date": "1995-08-23",

      "rule_text": "Pressão mínima em qualquer ponto de utilização: 50 kPa",
      "parameters": {
        "pressao_minima_kPa": 50,
        "unit": "kPa"
      },
      "validation_type": "range",

      "severity": "mandatory",

      "error_message": "Pressão inferior a 50 kPa em ponto de utilização - Não conforme RGSPPDADAR",
      "success_message": "✓ Pressão mínima conforme (>= 50 kPa)",
      "recommendation": "Verificar dimensionamento de tubagem ou considerar grupo de pressão",

      "metadata": {
        "complexity": "simple",
        "requires_calculation": false,
        "requires_spatial_analysis": false,
        "requires_external_data": false,
        "application_scope": ["all"],
        "building_types": ["residential", "commercial", "industrial"]
      },

      "source": {
        "regulation": "RGSPPDADAR - Decreto Regulamentar 23/95",
        "article": "Art. 42, n.º 1",
        "version": "1995",
        "date": "1995-08-23",
        "document_url": "https://dre.pt/...",
        "pdf_page": 156
      }
    },
    {
      "id": "PLUMB_R002",
      "specialty": "plumbing",
      "category": "Abastecimento de água",
      "subcategory": "Pressões",

      "reference": "RGSPPDADAR Art. 42, n.º 2",
      "regulation": "RGSPPDADAR",
      "article": "Art. 42",
      "version": "1995",
      "date": "1995-08-23",

      "rule_text": "Pressão máxima em qualquer ponto de utilização: 600 kPa",
      "parameters": {
        "pressao_maxima_kPa": 600,
        "unit": "kPa"
      },
      "validation_type": "range",

      "severity": "mandatory",

      "error_message": "Pressão superior a 600 kPa - Risco de danos. Não conforme RGSPPDADAR",
      "success_message": "✓ Pressão máxima conforme (<= 600 kPa)",
      "recommendation": "Instalar válvula redutora de pressão",

      "metadata": {
        "complexity": "simple",
        "requires_calculation": false,
        "requires_spatial_analysis": false,
        "requires_external_data": false,
        "application_scope": ["all"],
        "building_types": ["residential", "commercial", "industrial"]
      },

      "source": {
        "regulation": "RGSPPDADAR - Decreto Regulamentar 23/95",
        "article": "Art. 42, n.º 2",
        "version": "1995",
        "date": "1995-08-23",
        "document_url": "https://dre.pt/...",
        "pdf_page": 156
      },

      "related_rules": ["PLUMB_R001"]
    },
    {
      "id": "PLUMB_R003",
      "specialty": "plumbing",
      "category": "Drenagem de águas residuais",
      "subcategory": "Declives",

      "reference": "RGSPPDADAR Art. 68, n.º 1",
      "regulation": "RGSPPDADAR",
      "article": "Art. 68",
      "version": "1995",
      "date": "1995-08-23",

      "rule_text": "Declive mínimo de tubagens horizontais de drenagem: 2% para DN < 50mm, 1% para DN >= 50mm",
      "parameters": {
        "declive_minimo_dn_menor_50": 0.02,
        "declive_minimo_dn_maior_50": 0.01,
        "unit": "m/m"
      },
      "validation_type": "conditional",

      "conditional_logic": {
        "conditions": [
          {
            "if": "diametro_nominal < 50",
            "then": "declive >= 0.02"
          },
          {
            "if": "diametro_nominal >= 50",
            "then": "declive >= 0.01"
          }
        ]
      },

      "severity": "mandatory",

      "error_message": "Declive insuficiente para drenagem por gravidade - Não conforme RGSPPDADAR",
      "success_message": "✓ Declive de drenagem conforme",
      "recommendation": "Ajustar cotas de tubagens para garantir declive mínimo",

      "metadata": {
        "complexity": "medium",
        "requires_calculation": true,
        "requires_spatial_analysis": true,
        "requires_external_data": false,
        "application_scope": ["all"],
        "building_types": ["residential", "commercial", "industrial"]
      },

      "source": {
        "regulation": "RGSPPDADAR - Decreto Regulamentar 23/95",
        "article": "Art. 68, n.º 1",
        "version": "1995",
        "date": "1995-08-23",
        "document_url": "https://dre.pt/...",
        "pdf_page": 178
      }
    }
  ]
}
```

### PASSO 3: Implementar Engine Especializado (4-6 horas)

#### 3.1 Criar PlumbingEngine

```typescript
// src/lib/validation/engines/plumbing-engine.ts

import {
  SpecialtyEngine,
  SpecialtyEngineConfig,
  SpecialtyAnalysisContext,
  SpecialtyAnalysisResult,
  UniversalRule,
  SpecialtyFinding
} from '../universal-types';

export interface PlumbingData {
  waterSupply?: {
    pressure_min_kPa?: number;
    pressure_max_kPa?: number;
    flow_rate_l_min?: number;
    pipe_diameter_mm?: number;
  };
  drainage?: {
    slope_percent?: number;
    pipe_diameter_mm?: number;
    type?: 'gravity' | 'pump';
  };
  fixtures?: Array<{
    type: string;
    floor: string;
    zone: string;
  }>;
}

export interface PlumbingProject {
  plumbing?: PlumbingData;
  buildingType?: string;
  floors?: number;
}

export class PlumbingEngine extends SpecialtyEngine {
  constructor(config: SpecialtyEngineConfig) {
    super(config);
  }

  canAnalyze(project: PlumbingProject): boolean {
    return !!(project.plumbing && (
      project.plumbing.waterSupply ||
      project.plumbing.drainage ||
      project.plumbing.fixtures
    ));
  }

  async analyze(
    project: PlumbingProject,
    context: SpecialtyAnalysisContext
  ): Promise<SpecialtyAnalysisResult> {
    const startTime = Date.now();

    console.log('💧 Iniciando análise de Águas e Esgotos com engine especializado...');
    console.log(`   Âmbito: ${context.buildingType || 'geral'}`);

    const findings: SpecialtyFinding[] = [];
    const stats = {
      totalRules: this.getTotalRules(),
      rulesEvaluated: 0,
      passed: 0,
      failed: 0,
      critical: 0,
      warnings: 0,
      recommendations: 0,
      notApplicable: 0
    };

    // Avaliar cada regra
    for (const rule of this.config.rules) {
      // Verificar se regra é aplicável
      if (!this.isRuleApplicable(rule, project, context)) {
        stats.notApplicable++;
        continue;
      }

      stats.rulesEvaluated++;

      // Extrair dados relevantes para a regra
      const data = this.extractRelevantData(rule, project);

      // Validar regra
      const validationResult = this.validateRule(rule, data);

      // Criar finding
      const finding = this.createFinding(rule, validationResult, project);
      findings.push(finding);

      // Atualizar estatísticas
      if (validationResult.passed) {
        stats.passed++;
      } else {
        stats.failed++;
        if (finding.severity === 'critical') {
          stats.critical++;
        } else if (finding.severity === 'warning') {
          stats.warnings++;
        }
      }

      if (rule.recommendation) {
        stats.recommendations++;
      }
    }

    console.log(`✅ Análise de Águas e Esgotos completa:`);
    console.log(`   Regras avaliadas: ${stats.rulesEvaluated}`);
    console.log(`   Passou: ${stats.passed}`);
    console.log(`   Falhou: ${stats.failed}`);

    return {
      specialty: 'plumbing',
      engineType: 'PLUMB_SPECIALIZED',
      symbol: '💧',
      engineVersion: this.getVersion(),

      statistics: stats,
      findings,

      regulationSources: this.getRegulations().map(r => r.name),
      regulationVersion: this.getVersion(),

      scopesAnalyzed: [context.buildingType || 'general'],
      buildingContext: context,

      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }

  private isRuleApplicable(
    rule: UniversalRule,
    project: PlumbingProject,
    context: SpecialtyAnalysisContext
  ): boolean {
    // Verificar building types
    if (rule.metadata.building_types && context.buildingType) {
      if (!rule.metadata.building_types.includes(context.buildingType)) {
        return false;
      }
    }

    // Verificar se dados necessários estão presentes
    if (rule.category === 'Abastecimento de água' && !project.plumbing?.waterSupply) {
      return false;
    }

    if (rule.category === 'Drenagem de águas residuais' && !project.plumbing?.drainage) {
      return false;
    }

    return true;
  }

  private extractRelevantData(
    rule: UniversalRule,
    project: PlumbingProject
  ): Record<string, any> {
    const data: Record<string, any> = {};

    // Extrair dados baseado na categoria da regra
    if (rule.category === 'Abastecimento de água') {
      const ws = project.plumbing?.waterSupply;
      if (ws) {
        data.pressao_utilizacao = ws.pressure_min_kPa;
        data.pressao_maxima = ws.pressure_max_kPa;
        data.caudal = ws.flow_rate_l_min;
        data.diametro = ws.pipe_diameter_mm;
      }
    }

    if (rule.category === 'Drenagem de águas residuais') {
      const dr = project.plumbing?.drainage;
      if (dr) {
        data.declive = dr.slope_percent / 100; // Converter para decimal
        data.diametro_nominal = dr.pipe_diameter_mm;
        data.tipo_drenagem = dr.type;
      }
    }

    return data;
  }
}

// Factory function
export async function createPlumbingEngine(): Promise<PlumbingEngine> {
  // Carregar regras de ficheiros
  const rulesModule = await import('@/regulamentos/plumbing/rgsppdadar/rules.json');
  const metadataModule = await import('@/regulamentos/plumbing/rgsppdadar/metadata.json');

  const config: SpecialtyEngineConfig = {
    specialty: 'plumbing',
    version: metadataModule.version,
    enabled: true,
    rules: rulesModule.rules,
    regulations: [
      {
        code: 'RGSPPDADAR',
        name: metadataModule.regulation.name,
        version: metadataModule.regulation.version,
        date: metadataModule.regulation.date,
        url: metadataModule.regulation.url,
        coverage: {
          categories: metadataModule.coverage.categories,
          total_rules: metadataModule.coverage.total_rules
        }
      }
    ]
  };

  return new PlumbingEngine(config);
}
```

### PASSO 4: Integrar no Sistema (2-3 horas)

#### 4.1 Registrar Engine no Analyzer

```typescript
// src/lib/analyzer.ts

import { UniversalAnalyzer } from './validation/universal-types';
import { createPlumbingEngine } from './validation/engines/plumbing-engine';

// ... código existente ...

export async function initializeUniversalAnalyzer(): Promise<UniversalAnalyzer> {
  const analyzer = new UniversalAnalyzer();

  // Registrar engine de águas
  const plumbingEngine = await createPlumbingEngine();
  analyzer.registerEngine(plumbingEngine);

  // ... outros engines quando estiverem prontos ...

  return analyzer;
}
```

#### 4.2 Usar no analyzeProject

```typescript
// src/lib/analyzer.ts (continuação)

export async function analyzeProject(project: any): Promise<any> {
  // ... análise existente ...

  // Adicionar análise universal
  const universalAnalyzer = await initializeUniversalAnalyzer();

  const universalResult = await universalAnalyzer.analyzeAllSpecialties(project, {
    context: {
      buildingType: project.buildingType,
      zones: project.zones,
      projectPhase: 'basic'
    }
  });

  // Merge findings
  result.findings.push(...universalResult.findings);

  // Adicionar estatísticas por especialidade
  result.specialtyAnalysis = universalResult.bySpecialty;

  return result;
}
```

### PASSO 5: Testar (2-3 horas)

#### 5.1 Criar Teste E2E

```typescript
// src/lib/validation/engines/__tests__/plumbing-engine.test.ts

import { describe, it, expect } from 'vitest';
import { createPlumbingEngine } from '../plumbing-engine';

describe('PlumbingEngine', () => {
  it('should validate minimum water pressure', async () => {
    const engine = await createPlumbingEngine();

    const project = {
      buildingType: 'residential',
      plumbing: {
        waterSupply: {
          pressure_min_kPa: 45  // Abaixo do mínimo (50 kPa)
        }
      }
    };

    const result = await engine.analyze(project, { buildingType: 'residential' });

    expect(result.statistics.failed).toBeGreaterThan(0);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        regulation: expect.stringContaining('💧'),
        severity: 'critical'
      })
    );
  });

  it('should pass when pressure is adequate', async () => {
    const engine = await createPlumbingEngine();

    const project = {
      buildingType: 'residential',
      plumbing: {
        waterSupply: {
          pressure_min_kPa: 250  // Adequado
        }
      }
    };

    const result = await engine.analyze(project, { buildingType: 'residential' });

    expect(result.statistics.passed).toBeGreaterThan(0);
  });

  it('should validate drainage slope', async () => {
    const engine = await createPlumbingEngine();

    const project = {
      buildingType: 'residential',
      plumbing: {
        drainage: {
          slope_percent: 1.5,  // 1.5% - Abaixo do mínimo para DN < 50mm
          pipe_diameter_mm: 40
        }
      }
    };

    const result = await engine.analyze(project, { buildingType: 'residential' });

    const drainageFindings = result.findings.filter(f =>
      f.metadata.category === 'Drenagem de águas residuais'
    );

    expect(drainageFindings.length).toBeGreaterThan(0);
  });
});
```

#### 5.2 Executar Testes

```bash
npm test plumbing-engine.test.ts
```

### PASSO 6: Documentar (1-2 horas)

#### 6.1 Criar README da Especialidade

```markdown
# 💧 Águas e Esgotos - Validação Especializada

Engine de validação profunda para instalações de águas e esgotos, seguindo RGSPPDADAR.

## Regras Implementadas

- **Abastecimento de água:** 40 regras
- **Drenagem de águas residuais:** 35 regras
- **Drenagem de águas pluviais:** 15 regras
- **Materiais e equipamentos:** 10 regras

**Total:** 100 regras

## Uso

```typescript
import { createPlumbingEngine } from '@/lib/validation/engines/plumbing-engine';

const engine = await createPlumbingEngine();

const result = await engine.analyze(project, context);

console.log(`💧 ${result.statistics.rulesEvaluated} regras avaliadas`);
console.log(`✅ ${result.statistics.passed} passou`);
console.log(`❌ ${result.statistics.failed} falhou`);
```

## Regulamentos Cobertos

- **RGSPPDADAR** (DR 23/95) - 100 regras
- **NP EN 806** (previsto) - 60 regras

## Próximas Melhorias

- [ ] Adicionar NP EN 806
- [ ] Adicionar NP EN 1717
- [ ] Implementar cálculos de caudais
- [ ] Validações espaciais (distâncias)
```

---

## ✅ Checklist de Completude

Especialidade está completa quando:

- [x] Regulamento investigado (prompt executado)
- [x] Regras estruturadas em JSON
- [x] Metadados criados
- [x] Engine especializado implementado
- [x] Integrado no analyzer principal
- [x] Testes E2E criados
- [x] Testes passando (>90% coverage)
- [x] Documentação completa
- [x] README da especialidade
- [x] Símbolos e marcações funcionando

---

## 📈 Métricas de Qualidade

Engine deve atingir:
- ✅ **Cobertura:** >80% do regulamento
- ✅ **Testes:** >90% code coverage
- ✅ **Performance:** <100ms por regra
- ✅ **Precisão:** >95% validações corretas

---

## 🔄 Iterar para Próximas Especialidades

Repetir processo para:
1. 🔥 Segurança Contra Incêndios
2. ❄️ AVAC
3. ⛽ Gás
4. ...

Cada nova especialidade ficará mais rápida (~60-70% do tempo da primeira).

---

**Data:** 2026-02-16
**Versão:** 1.0
**Status:** Guia completo para primeira implementação

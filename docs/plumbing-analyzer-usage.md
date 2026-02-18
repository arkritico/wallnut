# 🚰 Plumbing Analyzer - Guia de Uso

## Visão Geral

O Plumbing Analyzer valida instalações hidráulicas contra **331 regras** consolidadas de regulamentos portugueses e normas europeias.

### Regulamentos Cobertos

- **RGSPPDADAR** (Decreto Regulamentar 23/95) - Instalações prediais de água e drenagem
- **RT-SCIE** (Portaria 1532/2008) - Proteção contra incêndios
- **DL 69/2023** - Qualidade da água
- **EN 806** - Normas europeias de abastecimento de água
- **EN 12056** - Sistemas de drenagem por gravidade

### Categorias de Regras

| Categoria | Nº Regras | Descrição |
|-----------|-----------|-----------|
| Abastecimento de água | 119 | Pressões, caudais, diâmetros, materiais |
| Drenagem de águas residuais | 85 | Declives, diâmetros, ventilação, materiais |
| Qualidade da água | 65 | Parâmetros físico-químicos, microbiológicos |
| Proteção contra incêndios | 33 | Bocas de incêndio, pressões, caudais |
| Normas europeias | 24 | EN 806 e EN 12056 |
| Drenagem de águas pluviais | 5 | Dimensionamento, método racional |

## Uso Básico

### 1. Verificar se Pode Analisar

```typescript
import { canAnalyzePlumbing } from '@/lib/plumbing-analyzer';
import type { BuildingProject } from '@/lib/types';

const project: BuildingProject = {
  id: 'proj-001',
  buildingType: 'residential',
  plumbing: {
    pressure: 250, // kPa
    minServicePressure: 150,
    maxServicePressure: 400,
    numberOfFixtures: 12,
    hasWaterSupply: true,
    hasDrainage: true,
    hasFireProtection: false,
  }
};

// Verificar se tem dados suficientes
if (canAnalyzePlumbing(project)) {
  console.log('✅ Projeto tem dados para análise hidráulica');
} else {
  console.log('❌ Projeto não tem dados hidráulicos suficientes');
}
```

### 2. Executar Análise

```typescript
import { analyzePlumbingRGSPPDADAR } from '@/lib/plumbing-analyzer';

const result = await analyzePlumbingRGSPPDADAR(project);

console.log('📊 Análise Completa:');
console.log(`   Regras avaliadas: ${result.statistics.total}`);
console.log(`   ✓ Passou: ${result.statistics.passed}`);
console.log(`   ✗ Falhou: ${result.statistics.failed}`);
console.log(`   ⚠ Avisos: ${result.statistics.warnings}`);
console.log(`   🔴 Crítico: ${result.statistics.critical}`);
```

### 3. Processar Findings

```typescript
// Findings críticos
const criticalFindings = result.findings.filter(f => f.severity === 'critical');

for (const finding of criticalFindings) {
  console.log(`🔴 ${finding.title}`);
  console.log(`   ${finding.description}`);
  console.log(`   Regulamento: ${finding.regulation}`);
  console.log(`   Artigo: ${finding.metadata?.reference}`);

  if (finding.details) {
    for (const detail of finding.details) {
      console.log(`   • ${detail}`);
    }
  }
}
```

## Exemplos Completos

### Exemplo 1: Validação de Abastecimento de Água

```typescript
const residentialProject: BuildingProject = {
  id: 'res-001',
  buildingType: 'residential',
  plumbing: {
    // Pressões (kPa)
    pressao: 250,
    pressao_min_servico_dispositivo: 150,
    pressao_max_servico_dispositivo: 400,
    pressao_recomendavel_dispositivo: 200,

    // Caudais (L/s)
    caudal_instantaneo_min_dispositivo: 0.15,
    caudal_simultaneo: 0.8,

    // Velocidade (m/s)
    velocidade_maxima_tubagem: 2.0,

    // Diâmetros (mm)
    diametro_minimo_tubagem: 25,
    diametro_ramal_ligacao: 32,

    // Capacidades
    capacidade_reservatorio: 1500, // L
    numero_dispositivos: 15,

    // Flags
    hasWaterSupply: true,
    hasDrainage: false,
    hasFireProtection: false,
  }
};

const result = await analyzePlumbingRGSPPDADAR(residentialProject);

// Agrupar por categoria
const findingsByCategory: Record<string, typeof result.findings> = {};
for (const finding of result.findings) {
  if (!findingsByCategory[finding.area]) {
    findingsByCategory[finding.area] = [];
  }
  findingsByCategory[finding.area].push(finding);
}

for (const [category, findings] of Object.entries(findingsByCategory)) {
  console.log(`\n📂 ${category}: ${findings.length} findings`);
  for (const finding of findings.slice(0, 3)) {
    console.log(`   ${finding.severity === 'critical' ? '🔴' : '⚠'} ${finding.title}`);
  }
}
```

### Exemplo 2: Validação de Proteção Contra Incêndios

```typescript
const commercialProject: BuildingProject = {
  id: 'com-001',
  buildingType: 'commercial',
  plumbing: {
    // Sistema de incêndio
    hasFireProtection: true,
    caudal_boca_incendio: 1.5, // L/s
    pressao_boca_incendio: 250, // kPa
    diametro_ramal_ligacao: 50, // mm - mínimo 45mm com incêndio

    // Abastecimento normal
    pressao: 300,
    hasWaterSupply: true,
    tem_reservatorio_regularizacao: false, // Sem reservatório
  }
};

const result = await analyzePlumbingRGSPPDADAR(commercialProject);

// Findings relacionados com incêndio
const fireFindings = result.findings.filter(f =>
  f.metadata?.reference?.includes('incêndio') ||
  f.metadata?.parameter?.includes('incendio')
);

console.log(`\n🔥 Validação de Sistema de Incêndio: ${fireFindings.length} regras`);
for (const finding of fireFindings) {
  console.log(`   ${finding.severity === 'critical' ? '🔴' : '✓'} ${finding.title}`);
}
```

### Exemplo 3: Validação de Qualidade da Água

```typescript
const qualityProject: BuildingProject = {
  id: 'qual-001',
  buildingType: 'residential',
  plumbing: {
    // Qualidade da água
    waterQualityMonitoring: true,
    cloro_residual_livre: 0.5, // mg/L
    ph_agua: 7.2,
    turbidez: 1.0, // NTU

    // Temperaturas (°C)
    temperatura_agua_quente: 55,
    temperatura_maxima_distribuicao: 60,

    hasWaterSupply: true,
  }
};

const result = await analyzePlumbingRGSPPDADAR(qualityProject);

// Findings de qualidade da água
const qualityFindings = result.findings.filter(f =>
  f.metadata?.parameter?.includes('cloro') ||
  f.metadata?.parameter?.includes('ph') ||
  f.metadata?.parameter?.includes('turbidez') ||
  f.metadata?.parameter?.includes('temperatura')
);

console.log(`\n💧 Validação de Qualidade da Água: ${qualityFindings.length} regras`);
```

## Obter Informações do Engine

```typescript
import { getPlumbingEngineInfo } from '@/lib/plumbing-analyzer';

const info = getPlumbingEngineInfo();

console.log('ℹ️  Informações do Engine:');
console.log(`   Tipo: ${info.engineType}`);
console.log(`   Versão: ${info.version}`);
console.log(`   Total de Regras: ${info.totalRules}`);
console.log(`   Parâmetros: ${info.parameters}`);
console.log(`   Descrição: ${info.description}`);

console.log('\n📚 Fontes Regulamentares:');
for (const source of info.sources) {
  console.log(`   • ${source}`);
}

console.log('\n🎯 Âmbitos:');
for (const scope of info.scopes) {
  console.log(`   • ${scope.scope}: ${scope.count} regras`);
}
```

## Parâmetros Aceites

### Pressões (kPa)
- `pressao` - Pressão de serviço
- `pressao_min_servico_dispositivo` - Pressão mínima nos dispositivos
- `pressao_max_servico_dispositivo` - Pressão máxima nos dispositivos
- `pressao_recomendavel_dispositivo` - Pressão recomendada
- `pressao_rede_publica` - Pressão da rede pública
- `pressao_boca_incendio` - Pressão nas bocas de incêndio

### Caudais (L/s)
- `caudal_instantaneo_min_dispositivo` - Caudal instantâneo mínimo
- `caudal_simultaneo` - Caudal simultâneo
- `caudal_boca_incendio` - Caudal das bocas de incêndio
- `caudal_pluvial` - Caudal pluvial

### Diâmetros (mm)
- `diametro_minimo_tubagem` - Diâmetro mínimo das tubagens
- `diametro_ramal_ligacao` - Diâmetro do ramal de ligação
- `diametro_tubagem_drenagem` - Diâmetro das tubagens de drenagem
- `diametro_coletor` - Diâmetro do coletor

### Velocidades e Inclinações
- `velocidade_maxima_tubagem` - Velocidade máxima (m/s)
- `inclinacao_minima_horizontal` - Inclinação mínima (%)
- `declive_tubagem` - Declive das tubagens (%)

### Temperaturas (°C)
- `temperatura_agua_quente` - Temperatura da água quente
- `temperatura_maxima_distribuicao` - Temperatura máxima de distribuição

### Qualidade da Água
- `cloro_residual_livre` - Cloro residual livre (mg/L)
- `ph_agua` - pH da água
- `turbidez` - Turbidez (NTU)

### Capacidades e Quantidades
- `capacidade_reservatorio` - Capacidade do reservatório (L)
- `numero_dispositivos` - Número de dispositivos
- `altura_coluna_agua` - Altura da coluna de água (m)
- `altura_coluna_ventilacao` - Altura da coluna de ventilação (m)

### Flags Booleanas
- `hasWaterSupply` - Tem abastecimento de água
- `hasDrainage` - Tem drenagem
- `hasFireProtection` - Tem proteção contra incêndios
- `tem_servico_incendio` - Tem serviço de combate a incêndios
- `tem_reservatorio_regularizacao` - Tem reservatório de regularização
- `tem_protecao_retorno` - Tem proteção de retorno
- `waterQualityMonitoring` - Monitorização de qualidade da água

## Integração com UI

```typescript
// Em componente React
import { useState, useEffect } from 'react';
import { analyzePlumbingRGSPPDADAR, canAnalyzePlumbing } from '@/lib/plumbing-analyzer';

export function PlumbingValidationPanel({ project }: { project: BuildingProject }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runValidation = async () => {
    if (!canAnalyzePlumbing(project)) {
      alert('Projeto não tem dados hidráulicos suficientes');
      return;
    }

    setLoading(true);
    try {
      const validationResult = await analyzePlumbingRGSPPDADAR(project);
      setResult(validationResult);
    } catch (error) {
      console.error('Erro na validação:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={runValidation} disabled={loading}>
        {loading ? 'Validando...' : 'Validar Instalações Hidráulicas'}
      </button>

      {result && (
        <div>
          <h3>Resultado da Validação</h3>
          <p>✓ Passou: {result.statistics.passed}</p>
          <p>✗ Falhou: {result.statistics.failed}</p>
          <p>⚠ Avisos: {result.statistics.warnings}</p>

          <div>
            {result.findings.map(finding => (
              <div key={finding.id}>
                <strong>{finding.title}</strong>
                <p>{finding.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

## Navegador de Regras

Para explorar todas as 331 regras visualmente:

```bash
# Aceder à página de navegação
http://localhost:3000/plumbing-rules
```

## Performance

- **331 regras** carregadas em memória
- Validação completa: ~50-200ms dependendo do número de parâmetros
- Singleton pattern: engine instanciado uma vez
- Lookup tables cached para validações rápidas

## Próximos Passos

1. Adicionar mais parâmetros ao `BuildingProject.plumbing`
2. Integrar com extração de dados de DWFx/IFC
3. Criar dashboards de conformidade
4. Export de relatórios de validação em PDF

---

**Versão:** 3.0
**Última atualização:** 2026-02-16
**Total de regras:** 331

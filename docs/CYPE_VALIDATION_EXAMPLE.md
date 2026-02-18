# 🔍 CYPE Price Validation - Exemplo de Uso

## Overview

O validador de preços compara dados do scraper com estimativas paramétricas e valida breakdowns.

## Uso com Scraper

```typescript
import { CypeUnifiedScraper } from './cype-unified-scraper';
import { validateBatch } from './cype-price-validator';

async function scrapeAndValidate() {
  // 1. Scrape data
  const scraper = new CypeUnifiedScraper();
  await scraper.scrapeAll();
  const items = scraper.toJSON().items;

  // 2. Prepare for validation
  const validationInput = items.map(item => ({
    code: item.code,
    description: item.description,
    category: item.category,
    unit: item.unit,
    totalCost: item.unitCost,
    breakdown: item.breakdown ? {
      materials: item.breakdown.materialCost,
      labor: item.breakdown.laborCost,
      machinery: item.breakdown.machineryCost,
    } : undefined,
  }));

  // 3. Validate batch
  const { results, stats } = validateBatch(validationInput);

  console.log('📊 Validation Stats:');
  console.log(`   Valid: ${stats.valid}/${stats.total} (${(stats.valid/stats.total*100).toFixed(1)}%)`);
  console.log(`   Using parametric fallback: ${stats.useParametric}`);
  console.log(`   Average confidence: ${stats.avgConfidence.toFixed(1)}%`);

  // 4. Filter out invalid prices
  const validated = results
    .filter(r => r.validation.isValid)
    .map(r => ({
      ...r,
      totalCost: r.validation.adjustedPrice || r.totalCost,
      source: r.validation.source,
    }));

  // 5. Save validated data
  fs.writeFileSync('data/cype-validated.json', JSON.stringify({
    metadata: {
      exportDate: new Date().toISOString(),
      totalItems: validated.length,
      validationStats: stats,
    },
    items: validated,
  }, null, 2));

  console.log('✅ Validated data saved to data/cype-validated.json');
}
```

## Uso Individual

```typescript
import { validateCypePrice } from './cype-price-validator';

const item = {
  code: 'SBP010',
  description: 'Pilar de betão armado C25/30',
  category: 'Estruturas > Betão armado',
  unit: 'm³',
  totalCost: 420,
  breakdown: {
    materials: 250,
    labor: 140,
    machinery: 30,
  },
};

const result = validateCypePrice(item);

if (result.isValid) {
  console.log(`✅ Preço válido (confiança: ${result.confidence}%)`);
} else {
  console.log(`❌ Preço inválido:`);
  console.log(`   Erros: ${result.errors.join(', ')}`);
  console.log(`   Avisos: ${result.warnings.join(', ')}`);

  if (result.adjustedPrice) {
    console.log(`   💡 Usar preço paramétrico: ${result.adjustedPrice}€`);
  }
}
```

## Validações Executadas

### 1. Validação de Unidades

```typescript
✅ m, m², m³, Ud, kg, h, l
❌ "m2" → normalizado para "m²"
❌ "xyz" → erro
```

### 2. Validação de Breakdowns

```typescript
// Soma de componentes = total (tolerância 5%)
✅ 250 + 140 + 30 = 420 ✓
❌ 250 + 140 + 30 = 500 ✗ (diferença: 19%)
```

### 3. Detecção de Outliers

```typescript
// Preço scraper vs parametric (tolerância 2x)
✅ Scraper: 420€, Parametric: 400€ → ratio 1.05x ✓
❌ Scraper: 42€, Parametric: 420€ → ratio 0.1x ✗ (outlier!)
```

## Exemplos de Fallback Paramétrico

### Caso 1: Breakdown Inválido

```json
{
  "code": "PAC010",
  "description": "Pavimento cerâmico",
  "totalCost": 420,
  "breakdown": { "materials": 28, "labor": 12, "machinery": 2 }
}
```

**Validação:**
- ❌ Breakdown: 28 + 12 + 2 = 42€ ≠ 420€ (diferença: 900%)
- ⚠️ Outlier: 420€ vs parametric 42€ (ratio 10x)
- 💡 **Usar parametric: 42€**

### Caso 2: Sem Breakdown

```json
{
  "code": "CPI010",
  "description": "Porta interior madeira",
  "totalCost": 280
}
```

**Validação:**
- ⚠️ Sem breakdown (confiança -5%)
- ✅ Outlier: 280€ vs parametric 260€ (ratio 1.08x)
- ✅ **Usar scraper: 280€** (confiança 95%)

### Caso 3: Preço Muito Alto

```json
{
  "code": "SAE010",
  "description": "Ascensor 4 paragens",
  "totalCost": 142000
}
```

**Validação:**
- ⚠️ Preço muito alto > 100.000€ (confiança -10%)
- ⚠️ Sem estimativa paramétrica
- ✅ **Usar scraper: 142.000€** (confiança 90%)

## Output JSON

```json
{
  "code": "SBP010",
  "totalCost": 420,
  "validation": {
    "isValid": true,
    "confidence": 100,
    "warnings": [],
    "errors": [],
    "source": "scraper"
  }
}
```

## Estatísticas Típicas

Com 2049 items do CYPE:

```
📊 Validation Stats:
   Valid: 1847/2049 (90.1%)
   Using parametric fallback: 67 (3.3%)
   Average confidence: 87.3%

📈 Breakdown:
   - Confidence 90-100%: 1623 items (79.2%)
   - Confidence 70-89%: 224 items (10.9%)
   - Confidence 50-69%: 135 items (6.6%)
   - Confidence <50%: 67 items (3.3%) → parametric
```

## Próximos Passos

- [ ] Machine learning para detecção de outliers mais precisa
- [ ] Histórico de preços (track price changes over time)
- [ ] Comparação regional (Lisboa vs Porto vs Faro)
- [ ] Alertas automáticos para preços suspeitos

# Price Matcher - Arquitetura Dinâmica

## Overview

O Price Matcher agora carrega dados **dinamicamente** do scraper, substituindo os 652 items hardcoded.

## Arquitetura Antes vs Depois

### ❌ ANTES (Hardcoded)

```typescript
// price-matcher.ts
const PRICE_CONSTRUCTION_DB: PriceWorkItem[] = [
  { code: "EES010", description: "...", ... }, // 652 items
  { code: "EES020", description: "...", ... },
  // ... 650 more items manually maintained
];
```

**Problemas:**
- Dados estáticos (nunca atualizados)
- Apenas 652 items (vs 2000+ disponíveis no Gerador de Precos)
- Manutenção manual (erro-prone)
- Desconectado do scraper

### ✅ DEPOIS (Dinâmico)

```typescript
// price-matcher-db-loader.ts
export function getPriceMatcherDatabase(): PriceWorkItem[] {
  const scrapedData = loadScrapedData('data/price-db.json');
  return scrapedData.items.map(convertToWorkItem);
}

// price-matcher.ts
let PRICE_CONSTRUCTION_DB: PriceWorkItem[] | null = null;

function getDatabase(): PriceWorkItem[] {
  if (!PRICE_CONSTRUCTION_DB) {
    PRICE_CONSTRUCTION_DB = getPriceMatcherDatabase(); // Auto-load
  }
  return PRICE_CONSTRUCTION_DB;
}
```

**Benefícios:**
- ✅ Dados live do scraper (2049 items)
- ✅ Auto-atualizado quando scraper roda
- ✅ Zero manutenção manual
- ✅ Cache para performance
- ✅ Breakdowns completos

## Fluxo de Dados

```
┌──────────────────────────────────────────────────────────┐
│  1. SCRAPER RUNS                                         │
│     PriceScraper.scrapeAll()                       │
│     ↓                                                    │
│     data/price-db.json (2049 items)                     │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  2. LOADER CONVERTS                                      │
│     getPriceMatcherDatabase()                             │
│     ↓                                                    │
│     ScrapedPriceItem → PriceWorkItem                       │
│     - Infer regulation areas                             │
│     - Generate search patterns                           │
│     - Calculate breakdowns                               │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  3. MATCHER USES                                         │
│     matchWbsToPrice(project)                              │
│     ↓                                                    │
│     Searches 2049 items (not 652)                        │
│     Returns best matches with confidence scores          │
└──────────────────────────────────────────────────────────┘
```

## Componentes

### 1. `price-matcher-db-loader.ts` (NEW)

**Responsabilidades:**
- Carregar `data/price-db.json`
- Converter formato scraper → matcher
- Inferir regulation areas automaticamente
- Gerar patterns de pesquisa
- Calcular breakdowns

**Funções principais:**
```typescript
getPriceMatcherDatabase(): PriceWorkItem[]
refreshMatcherDatabase(): PriceWorkItem[]
getDatabaseStats(): { totalItems, withBreakdown, byArea, ... }
```

### 2. `price-matcher.ts` (UPDATED)

**Mudanças:**
- ~~Hardcoded array~~ → Dynamic loading
- Cache automático
- Refresh on-demand

**API pública (sem breaking changes):**
```typescript
matchWbsToPrice(project): MatchReport     // ← Funciona igual
getPriceDatabase(): PriceWorkItem[]         // ← Agora retorna 2049 items
searchPriceDB(query): Match[]                // ← Pesquisa 2049 items
refreshPriceDatabase(): void               // ← NEW: força reload
```

### 3. `price-scraper.ts` (Scraper)

**Output:**
```json
{
  "metadata": {
    "totalItems": 2049,
    "version": "unified-scraper-1.0"
  },
  "items": [
    {
      "code": "NAF010",
      "description": "...",
      "totalCost": 11.23,
      "breakdown": [ ... ],
      "category": "Fachadas e paredes meeiras"
    }
  ]
}
```

## Conversão de Dados

### Scraper Format → Matcher Format

| Campo Scraper | Campo Matcher | Transformação |
|---------------|---------------|---------------|
| `code` | `code` | Direto |
| `description` | `description` | Direto |
| `category` | `chapter` | Direto |
| `totalCost` | `unitCost` | Direto |
| `breakdown[]` | `breakdown{}` | Soma por tipo (materials/labor/machinery) |
| - | `areas[]` | **Inferido** da categoria + descrição |
| - | `patterns[]` | **Gerado** da descrição + categoria |
| - | `isRehab` | Detecta "reabilita", "demoliç" |

### Inferência de Regulation Areas

```typescript
function inferRegulationAreas(category: string, description: string): RegulationArea[] {
  // Fire safety
  if (includes('incêndio', 'extintor', 'detetor')) → 'fire_safety'

  // Electrical
  if (includes('elétric', 'quadro', 'cabo')) → 'electrical'

  // Water/drainage
  if (includes('água', 'drenagem', 'tubo')) → 'water_drainage'

  // Thermal
  if (includes('isolamento térmico', 'ETICS', 'capoto')) → 'thermal'

  // ... 10+ areas

  // Fallback
  return ['architecture', 'general']
}
```

### Geração de Patterns

```typescript
function generatePatterns(description, category, code): RegExp[] {
  // 1. Main keywords (first 3-5 words)
  "Isolamento térmico pelo interior..." → /isolamento.*termic.*interior/i

  // 2. Code prefix
  "NAF010" → /\bNAF\d{3}\b/i

  // 3. Category keywords
  "Fachadas e paredes meeiras > Isolamentos" → /isolamentos/i

  return [pattern1, pattern2, pattern3];
}
```

## Usage

### Uso Normal (auto-load)

```typescript
import { matchWbsToPrice } from './price-matcher';

const report = matchWbsToPrice(project);
// ✅ Automaticamente carrega 2049 items do scraper
```

### Refresh Manual (após scraping)

```typescript
import { refreshPriceDatabase } from './price-matcher';

// 1. Run scraper
const scraper = new PriceScraper();
await scraper.scrapeAll();

// 2. Refresh matcher database
refreshPriceDatabase();
// ✅ Matcher agora usa dados frescos
```

### Estatísticas

```typescript
import { getDatabaseStats } from './price-matcher-db-loader';

const stats = getDatabaseStats();
console.log(stats);
// {
//   totalItems: 2049,
//   withBreakdown: 1847,
//   rehabItems: 312,
//   byArea: { electrical: 245, fire_safety: 89, ... },
//   topChapters: [
//     { chapter: "Instalações", count: 678 },
//     { chapter: "Fachadas", count: 423 },
//     ...
//   ]
// }
```

## Performance

### Cache Strategy

1. **First load:** Read `data/price-db.json` (~2 MB) → ~200ms
2. **Subsequent calls:** Return cached array → <1ms
3. **Refresh:** Clear cache + reload → ~200ms

### Memory

- **Before:** 652 items × 500 bytes = ~326 KB
- **After:** 2049 items × 500 bytes = ~1 MB
- **Trade-off:** 3x memory for 3x coverage ✅

## Migração

### Para Desenvolvedores

**Sem breaking changes!** API pública mantém-se igual:

```typescript
// ✅ Código existente funciona sem alterações
const report = matchWbsToPrice(project);
const items = getPriceDatabase();
const results = searchPriceDB("isolamento");
```

**Novo comportamento:**
- Antes: 652 items hardcoded
- Depois: 2049 items do scraper (ou 0 se `data/price-db.json` não existir)

### Fallback Behavior

Se `data/price-db.json` não existir:
```typescript
logger.warn('No scraped data available, returning empty database');
return []; // Ou pode retornar os 652 hardcoded como fallback
```

## Próximos Passos

- [ ] Task 6: Validação de preços (parametric fallback)
- [ ] Task 7: Cache inteligente (Redis opcional)
- [ ] Task 8: API com background jobs
- [ ] Adicionar fallback aos 652 items hardcoded se scraper falhar
- [ ] Hot-reload quando `data/price-db.json` muda (file watcher)

## Benefícios Finais

| Antes | Depois |
|-------|--------|
| 652 items | **2049 items** (3.1x) |
| 0 breakdowns | **1847 breakdowns** (90% coverage) |
| Manutenção manual | **Auto-atualizado** |
| Estático | **Dinâmico** |
| Scraper desconectado | **Integrado** |

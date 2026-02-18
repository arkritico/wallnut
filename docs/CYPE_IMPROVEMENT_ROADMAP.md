# 🚀 CYPE Scraping - Plano de Melhorias

**Data:** 2026-02-16
**Estado Atual:** 2 scrapers separados, sistemas desconectados, 33/~100 categorias
**Objetivo:** Sistema unificado, robusto, automatizado

---

## 📋 Roadmap Priorizado

### ✅ **FASE 1: Consolidação** (2-3 dias)

**1.1. Unificar Scrapers**
- [ ] Criar `src/lib/cype-unified-scraper.ts`
- [ ] Base: V2 (mais simples, HTML-first)
- [ ] Adicionar features V1: breakdowns, variantes
- [ ] Deprecar V1 e V2 (manter como backup)

**1.2. Melhorar Parsing**
- [ ] Substituir regex por `cheerio`
- [ ] Extração de preços mais robusta
- [ ] Extração de breakdowns (materiais/mão-obra/equipamento)

**1.3. Robustez**
- [ ] Adaptive backoff (exponential retry)
- [ ] Circuit breaker (para quando falha X vezes seguidas)
- [ ] Logging estruturado (Winston/Pino)

**Resultado:** 1 scraper robusto, mais fácil de manter

---

### ✅ **FASE 2: Integração** (2 dias)

**2.1. Conectar Matcher**
- [ ] Gerar `matcherDB` automaticamente do scraper
- [ ] Adicionar items do parametric como fallback
- [ ] Remover hardcoding dos 652 items

**2.2. Validação**
- [ ] Comparar preços scraper vs. parametric (detectar outliers)
- [ ] Validar soma de breakdown = total
- [ ] Validar unidades (m, m², m³, Ud, etc.)

**2.3. Caching**
- [ ] Cache Redis (opcional) ou in-memory
- [ ] TTL 24h para preços
- [ ] Invalidação inteligente

**Resultado:** Sistemas conectados, dados validados

---

### ✅ **FASE 3: Automatização** (3-4 dias)

**3.1. API Background Jobs**
```typescript
// POST /api/cype/scrape
{
  "categories": ["NAF", "EAB"],  // opcional, default: all
  "fullScrape": false,            // false = incremental
  "webhook": "https://..."        // opcional, notifica quando completo
}

// Resposta:
{
  "jobId": "job_abc123",
  "status": "queued",
  "estimatedTime": "2h"
}

// GET /api/cype/scrape/job_abc123
{
  "status": "running",
  "progress": 45,
  "itemsScraped": 567,
  "errors": 2
}
```

**3.2. Scheduled Jobs**
- [ ] GitHub Action: scrape diário (2AM)
- [ ] Incremental: só categorias alteradas
- [ ] Diff report: o que mudou?

**3.3. Supabase Integration**
- [ ] Schema para CYPE prices
- [ ] Tabela: `cype_items`, `cype_components`, `cype_scrape_log`
- [ ] RLS policies
- [ ] Triggers para atualização automática

**Resultado:** Sistema totalmente automatizado

---

### ✅ **FASE 4: Descoberta Inteligente** (opcional, 2-3 dias)

**4.1. Manual Discovery UI**
```
Interface para utilizador:
- Input: categoria nova (ex: "Pinturas")
- Sistema sugere possíveis URLs
- Utilizador valida/rejeita
- Auto-adiciona ao config
```

**4.2. Fallback para CSV/Excel**
```
Se categoria não está no site:
- Aceitar upload CSV/Excel do CYPE
- Parser automático
- Importar para sistema
```

**4.3. ML-based Price Validation**
```
- Treinar modelo com preços históricos
- Detectar anomalias (preço 10x normal = erro?)
- Sugerir correções
```

**Resultado:** Cobertura 100%, resiliente a mudanças

---

## 🎯 Quick Wins (Implementar JÁ)

### 1. Substituir Regex por Cheerio
```typescript
// ❌ ANTES (frágil):
const priceMatch = html.match(/Custo total por m²:\s*([\d,.]+)\s*€/);

// ✅ DEPOIS (robusto):
import * as cheerio from 'cheerio';
const $ = cheerio.load(html);
const price = $('.total-cost').text().match(/[\d,.]+/)[0];
```

### 2. Adaptive Backoff
```typescript
async function fetchWithBackoff(url: string, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url);
    } catch (err) {
      const delay = Math.min(1000 * (2 ** i), 30000); // max 30s
      console.log(`Retry ${i+1}/${retries} após ${delay}ms`);
      await wait(delay);
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}
```

### 3. Conectar Matcher ao Scraper
```typescript
// Em cype-matcher.ts:
export async function refreshMatcherDB() {
  const scrapedItems = JSON.parse(
    fs.readFileSync('data/cype-full.json', 'utf-8')
  ).items;

  MATCHER_DB = scrapedItems.map(item => ({
    code: item.code,
    description: item.description,
    keywords: extractKeywords(item.description),
    unitCost: item.totalCost,
    unit: item.unit
  }));

  console.log(`✅ Matcher DB updated: ${MATCHER_DB.length} items`);
}
```

---

## 📊 Métricas de Sucesso

| Métrica | Antes | Meta | Como Medir |
|---------|-------|------|------------|
| **Tempo de scrape completo** | 2-4h | 1-2h | Timestamp start/end |
| **Taxa de erro** | ~15% | <5% | Errors / Total items |
| **Cobertura** | 33 categorias | 80+ categorias | Manual discovery |
| **Breakdowns válidos** | 0% | 95% | Sum(breakdown) == total |
| **Uptime API** | N/A | 99% | Monitorização |

---

## 🛠️ Stack Recomendado

| Componente | Tool | Porquê |
|------------|------|--------|
| **HTML Parsing** | `cheerio` | Mais robusto que regex |
| **Job Queue** | `Inngest` ou `Bull` | Background jobs confiáveis |
| **Logging** | `winston` | Structured logs, múltiplos transports |
| **Cache** | `node-cache` ou Redis | Fast lookups |
| **Scheduling** | GitHub Actions | Free, integrado |

---

## 🚦 Estado Atual vs. Estado Ideal

```
ANTES:
┌─────────────┐     ┌──────────┐     ┌─────────────┐
│  Scraper V1 │     │ Matcher  │     │ Parametric  │
│  (complex)  │────▶│ (652 HW) │     │  (unused)   │
└─────────────┘     └──────────┘     └─────────────┘
       ↓
┌─────────────┐
│  Scraper V2 │
│  (simple)   │
└─────────────┘
Sistemas separados, dados estáticos

DEPOIS:
┌────────────────────────────────────────┐
│       Unified CYPE Scraper             │
│  (robusto, adaptativo, monitorizado)   │
└───────────┬────────────────────────────┘
            ↓
    ┌───────────────┐
    │  Matcher DB   │←── Auto-generated
    │  (live data)  │
    └───────┬───────┘
            ↓
    ┌───────────────┐
    │  Parametric   │←── Fallback + Validation
    │  Engine       │
    └───────────────┘
            ↓
    ┌───────────────┐
    │   Supabase    │←── Persistent storage
    │   (+ cache)   │
    └───────────────┘
Sistema unificado, auto-atualizado
```

---

## 📌 Próximos Passos

1. **Decidir**: Qual fase começar? (Recomendo Fase 1)
2. **Branch**: `feature/cype-unified-scraper`
3. **Implementar**: Seguir checklist acima
4. **Testar**: Scrape 5-10 categorias primeiro
5. **Deploy**: Gradual, monitorizar

---

**Questões?**
- Precisa de ajuda com alguma fase específica?
- Quer ver código exemplo para algum componente?
- Dúvidas sobre a arquitetura?

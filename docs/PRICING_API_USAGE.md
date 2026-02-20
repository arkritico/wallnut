# Pricing Scraping API - Background Jobs

## Overview

API para executar scraping de precos em background com tracking de progresso.

## Endpoints

### 1. Iniciar Scraping Job

```http
POST /api/pricing/scrape
Content-Type: application/json

{
  "categories": ["NAF", "EAB"],     // Opcional: filtrar categorias
  "fullScrape": false,              // false = incremental
  "webhook": "https://...",         // Opcional: notificar quando completo
  "enableValidation": true          // Validar preços após scraping
}
```

**Response:**
```json
{
  "jobId": "job_1708089600_abc123",
  "status": "queued",
  "estimatedTime": "30 min",
  "message": "Scraping job started. Use GET /api/pricing/scrape/job_1708089600_abc123 to check status."
}
```

### 2. Verificar Status do Job

```http
GET /api/pricing/scrape?jobId=job_1708089600_abc123
```

**Response (Running):**
```json
{
  "jobId": "job_1708089600_abc123",
  "status": "running",
  "progress": 45,
  "itemsScraped": 567,
  "errors": 2,
  "startTime": 1708089600000,
  "duration": 1350,
  "durationFormatted": "22 min 30 sec"
}
```

**Response (Completed):**
```json
{
  "jobId": "job_1708089600_abc123",
  "status": "completed",
  "progress": 100,
  "itemsScraped": 2049,
  "errors": 12,
  "startTime": 1708089600000,
  "endTime": 1708093200000,
  "duration": 3600,
  "durationFormatted": "60 min 0 sec",
  "result": {
    "totalItems": 2049,
    "validItems": 1847,
    "outputPath": "data/price-db.json"
  }
}
```

### 3. Listar Todos os Jobs

```http
GET /api/pricing/scrape
```

**Response:**
```json
{
  "jobs": [
    {
      "jobId": "job_1708089600_abc123",
      "status": "completed",
      "progress": 100,
      "itemsScraped": 2049,
      "startTime": "2026-02-16T10:00:00.000Z"
    },
    {
      "jobId": "job_1708086000_xyz789",
      "status": "running",
      "progress": 67,
      "itemsScraped": 1234,
      "startTime": "2026-02-16T09:00:00.000Z"
    }
  ],
  "total": 2
}
```

## Exemplos de Uso

### Exemplo 1: Scrape Completo com Validação

```bash
# 1. Iniciar job
curl -X POST http://localhost:3000/api/pricing/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "fullScrape": true,
    "enableValidation": true,
    "webhook": "https://my-app.com/webhook/scrape-complete"
  }'

# Response:
# {
#   "jobId": "job_1708089600_abc123",
#   "status": "queued",
#   "estimatedTime": "120 min"
# }

# 2. Verificar progresso (poll a cada 30s)
curl http://localhost:3000/api/pricing/scrape?jobId=job_1708089600_abc123

# 3. Quando completo, matcher DB é auto-atualizado
```

### Exemplo 2: Scrape Apenas Categorias Específicas

```bash
curl -X POST http://localhost:3000/api/pricing/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["NAF", "EAB", "IOD"],
    "fullScrape": false,
    "enableValidation": false
  }'
```

### Exemplo 3: Webhook Notification

```typescript
// Your webhook endpoint receives:
app.post('/webhook/scrape-complete', (req, res) => {
  const { jobId, status, totalItems } = req.body;

  if (status === 'completed') {
    console.log(`Scraping job ${jobId} completed with ${totalItems} items`);
    // Refresh your app's price database
    refreshPriceDatabase();
  } else if (status === 'failed') {
    console.error(`Scraping job ${jobId} failed:`, req.body.error);
  }

  res.sendStatus(200);
});
```

## Integração com Frontend

### React Component

```typescript
import { useState, useEffect } from 'react';

function PriceScrapeButton() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);

  // Start scraping
  const handleScrape = async () => {
    const response = await fetch('/api/pricing/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullScrape: true,
        enableValidation: true,
      }),
    });

    const data = await response.json();
    setJobId(data.jobId);
  };

  // Poll for status
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      const response = await fetch(`/api/pricing/scrape?jobId=${jobId}`);
      const data = await response.json();
      setStatus(data);

      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(interval);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div>
      <button onClick={handleScrape}>Start Price Scraping</button>

      {status && (
        <div>
          <p>Status: {status.status}</p>
          <p>Progress: {status.progress}%</p>
          <p>Items: {status.itemsScraped}</p>
          <p>Errors: {status.errors}</p>

          {status.status === 'completed' && (
            <p>✅ Completed! {status.result.totalItems} items scraped.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

## Job States

| Estado | Descrição |
|--------|-----------|
| `queued` | Job criado, aguardando execução |
| `running` | Scraping em progresso |
| `completed` | Scraping concluído com sucesso |
| `failed` | Scraping falhou (ver campo `error`) |

## Timeouts

- **API Route Timeout:** 5 minutos (Next.js `maxDuration`)
- **Background Job:** Sem limite (roda fora do request)
- **Recommended:** Use webhook ou polling para jobs longos (>5 min)

## Armazenamento de Jobs

**Atual:** In-memory (Map)
- ✅ Simples, rápido
- ❌ Perde-se com restart do servidor

**Produção (recomendado):** Redis ou PostgreSQL
```typescript
// Use Redis para persistência
const job = await redis.get(`job:${jobId}`);
```

## Limitações Atuais

- ⚠️ Jobs in-memory (perdem-se com restart)
- ⚠️ Sem autenticação (adicionar JWT/API key)
- ⚠️ Sem rate limiting (uma pessoa pode iniciar 100 jobs)
- ⚠️ Sem fila (jobs rodam imediatamente)

## Próximos Passos

- [ ] Integrar com Inngest ou Bull para job queue
- [ ] Persistir jobs em PostgreSQL/Supabase
- [ ] Adicionar autenticação (API key)
- [ ] Rate limiting (max 1 job por hora por user)
- [ ] Cancelar jobs em progresso
- [ ] Retry automático em caso de falha
- [ ] Logs estruturados por job (winston)

## Comparação com Alternativas

| Feature | Custom API | Inngest | Bull |
|---------|-----------|---------|------|
| Background jobs | ✅ | ✅ | ✅ |
| Progress tracking | ✅ (manual) | ✅ | ✅ |
| Webhooks | ✅ (manual) | ✅ (built-in) | ❌ |
| Retry | ❌ | ✅ | ✅ |
| Queue | ❌ | ✅ | ✅ |
| Monitoring UI | ❌ | ✅ | ✅ (Bull Board) |
| Cost | Free | Free tier | Free (self-hosted) |

**Recomendação:** Usar Inngest para produção.

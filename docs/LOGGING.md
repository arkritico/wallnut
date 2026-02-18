# 📝 Sistema de Logging Estruturado

## Overview

O projeto utiliza **Winston** para logging estruturado com múltiplos níveis, transports e formato JSON.

## Configuração

Arquivo: `src/lib/logger.ts`

### Log Levels

1. **error** (0) - Erros críticos
2. **warn** (1) - Avisos e situações anormais
3. **info** (2) - Informações gerais (default)
4. **debug** (3) - Debug detalhado

### Transports

#### Console (sempre ativo)
- Formato: human-readable com cores
- Exemplo: `14:32:45 [info] Scraper started`

#### File (apenas Node.js, não em edge runtime)
- `logs/error.log` - Apenas erros
- `logs/combined.log` - Todos os níveis
- Formato: JSON estruturado
- Rotação: 5MB max, 5 arquivos

## Uso

### Logger Básico

```typescript
import logger from './logger';

logger.info('Operação concluída');
logger.warn('Situação incomum', { detalhes: '...' });
logger.error('Erro crítico', { error: err });
```

### Logger por Módulo

```typescript
import { createLogger } from './logger';

const logger = createLogger('meu-modulo');

logger.info('Mensagem', { meta: 'data' });
// Output: [info] Mensagem {"module":"meu-modulo","meta":"data"}
```

### Scraper Activity Logger

```typescript
import { logScraperActivity } from './logger';

// Início
logScraperActivity('start', {});

// Cache hit
logScraperActivity('cache_hit', { url: '...' });

// Retry
logScraperActivity('retry', { url: '...', retryCount: 2 });

// Sucesso
logScraperActivity('success', { duration: 5000 });

// Erro
logScraperActivity('error', { error: err });
```

## Exemplo: CypeUnifiedScraper

```typescript
private logger = createLogger('cype-unified-scraper');

async scrapeAll() {
  logScraperActivity('start', {});
  this.logger.info('Starting scraper');

  try {
    // ... scraping logic
    logScraperActivity('success', { duration: 5000 });
  } catch (error) {
    logScraperActivity('error', { error });
    this.logger.error('Fatal error', { error });
  }
}
```

## Variável de Ambiente

Controlar nível de log via `.env.local`:

```bash
LOG_LEVEL=debug  # error | warn | info | debug
```

Default: `info`

## Output Estruturado (JSON)

```json
{
  "timestamp": "2026-02-16T14:32:45.123Z",
  "level": "info",
  "message": "Scraper started",
  "module": "cype-unified-scraper",
  "category": "NAF",
  "itemsScraped": 0
}
```

## Benefícios

✅ **Rastreabilidade** - Logs estruturados fáceis de pesquisar
✅ **Debugging** - Context rico com metadata
✅ **Monitorização** - Integração com ferramentas (Datadog, CloudWatch, etc.)
✅ **Performance** - Logs debug desativados em produção
✅ **Análise** - JSON facilita parsing e análise

## Próximos Passos

- [ ] Integração com serviço de logging externo (opcional)
- [ ] Dashboard de monitorização
- [ ] Alertas automáticos para erros críticos

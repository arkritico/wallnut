# CYPE Gerador de Preços - Scraper Profundo

## 📋 Visão Geral

Scraper completo para extrair todos os preços do **geradordeprecos.info** (CYPE Portugal) e integrar automaticamente na base de dados do Wallnut.

## ✨ Funcionalidades

### ✅ O que extrai:
- ✅ **Todos os capítulos** (IOD, EEI, FFO, AIS, etc.)
- ✅ **Códigos CYPE** (ex: IOD010, EEI015, FFO120)
- ✅ **Descrições completas** dos trabalhos
- ✅ **Preços unitários** atualizados
- ✅ **Unidades** (m2, m, Ud, kg, etc.)
- ✅ **Breakdown** (materiais, mão-de-obra, equipamento)
- ✅ **Reabilitação vs Obra Nova**
- ✅ **Hierarquia completa** (capítulos > subcapítulos > itens)
- ✅ **Múltiplas variantes** (diferentes materiais, espessuras, marcas)
- ✅ **Justificações detalhadas** (composições completas por item)
- ✅ **Tabs e opções** (extrai todas as alternativas disponíveis)
- ✅ **Export BC3** (formato padrão de orçamentos)

### 🎯 Capítulos suportados:
- **AIS** - Isolamento e impermeabilização
- **CAL** - Aquecimento e climatização
- **CAN** - Canalizações
- **DES** - Desmontagens
- **EAA** - Estrutura de aço
- **EDE** - Demolições
- **EEI** - Instalações elétricas BT
- **FFO** - Fachadas
- **IOA** - Isolamento acústico
- **IOD** - Isolamento térmico
- **PAV** - Pavimentos
- **PIN** - Pinturas
- **REH** - Reabilitação
- **SAN** - Saneamento
- **TEL** - Telecomunicações
- ... e muito mais!

## 🎯 Novas Funcionalidades

### 🔄 Múltiplas Variantes

O scraper agora deteta e extrai **todas as variantes** de cada item:

```typescript
{
  "code": "IOD010",
  "description": "Isolamento térmico em fachada",
  "unitCost": 15.75,
  "variants": [
    {
      "description": "Isolamento XPS 40mm",
      "unitCost": 12.50,
      "unit": "m2"
    },
    {
      "description": "Isolamento EPS 50mm",
      "unitCost": 10.20,
      "unit": "m2"
    },
    {
      "description": "Lã mineral 60mm",
      "unitCost": 14.80,
      "unit": "m2"
    }
  ]
}
```

**Casos suportados:**
- ✅ Tabs com opções diferentes
- ✅ Dropdowns de seleção
- ✅ Múltiplas linhas na mesma tabela
- ✅ Diferentes materiais/marcas
- ✅ Diferentes espessuras/dimensões

### 📋 Justificações Detalhadas

Extrai a **composição completa** de cada preço:

```typescript
{
  "code": "IOD010",
  "justification": {
    "materials": [
      {
        "description": "Placa XPS 40mm",
        "quantity": 1.05,
        "unit": "m2",
        "unitPrice": 8.50,
        "total": 8.93
      },
      {
        "description": "Cola e fixações",
        "quantity": 0.5,
        "unit": "kg",
        "unitPrice": 3.20,
        "total": 1.60
      }
    ],
    "labor": [
      {
        "description": "Oficial 1ª",
        "hours": 0.25,
        "rate": 18.50,
        "total": 4.63
      }
    ],
    "machinery": [
      {
        "description": "Ferramentas",
        "hours": 0.25,
        "rate": 1.20,
        "total": 0.30
      }
    ]
  }
}
```

### 💾 Download e Export

```typescript
// Guardar todas as justificações
scraper.saveJustificationsToFile("data/cype-justifications.json");

// Export para BC3 (formato padrão)
const bc3 = scraper.exportToBC3();
fs.writeFileSync("data/cype-prices.bc3", bc3);

// Download PDF de um item específico
await scraper.downloadJustificationPDF("IOD010", "data/IOD010.pdf");
```

## 🚀 Como usar

### Opção 1: Scraping completo (recomendado)

```bash
npm run scrape-cype
```

Isto vai:
1. ✅ Extrair **TODOS** os capítulos configurados
2. ✅ Respeitar rate limits (2 segundos entre pedidos)
3. ✅ Guardar em `src/data/cype-prices.json`
4. ✅ Converter para formato interno do Wallnut
5. ✅ ~2-4 horas para scraping completo

### Opção 2: Capítulos específicos (mais rápido)

```bash
# Apenas isolamento térmico e elétrico
npm run scrape-cype -- --chapters=IOD,EEI

# Personalizar output
npm run scrape-cype -- --output=data/custom-prices.json

# Ajustar rate limit (cuidado!)
npm run scrape-cype -- --rate-limit=3000

# Profundidade máxima
npm run scrape-cype -- --max-depth=2

# Extrair justificações detalhadas (MAIS LENTO!)
npm run scrape-cype -- --extract-justifications

# Extrair variantes (múltiplas opções)
npm run scrape-cype -- --extract-variants

# Desativar variantes (mais rápido)
npm run scrape-cype -- --no-variants

# Guardar justificações em ficheiro separado
npm run scrape-cype -- --save-justifications
```

### Opção 3: Programático (TypeScript)

```typescript
import { CypeScraper } from "@/lib/cype-scraper";

const scraper = new CypeScraper({
  rateLimit: 2000,
  maxDepth: 3,
  includeChapters: ["IOD", "EEI"],
});

const results = await scraper.scrapeAll((progress) => {
  console.log(`${progress.completed}/${progress.total} chapters`);
});

// Converter para formato Wallnut
const workItems = scraper.convertToWorkItems();

// Exportar JSON
const json = scraper.exportToJson();
```

## ⚙️ Configuração

### ScraperConfig

```typescript
{
  baseUrl: "https://www.geradordeprecos.info",
  rateLimit: 2000,           // ms entre pedidos (respeita o site!)
  maxDepth: 4,               // profundidade máxima da hierarquia
  includeChapters: [...],    // capítulos a scrape (ou null para todos)
  skipChapters: [...],       // capítulos a ignorar
  includeRehab: true,        // incluir preços de reabilitação
  includeObraNova: true,     // incluir preços de obra nova
}
```

## 📊 Output

### Formato JSON (Standard)

```json
{
  "metadata": {
    "scrapeDate": "2026-02-15T10:30:00Z",
    "source": "geradordeprecos.info",
    "totalItems": 1247,
    "version": "1.0"
  },
  "workItems": [
    {
      "code": "IOD010",
      "description": "Isolamento térmico em fachada...",
      "chapter": "Isolamento > Térmico > Fachadas",
      "unit": "m2",
      "unitCost": 15.75,
      "breakdown": {
        "materials": 9.45,
        "labor": 5.51,
        "machinery": 0.79
      },
      "isRehab": false,
      "areas": ["thermal"],
      "patterns": [/isolamento/i, /térmico/i, /fachada/i]
    }
  ]
}
```

### Formato JSON (Com Variantes e Justificações)

```json
{
  "metadata": {
    "scrapeDate": "2026-02-15T10:30:00Z",
    "source": "geradordeprecos.info",
    "totalItems": 1247,
    "version": "1.0"
  },
  "workItems": [
    {
      "code": "IOD010",
      "description": "Isolamento térmico em fachada XPS 40mm",
      "chapter": "Isolamento > Térmico > Fachadas",
      "unit": "m2",
      "unitCost": 15.75,
      "variants": [
        {
          "description": "Isolamento XPS 40mm",
          "unitCost": 15.75,
          "unit": "m2",
          "breakdown": {
            "materials": 9.45,
            "labor": 5.51,
            "machinery": 0.79
          }
        },
        {
          "description": "Isolamento EPS 50mm",
          "unitCost": 12.30,
          "unit": "m2",
          "breakdown": {
            "materials": 7.20,
            "labor": 4.50,
            "machinery": 0.60
          }
        }
      ],
      "justification": {
        "materials": [
          {
            "description": "Placa XPS 40mm densidade 35 kg/m3",
            "quantity": 1.05,
            "unit": "m2",
            "unitPrice": 8.50,
            "total": 8.93
          },
          {
            "description": "Cola poliuretano monocomponente",
            "quantity": 0.3,
            "unit": "kg",
            "unitPrice": 4.80,
            "total": 1.44
          }
        ],
        "labor": [
          {
            "description": "Oficial 1ª construção civil",
            "hours": 0.25,
            "rate": 18.50,
            "total": 4.63
          },
          {
            "description": "Ajudante",
            "hours": 0.25,
            "rate": 15.20,
            "total": 3.80
          }
        ],
        "machinery": [
          {
            "description": "Ferramentas manuais",
            "hours": 0.25,
            "rate": 1.20,
            "total": 0.30
          }
        ]
      },
      "isRehab": false,
      "areas": ["thermal"],
      "patterns": [/isolamento/i, /térmico/i, /fachada/i]
    }
  ]
}
```

### Formato BC3 (Export)

O formato BC3 (FIEBDC-3) é o padrão utilizado em Espanha e Portugal para orçamentos de construção. É compatível com software como CYPE, Presto, Arquimedes, etc.

```
~V|FIEBDC-3/2020|CYPE Gerador de Preços|Wallnut|2.0|
~K|€|2|
~D|IOD010|Placa XPS 40mm|1.05|8.50|Cola poliuretano|0.3|4.80|Oficial 1ª|0.25|18.50|Ajudante|0.25|15.20|Ferramentas|0.25|1.20|
~D|EEI015|...|
```

**Importar BC3:**
- CYPE: Ficheiro > Importar > BC3
- Presto: Ficheiro > Importar > FIEBDC
- Excel: Pode ser convertido com script Python/Node.js

## 🔄 Integração Automática

### 1. Carregar preços na app

```typescript
// src/lib/cost-estimation.ts
import cypePrices from "@/data/cype-prices.json";

export const CYPE_DATABASE: CypeWorkItem[] = cypePrices.workItems;
```

### 2. Atualização periódica

```bash
# Adicionar ao crontab / scheduled task
0 0 1 * * cd /path/to/wallnut && npm run scrape-cype
```

### 3. CI/CD (GitHub Actions)

```yaml
name: Update CYPE Prices
on:
  schedule:
    - cron: '0 0 1 * *'  # Monthly
  workflow_dispatch:     # Manual trigger

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run scrape-cype
      - uses: stefanzweifel/git-auto-commit-action@v4
        with:
          commit_message: "chore: update CYPE prices"
```

## ⚠️ Notas Importantes

### Legal & Ética

1. ✅ **Rate Limiting**: 2 segundos entre pedidos (respeita o servidor)
2. ✅ **User-Agent**: Identifica-se como navegador legítimo
3. ⚠️ **ToS**: Verifique os termos de uso do geradordeprecos.info
4. 💰 **Subscrição**: Para uso comercial, considere subscrever CYPE
5. 🔒 **Caching**: Guarda resultados para evitar re-scraping

### 🛡️ VPN & Proxy (Recomendado)

Para **evitar bloqueios** e **distribuir a carga**, use VPN ou proxies rotativos:

```bash
# Instalar dependências de proxy (opcional)
npm install https-proxy-agent socks-proxy-agent
```

**Opções:**
- 🥇 **ProtonVPN** (€5-10/mês) - Recomendado para uso pessoal
- 🥈 **Bright Data** ($500/mês) - IPs residenciais para produção
- 🥉 **Tor** (grátis) - Lento mas funcional para testes

📖 **Ver guia completo: [PROXY_SETUP.md](./PROXY_SETUP.md)**

**Exemplo rápido:**
```typescript
const scraper = new CypeScraper({
  useProxy: true,
  rotateProxies: true,
  proxies: [
    { type: "http", host: "proxy1.com", port: 8080 },
    { type: "http", host: "proxy2.com", port: 8080 },
  ],
});
```

**Com ProtonVPN:**
```bash
# Terminal 1: Ligar ProtonVPN
protonvpn-cli connect PT

# Terminal 2: Executar scraper (passa pela VPN automaticamente)
npm run scrape-cype

# Rodar entre países diferentes
protonvpn-cli connect ES  # Espanha
npm run scrape-cype -- --chapters=IOD
```

### Performance

**Scraping Básico:**
- **Tempo estimado**: 2-4 horas para scraping completo
- **Itens esperados**: 1000-3000 work items
- **Taxa**: ~10-20 capítulos/hora (com rate limiting)
- **Memória**: ~100-500MB durante scraping

**Com Justificações e Variantes:**
- **Tempo estimado**: 6-12 horas (3-4x mais lento)
- **Motivo**: Faz pedido adicional por cada item para obter detalhes
- **Taxa**: ~5-10 capítulos/hora
- **Memória**: ~500MB-1GB durante scraping
- **Recomendação**: Use apenas para capítulos específicos ou em modo incremental

**Otimização:**
```bash
# Rápido: apenas preços base
npm run scrape-cype -- --no-variants

# Médio: preços + variantes (sem justificações detalhadas)
npm run scrape-cype -- --extract-variants

# Lento: tudo (recomendado apenas para capítulos específicos)
npm run scrape-cype -- --chapters=IOD,EEI --extract-justifications --extract-variants
```

### Troubleshooting

**Erro: 429 Too Many Requests**
```bash
# Aumentar rate limit
npm run scrape-cype -- --rate-limit=5000
```

**Erro: Timeout**
```bash
# Reduzir profundidade
npm run scrape-cype -- --max-depth=2
```

**Página mudou estrutura**
```typescript
// Atualizar regex em cype-scraper.ts
private extractItems(html: string): CypeScrapedItem[] {
  // Ajustar padrões de regex conforme HTML atual
}
```

## 🎯 Roadmap

- [ ] Scraping de variações regionais (Lisboa, Porto, etc.)
- [ ] Extração de composições (breakdown detalhado)
- [ ] Integração com CYPE API (se disponível)
- [ ] Diff entre versões (track price changes)
- [ ] Web UI para scraping manual
- [ ] Export para Excel/CSV

## 📚 Recursos

- [geradordeprecos.info](https://www.geradordeprecos.info)
- [CYPE - Gerador de Preços](https://shop.cype.com/pt/produto/geradores-de-orcamentos-m14/)
- [Wallnut Cost Estimation](../src/lib/cost-estimation.ts)

## 🤝 Contribuir

Melhorias bem-vindas:
1. Otimizações de performance
2. Padrões de regex mais robustos
3. Suporte para novos capítulos
4. Melhores heurísticas de breakdown

---

**Made with 🌰 by Wallnut**

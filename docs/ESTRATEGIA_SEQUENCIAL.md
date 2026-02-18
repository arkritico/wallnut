# Estratégia de Extração Sequencial com Pontos de Controlo

## 🎯 Visão Geral

Sistema completo de exploração e extração de dados do geradordeprecos.info com:
- ✅ Exploração hierárquica completa
- ✅ Pontos de controlo (checkpoints) automáticos
- ✅ Retoma automática em caso de falha
- ✅ Progresso persistente em disco
- ✅ Validação e logs detalhados

## 📋 Fases da Estratégia

### Fase 1: Exploração (Discovery)

**Objetivo:** Descobrir todas as categorias e items disponíveis no site

**Script:** `explore-with-checkpoints.ts`

**Características:**
- Navegação hierárquica de 13 áreas principais
- Profundidade máxima de 4 níveis
- Checkpoint automático a cada 10 categorias
- Retoma automática com `--resume`
- Logs detalhados de progresso

**Execução:**
```bash
# Primeira execução (exploração completa)
npx tsx scripts/explore-with-checkpoints.ts

# Se interrompido, retomar de onde parou
npx tsx scripts/explore-with-checkpoints.ts --resume
```

**Output:**
- `data/exploration-checkpoint.json` - Checkpoint de progresso
- `data/exploration-results.json` - Categorias descobertas
- Logs em tempo real no console

**Estrutura do Checkpoint:**
```json
{
  "phase": "exploration",
  "currentArea": 5,
  "totalAreas": 13,
  "visitedUrls": ["url1", "url2", ...],
  "discoveredCategories": 127,
  "totalItems": 650,
  "timestamp": "2026-02-15T...",
  "errors": []
}
```

### Fase 2: Validação (Validation)

**Objetivo:** Revisar categorias descobertas e selecionar para scraping

**Processo Manual:**
1. Abrir `data/exploration-results.json`
2. Analisar categorias por:
   - Número de items
   - Área de construção
   - Relevância para o projeto
3. Copiar categorias selecionadas para `cype-categories.config.json`
4. Marcar `enabled: true` nas desejadas

**Ferramentas de Apoio:**
```bash
# Ver estatísticas rápidas
cat data/exploration-results.json | jq '.stats'

# Top 20 categorias por items
cat data/exploration-results.json | jq '.categories | sort_by(.itemCount) | reverse | .[0:20]'

# Filtrar por área específica
cat data/exploration-results.json | jq '.categories | map(select(.path[0] == "Estruturas"))'
```

### Fase 3: Extração (Scraping)

**Objetivo:** Extrair dados detalhados das categorias selecionadas

**Script:** `scrape-sequential.ts`

**Características:**
- Scraping sequencial com ordem garantida
- Checkpoint a cada 10 items extraídos
- Progresso salvo por categoria
- Retoma automática com `--resume`
- Rate limiting (2s entre items, 5s entre categorias)
- Export automático (JSON + CSV)

**Execução:**
```bash
# Primeira execução
npx tsx scripts/scrape-sequential.ts

# Se interrompido, retomar
npx tsx scripts/scrape-sequential.ts --resume

# Com config customizado
npx tsx scripts/scrape-sequential.ts custom-config.json --resume
```

**Output:**
- `data/scraping-checkpoint.json` - Checkpoint de scraping
- `data/scraping-progress/*.json` - Progresso por categoria
- `data/cype-full.json` - Dados completos em JSON
- `data/cype-full.csv` - Export para Excel (Windows-1252)
- `data/backups/cype-full-*.json` - Backup datado

**Estrutura do Checkpoint:**
```json
{
  "phase": "scraping",
  "currentCategory": 12,
  "totalCategories": 27,
  "categoriesCompleted": ["slug1", "slug2", ...],
  "itemsExtracted": 450,
  "componentsExtracted": 3200,
  "startTime": "2026-02-15T10:00:00Z",
  "lastUpdate": "2026-02-15T11:30:00Z",
  "errors": []
}
```

### Fase 4: Upload (Optional)

**Objetivo:** Carregar dados para Supabase

**Script:** `upload-to-supabase.ts` (já existe)

```bash
npx tsx scripts/upload-to-supabase.ts data/cype-full.json Lisboa
```

## 🔄 Fluxo Completo com Checkpoints

```
┌─────────────────────────────────────────────────────────┐
│ FASE 1: EXPLORAÇÃO                                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  $ npx tsx scripts/explore-with-checkpoints.ts          │
│                                                          │
│  ┌──────────────────────────────────────────────┐      │
│  │ Loop por 13 áreas principais                  │      │
│  │  ├─ Para cada área:                           │      │
│  │  │   ├─ Explorar recursivamente (max 4 níveis)│      │
│  │  │   ├─ Contar items por categoria            │      │
│  │  │   └─ Checkpoint a cada 10 categorias       │      │
│  │  └─ Checkpoint ao completar área              │      │
│  └──────────────────────────────────────────────┘      │
│                                                          │
│  Output: exploration-results.json (todas as categorias) │
│                                                          │
│  ⚠️  Se falhar → rerun com --resume                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ FASE 2: VALIDAÇÃO (Manual)                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Revisar exploration-results.json                    │
│  2. Copiar categorias relevantes                        │
│  3. Editar cype-categories.config.json                  │
│  4. Marcar enabled: true                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ FASE 3: EXTRAÇÃO                                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  $ npx tsx scripts/scrape-sequential.ts                 │
│                                                          │
│  ┌──────────────────────────────────────────────┐      │
│  │ Loop por categorias enabled                   │      │
│  │  ├─ Para cada categoria:                      │      │
│  │  │   ├─ Listar todos os items                 │      │
│  │  │   ├─ Para cada item:                       │      │
│  │  │   │   ├─ Extrair dados completos           │      │
│  │  │   │   ├─ Extrair breakdown                 │      │
│  │  │   │   └─ Checkpoint a cada 10 items        │      │
│  │  │   └─ Salvar progresso da categoria         │      │
│  │  └─ Checkpoint ao completar categoria         │      │
│  └──────────────────────────────────────────────┘      │
│                                                          │
│  Output:                                                 │
│   - cype-full.json (dados completos)                    │
│   - cype-full.csv (Excel)                               │
│   - scraping-progress/*.json (por categoria)            │
│                                                          │
│  ⚠️  Se falhar → rerun com --resume                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ FASE 4: UPLOAD (Opcional)                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  $ npx tsx scripts/upload-to-supabase.ts \              │
│      data/cype-full.json Lisboa                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## 💾 Sistema de Checkpoints

### Frequência de Salvamento

| Evento | Checkpoint Salvo | Dados Salvos |
|--------|------------------|--------------|
| Exploração: 10 categorias | ✅ | exploration-checkpoint.json |
| Exploração: área completa | ✅ | exploration-checkpoint.json + results |
| Scraping: 10 items | ✅ | scraping-checkpoint.json |
| Scraping: categoria completa | ✅ | checkpoint + progress/[categoria].json |
| Scraping: todas categorias | ✅ | checkpoint + exports (JSON/CSV) |

### Retoma Automática

Ambos os scripts detectam automaticamente checkpoints existentes:

```bash
# Detecta checkpoint e pergunta se quer retomar
npx tsx scripts/explore-with-checkpoints.ts --resume

# Ou força início novo (ignora checkpoint)
rm data/exploration-checkpoint.json
npx tsx scripts/explore-with-checkpoints.ts
```

### Dados Persistidos

```
data/
├── exploration-checkpoint.json    # Checkpoint de exploração
├── exploration-results.json       # Categorias descobertas
├── scraping-checkpoint.json       # Checkpoint de scraping
├── scraping-progress/             # Progresso por categoria
│   ├── isolamentos-fachadas.json
│   ├── pilares-betao-armado.json
│   └── ...
├── cype-full.json                 # Export final JSON
├── cype-full.csv                  # Export final CSV
└── backups/                       # Backups datados
    └── cype-full-2026-02-15.json
```

## 🚨 Tratamento de Erros

### Durante Exploração

- **403/404/500:** Categoria registada como erro, exploração continua
- **Timeout:** Retry automático (1x), depois skip
- **Loop infinito:** Proteção com Set de URLs visitadas
- **Profundidade excessiva:** Limite de 4 níveis

### Durante Scraping

- **Item falha:** Registado em errors[], scraping continua
- **Categoria falha:** Registada em errors[], próxima categoria
- **Rate limit:** Delays automáticos (2s/5s)
- **Crash total:** Checkpoint permite retoma exata

### Logs de Erro

Todos os erros são registados com:
```json
{
  "url": "https://...",
  "error": "HTTP 500",
  "timestamp": "2026-02-15T..."
}
```

## 📊 Monitorização de Progresso

### Console Output

Durante exploração:
```
[5/13] 📦 Estruturas
────────────────────────────────────────────────────────────
🔍 [L0] Estruturas
   📂 8 subcategorias
   🔍 [L1] Betão armado
      ✓ 27 items
      💾 Checkpoint salvo (50 categorias)
```

Durante scraping:
```
[12/27] 📂 Pilares - Betão armado
────────────────────────────────────────────────────────────
   Encontrados: 4 items
   [1/4] EHS010_Pilar_rectangular... ✓ 16 comp
   [2/4] EHS012_Sistema_cofragem... ✓ 8 comp
   💾 Checkpoint (45 items)
   ✅ Categoria completa: 4 items, 36 componentes
```

### Ficheiros de Status

Verificar progresso a qualquer momento:

```bash
# Status da exploração
cat data/exploration-checkpoint.json | jq '.phase, .currentArea, .discoveredCategories'

# Status do scraping
cat data/scraping-checkpoint.json | jq '.phase, .currentCategory, .itemsExtracted'

# Lista de categorias completas
cat data/scraping-checkpoint.json | jq '.categoriesCompleted'
```

## 💡 Boas Práticas

### 1. Exploração Progressiva

Não tentar extrair tudo de uma vez:

```bash
# Dia 1: Explorar áreas principais
npx tsx scripts/explore-with-checkpoints.ts

# Dia 2: Analisar resultados, ativar 20 categorias
# Editar config...

# Dia 3: Scraping das primeiras 20
npx tsx scripts/scrape-sequential.ts

# Dia 4: Ativar mais 20, continuar scraping
# Editar config...
npx tsx scripts/scrape-sequential.ts --resume
```

### 2. Backup Regular

```bash
# Antes de scraping importante
cp data/exploration-results.json data/exploration-results.backup.json
cp cype-categories.config.json cype-categories.config.backup.json

# Depois de scraping bem-sucedido
cp data/cype-full.json data/backups/cype-full-$(date +%Y%m%d-%H%M).json
```

### 3. Validação de Dados

```bash
# Verificar dados no Excel antes de upload
start data/cype-full.csv

# Validar JSON
cat data/cype-full.json | jq '.metadata'

# Contar items e componentes
cat data/cype-full.json | jq '.items | length'
cat data/cype-full.json | jq '[.items[].breakdown[]] | length'
```

### 4. Limpeza de Checkpoints

Depois de scraping completo e validado:

```bash
# Limpar checkpoints antigos (mantém dados finais)
rm data/exploration-checkpoint.json
rm data/scraping-checkpoint.json
rm -rf data/scraping-progress/

# OU mover para arquivo
mkdir data/archive
mv data/*-checkpoint.json data/archive/
mv data/scraping-progress/ data/archive/
```

## 🎯 Próximos Passos

Após completar todas as fases:

1. ✅ Validar dados no Excel
2. ✅ Upload para Supabase
3. ✅ Integrar com frontend Wallnut
4. ✅ Descobrir novas áreas (repetir Fase 1)
5. ✅ Manter base de dados atualizada

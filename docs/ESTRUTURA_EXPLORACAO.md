# Estrutura de Exploração do GeradorDePrecos.info

## 📋 Visão Geral

Sistema completo para exploração hierárquica e sequencial do site geradordeprecos.info, permitindo descoberta automática de todas as categorias e items disponíveis.

## 🏗️ Estrutura do Site

### Nível 0 - Áreas Principais (13 áreas)

```
obra_nova/
├── Trabalhos_previos/
├── Acondicionamento_do_terreno/
├── Fundacoes/
├── Estruturas/
├── Fachadas__divisoes_e_proteccoes/
├── Vaos/
├── Isolamentos_e_impermeabilizacoes/
├── Coberturas/
├── Revestimentos/
├── Instalacoes/
├── Equipamentos_fixos_e_sinalizacao/
├── Infra-estruturas_no_logradouro/
└── Gestao_de_residuos/
```

### Hierarquia de Navegação

```
Nível 0: Área Principal (ex: Estruturas)
  └── Nível 1: Sub-área (ex: Betão armado)
      └── Nível 2: Categoria (ex: Pilares)
          └── Nível 3: Subcategoria (ex: Pilares rectangulares)
              └── Items: Artigos individuais (EHS010, EHS012, etc.)
```

## 🔧 Scripts de Exploração

### 1. `explore-cype-hierarchy.ts` - Explorador Completo

**Função:** Navega toda a hierarquia do site e descobre todas as categorias.

**Características:**
- ✅ Exploração sequencial de 13 áreas principais
- ✅ Navegação recursiva até profundidade 5
- ✅ Detecção automática de items por categoria
- ✅ Proteção contra loops infinitos
- ✅ Rate limiting (1.5s entre requests)
- ✅ Geração de hierarquia JSON completa
- ✅ Geração de config file atualizado

**Uso:**
```bash
npx tsx scripts/explore-cype-hierarchy.ts
```

**Output:**
- `cype-hierarchy.json` - Estrutura hierárquica completa
- `cype-categories-complete.config.json` - Config pronto para scraping

### 2. `find-cype-items.ts` - Descoberta Rápida

**Função:** Verifica rapidamente quantos items existem em URLs específicas.

**Uso:**
```bash
npx tsx scripts/find-cype-items.ts
```

### 3. `scrape-cype-full.ts` - Scraper de Produção

**Função:** Faz scraping completo das categorias enabled no config.

**Uso:**
```bash
npx tsx scripts/scrape-cype-full.ts
```

## 📊 Fluxo de Trabalho Completo

### Fase 1: Descoberta

```bash
# 1. Explorar toda a hierarquia do site
npx tsx scripts/explore-cype-hierarchy.ts

# Output:
# - cype-hierarchy.json (estrutura completa)
# - cype-categories-complete.config.json (todas as categorias descobertas)
```

### Fase 2: Seleção

```bash
# 2. Revisar as categorias descobertas
cat cype-categories-complete.config.json

# 3. Ativar categorias desejadas (enabled: true)
# Editar manualmente ou por script
```

### Fase 3: Scraping

```bash
# 4. Fazer scraping das categorias ativas
npx tsx scripts/scrape-cype-full.ts

# Output:
# - data/cype-full.csv (Excel-ready)
# - data/cype-full.json (JSON estruturado)
# - data/categories/*.json (backups individuais)
```

### Fase 4: Upload

```bash
# 5. Upload para Supabase (opcional)
npx tsx scripts/upload-to-supabase.ts data/cype-full.json Lisboa
```

## 🎯 Estratégias de Exploração

### Opção A: Exploração Completa (Slow & Complete)

```typescript
// Explorar TODAS as áreas e subcategorias
// Tempo estimado: 30-60 minutos
// Resultado: Mapa completo do site
```

**Vantagens:**
- Descoberta completa de todas as categorias
- Sem necessidade de conhecimento prévio do site
- Gera mapa navegável da estrutura

**Desvantagens:**
- Lento (milhares de requests)
- Pode encontrar muitas categorias vazias

### Opção B: Exploração Guiada (Fast & Targeted)

```typescript
// Explorar apenas áreas específicas de interesse
const AREAS_INTERESSE = [
  "Estruturas",
  "Isolamentos_e_impermeabilizacoes",
  "Fundacoes",
  "Coberturas"
];
```

**Vantagens:**
- Rápido (poucos minutos)
- Foco nas áreas relevantes
- Menos ruído

**Desvantagens:**
- Requer conhecimento prévio
- Pode perder categorias úteis

### Opção C: Exploração Progressiva (Balanced)

```typescript
// Começar com áreas principais, depois expandir
// 1. Explorar nível 0 e 1 de todas as áreas
// 2. Identificar áreas com mais items
// 3. Explorar profundamente as áreas identificadas
```

**Vantagens:**
- Balanceado entre velocidade e completude
- Permite decisões informadas
- Evita becos sem saída

## 📈 Métricas e Monitorização

Durante a exploração, o sistema reporta:

```
🔍 [L0] Estruturas
   📂 8 subcategorias
   🔍 [L1] Betão armado
      ✓ 27 items encontrados
      📂 12 subcategorias
      🔍 [L2] Pilares
         ✓ 4 items encontrados
```

**Legendas:**
- `[L0]`, `[L1]`, `[L2]` - Nível de profundidade
- `✓ N items` - Items encontrados nesta categoria
- `📂 N subcategorias` - Subcategorias a explorar
- `❌ Erro` - Falha ao acessar categoria

## 🗂️ Formato dos Dados

### cype-hierarchy.json

```json
{
  "hierarchy": [
    {
      "name": "Estruturas",
      "slug": "estruturas",
      "url": "https://...",
      "level": 0,
      "itemCount": 150,
      "children": [
        {
          "name": "Betão armado",
          "level": 1,
          "itemCount": 27,
          "children": [...]
        }
      ]
    }
  ],
  "flatList": [
    {
      "name": "Pilares - Betão armado",
      "slug": "pilares-betao-armado",
      "url": "https://...",
      "itemCount": 4,
      "path": ["Estruturas", "Betão armado", "Pilares"]
    }
  ]
}
```

### cype-categories-complete.config.json

```json
{
  "_stats": {
    "totalCategories": 150,
    "totalItems": 800
  },
  "categories": [
    {
      "name": "Pilares - Betão armado",
      "slug": "pilares-betao-armado",
      "url": "https://...",
      "path": ["Estruturas", "Betão armado", "Pilares"],
      "enabled": false,
      "notes": "4 items - auto-descoberto",
      "itemCount": 4
    }
  ],
  "settings": {
    "rateLimitMs": 2000,
    "categoryDelayMs": 5000
  }
}
```

## 🚀 Próximos Passos

Depois de executar a exploração completa:

1. **Analisar Resultados**
   - Revisar `cype-hierarchy.json` para entender a estrutura
   - Identificar categorias relevantes

2. **Ativar Categorias**
   - Editar `cype-categories-complete.config.json`
   - Marcar `enabled: true` nas categorias desejadas

3. **Executar Scraping**
   - Rodar `scrape-cype-full.ts` para extrair dados
   - Verificar CSV gerado no Excel

4. **Iterar**
   - Ativar mais categorias progressivamente
   - Monitorizar qualidade dos dados
   - Ajustar configurações conforme necessário

## 💡 Dicas

- **Rate Limiting:** Respeitar delays para não sobrecarregar o servidor
- **Backup:** Sempre manter backups dos dados extraídos
- **Validação:** Verificar dados no Excel antes de fazer upload
- **Incremental:** Adicionar categorias progressivamente, não tudo de uma vez
- **Logs:** Manter logs das explorações para referência futura

# 🤖 AI-Powered Regulation Ingestion System

Sistema de ingestão semi-automática de regulamentos com AI.

## 📋 Visão Geral

```
User cola texto → AI extrai regras → Sistema valida → User aprova → Regras integradas
```

## 🏗️ Arquitetura

### 1. Componentes Frontend

#### AIRegulationIngestion (Novo)
- **Localização:** `src/components/AIRegulationIngestion.tsx`
- **Função:** Interface para colar regulamento e visualizar regras extraídas
- **Features:**
  - Textarea para colar texto do regulamento
  - Botão "Extrair com AI" que chama API
  - Preview das regras extraídas com validação
  - Classificação automática de plugin/categoria
  - Detecção de conflitos com regras existentes
  - Estados: válida, inválida, conflito

#### IngestionDashboard (Existente)
- **Localização:** `src/components/IngestionDashboard.tsx`
- **Integração:** Adicionar tab/botão para "Ingestão com AI"

### 2. Backend API

#### /api/extract-rules (Novo)
- **Localização:** `src/app/api/extract-rules/route.ts`
- **Método:** POST
- **Input:**
  ```json
  {
    "text": "DECRETO-LEI N.º 123/2024\n\nArtigo 1º - ..."
  }
  ```
- **Output:**
  ```json
  {
    "success": true,
    "metadata": {
      "regulamento": "DL 123/2024",
      "total_regras": 47
    },
    "rules": [
      {
        "id": "DL123_001",
        "artigo": "Art. 1º",
        "regulamento": "DL 123/2024",
        "categoria": "Abastecimento água",
        "descricao": "Pressão mínima nos dispositivos",
        "parametro": "pressao_min_dispositivo",
        "tipo_validacao": "threshold",
        "valores": { "min": 150, "unidade": "kPa" },
        "ambito": "general",
        "severidade": "mandatory"
      }
    ],
    "count": 47
  }
  ```

### 3. AI Pipeline

#### Fluxo de Extração
```
1. User → Frontend: Cola texto
2. Frontend → API: POST /api/extract-rules
3. API → Claude: Envia texto + extraction prompt
4. Claude → API: Retorna JSON com regras
5. API → Frontend: Regras extraídas
6. Frontend: Valida estrutura
7. Frontend: Classifica plugin
8. Frontend: Detecta conflitos
9. User: Revê e aprova
10. System: Merge no plugin correto
```

#### Extraction Prompt
- **Localização:** `prompts/quick-extract-rules.txt`
- **Função:** Template usado pela API para instruir Claude
- **Critérios:**
  - ✅ Valores numéricos (min/max/range)
  - ✅ Fórmulas matemáticas
  - ✅ Tabelas de lookup
  - ✅ Condições com thresholds
  - ❌ Texto descritivo sem números
  - ❌ "Deve ser adequado", "boas práticas"

## 🎯 Classificação Automática

### Plugin Classification
Sistema analisa:
- **Parâmetro:** `pressao`, `caudal` → plumbing
- **Parâmetro:** `corrente`, `tensao` → electrical
- **Parâmetro:** `temperatura`, `ventilacao` → hvac
- **Descrição:** Palavras-chave técnicas
- **Categoria:** Contexto da regra

### Confidence Score
- **0.9+** - Alta confiança (keywords claros)
- **0.7-0.9** - Média confiança
- **<0.7** - Baixa confiança (requer revisão manual)

## 🔍 Validação

### Structural Validation
- ✅ ID presente
- ✅ Parâmetro definido
- ✅ Valores não vazios
- ✅ Tipo de validação válido
- ✅ Unidades especificadas (quando aplicável)

### Conflict Detection

#### Tipo 1: Duplicate
```
Regra existente: pressao_min = 150 kPa
Nova regra: pressao_min = 150 kPa
→ Conflito: Parâmetro duplicado
```

#### Tipo 2: Contradiction
```
Regra existente: pressao_min = 150 kPa
Nova regra: pressao_min = 200 kPa
→ Conflito: Valores contraditórios
```

#### Tipo 3: Overlap
```
Regra existente: pressao range 150-400 kPa (general)
Nova regra: pressao range 100-300 kPa (residential)
→ Conflito: Sobreposição de âmbito
```

## 📦 Integração no Sistema Existente

### Passo 1: Adicionar ao IngestionDashboard

```typescript
// src/components/IngestionDashboard.tsx

import AIRegulationIngestion from "./AIRegulationIngestion";

export default function IngestionDashboard({ plugins, ... }) {
  const [showAIIngestion, setShowAIIngestion] = useState(false);

  return (
    <div>
      {/* Existing dashboard content */}

      {/* Add AI Ingestion button */}
      <button onClick={() => setShowAIIngestion(true)}>
        🤖 Ingestão com AI
      </button>

      {/* Show AI Ingestion panel */}
      {showAIIngestion && (
        <AIRegulationIngestion
          onRulesExtracted={(rules) => {
            console.log("Extracted:", rules);
            // TODO: Merge into plugins
          }}
          existingRules={getAllRules(plugins)}
          availablePlugins={plugins.map(p => p.id)}
        />
      )}
    </div>
  );
}
```

### Passo 2: Configurar Variável de Ambiente

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

### Passo 3: Testar

```bash
# 1. Start dev server
npm run dev

# 2. Navegar para http://localhost:3000
# 3. Clicar em "⚙️ Gestão Avançada de Regulamentos"
# 4. Clicar em "🤖 Ingestão com AI"
# 5. Colar texto de regulamento
# 6. Clicar "Extrair com AI"
# 7. Revisar regras extraídas
# 8. Aprovar e integrar
```

## 🚀 Exemplo de Uso

### Input: DL 123/2024
```
DECRETO-LEI N.º 123/2024

Artigo 1º
Pressão mínima

A pressão mínima nos dispositivos de utilização deve ser de 150 kPa.

Artigo 2º
Pressão máxima

A pressão máxima nos dispositivos não deve exceder 400 kPa.

Artigo 3º
Temperatura da água quente

A temperatura da água quente para consumo deve estar entre 55°C e 60°C.
```

### Output: 3 Regras Extraídas
```json
{
  "metadata": {
    "regulamento": "DL 123/2024",
    "total_regras": 3
  },
  "regras": [
    {
      "id": "DL123_001",
      "artigo": "Art. 1º",
      "regulamento": "DL 123/2024",
      "categoria": "Abastecimento água",
      "descricao": "Pressão mínima nos dispositivos",
      "parametro": "pressao_min_dispositivo",
      "tipo_validacao": "threshold",
      "valores": { "min": 150, "unidade": "kPa" },
      "ambito": "general",
      "severidade": "mandatory"
    },
    {
      "id": "DL123_002",
      "artigo": "Art. 2º",
      "regulamento": "DL 123/2024",
      "categoria": "Abastecimento água",
      "descricao": "Pressão máxima nos dispositivos",
      "parametro": "pressao_max_dispositivo",
      "tipo_validacao": "threshold",
      "valores": { "max": 400, "unidade": "kPa" },
      "ambito": "general",
      "severidade": "mandatory"
    },
    {
      "id": "DL123_003",
      "artigo": "Art. 3º",
      "regulamento": "DL 123/2024",
      "categoria": "Qualidade água",
      "descricao": "Temperatura água quente consumo",
      "parametro": "temperatura_agua_quente",
      "tipo_validacao": "range",
      "valores": { "min": 55, "max": 60, "unidade": "°C" },
      "ambito": "general",
      "severidade": "mandatory"
    }
  ]
}
```

### Frontend Validation Result
```
✅ DL123_001: Válida
   📌 Plugin sugerido: plumbing (90% confiança)
   📂 Categoria: Abastecimento água

⚠️  DL123_002: Conflito
   📌 Plugin sugerido: plumbing (90% confiança)
   ⚠️  Parâmetro duplicado: RGSP_015_002
   [Resolver Conflito]

✅ DL123_003: Válida
   📌 Plugin sugerido: plumbing (85% confiança)
   📂 Categoria: Qualidade água
```

## 🎨 UI/UX Flow

```
┌─────────────────────────────────────────────────────┐
│  Gestão Avançada de Regulamentos                   │
│                                                      │
│  📊 Dashboard                                       │
│  • 623 regras totais                               │
│  • 2 especialidades ativas                         │
│                                                      │
│  [🤖 Ingestão com AI]  ← Click                    │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  🤖 Ingestão Semi-Automática                       │
│                                                      │
│  Cole o texto do regulamento:                      │
│  ┌───────────────────────────────────────────────┐ │
│  │ DECRETO-LEI N.º 123/2024                     │ │
│  │                                               │ │
│  │ Artigo 1º - A pressão mínima...             │ │
│  └───────────────────────────────────────────────┘ │
│                                                      │
│  [🔍 Extrair Regras com AI]  ← Click             │
└─────────────────────────────────────────────────────┘
                    ↓
          ⏳ Extraindo... (5-15s)
                    ↓
┌─────────────────────────────────────────────────────┐
│  ✅ 47 Regras Extraídas                            │
│  [42 válidas] [5 conflitos]                        │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ ✓ DL123_001: Pressão mínima 150kPa         │   │
│  │   📌 plumbing (90%)                         │   │
│  │   [Editar] [Aprovar]                        │   │
│  ├─────────────────────────────────────────────┤   │
│  │ ⚠  DL123_002: Temperatura máx 60°C         │   │
│  │   ⚠  Conflito com RGSP_042                 │   │
│  │   [Resolver]                                │   │
│  └─────────────────────────────────────────────┘   │
│                                                      │
│  [✅ Validar Todas] [📥 Importar 42 regras]       │
└─────────────────────────────────────────────────────┘
```

## 🔧 Próximos Passos

### Fase 1: Core (Atual) ✅
- [x] AIRegulationIngestion component
- [x] /api/extract-rules endpoint
- [x] Extraction prompt template
- [x] Validação estrutural
- [x] Classificação automática
- [x] Detecção de conflitos

### Fase 2: Integration 🚧
- [ ] Integrar no IngestionDashboard
- [ ] Merge rules into plugins
- [ ] Conflict resolution UI
- [ ] Rule editor inline

### Fase 3: Enhancement 📝
- [ ] Batch processing (múltiplos regulamentos)
- [ ] Historical tracking (audit log)
- [ ] Export/import regulation sets
- [ ] Search & filter extracted rules
- [ ] Comparison view (old vs new rules)

### Fase 4: Advanced 🚀
- [ ] OCR support (PDF upload)
- [ ] Multi-language extraction
- [ ] Custom extraction templates per domain
- [ ] Machine learning for classification improvement
- [ ] Automatic rule versioning

## 📚 Referências

- **Extraction Prompt:** `prompts/quick-extract-rules.txt`
- **Component:** `src/components/AIRegulationIngestion.tsx`
- **API Route:** `src/app/api/extract-rules/route.ts`
- **Types:** `src/lib/plugins/types.ts`
- **Plugin System:** `src/lib/plugins/`

---

**Versão:** 1.0
**Data:** 2026-02-16
**Status:** Implementação completa da Fase 1

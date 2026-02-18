# Estratégia de Análise de Regulamentos

## 🎯 Objetivo

Processar documentos PDF de regulamentação de construção e extrair regras estruturadas automaticamente para integração no Wallnut.

## 📋 Abordagens Disponíveis

### Opção A: Claude.ai Projects (Recomendada para Análise Inicial)

**Vantagens:**
- ✅ Upload direto de múltiplos PDFs
- ✅ Contexto compartilhado entre documentos
- ✅ Interface interativa para refinar regras
- ✅ Iteração rápida sem código

**Limitações:**
- ❌ Não permite automação completa
- ❌ Export manual dos resultados
- ❌ Limite de PDFs por projeto (~100MB total)

**Quando usar:** Análise exploratória, prototipagem de regras, validação de abordagem

### Opção B: Claude Code Local (Atual - Para Automação)

**Vantagens:**
- ✅ Automação completa
- ✅ Processamento em lote
- ✅ Integração direta com codebase
- ✅ Scripts reutilizáveis

**Limitações:**
- ❌ PDFs precisam ser lidos via API/OCR
- ❌ Mais complexo de configurar

**Quando usar:** Processamento em lote, integração final, pipeline automático

### Opção C: Híbrida (Recomendada)

```
1. Claude.ai Project → Análise e prototipagem
2. Export templates e regras
3. Claude Code Local → Automação e integração
```

## 🔄 Workflow Recomendado

### Fase 1: Preparação (Manual)

```bash
# 1. Organizar documentos
regulamentos/
├── RSA/
│   └── RSA-2023.pdf
├── RGEU/
│   └── RGEU-atualizado.pdf
├── Termico/
│   ├── REH.pdf
│   └── RECS.pdf
└── Acustico/
    └── RAE.pdf
```

### Fase 2: Análise Exploratória (Claude.ai Project)

**Setup:**
1. Criar novo Project em Claude.ai: "Regulamentos PT Construção"
2. Upload dos PDFs (começar com 2-3 mais importantes)
3. Configurar Custom Instructions (ver templates abaixo)
4. Fazer análise interativa

**Output esperado:**
- Estrutura de regras identificada
- Tipos de validações necessárias
- Formato JSON das regras
- Exemplos concretos

### Fase 3: Automação (Claude Code Local)

**Setup:**
1. Script de processamento de PDFs
2. Prompt templates estruturados
3. Validação e refinamento automático
4. Export para formato Wallnut

## 📝 Templates de Prompts

### Template 1: Análise Inicial (Claude.ai Project)

```markdown
# CONTEXTO
Sou um sistema de análise de projetos de construção em Portugal. Preciso extrair regras de validação de regulamentos portugueses para aplicar automaticamente em projetos.

# OBJETIVO
Analisar o documento [NOME DO REGULAMENTO] e extrair todas as regras verificáveis automaticamente.

# FORMATO DE SAÍDA
Para cada regra, extrair:
1. **ID**: Código único (ex: RSA_4.2.1_altura_minima_pe_direito)
2. **Referência**: Artigo/secção do regulamento
3. **Categoria**: [Estrutural, Térmico, Acústico, Segurança, Acessibilidade, etc.]
4. **Condição**: Quando a regra se aplica
5. **Regra**: Descrição clara da validação
6. **Parâmetros**: Valores numéricos e unidades
7. **Tipo de Validação**: [mínimo, máximo, intervalo, ratio, condicional]
8. **Severidade**: [obrigatória, recomendada]

# FORMATO JSON
```json
{
  "id": "RSA_4.2.1_altura_minima_pe_direito",
  "source": "RSA - Artigo 4.2.1",
  "category": "Habitabilidade",
  "condition": "Compartimentos habitáveis",
  "rule": "Pé-direito mínimo livre",
  "parameters": {
    "min_height": {
      "value": 2.4,
      "unit": "m",
      "applies_to": "compartimentos principais"
    }
  },
  "validation_type": "minimum",
  "severity": "mandatory",
  "formula": "room.ceiling_height >= 2.4",
  "error_message": "Pé-direito insuficiente. Mínimo: 2.4m"
}
```

# INSTRUÇÕES
1. Ler o documento completo
2. Identificar todas as regras com valores numéricos verificáveis
3. Priorizar regras mais comuns em projetos residenciais
4. Agrupar regras por categoria
5. Fornecer 10 exemplos mais importantes primeiro

# EXCLUSÕES
- Regras puramente qualitativas sem parâmetros mensuráveis
- Regras que requerem análise humana subjetiva
- Regras já obsoletas ou revogadas
```

### Template 2: Extração Específica por Categoria

```markdown
# ANÁLISE FOCADA: [CATEGORIA]

Extrair especificamente regras de [TÉRMICO / ACÚSTICO / ESTRUTURAL] do documento.

## Informação a Extrair:

### Para Térmico:
- Coeficientes de transmissão térmica (U)
- Fatores solares
- Requisitos de ventilação
- Pontes térmicas

### Para Acústico:
- Isolamento a sons aéreos (Rw, DnT,w)
- Isolamento a sons de percussão (Ln,w, L'nT,w)
- Tempo de reverberação

### Para Estrutural:
- Sobrecargas mínimas
- Vãos máximos
- Requisitos sísmicos
- Ações do vento

## Output: Lista completa de regras no formato JSON
```

### Template 3: Validação Cruzada

```markdown
# VALIDAÇÃO ENTRE REGULAMENTOS

Documentos analisados: [RSA, RGEU, REH]

# OBJETIVO
Identificar:
1. Regras que aparecem em múltiplos regulamentos
2. Conflitos entre regulamentos (valor diferente para mesma regra)
3. Hierarquia de aplicação (qual prevalece)
4. Regras complementares que precisam ser verificadas juntas

# OUTPUT
Matriz de compatibilidade e precedência
```

## 🔧 Implementação Técnica

### Script de Processamento (Python/TypeScript)

```typescript
// scripts/process-regulation-pdf.ts

interface RegulationRule {
  id: string;
  source: string;
  category: string;
  condition: string;
  rule: string;
  parameters: Record<string, any>;
  validation_type: string;
  severity: 'mandatory' | 'recommended';
  formula?: string;
  error_message: string;
}

async function processRegulationPDF(
  pdfPath: string,
  regulationName: string
): Promise<RegulationRule[]> {

  // 1. Extrair texto do PDF
  const pdfText = await extractPDFText(pdfPath);

  // 2. Enviar para Claude API com prompt estruturado
  const rules = await extractRulesWithClaude(pdfText, regulationName);

  // 3. Validar e normalizar
  const validatedRules = validateRules(rules);

  // 4. Salvar em formato estruturado
  await saveRules(validatedRules, regulationName);

  return validatedRules;
}
```

## 📊 Estrutura de Dados

### Formato Final das Regras

```json
{
  "regulation": {
    "name": "Regulamento de Segurança contra Incêndios (RSA)",
    "version": "2023",
    "source_url": "https://...",
    "processed_date": "2026-02-15",
    "total_rules": 145
  },
  "categories": [
    {
      "name": "Acessibilidade",
      "rules": [...]
    },
    {
      "name": "Pé-direito",
      "rules": [...]
    }
  ],
  "rules": [
    {
      "id": "RSA_4.2.1_altura_minima_pe_direito",
      "source": "RSA - Artigo 4.2.1",
      "category": "Habitabilidade",
      "condition": "room.type === 'habitable'",
      "rule": "Pé-direito mínimo livre",
      "parameters": {
        "min_height": 2.4,
        "unit": "m"
      },
      "validation_type": "minimum",
      "severity": "mandatory",
      "formula": "room.ceiling_height >= 2.4",
      "error_message": "Pé-direito insuficiente. Mínimo: 2.4m",
      "references": [
        "RGEU Art. 66",
        "Código Civil Art. 1305"
      ]
    }
  ]
}
```

## 🎯 Workflow Prático Passo-a-Passo

### Dia 1: Análise Exploratória

1. **Criar Claude.ai Project**: "Regulamentos PT Construção"
2. **Upload PDFs**: Começar com RSA e RGEU (mais importantes)
3. **Usar Template 1**: Análise inicial
4. **Iterar**: Refinar formato de saída
5. **Documentar**: Padrões identificados

**Output:**
- 20-30 regras exemplo bem estruturadas
- Template JSON validado
- Lista de categorias principais

### Dia 2-3: Processamento em Lote

1. **Criar script local**: `process-regulations.ts`
2. **Implementar extração PDF**: Usar pdf-parse ou similar
3. **Configurar Claude API**: Com prompt template
4. **Processar todos PDFs**: Um por vez
5. **Validação manual**: Spot check 10% das regras

**Output:**
- Todos regulamentos processados
- JSON estruturado por regulamento
- Relatório de cobertura

### Dia 4: Integração

1. **Importar para Supabase**: Tabela `regulation_rules`
2. **Criar API endpoints**: Para consulta de regras
3. **Integrar com validação**: Engine do Wallnut
4. **Testar**: Projetos exemplo

## 💡 Dicas Importantes

### Para Claude.ai Project:

1. **Começar pequeno**: 1-2 PDFs primeiro
2. **Iterar formato**: Várias conversas até formato ideal
3. **Usar Artifacts**: Para visualizar JSON
4. **Export incremental**: Copiar resultados regularmente

### Para Automação Local:

1. **Chunk PDFs**: Processar seções, não documento inteiro
2. **Rate limiting**: Respeitar limites da API
3. **Checkpoint**: Salvar progresso regularmente
4. **Validação**: Sempre verificar output

### Para Qualidade:

1. **Validação cruzada**: Comparar regras entre regulamentos
2. **Review jurídico**: Confirmar interpretação com especialista
3. **Testes reais**: Aplicar em projetos conhecidos
4. **Versionamento**: Manter histórico de mudanças

## 📚 Regulamentos Prioritários

### Fase 1 (Essenciais):
1. **RSA** - Segurança contra Incêndios
2. **RGEU** - Geral de Edificações Urbanas
3. **REH** - Energético (Habitação)

### Fase 2 (Importantes):
4. **RAE** - Acústico de Edifícios
5. **RECS** - Energético (Comércio e Serviços)
6. **Acessibilidades** - DL 163/2006

### Fase 3 (Complementares):
7. Estruturas (Eurocódigos)
8. Águas e Saneamento
9. Instalações Elétricas (RTIEBT)

## 🔄 Manutenção

### Atualização de Regulamentos:

```bash
# Quando novo regulamento ou versão:
1. Upload novo PDF
2. Executar análise
3. Comparar com versão anterior
4. Identificar mudanças (diff)
5. Atualizar base de dados
6. Notificar utilizadores de mudanças críticas
```

## 📈 Métricas de Sucesso

- ✅ 80%+ das regras verificáveis extraídas
- ✅ <5% de falsos positivos em validação
- ✅ <2% de regras incorretas
- ✅ Tempo de processamento: <30min por regulamento
- ✅ Cobertura de 90%+ dos casos de uso comuns

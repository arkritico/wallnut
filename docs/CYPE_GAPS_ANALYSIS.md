# 🔍 CYPE Scraper - Análise de Lacunas

**Data:** 2026-02-16
**Scraped:** 2,049 items em 605 categorias únicas

---

## 📊 Resumo Executivo

✅ **Excelente cobertura geral:** 605 categorias únicas scraped
⚠️ **37 categorias específicas em falta** (da lista de 56 conhecidas)
🎯 **2 categorias de alta prioridade** faltam (MEP críticos)

---

## ⚠️ Categorias Críticas em Falta

### High Priority (MEP Essenciais)

| Prefix | Categoria | Razão | Urgência |
|--------|-----------|-------|----------|
| **EAB** | Instalações elétricas - Baixa tensão | Regulamentos RTIEBT, muito comum | 🔴 Alta |
| **ISR** | Drenagem águas residuais | Regulamentos RGSPPDADAR, obrigatório | 🔴 Alta |

### Medium Priority (Construção Comum)

| Prefix | Categoria | Razão | Urgência |
|--------|-----------|-------|----------|
| **EBC** | Betão armado - Colunas | Estruturas, muito comum | 🟡 Média |
| **FAT** | Alvenarias - Tijolo | Paredes, extremamente comum | 🟡 Média |
| **RAF** | Revestimentos exteriores - Fachadas | Acabamentos exteriores | 🟡 Média |
| **SPC** | Pavimentos - Cerâmico | Acabamentos interiores | 🟡 Média |

---

## ✅ Categorias Bem Cobertas

Já temos excelente cobertura nas seguintes áreas:

### Instalações (444 items = 21.7%)
- ✅ Detetores de incêndio (IOD)
- ✅ Iluminação emergência (IOA)
- ✅ Extintores (IOX)
- ✅ Tomadas/interruptores (EAT)
- ⚠️ Falta: EAB (baixa tensão), ITA/ITC (ITED)

### Isolamentos e Impermeabilizações (225 items = 11%)
- ✅ NAF (Fachadas) - 7 items
- ✅ Isolamentos térmicos gerais
- ✅ Impermeabilizações

### Revestimentos (297 items = 14.5%)
- ✅ Revestimentos interiores
- ✅ Cerâmicos
- ⚠️ Falta: RAF (fachadas), RIG (gesso cartonado)

### Coberturas (154 items = 7.5%)
- ✅ Bem coberto

### Demolições (177 items = 8.6%)
- ✅ Muito bem coberto (reabilitação)

---

## 🔎 Análise Detalhada das Lacunas

### 1. EAB - Instalações Elétricas Baixa Tensão

**Importância:** 🔴 Crítica
**Uso:** Instalações elétricas em TODOS os edifícios
**Regulamento:** RTIEBT obrigatório

**Possíveis URLs:**
```
https://geradordeprecos.info/obra_nova/Instalacoes/Eletricas/Baixa_tensao/
https://geradordeprecos.info/obra_nova/Instalacoes/Eletricas/Quadros_eletricos/
https://geradordeprecos.info/obra_nova/Instalacoes/Eletricas/Cabos_e_tubagens/
```

**Items esperados:**
- Quadros elétricos (QE)
- Disjuntores
- Cabos elétricos (H07V-U, H07V-R)
- Condutas (VD, ECTQ)
- Caixas de derivação

### 2. ISR - Drenagem Águas Residuais

**Importância:** 🔴 Crítica
**Uso:** Instalações sanitárias em TODOS os edifícios
**Regulamento:** RGSPPDADAR obrigatório

**Possíveis URLs:**
```
https://geradordeprecos.info/obra_nova/Instalacoes/Drenagem/Aguas_residuais/
https://geradordeprecos.info/obra_nova/Instalacoes/Drenagem/Tubos_PVC/
```

**Items esperados:**
- Tubos PVC série 32, 40, 50 (águas residuais)
- Curvas, tês, reduções
- Sifões
- Caixas de ramal

### 3. EBC - Betão Armado Colunas

**Importância:** 🟡 Média
**Uso:** Estruturas de edifícios
**Nota:** Temos outros códigos de estruturas, mas não especificamente "EBC"

**Verificar:** Pode estar sob outros prefixos (FBY tem 21 items - pode ser fundações/betão?)

### 4. FAT - Alvenarias Tijolo

**Importância:** 🟡 Média
**Uso:** Paredes interiores/exteriores extremamente comum

**Verificar:** Pode estar sob "Fachadas divisoes e proteccoes" (106 items)

---

## 💡 Recomendações

### Ação Imediata (próxima semana)

1. **Scrape direcionado para EAB e ISR:**
   ```bash
   # Via API
   curl -X POST http://localhost:3000/api/cype/scrape \
     -d '{"categories":["EAB","ISR"],"enableValidation":true}'
   ```

2. **Verificar se categorias existem no site:**
   - Abrir geradordeprecos.info
   - Navegar para Instalações > Elétricas
   - Verificar se existe secção "Baixa tensão" ou similar

3. **Atualizar configuração do scraper:**
   - Adicionar URLs específicas para EAB/ISR
   - Re-run scraper

### Ação a Médio Prazo (próximo mês)

1. **Investigar discrepância de prefixos:**
   - Temos 605 prefixos vs 56 conhecidos
   - Muitos podem ser variantes ou sub-categorias
   - Criar mapeamento completo

2. **Validar categorias "Medium Priority":**
   - Verificar se EBC/FAT/RAF/SPC estão sob outros nomes
   - Atualizar lista de categorias conhecidas

3. **Categorização melhorada:**
   - Agrupar 605 prefixos em categorias principais
   - Criar hierarquia: Categoria > Sub-categoria > Prefixo

---

## 📅 Frequência de Scraping Recomendada

Baseado na análise de cobertura e estabilidade de preços CYPE:

| Tipo | Frequência | Razão |
|------|-----------|-------|
| **Full scrape** | Trimestral (3 meses) | Preços CYPE são estáveis |
| **Incremental** | Mensal | Detectar novos items |
| **Validation** | Semanal | Validar preços vs parametric |
| **Categorias em falta** | Ad-hoc | Quando identificadas |

**Próximo full scrape sugerido:** Maio 2026

---

## 🎯 Checklist Próximos Passos

- [ ] Verificar se EAB/ISR existem em geradordeprecos.info
- [ ] Adicionar URLs para categorias em falta
- [ ] Run targeted scrape para EAB/ISR
- [ ] Criar mapeamento completo dos 605 prefixos
- [ ] Atualizar documentação com categorias reais
- [ ] Configurar scrape mensal (não diário!)

---

## 📈 Métricas de Cobertura

```
Total Scraped:      2,049 items
Unique Prefixes:    605
Known Categories:   56
Missing (Known):    37 (66% coverage of known)
Coverage Real:      Excelente (605 >> 56)

High Priority Gaps: 2 (EAB, ISR)
Medium Priority:    4 (EBC, FAT, RAF, SPC)
Low Priority:       31 (maioria são especializados)
```

---

## 🔗 URLs Úteis

- **CYPE Gerador de Preços:** https://geradordeprecos.info/
- **Obra Nova:** https://geradordeprecos.info/obra_nova/
- **Instalações:** https://geradordeprecos.info/obra_nova/Instalacoes/
- **Reabilitação:** https://geradordeprecos.info/reabilitacao/

---

**Conclusão:** Sistema já tem excelente cobertura (2049 items). Foco deve ser nas 2 categorias críticas (EAB, ISR) e validar se Medium Priority já existem sob outros nomes.

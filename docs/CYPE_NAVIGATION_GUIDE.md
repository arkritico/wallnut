# 🗺️ Guia de Navegação - Geradordeprecos.info

## 📋 Índice
1. [Estrutura do Site](#estrutura-do-site)
2. [Como Navegar](#como-navegar)
3. [Padrões de URL](#padrões-de-url)
4. [Áreas Principais](#áreas-principais)
5. [Dicas de Exploração](#dicas-de-exploração)
6. [URLs de Entrada](#urls-de-entrada)

---

## 🏗️ Estrutura do Site

### Hierarquia
```
geradordeprecos.info
└── obra_nova/
    ├── [ÁREA_PRINCIPAL]/
    │   ├── [SUB_ÁREA]/
    │   │   ├── [CATEGORIA_ESPECÍFICA]/
    │   │   │   └── [CÓDIGO]_[Descrição].html  ← Item individual
    │   │   └── ...
    │   └── ...
    └── ...
```

### Exemplo Real
```
https://geradordeprecos.info/obra_nova/
  └── Isolamentos_e_impermeabilizacoes/
      └── Isolamentos_termicos/
          └── Fachadas_e_paredes_meeiras/
              └── NAF010_Isolamento_termico.html
```

---

## 🧭 Como Navegar

### Passo 1: Página Principal
Comece em: **https://geradordeprecos.info/obra_nova/**

Esta página lista todas as **áreas principais** de construção.

### Passo 2: Escolher Área Principal
Exemplos de áreas principais:
- `Isolamentos_e_impermeabilizacoes`
- `Revestimentos`
- `Estruturas`
- `Instalacoes`
- `Pavimentos`

**Clique na área que interessa** → leva para sub-áreas

### Passo 3: Escolher Sub-Área
Dentro de cada área principal há sub-áreas.

Exemplo em "Isolamentos_e_impermeabilizacoes":
- `Isolamentos_termicos`
- `Isolamentos_acusticos`
- `Impermeabilizacoes`

**Clique na sub-área** → leva para categorias específicas

### Passo 4: Escolher Categoria Específica
Exemplo em "Isolamentos_termicos":
- `Fachadas_e_paredes_meeiras`
- `Coberturas_planas`
- `Coberturas_inclinadas`
- `Pavimentos`

**Clique na categoria** → mostra lista de items

### Passo 5: Lista de Items
Esta página mostra **todos os items disponíveis** naquela categoria.

Cada item tem:
- **Código** (ex: NAF010)
- **Descrição curta**
- **Link** para página de detalhes

**Clique em qualquer item** → página completa com preços e decomposição

### Passo 6: Página do Item (Para Scraping!)
Esta é a página que você quer scraper! 🎯

URL exemplo:
```
https://geradordeprecos.info/obra_nova/Isolamentos_e_impermeabilizacoes/Isolamentos_termicos/Fachadas_e_paredes_meeiras/NAF010_Isolamento_termico_pelo_interior_do.html
```

Contém:
- ✅ Código do item
- ✅ Descrição completa
- ✅ Unidade de medida
- ✅ Preço total
- ✅ Tabela de decomposição (materiais, mão de obra, equipamento)

**Esta é a URL que você cola no scraper manual!**

---

## 🔗 Padrões de URL

### Estrutura Geral
```
https://geradordeprecos.info/obra_nova/[ÁREA]/[SUBÁREA]/[CATEGORIA]/[CÓDIGO]_[Descrição].html
```

### Convenções
- **Espaços** → `_` (underscore)
- **Caracteres especiais** → removidos ou substituídos
- **Acentos** → mantidos (às vezes)
- **Maiúsculas/Minúsculas** → geralmente primeira letra maiúscula

### Exemplos de URLs Válidas
```
# Isolamentos
https://geradordeprecos.info/obra_nova/Isolamentos_e_impermeabilizacoes/Isolamentos_termicos/Fachadas_e_paredes_meeiras/NAF010_Isolamento_termico_pelo_interior_do.html

# Revestimentos
https://geradordeprecos.info/obra_nova/Revestimentos/Revestimentos_de_paredes/Alicatados/RPA010_Alicatado_de_paramentos_interiores.html

# Estruturas
https://geradordeprecos.info/obra_nova/Estruturas/Estruturas_de_betao_armado/Lajes/EHL010_Laje_aligeirada_unidireccional.html

# Instalações
https://geradordeprecos.info/obra_nova/Instalacoes/Instalacoes_de_abastecimento_de_agua/Distribuicao/IFA010_Tubo_de_polietileno_reticulado.html
```

---

## 🏗️ Áreas Principais

### 1. **Isolamentos e Impermeabilizações**
Base: `Isolamentos_e_impermeabilizacoes/`

Sub-áreas:
- `Isolamentos_termicos/` (térmica)
- `Isolamentos_acusticos/` (acústica)
- `Impermeabilizacoes/` (impermeabilização)

Categorias exemplo:
- Fachadas e paredes meeiras
- Coberturas planas
- Coberturas inclinadas
- Pavimentos
- Fundações

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Isolamentos_e_impermeabilizacoes/

---

### 2. **Estruturas**
Base: `Estruturas/`

Sub-áreas:
- `Estruturas_de_betao_armado/`
- `Estruturas_metalicas/`
- `Estruturas_de_madeira/`
- `Fundacoes/`

Categorias exemplo:
- Sapatas
- Pilares
- Vigas
- Lajes
- Muros de suporte

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Estruturas/

---

### 3. **Revestimentos**
Base: `Revestimentos/`

Sub-áreas:
- `Revestimentos_de_paredes/`
- `Revestimentos_de_pavimentos/`
- `Revestimentos_de_tectos/`
- `Pinturas/`

Categorias exemplo:
- Alicatados (azulejos)
- Estuques
- Rebocos
- Ladrilhos cerâmicos
- Parquets

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Revestimentos/

---

### 4. **Instalações**
Base: `Instalacoes/`

Sub-áreas:
- `Instalacoes_de_abastecimento_de_agua/`
- `Instalacoes_de_drenagem/`
- `Instalacoes_electricas/`
- `Instalacoes_de_gas/`
- `Instalacoes_de_climatizacao/`
- `Instalacoes_de_telecomunicacoes/`

Categorias exemplo:
- Distribuição de água
- Esgoto
- Quadros elétricos
- Condutas de gás
- AVAC

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Instalacoes/

---

### 5. **Pavimentos**
Base: `Pavimentos/`

Sub-áreas:
- `Pavimentos_de_madeira/`
- `Pavimentos_ceramicos/`
- `Pavimentos_de_pedra/`
- `Pavimentos_continuos/`
- `Pavimentos_exteriores/`

Categorias exemplo:
- Soalhos
- Ladrilhos
- Mosaicos
- Betonilhas
- Calçadas

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Pavimentos/

---

### 6. **Paredes e Divisórias**
Base: `Paredes_e_divisorias/`

Sub-áreas:
- `Paredes_de_alvenaria/`
- `Paredes_de_gesso_cartonado/`
- `Divisorias_moveis/`

Categorias exemplo:
- Tijolo
- Blocos de betão
- Gesso cartonado (pladur)
- Divisórias amovíveis

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Paredes_e_divisorias/

---

### 7. **Coberturas**
Base: `Coberturas/`

Sub-áreas:
- `Coberturas_inclinadas/`
- `Coberturas_planas/`
- `Estruturas_de_coberturas/`
- `Claraboias_e_iluminacao_zenital/`

Categorias exemplo:
- Telhas cerâmicas
- Telhas metálicas
- Membranas impermeabilizantes
- Caleiras

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Coberturas/

---

### 8. **Carpintarias e Serralharias**
Base: `Carpintarias/` e `Serralharias/`

Sub-áreas:
- `Portas/`
- `Janelas/`
- `Portadas/`
- `Guardas_e_corrimoes/`

Categorias exemplo:
- Portas de madeira
- Janelas de alumínio
- Janelas de PVC
- Gradeamentos

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Carpintarias/
https://geradordeprecos.info/obra_nova/Serralharias/

---

### 9. **Equipamentos**
Base: `Equipamentos/`

Sub-áreas:
- `Equipamentos_de_cozinha/`
- `Equipamentos_de_casas_de_banho/`
- `Aparelhos_elevadores/`
- `Equipamentos_de_seguranca/`

Categorias exemplo:
- Louças sanitárias
- Torneiras
- Elevadores
- Extintores

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Equipamentos/

---

### 10. **Urbanização**
Base: `Urbanizacao/`

Sub-áreas:
- `Pavimentos_exteriores/`
- `Mobiliario_urbano/`
- `Sinalizacao/`
- `Iluminacao_publica/`

Categorias exemplo:
- Calçadas
- Bancos
- Sinais
- Candeeiros

**URL de entrada:**
https://geradordeprecos.info/obra_nova/Urbanizacao/

---

## 💡 Dicas de Exploração

### 1. **Usar a Busca do Site**
O geradordeprecos tem uma busca interna. Use palavras-chave como:
- "alvenaria"
- "pintura"
- "betão"
- "azulejo"

### 2. **Explorar por Índice Alfabético**
Algumas páginas têm índice A-Z dos items. Útil para ver tudo de uma vez.

### 3. **Copiar URLs da Lista**
Na página de lista de items (Passo 5), abra o item em nova aba:
- **Botão direito** → "Copiar endereço do link"
- Cola no scraper manual!

### 4. **Inspecionar Elemento**
Se a navegação estiver confusa:
1. **F12** para abrir DevTools
2. **Inspector** para ver links
3. Copiar `href` diretamente

### 5. **Atalho para Páginas de Lista**
URLs de listas de items seguem o padrão:
```
https://geradordeprecos.info/obra_nova/[ÁREA]/[SUBÁREA]/[CATEGORIA]/
```
(sem o nome do item no final)

### 6. **Verificar se Item Já Existe**
Antes de scraper, use a opção **"4 - Procurar por código"** no scraper manual para ver se já tem.

### 7. **Scraper em Lotes**
Se encontrar uma página de lista com muitos items:
1. Copie todos os links
2. Use **"2 - Adicionar múltiplas URLs"** no scraper
3. Cola tudo de uma vez!

---

## 🎯 URLs de Entrada (Start Here!)

### Isolamentos Térmicos (Alta Prioridade)
```
https://geradordeprecos.info/obra_nova/Isolamentos_e_impermeabilizacoes/Isolamentos_termicos/
```

### Revestimentos de Paredes
```
https://geradordeprecos.info/obra_nova/Revestimentos/Revestimentos_de_paredes/
```

### Estruturas de Betão
```
https://geradordeprecos.info/obra_nova/Estruturas/Estruturas_de_betao_armado/
```

### Instalações Elétricas ⚡
```
https://geradordeprecos.info/obra_nova/Instalacoes/Instalacoes_electricas/
```

### Instalações de AVAC
```
https://geradordeprecos.info/obra_nova/Instalacoes/Instalacoes_de_climatizacao/
```

### Instalações de Água
```
https://geradordeprecos.info/obra_nova/Instalacoes/Instalacoes_de_abastecimento_de_agua/
```

### Pinturas
```
https://geradordeprecos.info/obra_nova/Revestimentos/Pinturas/
```

### Alvenarias
```
https://geradordeprecos.info/obra_nova/Paredes_e_divisorias/Paredes_de_alvenaria/
```

### Coberturas
```
https://geradordeprecos.info/obra_nova/Coberturas/
```

### Carpintarias (Portas/Janelas)
```
https://geradordeprecos.info/obra_nova/Carpintarias/
```

---

## 🚀 Fluxo de Trabalho Recomendado

### Passo a Passo
1. **Escolha uma área** da lista acima (ex: Pinturas)
2. **Abra a URL de entrada** no browser
3. **Navegue** pelas sub-categorias
4. **Abra a lista de items** de uma categoria específica
5. **Clique num item** para ver detalhes
6. **Copie a URL** da barra de endereços
7. **Cole no scraper manual** (opção 1 ou 2)
8. **Repita** para outros items interessantes

### Exemplo Prático

#### Objetivo: Adicionar items de Pinturas

1. Abrir: https://geradordeprecos.info/obra_nova/Revestimentos/Pinturas/

2. Ver sub-categorias disponíveis:
   - Pinturas_de_paramentos_exteriores
   - Pinturas_de_paramentos_interiores
   - Pinturas_de_carpintarias
   - etc.

3. Escolher: "Pinturas_de_paramentos_interiores"

4. Ver lista de items (ex: 20 items)

5. Abrir primeiro item: "RPP010_Pintura_plastica_lisa"
   URL: `https://geradordeprecos.info/.../RPP010_Pintura_plastica_lisa.html`

6. Copiar URL completa

7. No terminal:
   ```bash
   npx tsx scripts/manual-scrape.ts
   # Escolher opção 1
   # Colar URL
   ```

8. Repetir para outros items ou usar opção 2 para colar várias URLs

---

## 📊 Prioridades Sugeridas

Com base nos gaps conhecidos, recomendo explorar por ordem:

### 🔴 Alta Prioridade (0-20% cobertura)
1. **Pinturas** - Muito importante, quase sem dados
2. **Alvenarias** - Estrutural, essencial
3. **AVAC** - Instalações críticas
4. **Vãos** (Portas/Janelas) - Gaps significativos

### 🟡 Média Prioridade (20-50% cobertura)
5. **Instalações Elétricas** - Para complementar RTIEBT engine
6. **Águas** - Distribuição e drenagem
7. **Estruturas** - Complementar betão/metálicas
8. **Equipamentos** - Louças, elevadores

### 🟢 Baixa Prioridade (50%+ cobertura)
9. **Isolamentos** - Já temos boa cobertura
10. **Coberturas** - Razoável cobertura
11. **Revestimentos cerâmicos** - Bom nível

---

## 🎓 Dicas Avançadas

### Encontrar URLs Escondidas
Algumas categorias não aparecem na navegação principal. Tente URLs diretas:

```
https://geradordeprecos.info/obra_nova/[Área_Tentativa]/
```

Exemplos para testar:
- `Demoliciones/`
- `Movimiento_de_tierras/`
- `Cimentaciones/`
- `Acondicionamiento_del_terreno/`

### Browser DevTools
Use **Network tab** para ver XHR requests quando navega:
- Pode revelar APIs internas
- Pode mostrar dados JSON

### Guardar Marcadores
Crie marcadores no browser para:
- URLs de listas de items favoritas
- Categorias que quer explorar mais tarde
- Items específicos para referência

---

## ❓ FAQ

### Quantos items devo scraper?
Não há limite! Quanto mais, melhor a cobertura de preços.

### Com que frequência atualizar?
Preços CYPE mudam periodicamente. Recomendo re-scrape trimestral.

### E se uma URL não funcionar?
1. Verificar se está bem formatada
2. Testar no browser primeiro
3. Pode ter sido removida do site

### Posso scraper categorias inteiras?
Sim! Use a opção 2 (múltiplas URLs) e cole todas as URLs de uma lista.

### Como sei se já tenho um item?
Use opção 4 no scraper para procurar por código.

---

## 📞 Suporte

Se encontrar problemas:
1. Verificar se URL é de um **item individual** (tem código no final)
2. Testar URL no browser primeiro
3. Ver logs de erro no scraper
4. Reportar URLs problemáticas para investigação

---

**Happy Scraping! 🚀**

*Última atualização: 2026-02-15*

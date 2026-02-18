# 📋 Como Adicionar Categorias CYPE

Guia rápido para adicionar novas categorias ao scraper CYPE.

---

## 🎯 Passo a Passo

### 1. Encontrar o URL da Categoria

1. **Abrir o browser** e ir para: https://geradordeprecos.info/obra_nova/
2. **Navegar** pela estrutura do site até encontrar a categoria desejada
3. **Copiar o URL completo** da página da categoria (exemplo: `https://geradordeprecos.info/obra_nova/Isolamentos_e_impermeabilizacoes/Isolamentos_termicos/Fachadas_e_paredes_meeiras.html`)

**Dica:** Certifique-se de que a página tem items (aparece dropdown com lista de items)

### 2. Adicionar ao Ficheiro de Configuração

Abrir o ficheiro **[cype-categories.config.json](../cype-categories.config.json)** e adicionar uma nova entrada:

```json
{
  "name": "Nome da Categoria",
  "slug": "nome-categoria-slug",
  "url": "https://geradordeprecos.info/obra_nova/CAMINHO/COMPLETO.html",
  "enabled": true,
  "notes": "Notas opcionais sobre a categoria"
}
```

**Campos:**
- `name` - Nome descritivo (aparece nos logs)
- `slug` - Identificador curto (usado para filtros e nomes de ficheiros)
- `url` - URL completo da categoria
- `enabled` - `true` para incluir no scraping, `false` para desativar
- `notes` - Notas opcionais (não afeta o scraping)

### 3. Exemplo Completo

```json
{
  "categories": [
    {
      "name": "Isolamentos Térmicos - Fachadas",
      "slug": "isolamentos-fachadas",
      "url": "https://geradordeprecos.info/obra_nova/Isolamentos_e_impermeabilizacoes/Isolamentos_termicos/Fachadas_e_paredes_meeiras.html",
      "enabled": true,
      "notes": "7 items - validado"
    },
    {
      "name": "Pavimentos - Cerâmicos",
      "slug": "pavimentos-ceramicos",
      "url": "https://geradordeprecos.info/obra_nova/Pavimentos/Pavimentos_ceramicos.html",
      "enabled": true,
      "notes": "Nova categoria adicionada"
    }
  ]
}
```

### 4. Testar a Categoria

Antes de fazer scraping completo, teste com limite:

```bash
# Testar apenas a nova categoria com 3 items
npx tsx scripts/scrape-cype-full.ts --categories=pavimentos-ceramicos --limit=3
```

Se funcionar:
- ✅ Verá items extraídos com sucesso
- ✅ Ficheiro criado em `data/categories/pavimentos-ceramicos.json`

Se falhar:
- ❌ URL pode estar errado (404)
- ❌ Página pode não ter items (0 items encontrados)
- ⚠️ Tente outro URL ou subcategoria

### 5. Executar Scraping Completo

Depois de validar, execute o scraping completo:

```bash
# Todas as categorias enabled
npx tsx scripts/scrape-cype-full.ts

# Ou apenas categorias específicas
npx tsx scripts/scrape-cype-full.ts --categories=isolamentos,pavimentos
```

---

## 🔧 Configurações Avançadas

No ficheiro `cype-categories.config.json`, pode ajustar:

```json
{
  "settings": {
    "rateLimitMs": 2000,        // Pausa entre items (ms)
    "categoryDelayMs": 5000,    // Pausa entre categorias (ms)
    "maxItemsPerCategory": null, // Limite global (null = sem limite)
    "region": "Lisboa/Cascais"  // Região para metadata
  }
}
```

---

## 💡 Dicas

### Como encontrar boas categorias?

1. **Páginas com dropdown de items** - Sinal de que tem conteúdo
2. **URLs profundos** - Geralmente têm mais items específicos
3. **Evitar páginas índice** - Páginas principais raramente têm items diretamente

### Estrutura típica de URLs válidos:

```
✅ VÁLIDO:
https://geradordeprecos.info/obra_nova/ÁREA/SUBCATEGORIA/DETALHES.html

❌ INVÁLIDO (muito genérico):
https://geradordeprecos.info/obra_nova/ÁREA.html
```

### Resolver problemas:

**Problema:** 404 Not Found
- **Solução:** URL errado, tente navegar no browser e copiar o URL correto

**Problema:** 0 items encontrados
- **Solução:** Página não tem items, desça mais um nível na hierarquia

**Problema:** 403 Forbidden
- **Solução:** Certifique-se de que ProtonVPN está ligado

---

## 📊 Estrutura de Ficheiros

Após scraping, os ficheiros são criados:

```
data/
├── cype-full.csv                           # CSV completo (Excel)
├── cype-full.json                          # JSON completo
├── backups/
│   └── cype-full-2026-02-15.json          # Backup timestamped
└── categories/
    ├── isolamentos-fachadas.json          # Backup por categoria
    └── pavimentos-ceramicos.json
```

---

## 🎯 Categorias Úteis para Construção

### Sugestões de categorias a adicionar:

**Estruturas:**
- Estruturas de betão armado
- Estruturas metálicas
- Fundações

**Acabamentos:**
- Pavimentos cerâmicos
- Pavimentos de madeira
- Pinturas interiores
- Pinturas exteriores

**Instalações:**
- Instalações elétricas (quadros, cabos, tomadas)
- Instalações de água (tubagens, válvulas)
- Esgotos (tubos, caixas)
- AVAC (condutas, unidades)

**Envolvente:**
- Fachadas (revestimentos)
- Coberturas (telhas, impermeabilizações)
- Caixilharias (janelas, portas)

---

## ⚡ Quick Reference

```bash
# Adicionar categoria
1. Editar: cype-categories.config.json
2. Testar: npx tsx scripts/scrape-cype-full.ts --categories=SLUG --limit=3
3. Executar: npx tsx scripts/scrape-cype-full.ts

# Ver resultados
start data/cype-full.csv

# Upload para Supabase
npx tsx scripts/upload-to-supabase.ts data/cype-full.json Lisboa
```

---

**Made with 🌰 by Wallnut**

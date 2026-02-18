# 🎯 CYPE Manual Scraping - Guia de Uso

## Overview

Ferramentas para scraping manual de URLs específicas do CYPE que descobriste através de navegação.

---

## Opção 1: Scraping de URLs Específicas

### Uso Rápido

```bash
# Scrape um único URL
npx tsx scripts/scrape-specific-urls.ts "https://geradordeprecos.info/obra_nova/..."

# Scrape múltiplos URLs
npx tsx scripts/scrape-specific-urls.ts \
  "https://geradordeprecos.info/obra_nova/Instalacoes/..." \
  "https://geradordeprecos.info/obra_nova/Revestimentos/..."
```

### Uso com Ficheiro

1. **Criar ficheiro de URLs** (um por linha):

```bash
# Editar data/my-urls.txt
code data/my-urls.txt
```

Conteúdo exemplo:
```
https://geradordeprecos.info/obra_nova/Instalacoes/Eletricas/IEQ010.html
https://geradordeprecos.info/obra_nova/Instalacoes/Eletricas/IEQ020.html
# Comentários começam com #
https://geradordeprecos.info/obra_nova/Drenagem/ISB010.html
```

2. **Executar scraping:**

```bash
npx tsx scripts/scrape-specific-urls.ts --file data/my-urls.txt
```

3. **Output:**

Resultados salvos em: `data/cype-manual-scrape-2026-02-16.json`

---

## Opção 2: Browser Interativo (Exploração Guiada)

### Setup (primeira vez apenas)

```bash
npm install puppeteer
```

### Uso

```bash
npx tsx scripts/browse-and-scrape.ts
```

### Workflow

1. **Browser abre automaticamente** no site CYPE
2. **Navegas livremente** para encontrar categorias interessantes
3. **Usas comandos** na terminal:

```
> save      # Guardar página atual
> links     # Ver todos os links na página
> scrape    # Fazer scrape da página atual
> list      # Ver URLs guardados
> done      # Terminar e exportar
```

4. **URLs são exportados** para ficheiro
5. **Podes depois fazer scrape** dessas URLs:

```bash
npx tsx scripts/scrape-specific-urls.ts --file data/cype-discovered-urls-2026-02-16.txt
```

---

## Exemplos Práticos

### Exemplo 1: Encontrar Instalações Elétricas

**Método Browser:**

```bash
npx tsx scripts/browse-and-scrape.ts
```

1. Browser abre em `https://geradordeprecos.info/obra_nova/`
2. Clica em "Instalações"
3. Clica em "Elétricas"
4. Na terminal: `links` (mostra links da página)
5. Escolhe números dos links interessantes: `1,3,5,7`
6. Terminal: `done`
7. URLs exportados para ficheiro

**Resultado:**
```
✅ Exported 4 URLs to: data/cype-discovered-urls-2026-02-16.txt

💡 Para fazer scrape destas URLs:
   npx tsx scripts/scrape-specific-urls.ts --file data/cype-discovered-urls-2026-02-16.txt
```

### Exemplo 2: URLs que Já Conheces

**Se já tens URLs específicos:**

```bash
# Criar ficheiro
cat > data/electrical-urls.txt << 'EOF'
https://geradordeprecos.info/obra_nova/Instalacoes/Eletricas/Quadros/IEQ010.html
https://geradordeprecos.info/obra_nova/Instalacoes/Eletricas/Quadros/IEQ020.html
https://geradordeprecos.info/obra_nova/Instalacoes/Eletricas/Cabos/IEC015.html
EOF

# Scrape
npx tsx scripts/scrape-specific-urls.ts --file data/electrical-urls.txt
```

**Output:**
```
🚀 Starting scrape of 3 URLs...

[1/3] 🔍 Scraping: https://geradordeprecos.info/.../IEQ010.html
   ✅ IEQ010: Quadro de distribuição para instalação elétrica...

[2/3] 🔍 Scraping: https://geradordeprecos.info/.../IEQ020.html
   ✅ IEQ020: Quadro de proteção com disjuntores...

[3/3] 🔍 Scraping: https://geradordeprecos.info/.../IEC015.html
   ✅ IEC015: Cabo elétrico H07V-U 2.5mm²...

✅ Scraped 3 items
📄 Saved to: data/cype-manual-scrape-2026-02-16.json
```

### Exemplo 3: Explorar e Depois Scrape

**Passo 1 - Explorar:**
```bash
npx tsx scripts/browse-and-scrape.ts
```

Navega e guarda URLs interessantes:
```
> links
🔗 Links na página atual:

1. Quadros de distribuição
   https://geradordeprecos.info/.../Quadros/
2. Cabos eléctricos
   https://geradordeprecos.info/.../Cabos/
3. Tomadas e interruptores
   https://geradordeprecos.info/.../Tomadas/

Guardar algum link? (números separados por vírgula): 1,2
✅ Saved: Quadros de distribuição
✅ Saved: Cabos eléctricos

> done
✅ Exported 2 URLs to: data/cype-discovered-urls-2026-02-16.txt
```

**Passo 2 - Scrape:**
```bash
npx tsx scripts/scrape-specific-urls.ts --file data/cype-discovered-urls-2026-02-16.txt
```

---

## Comandos do Browser Interativo

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `save` | Guardar URL da página atual | `> save` |
| `links` | Mostrar todos os links na página | `> links` |
| `scrape` | Fazer scrape da página atual | `> scrape` |
| `list` | Ver URLs guardados | `> list` |
| `done` | Terminar e exportar | `> done` |
| `help` | Mostrar ajuda | `> help` |

---

## Estrutura de Output

### Ficheiro JSON de Resultados

```json
{
  "metadata": {
    "exportDate": "2026-02-16T15:30:00.000Z",
    "totalItems": 3,
    "source": "manual-url-scrape",
    "urls": ["https://...", "https://..."]
  },
  "items": [
    {
      "code": "IEQ010",
      "description": "Quadro de distribuição...",
      "category": "Instalações elétricas",
      "unit": "Ud",
      "unitCost": 680,
      "breakdown": {
        "materials": 480,
        "labor": 170,
        "machinery": 30
      },
      "url": "https://..."
    }
  ]
}
```

---

## Tips & Tricks

### 1. Encontrar Categorias no Site CYPE

**Estrutura típica de URLs:**
```
https://geradordeprecos.info/obra_nova/
  ├── Instalacoes/
  │   ├── Eletricas/
  │   ├── Drenagem/
  │   └── AVAC/
  ├── Revestimentos/
  ├── Estruturas/
  └── ...
```

**Estratégia:**
1. Começa em `https://geradordeprecos.info/obra_nova/`
2. Explora secções principais (Instalações, Revestimentos, etc.)
3. Guarda URLs de categorias inteiras
4. Ou guarda URLs de items específicos

### 2. Validar URLs Antes de Scrape

```bash
# Testar um único URL primeiro
npx tsx scripts/scrape-specific-urls.ts "https://geradordeprecos.info/obra_nova/..."

# Se funcionar, fazer scrape em batch
npx tsx scripts/scrape-specific-urls.ts --file data/my-urls.txt
```

### 3. Combinar com Scrape Existente

```bash
# 1. Fazer manual scrape de categorias específicas
npx tsx scripts/scrape-specific-urls.ts --file data/electrical-urls.txt

# Output: data/cype-manual-scrape-2026-02-16.json

# 2. Merge com dados existentes
# (pode fazer manualmente ou criar script de merge)
```

---

## Troubleshooting

### Erro: "Failed to extract item"

**Causa:** URL não é de um item individual, ou estrutura HTML mudou

**Solução:**
- Verifica que o URL é de um item específico (não categoria)
- Tenta abrir o URL no browser primeiro
- Exemplo de URL correto: `...NAF010_Isolamento_termico.html`

### Browser Interativo não abre

**Causa:** Puppeteer não instalado

**Solução:**
```bash
npm install puppeteer
```

### Rate Limiting

**Causa:** Muitos requests muito rápido

**Solução:**
- O scraper já tem delay de 1s entre requests
- Se necessário, espera alguns minutos e tenta novamente

---

## Workflow Recomendado

### Para Descobrir Novas Categorias

```bash
# 1. Explorar com browser
npx tsx scripts/browse-and-scrape.ts

# 2. Guardar URLs interessantes (comando 'save' ou 'links')

# 3. Exportar URLs (comando 'done')

# 4. Scrape URLs descobertos
npx tsx scripts/scrape-specific-urls.ts --file data/cype-discovered-urls-YYYY-MM-DD.txt
```

### Para Scrape de URLs Conhecidos

```bash
# 1. Criar ficheiro com URLs
code data/my-urls.txt

# 2. Scrape direto
npx tsx scripts/scrape-specific-urls.ts --file data/my-urls.txt
```

---

## Próximos Passos

Depois de fazer scrape manual:

1. **Validar resultados:**
   ```bash
   cat data/cype-manual-scrape-2026-02-16.json | grep "code"
   ```

2. **Merge com base de dados principal:**
   - Copiar items do ficheiro manual para `data/cype-full.json`
   - Ou criar script de merge automático

3. **Refresh matcher database:**
   ```bash
   # Via código
   import { refreshCypeDatabase } from './cype-matcher';
   refreshCypeDatabase();
   ```

---

**Questões?** Experimenta primeiro com um URL de teste!

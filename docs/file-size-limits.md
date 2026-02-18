# 📏 File Size Limits - PDF Upload

## Limites Configurados

### Client-Side Validation
- **Máximo:** 10 MB por ficheiro
- **Validação:** Antes do upload
- **Erro:** Alerta claro com tamanho do ficheiro

### Server-Side Configuration
- **Next.js body limit:** 10 MB
- **Timeout:** 5 minutos (para processamento Claude)
- **Runtime:** Node.js

## Se o PDF for Maior que 10 MB

### Opção 1: Comprimir PDF 🗜️

**Online (Grátis):**
- https://www.ilovepdf.com/compress_pdf
- https://smallpdf.com/compress-pdf
- https://www.adobe.com/acrobat/online/compress-pdf.html

**Resultado esperado:** 50-80% redução de tamanho

**Exemplo:**
```
PDF original: 15 MB
Comprimido:   6 MB ✅ (dentro do limite)
```

---

### Opção 2: Dividir PDF em Partes 📄

Se o regulamento for muito grande, dividir em secções:

**Online:**
- https://www.ilovepdf.com/split_pdf
- https://smallpdf.com/split-pdf

**Exemplo:**
```
Regulamento RTIEBT (20 MB)
├── Parte 1: Artigos 1-50 (8 MB) ✅
├── Parte 2: Artigos 51-100 (7 MB) ✅
└── Parte 3: Anexos (5 MB) ✅
```

Fazer upload de cada parte separadamente e combinar as regras extraídas.

---

### Opção 3: Extrair Texto Manualmente 📝

**Melhor para PDFs muito grandes ou problemáticos**

1. Abrir PDF no Adobe Reader ou browser
2. Selecionar todo o texto (Ctrl+A)
3. Copiar (Ctrl+C)
4. Colar na textarea do sistema
5. Click "Extrair Regras com AI"

**Vantagens:**
- ✅ Sem limite de tamanho
- ✅ Funciona com qualquer PDF
- ✅ Preview do texto antes de enviar

**Desvantagens:**
- ⚠️ Formatação pode ser perdida
- ⚠️ Tabelas podem ficar desorganizadas

---

### Opção 4: Usar Google Docs OCR 🔍

Para PDFs escaneados ou com formatação complexa:

1. Upload PDF para Google Drive
2. Click direito → "Open with Google Docs"
3. Google converte para texto
4. Copiar texto convertido
5. Colar na textarea do sistema

**Vantagens:**
- ✅ OCR grátis e bom
- ✅ Lida bem com tabelas
- ✅ Sem limites de tamanho

---

## Aumentar Limite (Desenvolvimento)

Se precisar de aumentar o limite permanentemente:

### 1. Client-Side (AIRegulationIngestion.tsx)

```typescript
// Mudar de 10MB para 50MB
const maxSize = 50 * 1024 * 1024; // 50MB
```

### 2. Server-Side (route.ts)

```typescript
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Aumentar para 50MB
    },
  },
};
```

### 3. Next.js Config (next.config.js)

Adicionar ou modificar:

```javascript
module.exports = {
  // ...outras configs
  serverRuntimeConfig: {
    // Aumentar limite do body parser
    bodySizeLimit: '50mb'
  },
}
```

### 4. Vercel Deployment

⚠️ **Importante:** Vercel tem limites próprios:
- Free tier: 4.5 MB
- Pro tier: 10 MB
- Enterprise: Custom

Para PDFs grandes em produção, considerar:
- Upload direto para S3/Cloud Storage
- Processar em background com queue
- Usar streaming para ficheiros grandes

---

## Troubleshooting

### Erro: "Request entity too large"

**Causa:** Ficheiro excede limite do servidor

**Soluções:**
1. Comprimir PDF primeiro
2. Dividir em partes menores
3. Usar textarea com texto copiado
4. Aumentar limites (ver acima)

### Erro: "Request timeout"

**Causa:** PDF muito grande demora muito a processar

**Soluções:**
1. Dividir PDF em partes
2. Extrair texto primeiro (mais rápido)
3. Aumentar timeout no route.ts:
   ```typescript
   export const maxDuration = 600; // 10 minutos
   ```

### Erro: "Out of memory"

**Causa:** PDF muito grande para memória

**Soluções:**
1. Usar streaming em vez de buffer completo
2. Processar PDF em chunks
3. Aumentar memória do Node.js:
   ```bash
   NODE_OPTIONS=--max-old-space-size=4096 npm run dev
   ```

---

## Tamanhos Típicos

| Tipo de Documento | Tamanho Típico | Status |
|-------------------|----------------|--------|
| DL curto (10 páginas) | 200-500 KB | ✅ OK |
| DL médio (50 páginas) | 1-3 MB | ✅ OK |
| Regulamento completo | 5-15 MB | ✅ OK |
| Regulamento com imagens | 20-50 MB | ⚠️ Comprimir |
| Manual técnico grande | 50-200 MB | ❌ Dividir/Extrair texto |

---

## Recomendações

### Para Desenvolvimento
- Manter limite em **10 MB**
- Força users a ter PDFs otimizados
- Evita problemas de memória

### Para Produção
- Se usar cloud storage: **Sem limite client-side**
- Upload para S3/GCS primeiro
- Processar em background
- Retornar job ID e polling

### Para Users
- **Sempre comprimir PDFs** antes de upload
- **Preferir texto** quando possível (mais rápido)
- **Dividir documentos grandes** em secções lógicas

---

**Versão:** 1.0
**Última atualização:** 2026-02-16
**Limite atual:** 10 MB

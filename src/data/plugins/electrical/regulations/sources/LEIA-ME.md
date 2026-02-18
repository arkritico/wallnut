# Documentos de Regulamentos — Pasta de Fontes

Esta pasta contém os PDFs dos regulamentos utilizados para extrair regras de verificação.

## Como adicionar um novo regulamento

### 1. Regulamentos públicos (DRE, ERSE)

```bash
# Descarregar o PDF do Diário da República
# Colocar nesta pasta com o nome do ID do regulamento
# Exemplo: portaria-252-2015.pdf
```

### 2. Normas proprietárias (IEC, IPQ, EN)

```bash
# Colocar o PDF nesta pasta
# O ficheiro será automaticamente ignorado pelo git (.gitignore)
# Apenas as regras extraídas (rules.json) são commitadas
```

### 3. Documentação de operadores (E-REDES, REN, ERSE)

```bash
# Descarregar do site do operador
# Atenção à versão — estes documentos são actualizados frequentemente
# Incluir a data da versão no nome do ficheiro
# Exemplo: eredes-manual-ligacoes-11ed-2025.pdf
```

## Ficheiros nesta pasta

| Ficheiro | Regulamento | Estado |
|----------|------------|--------|
| portaria-949a-2006.pdf | RTIEBT | Pendente |
| portaria-252-2015.pdf | Alteração RTIEBT (VE) | Pendente |
| dl-96-2017.pdf | Regime Inst. Particulares | Pendente |
| ... | ... | ... |

## Fluxo de trabalho

1. Colocar PDF nesta pasta
2. Registar no `../registry.json`
3. Extrair regras para `../<reg-id>/rules.json`
4. Validar com `validateExtractedRules()`
5. Marcar como verificado no registry

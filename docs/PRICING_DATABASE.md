# Base de Dados de Precos - Sistema de Atualização Automática

## 📋 Visão Geral

Sistema completo para manter preços de construção atualizados do Gerador de Precos para a região de **Lisboa/Cascais**.

**Features:**
- ✅ Scraping completo com breakdown detalhado
- ✅ Armazenamento em Supabase (estruturado + searchable)
- ✅ Atualização automática mensal via GitHub Actions
- ✅ Botão manual na UI para atualização on-demand
- ✅ Versionamento e histórico de alterações
- ✅ Backup em JSON versionado

---

## 🗃️ Arquitetura

### 1. **Base de Dados (Supabase)**

**Tabelas:**
- `pricing_items` - Preços principais
- `pricing_item_components` - Breakdown (materiais, MO, equipamento)
- `pricing_item_history` - Histórico de alterações
- `pricing_scraping_jobs` - Log de atualizações

**Schema:**
```sql
-- Criar tabelas
supabase db push
```

### 2. **Scraping (Scripts)**

**Script principal:** `scripts/scrape-with-breakdown.ts`
- Extrai preços com justificação completa
- Rate limiting (2s entre pedidos)
- Export para CSV + JSON

**Upload:** `scripts/upload-to-supabase.ts`
- Upload para Supabase
- Track versões
- Histórico de alterações

### 3. **UI (Componente React)**

**Componente:** `src/components/PriceUpdater.tsx`
- Botão de atualização manual
- Progress tracking
- Status em tempo real

**Uso:**
```tsx
import PriceUpdater from "@/components/PriceUpdater";

<PriceUpdater />
```

### 4. **API (Next.js)**

**Endpoint:** `/api/pricing/update`

**POST** - Trigger atualização:
```javascript
fetch("/api/pricing/update", {
  method: "POST",
  body: JSON.stringify({
    categories: ["Isolamentos", "Fachadas"],
    region: "Lisboa"
  })
})
```

**GET** - Status:
```javascript
fetch("/api/pricing/update?jobId=xxx")
```

### 5. **Automação (GitHub Actions)**

**Workflow:** `.github/workflows/update-prices.yml`

**Schedule:** Dia 1 de cada mês às 02:00 UTC

**Manual trigger:**
```bash
# Via GitHub UI: Actions > Update Prices > Run workflow
```

---

## 🚀 Setup Inicial

### 1. Configurar Supabase

```bash
# Criar projeto Supabase
# https://supabase.com/dashboard/projects

# Executar migration
supabase db push

# Ou manualmente:
# Copiar SQL de supabase/migrations/20260215_pricing_items.sql
# Executar no SQL Editor do Supabase
```

### 2. Configurar Secrets

**GitHub Secrets** (Settings > Secrets):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx...
```

**Local (.env.local):**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_KEY=eyJxxx...  # Service role key para upload
```

### 3. Primeira Atualização

```bash
# 1. Scraping (com VPN se possível)
npm run scrape-prices

# 2. Upload para Supabase
npx tsx scripts/upload-to-supabase.ts data/price-breakdown.json Lisboa

# 3. Verificar no Supabase
# https://supabase.com/dashboard/project/xxx/editor
```

---

## 📅 Atualização Mensal Automática

### Como Funciona

1. **GitHub Action trigger** (dia 1 do mês)
2. **Scraping** de categorias selecionadas
3. **Upload** para Supabase
4. **Commit** backup JSON versionado
5. **Release** criado com dados

### Configuração VPN (Opcional)

Para evitar bloqueios:

```yaml
# Em .github/workflows/update-prices.yml
- name: Setup ProtonVPN
  run: |
    # Instalar ProtonVPN
    sudo apt-get install -y protonvpn-cli

    # Login (usar secrets)
    echo "${{ secrets.PROTONVPN_USERNAME }}" | protonvpn-cli login

    # Conectar
    protonvpn-cli connect PT
```

### Monitorização

**Ver execuções:**
- GitHub: Actions tab > Update Prices

**Ver logs Supabase:**
```sql
SELECT * FROM pricing_scraping_jobs
ORDER BY created_at DESC
LIMIT 10;
```

**Verificar alterações de preços:**
```sql
SELECT * FROM pricing_item_history
WHERE change_percent > 5  -- Alterações > 5%
ORDER BY changed_at DESC;
```

---

## 🔘 Atualização Manual via UI

### 1. Adicionar Componente

```tsx
// src/app/admin/page.tsx ou onde quiser
import PriceUpdater from "@/components/PriceUpdater";

export default function AdminPage() {
  return (
    <div>
      <h1>Administração</h1>
      <PriceUpdater />
    </div>
  );
}
```

### 2. Proteger com Autenticação

```tsx
// Exemplo com NextAuth
import { getServerSession } from "next-auth";

export default async function AdminPage() {
  const session = await getServerSession();

  if (!session || session.user.role !== "admin") {
    return <div>Acesso negado</div>;
  }

  return <PriceUpdater />;
}
```

### 3. Usar

1. Abrir página admin
2. Clicar "Atualizar Preços"
3. Aguardar conclusão (ver progress)
4. Preços atualizados automaticamente na app

---

## 📊 Queries Úteis

### Obter preços atualizados

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(url, key);

// Listar preços
const { data: prices } = await supabase
  .from("pricing_items")
  .select("*")
  .eq("region", "Lisboa")
  .order("code");

// Preço com breakdown
const { data: priceWithBreakdown } = await supabase
  .from("pricing_items_with_breakdown")
  .eq("code", "NAF010")
  .single();

// Histórico de um preço
const { data: history } = await supabase
  .from("pricing_item_history")
  .select("*")
  .eq("price_code", "NAF010")
  .order("changed_at", { ascending: false });
```

### Estatísticas

```sql
-- Total de preços
SELECT COUNT(*) FROM pricing_items;

-- Preços por categoria
SELECT category, COUNT(*) as count
FROM pricing_items
GROUP BY category
ORDER BY count DESC;

-- Maiores alterações de preço (últimos 30 dias)
SELECT
  price_code,
  old_total_cost,
  new_total_cost,
  change_percent,
  changed_at
FROM pricing_item_history
WHERE changed_at > NOW() - INTERVAL '30 days'
ORDER BY ABS(change_percent) DESC
LIMIT 20;
```

---

## 🔧 Troubleshooting

### Scraping falha com 403/429

**Solução:** Usar VPN (ProtonVPN)
```bash
protonvpn-cli connect PT
npm run scrape-prices
```

### Upload falha

**Verificar:**
1. Supabase URL e keys corretas
2. Tabelas criadas (run migration)
3. RLS policies configuradas

### GitHub Action falha

**Verificar:**
1. Secrets configurados
2. Node version compatível (v20+)
3. Timeout suficiente (12h)

### Preços desatualizados

**Forçar atualização:**
```bash
# Localmente
npm run scrape-prices
npx tsx scripts/upload-to-supabase.ts

# Ou via GitHub
# Actions > Update Prices > Run workflow
```

---

## 📈 Roadmap

- [ ] Multi-região (Lisboa, Porto, Faro)
- [ ] Notificações (email quando preços mudam >10%)
- [ ] API pública para integração externa
- [ ] Dashboard analytics (tendências de preços)
- [ ] Export Excel automático
- [ ] Cache Redis para queries frequentes

---

## 💾 Backups

**Automático:**
- JSON versionado: `data/backups/prices-YYYY-MM-DD.json`
- GitHub Releases: Tagged releases por atualização
- Supabase: Backup automático (plano pago)

**Manual:**
```bash
# Export Supabase
supabase db dump > backup.sql

# Backup JSON
cp data/price-breakdown.json "backups/backup-$(date +%Y%m%d).json"
```

---

## 🤝 Contribuir

Para adicionar mais categorias ou regiões:

1. Editar `scripts/scrape-with-breakdown.ts`
2. Adicionar categoria ao array
3. Executar scraping
4. Upload para Supabase

---

**Made with 🌰 by Wallnut**

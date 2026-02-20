# Staging Setup Guide

## 1. Vercel Deployment

### Connect the repo

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `wallnut` GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: `.` (default)
5. Click **Deploy**

Vercel will auto-detect the `vercel.json` config (CDG1/Paris region, security headers).

### Branch deployments

| Branch | Environment | URL |
|--------|-------------|-----|
| `master` | Production | `wallnut.vercel.app` (or custom domain) |
| `develop` | Staging | Preview URL per push |
| Any PR | Preview | `wallnut-<hash>.vercel.app` |

Every PR automatically gets a preview URL — share it with the team for testing.

### Environment variables

Set these in Vercel Dashboard → Project Settings → Environment Variables:

```
ANTHROPIC_API_KEY          = sk-ant-...       (all environments)
NEXT_PUBLIC_SUPABASE_URL   = https://xxx.supabase.co  (staging project)
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...        (staging project)
```

For production, use a separate Supabase project's keys.

## 2. Supabase Staging Project

### Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Create a new project: `wallnut-staging`
3. Region: **EU West** (closest to CDG1/Paris)
4. Save the project URL and anon key

### Run migrations

Using the Supabase CLI:

```bash
# Install CLI
npm install -g supabase

# Link to staging project
supabase link --project-ref <your-staging-project-ref>

# Push schema
supabase db push
```

Or manually run the SQL files in Supabase SQL Editor:
1. `supabase/schema.sql` — projects + files tables with RLS
2. `supabase/migrations/20260215_pricing_items.sql` — pricing tables

### Seed price data

```bash
# From project root, seed the prices into Supabase
# (requires SUPABASE_SERVICE_KEY in .env.local)
npm run scrape-prices -- --seed-only
```

Or import `data/price-db.json` via the Supabase dashboard Table Editor.

## 3. Verify

After deploying, check:

```bash
# Health check
curl https://your-staging-url.vercel.app/api/health
# Should return: {"status":"ok","version":"abc1234","startedAt":"...","timestamp":"..."}
```

Then open the staging URL in browser:
- PP Mori font renders (not system font)
- Logo appears in nav
- Language toggle works (PT/EN)
- Dark mode toggle works
- "Iniciar Analise" leads to wizard
- If Supabase is configured: sign-in works, projects persist

## 4. Team Testing Workflow

1. Developer creates a feature branch and PR
2. Vercel auto-deploys a preview URL
3. Developer shares the preview URL in the PR description
4. Testers use the preview URL to test
5. Feedback goes into GitHub Issues (labels: `bug`, `ux`, `accuracy`)
6. Once approved, merge to `develop` (staging) → `master` (production)

## 5. Local Development

```bash
# Clone and install
git clone https://github.com/your-org/wallnut.git
cd wallnut
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Run dev server
npm run dev
# Open http://localhost:3000

# Run checks (same as CI)
npm run typecheck    # TypeScript strict check
npm run lint         # ESLint
npm run test         # Vitest (710 tests)
npm run build        # Production build
```

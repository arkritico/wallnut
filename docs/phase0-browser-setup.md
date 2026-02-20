# Phase 0 — Staging Infrastructure Setup

> Prompt for Claude (desktop app with computer use) to automate Vercel + Supabase setup.
> Open this file and ask Claude to follow the steps using browser control.

---

## Prerequisites

- GitHub repo: `https://github.com/<your-username>/wallnut` (must be pushed to GitHub first)
- Logged into Vercel at https://vercel.com
- Logged into Supabase at https://supabase.com
- Have your Anthropic API key ready (for AI analysis features)

---

## Step 1: Connect GitHub Repo to Vercel

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select the `wallnut` repository from the GitHub list
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `.` (default)
   - **Build Command**: `next build`
   - **Output Directory**: `.next` (default)
5. Under **Environment Variables**, add these (leave values blank for now — we'll fill them after Supabase setup):
   - `NEXT_PUBLIC_SUPABASE_URL` = (placeholder, fill in Step 2)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (placeholder, fill in Step 2)
6. Click **Deploy**
7. Wait for the first deployment to complete (it may fail without Supabase — that's OK)

### After deploy, configure:

8. Go to **Settings → Git**
9. Set **Production Branch** to `master`
10. Verify **Preview Deployments** are enabled for PRs (should be on by default)
11. Go to **Settings → General**
12. Set **Build & Development Settings → Node.js Version** to `20.x`

---

## Step 2: Create Staging Supabase Project

1. Go to https://supabase.com/dashboard/projects
2. Click **"New Project"**
3. Fill in:
   - **Name**: `wallnut-staging`
   - **Database Password**: generate a strong password and save it
   - **Region**: West EU (Paris) — `eu-west-1` — to match Vercel CDG1
   - **Plan**: Free tier
4. Click **"Create new project"**
5. Wait for the project to be provisioned

### Get the credentials:

6. Go to **Settings → API**
7. Copy the **Project URL** (looks like `https://xxxx.supabase.co`)
8. Copy the **anon/public key** (starts with `eyJ...`)

### Run migrations:

9. Go to **SQL Editor** in the Supabase dashboard
10. Open a new query and paste the contents of `supabase/schema.sql` — run it
11. Run each migration in order:
    - `supabase/migrations/20260215_pricing_items.sql` — pricing tables
    - `supabase/migrations/20260218_pipeline_uploads_bucket.sql` — Storage bucket for large file uploads
    - `supabase/migrations/20260219_pipeline_jobs.sql` — Background pipeline job tracking

### Enable RLS:

12. Go to **Table Editor**
13. For each table, verify that **RLS is enabled** (the migrations should have done this, but double-check)

---

## Step 3: Set Environment Variables on Vercel

1. Go back to Vercel → your `wallnut` project → **Settings → Environment Variables**
2. Update these variables (apply to all environments: Production, Preview, Development):
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from Step 2.7
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key from Step 2.8
3. Add these:
   - `ANTHROPIC_API_KEY` = your Anthropic API key (for AI-powered regulation analysis)
   - `SUPABASE_SERVICE_KEY` = the **service_role** key from Supabase Settings → API (for server-side storage uploads)
4. Optionally add:
   - `NEXT_PUBLIC_SENTRY_DSN` = Sentry DSN for error monitoring (skip if not using Sentry)
   - `PRICING_ADMIN_API_KEY` = any secret string to protect the price update endpoint
   - `LOG_LEVEL` = `info` (default) or `debug` for verbose server logs
5. Click **Save**
6. Go to **Deployments** → click the three dots on the latest deployment → **Redeploy**

---

## Step 4: Verify Health Check

1. Once the redeploy finishes, open the production URL
2. Navigate to `<your-vercel-url>/api/health`
3. Verify you see a JSON response: `{ "status": "ok", "version": "...", "timestamp": "..." }`

### Optional: Set up monitoring

4. Go to https://uptimerobot.com (or any monitoring service)
5. Add a new HTTP(s) monitor pointing to `<your-vercel-url>/api/health`
6. Set check interval to 5 minutes
7. Set alert contacts to your email

---

## Step 5: Verify End-to-End

1. Open the production Vercel URL in a browser
2. Click **"Iniciar Analise"** (Start Analysis)
3. Choose **"Usar Modelo"** (Use Template) → select **"Moradia T3"**
4. Click through the wizard and submit
5. Verify the analysis completes and shows a score out of 100
6. Check the browser console for any errors

---

## Done Checklist

After completing all steps, verify:

- [ ] Vercel project connected to GitHub `wallnut` repo
- [ ] Production branch set to `master`
- [ ] Preview deployments enabled on PRs
- [ ] Supabase staging project created (EU-West region)
- [ ] Database schema migrated (`schema.sql` + 3 migrations)
- [ ] RLS enabled on all tables
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set on Vercel
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set on Vercel
- [ ] `SUPABASE_SERVICE_KEY` set on Vercel
- [ ] `ANTHROPIC_API_KEY` set on Vercel
- [ ] `/api/health` returns `{ status: "ok" }`
- [ ] Template analysis works end-to-end
- [ ] (Optional) Uptime monitoring configured

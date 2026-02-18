# Wallnut - Regulamentação Portuguesa de Edifícios

Wallnut checks a building project against **all** Portuguese building regulations in one pass: architecture, structural/seismic, fire safety, HVAC, water, gas, electrical, telecommunications, thermal, acoustic, accessibility, energy certification, elevators, licensing, waste, and drawing quality.

It produces findings with exact regulation references, current-vs-required values, remediation steps, cost estimates, and an exportable work breakdown structure (WBS) for MS Project.

---

## Quick start (zero configuration)

```bash
git clone <repo-url> wallnut
cd wallnut
npm install
npm run dev
```

Open **http://localhost:3000**. That's it. The full analysis engine works with no API keys, no database, no external services.

---

## What works without any configuration

| Feature | Status | Notes |
|---------|--------|-------|
| Project wizard (blank / template / upload) | Works | Document upload uses regex fallback without AI |
| Full 17-specialty regulatory analysis | Works | 100% local computation, ~200ms |
| Findings with remediation + required values | Works | Includes lookup table thresholds |
| Technical calculations (thermal, acoustic, electrical, water) | Works | REH, RRAE, RTIEBT, RGSPPDADAR |
| Energy class calculation (SCE) | Works | DL 101-D/2020 method |
| Cost estimation (CYPE database) | Works | geradordeprecos.info reference values |
| Checklists per specialty | Works | Generated from project + analysis |
| PDF export | Works | Client-side jsPDF |
| WBS export for MS Project | Works | JSON format |
| Save/load projects | Works | localStorage, persists across sessions |
| Dark mode + Portuguese/English | Works | Stored in localStorage |

## What needs environment variables

| Feature | Variable | How to get it |
|---------|----------|---------------|
| AI regulatory assistant (chat) | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| AI document parsing (upload PDFs) | `ANTHROPIC_API_KEY` | Same key — without it, regex fallback works |
| Cloud project sync + auth | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [supabase.com/dashboard](https://supabase.com/dashboard) |

To enable optional features:
```bash
cp .env.example .env.local
# Edit .env.local and add your keys
```

---

## Deployment options

### Option A: Vercel (recommended for teams)

The simplest path. Push to GitHub, connect to Vercel, done.

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add secrets in Vercel dashboard → Settings → Environment Variables
# ANTHROPIC_API_KEY=sk-ant-...
```

The `vercel.json` is already configured with security headers and the `cdg1` (Paris) region for low latency to Portugal.

### Option B: Docker (recommended for self-hosted / air-gapped)

```bash
docker build -t wallnut .
docker run -p 3000:3000 wallnut
```

With optional env vars:
```bash
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  wallnut
```

The Dockerfile uses multi-stage builds and Next.js standalone output (~50MB image).

### Option C: Any Node.js host (Railway, Fly.io, VPS)

```bash
npm install
npm run build
npm start
```

Runs on port 3000 by default. Set `PORT` env var to change.

---

## How to use it (the actual workflow)

### 1. Start a project

Click **"Iniciar Analise"** on the landing page. You get three options:

- **Blank** — Start from scratch, fill in manually
- **Template** — Pick residential/commercial/mixed/industrial, get sensible defaults
- **Upload** — Drop a PDF/Word document (project brief, specification), AI or regex extracts what it can

The wizard walks you through: basic info → location/climate → review.

### 2. Fill in the detailed form

After the wizard, you land on the full project form with 19 section tabs. Don't panic:

- Tabs marked with **\*** are **essential** for your building type
- Tabs with a colored dot show completion status (green = done, amber = partial, gray = empty)
- You can skip optional sections entirely — the analysis will note which checks were skipped

**Minimum viable input** for a useful analysis:
- Project name + building type
- Location (municipality — climate zones auto-fill)
- Floor area + number of floors + height
- Fire safety: risk category
- Envelope: wall/roof/window U-values (if you have them)
- Electrical: contracted power + phase type

That's ~15 fields. You'll get a meaningful report.

### 3. Run the analysis

Click **"Analisar Projeto"** at the bottom. Takes ~1 second. Results page shows:

- **Score** (0-100) and **energy class** (A+ to F)
- **Severity heatmap** — colored chips showing which specialties have problems
- **Regulation summary** — click any card to drill into its findings
- **Findings** — filterable by specialty, sorted by severity, with:
  - Exact regulation + article reference
  - Current value vs required value
  - Step-by-step remediation
- **Calculations** — thermal performance, acoustic requirements, electrical sizing, water pipe sizing
- **Cost estimates** — min/max remediation costs from CYPE database
- **Checklists** — verification items per specialty
- **WBS export** — download JSON for MS Project scheduling

### 4. Iterate

Edit the project, re-analyze. The version history tracks changes between iterations. Save multiple projects and compare them side-by-side.

---

## Architecture (for developers)

```
src/
  app/
    page.tsx              ← Main UI (landing, wizard, form, results)
    api/
      analyze/            ← POST: server-side analysis (no API keys needed)
      ai-analyze/         ← POST: AI chat (needs ANTHROPIC_API_KEY)
      parse-document/     ← POST: document extraction (fallback without key)
      geo-proxy/          ← GET: geospatial lookups

  components/
    ProjectWizard.tsx     ← 5-step project initialization
    ProjectForm.tsx       ← 19-section data entry form
    AnalysisResults.tsx   ← Results display with filtering + drill-down

  lib/
    analyzer.ts           ← Main analysis engine (19 specialty modules)
    calculations.ts       ← Technical calculations (thermal, acoustic, etc.)
    regulations.ts        ← Regulatory constants (U-values, fire resistance, etc.)
    cost-estimation.ts    ← CYPE cost database + estimation
    types.ts              ← BuildingProject, Finding, RegulationArea types

    plugins/
      types.ts            ← Plugin type system (rules, lookup tables, computed fields)
      rule-engine.ts      ← Declarative rule engine (direct, lookup, ordinal operators)
      registry.ts         ← Regulation lifecycle management
      loader.ts           ← Plugin discovery + loading
      ingestion.ts        ← Adding new regulations from PDFs

  data/
    plugins/
      electrical/         ← RTIEBT rules (JSON)
      fire-safety/        ← SCIE rules + lookup tables (JSON)
      thermal/            ← REH rules + lookup tables (JSON)
```

### Adding a new regulation

1. Create a plugin directory under `src/data/plugins/<specialty>/`
2. Add `plugin.json` (metadata), `regulations/registry.json` (documents), `regulations/<id>/rules.json` (declarative rules)
3. Optionally add `lookup-tables.json` and `computed-fields.json`
4. Register in `src/lib/plugins/loader.ts`

Rules are pure JSON — no code required. The rule engine supports:
- Direct comparisons (`>`, `<`, `==`, `exists`, `in`, `between`)
- Lookup table comparisons (`lookup_gt`, `lookup_lt` — resolve thresholds from matrices)
- Ordinal comparisons (`ordinal_lt`, `ordinal_gte` — position in ordered scales)
- Computed fields (`arithmetic`, `tier`, `conditional` — derived values before evaluation)

---

## Regulations covered

| Area | Regulation | Status |
|------|-----------|--------|
| Architecture | RGEU (DL 38382/1951), Código Civil Art. 1360-1422 | Hardcoded |
| Structural | Eurocodes EC0-EC8, NA (Anexo Nacional) | Hardcoded |
| Fire Safety | DL 220/2008 (SCIE), RT-SCIE, NT01-NT22 | Hardcoded + Plugin |
| HVAC | RECS, RSECE, F-Gas (DL 56/2011), Radon (Lei 108/2018) | Hardcoded |
| Water/Drainage | RGSPPDADAR (DL 23/95) | Hardcoded |
| Gas | DL 521/99, Portaria 361/98 | Hardcoded |
| Electrical | RTIEBT (Portaria 949-A/2006) | Hardcoded + Plugin |
| Telecommunications | ITED 4.ª ed (DL 123/2009), ITUR | Hardcoded |
| Thermal | REH (Portaria 349-B/2013) | Hardcoded + Plugin |
| Acoustic | RRAE (DL 129/2002) | Hardcoded |
| Accessibility | DL 163/2006 | Hardcoded |
| Energy | SCE (DL 101-D/2020) | Hardcoded |
| Elevators | DL 320/2002, EN 81-20/50 | Hardcoded |
| Licensing | RJUE (DL 555/99 / DL 136/2014) | Hardcoded |
| Waste | DL 46/2008 | Hardcoded |
| Drawing Quality | ISO 3098, scales, symbols | Hardcoded |
| Municipal | PDM database (multiple municipalities) | Hardcoded |

---

## License

Private. All rights reserved.

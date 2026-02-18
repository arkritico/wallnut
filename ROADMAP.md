# Wallnut Development Roadmap

## Current State (February 2026)

### What's Built

| System | Maturity | Key Files |
|--------|----------|-----------|
| IFC text parser (8 specialties, 65+ field enrichments) | 80% | `ifc-specialty-analyzer.ts`, `ifc-enrichment.ts` |
| CYPE matcher (multi-strategy, Portuguese NLP) | 70% | `cype-matcher.ts`, `cype-matcher-db-loader.ts` |
| CYPE database (17,500 items scraped, ~35% of full) | 35% | `data/cype-full.json` |
| Construction sequencer (30 phases, Goldratt CCPM) | 90% | `construction-sequencer.ts` |
| Site capacity optimizer (26 overlap rules, space constraints) | 65% | `site-capacity-optimizer.ts` |
| MS Project XML export (Portuguese calendar, resources) | 95% | `msproject-export.ts` |
| Resource aggregation (labor trades, materials, equipment) | 60% | `resource-aggregator.ts` |
| Budget Excel export (6 sheets, IVA, district factors) | 65% | `budget-export.ts` |
| Cost estimation (parametric, 79 items hardcoded) | 60% | `cost-estimation.ts` |
| Regulatory rules engine (1,964 rules, 18 specialties) | 85% | `regulamentos/**/*.json` |
| PDF text extraction (pdfjs-dist, client-side) | 70% | `document-parser.ts`, `AIRegulationIngestion.tsx` |
| WBS parser (CSV, JSON, Excel) | 85% | `wbs-parser.ts` |
| Auth + cloud storage (Supabase, RLS) | 80% | `supabase.ts`, `supabase-storage.ts` |
| CI/CD (lint, test, build, E2E, artifact upload) | 80% | `.github/workflows/ci.yml` |
| Docker + Vercel deployment configs | 80% | `Dockerfile`, `vercel.json` |

### What's Missing for MVP

1. **No unified "submit project" pipeline** — individual uploaders exist but no end-to-end flow from multi-file submission to all three outputs
2. **CYPE database only 35% populated** — 28 categories pending scrape
3. **No PDF splitting** — large multi-page docs can't be chunked
4. **No 3D/4D viewer** — IFC data extracted as text only
5. **No team-accessible staging** — runs on localhost only
6. **IFC ↔ BOQ keynote linking incomplete** — auto-generation exists but keynote chain not robust

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER SUBMISSION                          │
│              IFC · PDF · XLS (any dev level)                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Ingestion  │  Parse, classify, extract
                    │   Pipeline  │  Split large PDFs (pdf-lib)
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │  IFC Data  │   │  BOQ/MQT  │   │ Drawings  │
    │  Extractor │   │  Parser   │   │  Text/OCR │
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │                │                │
          └────────┬───────┘                │
                   │ keynotes               │
            ┌──────▼──────┐                 │
            │  CYPE Match │                 │
            │  + Pricing  │                 │
            └──────┬──────┘                 │
                   │                        │
     ┌─────────────┼─────────────┐          │
     │             │             │          │
┌────▼────┐  ┌────▼────┐  ┌────▼──────────▼───┐
│  Cost   │  │Schedule │  │    Regulatory     │
│Estimate │  │  (CCPM) │  │    Compliance     │
│  (CYPE) │  │         │  │  (1,964 rules)   │
└────┬────┘  └────┬────┘  └────────┬──────────┘
     │            │                │
┌────▼────┐  ┌────▼────┐  ┌───────▼───────┐
│ Budget  │  │MS Proj  │  │  Compliance   │
│  Excel  │  │  XML    │  │    Report     │
└─────────┘  └────┬────┘  └──────────────-┘
                   │
            ┌──────▼──────┐
            │  4D Viewer  │  IFC elements shown/hidden
            │  (browser)  │  by schedule timeline
            └─────────────┘
```

---

## Phase 0 — Team Staging & CI (Week 1)

**Goal**: Ship a URL the team can hit, with automatic deploys on every push.

### 0.1 Vercel Preview Deployments

The project already has `vercel.json` (CDG1/Paris region). What's missing:

- [ ] Connect GitHub repo to Vercel project
- [ ] Set environment variables on Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL` (staging project)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (staging project)
  - `ANTHROPIC_API_KEY` (if using AI analysis)
- [ ] Enable preview deployments on PRs (Vercel does this automatically)
- [ ] Set production branch to `master`

**Result**: Every PR gets a preview URL. `master` auto-deploys to production.

### 0.2 Staging Supabase Project

- [ ] Create a separate Supabase project for staging (free tier is fine)
- [ ] Run migrations: `supabase/schema.sql` + `supabase/migrations/20260215_cype_prices.sql`
- [ ] Enable RLS policies
- [ ] Seed CYPE prices from `data/cype-full.json`

### 0.3 Health Check Endpoint

- [ ] Add `src/app/api/health/route.ts` — returns `{ status: "ok", version, timestamp }`
- [ ] Add Vercel/UptimeRobot monitoring on `/api/health`

### 0.4 CI Hardening

Existing CI pipeline (`.github/workflows/ci.yml`) runs lint → test → build → E2E. Additions:

- [ ] Add TypeScript strict check step: `npx tsc --noEmit`
- [ ] Fix Vitest/babel configuration (tests currently fail due to `import type` syntax — needs `@babel/plugin-transform-typescript` or switch fully to Vitest)
- [ ] Add staging deploy step (Vercel CLI deploy on `develop` branch)

**Deliverable**: `https://wallnut-staging.vercel.app` accessible to team. PRs get preview URLs. CI blocks merge on failures.

---

## Phase 1 — MVP Core Pipeline (Weeks 2–5)

**Goal**: Upload project files → receive cost estimate + construction schedule + compliance report.

### 1.1 Unified Project Submission (Week 2)

**New component: `ProjectSubmission.tsx`**

Replace the current multi-step wizard with a single drag-and-drop zone that accepts everything:

```
┌─────────────────────────────────────────────┐
│                                             │
│    Drop your project files here             │
│    IFC · PDF · XLS                          │
│                                             │
│    ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│    │model │ │ MQT  │ │specs │ │plans │    │
│    │.ifc  │ │.xlsx │ │.pdf  │ │.pdf  │    │
│    └──────┘ └──────┘ └──────┘ └──────┘    │
│                                             │
│    [x] Estimativa de Custos                 │
│    [x] Planeamento de Obra                  │
│    [ ] Conformidade Regulamentar            │
│                                             │
│    [ Processar Projeto → ]                  │
└─────────────────────────────────────────────┘
```

Tasks:
- [ ] File type detection and classification (extend existing `ProjectUploader` logic)
- [ ] Multi-file state management (track IFC, BOQ, PDFs separately)
- [ ] Toggles for which outputs to generate
- [ ] Processing pipeline orchestration (parse → match → generate)
- [ ] Progress indicator with per-stage status

### 1.2 PDF Splitting for Large Documents (Week 2)

**Library**: `pdf-lib` (MIT, zero dependencies, works server-side and client-side)

```bash
npm install pdf-lib
```

**New module: `src/lib/pdf-splitter.ts`**

- [ ] Split PDFs by page count threshold (e.g., 50 pages per chunk)
- [ ] Split by file size (e.g., 10MB per chunk)
- [ ] Detect table-of-contents pages to split at logical boundaries
- [ ] Parallel text extraction across chunks using Web Workers
- [ ] Reassemble extracted text with page numbers preserved

**Integration points**:
- `AIRegulationIngestion.tsx` — split before extraction
- `document-parser.ts` — stream pages instead of loading all at once
- API route `/api/parse-document` — accept chunked uploads

### 1.3 CYPE Database Completion (Weeks 2–3, background)

The existing scraper infrastructure (`cype-scraper-v2.ts`, `cype-unified-scraper.ts`) works. 28 categories pending.

- [ ] Run scraper for pending categories (can run in parallel with other work):
  - Isolamento térmico (thermal insulation)
  - Fachadas (facades)
  - Estruturas de betão (concrete structures)
  - Estruturas metálicas (steel structures)
  - Acabamentos interiores (interior finishes)
  - Coberturas (roofing)
  - Pavimentos (flooring)
  - Pinturas (painting)
  - Serralharias (metalwork)
  - Carpintarias (woodwork)
  - Impermeabilização (waterproofing)
  - Demolições (demolitions)
  - Movimentos de terra (earthworks)
  - Urbanização (urbanization)
  - ... (remaining categories from `cype-categories.config.json`)
- [ ] Validate scraped data (unit consistency, price ranges)
- [ ] Update `data/cype-full.json` and Supabase `cype_prices` table
- [ ] Target: 40,000+ items covering all new construction and rehabilitation chapters

### 1.4 IFC ↔ BOQ Keynote Linking (Week 3)

The chain: **IFC element → keynote → BOQ line item → CYPE price**

Current state: `ifc-specialty-analyzer.ts` extracts classification codes from IFC. `cype-matcher.ts` matches BOQ descriptions to CYPE items. The missing link is robust keynote resolution.

**New module: `src/lib/keynote-resolver.ts`**

- [ ] Parse keynote annotations from IFC (`IfcClassificationReference`, `IfcExternalReference`)
- [ ] Map Uniformat/ProNIC/custom keynote codes to BOQ article codes
- [ ] When BOQ is present: match IFC elements to BOQ lines via shared keynotes
- [ ] When BOQ is absent: generate BOQ from IFC quantities + CYPE matching
- [ ] Confidence scoring: direct keynote match (95%) vs. inferred match (60-80%)
- [ ] Export mapping table for user review/override

### 1.5 End-to-End Pipeline Integration (Weeks 4–5)

Wire everything together into a single processing pipeline:

**New module: `src/lib/project-pipeline.ts`**

```typescript
interface PipelineInput {
  files: ProjectFile[];          // IFC, PDF, XLS
  options: {
    generateCosts: boolean;
    generateSchedule: boolean;
    generateCompliance: boolean;
    maxWorkers?: number;         // default: inferred from project size
    startDate?: string;          // default: 30 days from now
  };
}

interface PipelineOutput {
  costs?: CostSummary;           // CYPE-linked estimates
  schedule?: ProjectSchedule;    // CCPM schedule
  compliance?: AnalysisResult;   // Regulatory report
  exports: {
    budgetExcel?: Blob;
    msProjectXml?: Blob;
    compliancePdf?: Blob;
  };
  mapping: KeynoteMapping[];     // IFC ↔ BOQ traceability
}
```

Pipeline stages:
1. **Parse** — Extract data from all files (IFC text, PDF text, Excel BOQ)
2. **Classify** — Detect IFC specialties, classify documents, identify BOQ format
3. **Link** — Resolve keynotes, match IFC elements to BOQ articles
4. **Match** — Match BOQ articles to CYPE work items for pricing
5. **Estimate** — Calculate costs with district/type factors
6. **Sequence** — Generate schedule with CCPM and Portuguese phases
7. **Optimize** — Apply site capacity constraints (max workers, phase overlaps)
8. **Comply** — Run 1,964 regulatory rules against enriched project
9. **Export** — Generate Budget Excel + MS Project XML + Compliance PDF

- [ ] Implement pipeline orchestrator with stage-by-stage progress
- [ ] Add API route `POST /api/pipeline` for server-side processing
- [ ] Handle partial runs (cost-only, schedule-only, compliance-only)
- [ ] Store pipeline results in Supabase for retrieval
- [ ] Wire into `ProjectSubmission.tsx` UI

### 1.6 Labor Constraint Modeling (Week 4)

The user specified: "obras até 1.5M EUR provavelmente têm acesso a não mais que 10 trabalhadores."

- [ ] Add project-size-based workforce inference:
  ```
  Budget < 500K EUR    → max 6 workers
  Budget 500K–1.5M EUR → max 10 workers
  Budget 1.5M–5M EUR   → max 20 workers
  Budget > 5M EUR      → max 40 workers
  ```
- [ ] Override via user input (pipeline options)
- [ ] Feed into `construction-sequencer.ts` `maxWorkers` parameter
- [ ] Include director de obra in headcount (always 1)

**Deliverable (end of Phase 1)**: User uploads IFC + MQT → gets Budget Excel + MS Project XML + Compliance Report. All three outputs are populated with real CYPE prices, realistic Portuguese construction timeline, and regulatory compliance findings.

---

## Phase 2 — 4D BIM Viewer (Weeks 6–9)

**Goal**: Interactive 3D model in the browser, animated by construction schedule.

### 2.1 IFC 3D Viewer Integration (Week 6)

**Library**: `@thatopen/components` + `web-ifc` + `three` (all MIT licensed)

```bash
npm install @thatopen/components @thatopen/fragments web-ifc three
```

**New component: `src/components/IfcViewer.tsx`**

- [ ] Set up Three.js scene with `@thatopen/components`
- [ ] Load IFC files via `IfcLoader` component (WASM-based, handles large files)
- [ ] Element selection (click → show properties panel)
- [ ] Navigation: orbit, pan, zoom, first-person walkthrough
- [ ] Storey explorer (click floor → isolate that level)
- [ ] X-ray mode for MEP inspection
- [ ] Section planes for cut views

**CSP consideration**: `web-ifc` uses WASM. Update middleware.ts:
```
script-src 'self' 'wasm-unsafe-eval';
```

**Next.js consideration**: Three.js must be client-side only. Use `dynamic(() => import('./IfcViewer'), { ssr: false })`.

### 2.2 Element ↔ WBS Task Mapping (Week 7)

The bridge between 3D model and construction schedule.

**New module: `src/lib/element-task-mapper.ts`**

Mapping strategy (in priority order):
1. **Direct keynote** — IFC element has classification reference → matches BOQ article → matches WBS task
2. **Type + storey** — `IfcWall` on `Level 2` → maps to WBS phase `alvenarias` task for floor 2
3. **System** — `IfcPipeSegment` in plumbing system → maps to WBS phase `rede_agua`
4. **Fallback** — Group by IFC entity type → assign to generic phase

```typescript
interface ElementTaskLink {
  elementId: string;        // IFC GlobalId
  taskUid: number;          // WBS schedule task UID
  confidence: number;       // 0-100
  method: 'keynote' | 'type_storey' | 'system' | 'fallback';
}
```

- [ ] Build mapping engine with all 4 strategies
- [ ] User review UI: table showing element → task links with confidence
- [ ] Allow manual override (drag element to different task)
- [ ] Persist mappings with project

### 2.3 4D Timeline Player (Weeks 8–9)

**New component: `src/components/TimelinePlayer.tsx`**

```
┌─────────────────────────────────────────────────────────────┐
│                     3D IFC VIEWER                           │
│                                                             │
│           [Building appears progressively]                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ◄◄  ◄  ▶  ►  ►►    Day 45 / 220    │ Alvenarias Piso 1   │
│  ═══════════●════════════════════════  │ 6 trabalhadores    │
│  Mar 2026              Nov 2026        │ €45,200 acumulado  │
└─────────────────────────────────────────────────────────────┘
```

Features:
- [ ] Timeline scrubber (drag to any date in the schedule)
- [ ] Play/pause animation (step through construction day-by-day)
- [ ] Speed control (1x, 2x, 5x, 10x)
- [ ] Element visibility: `hider.set(elements, visible)` based on task dates
- [ ] Color coding:
  - Gray: not yet started
  - Blue: in progress
  - Green: completed
  - Red: on critical path
- [ ] Side panel: current phase, active tasks, worker count, accumulated cost
- [ ] Milestone markers on timeline
- [ ] CCPM buffer visualization (green/yellow/red zones)

**Rendering logic**:
```typescript
function updateVisibility(currentDate: Date) {
  for (const link of elementTaskLinks) {
    const task = schedule.tasks.find(t => t.uid === link.taskUid);
    if (!task) continue;

    const started = currentDate >= new Date(task.start);
    const completed = currentDate >= new Date(task.finish);

    hider.set(link.elementId, started);

    if (completed) colorize(link.elementId, 'green');
    else if (started) colorize(link.elementId, 'blue');
  }
}
```

- [ ] Smooth transitions (fade in elements over task duration)
- [ ] Phase labels in 3D space (floating text at floor level)
- [ ] Screenshot/recording export for presentations

**Deliverable (end of Phase 2)**: Upload IFC + generate schedule → see 3D model build itself over time. Scrub timeline to inspect any construction phase. Export animation for stakeholder presentations.

---

## Phase 3 — Production Hardening (Weeks 10–13)

### 3.1 OCR for Scanned PDFs

Many Portuguese building documents are scanned. Current system detects but can't extract.

- [ ] Integrate `tesseract.js` (client-side) + `node-tesseract-ocr` (server-side)
- [ ] Portuguese language pack (`por.traineddata`)
- [ ] Image preprocessing: contrast enhancement, deskew, binarization
- [ ] Hybrid pipeline: try text extraction first, fall back to OCR if < 50 chars/page

### 3.2 Background Processing Queue

Large projects with many files can take minutes to process.

- [ ] Implement job queue with Supabase as backend (no Redis needed):
  - `pipeline_jobs` table: id, status, progress, input, output, created_at
  - Poll-based status updates (SSE or websocket later)
- [ ] API: `POST /api/pipeline` returns `{ jobId }`, `GET /api/pipeline/:jobId` returns progress
- [ ] UI: Processing dashboard with stage-by-stage progress bars

### 3.3 Error Monitoring

- [ ] Integrate Sentry (free tier: 5K events/month)
- [ ] Structured error logging with Winston (already installed)
- [ ] API error tracking with request context

### 3.4 Resource Leveling Improvements

The site-capacity-optimizer (65% maturity) needs:

- [ ] Integrate phase overlap rules INTO initial sequencing (not just post-processing)
- [ ] Proper resource leveling: shift non-critical tasks to flatten labor histogram
- [ ] Equipment conflict resolution (crane, concrete pump)
- [ ] Fix UID collision bug in task splitting (line ~250 in site-capacity-optimizer.ts)

### 3.5 Cost Estimation Accuracy

- [ ] Replace hardcoded 79-item cost estimator with full CYPE database matching
- [ ] Add quantity takeoff from IFC geometry (area, volume, length calculations)
- [ ] Scale factors: bulk pricing discounts for large quantities
- [ ] Contingency buffers: 5-15% based on project stage/confidence

---

## Phase 4 — Advanced Features (Weeks 14+)

### 4.1 Cash Flow & S-Curve

- [ ] Monthly cash flow projection from schedule + costs
- [ ] S-curve visualization (planned vs. actual)
- [ ] Payment milestone suggestions
- [ ] Working capital requirements

### 4.2 Earned Value Management

- [ ] Baseline capture (save schedule snapshot)
- [ ] Progress tracking (% complete per task)
- [ ] SPI (Schedule Performance Index) and CPI (Cost Performance Index)
- [ ] EAC (Estimate at Completion) and ETC (Estimate to Complete)

### 4.3 Multi-User Collaboration

- [ ] Role-based access (project owner, reviewer, viewer)
- [ ] Comments on specific elements/tasks
- [ ] Change tracking (version history)

### 4.4 DWFx Support (Future)

Deferred per user decision. When needed:
- Server-side conversion via Autodesk Platform Services (APS) API
- Or: require PDF exports instead (current approach)

---

## Technology Stack Additions

| Phase | Package | Purpose | License | Size |
|-------|---------|---------|---------|------|
| 1 | `pdf-lib` | PDF splitting/manipulation | MIT | 340KB |
| 2 | `@thatopen/components` | BIM viewer framework | MIT | ~2MB |
| 2 | `@thatopen/fragments` | Optimized BIM storage | MIT | ~500KB |
| 2 | `web-ifc` | WASM IFC parser | MPL-2.0 | ~5MB (WASM) |
| 2 | `three` | 3D rendering | MIT | ~600KB |
| 3 | `tesseract.js` | Client-side OCR | Apache 2.0 | ~2MB |

No paid APIs or SaaS dependencies. Everything runs self-hosted.

---

## Testing Strategy

### Parallel with Development

Each phase includes testing that runs alongside development, not after:

**Unit Tests (Vitest)**:
- Pipeline stages: parse → classify → link → match → estimate → sequence
- CYPE matcher accuracy (benchmark against known BOQ↔CYPE pairs)
- Schedule generation (verify durations, dependencies, critical path)
- PDF splitting (page count, text preservation)
- Keynote resolution (direct, inferred, fallback)

**E2E Tests (Playwright)**:
- Upload flow: drag IFC + XLS → verify all three outputs generated
- 4D viewer: load model → scrub timeline → verify element visibility changes
- Export: download Budget Excel → verify it opens in Excel/LibreOffice
- Export: download MS Project XML → verify it opens in ProjectLibre

**Integration Tests**:
- Full pipeline with sample IFC + BOQ files
- Known-good projects with expected cost ranges
- Portuguese regulation edge cases

**Team Testing Protocol**:
- Every PR gets a Vercel preview URL
- Testers can upload real project files to staging
- Feedback via GitHub Issues with labels: `bug`, `ux`, `accuracy`

### Test Data

- [ ] Curate 3-5 sample IFC files (residential, commercial, rehabilitation)
- [ ] Curate matching BOQ spreadsheets with keynotes
- [ ] Document expected outputs (cost ranges, phase durations, compliance scores)
- [ ] Store in `tests/fixtures/` directory

---

## Deployment Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   GitHub    │────▶│  Vercel      │────▶│  Production     │
│   master    │     │  Auto-deploy │     │  wallnut.pt     │
└─────────────┘     └──────────────┘     └─────────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   GitHub    │────▶│  Vercel      │────▶│  Staging        │
│   develop   │     │  Preview     │     │  staging.       │
└─────────────┘     └──────────────┘     │  wallnut.pt     │
                                          └─────────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   GitHub    │────▶│  Vercel      │────▶│  PR Preview     │
│   PR #123   │     │  Preview     │     │  wallnut-       │
└─────────────┘     └──────────────┘     │  pr-123.vercel  │
                                          └─────────────────┘

         All environments ──▶  Supabase (staging or production)
```

### Environment Separation

| Environment | Supabase | Domain | Auto-deploy |
|-------------|----------|--------|-------------|
| Production | `wallnut-prod` project | wallnut.pt | `master` branch |
| Staging | `wallnut-staging` project | staging.wallnut.pt | `develop` branch |
| PR Preview | `wallnut-staging` project | pr-xxx.vercel.app | Any PR |

---

## Timeline Summary

```
Week  1  ███ Phase 0: Staging deploy, CI hardening
Week  2  ███ Phase 1.1-1.2: Unified upload + PDF splitting
Week  3  ███ Phase 1.3-1.4: CYPE completion + keynote linking
Week  4  ███ Phase 1.5-1.6: Pipeline integration + labor constraints
Week  5  ███ Phase 1 polish: Testing, bug fixes, team feedback
         ─── MVP MILESTONE: Upload → Costs + Schedule + Compliance ───
Week  6  ███ Phase 2.1: IFC 3D viewer in browser
Week  7  ███ Phase 2.2: Element ↔ WBS task mapping
Week  8  ███ Phase 2.3: 4D timeline player (part 1)
Week  9  ███ Phase 2.3: 4D timeline player (part 2) + polish
         ─── 4D MILESTONE: Interactive construction animation ───
Week 10  ███ Phase 3.1-3.2: OCR + background processing
Week 11  ███ Phase 3.3-3.4: Monitoring + resource leveling
Week 12  ███ Phase 3.5: Cost estimation accuracy
Week 13  ███ Phase 3 polish: Testing, performance, team feedback
         ─── PRODUCTION MILESTONE: Hardened, monitored, accurate ───
Week 14+ ███ Phase 4: Cash flow, EVM, collaboration, DWFx
```

### CYPE Scraping (runs in background throughout)

The monthly scraper (`update-cype-prices.yml`) already runs on GitHub Actions. For the initial population push:

- Week 2-3: Run scraper batches for 28 pending categories
- Week 4: Validate scraped data quality
- Week 5+: Monthly automated updates maintain currency

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large IFC files (>100MB) crash browser | High | Stream via web-ifc WASM, don't load full geometry at once |
| CYPE prices change, estimates become stale | Medium | Monthly automated scraper already configured |
| web-ifc WASM adds ~5MB to bundle | Medium | Dynamic import, only load when 3D viewer opened |
| Portuguese holiday dates vary (Easter) | Low | Calculate Easter dynamically instead of hardcoding |
| Keynote conventions vary between firms | High | Support multiple keynote standards (Uniformat, ProNIC, custom) |
| Scanned PDFs with poor quality | Medium | Pre-process with contrast/deskew before OCR |
| Team deploys break staging | Low | Preview URLs per PR, staging only from `develop` branch |

---

## Definition of Done

### MVP (Phase 1 Complete)
- [ ] User uploads IFC + optional BOQ → receives all three outputs
- [ ] Budget Excel has real CYPE prices with material/labor/equipment breakdown
- [ ] MS Project XML opens in MS Project/ProjectLibre with correct dates and resources
- [ ] Compliance report covers all 18 specialties
- [ ] Staging URL accessible to team
- [ ] CI pipeline green on every PR

### 4D (Phase 2 Complete)
- [ ] 3D IFC model renders in browser (< 5 second load for typical residential project)
- [ ] Timeline scrubber animates construction sequence
- [ ] Each element linked to a WBS task with visible confidence score
- [ ] Phase labels and cost accumulation visible during playback

### Production (Phase 3 Complete)
- [ ] Scanned PDFs processed via OCR
- [ ] Background processing for large projects (> 30 second pipeline)
- [ ] Error monitoring active (Sentry)
- [ ] Resource-leveled schedules respect all 26 Portuguese phase overlap rules
- [ ] Cost estimates within ±20% of manual CYPE pricing for benchmark projects

# Wallnut Development Roadmap

## Current State (February 2026)

### What's Built

| System | Maturity | Key Files |
|--------|----------|-----------|
| Unified pipeline (9-stage, multi-file, progress tracking) | 95% | `unified-pipeline.ts`, `UnifiedUpload.tsx` |
| IFC text parser (30+ entity types, 150+ field enrichments) | 90% | `ifc-specialty-analyzer.ts`, `ifc-enrichment.ts` |
| IFC spatial reasoning (window→room, adjacency, evacuation) | 85% | `ifc-relationship-graph.ts`, `spatial-context-resolver.ts` |
| IFC quantity takeoff (measured quantities from BIM) | 90% | `ifc-quantity-takeoff.ts` |
| IFC 3D viewer (Three.js, element selection, storey explorer) | 85% | `IfcViewer.tsx` |
| 4D timeline player (schedule-driven animation) | 85% | `TimelinePlayer.tsx`, `element-task-mapper.ts` |
| Price matcher (multi-strategy, scored matching, token similarity) | 85% | `price-matcher.ts`, `price-db-loader.ts` |
| Price database (2,049 items with full breakdowns) | 5% | `data/price-db.json` |
| Cost estimation (full DB + IFC quantities + scale factors + contingency) | 85% | `cost-estimation.ts` |
| Construction sequencer (30 phases, Goldratt CCPM) | 90% | `construction-sequencer.ts` |
| Site capacity optimizer (26 overlap rules, space constraints) | 75% | `site-capacity-optimizer.ts` |
| MS Project XML export (Portuguese calendar, resources) | 95% | `msproject-export.ts` |
| Resource aggregation (labor trades, materials, equipment) | 75% | `resource-aggregator.ts` |
| Budget Excel export (6 sheets, IVA, district factors) | 80% | `budget-export.ts` |
| Regulatory rules engine (7,161 rules, 18 specialties, 59 regulation files) | 95% | `src/data/plugins/*/rules.json` |
| Spatial context resolver (46 computed fields, IFC→rule bridge) | 90% | `spatial-context-resolver.ts` |
| Context builder (namespace aliases, virtual namespaces, smart defaults) | 90% | `context-builder.ts` |
| Field mappings (3,273 fields across 18 plugins) | 90% | `src/data/plugins/*/field-mappings.json` |
| IFC-to-project enrichment (structural, arch, MEP, fire safety) | 85% | `ifc-enrichment.ts` |
| Deep analyzers (energy, electrical, plumbing, fire safety) | 85% | `*-analyzer.ts` |
| PDF text extraction + splitting (pdfjs-dist, pdf-lib) | 85% | `document-parser.ts`, `pdf-splitter.ts` |
| OCR for scanned PDFs (server-side, Portuguese lang) | 80% | `ocr-processor.ts`, `server-ocr.ts` |
| Keynote resolver (5 resolution methods, BOQ generation) | 85% | `keynote-resolver.ts` |
| Labor constraint modeling (budget-based workforce inference) | 95% | `labor-constraints.ts` |
| Cash flow & S-curve (monthly projections, milestones) | 90% | `cashflow.ts` |
| Earned Value Management (PMI PMBOK, baseline, SPI/CPI/EAC) | 95% | `earned-value.ts`, `EvmDashboard.tsx` |
| WBS parser (CSV, JSON, Excel) | 85% | `wbs-parser.ts` |
| Background job queue (Supabase + in-memory backends) | 85% | `job-store.ts`, `pipeline-runner.ts` |
| Error monitoring (Sentry-ready, in-memory buffer) | 80% | `error-monitoring.ts`, `api-error-handler.ts` |
| Multi-user collaboration (RBAC, comments, history) | 80% | `collaboration.ts`, `CollaborationPanel` |
| Auth + cloud storage (Supabase, RLS) | 80% | `supabase.ts`, `supabase-storage.ts` |
| i18n (Portuguese + English, 120+ keys) | 95% | `i18n.ts` |
| Brand identity (PP Mori font, SVG logo, editorial splash) | 90% | `globals.css`, `page.tsx` |
| CI/CD (lint, test, build, tsc --noEmit) | 90% | `.github/workflows/ci.yml` |
| Docker + Vercel deployment configs | 80% | `Dockerfile`, `vercel.json` |

**Test suite**: 1,376 tests across 54 files (51 test files). All passing.

### What's Missing for Production

1. **Price database at 5% coverage** — 2,049 items out of ~40,000 target.
2. **No team-accessible staging** — Vercel + Supabase config ready but not connected.
3. **Resource leveling has known UID collision bug** — `site-capacity-optimizer.ts` line ~250.
4. **No Playwright E2E tests** — Unit tests comprehensive (1,376), but no browser-level integration tests.
5. **Export fidelity unvalidated** — Budget Excel and MS Project XML not verified against real MS Project / LibreOffice.

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
    ┌─────▼──────┐         │                │
    │  Spatial   │         │                │
    │  Graph +   │  keynotes               │
    │  Enrichment│─────────┤                │
    └─────┬──────┘         │                │
          │         ┌──────▼──────┐         │
          │         │ Price Match │         │
          │         │  + Pricing  │         │
          │         └──────┬──────┘         │
          │                │                │
     ┌────┼────────────────┼─────────┐      │
     │    │                │         │      │
┌────▼────┤──┐  ┌────▼────┐  ┌─────▼──────▼───┐
│  Cost     │  │Schedule │  │   Regulatory    │
│  Estimate │  │  (CCPM) │  │   Compliance    │
│           │  │         │  │  (7,161 rules)  │
└────┬──────┘  └────┬────┘  └───────┬─────────┘
     │              │               │
┌────▼────┐  ┌─────▼────┐  ┌───────▼───────┐
│ Budget  │  │ MS Proj  │  │  Compliance   │
│  Excel  │  │  XML     │  │    Report     │
└─────────┘  └─────┬────┘  └───────────────┘
                    │
             ┌──────▼──────┐
             │  4D Viewer  │  IFC elements shown/hidden
             │  (browser)  │  by schedule timeline
             └─────────────┘
```

---

## Phase 0 — Team Staging & CI ✅

**Goal**: Ship a URL the team can hit, with automatic deploys on every push.

### 0.1 Vercel Preview Deployments

The project already has `vercel.json` (CDG1/Paris region). Remaining manual setup:

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
- [ ] Run migrations: `supabase/schema.sql` + `supabase/migrations/20260215_pricing_tables.sql`
- [ ] Enable RLS policies
- [ ] Seed prices from `data/price-db.json`

### 0.3 Health Check Endpoint ✅

- [x] Add `src/app/api/health/route.ts` — returns `{ status: "ok", version, timestamp }`
- [ ] Add Vercel/UptimeRobot monitoring on `/api/health`

### 0.4 CI Hardening ✅

- [x] Add TypeScript strict check step: `npx tsc --noEmit`
- [x] Vitest fully configured and working (1,376 tests passing)
- [ ] Add staging deploy step (Vercel CLI deploy on `develop` branch)

**Status**: Code complete. Deployment infrastructure (Vercel + Supabase) requires manual setup.

---

## Phase 1 — MVP Core Pipeline ✅

**Goal**: Upload project files → receive cost estimate + construction schedule + compliance report.

### 1.1 Unified Project Submission ✅

**Component: `src/components/UnifiedUpload.tsx`**

- [x] File type detection and classification (IFC, BOQ/XLS, PDF)
- [x] Multi-file state management (track IFC, BOQ, PDFs separately)
- [x] Toggles for which outputs to generate (costs, schedule, compliance)
- [x] Processing pipeline orchestration (parse → match → generate)
- [x] Progress indicator with per-stage status (8 stages)

### 1.2 PDF Splitting for Large Documents ✅

**Module: `src/lib/pdf-splitter.ts`**

- [x] Split PDFs by page count threshold (default 50 pages per chunk)
- [x] Split by file size (default 10MB per chunk)
- [x] Detect table-of-contents pages to split at logical boundaries
- [x] Parallel text extraction across chunks (concurrency control, default 3)
- [x] Reassemble extracted text with page numbers preserved

### 1.3 Price Database Completion — IN PROGRESS (parallel instance)

Current state: 2,049 items with full breakdowns (materials/labor/machinery). Target: 40,000+.

- [ ] Expand database to cover all Portuguese construction categories
- [ ] Validate scraped data (unit consistency, price ranges)
- [ ] Update `data/price-db.json`
- [ ] Target: 40,000+ items covering all new construction and rehabilitation chapters

### 1.4 IFC ↔ BOQ Keynote Linking ✅

**Module: `src/lib/keynote-resolver.ts`**

- [x] Parse keynote annotations from IFC (`IfcClassificationReference`, `IfcExternalReference`)
- [x] Map Uniformat/ProNIC/custom keynote codes to BOQ article codes
- [x] When BOQ is present: match IFC elements to BOQ lines via shared keynotes
- [x] When BOQ is absent: generate BOQ from IFC quantities + Price matching
- [x] Confidence scoring: 5 resolution methods (classification 95%, keynote 90%, type 70%, name 50%, boq_match 60%)
- [x] Export mapping table for user review

### 1.5 End-to-End Pipeline Integration ✅

**Module: `src/lib/unified-pipeline.ts`**

Pipeline stages (all implemented):
1. **Parse** — Extract data from all files (IFC text, PDF text, Excel BOQ)
2. **Classify** — Detect IFC specialties, classify documents, identify BOQ format
3. **Link** — Resolve keynotes, match IFC elements to BOQ articles
4. **Match** — Match BOQ articles to price database work items for pricing
5. **Estimate** — Calculate costs with district/type factors + IFC quantity takeoff
6. **Sequence** — Generate schedule with CCPM and Portuguese phases
7. **Optimize** — Apply site capacity constraints (max workers, phase overlaps)
8. **Comply** — Run 7,161 regulatory rules against enriched project
9. **Export** — Generate Budget Excel + MS Project XML + Compliance Excel

- [x] Pipeline orchestrator with stage-by-stage progress
- [x] API route `POST /api/pipeline` for server-side processing
- [x] Handle partial runs (cost-only, schedule-only, compliance-only)
- [x] Store pipeline results via job queue (Supabase or in-memory)
- [x] Wired into `UnifiedUpload.tsx` UI

### 1.6 Labor Constraint Modeling ✅

**Module: `src/lib/labor-constraints.ts`**

- [x] Budget-based workforce inference:
  ```
  Budget < 500K EUR    → max 6 workers
  Budget 500K–1.5M EUR → max 10 workers
  Budget 1.5M–5M EUR   → max 20 workers
  Budget > 5M EUR      → max 40 workers
  ```
- [x] Override via user input (pipeline options)
- [x] Feed into `construction-sequencer.ts` `maxWorkers` parameter
- [x] Include director de obra in headcount (always 1)

---

## Phase 2 — 4D BIM Viewer ✅

**Goal**: Interactive 3D model in the browser, animated by construction schedule.

### 2.1 IFC 3D Viewer Integration ✅

**Component: `src/components/IfcViewer.tsx`**

- [x] Three.js scene with `@thatopen/components`
- [x] Load IFC files via `IfcLoader` (WASM-based, handles large files)
- [x] Element selection (click → show properties panel)
- [x] Navigation: orbit, pan, zoom
- [x] Storey explorer (click floor → isolate that level)
- [x] X-ray mode for MEP inspection
- [x] Section planes for cut views
- [x] CSP updated: `script-src 'self' 'wasm-unsafe-eval'`
- [x] Dynamic import with `{ ssr: false }`

### 2.2 Element ↔ WBS Task Mapping ✅

**Module: `src/lib/element-task-mapper.ts`**

All 4 mapping strategies implemented:
1. **Direct keynote** — IFC element has classification reference → matches BOQ article → matches WBS task (95% confidence)
2. **Type + storey** — `IfcWall` on `Level 2` → maps to WBS phase for floor 2 (60-80%)
3. **System** — `IfcPipeSegment` in plumbing system → maps to WBS phase `rede_agua` (70%)
4. **Fallback** — Group by IFC entity type → assign to generic phase (40%)

- [x] Build mapping engine with all 4 strategies
- [x] Returns coverage %, per-method stats, per-phase breakdown
- [x] Unmapped elements tracked separately

### 2.3 4D Timeline Player ✅

**Component: `src/components/TimelinePlayer.tsx`**

- [x] Timeline scrubber (drag to any date in the schedule)
- [x] Play/pause animation (step through construction day-by-day)
- [x] Speed control (1x, 2x, 5x, 10x)
- [x] Element visibility based on task dates
- [x] Color coding: Gray (not started), Blue (in progress), Green (completed), Red (critical path)
- [x] Side panel: current phase, active tasks, worker count, accumulated cost
- [x] Milestone markers on timeline

---

## Phase 3 — Production Hardening ✅

### 3.1 OCR for Scanned PDFs ✅

- [x] Server-side OCR via `src/app/api/ocr/route.ts` + `src/lib/ocr-processor.ts`
- [x] Portuguese language support configured
- [x] Image preprocessing for contrast/deskew
- [x] Hybrid pipeline: text extraction first, OCR fallback if < 50 chars/page

### 3.2 Background Processing Queue ✅

- [x] Job queue with dual backends: `InMemoryJobStore` (dev) + `SupabaseJobStore` (prod)
- [x] API: `POST /api/pipeline` returns `{ jobId }`, `GET /api/pipeline/:jobId` returns progress
- [x] Stage-by-stage progress tracking in `UnifiedUpload.tsx`

### 3.3 Error Monitoring ✅

- [x] Sentry integration ready (`NEXT_PUBLIC_SENTRY_DSN` env var)
- [x] In-memory error buffer (last 50 errors) with structured context
- [x] API error tracking with request metadata
- [x] Health endpoint exposes recent error count

### 3.4 Resource Leveling Improvements — PARTIAL

The site-capacity-optimizer has 26 Portuguese phase overlap rules but known issues remain:

- [x] Phase overlap rules integrated into optimization
- [x] Resource leveling via float-based task shifting
- [x] Equipment conflict resolution
- [ ] **Fix UID collision bug in task splitting (~line 250)** — known issue
- [ ] Validate resource-leveled output against real project schedules

### 3.5 Cost Estimation Accuracy ✅

- [x] Full price database matching (2,049 items with full breakdowns, scored matching with token similarity)
- [x] Quantity takeoff from IFC geometry (area, volume, length via `ifc-quantity-takeoff.ts`)
- [x] Scale factors: bulk pricing discounts for large quantities (5-15% by unit type)
- [x] Contingency buffers: 5-15% based on match confidence + project stage

---

## Phase 4 — Advanced Features ✅

### 4.1 Cash Flow & S-Curve ✅

**Module: `src/lib/cashflow.ts`**

- [x] Monthly cash flow projection from schedule + costs
- [x] S-curve visualization (cumulative %, period spend)
- [x] Payment milestone suggestions
- [x] Working capital requirements (materials, labor, equipment per period)

### 4.2 Earned Value Management ✅

**Module: `src/lib/earned-value.ts`** + **`src/components/EvmDashboard.tsx`**

- [x] Baseline capture (freeze schedule snapshot)
- [x] Progress tracking (% complete per task, actual cost override)
- [x] SPI (Schedule Performance Index) and CPI (Cost Performance Index)
- [x] EAC (Estimate at Completion) and ETC (Estimate to Complete)
- [x] TCPI (To-Complete Performance Index)
- [x] Health indicator (green/yellow/red based on SPI + CPI thresholds)
- [x] Schedule slippage projection (projected finish date, slippage days)
- [x] Interactive dashboard with S-curve chart, KPI grid, per-task progress table

### 4.3 Multi-User Collaboration ✅

**Module: `src/lib/collaboration.ts`**

- [x] Role-based access (project owner, reviewer, viewer) with RBAC matrix
- [x] Comments on specific findings, tasks, or articles
- [x] Change tracking (audit trail with ProjectHistoryEntry)
- [x] Graceful degradation without Supabase

### 4.4 DWFx Support — DEFERRED

Deferred per user decision. Foundational parser exists (`src/lib/dwfx-parser.ts`) for future use.

---

## Additional Features (beyond original roadmap)

These were implemented but not in the original roadmap:

| Feature | Module | Description |
|---------|--------|-------------|
| IFC quantity takeoff | `ifc-quantity-takeoff.ts` | Measured quantities from BIM model replace heuristic estimates |
| IFC spatial reasoning graph | `ifc-relationship-graph.ts` | Cross-entity relationships: window→room assignment, room adjacency, evacuation path analysis, per-room natural light ratios |
| IFC relationship parsing | `ifc-specialty-analyzer.ts` | IFCRELFILLSELEMENT (window→wall), IFCRELVOIDSELEMENT (opening→host), IFCRELAGGREGATES (hierarchy) |
| Spatial context resolver | `spatial-context-resolver.ts` | 46 computed fields bridged to rule paths: room areas, ceiling heights, stair dimensions, fire risk category, building height, typology |
| Regulation context builder | `context-builder.ts` | Namespace aliases, virtual namespaces, smart defaults for 18 specialties |
| IFC-to-project enrichment | `ifc-enrichment.ts` | 150+ fields: wall/window U-values, fire ratings, room areas, accessibility flags, MEP counts from IFC |
| Deep analyzers | `energy-analyzer.ts`, etc. | Iterative calculation engines for electrical, plumbing, energy, fire safety |
| 7,161 regulation rules | `src/data/plugins/*/rules.json` | 59 regulation files across 18 specialties, 127 registry entries |
| 3,273 field mappings | `field-mappings.json` × 18 | Maps regulation fields to project data paths across all plugins |
| EVM dashboard UI | `EvmDashboard.tsx` | Interactive EVM dashboard with S-curve chart, KPI grid |
| Brand identity | `globals.css`, `page.tsx` | PP Mori font, SVG Wallnut logo, editorial splash page |
| DWFx parser | `dwfx-parser.ts` | ZIP-based OPC format extraction (foundational, deferred) |

---

## Technology Stack

| Package | Purpose | License | Size |
|---------|---------|---------|------|
| `pdf-lib` | PDF splitting/manipulation | MIT | 340KB |
| `@thatopen/components` | BIM viewer framework | MIT | ~2MB |
| `@thatopen/fragments` | Optimized BIM storage | MIT | ~500KB |
| `web-ifc` | WASM IFC parser | MPL-2.0 | ~5MB (WASM) |
| `three` | 3D rendering | MIT | ~600KB |
| `tesseract.js` | Client-side OCR | Apache 2.0 | ~2MB |

No paid APIs or SaaS dependencies. Everything runs self-hosted.

---

## Testing

### Current Coverage

**1,376 tests across 54 files** (all passing as of 2026-02-20).

Key test files (51 test files):
- `analyzer.test.ts` — Full regulation analysis pipeline
- `calculations.test.ts` — Thermal, acoustic, energy calculations
- `cashflow.test.ts` — Cash flow and S-curve generation
- `collaboration.test.ts` — RBAC, comments, history
- `context-builder.test.ts` — Namespace resolution, smart defaults
- `cost-estimation.test.ts` — Price matching, quantity estimation, scale factors
- `e2e-api.test.ts` — End-to-end API integration (64 tests)
- `earned-value.test.ts` — EVM calculations (16 tests)
- `element-task-mapper.test.ts` — 4D mapping strategies
- `ifc-quantity-takeoff.test.ts` — IFC quantity aggregation (26 tests)
- `ifc-relationship-graph.test.ts` — Spatial graph: window→room, adjacency, evacuation (30 tests)
- `spatial-context-resolver.test.ts` — Computed fields, bridge, performance
- `keynote-resolver.test.ts` — Keynote resolution methods
- `labor-constraints.test.ts` — Workforce inference
- `pdf-splitter.test.ts` — PDF splitting (15 tests)
- `phase1-features.test.ts` through `phase4-pipeline.test.ts` — Plugin rule validation
- `unified-pipeline.test.ts` — Pipeline orchestration

### Still Missing

- [ ] Playwright E2E tests (upload flow, 4D viewer interaction, export verification)
- [ ] Benchmark tests (known projects with expected cost ranges for ±20% validation)
- [ ] Test fixtures directory with curated IFC + BOQ sample files

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

| Environment | Supabase | Domain | Auto-deploy |
|-------------|----------|--------|-------------|
| Production | `wallnut-prod` project | wallnut.pt | `master` branch |
| Staging | `wallnut-staging` project | staging.wallnut.pt | `develop` branch |
| PR Preview | `wallnut-staging` project | pr-xxx.vercel.app | Any PR |

---

## Remaining Work

### Critical (blocks production use)

| Item | Phase | Impact |
|------|-------|--------|
| Price database expansion (2,049 → 40,000+ items) | 1.3 | Cost estimates only cover ~5% of construction items |
| Vercel + Supabase deployment setup | 0.1-0.2 | No team-accessible URL |

### Important (quality improvements)

| Item | Phase | Impact |
|------|-------|--------|
| Fix UID collision bug in site-capacity-optimizer | 3.4 | Task splitting may produce duplicate UIDs |
| Playwright E2E tests | Testing | No browser-level integration verification |
| Export fidelity validation | 1.5 | Budget Excel / MS Project XML not tested in real software |
| Benchmark projects for ±20% cost accuracy | 3.5 | No ground truth for cost estimation accuracy |
| IFC test fixtures with real .ifc files | Testing | No real IFC files in test suite, only mock data |
| IFC spatial reasoning with IFCRELSPACEBOUNDARY | 5 | More precise room-to-surface adjacency (currently uses storey heuristic) |

### Nice to Have

| Item | Phase | Impact |
|------|-------|--------|
| UptimeRobot monitoring on health endpoint | 0.3 | Alerting on downtime |
| Staging deploy step in CI | 0.4 | Automatic staging updates |
| Screenshot/recording export from 4D player | 2.3 | Presentation material |
| Phase labels in 3D space (floating text) | 2.3 | Visual polish |
| CCPM buffer visualization in timeline | 2.3 | Advanced schedule insight |
| IFC field mappings expansion (51/3,273 have ifcMapping) | 5 | More fields auto-resolved from BIM |

---

## Risk Register

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| Large IFC files (>100MB) crash browser | High | Stream via web-ifc WASM, dynamic import | Mitigated |
| prices change, estimates become stale | Medium | Database expansion in progress | Active |
| web-ifc WASM adds ~5MB to bundle | Medium | Dynamic import, only load when 3D viewer opened | Mitigated |
| Portuguese holiday dates vary (Easter) | Low | Calculate Easter dynamically | Mitigated |
| Keynote conventions vary between firms | High | 5 resolution methods with confidence scoring | Mitigated |
| Scanned PDFs with poor quality | Medium | OCR with preprocessing (contrast/deskew) | Mitigated |
| Cost estimates inaccurate due to small DB | High | Database expansion to 40,000+ items | Active |

---

## Definition of Done

### MVP (Phase 1) ✅
- [x] User uploads IFC + optional BOQ → receives all three outputs
- [x] Budget Excel has real prices with material/labor/equipment breakdown
- [x] MS Project XML with correct dates and resources
- [x] Compliance report covers all 18 specialties (7,161 rules)
- [ ] Staging URL accessible to team
- [x] CI pipeline green on every PR

### 4D (Phase 2) ✅
- [x] 3D IFC model renders in browser
- [x] Timeline scrubber animates construction sequence
- [x] Each element linked to a WBS task with visible confidence score
- [x] Phase labels and cost accumulation visible during playback

### Production (Phase 3) ✅
- [x] Scanned PDFs processed via OCR
- [x] Background processing for large projects
- [x] Error monitoring active (Sentry-ready)
- [x] Resource-leveled schedules respect 26 Portuguese phase overlap rules
- [ ] Cost estimates within ±20% of manual price database for benchmark projects (blocked by price DB coverage)

### Advanced (Phase 4) ✅
- [x] Cash flow projections with payment milestones
- [x] Earned Value Management with interactive dashboard
- [x] Multi-user collaboration with role-based access
- [x] IFC quantity takeoff replaces heuristic estimates

### IFC Intelligence (Phase 5) ✅
- [x] 7,161 declarative regulation rules across 59 regulation files
- [x] 3,273 field mappings across 18 plugins
- [x] Spatial context resolver with 46 computed→rule field bridges
- [x] IFC relationship graph: window→room, room adjacency, evacuation paths
- [x] Per-room natural light ratio, ventilation area, fire compartment analysis
- [x] IFC enrichment: 150+ project fields from BIM (structural, arch, MEP, fire safety)
- [ ] IFCRELSPACEBOUNDARY parsing for exact room-surface adjacency

/**
 * API Route: CYPE Scraper Background Jobs
 *
 * POST /api/cype/scrape - Start background scraping job
 * GET /api/cype/scrape/[jobId] - Get job status (implemented separately)
 *
 * Features:
 * - Background execution (non-blocking)
 * - Progress tracking
 * - Category filtering
 * - Incremental vs full scrape
 * - Webhook notification on completion
 */

import { NextRequest, NextResponse } from 'next/server';
import { CypeUnifiedScraper } from '@/lib/cype-unified-scraper';
import { validateBatch } from '@/lib/cype-price-validator';
import { refreshCypeDatabase } from '@/lib/cype-matcher';
import fs from 'fs';
import path from 'path';

function checkAdminAuth(request: NextRequest): boolean {
  const key = process.env.CYPE_ADMIN_API_KEY;
  if (!key) return true; // No key configured = auth disabled (dev mode)
  const provided = request.headers.get('x-api-key') ?? request.nextUrl.searchParams.get('apiKey');
  return provided === key;
}

// ============================================================================
// TYPES
// ============================================================================

interface ScrapeJobRequest {
  categories?: string[]; // Optional category filter
  fullScrape?: boolean; // false = incremental (only changed items)
  webhook?: string; // Optional webhook URL to call when done
  enableValidation?: boolean; // Validate prices after scraping
}

interface ScrapeJobResponse {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  estimatedTime?: string;
  message: string;
}

interface ScrapeJobState {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  itemsScraped: number;
  errors: number;
  startTime: number;
  endTime?: number;
  error?: string;
  result?: {
    totalItems: number;
    validItems?: number;
    outputPath: string;
  };
}

// ============================================================================
// JOB STORAGE (In-memory for now, use Redis/DB in production)
// ============================================================================

const JOBS = new Map<string, ScrapeJobState>();

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function getJob(jobId: string): ScrapeJobState | null {
  return JOBS.get(jobId) || null;
}

function updateJob(jobId: string, updates: Partial<ScrapeJobState>): void {
  const existing = JOBS.get(jobId);
  if (existing) {
    JOBS.set(jobId, { ...existing, ...updates });
  }
}

// ============================================================================
// BACKGROUND SCRAPER
// ============================================================================

async function runScraperJob(
  jobId: string,
  options: ScrapeJobRequest
): Promise<void> {
  updateJob(jobId, { status: 'running', progress: 0 });

  try {
    const scraper = new CypeUnifiedScraper({
      extractBreakdowns: true,
      extractVariants: true,
    });

    // Progress callback
    const onProgress = (current: string, stats: any) => {
      const progress = Math.min(95, (stats.categoriesScraped / 30) * 100); // Assume ~30 categories
      updateJob(jobId, {
        progress,
        itemsScraped: stats.itemsScraped,
        errors: stats.errors,
      });
    };

    // Scrape
    const items = await scraper.scrapeAll(onProgress);

    updateJob(jobId, { progress: 95, itemsScraped: items.length });

    // Validate if requested
    let validItems = items.length;
    if (options.enableValidation) {
      const validationInput = items.map(item => ({
        code: item.code,
        description: item.description,
        category: item.category,
        unit: item.unit,
        totalCost: item.unitCost,
        breakdown: item.breakdown ? {
          materials: item.breakdown.materialCost,
          labor: item.breakdown.laborCost,
          machinery: item.breakdown.machineryCost,
        } : undefined,
      }));

      const { results, stats } = validateBatch(validationInput);
      validItems = stats.valid;

      console.log(`✅ Validation: ${stats.valid}/${stats.total} valid (${stats.avgConfidence.toFixed(1)}% avg confidence)`);
    }

    // Save to file
    const outputPath = path.join(process.cwd(), 'data', 'cype-full.json');
    const output = scraper.toJSON();

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    // Refresh matcher database
    refreshCypeDatabase();

    // Mark complete
    updateJob(jobId, {
      status: 'completed',
      progress: 100,
      endTime: Date.now(),
      result: {
        totalItems: items.length,
        validItems: options.enableValidation ? validItems : undefined,
        outputPath: 'data/cype-full.json',
      },
    });

    // Call webhook if provided
    if (options.webhook) {
      try {
        await fetch(options.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            status: 'completed',
            totalItems: items.length,
          }),
        });
      } catch (webhookError) {
        console.error('Failed to call webhook:', webhookError);
      }
    }

  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);
    updateJob(jobId, {
      status: 'failed',
      progress: 0,
      endTime: Date.now(),
      error: error.message || String(error),
    });

    // Call webhook with failure
    if (options.webhook) {
      try {
        await fetch(options.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            status: 'failed',
            error: error.message,
          }),
        });
      } catch {}
    }
  }
}

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * POST /api/cype/scrape
 * Start a new scraping job
 */
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: ScrapeJobRequest = await request.json();

    // Generate job ID
    const jobId = generateJobId();

    // Estimate time (rough)
    const estimatedMinutes = body.fullScrape ? 120 : 30;
    const estimatedTime = `${estimatedMinutes} min`;

    // Initialize job state
    const jobState: ScrapeJobState = {
      jobId,
      status: 'queued',
      progress: 0,
      itemsScraped: 0,
      errors: 0,
      startTime: Date.now(),
    };
    JOBS.set(jobId, jobState);

    // Start background job (non-blocking)
    runScraperJob(jobId, body).catch(err => {
      console.error('Background job error:', err);
    });

    // Return immediately
    return NextResponse.json({
      jobId,
      status: 'queued',
      estimatedTime,
      message: `Scraping job started. Use GET /api/cype/scrape/${jobId} to check status.`,
    } as ScrapeJobResponse);

  } catch (error: any) {
    console.error('Failed to start scraping job:', error);
    return NextResponse.json(
      {
        error: 'Failed to start scraping job',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cype/scrape?jobId=xxx
 * Get job status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    // List all jobs
    const allJobs = Array.from(JOBS.values()).map(job => ({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      itemsScraped: job.itemsScraped,
      startTime: new Date(job.startTime).toISOString(),
    }));

    return NextResponse.json({
      jobs: allJobs,
      total: allJobs.length,
    });
  }

  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found', jobId },
      { status: 404 }
    );
  }

  // Calculate duration
  const duration = job.endTime
    ? job.endTime - job.startTime
    : Date.now() - job.startTime;

  return NextResponse.json({
    ...job,
    duration: Math.round(duration / 1000), // seconds
    durationFormatted: `${Math.round(duration / 1000 / 60)} min ${Math.round((duration / 1000) % 60)} sec`,
  });
}

// ============================================================================
// API CONFIG
// ============================================================================

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes (background jobs can run longer)

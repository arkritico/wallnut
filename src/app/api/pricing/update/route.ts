/**
 * API Route: Update Prices
 * Triggers scraping and updates Supabase
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function checkAdminAuth(request: NextRequest): boolean {
  const key = process.env.PRICING_ADMIN_API_KEY;
  if (!key) return false; // Fail-closed: no key configured = deny access
  const provided = request.headers.get('x-api-key');
  if (!provided) return false;
  return provided === key;
}

// Lazy initialization - only create when URL is available
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables not configured");
  }
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { categories, region = "Lisboa" } = body;

    // Create scraping job
    const { data: job, error: jobError } = await supabase
      .from("pricing_scraping_jobs")
      .insert({
        status: "running",
        triggered_by: "manual",
      })
      .select()
      .single();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    // Start scraping in background
    // Note: In production, use a queue system (BullMQ, Inngest, etc.)
    startScrapingBackground(job.id, categories, region);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Scraping started",
    });
  } catch (error) {
    console.error("Error starting scraping:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get("jobId");

  if (jobId) {
    // Get job status
    const { data: job } = await supabase
      .from("pricing_scraping_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    return NextResponse.json({ job });
  }

  // Get latest jobs
  const { data: jobs } = await supabase
    .from("pricing_scraping_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ jobs });
}

async function startScrapingBackground(
  jobId: string,
  categories?: string[],
  region: string = "Lisboa"
) {
  // This would ideally run in a separate worker/queue
  // For now, just update job status (actual scraping would be done elsewhere)
  const supabase = getSupabase();

  try {
    // Simulate scraping delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // In production: trigger actual scraping script via:
    // - Vercel functions
    // - AWS Lambda
    // - Background job queue
    // - Webhook to external service

    await supabase
      .from("pricing_scraping_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_items: 0, // Would be filled by actual scraping
        logs: {
          message: "This is a placeholder. Integrate with actual scraping script.",
        },
      })
      .eq("id", jobId);
  } catch (error) {
    await supabase
      .from("pricing_scraping_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        logs: { error: String(error) },
      })
      .eq("id", jobId);
  }
}

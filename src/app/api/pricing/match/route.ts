/**
 * Price Matching API Route
 *
 * Server-side endpoint for WBS to price database matching.
 * Handles database loading (fs access) on the server only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { matchWbsToPrice } from '@/lib/price-matcher';
import type { WbsProject, MatchReport } from '@/lib/wbs-types';

export async function POST(request: NextRequest) {
  try {
    const wbsProject: WbsProject = await request.json();

    // Validate input
    if (!wbsProject || !wbsProject.chapters) {
      return NextResponse.json(
        { error: 'Invalid WBS project data' },
        { status: 400 }
      );
    }

    // Perform matching on server side (has access to fs)
    const matchReport: MatchReport = await matchWbsToPrice(wbsProject);

    return NextResponse.json(matchReport);
  } catch (error) {
    console.error('Price matching error:', error);
    return NextResponse.json(
      {
        error: 'Failed to match WBS to price database',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

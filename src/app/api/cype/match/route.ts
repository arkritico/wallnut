/**
 * CYPE Matching API Route
 *
 * Server-side endpoint for WBS to CYPE matching.
 * Handles database loading (fs access) on the server only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { matchWbsToCype } from '@/lib/cype-matcher';
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
    const matchReport: MatchReport = matchWbsToCype(wbsProject);

    return NextResponse.json(matchReport);
  } catch (error) {
    console.error('CYPE matching error:', error);
    return NextResponse.json(
      {
        error: 'Failed to match WBS to CYPE',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

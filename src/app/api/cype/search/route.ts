/**
 * CYPE Search API Route
 *
 * Server-side endpoint for searching the CYPE database.
 * Handles database loading (fs access) on the server only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchCype } from '@/lib/cype-matcher';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const limitStr = searchParams.get('limit');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const limit = limitStr ? parseInt(limitStr, 10) : 10;

    // Perform search on server side (has access to fs)
    const results = searchCype(query, limit);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('CYPE search error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search CYPE database',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

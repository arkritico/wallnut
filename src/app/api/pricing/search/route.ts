/**
 * Price Search API Route
 *
 * Server-side endpoint for searching the price database.
 * Handles database loading (fs access) on the server only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchPriceDb } from '@/lib/price-matcher';

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

    const limit = Math.min(Math.max(parseInt(limitStr || "10", 10) || 10, 1), 100);

    // Perform search on server side (has access to fs)
    const results = searchPriceDb(query, limit);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Price search error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search price database',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

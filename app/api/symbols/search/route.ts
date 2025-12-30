/**
 * GET /api/symbols/search
 * Search for symbols in the cache
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSymbolCache } from '@/lib/symbolCache';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter required' },
        { status: 400 }
      );
    }

    const cache = getSymbolCache();

    // Check if cache is loaded
    if (!cache.isReady()) {
      return NextResponse.json({
        success: false,
        error: 'Symbol cache not initialized. Please load RELIANCE on the chart first to initialize the cache.',
        isReady: false,
      });
    }

    const allSymbols = cache.getAllSymbols();

    // Search for symbols containing the query (case insensitive)
    const results = allSymbols
      .filter(s => s.symbol.toUpperCase().includes(query.toUpperCase()))
      .slice(0, 50)  // Limit to 50 results
      .map(s => ({
        symbol: s.symbol,
        token: s.token,
        exchange: s.exchange,
        expiry: s.expiry,
        strikePrice: s.strikePrice,
        optionType: s.optionType,
      }));

    return NextResponse.json({
      success: true,
      query,
      count: results.length,
      results,
    });
  } catch (error: any) {
    console.error('[SYMBOL-SEARCH] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}

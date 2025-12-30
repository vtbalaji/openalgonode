import { NextRequest, NextResponse } from 'next/server';
import { getAllZerodhaSymbols } from '@/lib/zerodhaSymbolLoader';

/**
 * GET /api/symbols/list?broker=zerodha
 * Get list of all available symbols for a broker
 * Uses LOCAL JSON (zerodhasymbol.json) - NO FIREBASE READS
 */
export async function GET(request: NextRequest) {
  try {
    const broker = request.nextUrl.searchParams.get('broker') || 'zerodha';

    if (broker === 'zerodha') {
      // ✅ USE LOCAL JSON (NO FIREBASE READ!)
      const allSymbols = getAllZerodhaSymbols();
      const symbolNames = allSymbols.map(s => s.symbol);

      console.log(`[Symbols] Returning ${symbolNames.length} Zerodha symbols from local JSON`);

      return NextResponse.json(
        {
          success: true,
          broker: 'zerodha',
          count: symbolNames.length,
          symbols: symbolNames,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'Only zerodha broker supported' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error fetching symbols:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch symbols' },
      { status: 500 }
    );
  }
}

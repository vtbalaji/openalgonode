import { NextRequest, NextResponse } from 'next/server';
import { getBrokerSymbolsList } from '@/lib/firebaseSymbols';

/**
 * GET /api/symbols/list?broker=zerodha
 * Get list of all available symbols for a broker
 */
export async function GET(request: NextRequest) {
  try {
    const broker = request.nextUrl.searchParams.get('broker') || 'zerodha';

    const symbols = await getBrokerSymbolsList(broker);

    return NextResponse.json(
      {
        success: true,
        broker: broker,
        count: symbols.length,
        symbols: symbols,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error fetching symbols:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch symbols' },
      { status: 500 }
    );
  }
}

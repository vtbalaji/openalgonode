import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

/**
 * GET /api/admin/get-symbol-token?symbol=NIFTY25DEC26000PE&broker=zerodha
 * Get instrument token for a symbol from Firebase
 * Handles both old and new compact storage formats
 */
export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get('symbol');
    const broker = request.nextUrl.searchParams.get('broker') || 'zerodha';

    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing symbol parameter' },
        { status: 400 }
      );
    }

    const upperSymbol = symbol.toUpperCase();

    // Query Firebase directly for compact storage
    const docRef = adminDb
      .collection('brokerSymbols')
      .doc(broker)
      .collection('symbols')
      .doc(upperSymbol);

    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        {
          error: `Token not found for symbol: ${symbol}`,
          symbol: upperSymbol,
          broker: broker,
          suggestion: 'Run /api/admin/sync-zerodha-symbols to sync all symbols',
        },
        { status: 404 }
      );
    }

    const data = docSnap.data();
    // Handle both old field names and new abbreviated field names
    const token = data?.t || data?.token;
    const exchange = data?.e || data?.exchange;

    if (!token) {
      return NextResponse.json(
        { error: 'Invalid symbol data in database' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        symbol: upperSymbol,
        token: token,
        broker: broker,
        exchange: exchange,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error getting symbol token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get symbol token' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

/**
 * POST /api/admin/import-symbols
 * Import broker symbols from a CSV string
 * Body: { broker: "zerodha", csv: "token,exchange,tradingsymbol,..." }
 */
export async function POST(request: NextRequest) {
  try {
    const { broker, csv } = await request.json();

    if (!broker || !csv) {
      return NextResponse.json(
        { error: 'Missing broker or csv' },
        { status: 400 }
      );
    }

    // Parse CSV
    const lines = csv.trim().split('\n');
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV must have header and at least one row' },
        { status: 400 }
      );
    }

    const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
    const tokenIndex = headers.indexOf('token');
    const symbolIndex = headers.indexOf('tradingsymbol');
    const exchangeIndex = headers.indexOf('exchange');

    if (tokenIndex === -1 || symbolIndex === -1 || exchangeIndex === -1) {
      return NextResponse.json(
        { error: 'CSV must have token, tradingsymbol, and exchange columns' },
        { status: 400 }
      );
    }

    // Upload to Firebase
    const batch = adminDb.batch();
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map((v: string) => v.trim());
      const token = values[tokenIndex];
      const symbol = values[symbolIndex].toUpperCase();
      const exchange = values[exchangeIndex];

      if (!token || !symbol) continue;

      const docRef = adminDb.collection('brokerSymbols').doc(broker).collection('symbols').doc(symbol);

      batch.set(docRef, {
        token: parseInt(token),
        symbol: symbol,
        exchange: exchange,
        broker: broker,
        updatedAt: new Date().toISOString(),
      });

      count++;
    }

    await batch.commit();

    return NextResponse.json(
      {
        success: true,
        message: `Imported ${count} symbols for ${broker}`,
        count: count,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error importing symbols:', error);
    return NextResponse.json(
      { error: 'Failed to import symbols' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';

/**
 * POST /api/admin/sync-zerodha-symbols
 * Fetch symbols from Zerodha API and store in Firebase
 * Body: { accessToken: "api_key:access_token" }
 */
export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json();

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing accessToken' },
        { status: 400 }
      );
    }

    // Fetch instruments from Zerodha
    console.log('Fetching instruments from Zerodha...');
    const response = await fetch('https://api.kite.trade/instruments', {
      headers: {
        'Authorization': accessToken,
        'X-Kite-Version': '3',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.message || 'Failed to fetch instruments from Zerodha' },
        { status: response.status }
      );
    }

    const text = await response.text();
    const lines = text.trim().split('\n');

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'No instruments returned from Zerodha' },
        { status: 400 }
      );
    }

    // Parse CSV
    const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
    const tokenIndex = headers.indexOf('instrument_token');
    const symbolIndex = headers.indexOf('tradingsymbol');
    const exchangeIndex = headers.indexOf('exchange');
    const segmentIndex = headers.indexOf('segment');
    const expiryIndex = headers.indexOf('expiry');
    const strikePriceIndex = headers.indexOf('strike');
    const optionTypeIndex = headers.indexOf('option_type');

    if (tokenIndex === -1 || symbolIndex === -1 || exchangeIndex === -1) {
      return NextResponse.json(
        { error: 'Zerodha CSV format unexpected' },
        { status: 400 }
      );
    }

    // Upload to Firebase
    const batch = adminDb.batch();
    let count = 0;
    let optionsCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle quoted CSV fields
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char: string = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const token = values[tokenIndex];
      const symbol = values[symbolIndex]?.toUpperCase() || '';
      const exchange = values[exchangeIndex] || '';
      const segment = values[segmentIndex] || '';
      const expiry = expiryIndex !== -1 ? values[expiryIndex] : '';
      const strikePrice = strikePriceIndex !== -1 ? values[strikePriceIndex] : '';
      const optionType = optionTypeIndex !== -1 ? values[optionTypeIndex] : '';

      if (!token || !symbol) continue;

      const docRef = adminDb
        .collection('brokerSymbols')
        .doc('zerodha')
        .collection('symbols')
        .doc(symbol);

      const symbolData: any = {
        token: parseInt(token),
        symbol: symbol,
        exchange: exchange,
        segment: segment,
        broker: 'zerodha',
        updatedAt: new Date().toISOString(),
      };

      // Add optional fields
      if (expiry) symbolData.expiry = expiry;
      if (strikePrice) symbolData.strikePrice = parseFloat(strikePrice);
      if (optionType) symbolData.optionType = optionType;

      batch.set(docRef, symbolData, { merge: true });

      count++;
      if (segment === 'options' || optionType) optionsCount++;

      // Commit in batches of 500
      if (count % 500 === 0) {
        await batch.commit();
        // Start a new batch
      }
    }

    // Final commit
    if (count % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Successfully imported ${count} symbols (${optionsCount} options)`);

    return NextResponse.json(
      {
        success: true,
        message: `Synced ${count} symbols from Zerodha (${optionsCount} options)`,
        count: count,
        optionsCount: optionsCount,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error syncing Zerodha symbols:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync symbols' },
      { status: 500 }
    );
  }
}

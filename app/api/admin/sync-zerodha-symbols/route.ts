import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/admin/sync-zerodha-symbols
 * Fetch symbols from Zerodha API and store in Firebase
 * Body: { accessToken?: "api_key:access_token", userId?: "uid", email?: "user@example.com" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let accessToken = body.accessToken;
    let userId = body.userId;

    // If email provided, find the user ID
    if (!userId && body.email) {
      try {
        const userRecord = await adminAuth.getUserByEmail(body.email);
        userId = userRecord.uid;
        console.log(`Found user ${body.email} with ID: ${userId}`);
      } catch (error: any) {
        return NextResponse.json(
          { error: `User not found with email: ${body.email}` },
          { status: 404 }
        );
      }
    }

    // If not provided directly, try to get from Firebase using auth header
    if (!accessToken && userId) {

      // Get broker config from Firebase
      const brokerConfigRef = adminDb
        .collection('users')
        .doc(userId)
        .collection('brokerConfig')
        .doc('zerodha');

      const docSnap = await brokerConfigRef.get();

      if (!docSnap.exists) {
        return NextResponse.json(
          { error: 'Broker configuration not found for user' },
          { status: 404 }
        );
      }

      const configData = docSnap.data();

      if (!configData?.accessToken || configData.status !== 'active') {
        return NextResponse.json(
          { error: 'Broker not authenticated for user' },
          { status: 401 }
        );
      }

      // Decrypt the access token
      accessToken = decryptData(configData.accessToken);
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing accessToken or userId' },
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
    let batch = adminDb.batch();
    let count = 0;
    let optionsCount = 0;
    let batchCount = 0;

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

      // Minimal compact storage - only essential fields
      const symbolData: any = {
        t: parseInt(token),        // token (abbreviated to save space)
        e: exchange,               // exchange (abbreviated)
      };

      // Add optional fields only if present (for derivatives)
      if (segment === 'options' || optionType) {
        if (expiry) symbolData.x = expiry;           // expiry
        if (strikePrice) symbolData.s = parseFloat(strikePrice);  // strike
        if (optionType) symbolData.o = optionType;   // option type
      }

      batch.set(docRef, symbolData, { merge: true });

      count++;
      batchCount++;
      if (segment === 'options' || optionType) optionsCount++;

      // Commit in batches of 500
      if (batchCount >= 500) {
        await batch.commit();
        batch = adminDb.batch(); // Create a fresh batch
        batchCount = 0;
        console.log(`Committed batch: ${count} symbols synced...`);
      }
    }

    // Final commit - commit remaining items
    if (batchCount > 0) {
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

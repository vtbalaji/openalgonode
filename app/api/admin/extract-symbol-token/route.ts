import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * GET /api/admin/extract-symbol-token?email=user@example.com&symbol=NIFTY25DEC26000PE
 * Extract instrument token from user's past orders in Zerodha
 */
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');
    const symbol = request.nextUrl.searchParams.get('symbol');

    if (!email || !symbol) {
      return NextResponse.json(
        { error: 'Missing email or symbol parameter' },
        { status: 400 }
      );
    }

    // Get user by email
    let userId: string;
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      userId = userRecord.uid;
      console.log(`Found user ${email} with ID: ${userId}`);
    } catch (error: any) {
      return NextResponse.json(
        { error: `User not found with email: ${email}` },
        { status: 404 }
      );
    }

    // Get broker config
    const brokerConfigRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('brokerConfig')
      .doc('zerodha');

    const docSnap = await brokerConfigRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Broker configuration not found' },
        { status: 404 }
      );
    }

    const configData = docSnap.data();

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Broker not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt access token (stored as api_key:access_token)
    const accessToken = decryptData(configData.accessToken);

    console.log(`Fetching orders from Zerodha for symbol: ${symbol}`);

    // Use the same format as placeOrder (token + combined format)
    const response = await fetch('https://api.kite.trade/orders', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'X-Kite-Version': '3',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      // Log the attempt details for debugging
      console.error('Zerodha API error:', {
        status: response.status,
        message: error.message,
        authFormat: 'token-combined',
        hasColon: accessToken.includes(':'),
      });
      return NextResponse.json(
        {
          error: `Failed to fetch orders: ${error.message}`,
          debug: {
            status: response.status,
            authFormat: 'token-combined',
          }
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const orders = data.data || [];

    console.log(`Found ${orders.length} orders`);

    // Find order with matching symbol
    const matchingOrder = orders.find(
      (order: any) => order.tradingsymbol?.toUpperCase() === symbol.toUpperCase()
    );

    if (!matchingOrder) {
      return NextResponse.json(
        {
          error: `No orders found for symbol: ${symbol}`,
          suggestedSymbols: [...new Set(orders.map((o: any) => o.tradingsymbol))].slice(0, 10),
        },
        { status: 404 }
      );
    }

    const token = matchingOrder.instrument_token;

    console.log(`Found token for ${symbol}: ${token}`);

    return NextResponse.json(
      {
        success: true,
        symbol: symbol,
        token: token,
        exchange: matchingOrder.exchange,
        message: `Token found! Now add to Firebase: token=${token}, symbol=${symbol}`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error extracting symbol token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extract symbol token' },
      { status: 500 }
    );
  }
}

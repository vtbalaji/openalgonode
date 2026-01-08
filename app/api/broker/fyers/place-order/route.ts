import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { placeFyersOrder } from '@/lib/fyersClient';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/broker/fyers/place-order
 * Place an order on Fyers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, symbol, qty, type, side, productType, price, stopPrice } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!symbol || !qty || !type || !side || !productType) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, qty, type, side, productType' },
        { status: 400 }
      );
    }

    // Get broker config from cache
    const configData = await getCachedBrokerConfig(userId, 'fyers');

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Broker not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt access token and API key
    let accessToken: string;
    let apiKey: string | undefined;
    try {
      accessToken = decryptData(configData.accessToken);
      if (configData.apiKey) {
        apiKey = decryptData(configData.apiKey);
      }
    } catch (error) {
      console.error('Failed to decrypt broker credentials:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Place the order
    const result = await placeFyersOrder(accessToken, {
      symbol,
      qty,
      type: type.toUpperCase() as 'MARKET' | 'LIMIT',
      side: side.toUpperCase() as 'BUY' | 'SELL',
      productType: productType.toUpperCase() as 'INTRADAY' | 'CNC' | 'MARGIN',
      price,
      stopPrice,
    }, apiKey);

    // Store order in Firestore for tracking
    if (result.id) {
      const userRef = adminDb.collection('users').doc(userId);
      await userRef.collection('orders').doc(result.id).set({
        orderId: result.id,
        symbol,
        qty,
        type,
        side,
        productType,
        price,
        stopPrice,
        status: result.status || 'PENDING',
        createdAt: new Date().toISOString(),
        broker: 'fyers',
      }, { merge: true });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Error placing Fyers order:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to place order' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { placeFyersOrder } from '@/lib/fyersClient';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';
import { convertToBrokerSymbol } from '@/lib/symbolMapping';

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

    console.log('[FYERS-PLACE-ORDER] Config data keys:', configData ? Object.keys(configData) : 'null');
    console.log('[FYERS-PLACE-ORDER] Config appId:', configData?.appId);
    console.log('[FYERS-PLACE-ORDER] Config apiKey preview:', configData?.apiKey ? configData.apiKey.substring(0, 20) + '...' : 'none');

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

    // Decrypt access token and extract app ID from JWT
    let accessToken: string;
    let appId: string;
    try {
      accessToken = decryptData(configData.accessToken);

      // For Fyers, appId comes from the stored apiKey (Client ID)
      // The JWT doesn't contain the appId
      if (configData.apiKey) {
        appId = decryptData(configData.apiKey);
        console.log('[FYERS-PLACE-ORDER] Decrypted appId from config.apiKey:', appId);
      } else {
        return NextResponse.json(
          { error: 'Missing apiKey configuration' },
          { status: 400 }
        );
      }
      console.log('[FYERS-PLACE-ORDER] Final appId to use:', appId);
    } catch (error) {
      console.error('[FYERS-PLACE-ORDER] Failed to decrypt/extract:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // For order placement in Fyers API v2, just use the symbol as-is (e.g., "TCS")
    // Don't add NSE: prefix - v2 API expects just the symbol
    let fyersSymbol = symbol;
    console.log('[FYERS-PLACE-ORDER] Placing order for user:', userId, 'symbol:', symbol, '-> Fyers:', fyersSymbol);

    // Place the order
    const result = await placeFyersOrder(accessToken, {
      symbol: fyersSymbol,
      qty,
      type: type.toUpperCase() as 'MARKET' | 'LIMIT',
      side: side.toUpperCase() as 'BUY' | 'SELL',
      productType: productType.toUpperCase() as 'INTRADAY' | 'CNC' | 'MARGIN',
      price,
      stopPrice,
    }, appId);

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
    console.error('[FYERS-PLACE-ORDER] Error placing order:', {
      message: error.message,
      stack: error.stack,
      error: error.toString(),
    });
    return NextResponse.json(
      { error: error.message || 'Failed to place order' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/broker/zerodha/place-order
 * Zerodha-specific order placement
 * Internal endpoint - called by /api/v1/placeorder router
 *
 * Authentication: Firebase ID token or API key (via parent router)
 * Body: {
 *   userId: string,
 *   symbol: string,
 *   exchange: string,
 *   action: 'BUY' | 'SELL',
 *   quantity: number,
 *   product?: string,
 *   pricetype?: string,
 *   price?: number,
 *   trigger_price?: number,
 *   disclosed_quantity?: number,
 *   strategy?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, symbol, exchange, action, quantity, product = 'MIS', pricetype = 'MARKET', price = 0, trigger_price = 0, disclosed_quantity = 0, strategy } = body;

    // Validate required fields
    if (!userId || !symbol || !exchange || !action || !quantity) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: userId, symbol, exchange, action, quantity',
        },
        { status: 400 }
      );
    }

    // Get Zerodha broker config
    const configData = await getCachedBrokerConfig(userId, 'zerodha');

    if (!configData) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Zerodha not configured for this user',
        },
        { status: 404 }
      );
    }

    // Check if broker is authenticated
    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Zerodha not authenticated. Please authenticate first.',
        },
        { status: 401 }
      );
    }

    const accessToken = decryptData(configData.accessToken);

    // Import Zerodha client
    const { placeOrder, transformOrderData } = await import('@/lib/zerodhaClient');

    // Transform order data to Zerodha format
    const orderData = {
      symbol,
      exchange,
      action,
      quantity,
      product,
      pricetype,
      price,
      trigger_price,
      disclosed_quantity,
    };

    const zerodhaOrder = transformOrderData(orderData);

    try {
      // Place order with Zerodha
      const result = await placeOrder(accessToken, zerodhaOrder);

      // Store order in Firestore for reference
      const ordersRef = adminDb.collection('users').doc(userId).collection('orders');
      await ordersRef.doc(result.order_id).set({
        orderId: result.order_id,
        symbol,
        exchange,
        action,
        quantity,
        product,
        pricetype,
        strategy,
        broker: 'zerodha',
        status: 'pending',
        createdAt: new Date(),
        zerodhaResponse: result,
      });

      return NextResponse.json(
        {
          status: 'success',
          orderid: result.order_id,
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        {
          status: 'error',
          message: error.message || 'Failed to place order with Zerodha',
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Zerodha place-order:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

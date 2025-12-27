/**
 * POST /api/broker/angel/place-order
 * Angel-specific order placement
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
 *   symboltoken?: string,
 *   strategy?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      symbol,
      exchange,
      action,
      quantity,
      product = 'MIS',
      pricetype = 'MARKET',
      price = 0,
      trigger_price = 0,
      disclosed_quantity = 0,
      symboltoken = '',
      strategy,
    } = body;

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

    // Get Angel broker config
    const configData = await getCachedBrokerConfig(userId, 'angel');

    if (!configData) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Angel Broker not configured for this user',
        },
        { status: 404 }
      );
    }

    // Check if broker is authenticated
    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Angel Broker not authenticated. Please authenticate first.',
        },
        { status: 401 }
      );
    }

    // Decrypt JWT token and API key with error handling
    let jwtToken: string;
    let apiKey: string;

    try {
      jwtToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return NextResponse.json(
        {
          status: 'error',
          message: 'Failed to decrypt credentials. Please re-authenticate.',
        },
        { status: 401 }
      );
    }

    // Import Angel client
    const { placeOrder, transformOrderData } = await import('@/lib/angelClient');

    // Transform order data to Angel format
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
      symboltoken,
    };

    const angelOrder = transformOrderData(orderData, symboltoken);

    try {
      // Place order with Angel
      const result = await placeOrder(jwtToken, apiKey, angelOrder);

      // Store order in Firestore for reference
      const ordersRef = adminDb.collection('users').doc(userId).collection('orders');
      await ordersRef.doc(result.orderid).set({
        orderId: result.orderid,
        symbol,
        exchange,
        action,
        quantity,
        product,
        pricetype,
        strategy,
        broker: 'angel',
        status: 'pending',
        createdAt: new Date(),
        angelResponse: result,
      });

      return NextResponse.json(
        {
          status: 'success',
          orderid: result.orderid,
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        {
          status: 'error',
          message: error.message || 'Failed to place order with Angel Broker',
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Angel place-order:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

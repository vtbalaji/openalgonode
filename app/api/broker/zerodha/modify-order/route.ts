/**
 * POST /api/broker/zerodha/modify-order
 * Zerodha-specific order modification
 * Internal endpoint - called by /api/v1/modifyorder and /api/ui/orders/modify
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, orderid, symbol, exchange, action, quantity, product, pricetype, price, trigger_price, disclosed_quantity } = body;

    // Validate required fields
    if (!userId || !orderid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: userId, orderid',
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

    // Decrypt access token with error handling
    let accessToken: string;
    try {
      accessToken = decryptData(configData.accessToken);
    } catch (error) {
      console.error('Failed to decrypt access token:', error);
      return NextResponse.json(
        {
          status: 'error',
          message: 'Failed to decrypt credentials. Please re-authenticate.',
        },
        { status: 401 }
      );
    }

    // Import Zerodha client
    const { modifyOrder } = await import('@/lib/zerodhaClient');

    try {
      // Modify order with Zerodha
      const result = await modifyOrder(accessToken, orderid, {
        tradingsymbol: symbol,
        exchange,
        transaction_type: action?.toUpperCase() as 'BUY' | 'SELL',
        order_type: pricetype,
        quantity,
        product,
        price,
        trigger_price,
        disclosed_quantity,
      });

      return NextResponse.json(
        {
          status: 'success',
          orderid: result.order_id || orderid,
          message: 'Order modified successfully',
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        {
          status: 'error',
          message: error.message || 'Failed to modify order with Zerodha',
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Zerodha modify-order:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

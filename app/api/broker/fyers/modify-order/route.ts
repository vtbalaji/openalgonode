/**
 * POST /api/broker/fyers/modify-order
 * Fyers-specific order modification
 * Internal endpoint - called by /api/v1/modifyorder and /api/ui/orders/modify
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, orderid, symbol, qty, type, side, productType, price, stopPrice } = body;

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

    // Get Fyers broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');

    if (!configData) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Fyers not configured for this user',
        },
        { status: 404 }
      );
    }

    // Check if broker is authenticated
    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Fyers not authenticated. Please authenticate first.',
        },
        { status: 401 }
      );
    }

    // Decrypt access token and API key
    let accessToken: string;
    let apiKey: string;
    try {
      accessToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);

      console.log('[MODIFYORDER-ROUTE] Decryption successful');
      console.log('[MODIFYORDER-ROUTE] API key (app_id):', apiKey);
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Import Fyers client
    const { modifyFyersOrder } = await import('@/lib/fyersClient');

    try {
      // Modify order with Fyers
      const result = await modifyFyersOrder(
        accessToken,
        orderid,
        {
          symbol,
          qty,
          type: type?.toUpperCase() as 'MARKET' | 'LIMIT' | undefined,
          side: side?.toUpperCase() as 'BUY' | 'SELL' | undefined,
          productType: productType?.toUpperCase() as 'INTRADAY' | 'CNC' | 'MARGIN' | undefined,
          price,
          stopPrice,
        },
        apiKey
      );

      return NextResponse.json(
        {
          status: 'success',
          orderid: orderid,
          message: 'Order modified successfully',
          data: result,
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        {
          status: 'error',
          message: error.message || 'Failed to modify order with Fyers',
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Fyers modify order:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

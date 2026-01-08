/**
 * POST /api/broker/fyers/cancel-all-orders
 * Cancel all Fyers pending orders
 * Internal endpoint - called by /api/v1/cancelallorder and /api/ui/
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing userId' },
        { status: 400 }
      );
    }

    // Get Fyers broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');

    if (!configData) {
      return NextResponse.json(
        { status: 'error', message: 'Fyers not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { status: 'error', message: 'Fyers not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt access token and API key
    let accessToken: string;
    let apiKey: string;
    try {
      accessToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);

      console.log('[CANCELALLORDERS-ROUTE] Decryption successful');
      console.log('[CANCELALLORDERS-ROUTE] API key (app_id):', apiKey);
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Import Fyers client
    const { cancelAllFyersOrders } = await import('@/lib/fyersClient');

    try {
      // Cancel all pending orders using the composite function
      const result = await cancelAllFyersOrders(accessToken, apiKey);

      const cancelled = result.cancelled?.length || 0;
      const failed = result.failed?.length || 0;

      return NextResponse.json(
        {
          status: 'success',
          message: result.message,
          data: { cancelled, failed, total: cancelled + failed },
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { status: 'error', message: error.message || 'Failed to cancel all orders' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Fyers cancel-all-orders:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

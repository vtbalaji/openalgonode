/**
 * POST /api/broker/zerodha/orderbook
 * Get Zerodha order book
 * Internal endpoint - called by /api/v1/orderbook and /api/ui/orders/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      console.error('Missing userId in orderbook request');
      return NextResponse.json(
        { status: 'error', message: 'Missing userId' },
        { status: 400 }
      );
    }

    console.log('Fetching orderbook for userId:', userId);

    // Get Zerodha broker config
    const configData = await getCachedBrokerConfig(userId, 'zerodha');
    console.log('Broker config retrieved:', { userId, hasConfig: !!configData, status: configData?.status });

    if (!configData) {
      return NextResponse.json(
        { status: 'error', message: 'Zerodha not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { status: 'error', message: 'Zerodha not authenticated' },
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
        { status: 'error', message: 'Failed to decrypt credentials. Please re-authenticate.' },
        { status: 401 }
      );
    }

    // Import Zerodha client
    const { getOrderBook } = await import('@/lib/zerodhaClient');

    try {
      const orders = await getOrderBook(accessToken);

      return NextResponse.json(
        {
          status: 'success',
          data: orders || [],
          count: orders?.length || 0,
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { status: 'error', message: error.message || 'Failed to fetch orderbook' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Zerodha orderbook:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

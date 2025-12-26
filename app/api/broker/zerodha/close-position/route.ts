/**
 * POST /api/broker/zerodha/close-position
 * Close Zerodha position
 * Internal endpoint - called by /api/v1/closeposition and /api/ui/
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, symbol, exchange, product } = body;

    if (!userId || !symbol || !exchange || !product) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get Zerodha broker config
    const configData = await getCachedBrokerConfig(userId, 'zerodha');

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
    const { closePosition } = await import('@/lib/zerodhaClient');

    try {
      const result = await closePosition(accessToken, symbol, exchange, product);

      return NextResponse.json(
        {
          status: 'success',
          message: 'Position closed successfully',
          data: result,
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { status: 'error', message: error.message || 'Failed to close position' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Zerodha close-position:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

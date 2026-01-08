import { NextRequest, NextResponse } from 'next/server';
import { placeFyersOrder } from '@/lib/fyersClient';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/broker/fyers/close-position
 * Close a position on Fyers (by placing opposite order)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, symbol, qty, side } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!symbol || !qty || !side) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, qty, side' },
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

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = decryptData(configData.accessToken);
    } catch (error) {
      console.error('Failed to decrypt access token:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Close position by placing opposite market order
    const oppositeSide = side.toUpperCase() === 'BUY' ? 'SELL' : 'BUY';
    const result = await placeFyersOrder(accessToken, {
      symbol,
      qty,
      type: 'MARKET',
      side: oppositeSide as 'BUY' | 'SELL',
      productType: 'INTRADAY',
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Error closing Fyers position:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to close position' },
      { status: 500 }
    );
  }
}

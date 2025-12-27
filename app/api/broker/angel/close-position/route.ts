/**
 * POST /api/broker/angel/close-position
 * Close an Angel position
 * Internal endpoint - called by /api/v1/closeposition router
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, symbol, exchange, producttype, quantity } = body;

    if (!userId || !symbol || !exchange || !producttype) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required fields: userId, symbol, exchange, producttype' },
        { status: 400 }
      );
    }

    const configData = await getCachedBrokerConfig(userId, 'angel');

    if (!configData) {
      return NextResponse.json(
        { status: 'error', message: 'Angel Broker not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { status: 'error', message: 'Angel Broker not authenticated' },
        { status: 401 }
      );
    }

    let jwtToken: string;
    let apiKey: string;

    try {
      jwtToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return NextResponse.json(
        { status: 'error', message: 'Failed to decrypt credentials. Please re-authenticate.' },
        { status: 401 }
      );
    }

    const { closePosition } = await import('@/lib/angelClient');

    try {
      const result = await closePosition(
        jwtToken,
        apiKey,
        symbol,
        exchange,
        producttype,
        quantity || '0'
      );

      return NextResponse.json(
        {
          status: 'success',
          orderid: result.orderid,
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
    console.error('Error in Angel close-position:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

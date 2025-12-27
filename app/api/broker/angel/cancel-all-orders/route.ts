/**
 * POST /api/broker/angel/cancel-all-orders
 * Cancel all open orders on Angel
 * Internal endpoint - called by /api/v1/cancelallorder router
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

    const { cancelAllOrders } = await import('@/lib/angelClient');

    try {
      const result = await cancelAllOrders(jwtToken, apiKey);

      return NextResponse.json(
        {
          status: 'success',
          canceled: result.canceled,
          failed: result.failed,
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
    console.error('Error in Angel cancel-all-orders:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

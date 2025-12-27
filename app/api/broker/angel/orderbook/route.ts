/**
 * POST /api/broker/angel/orderbook
 * Get Angel order book
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
      return NextResponse.json(
        { status: 'error', message: 'Missing userId' },
        { status: 400 }
      );
    }

    // Get Angel broker config
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

    // Decrypt JWT token and API key with error handling
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

    // Import Angel client
    const { getOrderBook } = await import('@/lib/angelClient');

    try {
      const orders = await getOrderBook(jwtToken, apiKey);

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
    console.error('Error in Angel orderbook:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

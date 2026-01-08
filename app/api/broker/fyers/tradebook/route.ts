/**
 * POST /api/broker/fyers/tradebook
 * Get Fyers trade book
 * Internal endpoint - called by /api/v1/tradebook
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

      console.log('[TRADEBOOK-ROUTE] Decryption successful');
      console.log('[TRADEBOOK-ROUTE] Access token preview:', accessToken.substring(0, 30) + '...');
      console.log('[TRADEBOOK-ROUTE] API key (app_id):', apiKey);
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Import Fyers client
    const { getTradebook } = await import('@/lib/fyersClient');

    try {
      const trades = await getTradebook(accessToken, apiKey);

      return NextResponse.json(
        {
          status: 'success',
          data: trades || [],
          count: trades?.tradeBook?.length || 0,
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { status: 'error', message: error.message || 'Failed to fetch tradebook' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Fyers tradebook:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

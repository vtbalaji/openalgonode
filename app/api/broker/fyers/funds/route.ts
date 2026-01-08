import { NextRequest, NextResponse } from 'next/server';
import { getFyersFunds } from '@/lib/fyersClient';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/broker/fyers/funds
 * Get funds from Fyers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
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

    // Decrypt access token and API key
    let accessToken: string;
    let apiKey: string | undefined;
    try {
      accessToken = decryptData(configData.accessToken);
      if (configData.apiKey) {
        apiKey = decryptData(configData.apiKey);
      }
    } catch (error) {
      console.error('Failed to decrypt broker credentials:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Get funds
    const result = await getFyersFunds(accessToken, apiKey);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Error getting Fyers funds:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get funds' },
      { status: 500 }
    );
  }
}

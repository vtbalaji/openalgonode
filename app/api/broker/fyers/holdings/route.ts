import { NextRequest, NextResponse } from 'next/server';
import { getFyersHoldings } from '@/lib/fyersClient';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/broker/fyers/holdings
 * Get holdings from Fyers
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
    let apiKey: string;
    try {
      accessToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);

      console.log('[HOLDINGS-ROUTE] Decryption successful');
      console.log('[HOLDINGS-ROUTE] Access token preview:', accessToken.substring(0, 30) + '...');
      console.log('[HOLDINGS-ROUTE] API key (app_id):', apiKey);
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    console.log('[HOLDINGS-ROUTE] Calling getFyersHoldings with userId:', userId);
    // Get holdings
    const result = await getFyersHoldings(accessToken, apiKey);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Error getting Fyers holdings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get holdings' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getFyersPositions } from '@/lib/fyersClient';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/broker/fyers/positions
 * Get positions from Fyers
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
      console.log('[POSITIONS-ROUTE] configData.accessToken type:', typeof configData.accessToken, 'length:', (configData.accessToken as string).length);
      console.log('[POSITIONS-ROUTE] configData.accessToken preview:', (configData.accessToken as string).substring(0, 50) + '...');
      console.log('[POSITIONS-ROUTE] configData.apiKey type:', typeof configData.apiKey, 'length:', (configData.apiKey as string).length);

      accessToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);

      console.log('[POSITIONS-ROUTE] Decryption successful');
      console.log('[POSITIONS-ROUTE] Decrypted accessToken type:', typeof accessToken, 'length:', accessToken.length);
      console.log('[POSITIONS-ROUTE] Decrypted accessToken preview:', accessToken.substring(0, 30) + '...');
      console.log('[POSITIONS-ROUTE] Decrypted apiKey type:', typeof apiKey, 'length:', apiKey.length);
      console.log('[POSITIONS-ROUTE] Decrypted apiKey:', apiKey);
    } catch (error) {
      console.error('[POSITIONS-ROUTE] Decryption failed:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    console.log('[POSITIONS-ROUTE] Calling getFyersPositions with userId:', userId);
    // Get positions
    const result = await getFyersPositions(accessToken, apiKey);

    // Extract positions array from response and map to standard format
    const rawPositions = result.netPositions || result.dayPositions || [];
    const positions = rawPositions.map((pos: any) => ({
      tradingsymbol: pos.symbol || '',
      exchange: 'NSE', // Fyers returns exchange as code, default to NSE
      quantity: pos.netQty || pos.qty || 0,
      average_price: pos.netAvg || pos.buyAvg || 0,
      last_price: pos.ltp || 0,
      pnl: pos.pl || 0,
      pnl_percent: pos.ltp && pos.netAvg ? ((pos.ltp - pos.netAvg) / pos.netAvg * 100) : 0,
    }));
    console.log('[POSITIONS-ROUTE] Mapped positions count:', positions.length);

    return NextResponse.json({
      ...result,
      positions: positions,
    }, { status: 200 });
  } catch (error: any) {
    console.error('Error getting Fyers positions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get positions' },
      { status: 500 }
    );
  }
}

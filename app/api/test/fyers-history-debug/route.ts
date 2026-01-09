import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const { userId, symbol = 'RELIANCE-EQ', resolution = '3' } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    console.log('[FYERS-HISTORY-DEBUG] Testing Fyers history API');
    console.log('[FYERS-HISTORY-DEBUG] Symbol:', symbol);
    console.log('[FYERS-HISTORY-DEBUG] Resolution:', resolution);

    // Get Fyers config
    const fyersConfig = await getCachedBrokerConfig(userId, 'fyers');
    if (!fyersConfig || fyersConfig.status !== 'active') {
      return NextResponse.json(
        { error: 'Fyers not configured' },
        { status: 401 }
      );
    }

    const accessToken = decryptData(fyersConfig.accessToken);
    const apiKey = decryptData(fyersConfig.apiKey);

    console.log('[FYERS-HISTORY-DEBUG] API Key (first 10 chars):', apiKey.substring(0, 10));
    console.log('[FYERS-HISTORY-DEBUG] Access Token (first 10 chars):', accessToken.substring(0, 10));

    // Build URL
    const params = new URLSearchParams();
    params.append('symbol', symbol);
    params.append('resolution', resolution);
    params.append('date_format', '1');
    params.append('range_from', '2025-11-20');
    params.append('range_to', '2026-01-08');

    const url = `https://api-t1.fyers.in/api/v3/history?${params.toString()}`;
    console.log('[FYERS-HISTORY-DEBUG] URL:', url);
    console.log('[FYERS-HISTORY-DEBUG] Auth Header:', `${apiKey}:${accessToken}`);

    // Make request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `${apiKey}:${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    console.log('[FYERS-HISTORY-DEBUG] Response status:', response.status);
    console.log('[FYERS-HISTORY-DEBUG] Response headers:', JSON.stringify(Object.fromEntries(response.headers)));

    const text = await response.text();
    console.log('[FYERS-HISTORY-DEBUG] Response body:', text.substring(0, 500));

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Fyers API error: ${response.status}`,
          status: response.status,
          responseText: text.substring(0, 1000),
        },
        { status: response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          error: 'Failed to parse response as JSON',
          responseText: text.substring(0, 1000),
        },
        { status: 400 }
      );
    }

    console.log('[FYERS-HISTORY-DEBUG] Response:', JSON.stringify(data).substring(0, 200));

    return NextResponse.json({
      success: true,
      data,
      candles: data.candles?.length || 0,
    });
  } catch (error: any) {
    console.error('[FYERS-HISTORY-DEBUG] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chart/historical
 * Fetch historical OHLC data from Zerodha
 * 
 * Query params:
 * - symbol: Trading symbol (e.g., RELIANCE, NIFTY25DEC25900CE)
 * - interval: minute, 3minute, 5minute, 10minute, 15minute, 30minute, 60minute, day
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - userId: User ID for authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { getInstrumentToken } from '@/lib/websocket/instrumentMapping';
import { decryptData } from '@/lib/encryptionUtils';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const interval = searchParams.get('interval') || 'day';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const userId = searchParams.get('userId');

    if (!symbol || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: symbol, userId' },
        { status: 400 }
      );
    }

    // Get instrument token
    const instrumentToken = getInstrumentToken(symbol);
    if (!instrumentToken) {
      return NextResponse.json(
        { error: 'Symbol not found: ' + symbol },
        { status: 404 }
      );
    }

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, 'zerodha');
    if (!configData || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Zerodha not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt credentials
    const apiKey = decryptData(configData.apiKey);
    const accessToken = decryptData(configData.accessToken);

    // Build Zerodha API URL
    const baseUrl = 'https://api.kite.trade';
    let url = baseUrl + '/instruments/historical/' + instrumentToken + '/' + interval;

    // Add date range if provided
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const paramString = params.toString();
    if (paramString) {
      url += '?' + paramString;
    }

    console.log('[CHART-HISTORICAL] Fetching data for ' + symbol + ' (token: ' + instrumentToken + ')');
    console.log('[CHART-HISTORICAL] URL: ' + url);

    // Fetch from Zerodha
    const response = await fetch(url, {
      headers: {
        'Authorization': 'token ' + apiKey + ':' + accessToken,
        'X-Kite-Version': '3',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[CHART-HISTORICAL] Zerodha API error:', errorText);
      return NextResponse.json(
        { error: 'Zerodha API error: ' + response.status },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform to format expected by TradingView Lightweight Charts
    // Zerodha returns: {data: {candles: [[timestamp, open, high, low, close, volume], ...]}}
    const candles = data.data?.candles || [];
    const chartData = candles.map((candle: any[]) => ({
      time: Math.floor(new Date(candle[0]).getTime() / 1000), // Unix timestamp in seconds
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5] || 0,
    }));

    console.log('[CHART-HISTORICAL] Returning ' + chartData.length + ' candles');

    return NextResponse.json({
      success: true,
      symbol,
      interval,
      instrumentToken,
      data: chartData,
      count: chartData.length,
    });
  } catch (error: any) {
    console.error('[CHART-HISTORICAL] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}

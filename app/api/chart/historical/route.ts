/**
 * GET /api/chart/historical
 * Fetch historical OHLC data from Zerodha or Fyers
 * Auto-detects which broker the user is authenticated with
 *
 * Query params:
 * - symbol: Trading symbol (e.g., RELIANCE, NIFTY50, NIFTYJANFUT)
 * - interval: minute, 3minute, 5minute, 10minute, 15minute, 30minute, 60minute, day
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - userId: User ID for authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { getInstrumentToken } from '@/lib/websocket/instrumentMapping';
import { decryptData } from '@/lib/encryptionUtils';
import { getSymbolCache } from '@/lib/symbolCache';
import { convertToBrokerSymbol } from '@/lib/symbolMapping';

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

    console.log('[CHART-HISTORICAL] Requested symbol:', symbol);

    // Auto-detect which broker the user is authenticated with
    let broker: 'zerodha' | 'fyers' = 'zerodha';
    let configData = await getCachedBrokerConfig(userId, 'zerodha');

    if (!configData || configData.status !== 'active') {
      // Try Fyers if Zerodha is not authenticated
      console.log('[CHART-HISTORICAL] Zerodha not authenticated, trying Fyers...');
      configData = await getCachedBrokerConfig(userId, 'fyers');
      broker = 'fyers';

      if (!configData || configData.status !== 'active') {
        return NextResponse.json(
          { error: 'No broker authenticated. Please authenticate with Zerodha or Fyers.' },
          { status: 401 }
        );
      }
    }

    console.log('[CHART-HISTORICAL] Using broker:', broker);

    // Convert symbol to broker-specific format
    const brokerSymbol = convertToBrokerSymbol(symbol, broker);
    console.log('[CHART-HISTORICAL] Converted symbol:', brokerSymbol);

    // Decrypt credentials
    const encryptedAccessToken = decryptData(configData.accessToken);
    const decryptedApiKey = decryptData(configData.apiKey);

    console.log('[CHART-HISTORICAL] Broker:', broker);

    let chartData: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }> = [];

    if (broker === 'zerodha') {
      // ===== ZERODHA FLOW =====
      // Extract access token from combined format (apiKey:accessToken)
      const accessToken = encryptedAccessToken.includes(':')
        ? encryptedAccessToken.split(':')[1]
        : encryptedAccessToken;

      // Ensure symbol cache is loaded
      const symbolCache = getSymbolCache();
      if (!symbolCache.isReady()) {
        console.log('[CHART-HISTORICAL] Symbol cache not loaded, loading now...');
        await symbolCache.load(decryptedApiKey, accessToken);
      }

      // Get instrument token for Zerodha
      const instrumentToken = getInstrumentToken(brokerSymbol);
      if (!instrumentToken) {
        return NextResponse.json(
          { error: 'Symbol not found: ' + brokerSymbol },
          { status: 404 }
        );
      }

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

      console.log('[CHART-HISTORICAL] Zerodha URL:', url);

      // Fetch from Zerodha
      const response = await fetch(url, {
        headers: {
          'Authorization': 'token ' + decryptedApiKey + ':' + accessToken,
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

      // Transform Zerodha data: {data: {candles: [[timestamp, open, high, low, close, volume], ...]}}
      const candles = data.data?.candles || [];
      chartData = candles.map((candle: any[]) => ({
        time: Math.floor(new Date(candle[0]).getTime() / 1000), // Unix timestamp in seconds
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5] || 0,
      }));
    } else if (broker === 'fyers') {
      // ===== FYERS FLOW =====
      const accessToken = encryptedAccessToken;

      // Fyers uses symbol directly (we already converted it above)
      const baseUrl = 'https://api-t1.fyers.in/api/v3';
      let url = `${baseUrl}/history?symbol=${encodeURIComponent(brokerSymbol)}&resolution=${interval}`;

      if (from) url += `&date_format=1&from=${from}`;
      if (to) url += `&to=${to}`;

      console.log('[CHART-HISTORICAL] Fyers URL:', url);

      // Fetch from Fyers - uses appId:accessToken format
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `${decryptedApiKey}:${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CHART-HISTORICAL] Fyers API error:', errorText);
        return NextResponse.json(
          { error: 'Fyers API error: ' + response.status },
          { status: response.status }
        );
      }

      const data = await response.json();

      // Transform Fyers data - check response structure
      if (data.s === 'ok' && data.candles) {
        // Fyers format: {s: "ok", candles: [[timestamp, open, high, low, close, volume], ...]}
        chartData = data.candles.map((candle: any[]) => ({
          time: Math.floor(candle[0] / 1000), // Fyers returns milliseconds, convert to seconds
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5] || 0,
        }));
      } else {
        return NextResponse.json(
          { error: 'Fyers API error: ' + (data.message || 'Invalid response') },
          { status: 400 }
        );
      }
    }

    console.log('[CHART-HISTORICAL] Returning ' + chartData.length + ' candles');
    if (chartData.length > 0) {
      console.log('[CHART-HISTORICAL] First candle:', JSON.stringify(chartData[0]));
      console.log('[CHART-HISTORICAL] Last candle:', JSON.stringify(chartData[chartData.length - 1]));
    }

    return NextResponse.json({
      success: true,
      symbol,
      interval,
      broker,
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

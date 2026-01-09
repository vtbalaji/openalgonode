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

/**
 * Convert interval format from UI to Fyers API format
 * UI format: minute, 3minute, 5minute, etc.
 * Fyers format: 1, 3, 5, 60, D
 */
function convertIntervalToFyersFormat(interval: string): string {
  if (interval === 'day' || interval === '1D') return 'D';
  if (interval === 'minute') return '1';

  // Remove 'minute' suffix to get just the number
  const numberPart = interval.replace('minute', '');
  return numberPart || '1';
}

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

    console.log('[CHART-HISTORICAL] Requested symbol:', symbol, 'for userId:', userId);

    // Detect which broker the user has configured (check both)
    const zerodhaConfig = await getCachedBrokerConfig(userId, 'zerodha');
    const fyersConfig = await getCachedBrokerConfig(userId, 'fyers');

    const zerodhaActive = zerodhaConfig && zerodhaConfig.status === 'active';
    const fyersActive = fyersConfig && fyersConfig.status === 'active';

    console.log('[CHART-HISTORICAL] Zerodha active:', zerodhaActive, 'Fyers active:', fyersActive);

    // Determine which broker to use
    let broker: 'zerodha' | 'fyers';
    let configData;

    if (zerodhaActive && !fyersActive) {
      // User has only Zerodha configured
      broker = 'zerodha';
      configData = zerodhaConfig;
      console.log('[CHART-HISTORICAL] User has Zerodha configured');
    } else if (fyersActive && !zerodhaActive) {
      // User has only Fyers configured
      broker = 'fyers';
      configData = fyersConfig;
      console.log('[CHART-HISTORICAL] User has Fyers configured');
    } else if (zerodhaActive && fyersActive) {
      // User has both - use Zerodha as primary
      broker = 'zerodha';
      configData = zerodhaConfig;
      console.log('[CHART-HISTORICAL] User has both brokers configured, using Zerodha as primary');
    } else {
      // User has neither broker configured
      console.log('[CHART-HISTORICAL] User has no broker authenticated');
      return NextResponse.json(
        { error: 'No broker authenticated. Please authenticate with Zerodha or Fyers.' },
        { status: 401 }
      );
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

      // Fyers API expects specific parameter format
      const fyersResolution = convertIntervalToFyersFormat(interval);
      console.log('[CHART-HISTORICAL] Interval conversion:', interval, '→', fyersResolution);

      // Detect if this is a futures contract
      const isFuture = symbol.toUpperCase().includes('FUT');
      console.log('[CHART-HISTORICAL] Is futures contract:', isFuture);

      // Build Fyers API URL with correct parameters
      // IMPORTANT: Endpoint is /data/history (not /api/v3/history)
      const baseUrl = 'https://api-t1.fyers.in/data';
      const params = new URLSearchParams();
      params.append('symbol', brokerSymbol);
      params.append('resolution', fyersResolution);
      params.append('date_format', '1'); // 1 = yyyy-mm-dd format

      // Set date range
      if (from) {
        params.append('range_from', from);
      }

      // For range_to: subtract 1 day to avoid partial candles (per Fyers docs)
      if (to) {
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() - 1);
        const adjustedTo = toDate.toISOString().split('T')[0];
        params.append('range_to', adjustedTo);
        console.log('[CHART-HISTORICAL] Adjusted range_to:', to, '→', adjustedTo, '(to avoid partial candles)');
      }

      // Add cont_flag=1 for futures/continuous data
      if (isFuture) {
        params.append('cont_flag', '1');
      }

      const url = `${baseUrl}/history?${params.toString()}`;
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
        console.error('[CHART-HISTORICAL] Fyers API error (status', response.status + '):', errorText);
        return NextResponse.json(
          { error: 'Fyers API error: ' + response.status + ' - ' + errorText },
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
        console.log('[CHART-HISTORICAL] Fyers returned', chartData.length, 'candles');
      } else {
        console.error('[CHART-HISTORICAL] Fyers API response:', JSON.stringify(data));
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

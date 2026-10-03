/**
 * GET /api/options/spot-history
 * Fetch historical spot prices for IV calculation
 *
 * Query params:
 * - symbol: Index symbol (NIFTY50, BANKNIFTY, etc.)
 * - days: Number of days to fetch (default: 200)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { detectUserBroker } from '@/lib/brokerDetection';
import { decryptData } from '@/lib/encryptionUtils';
import { adminAuth } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
  try {
    // Extract authorization token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Get symbol from query params
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol') || 'NIFTY50';
    const days = parseInt(searchParams.get('days') || '200');

    // Detect broker
    const brokerDetection = await detectUserBroker(userId);
    if (!brokerDetection.isConfigured) {
      return NextResponse.json({ error: 'No broker configured' }, { status: 401 });
    }

    const broker = brokerDetection.broker as 'zerodha' | 'fyers';

    if (broker !== 'fyers') {
      return NextResponse.json(
        { error: 'Only Fyers broker is supported' },
        { status: 501 }
      );
    }

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({ error: 'Fyers not configured' }, { status: 404 });
    }

    const accessToken = decryptData(configData.accessToken);
    const apiKey = decryptData(configData.apiKey);

    // Map symbol to Fyers format
    const symbolMap: { [key: string]: string } = {
      NIFTY50: 'NSE:NIFTY50-INDEX',
      BANKNIFTY: 'NSE:NIFTYBANK-INDEX',
      FINNIFTY: 'NSE:FINNIFTY-INDEX',
      MIDCPNIFTY: 'NSE:MIDCPNIFTY-INDEX',
    };

    const fyersSymbol = symbolMap[symbol] || `NSE:${symbol}-INDEX`;

    // Calculate date range
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - days);

    const from = fromDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const to = toDate.toISOString().split('T')[0];

    console.log(
      `[SPOT-HISTORY] Fetching ${days} days of history for ${symbol} (${fyersSymbol})`
    );

    // Fetch historical data from Fyers
    const url = 'https://api-t1.fyers.in/data/history';
    const params = new URLSearchParams({
      symbol: fyersSymbol,
      resolution: 'D', // Daily candles
      date_format: '1', // yyyy-mm-dd format
      range_from: from,
      range_to: to,
    });

    const fullUrl = `${url}?${params.toString()}`;
    console.log(`[SPOT-HISTORY] Fyers URL: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `${apiKey}:${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[SPOT-HISTORY] Fyers API error (${response.status}):`,
        errorText
      );
      return NextResponse.json(
        { error: 'Failed to fetch historical data from broker' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check response status
    if (data.s !== 'ok') {
      console.error(
        `[SPOT-HISTORY] Fyers returned status: ${data.s}`,
        data.message || ''
      );
      return NextResponse.json(
        { error: data.message || 'Failed to fetch historical data' },
        { status: 400 }
      );
    }

    // Extract candles
    const candles = data.candles || data.d || [];

    if (!candles || candles.length === 0) {
      console.warn(`[SPOT-HISTORY] No candles returned for ${fyersSymbol}`);
      return NextResponse.json(
        { error: 'No historical data available' },
        { status: 404 }
      );
    }

    // Transform to simple format: { date, close }
    // Fyers format: [timestamp, open, high, low, close, volume]
    const history = candles.map((candle: any[]) => {
      let timestamp = candle[0];

      // Convert milliseconds to seconds if needed
      if (timestamp > 100000000000) {
        timestamp = Math.floor(timestamp / 1000);
      }

      return {
        timestamp: timestamp,
        date: new Date(timestamp * 1000).toISOString().split('T')[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5] || 0,
      };
    });

    // Extract just closing prices for HV calculation
    const closingPrices = history.map((h: any) => h.close);

    console.log(
      `[SPOT-HISTORY] Retrieved ${history.length} days of data, price range: ${Math.min(...closingPrices).toFixed(2)} - ${Math.max(...closingPrices).toFixed(2)}`
    );

    return NextResponse.json({
      success: true,
      symbol: symbol,
      fyersSymbol: fyersSymbol,
      days: history.length,
      from,
      to,
      history,
      closingPrices,
      latestClose: closingPrices[closingPrices.length - 1],
    });
  } catch (error: any) {
    console.error('[SPOT-HISTORY] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}

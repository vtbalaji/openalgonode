/**
 * GET /api/options/spot
 * Fetch real-time spot price for an index
 *
 * Query params:
 * - symbol: Index symbol (NIFTY50, NIFTYBANK, FINNIFTY, MIDCPNIFTY)
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
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
    }

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
      NIFTYBANK: 'NSE:NIFTYBANK-INDEX',
      FINNIFTY: 'NSE:FINNIFTY-INDEX',
      MIDCPNIFTY: 'NSE:MIDCPNIFTY-INDEX',
    };

    const fyersSymbol = symbolMap[symbol] || `NSE:${symbol}-INDEX`;
    console.log(
      `[OPTIONS-SPOT] Fetching spot price for symbol: ${symbol} -> Fyers: ${fyersSymbol}`
    );

    // Fetch quote from Fyers API
    const url = 'https://api-t1.fyers.in/data/quotes';
    const params = new URLSearchParams({
      symbols: fyersSymbol,
    });

    const fullUrl = `${url}?${params.toString()}`;
    console.log(`[OPTIONS-SPOT] Fyers URL: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `${apiKey}:${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[OPTIONS-SPOT] Fyers API error (${response.status}):`,
        errorText
      );
      return NextResponse.json(
        { error: 'Failed to fetch spot price from broker' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check response status
    if (data.s !== 'ok') {
      console.error(
        `[OPTIONS-SPOT] Fyers returned status: ${data.s}`,
        data.message || ''
      );
      return NextResponse.json(
        { error: data.message || 'Failed to fetch spot price' },
        { status: 400 }
      );
    }

    // Extract price from quotes
    if (data.d && Array.isArray(data.d) && data.d.length > 0) {
      const quote = data.d[0];
      if (quote && quote.v && typeof quote.v.lp === 'number') {
        const spotPrice = quote.v.lp;
        console.log(`[OPTIONS-SPOT] Spot price for ${fyersSymbol}: ${spotPrice}`);

        return NextResponse.json({
          success: true,
          symbol: symbol,
          fyersSymbol: fyersSymbol,
          price: spotPrice,
          open: quote.v.open_price || 0,
          high: quote.v.high_price || 0,
          low: quote.v.low_price || 0,
          close: quote.v.prev_close_price || 0,
          change: quote.v.ch || 0,
          changePercent: quote.v.chp || 0,
        });
      }
    }

    console.warn(`[OPTIONS-SPOT] Could not extract spot price from response`);
    return NextResponse.json(
      { error: 'No spot price data available' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('[OPTIONS-SPOT] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch spot price' },
      { status: 500 }
    );
  }
}

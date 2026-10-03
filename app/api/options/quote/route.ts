/**
 * GET /api/options/quote
 * Fetch real-time quote (LTP) for an option symbol
 *
 * Query params:
 * - symbol: Option symbol (e.g., NIFTY26FEB23500CE)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { detectUserBroker } from '@/lib/brokerDetection';
import { decryptData } from '@/lib/encryptionUtils';
import { adminAuth } from '@/lib/firebaseAdmin';
import { convertToBrokerSymbol } from '@/lib/symbolMapping';

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
        { error: 'Only Fyers broker is supported for options' },
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

    // Convert symbol to Fyers format (adds NSE: prefix for options)
    const fyersSymbol = convertToBrokerSymbol(symbol, 'fyers');
    console.log(
      `[OPTIONS-QUOTE] Fetching quote for symbol: ${symbol} -> Fyers: ${fyersSymbol}`
    );

    // Fetch quote from Fyers API
    const url = 'https://api-t1.fyers.in/data/quotes';
    const params = new URLSearchParams({
      symbols: fyersSymbol,
    });

    const fullUrl = `${url}?${params.toString()}`;
    console.log(`[OPTIONS-QUOTE] Fyers URL: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `${apiKey}:${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[OPTIONS-QUOTE] Fyers API error (${response.status}):`,
        errorText
      );
      return NextResponse.json(
        { error: 'Failed to fetch quote from broker' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check response status
    if (data.s !== 'ok') {
      console.error(
        `[OPTIONS-QUOTE] Fyers returned status: ${data.s}`,
        data.message || ''
      );
      return NextResponse.json(
        { error: data.message || 'Failed to fetch quote' },
        { status: 400 }
      );
    }

    // Extract price from quotes
    // Fyers returns array of quotes
    if (data.d && Array.isArray(data.d) && data.d.length > 0) {
      const quote = data.d[0];
      if (quote && quote.v) {
        const priceData = {
          symbol: symbol,
          fyersSymbol: fyersSymbol,
          price: quote.v.lp || 0, // Last Price
          open: quote.v.open_price || 0,
          high: quote.v.high_price || 0,
          low: quote.v.low_price || 0,
          close: quote.v.prev_close_price || 0,
          volume: quote.v.volume || 0,
          bid: quote.v.bid_price || 0,
          ask: quote.v.ask_price || 0,
          change: quote.v.ch || 0,
          changePercent: quote.v.chp || 0,
        };

        console.log(`[OPTIONS-QUOTE] Quote for ${fyersSymbol}:`, {
          ltp: priceData.price,
          bid: priceData.bid,
          ask: priceData.ask,
        });

        return NextResponse.json({
          success: true,
          data: priceData,
          price: priceData.price, // Shortcut for easy access
        });
      }
    }

    console.warn(`[OPTIONS-QUOTE] Could not extract price from response`);
    return NextResponse.json(
      { error: 'No price data available for this symbol' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('[OPTIONS-QUOTE] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}

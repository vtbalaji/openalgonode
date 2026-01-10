/**
 * GET /api/options/quotes
 * Fetch current CE + PE option prices and store as historical data
 * Returns combined straddle premium for last 1-3 days
 *
 * Query params:
 * - symbol: Base symbol (NIFTY)
 * - expiry: Option expiry (e.g., 13JAN, 29JAN)
 * - strike: Strike price (optional, auto-detects if not provided)
 * - userId: User ID for authentication
 * - spotPrice: Current spot price for auto-strike detection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { detectUserBroker } from '@/lib/brokerDetection';
import { decryptData } from '@/lib/encryptionUtils';
import { convertToBrokerSymbol } from '@/lib/symbolMapping';
import { getFyersUserProfile } from '@/lib/fyersClient';

// In-memory cache for option prices (time-based)
// In production, this would be in a database
const priceCache: Map<string, Array<{ time: number; ce: number; pe: number; ceVol: number; peVol: number }>> =
  new Map();

/**
 * Calculate ATM strike from spot price
 */
function calculateATMStrike(spotPrice: number): number {
  return Math.round(spotPrice / 100) * 100;
}

/**
 * Get cache key for a straddle
 */
function getCacheKey(symbol: string, expiry: string, strike: number): string {
  return `${symbol}${expiry}${strike}`;
}

/**
 * Fetch current option prices from Fyers API
 */
async function fetchFyersOptionPrices(
  ceSymbol: string,
  peSymbol: string,
  accessToken: string,
  appId: string
): Promise<{ ce: number; ceVol: number; pe: number; peVol: number } | null> {
  try {
    // Fyers quotes endpoint
    const response = await fetch('https://api-t1.fyers.in/api/v3/quotes/', {
      method: 'POST',
      headers: {
        'Authorization': `${appId}:${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbols: [`${ceSymbol},${peSymbol}`],
      }),
    });

    if (!response.ok) {
      console.error('[OPTIONS-QUOTES] Fyers API error:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[OPTIONS-QUOTES] Fyers quotes response:', data);

    if (data.s !== 'ok' || !data.d) {
      console.error('[OPTIONS-QUOTES] Invalid response from Fyers');
      return null;
    }

    // Parse quotes
    const quotes = data.d;
    const ceQuote = quotes[ceSymbol];
    const peQuote = quotes[peSymbol];

    if (!ceQuote || !peQuote) {
      console.error('[OPTIONS-QUOTES] Missing CE or PE quote');
      return null;
    }

    return {
      ce: ceQuote.ltp || ceQuote.close || 0,
      ceVol: ceQuote.volume || 0,
      pe: peQuote.ltp || peQuote.close || 0,
      peVol: peQuote.volume || 0,
    };
  } catch (error: any) {
    console.error('[OPTIONS-QUOTES] Error fetching Fyers quotes:', error.message);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const baseSymbol = searchParams.get('symbol') || 'NIFTY';
    const expiry = searchParams.get('expiry') || '13JAN';
    const strikeParam = searchParams.get('strike');
    const userId = searchParams.get('userId');
    const spotPrice = parseFloat(searchParams.get('spotPrice') || '0');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Auto-detect ATM strike if not provided
    let strike = strikeParam ? parseInt(strikeParam) : null;
    if (!strike && spotPrice > 0) {
      strike = calculateATMStrike(spotPrice);
      console.log(`[OPTIONS-QUOTES] Auto-detected ATM strike: ${strike}`);
    } else if (!strike) {
      return NextResponse.json(
        { error: 'Strike price required or spotPrice needed for auto-detection' },
        { status: 400 }
      );
    }

    // Build option symbols
    const ceSymbol = `${baseSymbol}${expiry}${strike}CE`;
    const peSymbol = `${baseSymbol}${expiry}${strike}PE`;
    const cacheKey = getCacheKey(baseSymbol, expiry, strike);

    console.log(`[OPTIONS-QUOTES] Fetching ${ceSymbol} and ${peSymbol}`);

    // Detect broker
    const brokerDetection = await detectUserBroker(userId);
    if (!brokerDetection.isConfigured) {
      return NextResponse.json({ error: 'No broker configured' }, { status: 401 });
    }

    const broker = brokerDetection.broker as 'zerodha' | 'fyers';

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, broker);
    if (!configData) {
      return NextResponse.json({ error: 'Broker not configured' }, { status: 404 });
    }

    const accessToken = decryptData(configData.accessToken);
    const apiKey = decryptData(configData.apiKey);

    let priceData: { ce: number; ceVol: number; pe: number; peVol: number } | null = null;

    if (broker === 'fyers') {
      // Fetch from Fyers
      const fyersSymbolCE = convertToBrokerSymbol(ceSymbol, 'fyers');
      const fyersSymbolPE = convertToBrokerSymbol(peSymbol, 'fyers');

      priceData = await fetchFyersOptionPrices(fyersSymbolCE, fyersSymbolPE, accessToken, apiKey);

      if (!priceData) {
        return NextResponse.json(
          {
            error: 'Could not fetch option prices. Verify symbols and broker connection.',
            debug: {
              ceSymbol: fyersSymbolCE,
              peSymbol: fyersSymbolPE,
              broker,
            },
          },
          { status: 404 }
        );
      }
    } else {
      // Zerodha - TODO: implement when needed
      return NextResponse.json({ error: 'Zerodha quotes not yet implemented' }, { status: 501 });
    }

    // Store in cache with timestamp
    const now = Math.floor(Date.now() / 1000);
    if (!priceCache.has(cacheKey)) {
      priceCache.set(cacheKey, []);
    }

    const cache = priceCache.get(cacheKey)!;

    // Check if we already have a price for this minute
    const lastEntry = cache[cache.length - 1];
    const minuteAgo = now - 60;

    if (!lastEntry || lastEntry.time < minuteAgo) {
      // Add new price point
      cache.push({
        time: now,
        ce: priceData.ce,
        pe: priceData.pe,
        ceVol: priceData.ceVol,
        peVol: priceData.peVol,
      });

      // Keep only last 3 days of data (3 * 24 * 60 = 4320 minutes)
      const threeDaysAgo = now - 3 * 24 * 60 * 60;
      while (cache.length > 0 && cache[0].time < threeDaysAgo) {
        cache.shift();
      }

      console.log(`[OPTIONS-QUOTES] Cached ${cache.length} price points for ${cacheKey}`);
    }

    // Return cached data for last 1-3 days
    const chartData = cache.map((entry) => ({
      time: entry.time,
      cePrice: entry.ce,
      pePrice: entry.pe,
      straddlePremium: entry.ce + entry.pe,
      ceVolume: entry.ceVol,
      peVolume: entry.peVol,
      totalVolume: entry.ceVol + entry.peVol,
    }));

    // Calculate price range
    const premiums = chartData.map((c) => c.straddlePremium);
    const priceRange = {
      min: Math.min(...premiums),
      max: Math.max(...premiums),
      latest: chartData[chartData.length - 1]?.straddlePremium || 0,
    };

    return NextResponse.json({
      success: true,
      baseSymbol,
      expiry,
      strike,
      ceSymbol,
      peSymbol,
      broker,
      interval: '1minute',
      data: chartData,
      count: chartData.length,
      lastUpdated: new Date().toISOString(),
      priceRange,
      currentPrices: {
        ce: priceData.ce,
        pe: priceData.pe,
        straddle: priceData.ce + priceData.pe,
      },
    });
  } catch (error: any) {
    console.error('[OPTIONS-QUOTES] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch option quotes' },
      { status: 500 }
    );
  }
}

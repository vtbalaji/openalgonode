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
 * Convert text expiry format to Fyers numeric format
 * Format: {YY}{M}{dd} where M is single digit (1-9, O, N, D)
 * Examples:
 * - "13JAN" → "26113" (Jan 13, 2026)
 * - "16FEB" → "26216" (Feb 16, 2026)
 * - "23OCT" → "26O23" (Oct 23, 2026)
 * - "10NOV" → "26N10" (Nov 10, 2026)
 * - "25DEC" → "26D25" (Dec 25, 2026)
 */
function convertExpiryToNumeric(textExpiry: string): string {
  const monthMap: { [key: string]: string } = {
    'JAN': '1', 'FEB': '2', 'MAR': '3', 'APR': '4',
    'MAY': '5', 'JUN': '6', 'JUL': '7', 'AUG': '8',
    'SEP': '9', 'OCT': 'O', 'NOV': 'N', 'DEC': 'D'
  };

  // Extract day and month from format like "13JAN"
  const match = textExpiry.match(/^(\d{1,2})([A-Z]{3})$/);
  if (!match) {
    console.warn(`[OPTIONS-QUOTES] Could not parse expiry: ${textExpiry}`);
    return textExpiry; // Return as-is if can't parse
  }

  const day = match[1].padStart(2, '0');
  const month = monthMap[match[2]];

  if (!month) {
    console.warn(`[OPTIONS-QUOTES] Unknown month in expiry: ${textExpiry}`);
    return textExpiry;
  }

  // Current year (2026)
  const year = '26';
  return `${year}${month}${day}`;
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
    // Use /data/history/ endpoint with 1-minute resolution for latest price
    // Try today first, then yesterday if no data
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    console.log(`[OPTIONS-QUOTES] Attempting to fetch option data for dates: ${todayStr}, ${yesterdayStr}`);

    // Try today's data first
    let ceResponse = await fetch(
      `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent(ceSymbol)}&resolution=1&date_format=1&range_from=${todayStr}&range_to=${todayStr}`,
      {
        headers: {
          'Authorization': `${appId}:${accessToken}`,
        },
      }
    );

    let peResponse = await fetch(
      `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent(peSymbol)}&resolution=1&date_format=1&range_from=${todayStr}&range_to=${todayStr}`,
      {
        headers: {
          'Authorization': `${appId}:${accessToken}`,
        },
      }
    );

    let ceData = await ceResponse.json();
    let peData = await peResponse.json();

    console.log('[OPTIONS-QUOTES] Fyers CE response (today):', { s: ceData.s, count: ceData.candles?.length || ceData.d?.length || 0 });
    console.log('[OPTIONS-QUOTES] Fyers PE response (today):', { s: peData.s, count: peData.candles?.length || peData.d?.length || 0 });

    // If today has no data, try yesterday
    if (ceData.s === 'no_data' || !ceData.d || ceData.d.length === 0 ||
        peData.s === 'no_data' || !peData.d || peData.d.length === 0) {

      console.log('[OPTIONS-QUOTES] No data for today, trying yesterday...');

      ceResponse = await fetch(
        `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent(ceSymbol)}&resolution=1&date_format=1&range_from=${yesterdayStr}&range_to=${yesterdayStr}`,
        {
          headers: {
            'Authorization': `${appId}:${accessToken}`,
          },
        }
      );

      peResponse = await fetch(
        `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent(peSymbol)}&resolution=1&date_format=1&range_from=${yesterdayStr}&range_to=${yesterdayStr}`,
        {
          headers: {
            'Authorization': `${appId}:${accessToken}`,
          },
        }
      );

      ceData = await ceResponse.json();
      peData = await peResponse.json();

      console.log('[OPTIONS-QUOTES] Fyers CE response (yesterday):', { s: ceData.s, count: ceData.candles?.length || ceData.d?.length || 0 });
      console.log('[OPTIONS-QUOTES] Fyers PE response (yesterday):', { s: peData.s, count: peData.candles?.length || peData.d?.length || 0 });
    }

    if (!ceResponse.ok || !peResponse.ok) {
      const ceErr = await ceResponse.text();
      const peErr = await peResponse.text();
      console.error('[OPTIONS-QUOTES] Fyers history error - CE:', ceResponse.status, ceErr);
      console.error('[OPTIONS-QUOTES] Fyers history error - PE:', peResponse.status, peErr);
      return null;
    }

    if (ceData.s !== 'ok' || peData.s !== 'ok') {
      console.error('[OPTIONS-QUOTES] Invalid response status from Fyers:', { ce: ceData.s, pe: peData.s });
      return null;
    }

    // Get the latest candle for each - Fyers returns data in either 'd' or 'candles' field
    const ceCandles = ceData.d || ceData.candles;
    const peCandles = peData.d || peData.candles;

    if (!ceCandles || ceCandles.length === 0 || !peCandles || peCandles.length === 0) {
      console.error('[OPTIONS-QUOTES] No candle data returned', {
        ceCount: ceCandles?.length || 0,
        peCount: peCandles?.length || 0
      });
      return null;
    }

    const ceLatest = ceCandles[ceCandles.length - 1]; // Latest candle
    const peLatest = peCandles[peCandles.length - 1];

    console.log('[OPTIONS-QUOTES] Latest CE candle:', ceLatest);
    console.log('[OPTIONS-QUOTES] Latest PE candle:', peLatest);

    // Extract price from available fields (OHLC array or individual fields)
    const cePrice = Array.isArray(ceLatest) ? ceLatest[3] : (ceLatest.close || ceLatest.c || ceLatest.ltp || 0);
    const pePrice = Array.isArray(peLatest) ? peLatest[3] : (peLatest.close || peLatest.c || peLatest.ltp || 0);
    const ceVol = Array.isArray(ceLatest) ? ceLatest[4] : (ceLatest.volume || ceLatest.v || 0);
    const peVol = Array.isArray(peLatest) ? peLatest[4] : (peLatest.volume || peLatest.v || 0);

    console.log('[OPTIONS-QUOTES] Extracted prices - CE:', cePrice, 'PE:', pePrice, 'Volumes - CE:', ceVol, 'PE:', peVol);

    return {
      ce: cePrice,
      ceVol: ceVol,
      pe: pePrice,
      peVol: peVol,
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

    // Build option symbols - convert expiry to numeric format for Fyers
    const numericExpiry = convertExpiryToNumeric(expiry);
    const ceSymbol = `${baseSymbol}${numericExpiry}${strike}CE`;
    const peSymbol = `${baseSymbol}${numericExpiry}${strike}PE`;
    const cacheKey = getCacheKey(baseSymbol, expiry, strike);

    console.log(`[OPTIONS-QUOTES] Fetching ${ceSymbol} and ${peSymbol} (expiry: ${expiry} → ${numericExpiry})`);

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

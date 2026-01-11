/**
 * GET /api/options/historical
 * Fetch historical OHLC data for option contracts (CE + PE)
 * Returns data for a specific date range and interval
 *
 * Query params:
 * - symbol: Base symbol (NIFTY, BANKNIFTY)
 * - expiry: Option expiry (e.g., 13JAN, 29JAN)
 * - strike: Strike price (optional, auto-detects from spotPrice if not provided)
 * - spotPrice: Current spot price for auto-strike detection
 * - userId: User ID for authentication
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - interval: 1, 3, 5, 15, 30, 60, or D (default: 5 for 5-minute)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { detectUserBroker } from '@/lib/brokerDetection';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * Convert text expiry format to Fyers symbol format
 * Supports both weekly and monthly expiries:
 * - Weekly: {YY}{M}{dd} where M is single digit (1-9, O, N, D)
 *   Examples: "13JAN" → "26113", "30JAN" → "26130"
 * - Monthly: {YY}{MMM} where MMM is full month name
 *   Examples: "JAN" → "26JAN", "OCT" → "26OCT"
 */
function convertExpiryToNumeric(textExpiry: string): string {
  const monthMap: { [key: string]: string } = {
    'JAN': '1', 'FEB': '2', 'MAR': '3', 'APR': '4',
    'MAY': '5', 'JUN': '6', 'JUL': '7', 'AUG': '8',
    'SEP': '9', 'OCT': 'O', 'NOV': 'N', 'DEC': 'D'
  };

  const year = '26'; // 2026

  // Try weekly format first: "13JAN" (day + month)
  const weeklyMatch = textExpiry.match(/^(\d{1,2})([A-Z]{3})$/);
  if (weeklyMatch) {
    const day = weeklyMatch[1].padStart(2, '0');
    const month = monthMap[weeklyMatch[2]];

    if (month) {
      const result = `${year}${month}${day}`;
      console.log(`[OPTIONS-HISTORICAL] Converted weekly expiry "${textExpiry}" → "${result}"`);
      return result;
    }
  }

  // Try monthly format: "JAN" (month only) - use month abbreviation
  const monthlyMatch = textExpiry.match(/^([A-Z]{3})$/);
  if (monthlyMatch) {
    const monthName = monthlyMatch[1];
    if (monthMap[monthName]) {
      const result = `${year}${monthName}`;
      console.log(`[OPTIONS-HISTORICAL] Converted monthly expiry "${textExpiry}" → "${result}"`);
      return result;
    }
  }

  console.warn(`[OPTIONS-HISTORICAL] Could not parse expiry: ${textExpiry}`);
  return textExpiry;
}

/**
 * Calculate ATM strike from spot price
 */
function calculateATMStrike(spotPrice: number): number {
  return Math.round(spotPrice / 100) * 100;
}

/**
 * Fetch current spot price from Fyers API
 */
async function fetchSpotPrice(
  baseSymbol: string,
  accessToken: string,
  apiKey: string
): Promise<number | null> {
  try {
    // For NIFTY, use NIFTY50 spot index
    // For BANKNIFTY, use NIFTY BANK spot index
    const spotSymbol =
      baseSymbol === 'NIFTY' ? 'NSE:NIFTY50-INDEX' : 'NSE:NIFTYBANK-INDEX';

    const url = 'https://api-t1.fyers.in/data/quotes';
    const params = new URLSearchParams({
      symbols: spotSymbol,
    });

    const fullUrl = `${url}?${params.toString()}`;
    console.log(`[OPTIONS-HISTORICAL] Fetching spot price for ${spotSymbol}`);

    const response = await fetch(fullUrl, {
      headers: {
        'Authorization': `${apiKey}:${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(
        `[OPTIONS-HISTORICAL] Spot price fetch failed (${response.status})`
      );
      return null;
    }

    const data = await response.json();

    // Check response status
    if (data.s !== 'ok') {
      console.error(
        `[OPTIONS-HISTORICAL] Spot price API returned: ${data.s}`,
        data.message || ''
      );
      return null;
    }

    // Extract spot price from quotes
    // Fyers returns array of quotes
    if (data.d && Array.isArray(data.d) && data.d.length > 0) {
      const quote = data.d[0];
      if (quote && quote.v && typeof quote.v.lp === 'number') {
        const spotPrice = quote.v.lp;
        console.log(
          `[OPTIONS-HISTORICAL] Got spot price for ${spotSymbol}: ${spotPrice}`
        );
        return spotPrice;
      }
    }

    console.warn(`[OPTIONS-HISTORICAL] Could not extract spot price from response`);
    return null;
  } catch (error: any) {
    console.error(
      `[OPTIONS-HISTORICAL] Error fetching spot price:`,
      error.message
    );
    return null;
  }
}

/**
 * Parse expiry string and calculate date and days to expiry
 */
function parseExpiryDate(expiryStr: string): {
  date: Date;
  daysToExpiry: number;
} {
  const monthMap: { [key: string]: number } = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };

  // Try weekly format: "13JAN"
  const weeklyMatch = expiryStr.match(/^(\d{1,2})([A-Z]{3})$/);
  if (weeklyMatch) {
    const day = parseInt(weeklyMatch[1]);
    const month = monthMap[weeklyMatch[2]];

    if (month !== undefined) {
      // Create date object for expiry (market closes at 3:30 PM IST)
      const expiryDate = new Date(2026, month, day, 15, 30, 0);

      // Calculate days to expiry
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysToExp = Math.ceil(
        (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log(
        `[OPTIONS-HISTORICAL] Parsed weekly expiry "${expiryStr}" → ${expiryDate.toISOString()}, DTE: ${daysToExp}`
      );

      return { date: expiryDate, daysToExpiry: Math.max(0, daysToExp) };
    }
  }

  // Try monthly format: "JAN"
  const monthlyMatch = expiryStr.match(/^([A-Z]{3})$/);
  if (monthlyMatch) {
    const monthName = monthlyMatch[1];
    const month = monthMap[monthName];

    if (month !== undefined) {
      // For monthly, use last day of month
      const expiryDate = new Date(2026, month + 1, 0, 15, 30, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysToExp = Math.ceil(
        (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log(
        `[OPTIONS-HISTORICAL] Parsed monthly expiry "${expiryStr}" → ${expiryDate.toISOString()}, DTE: ${daysToExp}`
      );

      return { date: expiryDate, daysToExpiry: Math.max(0, daysToExp) };
    }
  }

  // Fallback: return today + 0 DTE
  console.warn(`[OPTIONS-HISTORICAL] Could not parse expiry: ${expiryStr}`);
  return { date: new Date(), daysToExpiry: 0 };
}

/**
 * Fetch historical option data from Fyers API
 */
async function fetchFyersOptionHistory(
  symbol: string,
  accessToken: string,
  appId: string,
  from: string,
  to: string,
  interval: string
): Promise<any[] | null> {
  try {
    console.log(`[OPTIONS-HISTORICAL] Fetching ${symbol} from ${from} to ${to}, interval: ${interval}`);

    // Convert interval to Fyers format (D for day, otherwise just the number)
    let fyersInterval = interval;
    if (interval === 'day' || interval === '1D') {
      fyersInterval = 'D';
    } else if (interval.includes('minute')) {
      fyersInterval = interval.replace('minute', '');
    }

    const url = 'https://api-t1.fyers.in/data/history';
    const params = new URLSearchParams({
      symbol: symbol,
      resolution: fyersInterval,
      date_format: '1', // yyyy-mm-dd format
      range_from: from,
      range_to: to,
    });

    const fullUrl = `${url}?${params.toString()}`;
    console.log(`[OPTIONS-HISTORICAL] Fyers URL: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      headers: {
        'Authorization': `${appId}:${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OPTIONS-HISTORICAL] Fyers API error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();

    if (data.s !== 'ok') {
      console.error(`[OPTIONS-HISTORICAL] Fyers returned status: ${data.s}`, data.message || '');
      return null;
    }

    // Fyers returns data in 'candles' or 'd' field as array of [time, open, high, low, close, volume]
    const candles = data.candles || data.d || [];

    if (!candles || candles.length === 0) {
      console.warn(`[OPTIONS-HISTORICAL] No candles returned for ${symbol}`);
      return null;
    }

    // Transform to standard format
    // Fyers returns timestamps in milliseconds (Unix timestamp)
    // Convert to seconds for lightweight-charts (which expects Unix timestamp in seconds)
    // Note: Timestamps are timezone-agnostic; IST display is handled by chart's timeFormatter
    const transformed = candles.map((candle: any[]) => {
      // Fyers timestamp can be in milliseconds or seconds, handle both
      let timestamp = candle[0];

      // If timestamp is very large (> 10^11), it's in milliseconds, convert to seconds
      if (timestamp > 100000000000) {
        timestamp = Math.floor(timestamp / 1000);
      }

      return {
        time: timestamp,
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5] || 0,
      };
    });

    console.log(`[OPTIONS-HISTORICAL] Got ${transformed.length} candles for ${symbol}`);
    return transformed;
  } catch (error: any) {
    console.error(`[OPTIONS-HISTORICAL] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const baseSymbol = searchParams.get('symbol') || 'NIFTY';
    const expiry = searchParams.get('expiry') || '13JAN';
    const strikeParam = searchParams.get('strike');
    const spotPrice = parseFloat(searchParams.get('spotPrice') || '0');
    const userId = searchParams.get('userId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const interval = searchParams.get('interval') || '5';

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Missing date range (from, to)' },
        { status: 400 }
      );
    }

    // Auto-detect ATM strike if not provided
    let strike = strikeParam ? parseInt(strikeParam) : null;
    if (!strike && spotPrice > 0) {
      strike = calculateATMStrike(spotPrice);
      console.log(`[OPTIONS-HISTORICAL] Auto-detected ATM strike: ${strike}`);
    } else if (!strike) {
      return NextResponse.json(
        { error: 'Strike price required or spotPrice needed for auto-detection' },
        { status: 400 }
      );
    }

    // Build option symbols with numeric expiry
    const numericExpiry = convertExpiryToNumeric(expiry);
    const ceSymbol = `NSE:${baseSymbol}${numericExpiry}${strike}CE`;
    const peSymbol = `NSE:${baseSymbol}${numericExpiry}${strike}PE`;

    console.log(`[OPTIONS-HISTORICAL] Raw expiry input: "${expiry}"`);
    console.log(`[OPTIONS-HISTORICAL] Converted numeric expiry: "${numericExpiry}"`);
    console.log(`[OPTIONS-HISTORICAL] Base symbol: ${baseSymbol}`);
    console.log(`[OPTIONS-HISTORICAL] Strike: ${strike}`);
    console.log(`[OPTIONS-HISTORICAL] CE Symbol: ${ceSymbol}`);
    console.log(`[OPTIONS-HISTORICAL] PE Symbol: ${peSymbol}`);

    // Detect broker
    const brokerDetection = await detectUserBroker(userId);
    if (!brokerDetection.isConfigured) {
      return NextResponse.json({ error: 'No broker configured' }, { status: 401 });
    }

    const broker = brokerDetection.broker as 'zerodha' | 'fyers';

    if (broker !== 'fyers') {
      return NextResponse.json({ error: 'Only Fyers broker is supported for options' }, { status: 501 });
    }

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({ error: 'Fyers not configured' }, { status: 404 });
    }

    const accessToken = decryptData(configData.accessToken);
    const apiKey = decryptData(configData.apiKey);

    // Parse expiry to get date and days to expiry
    const { date: expiryDate, daysToExpiry } = parseExpiryDate(expiry);

    // Fetch spot price, CE data, and PE data in parallel
    const [spotPriceValue, ceData, peData] = await Promise.all([
      fetchSpotPrice(baseSymbol, accessToken, apiKey),
      fetchFyersOptionHistory(ceSymbol, accessToken, apiKey, from, to, interval),
      fetchFyersOptionHistory(peSymbol, accessToken, apiKey, from, to, interval),
    ]);

    if (!ceData || !peData) {
      console.error('[OPTIONS-HISTORICAL] Data validation failed:', {
        ceData: ceData ? `${ceData.length} candles` : 'null',
        peData: peData ? `${peData.length} candles` : 'null',
        ceSymbol,
        peSymbol,
      });

      return NextResponse.json(
        {
          error: `Failed to fetch option data. CE: ${ceData ? 'OK' : 'FAIL'}, PE: ${peData ? 'OK' : 'FAIL'}`,
          debug: {
            symbol: baseSymbol,
            expiry,
            strike,
            ceSymbol,
            peSymbol,
            ceLength: ceData ? ceData.length : 0,
            peLength: peData ? peData.length : 0,
          },
        },
        { status: 404 }
      );
    }

    // Combine CE and PE data by matching timestamps (not by index)
    const combinedData: any[] = [];

    // Create a map of PE data by timestamp for fast lookup
    const peMap = new Map();
    peData.forEach((pe) => {
      peMap.set(pe.time, pe);
    });

    // Iterate through CE data and match with PE data by timestamp
    ceData.forEach((ce) => {
      const pe = peMap.get(ce.time);

      // Only include if both CE and PE have data for this timestamp
      if (pe) {
        combinedData.push({
          time: ce.time,
          open: ce.open + pe.open,
          high: ce.high + pe.high,
          low: ce.low + pe.low,
          close: ce.close + pe.close,
          volume: ce.volume + pe.volume,
          // Also include individual prices for reference
          cePrice: ce.close,
          pePrice: pe.close,
          ceVolume: ce.volume,
          peVolume: pe.volume,
        });
      }
    });

    console.log(`[OPTIONS-HISTORICAL] Combined ${combinedData.length} matching candles (CE: ${ceData.length}, PE: ${peData.length})`);

    return NextResponse.json({
      success: true,
      symbol: baseSymbol,
      expiry,
      strike,
      ceSymbol,
      peSymbol,
      interval,
      dateRange: { from, to },
      spotPrice: spotPriceValue,
      expiryDate: expiryDate.toISOString(),
      daysToExpiry,
      data: combinedData,
      count: combinedData.length,
      priceRange: combinedData.length > 0 ? {
        min: Math.min(...combinedData.map(c => c.close)),
        max: Math.max(...combinedData.map(c => c.close)),
        latest: combinedData[combinedData.length - 1].close,
      } : null,
    });
  } catch (error: any) {
    console.error('[OPTIONS-HISTORICAL] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch option history' },
      { status: 500 }
    );
  }
}

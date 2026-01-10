/**
 * GET /api/options/straddle
 * Fetch and combine CE + PE prices for ATM straddle
 *
 * Query params:
 * - symbol: Base symbol (NIFTY)
 * - expiry: Option expiry (e.g., 13JAN, 29JAN)
 * - strike: Strike price (optional, auto-detects if not provided)
 * - interval: 5minute (default), minute, 15minute, 60minute, day
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - userId: User ID for authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { detectUserBroker } from '@/lib/brokerDetection';
import { decryptData } from '@/lib/encryptionUtils';
import { convertToBrokerSymbol } from '@/lib/symbolMapping';

interface StraddleCandle {
  time: number;
  straddlePremium: number; // CE close + PE close
  cePrice: number;
  pePrice: number;
  ceVolume: number;
  peVolume: number;
  totalVolume: number; // CE volume + PE volume
}

/**
 * Round spot price to nearest strike (100 for NIFTY)
 */
function calculateATMStrike(spotPrice: number, strikeMultiplier: number = 100): number {
  return Math.round(spotPrice / strikeMultiplier) * strikeMultiplier;
}

/**
 * Fetch historical data for a single option contract
 */
async function fetchOptionData(
  symbol: string,
  interval: string,
  from: string,
  to: string,
  userId: string,
  broker: 'zerodha' | 'fyers'
): Promise<any[]> {
  try {
    const baseUrl = `http://localhost:3000/api/chart/historical`;
    const params = new URLSearchParams({
      symbol,
      interval,
      userId,
      from,
      to,
    });

    const response = await fetch(`${baseUrl}?${params.toString()}`);

    if (!response.ok) {
      console.error(`Failed to fetch ${symbol}:`, response.status);
      return [];
    }

    const result = await response.json();
    return result.data || [];
  } catch (error: any) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const baseSymbol = searchParams.get('symbol') || 'NIFTY';
    const expiry = searchParams.get('expiry') || '13JAN'; // e.g., 13JAN, 29JAN
    const strikeParam = searchParams.get('strike');
    const interval = searchParams.get('interval') || '5minute';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const userId = searchParams.get('userId');
    const spotPrice = parseFloat(searchParams.get('spotPrice') || '0');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Missing date range (from, to)' },
        { status: 400 }
      );
    }

    console.log(`[STRADDLE] Base symbol: ${baseSymbol}, Expiry: ${expiry}, Spot: ${spotPrice}`);

    // Auto-detect ATM strike if not provided
    let strike = strikeParam ? parseInt(strikeParam) : null;

    if (!strike && spotPrice > 0) {
      strike = calculateATMStrike(spotPrice);
      console.log(`[STRADDLE] Auto-detected ATM strike: ${strike}`);
    } else if (!strike) {
      return NextResponse.json(
        { error: 'Strike price required or spotPrice needed for auto-detection' },
        { status: 400 }
      );
    }

    // Build option contract symbols
    // e.g., NIFTY13JAN25700CE, NIFTY13JAN25700PE
    const ceSymbol = `${baseSymbol}${expiry}${strike}CE`;
    const peSymbol = `${baseSymbol}${expiry}${strike}PE`;

    console.log(`[STRADDLE] CE Symbol: ${ceSymbol}, PE Symbol: ${peSymbol}`);

    // Detect broker
    const brokerDetection = await detectUserBroker(userId);
    if (!brokerDetection.isConfigured) {
      return NextResponse.json(
        { error: 'No broker configured' },
        { status: 401 }
      );
    }

    const broker = brokerDetection.broker as 'zerodha' | 'fyers';

    // Fetch CE and PE data in parallel
    const [ceData, peData] = await Promise.all([
      fetchOptionData(ceSymbol, interval, from, to, userId, broker),
      fetchOptionData(peSymbol, interval, from, to, userId, broker),
    ]);

    if (ceData.length === 0 || peData.length === 0) {
      console.error('[STRADDLE] Missing CE or PE data');
      return NextResponse.json(
        { error: 'Could not fetch CE or PE data. Verify option symbols and dates.' },
        { status: 404 }
      );
    }

    // Combine CE and PE data
    const straddleData: StraddleCandle[] = [];

    console.log(`[STRADDLE] CE data length: ${ceData.length}, PE data length: ${peData.length}`);

    if (ceData.length === 0 && peData.length === 0) {
      console.error('[STRADDLE] Both CE and PE returned no data');
      return NextResponse.json(
        {
          error: `Option data not available for ${ceSymbol} and ${peSymbol}. Fyers API may not support historical option data. Try using Zerodha broker or check if option contracts are available.`,
          debug: {
            requestedCE: ceSymbol,
            requestedPE: peSymbol,
            broker,
            dates: { from, to },
          },
        },
        { status: 404 }
      );
    }

    if (ceData.length === 0) {
      console.error('[STRADDLE] CE data is empty');
      return NextResponse.json(
        {
          error: `Call (CE) option data not found for ${ceSymbol}. Check if symbol and dates are correct.`,
          debug: { symbol: ceSymbol, dates: { from, to } },
        },
        { status: 404 }
      );
    }

    if (peData.length === 0) {
      console.error('[STRADDLE] PE data is empty');
      return NextResponse.json(
        {
          error: `Put (PE) option data not found for ${peSymbol}. Check if symbol and dates are correct.`,
          debug: { symbol: peSymbol, dates: { from, to } },
        },
        { status: 404 }
      );
    }

    for (let i = 0; i < Math.min(ceData.length, peData.length); i++) {
      const cCandle = ceData[i];
      const pCandle = peData[i];

      if (cCandle && pCandle) {
        straddleData.push({
          time: Math.max(cCandle.time, pCandle.time), // Use latest time
          straddlePremium: (cCandle.close || 0) + (pCandle.close || 0),
          cePrice: cCandle.close || 0,
          pePrice: pCandle.close || 0,
          ceVolume: cCandle.volume || 0,
          peVolume: pCandle.volume || 0,
          totalVolume: (cCandle.volume || 0) + (pCandle.volume || 0),
        });
      }
    }

    console.log(`[STRADDLE] Combined ${straddleData.length} candles`);

    if (straddleData.length === 0) {
      return NextResponse.json(
        {
          error: `No matching candles found for ${ceSymbol} and ${peSymbol}. Timestamps may not align.`,
          debug: {
            ceDataCount: ceData.length,
            peDataCount: peData.length,
            ceFirstTime: ceData[0]?.time,
            ceLastTime: ceData[ceData.length - 1]?.time,
            peFirstTime: peData[0]?.time,
            peLastTime: peData[peData.length - 1]?.time,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      baseSymbol,
      expiry,
      strike,
      ceSymbol,
      peSymbol,
      interval,
      data: straddleData,
      count: straddleData.length,
      priceRange: {
        min: Math.min(...straddleData.map((c) => c.straddlePremium)),
        max: Math.max(...straddleData.map((c) => c.straddlePremium)),
        latest: straddleData[straddleData.length - 1]?.straddlePremium || 0,
      },
    });
  } catch (error: any) {
    console.error('[STRADDLE] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch straddle data' },
      { status: 500 }
    );
  }
}

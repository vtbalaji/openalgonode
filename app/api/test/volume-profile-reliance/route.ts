/**
 * GET /api/test/volume-profile-reliance
 * Test volume profile with real RELIANCE data
 * Query params: userId (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { getInstrumentToken } from '@/lib/websocket/instrumentMapping';
import { decryptData } from '@/lib/encryptionUtils';
import { getSymbolCache } from '@/lib/symbolCache';
import { calculateVolumeProfile } from '@/lib/indicators/volumeProfile';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let userId = searchParams.get('userId');

    // If no userId provided, find the first active Zerodha user
    if (!userId) {
      console.log('[TEST-VP-RELIANCE] No userId provided, searching for active Zerodha users...');

      const usersSnapshot = await adminDb.collection('users').limit(100).get();

      for (const userDoc of usersSnapshot.docs) {
        const brokerConfigDoc = await userDoc.ref.collection('brokerConfig').doc('zerodha').get();
        const brokerData = brokerConfigDoc.data();

        if (brokerData && brokerData.status === 'active') {
          userId = userDoc.id;
          console.log(`[TEST-VP-RELIANCE] Found active Zerodha user: ${userId} (${brokerData.email || 'no email'})`);
          break;
        }
      }

      if (!userId) {
        return NextResponse.json(
          { error: 'No active Zerodha users found. Please authenticate with Zerodha first.' },
          { status: 404 }
        );
      }
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
    const encryptedAccessToken = decryptData(configData.accessToken);
    const apiKey = decryptData(configData.apiKey);
    const accessToken = encryptedAccessToken.includes(':')
      ? encryptedAccessToken.split(':')[1]
      : encryptedAccessToken;

    // Ensure symbol cache is loaded
    const symbolCache = getSymbolCache();
    if (!symbolCache.isReady()) {
      await symbolCache.load(apiKey, accessToken);
    }

    // Get RELIANCE instrument token
    const instrumentToken = getInstrumentToken('RELIANCE');
    if (!instrumentToken) {
      return NextResponse.json(
        { error: 'RELIANCE symbol not found' },
        { status: 404 }
      );
    }

    // Fetch 1-minute data from Zerodha (last 5 days)
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 5);

    const url = `https://api.kite.trade/instruments/historical/${instrumentToken}/minute?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${apiKey}:${accessToken}`,
        'X-Kite-Version': '3',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch RELIANCE data from Zerodha' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const candles = data.data?.candles || [];

    // Transform to our format
    const chartData = candles.map((candle: any[]) => ({
      time: Math.floor(new Date(candle[0]).getTime() / 1000),
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5] || 0,
    }));

    // Calculate volume profile with 150 bins
    const volumeProfileResult = calculateVolumeProfile(chartData, 150, 0.70);

    // Find max volume
    const maxVol = Math.max(...volumeProfileResult.profile.map(p => p.volume));
    const pocBar = volumeProfileResult.profile.find(p => Math.abs(p.price - volumeProfileResult.poc) < 0.01);
    const maxVolBar = volumeProfileResult.profile.find(p => p.volume === maxVol);

    // Get top 10 bars by volume
    const top10Bars = [...volumeProfileResult.profile]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map((bar, i) => ({
        rank: i + 1,
        price: bar.price.toFixed(2),
        volume: bar.volume.toFixed(0),
        isPOC: Math.abs(bar.price - volumeProfileResult.poc) < 0.01,
        isValueArea: bar.price >= volumeProfileResult.valueAreaLow &&
                     bar.price <= volumeProfileResult.valueAreaHigh
      }));

    return NextResponse.json({
      success: true,
      symbol: 'RELIANCE',
      interval: '1minute',
      candleCount: chartData.length,
      dateRange: {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      },
      volumeProfile: {
        binCount: volumeProfileResult.profile.length,
        poc: volumeProfileResult.poc.toFixed(2),
        pocVolume: pocBar?.volume.toFixed(0),
        maxVolBar: {
          price: maxVolBar?.price.toFixed(2),
          volume: maxVolBar?.volume.toFixed(0),
        },
        pocMatchesMax: Math.abs((pocBar?.volume || 0) - maxVol) < 0.01,
        valueAreaHigh: volumeProfileResult.valueAreaHigh.toFixed(2),
        valueAreaLow: volumeProfileResult.valueAreaLow.toFixed(2),
        totalVolume: volumeProfileResult.totalVolume.toFixed(0),
      },
      top10Bars,
      priceRange: {
        min: Math.min(...chartData.map((c: any) => c.low)).toFixed(2),
        max: Math.max(...chartData.map((c: any) => c.high)).toFixed(2),
      }
    });
  } catch (error: any) {
    console.error('[TEST-VP-RELIANCE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}

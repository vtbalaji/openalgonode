/**
 * POST /api/broker/angel/symbols/search
 * Search for symbols on Angel Broker
 * Returns symboltoken for given symbol
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    // Get the Firebase ID token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);

    // Verify the token
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;
    const { symbol, exchange = 'NSE' } = await request.json();

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    // Get Angel broker config
    const configData = await getCachedBrokerConfig(userId, 'angel');

    if (!configData) {
      return NextResponse.json(
        { error: 'Angel Broker not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Angel Broker not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt credentials
    let jwtToken: string;
    let apiKey: string;

    try {
      jwtToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to decrypt credentials' },
        { status: 401 }
      );
    }

    // Import Angel client
    const { searchScrip } = await import('@/lib/angelClient');

    // Search for symbol
    const result = await searchScrip(jwtToken, apiKey, symbol, exchange);

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          message: `Could not find symbol ${symbol} on ${exchange}. Please verify the symbol is correct or try different exchange.`,
          suggestions: {
            checkFormat: 'Try with suffix like -EQ for equity (e.g., RELIANCE-EQ)',
            tryExchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
            fallback: 'You can manually enter the symboltoken if you know it',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      symbol,
      exchange,
      symboltoken: result.symboltoken,
      trading_symbol: result.trading_symbol,
      message: `Found symboltoken ${result.symboltoken} for ${result.trading_symbol}`,
    });
  } catch (error: any) {
    console.error('Error searching symbol:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search symbol' },
      { status: 500 }
    );
  }
}

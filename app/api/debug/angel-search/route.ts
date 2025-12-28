/**
 * POST /api/debug/angel-search
 * Debug endpoint to test Angel's searchScrip API
 * Shows exactly what Angel returns
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

const ANGEL_BASE_URL = 'https://apiconnect.angelbroking.com';

function getAngelHeaders(jwtToken: string, apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
    'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
    'X-MACAddress': 'MAC_ADDRESS',
    'X-PrivateKey': apiKey,
  };
}

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
    const { symbol = 'RELIANCE', exchange = 'NSE' } = await request.json();

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

    console.log(`[DEBUG] Searching for ${symbol} on ${exchange}`);

    // Try all payload formats
    const payloads = [
      { mode: 'SCRIP', exchangetokens: `${exchange}:${symbol}` },
      { mode: 'SCRIP', exchange: exchange, searchsymbol: symbol },
      { mode: 'SCRIP', exchangetokens: `${exchange}:${symbol}-EQ` },
      { mode: 'SCRIP', exchangetokens: symbol },
      { mode: 'TOKEN', token: symbol },
    ];

    const results = [];

    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i];
      console.log(`[DEBUG] Attempt ${i + 1}:`, JSON.stringify(payload));

      try {
        const response = await fetch(
          `${ANGEL_BASE_URL}/rest/secure/angelbroking/market/v1/searchScrip/`,
          {
            method: 'POST',
            headers: getAngelHeaders(jwtToken, apiKey),
            body: JSON.stringify(payload),
          }
        );

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = { raw: text };
        }

        console.log(`[DEBUG] Response ${i + 1}:`, JSON.stringify(data, null, 2));

        results.push({
          attempt: i + 1,
          payload,
          status: response.status,
          statusText: response.statusText,
          response: data,
        });
      } catch (err: any) {
        console.error(`[DEBUG] Error in attempt ${i + 1}:`, err.message);
        results.push({
          attempt: i + 1,
          payload,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      symbol,
      exchange,
      message: 'Check all attempts below to see what Angel API returns',
      attempts: results,
    });
  } catch (error: any) {
    console.error('Error in debug endpoint:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to debug search' },
      { status: 500 }
    );
  }
}

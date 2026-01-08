import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/fyers-auth
 * Test Fyers authentication and API calls
 * Body: { userId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Get broker config from cache
    const configData = await getCachedBrokerConfig(userId, 'fyers');

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker not configured' },
        { status: 404 }
      );
    }

    console.log('[TEST-FYERS] Config data:', {
      status: configData.status,
      hasApiKey: !!configData.apiKey,
      hasAccessToken: !!configData.accessToken,
    });

    // Decrypt credentials
    let accessToken: string;
    let apiKey: string;
    try {
      accessToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt credentials' },
        { status: 400 }
      );
    }

    console.log('[TEST-FYERS] Tokens decrypted:', {
      apiKey: apiKey.substring(0, 10) + '...',
      accessToken: accessToken.substring(0, 50) + '...',
      accessTokenLength: accessToken.length,
      isJwt: accessToken.includes('.'),
    });

    // Test 1: Try with Bearer token format (old way)
    console.log('[TEST-FYERS] Test 1: Bearer token format');
    let response1 = await fetch('https://api-t1.fyers.in/api/v3/orders', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    let data1 = await response1.json();
    console.log('[TEST-FYERS] Bearer response:', { status: response1.status, data: data1 });

    // Test 2: Try with apiKey:token format (OpenAlgo way)
    console.log('[TEST-FYERS] Test 2: apiKey:token format');
    let response2 = await fetch('https://api-t1.fyers.in/api/v3/orders', {
      method: 'GET',
      headers: {
        Authorization: `${apiKey}:${accessToken}`,
      },
    });
    let data2 = await response2.json();
    console.log('[TEST-FYERS] apiKey:token response:', { status: response2.status, data: data2 });

    // Test 3: Try just the JWT token
    console.log('[TEST-FYERS] Test 3: JWT token only');
    let response3 = await fetch('https://api-t1.fyers.in/api/v3/orders', {
      method: 'GET',
      headers: {
        Authorization: accessToken,
      },
    });
    let data3 = await response3.json();
    console.log('[TEST-FYERS] JWT only response:', { status: response3.status, data: data3 });

    // Test 4: Try with Bearer + apiKey in header
    console.log('[TEST-FYERS] Test 4: Bearer apiKey:token format');
    let response4 = await fetch('https://api-t1.fyers.in/api/v3/orders', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}:${accessToken}`,
      },
    });
    let data4 = await response4.json();
    console.log('[TEST-FYERS] Bearer apiKey:token response:', { status: response4.status, data: data4 });

    // Return all test results
    return NextResponse.json(
      {
        tests: {
          bearerToken: { status: response1.status, success: data1.s === 'ok', data: data1 },
          apiKeyToken: { status: response2.status, success: data2.s === 'ok', data: data2 },
          jwtOnly: { status: response3.status, success: data3.s === 'ok', data: data3 },
          bearerApiKeyToken: { status: response4.status, success: data4.s === 'ok', data: data4 },
        },
        tokens: {
          apiKey: apiKey.substring(0, 10) + '...',
          accessToken: accessToken.substring(0, 50) + '...',
          accessTokenIsJwt: accessToken.includes('.'),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in Fyers auth test:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}

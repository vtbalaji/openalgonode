import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/fyers-token-exchange
 * Test the token exchange process step by step
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({ error: 'Broker not configured' }, { status: 404 });
    }

    // Decrypt credentials
    let apiKey: string;
    let apiSecret: string;
    let authCodeJwt: string;
    try {
      apiKey = decryptData(configData.apiKey);
      apiSecret = decryptData(configData.apiSecret);
      authCodeJwt = decryptData(configData.accessToken);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to decrypt' }, { status: 400 });
    }

    console.log('[TOKEN-EXCHANGE-TEST] Starting token exchange test');
    console.log('[TOKEN-EXCHANGE-TEST] Auth code is JWT:', authCodeJwt.includes('.'));

    // Step 1: Calculate appIdHash
    const checksumInput = `${apiKey}:${apiSecret}`;
    const appIdHash = crypto.createHash('sha256').update(checksumInput).digest('hex');

    console.log('[TOKEN-EXCHANGE-TEST] Calculated appIdHash:', appIdHash.substring(0, 20) + '...');

    // Step 2: Exchange auth code for access token
    console.log('[TOKEN-EXCHANGE-TEST] Sending token exchange request to /validate-authcode');
    const exchangeResponse = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: authCodeJwt,
      }),
    });

    const exchangeData = await exchangeResponse.json();

    console.log('[TOKEN-EXCHANGE-TEST] Exchange response:', {
      status: exchangeResponse.status,
      s: exchangeData.s,
      message: exchangeData.message,
      hasAccessToken: !!exchangeData.access_token,
    });

    // Step 3: If successful, test the new access token
    let bearerTestResult: any = null;
    if (exchangeData.s === 'ok' && exchangeData.access_token) {
      const newAccessToken = exchangeData.access_token;

      console.log('[TOKEN-EXCHANGE-TEST] Testing new access token with Bearer format');
      const testResponse = await fetch('https://api-t1.fyers.in/api/v3/orders', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      });

      const testData = await testResponse.json();
      bearerTestResult = {
        status: testResponse.status,
        success: testData.s === 'ok',
        message: testData.message,
      };

      console.log('[TOKEN-EXCHANGE-TEST] Bearer token test result:', bearerTestResult);
    }

    return NextResponse.json(
      {
        steps: {
          decryption: { success: true },
          appIdHashCalculation: { hash: appIdHash.substring(0, 20) + '...' },
          tokenExchange: {
            status: exchangeResponse.status,
            success: exchangeData.s === 'ok',
            message: exchangeData.message,
            hasAccessToken: !!exchangeData.access_token,
            accessTokenLength: exchangeData.access_token?.length,
            accessTokenIsJwt: exchangeData.access_token?.includes('.'),
          },
          bearerTokenTest: bearerTestResult,
        },
        debug: {
          inputAuthCodeIsJwt: authCodeJwt.includes('.'),
          inputAuthCodeLength: authCodeJwt.length,
          fullExchangeResponse: exchangeData,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[TOKEN-EXCHANGE-TEST] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}

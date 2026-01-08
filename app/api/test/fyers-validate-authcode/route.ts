import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/fyers-validate-authcode
 * Test exchanging OAuth code for access token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Get broker config to get API credentials
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({ error: 'Broker not configured' }, { status: 404 });
    }

    // Decrypt API key and secret
    let apiKey: string;
    let apiSecret: string;
    try {
      apiKey = decryptData(configData.apiKey);
      apiSecret = decryptData(configData.apiSecret);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to decrypt credentials' }, { status: 400 });
    }

    console.log('[VALIDATE-AUTHCODE] Testing with code:', code);
    console.log('[VALIDATE-AUTHCODE] API Key:', apiKey.substring(0, 10) + '...');

    // Test code exchange with different values
    const tests: any = {};

    // Test 1: Exchange "200" as the code
    console.log('[VALIDATE-AUTHCODE] Test 1: Exchange code="200"');
    const checksum1 = crypto.createHash('sha256').update(`${apiKey}:${apiSecret}`).digest('hex');
    let response1 = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash: checksum1,
        code: '200',
      }),
    });
    let data1 = await response1.json();
    tests.code200 = { status: response1.status, data: data1 };
    console.log('[VALIDATE-AUTHCODE] Test 1 result:', tests.code200);

    // Test 2: If a specific code was provided, try that
    if (code && code !== '200') {
      console.log('[VALIDATE-AUTHCODE] Test 2: Exchange provided code:', code);
      let response2 = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          appIdHash: checksum1,
          code: code,
        }),
      });
      let data2 = await response2.json();
      tests.providedCode = { status: response2.status, data: data2 };
      console.log('[VALIDATE-AUTHCODE] Test 2 result:', tests.providedCode);
    }

    return NextResponse.json(
      {
        tests,
        note: 'Note: code=200 was received from Fyers OAuth callback',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}

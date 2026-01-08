import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/fyers-appid-auth
 * Test Fyers with app_id extracted from JWT
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

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = decryptData(configData.accessToken);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to decrypt' }, { status: 400 });
    }

    // Decode JWT to extract app_id
    const parts = accessToken.split('.');
    if (parts.length !== 3) {
      return NextResponse.json({ error: 'Invalid JWT format' }, { status: 400 });
    }

    const payload = parts[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    const appIdFromJwt = decoded.app_id;
    const hsmKeyFromJwt = decoded.hsm_key;

    console.log('[TEST-APPID-AUTH] JWT decoded:', {
      app_id: appIdFromJwt,
      hsm_key: hsmKeyFromJwt,
    });

    // Test different authorization formats
    const tests: any = {};

    // Test 1: app_id from JWT + accessToken
    console.log('[TEST-APPID-AUTH] Test 1: app_id:accessToken');
    let response1 = await fetch('https://api-t1.fyers.in/api/v3/orders', {
      method: 'GET',
      headers: {
        Authorization: `${appIdFromJwt}:${accessToken}`,
      },
    });
    let data1 = await response1.json();
    tests.appIdFromJwt = {
      status: response1.status,
      success: data1.s === 'ok',
      message: data1.message || data1.s,
      data: data1.s === 'ok' ? 'SUCCESS' : data1
    };
    console.log('[TEST-APPID-AUTH] Test 1 result:', tests.appIdFromJwt);

    // Test 2: app_id:hsm_key:accessToken format
    console.log('[TEST-APPID-AUTH] Test 2: app_id:hsm_key:accessToken');
    let response2 = await fetch('https://api-t1.fyers.in/api/v3/orders', {
      method: 'GET',
      headers: {
        Authorization: `${appIdFromJwt}:${hsmKeyFromJwt}:${accessToken}`,
      },
    });
    let data2 = await response2.json();
    tests.appIdHsmKey = {
      status: response2.status,
      success: data2.s === 'ok',
      message: data2.message || data2.s,
      data: data2.s === 'ok' ? 'SUCCESS' : data2
    };
    console.log('[TEST-APPID-AUTH] Test 2 result:', tests.appIdHsmKey);

    // Test 3: Just accessToken with app_id in header
    console.log('[TEST-APPID-AUTH] Test 3: appId:token header');
    let response3 = await fetch('https://api-t1.fyers.in/api/v3/orders', {
      method: 'GET',
      headers: {
        'Authorization': `${appIdFromJwt}:${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    let data3 = await response3.json();
    tests.withContentType = {
      status: response3.status,
      success: data3.s === 'ok',
      message: data3.message || data3.s,
      data: data3.s === 'ok' ? 'SUCCESS' : data3
    };
    console.log('[TEST-APPID-AUTH] Test 3 result:', tests.withContentType);

    return NextResponse.json(
      {
        tests,
        extractedFromJwt: {
          app_id: appIdFromJwt,
          hsm_key: hsmKeyFromJwt,
        },
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

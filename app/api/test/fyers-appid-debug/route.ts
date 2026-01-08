import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

const FYERS_API_URL = 'https://api-t1.fyers.in/api/v3';

/**
 * Debug endpoint to test different ways of sending app_id to Fyers
 * POST with userId to test the stored credentials
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    console.log('\n=== FYERS APP_ID DEBUG TEST ===');
    console.log('userId:', userId);

    // Get broker config from cache
    const configData = await getCachedBrokerConfig(userId, 'fyers');

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker not configured' },
        { status: 404 }
      );
    }

    // Decrypt credentials
    let accessToken: string;
    let apiKey: string;
    try {
      accessToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);
      console.log('Decryption successful');
      console.log('apiKey (app_id):', apiKey);
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Test 1: Query parameter (current implementation)
    console.log('\n--- TEST 1: Query Parameter ---');
    let test1Result = { status: 0, success: false, message: '', data: null };
    try {
      const url1 = `${FYERS_API_URL}/orders?app_id=${encodeURIComponent(apiKey)}`;
      console.log('URL:', url1);
      const response1 = await fetch(url1, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      });
      test1Result.status = response1.status;
      console.log('Status:', response1.status);

      const text1 = await response1.text();
      console.log('Response text:', text1);

      try {
        const data1 = JSON.parse(text1);
        test1Result.data = data1;
        test1Result.success = response1.ok;
        test1Result.message = data1.message || 'Success';
        console.log('Response:', data1);
      } catch (e) {
        test1Result.message = `Invalid JSON: ${text1.substring(0, 100)}`;
        console.log('Failed to parse JSON:', e);
      }
    } catch (error: any) {
      test1Result.message = error.message;
      console.error('Test 1 error:', error);
    }

    // Test 2: Custom header
    console.log('\n--- TEST 2: Custom Header (X-app-id) ---');
    let test2Result = { status: 0, success: false, message: '', data: null };
    try {
      const url2 = `${FYERS_API_URL}/orders`;
      console.log('URL:', url2);
      const response2 = await fetch(url2, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-app-id': apiKey,
        },
      });
      test2Result.status = response2.status;
      console.log('Status:', response2.status);

      const text2 = await response2.text();
      console.log('Response text:', text2);

      try {
        const data2 = JSON.parse(text2);
        test2Result.data = data2;
        test2Result.success = response2.ok;
        test2Result.message = data2.message || 'Success';
        console.log('Response:', data2);
      } catch (e) {
        test2Result.message = `Invalid JSON: ${text2.substring(0, 100)}`;
        console.log('Failed to parse JSON:', e);
      }
    } catch (error: any) {
      test2Result.message = error.message;
      console.error('Test 2 error:', error);
    }

    // Test 3: Request body (POST instead of GET)
    console.log('\n--- TEST 3: Request Body (as POST) ---');
    let test3Result = { status: 0, success: false, message: '', data: null };
    try {
      const url3 = `${FYERS_API_URL}/orders`;
      console.log('URL:', url3);
      const response3 = await fetch(url3, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          app_id: apiKey,
        }),
      });
      test3Result.status = response3.status;
      console.log('Status:', response3.status);

      const text3 = await response3.text();
      console.log('Response text:', text3);

      try {
        const data3 = JSON.parse(text3);
        test3Result.data = data3;
        test3Result.success = response3.ok;
        test3Result.message = data3.message || 'Success';
        console.log('Response:', data3);
      } catch (e) {
        test3Result.message = `Invalid JSON: ${text3.substring(0, 100)}`;
        console.log('Failed to parse JSON:', e);
      }
    } catch (error: any) {
      test3Result.message = error.message;
      console.error('Test 3 error:', error);
    }

    // Test 4: Just the Client ID part (before the dash)
    console.log('\n--- TEST 4: Query Parameter (Client ID only - before dash) ---');
    let test4Result = { status: 0, success: false, message: '', data: null };
    try {
      const clientIdOnly = apiKey.split('-')[0];
      console.log('Client ID only:', clientIdOnly);
      const url4 = `${FYERS_API_URL}/orders?app_id=${encodeURIComponent(clientIdOnly)}`;
      console.log('URL:', url4);
      const response4 = await fetch(url4, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      });
      test4Result.status = response4.status;
      console.log('Status:', response4.status);

      const text4 = await response4.text();
      console.log('Response text:', text4);

      try {
        const data4 = JSON.parse(text4);
        test4Result.data = data4;
        test4Result.success = response4.ok;
        test4Result.message = data4.message || 'Success';
        console.log('Response:', data4);
      } catch (e) {
        test4Result.message = `Invalid JSON: ${text4.substring(0, 100)}`;
        console.log('Failed to parse JSON:', e);
      }
    } catch (error: any) {
      test4Result.message = error.message;
      console.error('Test 4 error:', error);
    }

    // Return all results
    return NextResponse.json(
      {
        message: 'All tests completed. Check server logs for details.',
        apiKeyUsed: apiKey,
        tests: {
          test1_queryParam: test1Result,
          test2_header: test2Result,
          test3_body: test3Result,
          test4_clientIdOnly: test4Result,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Debug test error:', error);
    return NextResponse.json(
      { error: error.message || 'Debug test failed' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

const FYERS_API_URL = 'https://api-t1.fyers.in/api/v3';

/**
 * Validate the stored Fyers access token by calling user profile endpoint
 * This endpoint doesn't need app_id, so it tests if the token itself is valid
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    console.log('\n=== FYERS TOKEN VALIDATION ===');
    console.log('userId:', userId);

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');

    if (!configData) {
      return NextResponse.json({ error: 'Broker not configured' }, { status: 404 });
    }

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = decryptData(configData.accessToken);
      console.log('[VALIDATE] Access token decrypted successfully');
      console.log('[VALIDATE] Token preview:', accessToken.substring(0, 50) + '...');
      console.log('[VALIDATE] Token length:', accessToken.length);
    } catch (error) {
      console.error('[VALIDATE] Failed to decrypt:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Test 1: Call /user/profile endpoint (doesn't need app_id)
    console.log('\n--- Test 1: /user/profile (no app_id required) ---');
    const url1 = `${FYERS_API_URL}/user/profile`;
    console.log('[VALIDATE] URL:', url1);
    console.log('[VALIDATE] Authorization header:', `Bearer ${accessToken.substring(0, 30)}...`);

    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    console.log('[VALIDATE] Response status:', response1.status);

    const text1 = await response1.text();
    console.log('[VALIDATE] Response text:', text1);

    let data1: any;
    try {
      data1 = JSON.parse(text1);
    } catch (e) {
      data1 = { raw: text1 };
    }

    // Test 2: Parse and inspect the access token JWT
    console.log('\n--- Test 2: Inspect Access Token JWT ---');
    const parts = accessToken.split('.');
    console.log('[VALIDATE] Token has', parts.length, 'parts (should be 3 for JWT)');

    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        console.log('[VALIDATE] JWT Payload:', payload);
        console.log('[VALIDATE] JWT Keys:', Object.keys(payload));
        console.log('[VALIDATE] Expiration timestamp:', payload.exp);
        console.log('[VALIDATE] Issued at timestamp:', payload.iat);

        if (payload.exp) {
          const expiryDate = new Date(payload.exp * 1000);
          const now = new Date();
          console.log('[VALIDATE] Token expires at:', expiryDate.toISOString());
          console.log('[VALIDATE] Current time:', now.toISOString());
          console.log('[VALIDATE] Token expired:', now > expiryDate);
        }
      } catch (e) {
        console.error('[VALIDATE] Failed to parse JWT payload:', e);
      }
    }

    return NextResponse.json(
      {
        message: 'Token validation completed',
        tests: {
          userProfile: {
            url: url1,
            status: response1.status,
            success: response1.ok,
            message: data1.message || 'See data',
            data: data1,
          },
          tokenInfo: {
            parts: parts.length,
            preview: accessToken.substring(0, 50) + '...',
            length: accessToken.length,
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      { error: error.message || 'Token validation failed' },
      { status: 500 }
    );
  }
}

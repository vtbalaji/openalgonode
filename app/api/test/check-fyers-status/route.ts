import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';
import crypto from 'crypto';

/**
 * GET /api/test/check-fyers-status?userId=XXX
 * Simple status check - no auth required for testing
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    console.log('[CHECK-FYERS-STATUS] Checking status for userId:', userId);

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      console.log('[CHECK-FYERS-STATUS] No config found');
      return NextResponse.json({
        status: 'not_configured',
        message: 'No Fyers configuration found for this user',
      }, { status: 404 });
    }

    console.log('[CHECK-FYERS-STATUS] Config found:', {
      broker: configData.broker,
      hasAccessToken: !!configData.accessToken,
      status: configData.status,
    });

    // Try to decrypt the stored token
    let storedToken: string;
    try {
      storedToken = decryptData(configData.accessToken);
    } catch (error) {
      console.error('[CHECK-FYERS-STATUS] Failed to decrypt:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to decrypt stored token',
      }, { status: 400 });
    }

    // Analyze token
    const isJwt = storedToken.includes('.');
    const tokenPreview = storedToken.substring(0, 100) + (storedToken.length > 100 ? '...' : '');

    console.log('[CHECK-FYERS-STATUS] Token analysis:', {
      isJwt,
      length: storedToken.length,
      preview: tokenPreview,
    });

    // If it's a JWT, try to extract app_id to verify it's from Fyers
    let tokenType = 'unknown';
    let tokenDetails: any = null;

    if (isJwt) {
      try {
        const parts = storedToken.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        tokenType = 'JWT';
        tokenDetails = {
          app_id: payload.app_id,
          iss: payload.iss,
          exp: payload.exp,
          iat: payload.iat,
        };
        console.log('[CHECK-FYERS-STATUS] JWT Payload:', tokenDetails);
      } catch (e) {
        console.error('[CHECK-FYERS-STATUS] Failed to decode JWT:', e);
        tokenType = 'JWT_DECODE_FAILED';
      }
    } else {
      tokenType = 'ACCESS_TOKEN_OR_OPAQUE';
    }

    const problem = isJwt
      ? 'Token is STILL a JWT (auth_code) - NOT properly exchanged!'
      : 'Token appears to be an access_token (good!)';

    console.log('[CHECK-FYERS-STATUS] RESULT:', {
      isJwt,
      problem,
      tokenType,
    });

    return NextResponse.json({
      userId,
      status: configData.status,
      tokenAnalysis: {
        isJwt,
        tokenType,
        length: storedToken.length,
        preview: tokenPreview,
        payload: tokenDetails,
      },
      problem,
      solution: isJwt
        ? 'Token exchange at /validate-authcode failed. Check server logs for [AUTH-FYERS] errors.'
        : 'Token looks good. If orderbook still fails, check the API call format.',
    }, { status: 200 });
  } catch (error: any) {
    console.error('[CHECK-FYERS-STATUS] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Check failed' },
      { status: 500 }
    );
  }
}

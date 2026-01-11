import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig, invalidateBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';
import { ensureValidAccessToken } from '@/lib/fyersTokenRefresh';

/**
 * POST /api/broker/refresh-token
 * Manually refresh broker access token
 * Requires: Authorization header with Firebase ID token
 * Body: { broker: "fyers" | "zerodha" | "angel" }
 *
 * Response: { success: true, message: "Token refreshed", broker, expiresAt }
 */
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
    const { broker } = await request.json();

    console.log(`[REFRESH-TOKEN] User=${userId}, Broker=${broker}`);

    if (!broker) {
      return NextResponse.json(
        { error: 'Missing required field: broker' },
        { status: 400 }
      );
    }

    // Retrieve broker config from cache
    const configData = await getCachedBrokerConfig(userId, broker);

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker configuration not found. Please configure your broker first.' },
        { status: 404 }
      );
    }

    // Handle Fyers token refresh
    if (broker === 'fyers') {
      if (!configData.refreshToken || !configData.apiKey || !configData.apiSecret) {
        return NextResponse.json(
          { error: 'Missing required credentials for Fyers refresh token' },
          { status: 400 }
        );
      }

      try {
        const apiKey = decryptData(configData.apiKey);
        const apiSecret = decryptData(configData.apiSecret);
        const refreshToken = decryptData(configData.refreshToken);
        const pin = configData.pin ? decryptData(configData.pin) : undefined;

        console.log('[REFRESH-TOKEN] Calling ensureValidAccessToken for Fyers...');

        const newAccessToken = await ensureValidAccessToken(
          userId,
          broker,
          apiKey,
          apiSecret,
          refreshToken,
          configData.accessToken,
          configData.accessTokenExpiresAt,
          pin
        );

        if (!newAccessToken) {
          return NextResponse.json(
            { error: 'Failed to refresh Fyers access token' },
            { status: 400 }
          );
        }

        // Invalidate cache to ensure fresh token is picked up
        invalidateBrokerConfig(userId, broker);

        return NextResponse.json(
          {
            success: true,
            message: 'Token refreshed successfully',
            broker,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          { status: 200 }
        );
      } catch (error: any) {
        console.error('[REFRESH-TOKEN] Fyers refresh error:', error.message);
        return NextResponse.json(
          { error: error.message || 'Failed to refresh Fyers token' },
          { status: 400 }
        );
      }
    }

    // For other brokers (Zerodha, Angel), manual refresh not supported
    return NextResponse.json(
      {
        error: `Manual token refresh not supported for ${broker}. Please re-authenticate.`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[REFRESH-TOKEN] Error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh token' },
      { status: 500 }
    );
  }
}

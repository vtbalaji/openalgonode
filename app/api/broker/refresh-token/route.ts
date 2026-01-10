/**
 * POST /api/broker/refresh-token
 * Refresh Fyers access token using stored refresh token
 *
 * Request body:
 * {
 *   userId: string (Firebase user ID)
 *   broker: 'fyers' | 'zerodha' (only Fyers is supported for now)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { decryptData, encryptData } from '@/lib/encryptionUtils';
import { refreshFyersToken } from '@/lib/fyersClient';
import { invalidateBrokerConfigCache } from '@/lib/brokerConfigCache';

export async function POST(request: NextRequest) {
  try {
    const { userId, broker } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    if (!broker || !['fyers', 'zerodha'].includes(broker)) {
      return NextResponse.json(
        { error: 'Missing or invalid broker. Supported: fyers, zerodha' },
        { status: 400 }
      );
    }

    console.log(`[REFRESH-TOKEN] Attempting to refresh ${broker} token for user:`, userId.substring(0, 20) + '...');

    // Get broker config from Firestore
    const userBrokerRef = adminDb.collection('users').doc(userId).collection('brokerConfig').doc(broker);
    const doc = await userBrokerRef.get();

    if (!doc.exists) {
      console.log(`[REFRESH-TOKEN] No ${broker} config found for user`);
      return NextResponse.json(
        { error: `No ${broker} configuration found` },
        { status: 404 }
      );
    }

    const data = doc.data() as any;

    if (!data.refreshToken) {
      console.log(`[REFRESH-TOKEN] No refresh token stored for ${broker}`);
      return NextResponse.json(
        { error: `No refresh token available for ${broker}` },
        { status: 400 }
      );
    }

    if (broker === 'fyers') {
      // Refresh Fyers token
      console.log('[REFRESH-TOKEN] Refreshing Fyers token...');

      const decryptedRefreshToken = decryptData(data.refreshToken);
      const clientId = decryptData(data.apiKey); // apiKey contains clientId for Fyers
      const clientSecret = decryptData(data.clientSecret); // clientSecret must be stored

      if (!clientSecret) {
        console.error('[REFRESH-TOKEN] Client secret not found for Fyers');
        return NextResponse.json(
          { error: 'Client secret not configured. Please re-authenticate with Fyers.' },
          { status: 400 }
        );
      }

      try {
        const newTokens = await refreshFyersToken(decryptedRefreshToken, clientId, clientSecret);

        console.log('[REFRESH-TOKEN] Token refresh successful, updating database...');

        // Update the stored tokens
        await userBrokerRef.update({
          accessToken: encryptData(newTokens.accessToken),
          refreshToken: encryptData(newTokens.refreshToken),
          lastTokenRefresh: new Date().toISOString(),
          status: 'active',
        });

        // Invalidate cache so next request gets fresh tokens
        invalidateBrokerConfigCache(userId, broker);

        console.log('[REFRESH-TOKEN] Tokens updated successfully');

        return NextResponse.json({
          success: true,
          message: 'Token refreshed successfully',
          broker,
          lastRefresh: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error('[REFRESH-TOKEN] Fyers token refresh failed:', error.message);

        // If refresh fails, mark the config as needing re-authentication
        await userBrokerRef.update({
          status: 'token_expired',
          lastTokenRefreshError: error.message,
          lastTokenRefreshAttempt: new Date().toISOString(),
        });

        return NextResponse.json(
          { error: `Token refresh failed: ${error.message}. Please re-authenticate.` },
          { status: 401 }
        );
      }
    } else if (broker === 'zerodha') {
      console.log('[REFRESH-TOKEN] Zerodha token refresh not yet implemented');
      return NextResponse.json(
        { error: 'Zerodha token refresh not yet implemented' },
        { status: 501 }
      );
    }

    return NextResponse.json(
      { error: 'Invalid broker' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[REFRESH-TOKEN] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to refresh token' },
      { status: 500 }
    );
  }
}

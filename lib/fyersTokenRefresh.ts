/**
 * Fyers Token Refresh Utility
 * Automatically refreshes access tokens using refresh token
 */

import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';

interface FyersTokenRefreshResponse {
  s: string; // 'ok' or 'error'
  message?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Refresh Fyers access token using refresh token
 *
 * Required for Firestore stored config:
 * - refreshToken: The refresh token (15 day validity)
 * - appId: Fyers App ID
 * - appSecret: Fyers App Secret
 * - pin: User's Fyers PIN (optional)
 */
export async function refreshFyersAccessToken(
  appId: string,
  appSecret: string,
  refreshToken: string,
  pin?: string
): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {
    // Generate appIdHash: SHA-256 of "app_id:app_secret"
    const hashInput = `${appId}:${appSecret}`;
    const appIdHash = crypto
      .createHash('sha256')
      .update(hashInput)
      .digest('hex');

    console.log('[FYERS-TOKEN] Refreshing access token...');

    const payload: any = {
      grant_type: 'refresh_token',
      appIdHash,
      refresh_token: refreshToken,
    };

    // Add PIN if available
    if (pin) {
      payload.pin = pin;
    }

    const response = await fetch('https://api-t1.fyers.in/validate-refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[FYERS-TOKEN] Refresh failed (HTTP):', response.status, errorData);
      return null;
    }

    const data: FyersTokenRefreshResponse = await response.json();

    if (data.s !== 'ok' || !data.access_token) {
      console.error('[FYERS-TOKEN] Refresh failed (API):', data.message);
      return null;
    }

    // Calculate expiration: access tokens typically valid for 24 hours
    const expiresIn = data.expires_in || 86400; // Default 24 hours
    const expiresAt = Date.now() + expiresIn * 1000;

    console.log('[FYERS-TOKEN] Successfully refreshed. Expires in:', expiresIn, 'seconds');

    // If there's a new refresh token, return it too (for storage)
    return {
      accessToken: data.access_token,
      expiresAt,
    };
  } catch (error: any) {
    console.error('[FYERS-TOKEN] Refresh error:', error.message);
    return null;
  }
}

/**
 * Check if access token is expired or about to expire (within 1 hour)
 */
export function isAccessTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) return true;

  const now = Date.now();
  const bufferMs = 60 * 60 * 1000; // 1 hour buffer

  return now > (expiresAt - bufferMs);
}

/**
 * Update broker config with new access token in Firestore
 */
export async function updateBrokerAccessToken(
  userId: string,
  broker: string,
  newAccessToken: string,
  expiresAt: number
): Promise<boolean> {
  try {
    const brokerConfigRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('brokerConfig')
      .doc(broker);

    await brokerConfigRef.update({
      accessToken: newAccessToken,
      accessTokenExpiresAt: expiresAt,
      lastTokenRefresh: new Date().toISOString(),
    });

    console.log('[FYERS-TOKEN] Updated broker config in Firestore');
    return true;
  } catch (error: any) {
    console.error('[FYERS-TOKEN] Failed to update Firestore:', error.message);
    return false;
  }
}

/**
 * Auto-refresh token if expired
 * Call this before using access token in any broker API call
 */
export async function ensureValidAccessToken(
  userId: string,
  broker: string,
  appId: string,
  appSecret: string,
  refreshToken: string,
  currentAccessToken: string,
  expiresAt?: number,
  pin?: string
): Promise<string | null> {
  // Check if token needs refresh
  if (!isAccessTokenExpired(expiresAt)) {
    return currentAccessToken; // Token is still valid
  }

  console.log('[FYERS-TOKEN] Access token expired/expiring, attempting refresh...');

  // Attempt to refresh
  const refreshResult = await refreshFyersAccessToken(
    appId,
    appSecret,
    refreshToken,
    pin
  );

  if (!refreshResult) {
    console.error('[FYERS-TOKEN] Failed to refresh token');
    return null;
  }

  // Update Firestore with new token
  const updated = await updateBrokerAccessToken(
    userId,
    broker,
    refreshResult.accessToken,
    refreshResult.expiresAt
  );

  if (!updated) {
    console.warn('[FYERS-TOKEN] Token refreshed but failed to save to Firestore');
  }

  // Invalidate cache so new token is picked up
  const { invalidateBrokerConfig } = await import('@/lib/brokerConfigUtils');
  invalidateBrokerConfig(userId, broker);

  return refreshResult.accessToken;
}

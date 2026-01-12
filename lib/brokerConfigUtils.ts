/**
 * Broker Config Utilities
 * Common functions for getting and managing broker configuration
 */

import { getBrokerConfigCache } from '@/lib/brokerConfigCache';
import { isAccessTokenExpired, ensureValidAccessToken } from '@/lib/fyersTokenRefresh';
import { decryptData, encryptData } from '@/lib/encryptionUtils';

/**
 * Get broker config for a user (cached)
 * Automatically refreshes Fyers access token if expired
 *
 * Usage:
 * const config = await getCachedBrokerConfig(userId, 'fyers');
 * if (!config) {
 *   return NextResponse.json({ error: 'Broker not configured' }, { status: 404 });
 * }
 */
export async function getCachedBrokerConfig(userId: string, broker: string = 'zerodha') {
  const cache = getBrokerConfigCache();
  const config = await cache.get(userId, broker);

  if (!config) return null;

  // Auto-refresh Fyers access token if expired
  if (broker === 'fyers' && config.refreshToken) {
    if (isAccessTokenExpired(config.accessTokenExpiresAt)) {
      console.log('[BROKER-CONFIG] Access token expired, attempting refresh...');

      try {
        const apiKey = decryptData(config.apiKey);
        const apiSecret = decryptData(config.apiSecret);
        const refreshToken = decryptData(config.refreshToken);
        const pin = config.pin ? decryptData(config.pin) : undefined;

        const newAccessToken = await ensureValidAccessToken(
          userId,
          broker,
          apiKey,
          apiSecret,
          refreshToken,
          config.accessToken,
          config.accessTokenExpiresAt,
          pin
        );

        if (newAccessToken) {
          // Store encrypted token in cache (ensureValidAccessToken already saves to Firestore encrypted)
          config.accessToken = encryptData(newAccessToken);
          console.log('[BROKER-CONFIG] Successfully refreshed access token');
        } else {
          console.warn('[BROKER-CONFIG] Failed to refresh access token');
        }
      } catch (error: any) {
        console.error('[BROKER-CONFIG] Token refresh error:', error.message);
        // Continue with current token, may fail but don't block
      }
    }
  }

  return config;
}

/**
 * Invalidate broker config cache
 * Call this after updating broker config (authentication, credentials change)
 *
 * Usage:
 * invalidateBrokerConfig(userId, 'zerodha');
 */
export function invalidateBrokerConfig(userId: string, broker: string = 'zerodha'): void {
  const cache = getBrokerConfigCache();
  cache.invalidate(userId, broker);
}

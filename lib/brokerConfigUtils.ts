/**
 * Broker Config Utilities
 * Common functions for getting and managing broker configuration
 */

import { getBrokerConfigCache } from '@/lib/brokerConfigCache';

/**
 * Get broker config for a user (cached)
 * Replaces the repeated pattern across 19 endpoints
 *
 * Usage:
 * const config = await getCachedBrokerConfig(userId, 'zerodha');
 * if (!config) {
 *   return NextResponse.json({ error: 'Broker not configured' }, { status: 404 });
 * }
 */
export async function getCachedBrokerConfig(userId: string, broker: string = 'zerodha') {
  const cache = getBrokerConfigCache();
  const config = await cache.get(userId, broker);
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

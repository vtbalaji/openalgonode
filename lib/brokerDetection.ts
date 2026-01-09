/**
 * Utility for detecting which broker a user has configured
 * Supports multi-user scenarios where each user has their own broker
 */

import { getCachedBrokerConfig } from './brokerConfigUtils';

export type BrokerType = 'zerodha' | 'fyers';

interface BrokerDetectionResult {
  broker: BrokerType;
  isConfigured: boolean;
  error?: string;
}

/**
 * Detect which broker the user has configured
 *
 * @param userId - The user's ID
 * @param preferredBroker - Optional broker preference (used as tiebreaker if user has both)
 * @returns The broker the user has configured, or error if none
 *
 * Priority logic:
 * 1. If user has only one broker configured, use that
 * 2. If user has both brokers, use preferred (default: zerodha)
 * 3. If user has neither, return error
 */
export async function detectUserBroker(
  userId: string,
  preferredBroker: BrokerType = 'zerodha'
): Promise<BrokerDetectionResult> {
  try {
    // Check both brokers for this user
    const zerodhaConfig = await getCachedBrokerConfig(userId, 'zerodha');
    const fyersConfig = await getCachedBrokerConfig(userId, 'fyers');

    const zerodhaActive = zerodhaConfig && zerodhaConfig.status === 'active';
    const fyersActive = fyersConfig && fyersConfig.status === 'active';

    // Determine which broker to use
    if (zerodhaActive && !fyersActive) {
      return { broker: 'zerodha', isConfigured: true };
    } else if (fyersActive && !zerodhaActive) {
      return { broker: 'fyers', isConfigured: true };
    } else if (zerodhaActive && fyersActive) {
      // User has both - use preferred
      return { broker: preferredBroker, isConfigured: true };
    } else {
      return {
        broker: preferredBroker,
        isConfigured: false,
        error: 'No broker authenticated. Please authenticate with Zerodha or Fyers.',
      };
    }
  } catch (error: any) {
    return {
      broker: preferredBroker,
      isConfigured: false,
      error: error.message || 'Failed to detect broker configuration',
    };
  }
}

/**
 * Get broker config for a user's configured broker
 */
export async function getUserBrokerConfig(userId: string, preferredBroker: BrokerType = 'zerodha') {
  const detection = await detectUserBroker(userId, preferredBroker);

  if (!detection.isConfigured) {
    return null;
  }

  const config = await getCachedBrokerConfig(userId, detection.broker);
  return config;
}

/**
 * Get list of brokers configured for a user (for broker selection UI)
 * Returns both configured and active brokers
 */
export async function getConfiguredBrokers(userId: string): Promise<{ zerodha: boolean; fyers: boolean }> {
  try {
    const zerodhaConfig = await getCachedBrokerConfig(userId, 'zerodha');
    const fyersConfig = await getCachedBrokerConfig(userId, 'fyers');

    return {
      zerodha: zerodhaConfig?.status === 'active',
      fyers: fyersConfig?.status === 'active',
    };
  } catch (error) {
    return { zerodha: false, fyers: false };
  }
}

/**
 * Resolve which broker to use for a request
 * Alias for detectUserBroker for backwards compatibility
 */
export async function resolveBroker(
  userId: string,
  preferredBroker: BrokerType = 'zerodha'
): Promise<BrokerDetectionResult> {
  return detectUserBroker(userId, preferredBroker);
}

/**
 * Broker Config from Environment Variables
 * Reads API credentials from env (key + secret)
 * Access token fetched from Firebase after authentication
 *
 * Usage:
 * - Set: ZERODHA_API_KEY, ZERODHA_API_SECRET (in env)
 * - Access token comes from Firebase after user login
 * - Or: ANGEL_API_KEY (in env), access token from Firebase
 */

interface BrokerConfigEnv {
  apiKey: string;
  apiSecret?: string;
  status: 'configured';
}

/**
 * Check if broker API credentials are in environment (not access token yet)
 * Access token will be fetched from Firebase after authentication
 */
export function getBrokerConfigFromEnv(broker: string): BrokerConfigEnv | null {
  const brokerUpper = broker.toUpperCase();

  if (brokerUpper === 'ZERODHA') {
    const apiKey = process.env.ZERODHA_API_KEY;
    const apiSecret = process.env.ZERODHA_API_SECRET;

    if (apiKey && apiSecret) {
      console.log('[BrokerConfigEnv] Zerodha credentials found in ENV');
      return {
        apiKey,
        apiSecret,
        status: 'configured',
      };
    }
  }

  if (brokerUpper === 'ANGEL') {
    const apiKey = process.env.ANGEL_API_KEY;

    if (apiKey) {
      console.log('[BrokerConfigEnv] Angel credentials found in ENV');
      return {
        apiKey,
        status: 'configured',
      };
    }
  }

  return null;
}

/**
 * Check if broker is configured via environment variables
 */
export function isBrokerConfiguredInEnv(broker: string): boolean {
  return getBrokerConfigFromEnv(broker) !== null;
}

/**
 * Get all configured brokers from environment
 */
export function getConfiguredBrokersFromEnv(): string[] {
  const brokers: string[] = [];

  if (process.env.ZERODHA_API_KEY && process.env.ZERODHA_ACCESS_TOKEN) {
    brokers.push('zerodha');
  }

  if (process.env.ANGEL_API_KEY && process.env.ANGEL_ACCESS_TOKEN) {
    brokers.push('angel');
  }

  return brokers;
}

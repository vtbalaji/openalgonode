/**
 * Centralized broker configuration
 * Add new brokers here to support them across the platform
 */

export interface BrokerConfig {
  id: string;
  name: string;
  displayName: string;
  loginUrlTemplate: string; // Template with {apiKey} placeholder
  apiEndpoint: string;
  requiresApiKey: boolean;
  requiresApiSecret: boolean;
  requiresRequestToken: boolean;
  supportedExchanges: string[];
  supportedProductTypes: string[];
  supportedOrderTypes: string[];
}

export const BROKER_CONFIGS: Record<string, BrokerConfig> = {
  zerodha: {
    id: 'zerodha',
    name: 'zerodha',
    displayName: 'Zerodha (Kite)',
    loginUrlTemplate: 'https://kite.trade/connect/login?v=3&api_key={apiKey}&redirect_uri={redirectUri}',
    apiEndpoint: 'https://api.kite.trade',
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresRequestToken: true,
    supportedExchanges: ['NSE', 'BSE', 'NFO', 'MCX', 'CDS', 'BCD'],
    supportedProductTypes: ['MIS', 'CNC', 'NRML'],
    supportedOrderTypes: ['MARKET', 'LIMIT', 'SL', 'SL-M'],
  },
  angel: {
    id: 'angel',
    name: 'angel',
    displayName: 'Angel One',
    loginUrlTemplate: 'https://smartapi.angelbroking.com/publisher-login?api_key={apiKey}',
    apiEndpoint: 'https://apiconnect.angelbroking.com',
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresRequestToken: true,
    supportedExchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
    supportedProductTypes: ['INTRADAY', 'DELIVERY', 'CARRYFORWARD'],
    supportedOrderTypes: ['MARKET', 'LIMIT', 'STOPLOSS_LIMIT', 'STOPLOSS_MARKET'],
  },
  dhan: {
    id: 'dhan',
    name: 'dhan',
    displayName: 'Dhan',
    loginUrlTemplate: '', // Dhan uses access token directly, no OAuth flow
    apiEndpoint: 'https://api.dhan.co',
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresRequestToken: false,
    supportedExchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
    supportedProductTypes: ['INTRADAY', 'MARGIN', 'CNC'],
    supportedOrderTypes: ['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_MARKET'],
  },
  upstox: {
    id: 'upstox',
    name: 'upstox',
    displayName: 'Upstox',
    loginUrlTemplate: 'https://api.upstox.com/v2/login/authorization/dialog?client_id={apiKey}&redirect_uri={redirectUri}&response_type=code',
    apiEndpoint: 'https://api.upstox.com',
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresRequestToken: true,
    supportedExchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
    supportedProductTypes: ['I', 'D'],
    supportedOrderTypes: ['MARKET', 'LIMIT', 'SL', 'SL-M'],
  },
  fyers: {
    id: 'fyers',
    name: 'fyers',
    displayName: 'Fyers',
    loginUrlTemplate: 'https://api.fyers.in/api/v2/generate-authcode?client_id={apiKey}&redirect_uri={redirectUri}&response_type=code&state=sample',
    apiEndpoint: 'https://api.fyers.in',
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresRequestToken: true,
    supportedExchanges: ['NSE', 'BSE', 'NFO', 'MCX'],
    supportedProductTypes: ['INTRADAY', 'CNC', 'MARGIN'],
    supportedOrderTypes: ['MARKET', 'LIMIT', 'STOP', 'STOPLIMIT'],
  },
};

/**
 * Get broker configuration by ID
 */
export function getBrokerConfig(brokerId: string): BrokerConfig | null {
  return BROKER_CONFIGS[brokerId] || null;
}

/**
 * Get all supported brokers
 */
export function getAllBrokers(): BrokerConfig[] {
  return Object.values(BROKER_CONFIGS);
}

/**
 * Build login URL for a broker
 */
export function buildBrokerLoginUrl(
  brokerId: string,
  apiKey: string,
  redirectUri?: string
): string | null {
  const config = getBrokerConfig(brokerId);
  if (!config || !config.loginUrlTemplate) {
    return null;
  }

  // redirectUri must be provided when called from server-side
  if (!redirectUri) {
    console.warn('buildBrokerLoginUrl: redirectUri not provided. This should be provided from server-side.');
    return null;
  }

  let url = config.loginUrlTemplate.replace('{apiKey}', apiKey);
  if (url.includes('{redirectUri}')) {
    url = url.replace('{redirectUri}', encodeURIComponent(redirectUri));
  }

  return url;
}

/**
 * Check if broker supports a feature
 */
export function brokerSupportsFeature(
  brokerId: string,
  feature: 'requestToken' | 'apiSecret'
): boolean {
  const config = getBrokerConfig(brokerId);
  if (!config) return false;

  switch (feature) {
    case 'requestToken':
      return config.requiresRequestToken;
    case 'apiSecret':
      return config.requiresApiSecret;
    default:
      return false;
  }
}

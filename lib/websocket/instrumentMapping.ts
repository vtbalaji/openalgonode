/**
 * Instrument Token Mapping Service
 * Maps trading symbols to broker instrument tokens
 * Loads symbols from Firebase instead of hardcoded list
 */

import {
  getBrokerSymbols,
  getBrokerSymbolToken,
  getBrokerSymbolsList,
  BrokerSymbol,
} from '@/lib/firebaseSymbols';

// Fallback hardcoded tokens for backward compatibility (if Firebase is unavailable)
const FALLBACK_TOKENS: Record<string, number> = {
  'RELIANCE': 738561,
  'TCS': 2953217,
  'HDFCBANK': 341249,
  'INFY': 408065,
  'HINDUNILVR': 356865,
  'ICICIBANK': 1270529,
  'BHARTIARTL': 2714625,
  'SBIN': 779521,
  'BAJFINANCE': 81153,
  'KOTAKBANK': 492033,
  'LT': 2939649,
  'ASIANPAINT': 60417,
  'AXISBANK': 1510401,
  'ITC': 424961,
  'MARUTI': 2815745,
  'SUNPHARMA': 857857,
  'TITAN': 897537,
  'ULTRACEMCO': 2952193,
  'WIPRO': 969473,
  'NESTLEIND': 4598529,
  'POWERGRID': 3834113,
  'NTPC': 2977281,
  'TATAMOTORS': 884737,
  'M&M': 519937,
  'TECHM': 3465729,
  'HCLTECH': 1850625,
  'ADANIPORTS': 3861249,
  'TATASTEEL': 895745,
  'ONGC': 633601,
  'JSWSTEEL': 3001089,
  'NIFTY 50': 256265,
  'NIFTY BANK': 260105,
  'INDIA VIX': 264969,
};

// Cache for async operations
let symbolsCache: Map<string, Map<string, BrokerSymbol>> = new Map();
let loadingPromise: Promise<Map<string, BrokerSymbol>> | null = null;

const BROKER = 'zerodha';

/**
 * Get instrument token for a symbol
 * Tries Firebase first, falls back to hardcoded tokens
 */
export async function getInstrumentToken(symbol: string): Promise<number | null> {
  const upperSymbol = symbol.toUpperCase().trim();

  try {
    // Try Firebase first
    const token = await getBrokerSymbolToken(BROKER, upperSymbol);
    if (token) return token;
  } catch (error) {
    console.warn('Error fetching symbol from Firebase:', error);
  }

  // Fallback to hardcoded tokens
  return FALLBACK_TOKENS[upperSymbol] || null;
}

/**
 * Get symbol from instrument token
 */
export async function getSymbolFromToken(token: number): Promise<string | null> {
  try {
    const symbols = await getBrokerSymbols(BROKER);
    for (const [symbol, data] of symbols.entries()) {
      if (data.token === token) {
        return symbol;
      }
    }
  } catch (error) {
    console.warn('Error fetching symbols from Firebase:', error);
  }

  // Fallback
  for (const [symbol, t] of Object.entries(FALLBACK_TOKENS)) {
    if (t === token) {
      return symbol;
    }
  }
  return null;
}

/**
 * Get all available symbols
 */
export async function getAvailableSymbols(): Promise<string[]> {
  try {
    const symbols = await getBrokerSymbolsList(BROKER);
    return symbols;
  } catch (error) {
    console.warn('Error fetching symbols from Firebase, using fallback:', error);
    return Object.keys(FALLBACK_TOKENS);
  }
}

/**
 * Check if symbol is supported
 */
export async function isSymbolSupported(symbol: string): Promise<boolean> {
  const token = await getInstrumentToken(symbol);
  return token !== null;
}

/**
 * Get broker symbols (for internal use)
 */
export async function getBrokerSymbolsInternal(broker: string = BROKER): Promise<Map<string, BrokerSymbol>> {
  try {
    return await getBrokerSymbols(broker);
  } catch (error) {
    console.warn(`Error fetching symbols for ${broker}:`, error);
    return new Map();
  }
}

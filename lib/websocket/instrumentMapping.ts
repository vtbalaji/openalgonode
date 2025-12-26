/**
 * Instrument Token Mapping Service
 * Maps trading symbols to broker instrument tokens
 * Uses in-memory cache loaded from Zerodha API
 * No Firebase reads = no quota issues
 */

import { getSymbolCache } from '@/lib/symbolCache';

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
 * Uses in-memory cache, falls back to hardcoded tokens
 */
export function getInstrumentToken(symbol: string): number | null {
  const upperSymbol = symbol.toUpperCase().trim();

  // Try in-memory cache first
  const cache = getSymbolCache();
  const cachedSymbol = cache.getSymbol(upperSymbol);
  if (cachedSymbol) {
    return cachedSymbol.token;
  }

  // Fallback to hardcoded tokens
  return FALLBACK_TOKENS[upperSymbol] || null;
}

/**
 * Get symbol from instrument token
 */
export function getSymbolFromToken(token: number): string | null {
  // Try in-memory cache first
  const cache = getSymbolCache();
  const symbols = cache.getAllSymbols();

  for (const symbol of symbols) {
    if (symbol.token === token) {
      return symbol.symbol;
    }
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
export function getAvailableSymbols(): string[] {
  const cache = getSymbolCache();
  if (cache.isReady()) {
    return cache.getSymbolNames();
  }

  // Fallback to hardcoded tokens
  return Object.keys(FALLBACK_TOKENS);
}

/**
 * Check if symbol is supported
 */
export function isSymbolSupported(symbol: string): boolean {
  const token = getInstrumentToken(symbol);
  return token !== null;
}

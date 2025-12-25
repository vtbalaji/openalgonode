/**
 * Instrument Token Mapping Service
 * Maps trading symbols to Zerodha instrument tokens
 */

// Common NSE stocks instrument tokens (you can expand this)
export const INSTRUMENT_TOKENS: Record<string, number> = {
  // NSE Top Stocks
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

  // Nifty Indices
  'NIFTY 50': 256265,
  'NIFTY BANK': 260105,
  'INDIA VIX': 264969,
};

/**
 * Get instrument token for a symbol
 */
export function getInstrumentToken(symbol: string): number | null {
  const upperSymbol = symbol.toUpperCase().trim();
  return INSTRUMENT_TOKENS[upperSymbol] || null;
}

/**
 * Get symbol from instrument token
 */
export function getSymbolFromToken(token: number): string | null {
  for (const [symbol, instrToken] of Object.entries(INSTRUMENT_TOKENS)) {
    if (instrToken === token) {
      return symbol;
    }
  }
  return null;
}

/**
 * Get all available symbols
 */
export function getAvailableSymbols(): string[] {
  return Object.keys(INSTRUMENT_TOKENS);
}

/**
 * Check if symbol is supported
 */
export function isSymbolSupported(symbol: string): boolean {
  return getInstrumentToken(symbol) !== null;
}

/**
 * Fetch and cache full instrument list from Zerodha
 * This should be called periodically to keep tokens updated
 */
export async function fetchInstrumentList(apiKey: string, accessToken: string): Promise<void> {
  try {
    const response = await fetch('https://api.kite.trade/instruments', {
      headers: {
        'Authorization': `token ${apiKey}:${accessToken}`,
        'X-Kite-Version': '3',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch instrument list');
    }

    const csvData = await response.text();

    // Parse CSV and update INSTRUMENT_TOKENS
    // This is a placeholder - in production, you'd parse the CSV properly
    console.log('Instrument list fetched successfully');

  } catch (error) {
    console.error('Error fetching instrument list:', error);
  }
}

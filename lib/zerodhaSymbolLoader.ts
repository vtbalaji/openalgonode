/**
 * Zerodha Symbol Loader
 * Loads symbol mappings from local JSON file (no Firebase reads)
 *
 * Usage:
 * const token = getZerodhaToken('RELIANCE', 'NSE');
 * const symbol = getZerodhaSymbol(738561);
 * const all = getAllZerodhaSymbols('NSE');
 */

const zerodhaSymbols = require('./data/zerodhasymbol.json');

export interface ZerodhaSymbol {
  symbol: string;
  token: number;
  exchange: string;
  segment: string;
  lotsize: number;
  isIndex?: boolean;
}

// In-memory cache (loaded once at startup)
let symbolMap: Map<string, ZerodhaSymbol> | null = null;
let tokenMap: Map<number, ZerodhaSymbol> | null = null;
let symbolsByExchange: Map<string, ZerodhaSymbol[]> | null = null;

/**
 * Initialize the symbol maps (called once)
 */
function initializeMaps(): void {
  if (symbolMap) return; // Already initialized

  symbolMap = new Map();
  tokenMap = new Map();
  symbolsByExchange = new Map();

  // Process all symbols from JSON
  for (const [docId, symbolData] of Object.entries(zerodhaSymbols)) {
    // Skip metadata fields
    if (docId.startsWith('_')) continue;

    const symbol = symbolData as ZerodhaSymbol;

    // Index by symbol + exchange
    const symbolKey = `${symbol.symbol}_${symbol.exchange}`.toUpperCase();
    symbolMap!.set(symbolKey, symbol);

    // Index by token
    tokenMap!.set(symbol.token, symbol);

    // Index by exchange
    if (!symbolsByExchange!.has(symbol.exchange)) {
      symbolsByExchange!.set(symbol.exchange, []);
    }
    symbolsByExchange!.get(symbol.exchange)!.push(symbol);
  }

  console.log(
    `[ZerodhaSymbolLoader] Loaded ${symbolMap.size} symbol mappings from zerodhasymbol.json`
  );
}

/**
 * Get token for a symbol on specific exchange
 * NO FIREBASE READS - loaded from local JSON
 */
export function getZerodhaToken(symbol: string, exchange: string = 'NSE'): number | null {
  initializeMaps();

  const key = `${symbol.toUpperCase()}_${exchange.toUpperCase()}`;
  const data = symbolMap!.get(key);

  if (data) {
    console.log(`[ZerodhaSymbolLoader] Found token for ${symbol}: ${data.token}`);
    return data.token;
  }

  console.warn(`[ZerodhaSymbolLoader] No token found for ${symbol} on ${exchange}`);
  return null;
}

/**
 * Get symbol from token
 * NO FIREBASE READS - loaded from local JSON
 */
export function getZerodhaSymbol(token: number): ZerodhaSymbol | null {
  initializeMaps();

  const data = tokenMap!.get(token);

  if (data) {
    console.log(`[ZerodhaSymbolLoader] Found symbol for token ${token}: ${data.symbol}`);
    return data;
  }

  console.warn(`[ZerodhaSymbolLoader] No symbol found for token ${token}`);
  return null;
}

/**
 * Get all symbols for an exchange
 */
export function getZerodhaSymbolsByExchange(exchange: string = 'NSE'): ZerodhaSymbol[] {
  initializeMaps();

  const symbols = symbolsByExchange!.get(exchange.toUpperCase());

  if (symbols) {
    console.log(
      `[ZerodhaSymbolLoader] Found ${symbols.length} symbols for exchange ${exchange}`
    );
    return symbols;
  }

  console.warn(`[ZerodhaSymbolLoader] No symbols found for exchange ${exchange}`);
  return [];
}

/**
 * Get all symbols
 */
export function getAllZerodhaSymbols(): ZerodhaSymbol[] {
  initializeMaps();

  const all: ZerodhaSymbol[] = [];
  symbolMap!.forEach((symbol) => {
    if (!all.find((s) => s.token === symbol.token)) {
      all.push(symbol);
    }
  });

  return all;
}

/**
 * Search symbols (fuzzy match on symbol name)
 */
export function searchZerodhaSymbols(
  searchTerm: string,
  exchange?: string
): ZerodhaSymbol[] {
  initializeMaps();

  const searchUpper = searchTerm.toUpperCase();
  const results: ZerodhaSymbol[] = [];
  const seen = new Set<number>();

  // Get symbols to search
  const toSearch = exchange
    ? symbolsByExchange!.get(exchange.toUpperCase()) || []
    : Array.from(symbolMap!.values());

  // Filter by search term
  for (const symbol of toSearch) {
    if (!seen.has(symbol.token)) {
      if (symbol.symbol.includes(searchUpper)) {
        results.push(symbol);
        seen.add(symbol.token);
      }
    }
  }

  console.log(
    `[ZerodhaSymbolLoader] Search "${searchTerm}" found ${results.length} symbols`
  );
  return results;
}

/**
 * Check if symbol exists
 */
export function zerodhaSymbolExists(symbol: string, exchange: string = 'NSE'): boolean {
  initializeMaps();

  const key = `${symbol.toUpperCase()}_${exchange.toUpperCase()}`;
  return symbolMap!.has(key);
}

/**
 * Get detailed symbol info
 */
export function getZerodhaSymbolInfo(symbol: string, exchange: string = 'NSE'): ZerodhaSymbol | null {
  initializeMaps();

  const key = `${symbol.toUpperCase()}_${exchange.toUpperCase()}`;
  return symbolMap!.get(key) || null;
}

/**
 * Statistics
 */
export function getZerodhaSymbolStats(): {
  totalSymbols: number;
  exchanges: Record<string, number>;
  lastUpdated: string;
} {
  initializeMaps();

  const stats: Record<string, number> = {};
  symbolsByExchange!.forEach((symbols, exchange) => {
    stats[exchange] = symbols.length;
  });

  return {
    totalSymbols: symbolMap!.size,
    exchanges: stats,
    lastUpdated: zerodhaSymbols['_lastUpdated'] || 'unknown',
  };
}

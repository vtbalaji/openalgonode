import { adminDb } from '@/lib/firebaseAdmin';

export interface BrokerSymbol {
  token: number;
  symbol: string;
  exchange: string;
  segment?: string;
  expiry?: string;
  strikePrice?: number;
  optionType?: string;
}

// Cache for symbols to avoid repeated Firestore reads
let symbolCache: Map<string, Map<string, BrokerSymbol>> = new Map();
let cacheTimestamp: Map<string, number> = new Map();
const CACHE_TTL = 3600000; // 1 hour

/**
 * Get all symbols for a specific broker from Firebase
 */
export async function getBrokerSymbols(broker: string): Promise<Map<string, BrokerSymbol>> {
  // Check cache
  if (symbolCache.has(broker)) {
    const timestamp = cacheTimestamp.get(broker) || 0;
    if (Date.now() - timestamp < CACHE_TTL) {
      return symbolCache.get(broker)!;
    }
  }

  try {
    const snapshot = await adminDb
      .collection('brokerSymbols')
      .doc(broker)
      .collection('symbols')
      .get();

    const symbols = new Map<string, BrokerSymbol>();

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Handle both old and new compact field formats
      const symbol = doc.id; // Symbol is the document ID
      const token = data.t || data.token;
      const exchange = data.e || data.exchange;

      if (token) {
        symbols.set(symbol, {
          token,
          symbol,
          exchange,
          segment: data.segment,
          expiry: data.x || data.expiry,
          strikePrice: data.s || data.strikePrice,
          optionType: data.o || data.optionType,
        });
      }
    });

    // Update cache
    symbolCache.set(broker, symbols);
    cacheTimestamp.set(broker, Date.now());

    console.log(`Loaded ${symbols.size} symbols for ${broker} from Firebase`);
    return symbols;
  } catch (error) {
    console.error(`Error loading symbols for ${broker}:`, error);
    // Return empty map on error
    return new Map();
  }
}

/**
 * Get token for a specific symbol from a broker
 */
export async function getBrokerSymbolToken(
  broker: string,
  symbol: string
): Promise<number | null> {
  const symbols = await getBrokerSymbols(broker);
  const upperSymbol = symbol.toUpperCase().trim();
  const brokerSymbol = symbols.get(upperSymbol);
  return brokerSymbol?.token || null;
}

/**
 * Get all available symbols for a broker
 */
export async function getBrokerSymbolsList(broker: string): Promise<string[]> {
  const symbols = await getBrokerSymbols(broker);
  return Array.from(symbols.keys()).sort();
}

/**
 * Clear cache (useful for manual refresh)
 */
export function clearSymbolCache(broker?: string): void {
  if (broker) {
    symbolCache.delete(broker);
    cacheTimestamp.delete(broker);
  } else {
    symbolCache.clear();
    cacheTimestamp.clear();
  }
}

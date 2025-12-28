/**
 * Symbol Mapping Service
 * Manages the mapping between standardized OpenAlgo symbols and broker-specific identifiers
 * Follows OpenAlgo architecture with symbol + brsymbol + token pattern
 */

import { adminDb } from './firebaseAdmin';

export interface SymbolMapping {
  // Standard OpenAlgo fields
  symbol: string;                    // e.g., "RELIANCE" (standardized)
  exchange: string;                  // e.g., "NSE"

  // Broker-specific fields
  broker: string;                    // e.g., "angel", "zerodha"
  brsymbol: string;                  // Broker symbol (e.g., "RELIANCE-EQ")
  token: string;                     // Broker token (e.g., "2885")

  // Metadata
  lotsize?: number;                  // Minimum lot size
  ticksize?: number;                 // Minimum price movement
  instrumenttype?: string;           // "EQUITY", "FUTIND", "OPTSTK", etc.
  expirydate?: string;               // For derivatives

  // Tracking
  lastUpdated: Date;
  source: 'masterfile' | 'manual' | 'discovery';
}

/**
 * Firestore collection path: brokers/{broker}/symbols/{docId}
 * Document ID format: {exchange}_{symbol}
 * Example: NSE_RELIANCE
 */

const COLLECTION_PATH = 'symbolMappings';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache
const symbolCache = new Map<string, { data: SymbolMapping; timestamp: number }>();

/**
 * Get symbol mapping for a specific symbol/exchange/broker
 * Returns cached result if available, otherwise queries Firestore
 */
export async function getSymbolMapping(
  symbol: string,
  exchange: string,
  broker: string
): Promise<SymbolMapping | null> {
  const cacheKey = `${broker}_${exchange}_${symbol}`;

  // Check cache
  const cached = symbolCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[symbolMapping] Cache hit for ${cacheKey}`);
    return cached.data;
  }

  try {
    // Query Firestore
    const docId = `${broker}_${exchange}_${symbol}`;
    const docRef = adminDb.collection(COLLECTION_PATH).doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.warn(`[symbolMapping] No mapping found for ${cacheKey}`);
      return null;
    }

    const data = doc.data() as SymbolMapping;

    // Cache the result
    symbolCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    return data;
  } catch (error) {
    console.error(`[symbolMapping] Error fetching mapping for ${cacheKey}:`, error);
    return null;
  }
}

/**
 * Search for symbol mapping with fuzzy matching
 * Useful when exact symbol doesn't match but similar ones do
 */
export async function searchSymbolMappings(
  searchSymbol: string,
  exchange: string,
  broker: string,
  limit: number = 5
): Promise<SymbolMapping[]> {
  try {
    const snapshot = await adminDb
      .collection(COLLECTION_PATH)
      .where('exchange', '==', exchange)
      .where('broker', '==', broker)
      .where('symbol', '>=', searchSymbol)
      .where('symbol', '<=', searchSymbol + '\uf8ff')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as SymbolMapping);
  } catch (error) {
    console.error(`[symbolMapping] Error searching symbols:`, error);
    return [];
  }
}

/**
 * Store a symbol mapping in Firestore
 * Called during initialization or manual addition
 */
export async function saveSymbolMapping(mapping: SymbolMapping): Promise<void> {
  try {
    const docId = `${mapping.broker}_${mapping.exchange}_${mapping.symbol}`;
    await adminDb
      .collection(COLLECTION_PATH)
      .doc(docId)
      .set(mapping, { merge: true });

    // Update cache
    const cacheKey = `${mapping.broker}_${mapping.exchange}_${mapping.symbol}`;
    symbolCache.set(cacheKey, {
      data: mapping,
      timestamp: Date.now(),
    });

    console.log(`[symbolMapping] Saved mapping for ${docId}`);
  } catch (error) {
    console.error(`[symbolMapping] Error saving mapping:`, error);
    throw error;
  }
}

/**
 * Batch save multiple symbol mappings (used during initialization)
 */
export async function saveSymbolMappingsBatch(
  mappings: SymbolMapping[],
  batchSize: number = 500
): Promise<void> {
  let batch = adminDb.batch();
  let count = 0;

  for (const mapping of mappings) {
    const docId = `${mapping.broker}_${mapping.exchange}_${mapping.symbol}`;
    const docRef = adminDb.collection(COLLECTION_PATH).doc(docId);

    batch.set(docRef, mapping, { merge: true });

    count++;

    // Commit batch every N documents
    if (count % batchSize === 0) {
      await batch.commit();
      console.log(`[symbolMapping] Committed ${count} mappings`);
      batch = adminDb.batch();
    }
  }

  // Commit remaining
  if (count % batchSize !== 0) {
    await batch.commit();
    console.log(`[symbolMapping] Committed final ${count % batchSize} mappings`);
  }
}

/**
 * Clear the in-memory cache (used for testing or manual refresh)
 */
export function clearCache(): void {
  symbolCache.clear();
  console.log('[symbolMapping] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  entries: number;
} {
  let size = 0;
  let entries = 0;

  for (const [key, value] of symbolCache.entries()) {
    entries++;
    size += key.length + JSON.stringify(value.data).length;
  }

  return {
    size: Math.round(size / 1024), // KB
    entries,
  };
}

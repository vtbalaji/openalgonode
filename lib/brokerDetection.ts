/**
 * Broker Detection Utility
 * Auto-detect user's active broker configuration
 * CACHED to reduce Firebase quota usage
 */

import { adminDb } from './firebaseAdmin';

// In-memory cache: { userId: { brokers: string[], timestamp: number } }
const brokerCache = new Map<string, { brokers: string[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get user's configured brokers (CACHED)
 * Returns list of all configured broker IDs (regardless of authentication status)
 * Used for broker selection/detection
 *
 * Cache: 5 minute TTL per user to reduce Firestore reads
 */
export async function getConfiguredBrokers(userId: string): Promise<string[]> {
  try {
    // Check cache first
    const cached = brokerCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[BrokerCache] HIT for ${userId} - brokers: ${cached.brokers.join(',')}`);
      return cached.brokers;
    }

    // Cache miss - fetch from Firebase
    console.log(`[BrokerCache] MISS for ${userId} - fetching from Firebase`);
    const brokerSnapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('brokerConfig')
      .get();

    const brokers = brokerSnapshot.docs.map((doc) => doc.id);

    // Cache the result
    brokerCache.set(userId, { brokers, timestamp: Date.now() });

    return brokers;
  } catch (error) {
    console.error('Error getting configured brokers:', error);
    return [];
  }
}

/**
 * Clear cache for a user (call this after broker config changes)
 */
export function clearBrokerCache(userId: string): void {
  brokerCache.delete(userId);
  console.log(`[BrokerCache] Cleared for ${userId}`);
}

// In-memory cache for active brokers: { userId: { brokers: string[], timestamp: number } }
const activeBrokerCache = new Map<string, { brokers: string[]; timestamp: number }>();

/**
 * Get user's active brokers (CACHED)
 * Returns list of active broker IDs (fully authenticated)
 *
 * Cache: 5 minute TTL per user to reduce Firestore reads
 */
export async function getActiveBrokers(userId: string): Promise<string[]> {
  try {
    // Check cache first
    const cached = activeBrokerCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[ActiveBrokerCache] HIT for ${userId} - brokers: ${cached.brokers.join(',')}`);
      return cached.brokers;
    }

    // Cache miss - fetch from Firebase
    console.log(`[ActiveBrokerCache] MISS for ${userId} - fetching from Firebase`);
    const brokerSnapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('brokerConfig')
      .where('status', '==', 'active')
      .get();

    const brokers = brokerSnapshot.docs.map((doc) => doc.id);

    // Cache the result
    activeBrokerCache.set(userId, { brokers, timestamp: Date.now() });

    return brokers;
  } catch (error) {
    console.error('Error getting active brokers:', error);
    return [];
  }
}

/**
 * Clear active broker cache for a user (call after broker status changes)
 */
export function clearActiveBrokerCache(userId: string): void {
  activeBrokerCache.delete(userId);
  console.log(`[ActiveBrokerCache] Cleared for ${userId}`);
}

/**
 * Get primary active broker (first active broker found)
 * If multiple brokers are active, returns the first one
 */
export async function getPrimaryActiveBroker(userId: string): Promise<string | null> {
  const activeBrokers = await getActiveBrokers(userId);
  return activeBrokers.length > 0 ? activeBrokers[0] : null;
}

/**
 * Resolve broker to use
 * Priority:
 * 1. User-specified broker (if provided)
 * 2. Primary active broker (if multiple, returns first)
 * 3. null if no active brokers found
 */
export async function resolveBroker(userId: string, brokerParam?: string): Promise<string | null> {
  // If broker explicitly specified, use it
  if (brokerParam) {
    return brokerParam;
  }

  // Otherwise, auto-detect primary active broker
  return getPrimaryActiveBroker(userId);
}

/**
 * Check if broker is active for user
 */
export async function isBrokerActive(userId: string, broker: string): Promise<boolean> {
  try {
    const doc = await adminDb
      .collection('users')
      .doc(userId)
      .collection('brokerConfig')
      .doc(broker)
      .get();

    return doc.exists && doc.data()?.status === 'active';
  } catch (error) {
    console.error(`Error checking broker ${broker}:`, error);
    return false;
  }
}

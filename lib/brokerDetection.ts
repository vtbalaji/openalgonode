/**
 * Broker Detection Utility
 * Auto-detect user's active broker configuration
 */

import { adminDb } from './firebaseAdmin';

/**
 * Get user's configured brokers
 * Returns list of all configured broker IDs (regardless of authentication status)
 * Used for broker selection/detection
 */
export async function getConfiguredBrokers(userId: string): Promise<string[]> {
  try {
    const brokerSnapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('brokerConfig')
      .get();

    return brokerSnapshot.docs.map((doc) => doc.id);
  } catch (error) {
    console.error('Error getting configured brokers:', error);
    return [];
  }
}

/**
 * Get user's active brokers
 * Returns list of active broker IDs (fully authenticated)
 */
export async function getActiveBrokers(userId: string): Promise<string[]> {
  try {
    const brokerSnapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('brokerConfig')
      .where('status', '==', 'active')
      .get();

    return brokerSnapshot.docs.map((doc) => doc.id);
  } catch (error) {
    console.error('Error getting active brokers:', error);
    return [];
  }
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

/**
 * Broker Config Cache Service
 * Caches brokerConfig in memory to prevent repeated Firebase reads
 * Reduces 19 API endpoints from 1 READ per request to 1 READ per 5 minutes
 */

import { adminDb } from '@/lib/firebaseAdmin';

interface CachedBrokerConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  status: string;
  lastAuthenticated?: string;
  [key: string]: any;
}

interface CacheEntry {
  data: CachedBrokerConfig;
  timestamp: number;
  expiresAt: number;
}

class BrokerConfigCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes (increased to reduce Firebase reads)
  private readonly CHECK_INTERVAL = 60 * 1000; // Check every 1 minute
  private failureCache: Map<string, number> = new Map(); // Track Firestore failures

  constructor() {
    // Periodically clean up expired entries
    setInterval(() => this.cleanupExpired(), this.CHECK_INTERVAL);
  }

  /**
   * Get cache key for user + broker combo
   */
  private getCacheKey(userId: string, broker: string): string {
    return `${userId}:${broker}`;
  }

  /**
   * Check if cache entry is valid
   */
  private isValid(entry: CacheEntry): boolean {
    return Date.now() < entry.expiresAt;
  }

  /**
   * Get broker config (from cache or Firebase)
   */
  async get(userId: string, broker: string): Promise<CachedBrokerConfig | null> {
    const key = this.getCacheKey(userId, broker);

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && this.isValid(cached)) {
      console.log(`BrokerConfigCache HIT: ${key}`);
      return cached.data;
    }

    // Cache miss or expired - fetch from Firebase
    console.log(`BrokerConfigCache MISS: ${key} - fetching from Firebase`);
    try {
      const docSnap = await adminDb
        .collection('users')
        .doc(userId)
        .collection('brokerConfig')
        .doc(broker)
        .get();

      if (!docSnap.exists) {
        // Cache negative result to avoid repeated reads
        this.set(key, null);
        return null;
      }

      const data = docSnap.data() as CachedBrokerConfig;
      if (!data) {
        this.set(key, null);
        return null;
      }

      // Cache the result
      this.set(key, data);
      return data;
    } catch (error) {
      console.error(`Error fetching broker config from Firebase:`, error);
      return null;
    }
  }

  /**
   * Cache a broker config entry
   */
  private set(key: string, data: CachedBrokerConfig | null): void {
    const now = Date.now();
    const expiresAt = now + this.TTL_MS;

    if (data === null) {
      // Cache negative result (document doesn't exist)
      this.cache.set(key, {
        data: {} as CachedBrokerConfig,
        timestamp: now,
        expiresAt,
      });
    } else {
      this.cache.set(key, {
        data,
        timestamp: now,
        expiresAt,
      });
    }
  }

  /**
   * Invalidate cache entry (force refresh on next request)
   * Call this after broker config is updated
   */
  invalidate(userId: string, broker: string): void {
    const key = this.getCacheKey(userId, broker);
    this.cache.delete(key);
    console.log(`BrokerConfigCache INVALIDATED: ${key}`);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`BrokerConfigCache cleared (${size} entries removed)`);
  }

  /**
   * Remove expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`BrokerConfigCache cleanup: removed ${removed} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      ttlMinutes: this.TTL_MS / 60000,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        isValid: this.isValid(entry),
        expiresInSeconds: Math.round((entry.expiresAt - Date.now()) / 1000),
      })),
    };
  }
}

// Singleton instance
let cacheInstance: BrokerConfigCache | null = null;

export function getBrokerConfigCache(): BrokerConfigCache {
  if (!cacheInstance) {
    cacheInstance = new BrokerConfigCache();
  }
  return cacheInstance;
}

/**
 * Invalidate broker config cache entry for a specific user and broker
 * Call this after updating broker credentials
 */
export function invalidateBrokerConfigCache(userId: string, broker: string): void {
  const cache = getBrokerConfigCache();
  cache.invalidate(userId, broker);
}

export default BrokerConfigCache;

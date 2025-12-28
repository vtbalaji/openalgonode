/**
 * API Key Utility Functions
 * Generate, validate, and manage API keys
 */

import crypto from 'crypto';
import { adminDb } from './firebaseAdmin';
import { ApiKey, ApiKeyPermissions, DEFAULT_PERMISSIONS } from './types/apikey';

/**
 * Generate a random API key
 * Format: ak_live_<32_random_chars>
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `ak_live_${randomBytes}`;
}

/**
 * Generate a random API secret
 * Format: sk_live_<48_random_chars>
 */
export function generateApiSecret(): string {
  const randomBytes = crypto.randomBytes(36).toString('hex');
  return `sk_live_${randomBytes}`;
}

/**
 * Hash API key for storage (one-way hash)
 * We store hash in DB, compare hashes during auth
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(
  userId: string,
  name: string,
  broker: string,
  permissions: Partial<ApiKeyPermissions> = {},
  expiresInDays?: number
): Promise<{ key: string; secret: string; id: string }> {
  const key = generateApiKey();
  const secret = generateApiSecret();
  const keyHash = hashApiKey(key);

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const apiKeyData: Omit<ApiKey, 'id'> = {
    userId,
    name,
    key: keyHash, // Store hash, not plaintext
    secret: hashApiKey(secret), // Hash secret too
    broker,
    permissions: { ...DEFAULT_PERMISSIONS, ...permissions },
    status: 'active',
    createdAt: new Date(),
    usageCount: 0,
    ...(expiresAt && { expiresAt }),
  };

  // Store in Firestore
  const docRef = await adminDb.collection('apiKeys').add(apiKeyData);

  // Return plaintext key/secret ONLY once (user must save it)
  return {
    id: docRef.id,
    key, // Plaintext - only returned once
    secret, // Plaintext - only returned once
  };
}

/**
 * Validate an API key and return user info
 * Returns null if invalid
 */
export async function validateApiKey(
  apiKey: string
): Promise<{ userId: string; broker: string; permissions: ApiKeyPermissions } | null> {
  const keyHash = hashApiKey(apiKey);

  // Query Firestore for this key hash
  const snapshot = await adminDb
    .collection('apiKeys')
    .where('key', '==', keyHash)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null; // Invalid key
  }

  const doc = snapshot.docs[0];
  const data = doc.data() as Omit<ApiKey, 'id'>;

  // Check expiry
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
    return null; // Expired
  }

  // Update last used timestamp and usage count
  await doc.ref.update({
    lastUsedAt: new Date(),
    usageCount: (data.usageCount || 0) + 1,
  });

  return {
    userId: data.userId,
    broker: data.broker,
    permissions: data.permissions,
  };
}

/**
 * Get all API keys for a user
 */
export async function getUserApiKeys(userId: string): Promise<Omit<ApiKey, 'secret'>[]> {
  const snapshot = await adminDb
    .collection('apiKeys')
    .where('userId', '==', userId)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as Omit<ApiKey, 'id'>;
      const { secret, ...rest } = data; // Exclude secret
      return {
        id: doc.id,
        ...rest,
      } as Omit<ApiKey, 'secret'>;
    })
    .sort((a, b) => {
      // Sort by createdAt descending (newest first)
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt as any)?._seconds * 1000 || 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt as any)?._seconds * 1000 || 0;
      return dateB - dateA;
    });
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const docRef = adminDb.collection('apiKeys').doc(keyId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return false;
  }

  const data = doc.data() as Omit<ApiKey, 'id'>;

  // Ensure user owns this key
  if (data.userId !== userId) {
    return false;
  }

  // Mark as revoked
  await docRef.update({
    status: 'revoked',
  });

  return true;
}

/**
 * Delete an API key permanently
 */
export async function deleteApiKey(userId: string, keyId: string): Promise<boolean> {
  const docRef = adminDb.collection('apiKeys').doc(keyId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return false;
  }

  const data = doc.data() as Omit<ApiKey, 'id'>;

  // Ensure user owns this key
  if (data.userId !== userId) {
    return false;
  }

  await docRef.delete();
  return true;
}

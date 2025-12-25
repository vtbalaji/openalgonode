/**
 * API Key Types
 * For external API access (TradingView, Python scripts, etc.)
 */

export interface ApiKey {
  id: string;                    // Firestore document ID
  userId: string;                // Firebase user ID who owns this key
  name: string;                  // User-friendly name (e.g., "TradingView", "Python Script")
  key: string;                   // The actual API key (e.g., "ak_live_abc123...")
  secret: string;                // Secret for additional security (optional, encrypted)
  broker: string;                // Which broker this key is for (zerodha, angel, etc.)
  permissions: ApiKeyPermissions; // What this key can do
  status: 'active' | 'revoked';  // Active or revoked
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;              // Optional expiry
  ipWhitelist?: string[];        // Optional IP whitelist
  usageCount: number;            // How many times used
}

export interface ApiKeyPermissions {
  placeorder: boolean;
  cancelorder: boolean;
  modifyorder: boolean;
  closeposition: boolean;
  vieworders: boolean;
  viewpositions: boolean;
  viewholdings: boolean;
  viewfunds: boolean;
}

export const DEFAULT_PERMISSIONS: ApiKeyPermissions = {
  placeorder: true,
  cancelorder: true,
  modifyorder: true,
  closeposition: true,
  vieworders: true,
  viewpositions: true,
  viewholdings: true,
  viewfunds: true,
};

export interface CreateApiKeyRequest {
  name: string;
  broker: string;
  permissions?: Partial<ApiKeyPermissions>;
  expiresInDays?: number;
}

export interface CreateApiKeyResponse {
  id: string;
  key: string;
  secret?: string;
  message: string;
}

export interface ListApiKeysResponse {
  keys: Omit<ApiKey, 'secret'>[]; // Don't expose secrets in list
}

export interface RevokeApiKeyRequest {
  keyId: string;
}

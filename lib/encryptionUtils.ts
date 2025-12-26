/**
 * Centralized Encryption/Decryption Utilities
 * All credential encryption/decryption logic in one place
 * Uses AES encryption with key from NEXT_PUBLIC_ENCRYPTION_KEY
 *
 * CRITICAL: NEXT_PUBLIC_ENCRYPTION_KEY environment variable MUST be set
 * If missing, encryption will fail to prevent accidental use of weak keys
 */

import CryptoJS from 'crypto-js';

// Get encryption key - FAIL if not provided
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY;

// Warn in development if key is missing
if (!ENCRYPTION_KEY) {
  const message = 'CRITICAL: NEXT_PUBLIC_ENCRYPTION_KEY environment variable is missing! Credentials cannot be encrypted.';
  console.error(message);
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
}

/**
 * Encrypt sensitive data (API keys, tokens, secrets)
 * @param data - Plain text to encrypt
 * @returns - AES encrypted string
 * @throws - Error if encryption fails or key is not configured
 */
export function encryptData(data: string): string {
  if (!data) {
    throw new Error('Cannot encrypt empty data');
  }

  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured. Set NEXT_PUBLIC_ENCRYPTION_KEY environment variable.');
  }

  try {
    return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt encrypted data
 * @param encryptedData - AES encrypted string
 * @returns - Decrypted plain text
 * @throws - Error if decryption fails or data is invalid
 */
export function decryptData(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty data');
  }

  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured. Set NEXT_PUBLIC_ENCRYPTION_KEY environment variable.');
  }

  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted || decrypted.trim() === '') {
      throw new Error('Decrypted credential is empty or corrupted. Please re-authenticate or reconfigure broker.');
    }

    return decrypted;
  } catch (error) {
    // Provide detailed error message for debugging
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Decryption error:', errorMsg);
    throw new Error(`Failed to decrypt credential: ${errorMsg}`);
  }
}

/**
 * Validate encrypted credential
 * Decrypts and checks if it's valid (not empty)
 * @param encryptedData - Encrypted credential
 * @returns - { isValid: boolean, error?: string, decrypted?: string }
 */
export function validateEncryptedCredential(encryptedData: string): {
  isValid: boolean;
  error?: string;
  decrypted?: string;
} {
  try {
    const decrypted = decryptData(encryptedData);
    return {
      isValid: true,
      decrypted,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Validate all required credentials
 * @param credentials - Object with encrypted credentials
 * @returns - { isValid: boolean, errors: { [key]: string } }
 */
export function validateCredentials(credentials: Record<string, string>): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (!value) {
      errors[key] = `${key} is missing`;
      continue;
    }

    const validation = validateEncryptedCredential(value);
    if (!validation.isValid) {
      errors[key] = validation.error || `${key} validation failed`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

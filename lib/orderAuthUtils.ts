import { authenticateApiKey } from '@/lib/apiKeyAuth';
import { adminAuth } from '@/lib/firebaseAdmin';
import { NextResponse } from 'next/server';

/**
 * Authentication context returned after successful authentication
 */
export interface AuthContext {
  userId: string;
  broker: string;
  permissions?: any;
}

/**
 * Authenticate order requests
 * Supports 3 authentication methods:
 * 1. API key in request body
 * 2. Bearer token in Authorization header (Firebase)
 * 3. Authorization header formats:
 *    - Basic base64(api_key:access_token)
 *    - Plain api_key:access_token
 */
export async function authenticateOrderRequest(
  authHeader: string | null,
  apiKeyFromBody?: string
): Promise<{ success: boolean; context?: AuthContext; error?: string }> {
  // Method 1: API key in request body
  if (apiKeyFromBody) {
    const authResult = await authenticateApiKey(apiKeyFromBody);
    if (!authResult.success) {
      return {
        success: false,
        error: 'Invalid API key',
      };
    }

    return {
      success: true,
      context: {
        userId: authResult.context.userId,
        broker: authResult.context.broker,
        permissions: authResult.context.permissions,
      },
    };
  }

  // Method 2-4: Authorization header
  if (!authHeader) {
    return {
      success: false,
      error: 'Authorization header missing. Format: api_key:access_token or Bearer <token>',
    };
  }

  // Try Bearer token (Firebase)
  if (authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7);

    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      return {
        success: true,
        context: {
          userId: decodedToken.uid,
          broker: 'zerodha',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: 'Invalid or expired token',
      };
    }
  }

  // Try Basic auth format: Authorization: Basic base64(api_key:access_token)
  if (authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [apikey] = credentials.split(':');

    if (!apikey) {
      return {
        success: false,
        error: 'Invalid authorization format. Expected: api_key:access_token',
      };
    }

    const authResult = await authenticateApiKey(apikey);
    if (!authResult.success) {
      return {
        success: false,
        error: 'Invalid API key',
      };
    }

    return {
      success: true,
      context: {
        userId: authResult.context.userId,
        broker: authResult.context.broker,
        permissions: authResult.context.permissions,
      },
    };
  }

  // Try plain format: Authorization: api_key:access_token
  if (authHeader.includes(':')) {
    const [apikey] = authHeader.split(':');

    const authResult = await authenticateApiKey(apikey);
    if (!authResult.success) {
      return {
        success: false,
        error: 'Invalid API key',
      };
    }

    return {
      success: true,
      context: {
        userId: authResult.context.userId,
        broker: authResult.context.broker,
        permissions: authResult.context.permissions,
      },
    };
  }

  return {
    success: false,
    error: 'Authorization value should atleast be `api_key:access_token` or Bearer token',
  };
}

/**
 * Return a standardized error response for authentication failures
 */
export function authErrorResponse(error: string) {
  return NextResponse.json(
    { error },
    { status: 401 }
  );
}

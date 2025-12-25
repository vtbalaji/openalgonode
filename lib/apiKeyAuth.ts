/**
 * API Key Authentication Middleware
 * For OpenAlgo v1 API endpoints
 */

import { NextResponse } from 'next/server';
import { validateApiKey } from './apiKeyUtils';
import { ApiKeyPermissions } from './types/apikey';

export interface ApiKeyAuthContext {
  userId: string;
  broker: string;
  permissions: ApiKeyPermissions;
}

/**
 * Authenticate request using API key from request body
 * Returns auth context if valid, or error response if invalid
 */
export async function authenticateApiKey(
  apikey: string | undefined
): Promise<{ success: true; context: ApiKeyAuthContext } | { success: false; response: NextResponse }> {
  // Check if API key is provided
  if (!apikey) {
    return {
      success: false,
      response: NextResponse.json(
        {
          status: 'error',
          message: 'Missing required field: apikey',
        },
        { status: 401 }
      ),
    };
  }

  // Validate API key
  const authContext = await validateApiKey(apikey);

  if (!authContext) {
    return {
      success: false,
      response: NextResponse.json(
        {
          status: 'error',
          message: 'Invalid or expired API key',
        },
        { status: 401 }
      ),
    };
  }

  return {
    success: true,
    context: authContext,
  };
}

/**
 * Check if API key has specific permission
 */
export function hasPermission(
  permissions: ApiKeyPermissions,
  permission: keyof ApiKeyPermissions
): boolean {
  return permissions[permission] === true;
}

/**
 * Require specific permission, return error if not granted
 */
export function requirePermission(
  permissions: ApiKeyPermissions,
  permission: keyof ApiKeyPermissions
): NextResponse | null {
  if (!hasPermission(permissions, permission)) {
    return NextResponse.json(
      {
        status: 'error',
        message: `API key does not have '${permission}' permission`,
      },
      { status: 403 }
    );
  }
  return null;
}

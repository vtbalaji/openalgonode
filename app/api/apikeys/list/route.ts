import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getUserApiKeys } from '@/lib/apiKeyUtils';
import { ListApiKeysResponse } from '@/lib/types/apikey';

/**
 * GET /api/apikeys/list
 * Get all API keys for the authenticated user
 * Requires: Firebase ID token in Authorization header
 */
export async function GET(request: NextRequest) {
  try {
    // Get Firebase ID token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);

    // Verify the token
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Get all API keys for this user
    const keys = await getUserApiKeys(userId);

    const response: ListApiKeysResponse = {
      keys,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys' },
      { status: 500 }
    );
  }
}

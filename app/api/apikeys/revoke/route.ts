import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { revokeApiKey, deleteApiKey } from '@/lib/apiKeyUtils';
import { RevokeApiKeyRequest } from '@/lib/types/apikey';

/**
 * POST /api/apikeys/revoke
 * Revoke an API key (mark as inactive)
 * Requires: Firebase ID token in Authorization header
 */
export async function POST(request: NextRequest) {
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
    const body: RevokeApiKeyRequest = await request.json();

    // Validate request
    if (!body.keyId) {
      return NextResponse.json(
        { error: 'Missing required field: keyId' },
        { status: 400 }
      );
    }

    // Revoke the API key
    const success = await revokeApiKey(userId, body.keyId);

    if (!success) {
      return NextResponse.json(
        { error: 'API key not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'API key revoked successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error revoking API key:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/apikeys/revoke
 * Permanently delete an API key
 * Requires: Firebase ID token in Authorization header
 */
export async function DELETE(request: NextRequest) {
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
    const keyId = request.nextUrl.searchParams.get('keyId');

    // Validate request
    if (!keyId) {
      return NextResponse.json(
        { error: 'Missing required parameter: keyId' },
        { status: 400 }
      );
    }

    // Delete the API key permanently
    const success = await deleteApiKey(userId, keyId);

    if (!success) {
      return NextResponse.json(
        { error: 'API key not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'API key deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}

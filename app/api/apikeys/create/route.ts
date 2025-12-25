import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { createApiKey } from '@/lib/apiKeyUtils';
import { CreateApiKeyRequest, CreateApiKeyResponse } from '@/lib/types/apikey';

/**
 * POST /api/apikeys/create
 * Create a new API key for external API access
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
    const body: CreateApiKeyRequest = await request.json();

    // Validate request
    if (!body.name || !body.broker) {
      return NextResponse.json(
        { error: 'Missing required fields: name, broker' },
        { status: 400 }
      );
    }

    // Create API key
    const { id, key, secret } = await createApiKey(
      userId,
      body.name,
      body.broker,
      body.permissions,
      body.expiresInDays
    );

    const response: CreateApiKeyResponse = {
      id,
      key,
      secret,
      message: 'API key created successfully. Save the key and secret - you will not be able to see them again!',
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}

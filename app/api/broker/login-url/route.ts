import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import CryptoJS from 'crypto-js';
import { buildBrokerLoginUrl } from '@/lib/brokerConfig';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * GET /api/broker/login-url
 * Get broker login URL with API key
 * Requires: Authorization header with Firebase ID token
 */
export async function GET(request: NextRequest) {
  try {
    // Get the Firebase ID token from Authorization header
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
    const broker = request.nextUrl.searchParams.get('broker');

    if (!broker) {
      return NextResponse.json(
        { error: 'Missing required parameter: broker' },
        { status: 400 }
      );
    }

    // Retrieve broker config from cache
    const data = await getCachedBrokerConfig(userId, broker);

    if (!data) {
      return NextResponse.json(
        { error: 'Broker configuration not found. Please configure your broker first.' },
        { status: 404 }
      );
    }

    const encryptedApiKey = data.apiKey;

    // Decrypt API key
    const apiKey = decryptData(encryptedApiKey);

    // Get redirect URL from query params or use default callback
    const redirectUrl = request.nextUrl.searchParams.get('redirect_url');

    // Build full callback URL using request origin (server-side)
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost';
    const origin = `${proto}://${host}`;

    // Use clean callback URL without query parameters
    // Broker is tracked in sessionStorage on the frontend
    const fullCallbackUrl = redirectUrl || `${origin}/callback`;

    console.log(`[LOGIN-URL] Building login URL for broker=${broker}:`, {
      proto,
      host,
      origin,
      fullCallbackUrl,
      apiKeyPrefix: apiKey.substring(0, 10),
    });

    // Build login URL
    const loginUrl = buildBrokerLoginUrl(broker, apiKey, fullCallbackUrl);

    if (!loginUrl) {
      console.error(`[LOGIN-URL] Failed to build login URL for broker=${broker}`);
      return NextResponse.json(
        { error: 'Unable to generate login URL for this broker' },
        { status: 400 }
      );
    }

    console.log(`[LOGIN-URL] Successfully built login URL for broker=${broker}`);
    console.log(`[LOGIN-URL] Login URL (masked):`, loginUrl.replace(/client_id=[^&]+/, 'client_id=***').replace(/redirect_uri=[^&]+/, 'redirect_uri=***'));

    return NextResponse.json(
      { loginUrl },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error generating login URL:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate login URL' },
      { status: 500 }
    );
  }
}

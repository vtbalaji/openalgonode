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
    const origin = request.headers.get('x-forwarded-proto') === 'https'
      ? `https://${request.headers.get('x-forwarded-host') || request.headers.get('host')}`
      : `http://${request.headers.get('host')}`;

    // Include broker parameter in callback URL so callback knows which broker this is for
    const baseCallbackUrl = redirectUrl || `${origin}/callback`;
    const callbackUrlWithBroker = new URL(baseCallbackUrl);
    callbackUrlWithBroker.searchParams.set('broker', broker);
    const fullCallbackUrl = callbackUrlWithBroker.toString();

    // Build login URL
    const loginUrl = buildBrokerLoginUrl(broker, apiKey, fullCallbackUrl);

    if (!loginUrl) {
      return NextResponse.json(
        { error: 'Unable to generate login URL for this broker' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { loginUrl, redirectUrl: fullCallbackUrl },
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

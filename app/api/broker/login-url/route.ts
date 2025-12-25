import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import CryptoJS from 'crypto-js';
import { buildBrokerLoginUrl } from '@/lib/brokerConfig';

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
    const broker = request.nextUrl.searchParams.get('broker') || 'zerodha';

    // Retrieve broker config from Firestore
    const userRef = adminDb.collection('users').doc(userId);
    const brokerConfigRef = userRef.collection('brokerConfig').doc(broker);
    const docSnap = await brokerConfigRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Broker configuration not found. Please configure your broker first.' },
        { status: 404 }
      );
    }

    const data = docSnap.data();
    const encryptedApiKey = data.apiKey;

    // Decrypt API key
    const apiKey = decryptData(encryptedApiKey);

    // Get redirect URL from query params or use default callback
    const redirectUrl = request.nextUrl.searchParams.get('redirect_url');

    // Build login URL
    const loginUrl = buildBrokerLoginUrl(broker, apiKey, redirectUrl || undefined);

    if (!loginUrl) {
      return NextResponse.json(
        { error: 'Unable to generate login URL for this broker' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { loginUrl, redirectUrl: redirectUrl || '/callback' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error generating login URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate login URL' },
      { status: 500 }
    );
  }
}

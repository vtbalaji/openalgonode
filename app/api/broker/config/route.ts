import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import CryptoJS from 'crypto-js';
import { getCachedBrokerConfig, invalidateBrokerConfig } from '@/lib/brokerConfigUtils';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function encryptData(data: string): string {
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
}

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/broker/config
 * Save broker configuration (API key and secret)
 * Requires: Authorization header with Firebase ID token
 */
export async function POST(request: NextRequest) {
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
    const { broker, apiKey, apiSecret } = await request.json();

    if (!broker || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Missing required fields: broker, apiKey, apiSecret' },
        { status: 400 }
      );
    }

    // Store in Firestore
    const userRef = adminDb.collection('users').doc(userId);
    const brokerConfigRef = userRef.collection('brokerConfig').doc(broker);

    await brokerConfigRef.set({
      broker,
      apiKey: encryptData(apiKey),
      apiSecret: encryptData(apiSecret),
      status: 'inactive',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    invalidateBrokerConfig(userId, broker);

    return NextResponse.json(
      { success: true, message: 'Broker configuration saved successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error saving broker config:', error);
    return NextResponse.json(
      { error: 'Failed to save broker configuration' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/broker/config
 * Retrieve broker configuration
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

    // Retrieve from cache
    const data = await getCachedBrokerConfig(userId, broker);

    if (!data) {
      return NextResponse.json(
        { error: 'Broker configuration not found' },
        { status: 404 }
      );
    }

    // Verify that authentication is actually valid
    let isValid = true;
    let validationError = null;

    if (data.status === 'active' && data.accessToken) {
      try {
        const decrypted = decryptData(data.accessToken);
        if (!decrypted || decrypted.trim() === '') {
          isValid = false;
          validationError = 'Access token is empty. Please re-authenticate.';
        }
      } catch (error) {
        isValid = false;
        validationError = 'Failed to decrypt access token. Please re-authenticate.';
      }
    } else if (data.status === 'active' && !data.accessToken) {
      isValid = false;
      validationError = 'No access token found. Please authenticate.';
    }

    return NextResponse.json(
      {
        broker: data.broker,
        status: data.status,
        isValid,
        validationError,
        lastUpdated: data.lastUpdated,
        lastAuthenticated: data.lastAuthenticated || null,
        credentialsExist: !!data.apiKey && !!data.apiSecret,  // Check if credentials are saved
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error retrieving broker config:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve broker configuration' },
      { status: 500 }
    );
  }
}

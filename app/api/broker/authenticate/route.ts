import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { authenticateZerodha } from '@/lib/zerodhaClient';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function encryptData(data: string): string {
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
}

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/broker/authenticate
 * Authenticate with Zerodha using request token
 * Exchanges request token for access token
 * Requires: Authorization header with Firebase ID token
 * Body: { broker: "zerodha", requestToken: "token123" }
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
    const { broker, requestToken } = await request.json();

    if (!broker || !requestToken) {
      return NextResponse.json(
        { error: 'Missing required fields: broker, requestToken' },
        { status: 400 }
      );
    }

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

    const configData = docSnap.data();
    if (!configData) {
      return NextResponse.json(
        { error: 'Broker configuration not found' },
        { status: 404 }
      );
    }
    const apiKey = decryptData(configData.apiKey);
    const apiSecret = decryptData(configData.apiSecret);

    // Authenticate with Zerodha
    let accessToken;
    try {
      accessToken = await authenticateZerodha(apiKey, requestToken, apiSecret);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to authenticate with Zerodha' },
        { status: 400 }
      );
    }

    // Combine API key with access token (Zerodha format: api_key:access_token)
    const authToken = `${apiKey}:${accessToken}`;

    // Update Firestore with combined auth token
    await brokerConfigRef.update({
      accessToken: encryptData(authToken),
      status: 'active',
      lastAuthenticated: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Authentication successful',
        broker,
        status: 'active',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error authenticating with broker:', error);
    return NextResponse.json(
      { error: 'Failed to authenticate with broker' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { authenticateZerodha } from '@/lib/zerodhaClient';
import { getCachedBrokerConfig, invalidateBrokerConfig } from '@/lib/brokerConfigUtils';
import { encryptData, decryptData } from '@/lib/encryptionUtils';

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

    // Retrieve broker config from cache
    const configData = await getCachedBrokerConfig(userId, broker);

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker configuration not found. Please configure your broker first.' },
        { status: 404 }
      );
    }

    // Decrypt credentials with error handling
    let apiKey: string;
    let apiSecret: string;
    try {
      apiKey = decryptData(configData.apiKey);
      apiSecret = decryptData(configData.apiSecret);
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials. Please reconfigure your broker.' },
        { status: 400 }
      );
    }

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
    const userRef = adminDb.collection('users').doc(userId);
    const brokerConfigRef = userRef.collection('brokerConfig').doc(broker);
    await brokerConfigRef.update({
      accessToken: encryptData(authToken),
      status: 'active',
      lastAuthenticated: new Date().toISOString(),
    });

    invalidateBrokerConfig(userId, broker);

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

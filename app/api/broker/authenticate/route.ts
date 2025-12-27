import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { authenticateZerodha } from '@/lib/zerodhaClient';
import { authenticateAngel } from '@/lib/angelClient';
import { getCachedBrokerConfig, invalidateBrokerConfig } from '@/lib/brokerConfigUtils';
import { encryptData, decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/broker/authenticate
 * Authenticate with broker (Zerodha or Angel)
 * Zerodha: Exchanges request token for access token
 * Angel: Exchanges clientCode, PIN, TOTP for JWT token
 * Requires: Authorization header with Firebase ID token
 * Body (Zerodha): { broker: "zerodha", requestToken: "token123" }
 * Body (Angel): { broker: "angel", clientCode: "ABC123", pin: "1234", totp: "123456" }
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
    const body = await request.json();
    const { broker } = body;

    if (!broker) {
      return NextResponse.json(
        { error: 'Missing required field: broker' },
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

    // Handle Zerodha authentication
    if (broker === 'zerodha') {
      const { requestToken } = body;

      if (!requestToken) {
        return NextResponse.json(
          { error: 'Missing required field for Zerodha: requestToken' },
          { status: 400 }
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
    }

    // Handle Angel authentication
    else if (broker === 'angel') {
      const { clientCode, pin, totp } = body;

      if (!clientCode || !pin || !totp) {
        return NextResponse.json(
          { error: 'Missing required fields for Angel: clientCode, pin, totp' },
          { status: 400 }
        );
      }

      // Decrypt API key with error handling
      let apiKey: string;
      try {
        apiKey = decryptData(configData.apiKey);
      } catch (error) {
        console.error('Failed to decrypt API key:', error);
        return NextResponse.json(
          { error: 'Failed to decrypt broker credentials. Please reconfigure your broker.' },
          { status: 400 }
        );
      }

      // Authenticate with Angel
      let jwtToken: string;
      let feedToken: string | undefined;
      try {
        const authResult = await authenticateAngel(clientCode, pin, totp, apiKey);
        jwtToken = authResult.jwtToken;
        feedToken = authResult.feedToken;
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || 'Failed to authenticate with Angel Broker' },
          { status: 400 }
        );
      }

      // Update Firestore with JWT token
      const userRef = adminDb.collection('users').doc(userId);
      const brokerConfigRef = userRef.collection('brokerConfig').doc(broker);
      const updateData: any = {
        accessToken: encryptData(jwtToken),
        status: 'active',
        lastAuthenticated: new Date().toISOString(),
      };

      if (feedToken) {
        updateData.feedToken = encryptData(feedToken);
      }

      await brokerConfigRef.update(updateData);

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
    }

    // Unknown broker
    else {
      return NextResponse.json(
        { error: `Broker '${broker}' is not supported` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error authenticating with broker:', error);
    return NextResponse.json(
      { error: 'Failed to authenticate with broker' },
      { status: 500 }
    );
  }
}

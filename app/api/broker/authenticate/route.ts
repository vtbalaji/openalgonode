import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { authenticateZerodha } from '@/lib/zerodhaClient';
import { authenticateAngel } from '@/lib/angelClient';
import { authenticateFyers } from '@/lib/fyersClient';
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

    console.log(`[AUTH] Processing authentication for user=${userId}, broker=${broker}`);

    if (!broker) {
      return NextResponse.json(
        { error: 'Missing required field: broker' },
        { status: 400 }
      );
    }

    // Retrieve broker config from cache
    console.log(`[AUTH] Fetching cached broker config for ${broker}`);
    const configData = await getCachedBrokerConfig(userId, broker);
    console.log(`[AUTH] Config data:`, configData ? { status: configData.status, hasApiKey: !!configData.apiKey } : 'null');

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

      console.log(`[AUTH-ZERODHA] Saving access token to Firestore for user=${userId}`);
      try {
        await brokerConfigRef.set({
          accessToken: encryptData(authToken),
          status: 'active',
          lastAuthenticated: new Date().toISOString(),
        }, { merge: true });
        console.log(`[AUTH-ZERODHA] Successfully saved access token`);

        // Validate the write by reading it back immediately
        console.log(`[AUTH-ZERODHA] Validating write by reading back from Firestore...`);
        const validationDoc = await brokerConfigRef.get();
        if (validationDoc.exists) {
          const savedData = validationDoc.data();
          console.log(`[AUTH-ZERODHA] ✅ Write validated! Document exists with:`, {
            status: savedData?.status,
            hasAccessToken: !!savedData?.accessToken,
            lastAuthenticated: savedData?.lastAuthenticated,
          });
        } else {
          console.error(`[AUTH-ZERODHA] ❌ Write failed! Document does not exist after write`);
          return NextResponse.json(
            { error: 'Write verification failed. Document was not created.' },
            { status: 500 }
          );
        }
      } catch (firebaseError) {
        console.error('Failed to save access token to Firestore:', firebaseError);
        return NextResponse.json(
          { error: 'Failed to save authentication token. Please try again.' },
          { status: 500 }
        );
      }

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
      // Angel can come in two ways:
      // 1. OAuth flow: receives accessToken (auth_token), feedToken, refreshToken directly
      // 2. Manual: receives clientCode, pin, totp

      const { accessToken, feedToken, refreshToken, clientCode, pin, totp } = body;

      console.log(`[AUTH-ANGEL] OAuth flow detected: accessToken=${!!accessToken}, feedToken=${!!feedToken}, refreshToken=${!!refreshToken}`);
      console.log(`[AUTH-ANGEL] Manual flow detected: clientCode=${!!clientCode}, pin=${!!pin}, totp=${!!totp}`);

      let jwtToken: string;
      let feedTokenToStore: string | undefined = feedToken;

      // Check if we have OAuth tokens (preferred)
      if (accessToken) {
        // Angel OAuth flow - tokens already provided
        console.log(`[AUTH-ANGEL] Using OAuth flow with accessToken`);
        jwtToken = accessToken;
      } else if (clientCode && pin && totp) {
        // Manual authentication flow - need to authenticate
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

        // Authenticate with Angel using manual credentials
        try {
          const authResult = await authenticateAngel(clientCode, pin, totp, apiKey);
          jwtToken = authResult.jwtToken;
          feedTokenToStore = authResult.feedToken;
        } catch (error: any) {
          return NextResponse.json(
            { error: error.message || 'Failed to authenticate with Angel Broker' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Missing required fields for Angel: either accessToken (OAuth) or clientCode+pin+totp (manual)' },
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

      if (feedTokenToStore) {
        updateData.feedToken = encryptData(feedTokenToStore);
      }

      if (refreshToken) {
        updateData.refreshToken = encryptData(refreshToken);
      }

      console.log(`[AUTH-ANGEL] Saving tokens to Firestore for user=${userId}, broker=${broker}`);
      console.log(`[AUTH-ANGEL] Update data keys:`, Object.keys(updateData));

      try {
        await brokerConfigRef.set(updateData, { merge: true });
        console.log(`[AUTH-ANGEL] Successfully saved tokens to Firestore`);

        // Validate the write by reading it back immediately
        console.log(`[AUTH-ANGEL] Validating write by reading back from Firestore...`);
        const validationDoc = await brokerConfigRef.get();
        if (validationDoc.exists) {
          const savedData = validationDoc.data();
          console.log(`[AUTH-ANGEL] ✅ Write validated! Document exists with:`, {
            status: savedData?.status,
            hasAccessToken: !!savedData?.accessToken,
            hasFeedToken: !!savedData?.feedToken,
            hasRefreshToken: !!savedData?.refreshToken,
            lastAuthenticated: savedData?.lastAuthenticated,
          });
        } else {
          console.error(`[AUTH-ANGEL] ❌ Write failed! Document does not exist after write`);
          return NextResponse.json(
            { error: 'Write verification failed. Document was not created.' },
            { status: 500 }
          );
        }
      } catch (firebaseError) {
        console.error('[AUTH-ANGEL] Failed to save authentication tokens to Firestore:', firebaseError);
        return NextResponse.json(
          { error: 'Failed to save authentication tokens. Please try again.' },
          { status: 500 }
        );
      }

      console.log(`[AUTH-ANGEL] Invalidating cache for broker=${broker}`);
      invalidateBrokerConfig(userId, broker);

      console.log(`[AUTH-ANGEL] Authentication successful, returning 200 response`);
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

    // Handle Fyers authentication
    else if (broker === 'fyers') {
      const { authCode } = body;

      if (!authCode) {
        return NextResponse.json(
          { error: 'Missing required field for Fyers: authCode' },
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

      // Authenticate with Fyers
      let accessToken: string;
      let refreshToken: string;
      try {
        const authResult = await authenticateFyers(authCode, apiKey, apiSecret);
        accessToken = authResult.accessToken;
        refreshToken = authResult.refreshToken;
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || 'Failed to authenticate with Fyers' },
          { status: 400 }
        );
      }

      // Update Firestore with access token
      const userRef = adminDb.collection('users').doc(userId);
      const brokerConfigRef = userRef.collection('brokerConfig').doc(broker);

      console.log(`[AUTH-FYERS] Saving access token to Firestore for user=${userId}`);
      try {
        await brokerConfigRef.set({
          accessToken: encryptData(accessToken),
          refreshToken: encryptData(refreshToken),
          status: 'active',
          lastAuthenticated: new Date().toISOString(),
        }, { merge: true });
        console.log(`[AUTH-FYERS] Successfully saved access token`);

        // Validate the write by reading it back immediately
        console.log(`[AUTH-FYERS] Validating write by reading back from Firestore...`);
        const validationDoc = await brokerConfigRef.get();
        if (validationDoc.exists) {
          const savedData = validationDoc.data();
          console.log(`[AUTH-FYERS] ✅ Write validated! Document exists with:`, {
            status: savedData?.status,
            hasAccessToken: !!savedData?.accessToken,
            lastAuthenticated: savedData?.lastAuthenticated,
          });
        } else {
          console.error(`[AUTH-FYERS] ❌ Write failed! Document does not exist after write`);
          return NextResponse.json(
            { error: 'Write verification failed. Document was not created.' },
            { status: 500 }
          );
        }
      } catch (firebaseError) {
        console.error('Failed to save access token to Firestore:', firebaseError);
        return NextResponse.json(
          { error: 'Failed to save authentication token. Please try again.' },
          { status: 500 }
        );
      }

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

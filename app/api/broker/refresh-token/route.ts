import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig, invalidateBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData, encryptData } from '@/lib/encryptionUtils';
import { refreshFyersToken } from '@/lib/fyersClient';

/**
 * POST /api/broker/refresh-token
 * Refresh broker access tokens that are expiring
 * Zerodha: No refresh needed (tokens valid till end of day)
 * Angel: Refresh using refresh token
 * Fyers: Refresh using refresh token
 * Requires: Authorization header with Firebase ID token
 * Body: { broker: "angel" | "fyers" }
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
    const { broker, pin } = body;

    console.log(`[REFRESH-TOKEN] Processing token refresh for user=${userId}, broker=${broker}`);

    if (!broker) {
      return NextResponse.json(
        { error: 'Missing required field: broker' },
        { status: 400 }
      );
    }

    // Retrieve broker config from cache
    console.log(`[REFRESH-TOKEN] Fetching cached broker config for ${broker}`);
    const configData = await getCachedBrokerConfig(userId, broker);

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker configuration not found. Please configure your broker first.' },
        { status: 404 }
      );
    }

    if (configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Broker is not authenticated. Please authenticate first.' },
        { status: 400 }
      );
    }

    // Handle Angel token refresh
    if (broker === 'angel') {
      return NextResponse.json(
        { error: 'Angel Broker token refresh not yet implemented. Please re-authenticate.' },
        { status: 400 }
      );
    }

    // Handle Fyers token refresh
    else if (broker === 'fyers') {
      console.log(`[REFRESH-TOKEN-FYERS] Refreshing Fyers token for user=${userId}`);

      if (!configData.refreshToken) {
        return NextResponse.json(
          { error: 'No refresh token found. Please re-authenticate.' },
          { status: 400 }
        );
      }

      let refreshToken: string;
      let apiKey: string;
      let apiSecret: string;
      let pinToUse: string | undefined;
      try {
        refreshToken = decryptData(configData.refreshToken);
        apiKey = decryptData(configData.apiKey);
        apiSecret = decryptData(configData.apiSecret);

        // Use PIN from request if provided, otherwise try to get from stored config
        if (pin) {
          pinToUse = pin; // Use PIN from request (user provided via prompt)
        } else if (configData.pin) {
          // Try to get PIN from stored config
          try {
            pinToUse = decryptData(configData.pin);
          } catch {
            pinToUse = configData.pin; // If decryption fails, use as-is
          }
        }
      } catch (error) {
        console.error('Failed to decrypt tokens:', error);
        return NextResponse.json(
          { error: 'Failed to decrypt broker credentials. Please reconfigure your broker.' },
          { status: 400 }
        );
      }

      try {
        const result = await refreshFyersToken(refreshToken, apiKey, apiSecret, pinToUse);
        console.log(`[REFRESH-TOKEN-FYERS] Token refreshed successfully`);

        // Update Firestore with new access token
        const userRef = adminDb.collection('users').doc(userId);
        const brokerConfigRef = userRef.collection('brokerConfig').doc(broker);

        // Calculate expiration till end of trading day (midnight IST)
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: 'Asia/Kolkata',
        });
        const istDateString = formatter.format(now);
        const [month, day, year] = istDateString.split('/');
        const nextMidnightIST = new Date(`${year}-${month}-${day}T23:59:59+05:30`);
        nextMidnightIST.setDate(nextMidnightIST.getDate() + 1);
        nextMidnightIST.setHours(0, 0, 0, 0);
        const msUntilMidnight = nextMidnightIST.getTime() - now.getTime();

        const lastAuthenticatedTime = new Date().toISOString();
        const updateData: any = {
          accessToken: encryptData(result.accessToken),
          lastAuthenticated: lastAuthenticatedTime,
          accessTokenExpiresAt: now.getTime() + msUntilMidnight,
          status: 'active', // Mark as active after successful token refresh
        };

        // Update refresh token if a new one was provided
        if (result.refreshToken) {
          updateData.refreshToken = encryptData(result.refreshToken);
        }

        console.log(`[REFRESH-TOKEN-FYERS] Saving to Firestore:`, {
          lastAuthenticated: lastAuthenticatedTime,
          status: 'active',
          accessTokenExpiresAt: now.getTime() + msUntilMidnight,
        });

        // Invalidate cache BEFORE updating Firestore to prevent stale reads
        invalidateBrokerConfig(userId, broker);
        console.log(`[REFRESH-TOKEN-FYERS] Invalidated cache before update`);

        console.log(`[REFRESH-TOKEN-FYERS] Full updateData being saved:`, JSON.stringify(updateData, null, 2).substring(0, 200));

        await brokerConfigRef.set(updateData, { merge: true });
        console.log(`[REFRESH-TOKEN-FYERS] Successfully saved refreshed token to Firestore`);

        // Verify the data was written
        const verifySnap = await brokerConfigRef.get();
        console.log(`[REFRESH-TOKEN-FYERS] Verification - lastAuthenticated in DB:`, verifySnap.data()?.lastAuthenticated);

        return NextResponse.json(
          {
            success: true,
            message: 'Token refreshed successfully',
            broker,
          },
          { status: 200 }
        );
      } catch (error: any) {
        console.error('[REFRESH-TOKEN-FYERS] Token refresh failed:', error);
        return NextResponse.json(
          { error: error.message || 'Failed to refresh Fyers token' },
          { status: 400 }
        );
      }
    }

    // Zerodha doesn't support refresh - tokens are valid till end of day
    else if (broker === 'zerodha') {
      return NextResponse.json(
        { error: 'Zerodha tokens are valid till end of trading day. No refresh needed. Please re-authenticate the next day.' },
        { status: 400 }
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
    console.error('Error refreshing broker token:', error);
    return NextResponse.json(
      { error: 'Failed to refresh broker token' },
      { status: 500 }
    );
  }
}

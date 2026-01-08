import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/fyers-stored-token
 * Check what token is actually stored for a user
 * Body: { idToken: "firebase_id_token" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    // Verify ID token
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    console.log('[STORED-TOKEN] Checking stored token for userId:', userId);

    // Get the broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({
        error: 'No Fyers configuration found',
        hint: 'Have you authenticated with Fyers?',
      }, { status: 404 });
    }

    console.log('[STORED-TOKEN] Config found:', {
      broker: configData.broker,
      status: configData.status,
      hasAccessToken: !!configData.accessToken,
      accessTokenLength: configData.accessToken?.length,
    });

    // Try to decrypt the stored token
    let decryptedToken: string;
    try {
      decryptedToken = decryptData(configData.accessToken);
      console.log('[STORED-TOKEN] Token decrypted successfully');
    } catch (error) {
      console.error('[STORED-TOKEN] Decryption failed:', error);
      return NextResponse.json({
        error: 'Failed to decrypt stored token',
        hint: 'The stored token might be corrupted',
      }, { status: 400 });
    }

    // Analyze the token
    const isJwt = decryptedToken.includes('.');
    const jwtParts = isJwt ? decryptedToken.split('.') : [];

    console.log('[STORED-TOKEN] Token analysis:', {
      isJwt,
      length: decryptedToken.length,
      jwtPartCount: jwtParts.length,
      firstPart: decryptedToken.substring(0, 50),
    });

    // If it's a JWT, try to decode the header and payload
    let decodedJwt = null;
    if (isJwt && jwtParts.length === 3) {
      try {
        const header = JSON.parse(Buffer.from(jwtParts[0], 'base64').toString());
        const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
        decodedJwt = { header, payload };
      } catch (e) {
        console.error('[STORED-TOKEN] Failed to decode JWT:', e);
      }
    }

    // Check if token looks like an access token or auth code
    const looksLikeAccessToken =
      !isJwt || // If it's not JWT, it might be a simple token
      (decodedJwt?.payload?.scope?.includes('orders') ||
       decodedJwt?.payload?.type === 'access_token');

    return NextResponse.json(
      {
        userId,
        storedToken: {
          status: configData.status,
          isJwt,
          length: decryptedToken.length,
          firstChars: decryptedToken.substring(0, 50),
          lastChars: decryptedToken.substring(decryptedToken.length - 20),
        },
        analysis: {
          looksLikeAccessToken,
          looksLikeAuthCode: isJwt,
          decodedJwt: decodedJwt ? {
            headerAlgo: decodedJwt.header?.alg,
            payloadType: decodedJwt.payload?.type,
            payloadScope: decodedJwt.payload?.scope,
            expiresIn: decodedJwt.payload?.exp,
          } : null,
        },
        problem: {
          identified: !looksLikeAccessToken,
          description: isJwt
            ? 'Token is still a JWT (auth_code) - NOT exchanged for access_token!'
            : 'Token looks valid (not JWT)',
          solution: isJwt
            ? 'The token exchange at /validate-authcode might have failed. Check server logs.'
            : 'Token looks good, issue might be in API call format or endpoint',
        },
        fullDecryptedToken: decryptedToken, // For debugging
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[STORED-TOKEN] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}

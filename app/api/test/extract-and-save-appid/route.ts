import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig, invalidateBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData, encryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/extract-and-save-appid
 * Manually extract app_id from stored JWT and save it
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
    console.log('[EXTRACT-APP-ID] Processing for userId:', userId);

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({
        error: 'No Fyers config found',
      }, { status: 404 });
    }

    console.log('[EXTRACT-APP-ID] Current config:', {
      hasAccessToken: !!configData.accessToken,
      hasAppId: !!configData.appId,
      status: configData.status,
    });

    // Decrypt the stored token
    let storedToken: string;
    try {
      storedToken = decryptData(configData.accessToken);
    } catch (error) {
      console.error('[EXTRACT-APP-ID] Failed to decrypt:', error);
      return NextResponse.json({
        error: 'Failed to decrypt token',
      }, { status: 400 });
    }

    console.log('[EXTRACT-APP-ID] Stored token type:', storedToken.includes('.') ? 'JWT' : 'ACCESS_TOKEN');

    // Try to extract app_id from stored token
    let appId: string | null = null;

    if (storedToken.includes('.')) {
      // Token is a JWT, try to extract app_id
      try {
        const parts = storedToken.split('.');
        if (parts.length === 3) {
          const decodedPayload = Buffer.from(parts[1], 'base64').toString();
          const payload = JSON.parse(decodedPayload);

          appId = payload.app_id;

          console.log('[EXTRACT-APP-ID] Extracted from JWT:', {
            app_id: appId,
            payloadKeys: Object.keys(payload),
          });

          if (!appId) {
            console.warn('[EXTRACT-APP-ID] app_id not found in JWT payload');
            return NextResponse.json({
              error: 'app_id not found in stored JWT',
              payloadKeys: Object.keys(payload),
              hint: 'The token might not be the original auth_code JWT',
            }, { status: 400 });
          }
        }
      } catch (error) {
        console.error('[EXTRACT-APP-ID] Failed to extract from JWT:', error);
        return NextResponse.json({
          error: 'Failed to extract app_id from JWT',
        }, { status: 400 });
      }
    } else {
      return NextResponse.json({
        error: 'Stored token is not a JWT - cannot extract app_id',
        hint: 'Token was successfully exchanged for access_token. Need to re-authenticate to get new auth_code JWT with app_id.',
      }, { status: 400 });
    }

    // Save the app_id to Firestore
    if (appId) {
      console.log('[EXTRACT-APP-ID] Saving app_id:', appId.substring(0, 10) + '...');

      const userRef = adminDb.collection('users').doc(userId);
      const brokerConfigRef = userRef.collection('brokerConfig').doc('fyers');

      await brokerConfigRef.set({ appId }, { merge: true });

      // Invalidate cache so it picks up the new value
      invalidateBrokerConfig(userId, 'fyers');

      console.log('[EXTRACT-APP-ID] Successfully saved app_id');

      return NextResponse.json({
        success: true,
        message: 'app_id extracted and saved successfully',
        appId: appId.substring(0, 20) + '...',
      }, { status: 200 });
    } else {
      return NextResponse.json({
        error: 'Failed to extract app_id',
      }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[EXTRACT-APP-ID] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extract app_id' },
      { status: 500 }
    );
  }
}

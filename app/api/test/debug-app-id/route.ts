import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * GET /api/test/debug-app-id?userId=XXX
 * Debug app_id extraction issue
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    console.log('[DEBUG-APP-ID] Checking for userId:', userId);

    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({
        error: 'No config found',
      }, { status: 404 });
    }

    console.log('[DEBUG-APP-ID] Config keys:', Object.keys(configData));
    console.log('[DEBUG-APP-ID] Has appId?', !!configData.appId);
    console.log('[DEBUG-APP-ID] Config data:', {
      hasAccessToken: !!configData.accessToken,
      hasAppId: !!configData.appId,
      appId: configData.appId,
      status: configData.status,
    });

    // Try to decrypt the access token to see what's in it
    let decryptedToken = '';
    try {
      decryptedToken = decryptData(configData.accessToken);
    } catch (e) {
      console.error('[DEBUG-APP-ID] Failed to decrypt:', e);
    }

    // Try to extract app_id from token if it's a JWT
    let extractedAppId = null;
    if (decryptedToken.includes('.')) {
      try {
        const parts = decryptedToken.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        extractedAppId = payload.app_id;
        console.log('[DEBUG-APP-ID] Extracted from JWT:', {
          app_id: extractedAppId,
          allKeys: Object.keys(payload),
        });
      } catch (e) {
        console.error('[DEBUG-APP-ID] Failed to extract:', e);
      }
    }

    return NextResponse.json({
      userId,
      storedAppId: configData.appId || 'NOT STORED',
      extractedAppIdFromToken: extractedAppId,
      tokenType: decryptedToken.includes('.') ? 'JWT' : 'OTHER',
      problem: !configData.appId ? 'AppId not stored in Firestore' : 'AppId is stored',
    }, { status: 200 });
  } catch (error: any) {
    console.error('[DEBUG-APP-ID] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

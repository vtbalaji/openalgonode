import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { buildBrokerLoginUrl } from '@/lib/brokerConfig';
import { adminAuth } from '@/lib/firebaseAdmin';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/fyers-oauth-debug
 * Debug the Fyers OAuth flow step by step
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, idToken } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Verify ID token if provided
    if (idToken) {
      try {
        await adminAuth.verifyIdToken(idToken);
      } catch (error) {
        return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
      }
    }

    console.log('[OAUTH-DEBUG] Starting Fyers OAuth debug for userId:', userId);

    // Step 1: Get broker config
    console.log('[OAUTH-DEBUG] Step 1: Fetching broker config...');
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({ error: 'Broker not configured' }, { status: 404 });
    }
    console.log('[OAUTH-DEBUG] Config retrieved:', {
      hasBroker: !!configData.broker,
      hasApiKey: !!configData.apiKey,
      hasApiSecret: !!configData.apiSecret,
      status: configData.status,
    });

    // Step 2: Decrypt API key
    console.log('[OAUTH-DEBUG] Step 2: Decrypting API key...');
    let apiKey: string;
    try {
      apiKey = decryptData(configData.apiKey);
      console.log('[OAUTH-DEBUG] API key decrypted:', apiKey.substring(0, 15) + '...');
    } catch (error) {
      console.error('[OAUTH-DEBUG] Decryption failed:', error);
      return NextResponse.json({ error: 'Failed to decrypt API key' }, { status: 400 });
    }

    // Step 3: Build redirect URI
    console.log('[OAUTH-DEBUG] Step 3: Building redirect URI...');
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost';
    const origin = `${proto}://${host}`;
    const redirectUri = `${origin}/callback`;
    console.log('[OAUTH-DEBUG] Redirect URI:', redirectUri);
    console.log('[OAUTH-DEBUG] Origin:', origin);
    console.log('[OAUTH-DEBUG] Proto:', proto);
    console.log('[OAUTH-DEBUG] Host:', host);

    // Step 4: Build full OAuth login URL
    console.log('[OAUTH-DEBUG] Step 4: Building OAuth login URL...');
    const loginUrl = buildBrokerLoginUrl('fyers', apiKey, redirectUri);
    if (!loginUrl) {
      console.error('[OAUTH-DEBUG] Failed to build login URL');
      return NextResponse.json({ error: 'Failed to build login URL' }, { status: 400 });
    }
    console.log('[OAUTH-DEBUG] Login URL built successfully');

    // Step 5: Parse and validate the OAuth URL
    console.log('[OAUTH-DEBUG] Step 5: Parsing OAuth URL...');
    const urlObj = new URL(loginUrl);
    const params = {
      client_id: urlObj.searchParams.get('client_id'),
      redirect_uri: urlObj.searchParams.get('redirect_uri'),
      response_type: urlObj.searchParams.get('response_type'),
      state: urlObj.searchParams.get('state'),
    };
    console.log('[OAUTH-DEBUG] OAuth URL parameters:', params);

    // Step 6: Check if redirect_uri matches callback endpoint
    console.log('[OAUTH-DEBUG] Step 6: Validating redirect URI...');
    if (params.redirect_uri !== redirectUri) {
      console.error('[OAUTH-DEBUG] ❌ Redirect URI mismatch!', {
        expected: redirectUri,
        inUrl: params.redirect_uri,
      });
    } else {
      console.log('[OAUTH-DEBUG] ✅ Redirect URI matches');
    }

    return NextResponse.json(
      {
        debug: {
          step1_config: {
            hasBroker: !!configData.broker,
            hasApiKey: !!configData.apiKey,
            hasApiSecret: !!configData.apiSecret,
            status: configData.status,
          },
          step2_apiKey: apiKey.substring(0, 15) + '...',
          step3_redirectUri: {
            origin,
            proto,
            host,
            fullUri: redirectUri,
          },
          step4_loginUrl: loginUrl.substring(0, 100) + '...',
          step5_oauthParams: params,
          step6_validation: {
            redirectUriMatches: params.redirect_uri === redirectUri,
            clientIdPresent: !!params.client_id,
            responseTypeCorrect: params.response_type === 'code',
          },
        },
        fullLoginUrl: loginUrl,
        oauthParameters: params,
        expectedRedirectUri: redirectUri,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[OAUTH-DEBUG] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Debug failed' },
      { status: 500 }
    );
  }
}

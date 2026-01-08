import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { buildBrokerLoginUrl } from '@/lib/brokerConfig';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/fyers-full-flow
 * Complete diagnostic of the Fyers OAuth flow
 * Body: { userId: "user123" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    console.log('[FYERS-FULL-FLOW] Testing complete flow for userId:', userId);

    // Step 1: Get headers
    console.log('[FYERS-FULL-FLOW] Step 1: Reading ngrok headers');
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost';
    const origin = `${proto}://${host}`;
    const redirectUri = `${origin}/callback`;
    console.log('[FYERS-FULL-FLOW] Headers:', { proto, host, origin, redirectUri });

    // Step 2: Get broker config
    console.log('[FYERS-FULL-FLOW] Step 2: Getting cached broker config');
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      console.error('[FYERS-FULL-FLOW] No broker config found');
      return NextResponse.json({
        status: 'failed',
        step: 2,
        error: 'Broker not configured. Did you save your API key and secret?',
        hint: 'Go to broker config page and save your Fyers API credentials first',
      }, { status: 404 });
    }
    console.log('[FYERS-FULL-FLOW] Config found:', {
      hasBroker: !!configData.broker,
      hasApiKey: !!configData.apiKey,
      hasApiSecret: !!configData.apiSecret,
      hasAccessToken: !!configData.accessToken,
      status: configData.status,
    });

    // Step 3: Decrypt API key
    console.log('[FYERS-FULL-FLOW] Step 3: Decrypting API key');
    let apiKey: string;
    try {
      apiKey = decryptData(configData.apiKey);
      console.log('[FYERS-FULL-FLOW] API key decrypted successfully');
    } catch (error) {
      console.error('[FYERS-FULL-FLOW] Decryption failed:', error);
      return NextResponse.json({
        status: 'failed',
        step: 3,
        error: 'Failed to decrypt API key',
      }, { status: 400 });
    }

    // Step 4: Build Fyers OAuth URL
    console.log('[FYERS-FULL-FLOW] Step 4: Building Fyers OAuth URL');
    const loginUrl = buildBrokerLoginUrl('fyers', apiKey, redirectUri);
    if (!loginUrl) {
      console.error('[FYERS-FULL-FLOW] Failed to build login URL');
      return NextResponse.json({
        status: 'failed',
        step: 4,
        error: 'Failed to build Fyers login URL',
      }, { status: 400 });
    }
    console.log('[FYERS-FULL-FLOW] Login URL built successfully');

    // Step 5: Parse and validate URL
    console.log('[FYERS-FULL-FLOW] Step 5: Validating OAuth URL');
    const urlObj = new URL(loginUrl);
    const params = {
      client_id: urlObj.searchParams.get('client_id'),
      redirect_uri: urlObj.searchParams.get('redirect_uri'),
      response_type: urlObj.searchParams.get('response_type'),
      state: urlObj.searchParams.get('state'),
    };
    console.log('[FYERS-FULL-FLOW] URL parameters:', params);

    if (params.redirect_uri !== redirectUri) {
      console.error('[FYERS-FULL-FLOW] ❌ REDIRECT_URI MISMATCH!', {
        expected: redirectUri,
        inUrl: params.redirect_uri,
      });
    }

    return NextResponse.json(
      {
        status: 'success',
        flow: {
          step1_headers: { proto, host, origin, redirectUri },
          step2_config: {
            hasBroker: !!configData.broker,
            hasApiKey: !!configData.apiKey,
            hasApiSecret: !!configData.apiSecret,
            status: configData.status,
          },
          step3_apiKey: '✓ Decrypted',
          step4_loginUrl: 'Built successfully',
          step5_urlParams: params,
        },
        redirectUriCheck: {
          expected: redirectUri,
          inUrl: params.redirect_uri,
          matches: params.redirect_uri === redirectUri,
        },
        fyers_dashboard_check: {
          message: 'Your Fyers dashboard should have Redirect URI set to:',
          value: redirectUri,
        },
        loginUrl: loginUrl, // This is what to redirect to
        nextStep: 'If all above is green, use this loginUrl to redirect to Fyers',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[FYERS-FULL-FLOW] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error.message || 'Flow test failed',
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}

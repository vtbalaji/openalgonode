import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { buildBrokerLoginUrl } from '@/lib/brokerConfig';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * GET /api/test/fyers-login-url-ngrok
 * Test the Fyers login URL generation with ngrok domain
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[FYERS-LOGIN-URL-NGROK] Testing login URL generation');

    // Get ngrok domain from headers
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost';
    const origin = `${proto}://${host}`;
    const redirectUri = `${origin}/callback`;

    console.log('[FYERS-LOGIN-URL-NGROK] Detected domain:', {
      proto,
      host,
      origin,
      redirectUri,
    });

    // We can't test without a real userId, so let's just build the URL structure
    // using placeholder credentials to show what would be sent to Fyers
    const placeholderClientId = 'YOUR_CLIENT_ID';
    const testLoginUrl = buildBrokerLoginUrl('fyers', placeholderClientId, redirectUri);

    if (!testLoginUrl) {
      return NextResponse.json({ error: 'Failed to build login URL' }, { status: 400 });
    }

    // Parse the URL to show what parameters would be sent to Fyers
    const urlObj = new URL(testLoginUrl);
    const params = {
      client_id: urlObj.searchParams.get('client_id'),
      redirect_uri: urlObj.searchParams.get('redirect_uri'),
      response_type: urlObj.searchParams.get('response_type'),
      state: urlObj.searchParams.get('state'),
    };

    console.log('[FYERS-LOGIN-URL-NGROK] Generated URL parameters:', params);

    return NextResponse.json(
      {
        calculatedOrigin: origin,
        redirectUri,
        fyersLoginUrlTemplate: 'https://api-t1.fyers.in/api/v3/generate-authcode?client_id={apiKey}&redirect_uri={redirectUri}&response_type=code&state=sample',
        generatedUrlParameters: params,
        fullTestUrl: testLoginUrl,
        redirectUriInUrl: params.redirect_uri,
        redirectUriMatch: params.redirect_uri === redirectUri,
        warning: 'The redirect_uri sent to Fyers MUST match exactly what is configured in your Fyers dashboard',
        fyers_dashboard_instruction: 'Go to https://api-t1.fyers.in/dashboard and set your app Redirect URI to: ' + redirectUri,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[FYERS-LOGIN-URL-NGROK] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';
import { resolveBroker } from '@/lib/brokerDetection';

/**
 * GET /api/orders/positions
 * Get open positions from broker
 * Requires: Authorization header with Firebase ID token
 * Query params: broker (optional, defaults to 'zerodha')
 */
export async function GET(request: NextRequest) {
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
    const brokerParam = request.nextUrl.searchParams.get('broker') || undefined;

    // Resolve broker: use provided broker or auto-detect active broker
    const brokerDetection = await resolveBroker(userId, brokerParam as any);

    if (!brokerDetection.isConfigured) {
      return NextResponse.json(
        { error: brokerDetection.error || 'No active broker configured. Please configure a broker first.' },
        { status: 404 }
      );
    }

    const broker = brokerDetection.broker;

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, broker);

    if (!configData) {
      return NextResponse.json(
        { error: `${broker} not configured` },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: `${broker} not authenticated` },
        { status: 401 }
      );
    }

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = decryptData(configData.accessToken);
    } catch (error) {
      console.error('Failed to decrypt access token:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt credentials. Please re-authenticate.' },
        { status: 401 }
      );
    }

    // Route to broker-specific endpoint
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const brokerEndpoint = `${protocol}://${host}/api/broker/${broker}/positions`;

    console.log(`[POSITIONS] Calling endpoint: ${brokerEndpoint}`);

    try {
      const brokerResponse = await fetch(brokerEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userId }),
      });

      const result = await brokerResponse.json();
      if (!brokerResponse.ok) {
        return NextResponse.json(
          { error: result.error || `Failed on ${broker}` },
          { status: brokerResponse.status }
        );
      }

      // For Zerodha, combine net and day positions if available
      let positions = result.positions || result.data || [];
      if (broker === 'zerodha' && result.net && result.day) {
        positions = [...result.net, ...result.day];
      }

      return NextResponse.json(
        {
          success: true,
          positions: positions || [],
          count: positions?.length || 0,
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to fetch positions' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    const errorMsg = error.message || String(error) || 'Failed to fetch positions';
    console.error('Error fetching positions:', errorMsg, error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

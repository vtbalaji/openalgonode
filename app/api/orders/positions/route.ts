import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

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
    const broker = request.nextUrl.searchParams.get('broker') || 'zerodha';

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'positions', {
      userId,
    });

    if (status !== 200) {
      return NextResponse.json(data, { status });
    }

    // Combine both net and day positions if available
    const allPositions = [...(data.net || []), ...(data.day || [])];

    return NextResponse.json(
      {
        success: true,
        positions: allPositions || [],
        count: allPositions?.length || 0,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

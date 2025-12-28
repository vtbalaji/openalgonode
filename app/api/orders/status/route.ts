import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * GET /api/orders/status
 * Get order book (list of all orders) from broker
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

    // Route to internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'orderbook', {
      userId,
    });

    if (status !== 200) {
      return NextResponse.json(data, { status });
    }

    return NextResponse.json(
      {
        success: true,
        orders: data.data || [],
        count: data.count || 0,
      },
      { status: 200 }
    );
  } catch (error: any) {
    const errorMsg = error.message || String(error) || 'Failed to fetch order status';
    console.error('Error fetching order status:', errorMsg, error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

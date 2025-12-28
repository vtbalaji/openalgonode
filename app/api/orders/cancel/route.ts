import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/orders/cancel
 * Cancel an order on broker
 * Requires: Authorization header with Firebase ID token
 * Body: {
 *   broker: "zerodha",
 *   order_id: "12345"
 * }
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
    const { broker = 'zerodha', order_id } = await request.json();

    // Validate required fields
    if (!order_id) {
      return NextResponse.json(
        { error: 'Missing required field: order_id' },
        { status: 400 }
      );
    }

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'cancel-order', {
      userId,
      order_id,
    });

    if (status !== 200) {
      // Transform error response for consistency
      const errorMsg = data.message || data.error || 'Failed to cancel order';
      return NextResponse.json(
        { error: errorMsg },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        orderId: data.orderid || data.order_id,
        message: 'Order cancelled successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error cancelling order:', error);
    return NextResponse.json(
      { error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}

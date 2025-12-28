import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/orders/modify
 * Modify an order on broker
 * Requires: Authorization header with Firebase ID token
 * Body: {
 *   broker: "zerodha",
 *   order_id: "12345",
 *   quantity: 1,
 *   product: "MIS",
 *   pricetype: "MARKET",
 *   price: 2500
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
    const orderData = await request.json();
    const { broker = 'zerodha', order_id, ...order } = orderData;

    // Validate required fields
    if (!order_id) {
      return NextResponse.json(
        { error: 'Missing required field: order_id' },
        { status: 400 }
      );
    }

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'modify-order', {
      userId,
      order_id,
      ...order,
    });

    if (status !== 200) {
      // Transform error response for consistency
      const errorMsg = data.message || data.error || 'Failed to modify order';
      return NextResponse.json(
        { error: errorMsg },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        orderId: data.orderid || data.order_id,
        message: 'Order modified successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error modifying order:', error);
    return NextResponse.json(
      { error: 'Failed to modify order' },
      { status: 500 }
    );
  }
}

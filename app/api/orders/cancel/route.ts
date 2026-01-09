import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { resolveBroker } from '@/lib/brokerDetection';

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
    const { broker: brokerParam, order_id } = await request.json();

    // Validate required fields
    if (!order_id) {
      return NextResponse.json(
        { error: 'Missing required field: order_id' },
        { status: 400 }
      );
    }

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

    // Route to broker-specific endpoint
    console.log(`[ORDERS-CANCEL] Routing cancel to ${broker} broker`);

    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const brokerEndpoint = `${protocol}://${host}/api/broker/${broker}/cancel-order`;

    console.log(`[ORDERS-CANCEL] Calling endpoint: ${brokerEndpoint}`);

    try {
      const brokerResponse = await fetch(brokerEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userId,
          orderid: order_id,
        }),
      });

      const result = await brokerResponse.json();

      if (!brokerResponse.ok) {
        console.error(`[ORDERS-CANCEL] Error from broker:`, result);
        return NextResponse.json(
          { error: result.error || `Failed to cancel order on ${broker}` },
          { status: brokerResponse.status }
        );
      }

      return NextResponse.json(
        {
          success: true,
          orderId: result.orderId || result.order_id,
          message: `Order cancelled successfully on ${broker}`,
          ...result,
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error(`Error cancelling order on ${broker}:`, error.message);
      return NextResponse.json(
        { error: error.message || `Failed to cancel order on ${broker}` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    const errorMsg = error.message || String(error) || 'Failed to cancel order';
    console.error('Error cancelling order:', errorMsg, error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

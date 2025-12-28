import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { resolveBroker } from '@/lib/brokerDetection';

/**
 * POST /api/orders/place
 * Place an order on broker
 * Requires: Authorization header with Firebase ID token
 * Body: {
 *   broker: "zerodha",
 *   symbol: "RELIANCE",
 *   exchange: "NSE",
 *   action: "BUY",
 *   quantity: 1,
 *   product: "MIS",
 *   pricetype: "MARKET",
 *   price: 2500,
 *   trigger_price: 0,
 *   disclosed_quantity: 0
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
    const { broker: brokerParam, ...order } = orderData;

    // Validate required order fields
    if (!order.symbol || !order.exchange || !order.action || !order.quantity || !order.product || !order.pricetype) {
      return NextResponse.json(
        { error: 'Missing required order fields' },
        { status: 400 }
      );
    }

    // Resolve broker: use provided broker or auto-detect active broker
    const broker = await resolveBroker(userId, brokerParam);

    if (!broker) {
      return NextResponse.json(
        { error: 'No active broker configured. Please configure a broker first.' },
        { status: 404 }
      );
    }

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
    console.log(`[ORDERS-PLACE] Routing order to ${broker} broker`);

    // Build the broker-specific endpoint URL
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const brokerEndpoint = `${protocol}://${host}/api/broker/${broker}/place-order`;

    console.log(`[ORDERS-PLACE] Calling endpoint: ${brokerEndpoint}`);

    // Call broker-specific endpoint internally
    try {
      const brokerResponse = await fetch(brokerEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userId,
          ...order,
        }),
      });

      const result = await brokerResponse.json();

      if (!brokerResponse.ok) {
        console.error(`[ORDERS-PLACE] Error from ${broker} (status ${brokerResponse.status}):`, JSON.stringify(result, null, 2));
        return NextResponse.json(
          {
            error: result.error || result.message || result.status || `Failed to place order on ${broker}`,
            details: result
          },
          { status: brokerResponse.status }
        );
      }

      // Store order in Firestore for reference
      const ordersRef = adminDb.collection('users').doc(userId).collection('orders');
      const orderId = result.orderId || result.order_id;

      if (orderId) {
        await ordersRef.doc(orderId).set({
          orderId,
          symbol: order.symbol,
          exchange: order.exchange,
          action: order.action,
          quantity: order.quantity,
          product: order.product,
          pricetype: order.pricetype,
          broker,
          status: 'pending',
          createdAt: new Date(),
          brokerResponse: result,
        });
      }

      return NextResponse.json(
        {
          success: true,
          orderId,
          message: `Order placed successfully on ${broker}`,
          ...result,
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error(`[ORDERS-PLACE] Catch block error for ${broker}:`, error.message || error);
      return NextResponse.json(
        {
          error: error.message || `Failed to place order on ${broker}`,
          details: error.toString()
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    const errorMsg = error.message || String(error) || 'Failed to place order';
    console.error('Error placing order:', errorMsg, error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

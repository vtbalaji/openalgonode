import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

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
    const { broker = 'zerodha', ...order } = orderData;

    // Validate required fields
    if (!order.symbol || !order.exchange || !order.action || !order.quantity || !order.product || !order.pricetype) {
      return NextResponse.json(
        { error: 'Missing required order fields' },
        { status: 400 }
      );
    }

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'place-order', {
      userId,
      symbol: order.symbol,
      exchange: order.exchange,
      action: order.action,
      quantity: order.quantity,
      product: order.product,
      pricetype: order.pricetype,
      price: order.price,
      trigger_price: order.trigger_price,
      disclosed_quantity: order.disclosed_quantity,
    });

    if (status !== 200) {
      // Transform error response for consistency
      const errorMsg = data.message || data.error || 'Failed to place order';
      console.error('Order placement failed:', { status, error: errorMsg, data });
      return NextResponse.json(
        { error: errorMsg },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        orderId: data.orderid || data.order_id,
        message: 'Order placed successfully',
      },
      { status: 200 }
    );
  } catch (error: any) {
    const errorMsg = error.message || String(error) || 'Failed to place order';
    console.error('Error placing order:', errorMsg, error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

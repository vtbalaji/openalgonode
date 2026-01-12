import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/ui/dashboard/place
 * Place an order on Zerodha
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
    if (!order.symbol || !order.action || !order.quantity || !order.product || !order.pricetype) {
      return NextResponse.json(
        { error: 'Missing required order fields: symbol, action, quantity, product, pricetype' },
        { status: 400 }
      );
    }

    // Prepare broker-specific payload
    let brokerPayload: any = {
      userId,
      symbol: order.symbol,
      action: order.action,
      quantity: order.quantity,
      product: order.product,
      pricetype: order.pricetype,
      price: order.price,
      trigger_price: order.trigger_price,
      disclosed_quantity: order.disclosed_quantity,
      symboltoken: order.symboltoken,
    };

    // Transform field names for Fyers if needed
    if (broker === 'fyers') {
      // Fyers uses different field names: side (not action), qty (not quantity), type (not pricetype), productType (not product)
      brokerPayload = {
        userId,
        symbol: order.symbol,
        side: order.action,  // BUY/SELL
        qty: order.quantity,
        type: order.pricetype,  // MARKET/LIMIT
        productType: order.product === 'MIS' ? 'INTRADAY' : order.product,  // Convert MIS to INTRADAY for Fyers
        price: order.price,
        stopPrice: order.trigger_price,
        symboltoken: order.symboltoken,
      };
    } else {
      // Zerodha needs exchange field
      brokerPayload.exchange = order.exchange;
    }

    // Call internal broker endpoint
    console.log('[DASHBOARD-PLACE] Calling broker:', broker, 'with payload:', JSON.stringify(brokerPayload, null, 2));
    const { data, status } = await callInternalBrokerEndpoint(broker, 'place-order', brokerPayload);

    if (status !== 200) {
      return NextResponse.json(data, { status });
    }

    return NextResponse.json(
      {
        success: true,
        orderId: data.order_id || data.orderid,
        message: 'Order placed successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error placing order:', error);
    return NextResponse.json(
      { error: 'Failed to place order' },
      { status: 500 }
    );
  }
}

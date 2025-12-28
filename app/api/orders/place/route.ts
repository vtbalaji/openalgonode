import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';
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

    // Call Zerodha client directly
    const { placeOrder, transformOrderData } = await import('@/lib/zerodhaClient');

    // Transform order data to Zerodha format
    const orderPayload = {
      symbol: order.symbol,
      exchange: order.exchange,
      action: order.action,
      quantity: order.quantity,
      product: order.product,
      pricetype: order.pricetype,
      price: order.price,
      trigger_price: order.trigger_price,
      disclosed_quantity: order.disclosed_quantity,
    };

    const zerodhaOrder = transformOrderData(orderPayload);

    try {
      // Place order with Zerodha
      const result = await placeOrder(accessToken, zerodhaOrder);

      // Store order in Firestore for reference
      const ordersRef = adminDb.collection('users').doc(userId).collection('orders');
      await ordersRef.doc(result.order_id).set({
        orderId: result.order_id,
        symbol: order.symbol,
        exchange: order.exchange,
        action: order.action,
        quantity: order.quantity,
        product: order.product,
        pricetype: order.pricetype,
        broker: 'zerodha',
        status: 'pending',
        createdAt: new Date(),
        zerodhaResponse: result,
      });

      return NextResponse.json(
        {
          success: true,
          orderId: result.order_id,
          message: 'Order placed successfully',
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to place order' },
        { status: 400 }
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

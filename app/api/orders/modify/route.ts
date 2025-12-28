import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { resolveBroker } from '@/lib/brokerDetection';

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
    const { broker: brokerParam, order_id, quantity, price, trigger_price, product, pricetype } = orderData;

    // Validate required fields
    if (!order_id) {
      return NextResponse.json(
        { error: 'Missing required field: order_id' },
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

    // Route to broker-specific endpoint
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const brokerEndpoint = `${protocol}://${host}/api/broker/${broker}/modify-order`;

    console.log(`[ORDERS-MODIFY] Calling endpoint: ${brokerEndpoint}`);

    const brokerResponse = await fetch(brokerEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        userId,
        orderid: order_id,
        quantity,
        price,
        trigger_price,
        product,
        pricetype,
      }),
    });

    const result = await brokerResponse.json();
    if (!brokerResponse.ok) {
      return NextResponse.json(
        { error: result.error || `Failed on ${broker}` },
        { status: brokerResponse.status }
      );
    }

    return NextResponse.json({...result}, { status: 200 });
  } catch (error: any) {
    const errorMsg = error.message || String(error) || 'Failed to modify order';
    console.error('Error modifying order:', errorMsg, error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

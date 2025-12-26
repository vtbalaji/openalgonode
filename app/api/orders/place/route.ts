import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { placeOrder, transformOrderData } from '@/lib/zerodhaClient';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/orders/place
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
    if (!order.symbol || !order.exchange || !order.action || !order.quantity || !order.product || !order.pricetype) {
      return NextResponse.json(
        { error: 'Missing required order fields' },
        { status: 400 }
      );
    }

    // Retrieve broker config from Firestore
    const userRef = adminDb.collection('users').doc(userId);
    const brokerConfigRef = userRef.collection('brokerConfig').doc(broker);
    const docSnap = await brokerConfigRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Broker configuration not found' },
        { status: 404 }
      );
    }

    const configData = docSnap.data();
    if (!configData) {
      return NextResponse.json(
        { error: 'Broker configuration not found' },
        { status: 404 }
      );
    }

    // Check if broker is authenticated
    if (!configData.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Broker not authenticated. Please authenticate first.' },
        { status: 401 }
      );
    }

    let accessToken;
    try {
      accessToken = decryptData(configData.accessToken);

      // Validate that accessToken is not empty
      if (!accessToken || accessToken.trim() === '') {
        return NextResponse.json(
          { error: 'Invalid broker authentication. Access token is empty. Please re-authenticate.' },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error('Error decrypting access token:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials. Please re-authenticate.' },
        { status: 401 }
      );
    }

    // Extract access token from combined format if stored as api_key:access_token
    const token = accessToken.includes(':')
      ? accessToken.split(':')[1]
      : accessToken;

    // Transform order data to Zerodha format
    const zerodhaOrder = transformOrderData(order);

    // Place the order
    let orderResult;
    try {
      orderResult = await placeOrder(token, zerodhaOrder);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to place order' },
        { status: 400 }
      );
    }

    // Store order in Firestore for reference
    const ordersRef = userRef.collection('orders');
    await ordersRef.doc(orderResult.order_id).set({
      orderId: orderResult.order_id,
      symbol: order.symbol,
      exchange: order.exchange,
      action: order.action,
      quantity: order.quantity,
      product: order.product,
      pricetype: order.pricetype,
      status: 'pending',
      createdAt: new Date(),
      zerodhaResponse: orderResult,
    });

    return NextResponse.json(
      {
        success: true,
        orderId: orderResult.order_id,
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

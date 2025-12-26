import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { cancelOrder } from '@/lib/zerodhaClient';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

interface CancelOrderRequest {
  broker?: string;
  orderid: string;
}

/**
 * POST /api/orders/cancel
 * Cancel an open order - same pattern as order placement
 * Requires: Authorization header with Firebase ID token
 */
export async function POST(request: NextRequest) {
  try {
    // Get the Firebase ID token from Authorization header (same as place order)
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
    const body: CancelOrderRequest = await request.json();
    const { broker = 'zerodha' } = body;

    if (!body.orderid) {
      return NextResponse.json(
        { error: 'Missing required field: orderid' },
        { status: 400 }
      );
    }

    // Retrieve broker config from Firestore (same as place order)
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

    // Cancel the order via Zerodha
    let result;
    try {
      result = await cancelOrder(token, body.orderid);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to cancel order' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        message: `Order ${body.orderid} cancelled successfully`,
        orderid: result.order_id || body.orderid,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error cancelling order:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}

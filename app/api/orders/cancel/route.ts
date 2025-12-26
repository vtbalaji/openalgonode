import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiKeyAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { cancelOrder } from '@/lib/zerodhaClient';
import { authenticateOrderRequest, authErrorResponse } from '@/lib/orderAuthUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

interface CancelOrderRequest {
  apikey?: string;
  orderid: string;
}

/**
 * POST /api/orders/cancel
 * Cancel an open order
 * Authentication: Supports multiple methods
 *   1. API key in request body: { apikey: "..." }
 *   2. Bearer token: Authorization: Bearer <firebase_token>
 *   3. Basic auth: Authorization: Basic base64(api_key:access_token)
 *   4. Plain: Authorization: api_key:access_token
 */
export async function POST(request: NextRequest) {
  try {
    const body: CancelOrderRequest = await request.json();

    if (!body.orderid) {
      return NextResponse.json(
        { error: 'Missing required field: orderid' },
        { status: 400 }
      );
    }

    // Authenticate using utility function
    const authHeader = request.headers.get('authorization');
    const authResult = await authenticateOrderRequest(authHeader, body.apikey);

    if (!authResult.success) {
      return authErrorResponse(authResult.error!);
    }

    const { userId, broker, permissions } = authResult.context!;

    // Check permission if using API key auth
    if (body.apikey && permissions) {
      const permissionError = requirePermission(permissions, 'cancelorder');
      if (permissionError) {
        return permissionError;
      }
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

    const accessToken = decryptData(configData.accessToken);

    // Extract access token from combined format (api_key:access_token)
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

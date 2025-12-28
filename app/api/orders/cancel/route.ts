import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

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
    const { broker = 'zerodha', order_id } = await request.json();

    // Validate required fields
    if (!order_id) {
      return NextResponse.json(
        { error: 'Missing required field: order_id' },
        { status: 400 }
      );
    }

    if (broker !== 'zerodha') {
      return NextResponse.json(
        { error: 'Only zerodha broker is currently supported' },
        { status: 400 }
      );
    }

    // Get Zerodha broker config
    const configData = await getCachedBrokerConfig(userId, 'zerodha');

    if (!configData) {
      return NextResponse.json(
        { error: 'Zerodha not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Zerodha not authenticated' },
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
    const { cancelOrder } = await import('@/lib/zerodhaClient');

    try {
      const result = await cancelOrder(accessToken, order_id);

      return NextResponse.json(
        {
          success: true,
          orderId: result.order_id,
          message: 'Order cancelled successfully',
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to cancel order' },
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

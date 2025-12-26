import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiKeyAuth';
import { authenticateOrderRequest, authErrorResponse } from '@/lib/orderAuthUtils';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

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

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'cancel-order', {
      userId,
      orderid: body.orderid,
    });

    if (status !== 200) {
      return NextResponse.json(data, { status });
    }

    return NextResponse.json(
      {
        status: 'success',
        message: `Order ${body.orderid} cancelled successfully`,
        orderid: data.order_id || body.orderid,
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

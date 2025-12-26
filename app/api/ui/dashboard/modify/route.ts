import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiKeyAuth';
import { authenticateOrderRequest, authErrorResponse } from '@/lib/orderAuthUtils';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

interface ModifyOrderRequest {
  apikey?: string;
  orderid: string;
  quantity?: number;
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
  order_type?: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  validity?: string;
  // Additional fields needed for order modification
  tradingsymbol?: string;
  exchange?: string;
  transaction_type?: string;
  product?: string;
}

/**
 * POST /api/ui/dashboard/modify
 * Modify an open order (quantity, price, trigger price, etc.)
 * Authentication: Supports multiple methods
 *   1. API key in request body: { apikey: "..." }
 *   2. Bearer token: Authorization: Bearer <firebase_token>
 *   3. Basic auth: Authorization: Basic base64(api_key:access_token)
 *   4. Plain: Authorization: api_key:access_token
 */
export async function POST(request: NextRequest) {
  try {
    const body: ModifyOrderRequest = await request.json();

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
      const permissionError = requirePermission(permissions, 'modifyorder');
      if (permissionError) {
        return permissionError;
      }
    }

    const {
      orderid,
      quantity,
      price,
      trigger_price,
      disclosed_quantity,
      order_type,
      validity,
      tradingsymbol,
      exchange,
      transaction_type,
      product,
    } = body;

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'modify-order', {
      userId,
      orderid,
      quantity: quantity || 1,
      price: price ?? 0,
      trigger_price: trigger_price ?? 0,
      disclosed_quantity: disclosed_quantity ?? 0,
      order_type: order_type || 'LIMIT',
      validity: validity || 'DAY',
      tradingsymbol: tradingsymbol || '',
      exchange: exchange || '',
      transaction_type: transaction_type || 'BUY',
      product: product || 'MIS',
    });

    if (status !== 200) {
      return NextResponse.json(data, { status });
    }

    return NextResponse.json(
      {
        status: 'success',
        message: `Order ${orderid} modified successfully`,
        orderid: data.order_id || orderid,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error modifying order:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to modify order' },
      { status: 500 }
    );
  }
}

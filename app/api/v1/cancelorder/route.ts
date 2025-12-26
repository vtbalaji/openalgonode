import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { CancelOrderRequest, OrderResponse } from '@/lib/types/openalgo';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/v1/cancelorder
 * OpenAlgo-compatible cancel order endpoint
 * Thin router that calls internal broker endpoint
 * Authentication: API key in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body: CancelOrderRequest = await request.json();

    // Authenticate using API key
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) {
      return authResult.response;
    }

    const { userId, broker, permissions } = authResult.context;

    // Check permission
    const permissionError = requirePermission(permissions, 'cancelorder');
    if (permissionError) {
      return permissionError;
    }

    // Validate required fields
    if (!body.orderid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required field: orderid',
        },
        { status: 400 }
      );
    }

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'cancel-order', {
      userId,
      orderid: body.orderid,
    });

    return NextResponse.json(data, { status });
  } catch (error) {
    console.error('Error in cancelorder API:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

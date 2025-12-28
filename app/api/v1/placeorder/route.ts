import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { PlaceOrderRequest, OrderResponse } from '@/lib/types/openalgo';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/v1/placeorder
 * OpenAlgo-compatible place order endpoint (ROUTER)
 * Thin router that routes to broker-specific internal endpoints
 * Authentication: API key in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body: PlaceOrderRequest = await request.json();

    // Authenticate using API key from request body
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) {
      return authResult.response;
    }

    const { userId, broker, permissions } = authResult.context;

    // Check if API key has placeorder permission
    const permissionError = requirePermission(permissions, 'placeorder');
    if (permissionError) {
      return permissionError;
    }

    // Validate required fields
    if (!body.exchange || !body.symbol || !body.action || !body.quantity) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: exchange, symbol, action, quantity',
        },
        { status: 400 }
      );
    }

    // Route to broker-specific internal endpoint
    if (broker === 'zerodha' || broker === 'angel') {
      const { data, status } = await callInternalBrokerEndpoint(broker, 'place-order', {
        userId,
        symbol: body.symbol,
        exchange: body.exchange,
        action: body.action,
        quantity: body.quantity,
        product: body.product || 'MIS',
        pricetype: body.pricetype || 'MARKET',
        price: body.price || 0,
        trigger_price: body.trigger_price || 0,
        disclosed_quantity: body.disclosed_quantity || 0,
        strategy: body.strategy,
      });

      return NextResponse.json(data, { status });
    } else {
      return NextResponse.json(
        {
          status: 'error',
          message: `Broker '${broker}' is not yet supported`,
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in placeorder router:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

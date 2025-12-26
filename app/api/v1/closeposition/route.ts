import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { ClosePositionRequest, OrderResponse } from '@/lib/types/openalgo';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/v1/closeposition
 * OpenAlgo-compatible close position endpoint
 * Thin router that calls internal broker endpoint
 * Authentication: API key in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body: ClosePositionRequest = await request.json();

    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) {
      return authResult.response;
    }

    const { userId, broker, permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'closeposition');
    if (permissionError) {
      return permissionError;
    }

    // Validate required fields
    if (!body.symbol || !body.exchange || !body.product) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: symbol, exchange, product',
        },
        { status: 400 }
      );
    }

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'close-position', {
      userId,
      symbol: body.symbol,
      exchange: body.exchange,
      product: body.product,
    });

    return NextResponse.json(data, { status });
  } catch (error) {
    console.error('Error in closeposition API:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

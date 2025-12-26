import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { OrderBookRequest, ApiResponse, OrderBookItem } from '@/lib/types/openalgo';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/v1/orderbook
 * OpenAlgo-compatible order book endpoint
 * Thin router that calls internal broker endpoint
 * Authentication: API key in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body: OrderBookRequest = await request.json();

    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) {
      return authResult.response;
    }

    const { userId, broker, permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'vieworders');
    if (permissionError) {
      return permissionError;
    }

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'orderbook', {
      userId,
    });

    return NextResponse.json(data, { status });
  } catch (error) {
    console.error('Error in orderbook API:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

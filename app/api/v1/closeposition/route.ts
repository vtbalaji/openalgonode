import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { ClosePositionRequest, OrderResponse } from '@/lib/types/openalgo';

/**
 * POST /api/v1/closeposition
 * OpenAlgo-compatible close position endpoint
 * Authentication: API key in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body: ClosePositionRequest = await request.json();

    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) {
      return authResult.response;
    }

    const { permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'closeposition');
    if (permissionError) {
      return permissionError;
    }

    // TODO: Implement close position logic
    const response: OrderResponse = {
      status: 'error',
      message: 'Close position API is not yet implemented',
    };

    return NextResponse.json(response, { status: 501 });
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

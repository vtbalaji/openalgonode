import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { CancelAllOrdersRequest, OrderResponse } from '@/lib/types/openalgo';

/**
 * POST /api/v1/cancelallorder
 * OpenAlgo-compatible cancel all orders endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body: CancelAllOrdersRequest = await request.json();
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) return authResult.response;

    const { permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'cancelorder');
    if (permissionError) return permissionError;

    const response: OrderResponse = {
      status: 'error',
      message: 'Cancel all orders API is not yet implemented',
    };
    return NextResponse.json(response, { status: 501 });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

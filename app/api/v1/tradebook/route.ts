import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { TradeBookRequest, ApiResponse, TradeBookItem } from '@/lib/types/openalgo';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/v1/tradebook
 * OpenAlgo-compatible trade book endpoint
 * Thin router that calls internal broker endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body: TradeBookRequest = await request.json();
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) return authResult.response;

    const { userId, broker, permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'vieworders');
    if (permissionError) return permissionError;

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'tradebook', {
      userId,
    });

    return NextResponse.json(data, { status });
  } catch (error) {
    console.error('Error in tradebook API:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

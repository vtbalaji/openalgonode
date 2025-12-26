import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { FundsRequest, ApiResponse, FundsData } from '@/lib/types/openalgo';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/v1/funds
 * OpenAlgo-compatible funds/margin endpoint
 * Thin router that calls internal broker endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body: FundsRequest = await request.json();
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) return authResult.response;

    const { userId, broker, permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'viewfunds');
    if (permissionError) return permissionError;

    // Call internal broker endpoint
    const { data, status } = await callInternalBrokerEndpoint(broker, 'funds', {
      userId,
    });

    return NextResponse.json(data, { status });
  } catch (error) {
    console.error('Error in funds API:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

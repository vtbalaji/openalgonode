import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { CancelAllOrdersRequest, OrderResponse } from '@/lib/types/openalgo';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/v1/cancelallorder
 * OpenAlgo-compatible cancel all orders endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body: CancelAllOrdersRequest = await request.json();
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) return authResult.response;

    const { userId, broker, permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'cancelorder');
    if (permissionError) return permissionError;

    // Get broker auth token from cache
    const configData = await getCachedBrokerConfig(userId, broker);

    if (!configData) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Broker configuration not found',
        },
        { status: 404 }
      );
    }

    // Check if broker is authenticated
    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Broker not authenticated. Please authenticate first.',
        },
        { status: 401 }
      );
    }

    const accessToken = decryptData(configData.accessToken);

    // Cancel all orders based on broker
    if (broker === 'zerodha') {
      const { getOrderBook, cancelOrder } = await import('@/lib/zerodhaClient');

      try {
        // Get all orders
        const orders = await getOrderBook(accessToken);

        // Filter for pending/open orders (not completed, cancelled, or rejected)
        const cancelableStatuses = ['OPEN', 'PENDING', 'TRIGGER PENDING'];
        const pendingOrders = orders.filter((order: any) =>
          cancelableStatuses.includes(order.status)
        );

        if (pendingOrders.length === 0) {
          return NextResponse.json(
            {
              status: 'success',
              message: 'No pending orders to cancel',
            },
            { status: 200 }
          );
        }

        // Cancel all pending orders
        const cancelResults = await Promise.allSettled(
          pendingOrders.map((order: any) =>
            cancelOrder(accessToken, order.order_id)
          )
        );

        // Count successes and failures
        const successful = cancelResults.filter(
          (result) => result.status === 'fulfilled'
        ).length;
        const failed = cancelResults.filter(
          (result) => result.status === 'rejected'
        ).length;

        const response: OrderResponse = {
          status: failed === 0 ? 'success' : 'error',
          message: `Cancelled ${successful} order(s). ${failed > 0 ? `Failed: ${failed}` : ''}`,
        };

        return NextResponse.json(response, { status: 200 });
      } catch (error: any) {
        const response: OrderResponse = {
          status: 'error',
          message: error.message || 'Failed to cancel all orders',
        };
        return NextResponse.json(response, { status: 400 });
      }
    } else {
      return NextResponse.json(
        {
          status: 'error',
          message: `Broker '${broker}' is not yet supported`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error in cancelallorder API:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

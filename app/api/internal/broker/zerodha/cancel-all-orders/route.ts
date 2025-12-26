/**
 * POST /api/internal/broker/zerodha/cancel-all-orders
 * Cancel all Zerodha pending orders
 * Internal endpoint - called by /api/v1/cancelallorder and /api/ui/
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing userId' },
        { status: 400 }
      );
    }

    // Get Zerodha broker config
    const configData = await getCachedBrokerConfig(userId, 'zerodha');

    if (!configData) {
      return NextResponse.json(
        { status: 'error', message: 'Zerodha not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { status: 'error', message: 'Zerodha not authenticated' },
        { status: 401 }
      );
    }

    const accessToken = decryptData(configData.accessToken);

    // Import Zerodha client
    const { getOrderBook, cancelOrder } = await import('@/lib/zerodhaClient');

    try {
      // Get all pending orders
      const orders = await getOrderBook(accessToken);
      const pendingOrders = orders.filter((o: any) => o.status === 'PENDING');

      if (pendingOrders.length === 0) {
        return NextResponse.json(
          {
            status: 'success',
            message: 'No pending orders to cancel',
            data: { cancelled: 0 },
          },
          { status: 200 }
        );
      }

      // Cancel all pending orders in parallel
      const cancelPromises = pendingOrders.map((order: any) =>
        cancelOrder(accessToken, order.order_id).catch((err: any) => ({
          error: true,
          orderId: order.order_id,
          message: err.message,
        }))
      );

      const results = await Promise.allSettled(cancelPromises);

      const cancelled = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return NextResponse.json(
        {
          status: 'success',
          message: `Cancelled ${cancelled} orders, ${failed} failed`,
          data: { cancelled, failed, total: pendingOrders.length },
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { status: 'error', message: error.message || 'Failed to cancel all orders' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Zerodha cancel-all-orders:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

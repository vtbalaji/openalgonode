import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { OrderBookRequest, ApiResponse, OrderBookItem } from '@/lib/types/openalgo';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/v1/orderbook
 * OpenAlgo-compatible order book endpoint
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

    // Fetch order book based on broker
    if (broker === 'zerodha') {
      const { getOrderBook } = await import('@/lib/zerodhaClient');

      try {
        const orders = await getOrderBook(accessToken);

        const response: ApiResponse<OrderBookItem[]> = {
          status: 'success',
          data: orders,
        };

        return NextResponse.json(response, { status: 200 });
      } catch (error: any) {
        const response: ApiResponse<OrderBookItem[]> = {
          status: 'error',
          message: error.message || 'Failed to fetch order book',
          data: [],
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

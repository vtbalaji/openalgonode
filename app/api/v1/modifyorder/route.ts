import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { ModifyOrderRequest, OrderResponse } from '@/lib/types/openalgo';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/v1/modifyorder
 * OpenAlgo-compatible modify order endpoint
 * Authentication: API key in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body: ModifyOrderRequest = await request.json();

    // Authenticate
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) {
      return authResult.response;
    }

    const { userId, broker, permissions } = authResult.context;

    // Check permission
    const permissionError = requirePermission(permissions, 'modifyorder');
    if (permissionError) {
      return permissionError;
    }

    // Validate required fields
    if (!body.orderid || !body.quantity || body.price === undefined) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: orderid, quantity, price',
        },
        { status: 400 }
      );
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

    // Modify order based on broker
    if (broker === 'zerodha') {
      const { modifyOrder, transformOrderData } = await import('@/lib/zerodhaClient');

      // Transform OpenAlgo format to Zerodha format
      const orderData = {
        symbol: body.symbol,
        exchange: body.exchange,
        action: body.action,
        quantity: body.quantity,
        product: body.product,
        pricetype: body.pricetype,
        price: body.price,
        trigger_price: body.trigger_price,
        disclosed_quantity: body.disclosed_quantity,
      };

      const zerodhaOrder = transformOrderData(orderData);

      try {
        const result = await modifyOrder(accessToken, body.orderid, zerodhaOrder);

        const response: OrderResponse = {
          status: 'success',
          orderid: result.order_id,
          message: 'Order modified successfully',
        };

        return NextResponse.json(response, { status: 200 });
      } catch (error: any) {
        const response: OrderResponse = {
          status: 'error',
          message: error.message || 'Failed to modify order',
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
    console.error('Error in modifyorder API:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

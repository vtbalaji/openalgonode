import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { PlaceOrderRequest, OrderResponse } from '@/lib/types/openalgo';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/v1/placeorder
 * OpenAlgo-compatible place order endpoint
 * Authentication: API key in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body: PlaceOrderRequest = await request.json();

    // Authenticate using API key from request body
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) {
      return authResult.response;
    }

    const { userId, broker, permissions } = authResult.context;

    // Check if API key has placeorder permission
    const permissionError = requirePermission(permissions, 'placeorder');
    if (permissionError) {
      return permissionError;
    }

    // Validate required fields
    if (!body.exchange || !body.symbol || !body.action || !body.quantity) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: exchange, symbol, action, quantity',
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

    // Place order based on broker
    // For now, we only support Zerodha - will be extended with broker factory
    if (broker === 'zerodha') {
      const { placeOrder, transformOrderData } = await import('@/lib/zerodhaClient');

      // Transform OpenAlgo format to our internal format, then to Zerodha format
      const orderData = {
        symbol: body.symbol,
        exchange: body.exchange,
        action: body.action,
        quantity: body.quantity,
        product: body.product || 'MIS',
        pricetype: body.pricetype || 'MARKET',
        price: body.price || 0,
        trigger_price: body.trigger_price || 0,
        disclosed_quantity: body.disclosed_quantity || 0,
      };

      const zerodhaOrder = transformOrderData(orderData);

      try {
        const result = await placeOrder(accessToken, zerodhaOrder);

        // Store order in Firestore for reference
        const ordersRef = adminDb.collection('users').doc(userId).collection('orders');
        await ordersRef.doc(result.order_id).set({
          orderId: result.order_id,
          symbol: body.symbol,
          exchange: body.exchange,
          action: body.action,
          quantity: body.quantity,
          product: body.product || 'MIS',
          pricetype: body.pricetype || 'MARKET',
          strategy: body.strategy,
          status: 'pending',
          createdAt: new Date(),
          zerodhaResponse: result,
        });

        const response: OrderResponse = {
          status: 'success',
          orderid: result.order_id,
        };

        return NextResponse.json(response, { status: 200 });
      } catch (error: any) {
        const response: OrderResponse = {
          status: 'error',
          message: error.message || 'Failed to place order',
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
    console.error('Error in placeorder API:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

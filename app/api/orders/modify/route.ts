import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiKeyAuth';
import { modifyOrder } from '@/lib/zerodhaClient';
import { authenticateOrderRequest, authErrorResponse } from '@/lib/orderAuthUtils';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

interface ModifyOrderRequest {
  apikey?: string;
  orderid: string;
  quantity?: number;
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
  order_type?: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  validity?: string;
  // Additional fields needed for order modification
  tradingsymbol?: string;
  exchange?: string;
  transaction_type?: string;
  product?: string;
}

/**
 * POST /api/orders/modify
 * Modify an open order (quantity, price, trigger price, etc.)
 * Authentication: Supports multiple methods
 *   1. API key in request body: { apikey: "..." }
 *   2. Bearer token: Authorization: Bearer <firebase_token>
 *   3. Basic auth: Authorization: Basic base64(api_key:access_token)
 *   4. Plain: Authorization: api_key:access_token
 */
export async function POST(request: NextRequest) {
  try {
    const body: ModifyOrderRequest = await request.json();

    if (!body.orderid) {
      return NextResponse.json(
        { error: 'Missing required field: orderid' },
        { status: 400 }
      );
    }

    // Authenticate using utility function
    const authHeader = request.headers.get('authorization');
    const authResult = await authenticateOrderRequest(authHeader, body.apikey);

    if (!authResult.success) {
      return authErrorResponse(authResult.error!);
    }

    const { userId, broker, permissions } = authResult.context!;

    // Check permission if using API key auth
    if (body.apikey && permissions) {
      const permissionError = requirePermission(permissions, 'modifyorder');
      if (permissionError) {
        return permissionError;
      }
    }

    const {
      orderid,
      quantity,
      price,
      trigger_price,
      disclosed_quantity,
      order_type,
      validity,
      tradingsymbol,
      exchange,
      transaction_type,
      product,
    } = body;

    // Retrieve broker config from cache
    const configData = await getCachedBrokerConfig(userId, broker);

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker configuration not found' },
        { status: 404 }
      );
    }

    // Check if broker is authenticated
    if (!configData.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Broker not authenticated. Please authenticate first.' },
        { status: 401 }
      );
    }

    const accessToken = decryptData(configData.accessToken);

    // Build the order payload for modification
    const orderPayload = {
      tradingsymbol: tradingsymbol || '',
      exchange: exchange || '',
      transaction_type: (transaction_type || 'BUY') as 'BUY' | 'SELL',
      order_type: (order_type || 'LIMIT') as 'MARKET' | 'LIMIT' | 'SL' | 'SL-M',
      quantity: quantity || 1,
      product: (product || 'MIS') as 'MIS' | 'CNC' | 'NRML',
      price: price ?? 0,
      trigger_price: trigger_price ?? 0,
      disclosed_quantity: disclosed_quantity ?? 0,
      validity: validity || 'DAY',
    };

    // Modify the order via Zerodha
    let result;
    try {
      result = await modifyOrder(accessToken, orderid, orderPayload);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to modify order' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        message: `Order ${orderid} modified successfully`,
        orderid: result.order_id || orderid,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error modifying order:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to modify order' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { ModifyOrderRequest, OrderResponse } from '@/lib/types/openalgo';
import { callInternalBrokerEndpoint } from '@/lib/internalRouting';

/**
 * POST /api/v1/modifyorder
 * OpenAlgo-compatible modify order endpoint
 * Thin router that calls internal broker endpoint
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

    // Call internal broker endpoint with broker-specific field mapping
    let brokerPayload: any = {
      userId,
      orderid: body.orderid,
      symbol: body.symbol,
      exchange: body.exchange,
      action: body.action,
      quantity: body.quantity,
      product: body.product,
      pricetype: body.pricetype,
      price: body.price,
      trigger_price: body.trigger_price,
      disclosed_quantity: body.disclosed_quantity,
      symboltoken: body.token, // Map OpenAlgo 'token' to broker 'symboltoken'
    };

    // Fyers uses different field names - map OpenAlgo fields to Fyers format
    if (broker === 'fyers') {
      brokerPayload = {
        userId,
        orderid: body.orderid,
        symbol: body.symbol,
        qty: body.quantity,
        side: body.action, // OpenAlgo 'action' (BUY/SELL) maps to Fyers 'side'
        type: body.pricetype || 'MARKET', // OpenAlgo 'pricetype' maps to Fyers 'type'
        productType: body.product, // OpenAlgo 'product' maps to Fyers 'productType'
        price: body.price,
        stopPrice: body.trigger_price,
      };
    }

    const { data, status } = await callInternalBrokerEndpoint(broker, 'modify-order', brokerPayload);

    return NextResponse.json(data, { status });
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

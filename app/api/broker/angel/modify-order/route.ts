/**
 * POST /api/broker/angel/modify-order
 * Angel-specific order modification
 * Internal endpoint - called by /api/v1/modifyorder router
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, orderid, quantity, price, trigger_price, pricetype, product, symbol, exchange, symboltoken, disclosed_quantity } = body;

    if (!userId || !orderid) {
      return NextResponse.json(
        { status: 'error', message: 'Missing userId or orderid' },
        { status: 400 }
      );
    }

    // Get Angel broker config
    const configData = await getCachedBrokerConfig(userId, 'angel');

    if (!configData) {
      return NextResponse.json(
        { status: 'error', message: 'Angel Broker not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { status: 'error', message: 'Angel Broker not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt JWT token and API key with error handling
    let jwtToken: string;
    let apiKey: string;

    try {
      jwtToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return NextResponse.json(
        { status: 'error', message: 'Failed to decrypt credentials. Please re-authenticate.' },
        { status: 401 }
      );
    }

    // Import Angel client
    const { modifyOrder } = await import('@/lib/angelClient');

    // Use provided symboltoken
    let resolvedSymboltoken = symboltoken;
    let resolvedSymbol = symbol;

    if (!resolvedSymboltoken) {
      console.log(`[ANGEL-MODIFY-ORDER] No symboltoken provided, symbol lookup may be required`);
    }

    const orderPayload = {
      orderid,
      quantity,
      price,
      trigger_price,
      pricetype,
      product,
      symbol: resolvedSymbol,
      exchange,
      symboltoken: resolvedSymboltoken,
      disclosed_quantity,
    };

    try {
      const result = await modifyOrder(jwtToken, apiKey, orderPayload);

      return NextResponse.json(
        {
          status: 'success',
          orderid: result.orderid,
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { status: 'error', message: error.message || 'Failed to modify order' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Angel modify-order:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/broker/angel/place-order
 * Angel-specific order placement
 * Internal endpoint - called by /api/v1/placeorder router
 *
 * Authentication: Firebase ID token or API key (via parent router)
 * Body: {
 *   userId: string,
 *   symbol: string,
 *   exchange: string,
 *   action: 'BUY' | 'SELL',
 *   quantity: number,
 *   product?: string,
 *   pricetype?: string,
 *   price?: number,
 *   trigger_price?: number,
 *   disclosed_quantity?: number,
 *   symboltoken?: string,
 *   strategy?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      symbol,
      exchange,
      action,
      quantity,
      product = 'MIS',
      pricetype = 'MARKET',
      price = 0,
      trigger_price = 0,
      disclosed_quantity = 0,
      symboltoken = '',
      strategy,
    } = body;

    // Validate required fields
    if (!userId || !symbol || !exchange || !action || !quantity) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: userId, symbol, exchange, action, quantity',
        },
        { status: 400 }
      );
    }

    // Get Angel broker config
    const configData = await getCachedBrokerConfig(userId, 'angel');

    if (!configData) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Angel Broker not configured for this user',
        },
        { status: 404 }
      );
    }

    // Check if broker is authenticated
    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Angel Broker not authenticated. Please authenticate first.',
        },
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
        {
          status: 'error',
          message: 'Failed to decrypt credentials. Please re-authenticate.',
        },
        { status: 401 }
      );
    }

    // Import Angel client
    const { placeOrder, transformOrderData } = await import('@/lib/angelClient');

    // Use provided symboltoken - Angel requires this
    let resolvedSymboltoken = symboltoken;
    let resolvedSymbol = symbol;

    if (!resolvedSymboltoken) {
      console.warn(`[ANGEL-PLACE-ORDER] No symboltoken provided for ${symbol}, Angel API may reject order`);
    } else {
      console.log(`[ANGEL-PLACE-ORDER] Symboltoken provided by caller: ${resolvedSymboltoken}`);
    }

    // Transform order data to Angel format
    const orderData = {
      symbol: resolvedSymbol,
      exchange,
      action,
      quantity,
      product,
      pricetype,
      price,
      trigger_price,
      disclosed_quantity,
      symboltoken: resolvedSymboltoken,
    };

    const angelOrder = transformOrderData(orderData, resolvedSymboltoken);

    try {
      // Place order with Angel
      console.log(`[ANGEL-PLACE-ORDER] Calling Angel API with:`, {
        symbol,
        exchange,
        action,
        quantity,
        product,
        pricetype,
        symboltoken: resolvedSymboltoken,
      });

      const result = await placeOrder(jwtToken, apiKey, angelOrder);

      console.log(`[ANGEL-PLACE-ORDER] Success:`, result);

      // Store order in Firestore for reference
      // ℹ️ Use standardized field names for both brokers
      const ordersRef = adminDb.collection('users').doc(userId).collection('orders');
      const brokerOrderId = result.orderid; // Angel uses 'orderid'
      const orderDoc: any = {
        // Standardized fields (same for all brokers)
        order_id: brokerOrderId,       // Standard field name for queries
        symbol: resolvedSymbol,
        exchange,
        action,
        quantity,
        product,
        pricetype,
        broker: 'angel',
        status: 'pending',
        createdAt: new Date(),

        // Broker-specific response (for debugging)
        angelResponse: result,
      };
      if (strategy) {
        orderDoc.strategy = strategy;
      }
      await ordersRef.doc(brokerOrderId).set(orderDoc);

      return NextResponse.json(
        {
          status: 'success',
          order_id: result.orderid,        // Standardized field name
          orderid: result.orderid,         // Keep for backward compatibility
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error(`[ANGEL-PLACE-ORDER] Error:`, {
        message: error.message,
        error: error.toString(),
        response: error.response?.data,
      });

      return NextResponse.json(
        {
          status: 'error',
          message: error.message || 'Failed to place order with Angel Broker',
          details: error.response?.data || error.toString(),
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Angel place-order:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

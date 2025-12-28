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

    // Import Angel client and symbol mapping service
    const { placeOrder, transformOrderData, searchScrip } = await import('@/lib/angelClient');
    const { getSymbolMapping, searchSymbolMappings } = await import('@/lib/symbolMapping');

    // Lookup symboltoken using symbol mapping table (OpenAlgo pattern)
    let resolvedSymboltoken = symboltoken;
    let resolvedSymbol = symbol;

    if (!resolvedSymboltoken) {
      console.log(`[ANGEL-PLACE-ORDER] Symboltoken not provided, attempting lookup for ${symbol} on ${exchange}...`);

      // Step 1: Try symbol mapping table (fast, cached)
      console.log(`[ANGEL-PLACE-ORDER] Step 1: Checking symbol mapping table...`);
      const mapping = await getSymbolMapping(symbol, exchange, 'angel');
      if (mapping) {
        resolvedSymboltoken = mapping.token;
        resolvedSymbol = mapping.brsymbol;
        console.log(`[ANGEL-PLACE-ORDER] ✓ Found in mapping table: ${resolvedSymbol} (Token: ${resolvedSymboltoken})`);
      } else {
        // Step 2: Try fuzzy search in mapping table
        console.log(`[ANGEL-PLACE-ORDER] Step 2: Fuzzy search in mapping table...`);
        const fuzzyMatches = await searchSymbolMappings(symbol, exchange, 'angel', 3);
        if (fuzzyMatches.length > 0) {
          const match = fuzzyMatches[0];
          resolvedSymboltoken = match.token;
          resolvedSymbol = match.brsymbol;
          console.log(
            `[ANGEL-PLACE-ORDER] ⚠ Fuzzy match found: ${resolvedSymbol} (Token: ${resolvedSymboltoken})`
          );
        } else {
          // Step 3: Fallback to on-demand searchScrip (slow, but handles edge cases)
          console.log(`[ANGEL-PLACE-ORDER] Step 3: Fallback to on-demand symbol search...`);
          try {
            const scrip = await searchScrip(jwtToken, apiKey, symbol, exchange);
            if (scrip) {
              resolvedSymboltoken = scrip.symboltoken;
              resolvedSymbol = scrip.trading_symbol;
              console.log(
                `[ANGEL-PLACE-ORDER] ✓ Found via searchScrip: ${resolvedSymbol} (Token: ${resolvedSymboltoken})`
              );
            } else {
              console.warn(
                `[ANGEL-PLACE-ORDER] ✗ Symbol not found in any lookup method for ${symbol} on ${exchange}`
              );
              // Don't block the order - let Angel's API handle the error
            }
          } catch (error: any) {
            console.warn(`[ANGEL-PLACE-ORDER] Error in fallback searchScrip:`, error.message);
            // Don't block the order - let Angel's API handle the error
          }
        }
      }
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
      const ordersRef = adminDb.collection('users').doc(userId).collection('orders');
      const orderDoc: any = {
        orderId: result.orderid,
        symbol: resolvedSymbol,
        exchange,
        action,
        quantity,
        product,
        pricetype,
        broker: 'angel',
        status: 'pending',
        createdAt: new Date(),
        angelResponse: result,
      };
      if (strategy) {
        orderDoc.strategy = strategy;
      }
      await ordersRef.doc(result.orderid).set(orderDoc);

      return NextResponse.json(
        {
          status: 'success',
          orderid: result.orderid,
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

/**
 * Internal Routing Helper
 * Used by external API (v1) routers to call internal broker-specific endpoints
 *
 * IMPORTANT: Uses direct server-side imports instead of HTTP calls to avoid
 * Vercel authentication issues and improve performance
 */

import { NextRequest, NextResponse } from 'next/server';

// Import broker route handlers directly
import * as zerodhaPlaceOrder from '@/app/api/broker/zerodha/place-order/route';
import * as zerodhaCancelOrder from '@/app/api/broker/zerodha/cancel-order/route';
import * as zerodhaModifyOrder from '@/app/api/broker/zerodha/modify-order/route';
import * as zerodhaOrderbook from '@/app/api/broker/zerodha/orderbook/route';
import * as zerodhaTradebook from '@/app/api/broker/zerodha/tradebook/route';
import * as zerodhaPositions from '@/app/api/broker/zerodha/positions/route';
import * as zerodhaHoldings from '@/app/api/broker/zerodha/holdings/route';
import * as zerodhaFunds from '@/app/api/broker/zerodha/funds/route';
import * as zerodhaClosePosition from '@/app/api/broker/zerodha/close-position/route';
import * as zerodhaCancelAllOrders from '@/app/api/broker/zerodha/cancel-all-orders/route';

/**
 * Call broker-specific endpoint directly (server-side)
 * No HTTP calls - direct function invocation
 */
export async function callInternalBrokerEndpoint(
  broker: string,
  action: string,
  body: any
): Promise<any> {
  // Create a fake NextRequest with the body
  const request = new NextRequest('http://localhost/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let response: NextResponse;

  // Route to the correct handler based on broker and action
  if (broker === 'zerodha') {
    switch (action) {
      case 'place-order':
        response = await zerodhaPlaceOrder.POST(request);
        break;
      case 'cancel-order':
        response = await zerodhaCancelOrder.POST(request);
        break;
      case 'modify-order':
        response = await zerodhaModifyOrder.POST(request);
        break;
      case 'orderbook':
        response = await zerodhaOrderbook.POST(request);
        break;
      case 'tradebook':
        response = await zerodhaTradebook.POST(request);
        break;
      case 'positions':
        response = await zerodhaPositions.POST(request);
        break;
      case 'holdings':
        response = await zerodhaHoldings.POST(request);
        break;
      case 'funds':
        response = await zerodhaFunds.POST(request);
        break;
      case 'close-position':
        response = await zerodhaClosePosition.POST(request);
        break;
      case 'cancel-all-orders':
        response = await zerodhaCancelAllOrders.POST(request);
        break;
      default:
        throw new Error(`Unknown action: ${action} for broker: ${broker}`);
    }
  } else {
    throw new Error(`Unsupported broker: ${broker}`);
  }

  // Extract data from response
  const data = await response.json();
  return { data, status: response.status };
}

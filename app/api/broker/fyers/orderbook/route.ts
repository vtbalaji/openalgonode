import { NextRequest, NextResponse } from 'next/server';
import { getFyersOrderbook } from '@/lib/fyersClient';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/broker/fyers/orderbook
 * Get orderbook from Fyers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Get broker config from cache
    const configData = await getCachedBrokerConfig(userId, 'fyers');

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Broker not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt access token and API key
    let accessToken: string;
    let apiKey: string;
    try {
      accessToken = decryptData(configData.accessToken);
      apiKey = decryptData(configData.apiKey);

      console.log('[ORDERBOOK-ROUTE] Decryption successful');
      console.log('[ORDERBOOK-ROUTE] Access token preview:', accessToken.substring(0, 30) + '...');
      console.log('[ORDERBOOK-ROUTE] API key (app_id):', apiKey);
      console.log('[ORDERBOOK-ROUTE] API key length:', apiKey.length);
      console.log('[ORDERBOOK-ROUTE] API key type:', typeof apiKey);
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return NextResponse.json(
        { error: 'Failed to decrypt broker credentials' },
        { status: 400 }
      );
    }

    // Fyers API requires app_id (which is the Client ID/API Key)
    if (!apiKey) {
      console.error('Missing API key');
      return NextResponse.json(
        { error: 'Missing API key configuration' },
        { status: 400 }
      );
    }

    console.log('[ORDERBOOK-ROUTE] Calling getFyersOrderbook with userId:', userId);
    // Get orderbook
    const result = await getFyersOrderbook(accessToken, apiKey);

    // Map Fyers status codes to standard status
    // Fyers API v3 order status codes (from official documentation):
    // 1 = CANCELLED
    // 2 = TRADED/FILLED (COMPLETE)
    // 3 = Not used currently
    // 4 = TRANSIT (in progress)
    // 5 = REJECTED
    // 6 = PENDING
    // 7 = EXPIRED
    const statusMap: { [key: number]: string } = {
      1: 'CANCELLED',
      2: 'COMPLETE',
      3: 'OPEN',
      4: 'OPEN',
      5: 'REJECTED',
      6: 'OPEN',
      7: 'EXPIRED',
    };

    // Map Fyers order type codes to BUY/SELL
    // Fyers: 1 = SELL, 2 = BUY
    const typeMap: { [key: number]: string } = {
      1: 'SELL',
      2: 'BUY',
    };

    // Extract and map orders array
    const rawOrders = result.orderBook || [];
    const orders = rawOrders.map((order: any) => {
      // Extract symbol from the symbol field (e.g., "NSE:KAYNES-EQ" -> "KAYNES-EQ")
      const parts = (order.symbol || '').split(':');
      const tradingsymbol = parts[1] || parts[0] || '';
      const exchange = parts[0] || 'NSE';

      return {
        order_id: order.id || '',
        orderid: order.id || '',
        tradingsymbol: tradingsymbol,
        exchange: exchange,
        transaction_type: typeMap[order.type] || 'BUY',
        quantity: order.qty || 0,
        filled_quantity: order.executedQty || order.filledQty || 0,
        price: order.limitPrice || order.stopPrice || 0,
        average_price: order.executedPrice || 0,
        status: statusMap[order.status] || 'OPEN',
        order_timestamp: order.orderDateTime || new Date().toISOString(),
        created_at: order.orderDateTime || new Date().toISOString(),
      };
    });
    console.log('[ORDERBOOK-ROUTE] Mapped orders count:', orders.length);

    return NextResponse.json({
      ...result,
      orders: orders,
    }, { status: 200 });
  } catch (error: any) {
    console.error('Error getting Fyers orderbook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get orderbook' },
      { status: 500 }
    );
  }
}

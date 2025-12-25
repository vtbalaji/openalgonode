import crypto from 'crypto';

const ZERODHA_BASE_URL = 'https://api.kite.trade';

interface OrderPayload {
  tradingsymbol: string;
  exchange: string;
  transaction_type: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  quantity: number;
  product: 'MIS' | 'CNC' | 'NRML';
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
  validity?: string;
  tag?: string;
}

/**
 * Authenticate with Zerodha API using request token
 * Returns access token that can be used for subsequent API calls
 */
export async function authenticateZerodha(
  apiKey: string,
  requestToken: string,
  apiSecret: string
): Promise<string> {
  try {
    // Generate SHA256 checksum
    const checksumInput = `${apiKey}${requestToken}${apiSecret}`;
    const checksum = crypto.createHash('sha256').update(checksumInput).digest('hex');

    const response = await fetch(`${ZERODHA_BASE_URL}/session/token`, {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: requestToken,
        checksum: checksum,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Authentication failed');
    }

    const data = await response.json();
    if (!data.data?.access_token) {
      throw new Error('No access token returned from Zerodha API');
    }

    return data.data.access_token;
  } catch (error) {
    console.error('Zerodha authentication error:', error);
    throw error;
  }
}

/**
 * Place an order on Zerodha
 */
export async function placeOrder(
  accessToken: string,
  orderPayload: OrderPayload
): Promise<{ order_id: string; [key: string]: any }> {
  try {
    // Convert order payload to URL-encoded form
    const formData = new URLSearchParams({
      tradingsymbol: orderPayload.tradingsymbol,
      exchange: orderPayload.exchange,
      transaction_type: orderPayload.transaction_type,
      order_type: orderPayload.order_type,
      quantity: orderPayload.quantity.toString(),
      product: orderPayload.product,
      price: (orderPayload.price || '0').toString(),
      trigger_price: (orderPayload.trigger_price || '0').toString(),
      disclosed_quantity: (orderPayload.disclosed_quantity || '0').toString(),
      validity: orderPayload.validity || 'DAY',
      tag: orderPayload.tag || 'openalgo',
    });

    const response = await fetch(`${ZERODHA_BASE_URL}/orders/regular`, {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to place order');
    }

    const data = await response.json();
    if (!data.data?.order_id) {
      throw new Error('No order ID returned from Zerodha API');
    }

    return data.data;
  } catch (error) {
    console.error('Place order error:', error);
    throw error;
  }
}

/**
 * Get order book (list of all orders)
 */
export async function getOrderBook(accessToken: string): Promise<any[]> {
  try {
    const response = await fetch(`${ZERODHA_BASE_URL}/orders`, {
      method: 'GET',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch order book');
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Get order book error:', error);
    throw error;
  }
}

/**
 * Get order status for a specific order
 */
export async function getOrderStatus(
  accessToken: string,
  orderId: string
): Promise<any> {
  try {
    const orders = await getOrderBook(accessToken);
    const order = orders.find((o) => o.order_id === orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    return order;
  } catch (error) {
    console.error('Get order status error:', error);
    throw error;
  }
}

/**
 * Cancel an order
 */
export async function cancelOrder(
  accessToken: string,
  orderId: string
): Promise<{ order_id: string; [key: string]: any }> {
  try {
    const response = await fetch(`${ZERODHA_BASE_URL}/orders/regular/${orderId}`, {
      method: 'DELETE',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to cancel order');
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Cancel order error:', error);
    throw error;
  }
}

/**
 * Transform OpenAlgo order format to Zerodha format
 */
export function transformOrderData(openAlgoOrder: {
  symbol: string;
  exchange: string;
  action: string;
  quantity: number;
  product: string;
  pricetype: string;
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
}): OrderPayload {
  return {
    tradingsymbol: openAlgoOrder.symbol,
    exchange: openAlgoOrder.exchange,
    transaction_type: openAlgoOrder.action.toUpperCase() as 'BUY' | 'SELL',
    order_type: openAlgoOrder.pricetype as 'MARKET' | 'LIMIT' | 'SL' | 'SL-M',
    quantity: openAlgoOrder.quantity,
    product: openAlgoOrder.product as 'MIS' | 'CNC' | 'NRML',
    price: openAlgoOrder.price,
    trigger_price: openAlgoOrder.trigger_price,
    disclosed_quantity: openAlgoOrder.disclosed_quantity,
  };
}

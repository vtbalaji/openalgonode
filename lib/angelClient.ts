/**
 * Angel Broker API Client
 * Handles all Angel Broker API calls with proper parameter transformation
 * Maps OpenAlgo format to Angel Broker API format
 */

import fetch from 'node-fetch';

const ANGEL_BASE_URL = 'https://apiconnect.angelbroking.com';

/**
 * Angel-specific order payload interface
 */
interface AngelOrderPayload {
  variety: 'NORMAL' | 'STOPLOSS';
  tradingsymbol: string;
  symboltoken: string;
  transactiontype: 'BUY' | 'SELL';
  exchange: string;
  ordertype: 'MARKET' | 'LIMIT' | 'STOPLOSS_LIMIT' | 'STOPLOSS_MARKET';
  producttype: 'DELIVERY' | 'INTRADAY' | 'CARRYFORWARD';
  duration: 'DAY' | 'IOC' | 'FOK';
  price?: string | number;
  triggerprice?: string | number;
  disclosedquantity?: string | number;
  quantity: string | number;
}

/**
 * Generate Angel API headers with required auth and metadata
 */
function getAngelHeaders(jwtToken: string, apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
    'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
    'X-MACAddress': 'MAC_ADDRESS',
    'X-PrivateKey': apiKey,
  };
}

/**
 * Map OpenAlgo order type to Angel order type
 */
export function mapOrderType(pricetype: string): string {
  const mapping: Record<string, string> = {
    'MARKET': 'MARKET',
    'LIMIT': 'LIMIT',
    'SL': 'STOPLOSS_LIMIT',
    'SL-M': 'STOPLOSS_MARKET',
  };
  return mapping[pricetype] || 'MARKET';
}

/**
 * Map OpenAlgo price type to Angel variety
 */
export function mapVariety(pricetype: string): 'NORMAL' | 'STOPLOSS' {
  const mapping: Record<string, 'NORMAL' | 'STOPLOSS'> = {
    'MARKET': 'NORMAL',
    'LIMIT': 'NORMAL',
    'SL': 'STOPLOSS',
    'SL-M': 'STOPLOSS',
  };
  return mapping[pricetype] || 'NORMAL';
}

/**
 * Map OpenAlgo product type to Angel product type
 */
export function mapProductType(product: string): string {
  const mapping: Record<string, string> = {
    'CNC': 'DELIVERY',
    'NRML': 'CARRYFORWARD',
    'MIS': 'INTRADAY',
  };
  return mapping[product] || 'INTRADAY';
}

/**
 * Reverse map Angel product type to OpenAlgo format
 */
export function reverseMapProductType(producttype: string): string {
  const mapping: Record<string, string> = {
    'DELIVERY': 'CNC',
    'CARRYFORWARD': 'NRML',
    'INTRADAY': 'MIS',
  };
  return mapping[producttype] || 'MIS';
}

/**
 * Transform OpenAlgo order data to Angel format
 */
export function transformOrderData(data: any, symboltoken: string = ''): AngelOrderPayload {
  return {
    variety: mapVariety(data.pricetype),
    tradingsymbol: data.symbol,
    symboltoken: symboltoken || data.symboltoken || '',
    transactiontype: (data.action || '').toUpperCase() as 'BUY' | 'SELL',
    exchange: data.exchange,
    ordertype: mapOrderType(data.pricetype),
    producttype: mapProductType(data.product) as 'DELIVERY' | 'INTRADAY' | 'CARRYFORWARD',
    duration: 'DAY',
    price: data.price || '0',
    triggerprice: data.trigger_price || '0',
    disclosedquantity: data.disclosed_quantity || '0',
    quantity: data.quantity,
  };
}

/**
 * Authenticate with Angel Broker using clientCode, PIN, and TOTP
 */
export async function authenticateAngel(
  clientCode: string,
  pin: string,
  totp: string,
  apiKey: string
): Promise<{ jwtToken: string; feedToken?: string }> {
  try {
    const payload = JSON.stringify({
      clientcode: clientCode,
      password: pin,
      totp: totp,
    });

    const response = await fetch(`${ANGEL_BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
        'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
        'X-MACAddress': 'MAC_ADDRESS',
        'X-PrivateKey': apiKey,
      },
      body: payload,
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || `Authentication failed with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.data?.jwtToken) {
      throw new Error('No JWT token returned from Angel API');
    }

    return {
      jwtToken: data.data.jwtToken,
      feedToken: data.data.feedToken,
    };
  } catch (error) {
    console.error('Angel authentication error:', error);
    throw error;
  }
}

/**
 * Place an order on Angel Broker
 */
export async function placeOrder(
  jwtToken: string,
  apiKey: string,
  orderPayload: AngelOrderPayload
): Promise<{ orderid: string; [key: string]: any }> {
  try {
    const payload = JSON.stringify({
      variety: orderPayload.variety,
      tradingsymbol: orderPayload.tradingsymbol,
      symboltoken: orderPayload.symboltoken,
      transactiontype: orderPayload.transactiontype,
      exchange: orderPayload.exchange,
      ordertype: orderPayload.ordertype,
      producttype: orderPayload.producttype,
      duration: orderPayload.duration || 'DAY',
      price: (orderPayload.price || '0').toString(),
      triggerprice: (orderPayload.triggerprice || '0').toString(),
      squareoff: '0',
      stoploss: '0',
      quantity: orderPayload.quantity.toString(),
    });

    const response = await fetch(
      `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/placeOrder`,
      {
        method: 'POST',
        headers: getAngelHeaders(jwtToken, apiKey),
        body: payload,
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || `Failed to place order with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status) {
      throw new Error(data.message || 'Failed to place order');
    }

    return {
      orderid: data.data?.orderid || '',
      ...data.data,
    };
  } catch (error) {
    console.error('Angel place-order error:', error);
    throw error;
  }
}

/**
 * Cancel an order on Angel Broker
 */
export async function cancelOrder(
  jwtToken: string,
  apiKey: string,
  orderId: string
): Promise<{ orderid: string; [key: string]: any }> {
  try {
    const payload = JSON.stringify({
      variety: 'NORMAL',
      orderid: orderId,
    });

    const response = await fetch(
      `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/cancelOrder`,
      {
        method: 'POST',
        headers: getAngelHeaders(jwtToken, apiKey),
        body: payload,
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || `Failed to cancel order with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status) {
      throw new Error(data.message || 'Failed to cancel order');
    }

    return {
      orderid: orderId,
      ...data.data,
    };
  } catch (error) {
    console.error('Angel cancel-order error:', error);
    throw error;
  }
}

/**
 * Modify an existing order on Angel Broker
 */
export async function modifyOrder(
  jwtToken: string,
  apiKey: string,
  orderPayload: any
): Promise<{ orderid: string; [key: string]: any }> {
  try {
    const payload = JSON.stringify({
      variety: mapVariety(orderPayload.pricetype),
      orderid: orderPayload.orderid,
      ordertype: mapOrderType(orderPayload.pricetype),
      producttype: mapProductType(orderPayload.product),
      duration: 'DAY',
      price: (orderPayload.price || '0').toString(),
      triggerprice: (orderPayload.trigger_price || '0').toString(),
      quantity: (orderPayload.quantity || '0').toString(),
      tradingsymbol: orderPayload.symbol,
      symboltoken: orderPayload.symboltoken || '',
      exchange: orderPayload.exchange,
      disclosedquantity: (orderPayload.disclosed_quantity || '0').toString(),
    });

    const response = await fetch(
      `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/modifyOrder`,
      {
        method: 'POST',
        headers: getAngelHeaders(jwtToken, apiKey),
        body: payload,
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || `Failed to modify order with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status && data.message !== 'SUCCESS') {
      throw new Error(data.message || 'Failed to modify order');
    }

    return {
      orderid: data.data?.orderid || orderPayload.orderid,
      ...data.data,
    };
  } catch (error) {
    console.error('Angel modify-order error:', error);
    throw error;
  }
}

/**
 * Get order book from Angel Broker
 */
export async function getOrderBook(
  jwtToken: string,
  apiKey: string
): Promise<any[]> {
  try {
    const response = await fetch(
      `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/getOrderBook`,
      {
        method: 'GET',
        headers: getAngelHeaders(jwtToken, apiKey),
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || `Failed to fetch order book with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status) {
      throw new Error(data.message || 'Failed to fetch order book');
    }

    return data.data || [];
  } catch (error) {
    console.error('Angel getOrderBook error:', error);
    throw error;
  }
}

/**
 * Get trade book from Angel Broker
 */
export async function getTradeBook(
  jwtToken: string,
  apiKey: string
): Promise<any[]> {
  try {
    const response = await fetch(
      `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/getTradeBook`,
      {
        method: 'GET',
        headers: getAngelHeaders(jwtToken, apiKey),
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || `Failed to fetch trade book with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status) {
      throw new Error(data.message || 'Failed to fetch trade book');
    }

    return data.data || [];
  } catch (error) {
    console.error('Angel getTradeBook error:', error);
    throw error;
  }
}

/**
 * Get positions from Angel Broker
 */
export async function getPositions(
  jwtToken: string,
  apiKey: string
): Promise<any[]> {
  try {
    const response = await fetch(
      `${ANGEL_BASE_URL}/rest/secure/angelbroking/order/v1/getPosition`,
      {
        method: 'GET',
        headers: getAngelHeaders(jwtToken, apiKey),
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || `Failed to fetch positions with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status) {
      throw new Error(data.message || 'Failed to fetch positions');
    }

    return data.data || [];
  } catch (error) {
    console.error('Angel getPositions error:', error);
    throw error;
  }
}

/**
 * Get holdings from Angel Broker
 */
export async function getHoldings(
  jwtToken: string,
  apiKey: string
): Promise<any> {
  try {
    const response = await fetch(
      `${ANGEL_BASE_URL}/rest/secure/angelbroking/portfolio/v1/getAllHolding`,
      {
        method: 'GET',
        headers: getAngelHeaders(jwtToken, apiKey),
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || `Failed to fetch holdings with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status) {
      throw new Error(data.message || 'Failed to fetch holdings');
    }

    return data.data || {};
  } catch (error) {
    console.error('Angel getHoldings error:', error);
    throw error;
  }
}

/**
 * Get account funds/balance from Angel Broker
 */
export async function getFunds(
  jwtToken: string,
  apiKey: string
): Promise<any> {
  try {
    // Angel doesn't have a dedicated funds endpoint, so we fetch positions which includes balance info
    const response = await fetch(
      `${ANGEL_BASE_URL}/rest/secure/angelbroking/portfolio/v1/getAllHolding`,
      {
        method: 'GET',
        headers: getAngelHeaders(jwtToken, apiKey),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch funds with status ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status) {
      throw new Error('Failed to fetch funds');
    }

    // Return holdings data which contains balance information
    return data.data?.totalholding || {};
  } catch (error) {
    console.error('Angel getFunds error:', error);
    throw error;
  }
}

/**
 * Cancel all orders from Angel Broker
 */
export async function cancelAllOrders(
  jwtToken: string,
  apiKey: string
): Promise<{ canceled: string[]; failed: string[] }> {
  try {
    const orders = await getOrderBook(jwtToken, apiKey);

    const canceled: string[] = [];
    const failed: string[] = [];

    // Filter orders that are open or trigger_pending
    const ordersToCancel = orders.filter(
      (order: any) => order.status === 'open' || order.status === 'trigger pending'
    );

    // Cancel each order
    for (const order of ordersToCancel) {
      try {
        await cancelOrder(jwtToken, apiKey, order.orderid);
        canceled.push(order.orderid);
      } catch (error) {
        console.error(`Failed to cancel order ${order.orderid}:`, error);
        failed.push(order.orderid);
      }
    }

    return { canceled, failed };
  } catch (error) {
    console.error('Angel cancelAllOrders error:', error);
    throw error;
  }
}

/**
 * Close a specific position on Angel Broker
 */
export async function closePosition(
  jwtToken: string,
  apiKey: string,
  symbol: string,
  exchange: string,
  producttype: string,
  quantity: string
): Promise<{ orderid: string; [key: string]: any }> {
  try {
    // Determine action based on position (need to fetch current position first)
    const positions = await getPositions(jwtToken, apiKey);

    const position = positions.find(
      (p: any) => p.tradingsymbol === symbol && p.exchange === exchange && p.producttype === producttype
    );

    if (!position) {
      throw new Error(`No position found for ${symbol} on ${exchange}`);
    }

    const action = parseInt(position.netqty) > 0 ? 'SELL' : 'BUY';
    const closeQuantity = Math.abs(parseInt(position.netqty));

    const orderPayload: AngelOrderPayload = {
      variety: 'NORMAL',
      tradingsymbol: symbol,
      symboltoken: '',
      transactiontype: action as 'BUY' | 'SELL',
      exchange: exchange,
      ordertype: 'MARKET',
      producttype: producttype as 'DELIVERY' | 'INTRADAY' | 'CARRYFORWARD',
      duration: 'DAY',
      price: '0',
      quantity: closeQuantity.toString(),
    };

    return await placeOrder(jwtToken, apiKey, orderPayload);
  } catch (error) {
    console.error('Angel closePosition error:', error);
    throw error;
  }
}

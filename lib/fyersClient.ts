/**
 * Fyers APIv3 Client
 * Handles authentication and token generation for Fyers broker
 */

import crypto from 'crypto';

// Fyers has multiple API endpoints:
// - https://api.fyers.in/api/v2/orders - ORDER PLACEMENT (v2 API, different host!)
// - https://api-t1.fyers.in/api/v3 - for v3 REST API (orders, positions, etc.)
// - https://api-t1.fyers.in/data - for data API (historical data)
const FYERS_API_URL = 'https://api-t1.fyers.in/api/v3';
const FYERS_ORDER_PLACEMENT_URL = 'https://api.fyers.in/api/v2/orders'; // Order placement uses different host and v2!
const FYERS_DATA_URL = 'https://api-t1.fyers.in/data';

interface FyersAuthResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Authenticate with Fyers using auth code
 * Exchanges auth code for access token
 */
export async function authenticateFyers(
  authCode: string,
  clientId: string,
  clientSecret: string
): Promise<FyersAuthResponse> {
  try {
    console.log('[FYERS] Authenticating with auth code...');
    console.log('[FYERS] Client ID:', clientId.substring(0, 5) + '...');

    // Generate appIdHash: sha256(clientId:clientSecret)
    const checksumInput = `${clientId}:${clientSecret}`;
    const appIdHash = crypto
      .createHash('sha256')
      .update(checksumInput)
      .digest('hex');

    console.log('[FYERS] Generated appIdHash from clientId:clientSecret');

    const payload = {
      grant_type: 'authorization_code',
      appIdHash: appIdHash,
      code: authCode,
    };

    console.log('[FYERS] Request payload:', {
      grant_type: payload.grant_type,
      appIdHash: payload.appIdHash.substring(0, 10) + '...',
      code: authCode ? authCode.substring(0, 20) + '...' : 'missing',
    });

    // Fyers APIv3 validate-authcode endpoint (not /token)
    const tokenResponse = await fetch(`${FYERS_API_URL}/validate-authcode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const tokenData = await tokenResponse.json();
    console.log('[FYERS] Token response:', {
      status: tokenData.s,
      httpStatus: tokenResponse.status,
      message: tokenData.message,
      code: tokenData.code,
    });

    // Check for success response (Fyers uses 's' field instead of standard HTTP status)
    if (tokenData.s !== 'ok') {
      const error = tokenData.message || 'Authentication failed';
      console.error('[FYERS] Token exchange failed:', {
        error,
        status: tokenData.s,
        code: tokenData.code,
        httpStatus: tokenResponse.status,
      });
      throw new Error(`Failed to get access token: ${error}`);
    }

    if (!tokenData.access_token) {
      throw new Error('No access token in response');
    }

    console.log('[FYERS] Authentication successful');
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
    };
  } catch (error: any) {
    console.error('[FYERS] Authentication error:', error.message);
    throw error;
  }
}

/**
 * Refresh Fyers access token using refresh token
 * Exchanges refresh token for new access token
 * Optionally requires PIN if available
 */
export async function refreshFyersToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  pin?: string
): Promise<FyersAuthResponse> {
  try {
    console.log('[FYERS-REFRESH] Refreshing access token...');
    console.log('[FYERS-REFRESH] Client ID:', clientId.substring(0, 5) + '...');
    console.log('[FYERS-REFRESH] PIN provided:', !!pin);

    // Generate appIdHash: sha256(clientId:clientSecret)
    const checksumInput = `${clientId}:${clientSecret}`;
    const appIdHash = crypto
      .createHash('sha256')
      .update(checksumInput)
      .digest('hex');

    console.log('[FYERS-REFRESH] Generated appIdHash from clientId:clientSecret');

    const payload: any = {
      grant_type: 'refresh_token',
      appIdHash: appIdHash,
      refresh_token: refreshToken,
    };

    // Add PIN if available
    if (pin) {
      payload.pin = pin;
    }

    console.log('[FYERS-REFRESH] Request payload:', {
      grant_type: payload.grant_type,
      appIdHash: payload.appIdHash.substring(0, 10) + '...',
      refresh_token: refreshToken ? refreshToken.substring(0, 20) + '...' : 'missing',
    });

    // Fyers APIv3 token refresh endpoint
    // Use same base URL pattern as validate-authcode
    const tokenResponse = await fetch(`${FYERS_API_URL}/validate-refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Get response text first to debug
    const responseText = await tokenResponse.text();
    console.log('[FYERS-REFRESH] Raw response:', {
      httpStatus: tokenResponse.status,
      responseLength: responseText.length,
      responseText: responseText.substring(0, 200),
    });

    // Parse JSON if we have a response
    let tokenData;
    try {
      tokenData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('[FYERS-REFRESH] Failed to parse JSON response:', parseError);
      throw new Error(`Invalid JSON response from Fyers: ${responseText.substring(0, 100)}`);
    }

    console.log('[FYERS-REFRESH] Token response:', {
      status: tokenData.s,
      httpStatus: tokenResponse.status,
      message: tokenData.message,
      code: tokenData.code,
    });

    // Check for success response
    if (tokenData.s !== 'ok') {
      const error = tokenData.message || 'Token refresh failed';
      console.error('[FYERS-REFRESH] Token refresh failed:', {
        error,
        status: tokenData.s,
        code: tokenData.code,
        httpStatus: tokenResponse.status,
      });
      throw new Error(`Failed to refresh access token: ${error}`);
    }

    if (!tokenData.access_token) {
      throw new Error('No access token in refresh response');
    }

    console.log('[FYERS-REFRESH] Token refresh successful');
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken, // Use new refresh token if provided, otherwise keep old one
    };
  } catch (error: any) {
    console.error('[FYERS-REFRESH] Token refresh error:', error.message);
    throw error;
  }
}

/**
 * Get user profile info (to verify authentication)
 */
export async function getFyersUserProfile(accessToken: string, appId?: string): Promise<any> {
  try {
    console.log('[FYERS-PROFILE] Getting user profile...');

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-PROFILE] Authorization header format: {appId}:{token}');

    const response = await fetch(`${FYERS_API_URL}/user/profile`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user profile: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[FYERS-PROFILE] Get profile error:', error.message);
    throw error;
  }
}

/**
 * Place an order on Fyers
 */
export async function placeFyersOrder(
  accessToken: string,
  orderData: {
    symbol: string;
    qty: number;
    type: 'MARKET' | 'LIMIT';
    side: 'BUY' | 'SELL';
    productType: 'INTRADAY' | 'CNC' | 'MARGIN';
    price?: number;
    stopPrice?: number;
  },
  appId?: string
): Promise<any> {
  try {
    console.log('[FYERS-PLACEORDER] Placing order:', orderData);
    console.log('[FYERS-PLACEORDER] Received appId:', appId);
    console.log('[FYERS-PLACEORDER] AccessToken preview:', accessToken.substring(0, 50) + '...');

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-PLACEORDER] Authorization header format: {appId}:{token}');
    console.log('[FYERS-PLACEORDER] Auth header preview:', authHeader.substring(0, 50) + '...');

    // Convert string order type to numeric value
    // MARKET=2, LIMIT=1, SL_MARKET=3, SL_LIMIT=4
    const typeMap: { [key: string]: number } = {
      'MARKET': 2,
      'LIMIT': 1,
      'SL_MARKET': 3,
      'SL_LIMIT': 4,
    };
    const numericType = typeMap[orderData.type] || 2;

    // Convert string side to numeric value
    // BUY=1, SELL=-1
    const sideMap: { [key: string]: number } = {
      'BUY': 1,
      'SELL': -1,
    };
    const numericSide = sideMap[orderData.side] || 1;

    // Build payload with all required fields per Fyers API v2 spec
    // Reference: https://github.com/nodef/extra-fyers
    const orderPayload: any = {
      symbol: orderData.symbol,
      qty: orderData.qty,
      type: numericType,  // Numeric: 1=LIMIT, 2=MARKET, 3=SL_MARKET, 4=SL_LIMIT
      side: numericSide,  // Numeric: 1=BUY, -1=SELL
      productType: orderData.productType,
      validity: 'DAY',  // Required: order validity (DAY, IOC, etc)
      disclosedQty: 0,  // Required: disclosed quantity
      offlineOrder: false,  // Required: offline order flag
      limitPrice: 0,  // REQUIRED: even for MARKET orders, set to 0
      stopPrice: 0,  // Required: stop price (0 if not applicable)
    };

    console.log('[FYERS-PLACEORDER] Type conversion: ' + orderData.type + ' -> ' + numericType);
    console.log('[FYERS-PLACEORDER] Side conversion: ' + orderData.side + ' -> ' + numericSide);

    // Override limitPrice if a specific price is provided (for LIMIT orders)
    if (orderData.price !== undefined && orderData.price > 0) {
      orderPayload.limitPrice = orderData.price;
    }

    // Override stopPrice if provided (for STOP orders)
    if (orderData.stopPrice !== undefined && orderData.stopPrice > 0) {
      orderPayload.stopPrice = orderData.stopPrice;
    }

    console.log('[FYERS-PLACEORDER] Request payload:', JSON.stringify(orderPayload));
    console.log('[FYERS-PLACEORDER] Auth header format: appId:token');

    // CRITICAL: Order placement uses a DIFFERENT host and v2 API!
    // Reference: https://github.com/nodef/extra-fyers/blob/main/src/http.ts
    const endpointTried = FYERS_ORDER_PLACEMENT_URL;
    console.log('[FYERS-PLACEORDER] Using correct endpoint: ' + endpointTried);

    const response = await fetch(endpointTried, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: authHeader,
      },
      body: JSON.stringify(orderPayload),
    });

    console.log('[FYERS-PLACEORDER] About to read response text...');
    const responseText = await response.text();
    console.log('[FYERS-PLACEORDER] Response status:', response.status, response.statusText);
    console.log('[FYERS-PLACEORDER] Response text length:', responseText.length);
    console.log('[FYERS-PLACEORDER] Response text (first 200 chars):', responseText.substring(0, 200));

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[FYERS-PLACEORDER] Failed to parse JSON response:', parseError);
      console.error('[FYERS-PLACEORDER] Raw response (full):', responseText);
      console.error('[FYERS-PLACEORDER] Raw response length:', responseText.length);

      // If it's 404, the endpoint doesn't exist
      if (response.status === 404) {
        throw new Error(`Fyers API endpoint not found (404). Tried: ${endpointTried}. Response: ${responseText.substring(0, 300)}`);
      }

      throw new Error(`Fyers API returned invalid JSON: ${responseText.substring(0, 200)}`);
    }

    console.log('[FYERS-PLACEORDER] Parsed response:', JSON.stringify(result));

    if (!response.ok) {
      throw new Error(`Failed to place order: ${result.message || result.error || response.statusText}`);
    }

    console.log('[FYERS-PLACEORDER] Order placed successfully:', result);
    return result;
  } catch (error: any) {
    console.error('[FYERS-PLACEORDER] Place order error:', error.message);
    throw error;
  }
}

/**
 * Cancel an order on Fyers
 */
export async function cancelFyersOrder(
  accessToken: string,
  orderId: string,
  appId?: string
): Promise<any> {
  try {
    console.log('[FYERS-CANCELORDER] Canceling order:', orderId);

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-CANCELORDER] Authorization header format: {appId}:{token}');

    const response = await fetch(`${FYERS_API_URL}/orders/sync`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        id: orderId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to cancel order: ${result.message || response.statusText}`);
    }

    console.log('[FYERS-CANCELORDER] Order canceled successfully:', result);
    return result;
  } catch (error: any) {
    console.error('[FYERS-CANCELORDER] Cancel order error:', error.message);
    throw error;
  }
}

/**
 * Get orderbook
 */
export async function getFyersOrderbook(accessToken: string, appId?: string): Promise<any> {
  try {
    console.log('[FYERS-ORDERBOOK] Getting orderbook...');
    console.log('[FYERS-ORDERBOOK] Input appId:', appId);
    console.log('[FYERS-ORDERBOOK] Input accessToken preview:', accessToken.substring(0, 30) + '...');

    const url = `${FYERS_API_URL}/orders`;
    console.log('[FYERS-ORDERBOOK] Full URL:', url);

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken (NOT Bearer token)
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-ORDERBOOK] Authorization header format: {appId}:{token}');
    console.log('[FYERS-ORDERBOOK] Authorization header preview:', authHeader.substring(0, 50) + '...');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    console.log('[FYERS-ORDERBOOK] Response status:', response.status);

    const responseData = await response.json();

    console.log('[FYERS-ORDERBOOK] Full response data:', JSON.stringify(responseData, null, 2).substring(0, 500) + '...');

    if (!response.ok) {
      console.error('[FYERS-ORDERBOOK] Error response (full):', responseData);
      throw new Error(`Failed to get orderbook: ${responseData.message || response.statusText}`);
    }

    console.log('[FYERS-ORDERBOOK] Orderbook retrieved successfully');
    return responseData;
  } catch (error: any) {
    console.error('[FYERS-ORDERBOOK] Get orderbook error:', error.message);
    throw error;
  }
}

/**
 * Get positions
 */
export async function getFyersPositions(accessToken: string, appId?: string): Promise<any> {
  try {
    console.log('[FYERS-POSITIONS] Getting positions...');

    const url = `${FYERS_API_URL}/positions`;
    console.log('[FYERS-POSITIONS] Full URL:', url);

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-POSITIONS] Authorization header format: {appId}:{token}');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    console.log('[FYERS-POSITIONS] Response status:', response.status);

    const responseData = await response.json();

    console.log('[FYERS-POSITIONS] Full response data:', JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      console.error('[FYERS-POSITIONS] Error response:', responseData);
      throw new Error(`Failed to get positions: ${responseData.message || response.statusText}`);
    }

    console.log('[FYERS-POSITIONS] Positions retrieved successfully');
    return responseData;
  } catch (error: any) {
    console.error('[FYERS-POSITIONS] Get positions error:', error.message);
    throw error;
  }
}

/**
 * Get holdings
 */
export async function getFyersHoldings(accessToken: string, appId?: string): Promise<any> {
  try {
    console.log('[FYERS-HOLDINGS] Getting holdings...');

    const url = `${FYERS_API_URL}/holdings`;
    console.log('[FYERS-HOLDINGS] Full URL:', url);

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-HOLDINGS] Authorization header format: {appId}:{token}');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    console.log('[FYERS-HOLDINGS] Response status:', response.status);

    const responseData = await response.json();

    console.log('[FYERS-HOLDINGS] Response data:', {
      s: responseData.s,
      message: responseData.message,
      code: responseData.code,
    });

    if (!response.ok) {
      console.error('[FYERS-HOLDINGS] Error response:', responseData);
      throw new Error(`Failed to get holdings: ${responseData.message || response.statusText}`);
    }

    console.log('[FYERS-HOLDINGS] Holdings retrieved successfully');
    return responseData;
  } catch (error: any) {
    console.error('[FYERS-HOLDINGS] Get holdings error:', error.message);
    throw error;
  }
}

/**
 * Get funds
 */
export async function getFyersFunds(accessToken: string, appId?: string): Promise<any> {
  try {
    console.log('[FYERS-FUNDS] Getting funds...');

    const url = `${FYERS_API_URL}/funds`;
    console.log('[FYERS-FUNDS] Full URL:', url);

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-FUNDS] Authorization header format: {appId}:{token}');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    console.log('[FYERS-FUNDS] Response status:', response.status);

    const responseData = await response.json();

    console.log('[FYERS-FUNDS] Response data:', {
      s: responseData.s,
      message: responseData.message,
      code: responseData.code,
    });

    if (!response.ok) {
      console.error('[FYERS-FUNDS] Error response:', responseData);
      throw new Error(`Failed to get funds: ${responseData.message || response.statusText}`);
    }

    console.log('[FYERS-FUNDS] Funds retrieved successfully');
    return responseData;
  } catch (error: any) {
    console.error('[FYERS-FUNDS] Get funds error:', error.message);
    throw error;
  }
}

/**
 * Get tradebook (executed trades)
 */
export async function getTradebook(accessToken: string, appId?: string): Promise<any> {
  try {
    console.log('[FYERS-TRADEBOOK] Getting tradebook...');

    const url = `${FYERS_API_URL}/tradebook`;
    console.log('[FYERS-TRADEBOOK] Full URL:', url);

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-TRADEBOOK] Authorization header format: {appId}:{token}');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    console.log('[FYERS-TRADEBOOK] Response status:', response.status);

    const responseData = await response.json();

    console.log('[FYERS-TRADEBOOK] Response data:', {
      s: responseData.s,
      message: responseData.message,
      code: responseData.code,
    });

    if (!response.ok) {
      console.error('[FYERS-TRADEBOOK] Error response:', responseData);
      throw new Error(`Failed to get tradebook: ${responseData.message || response.statusText}`);
    }

    console.log('[FYERS-TRADEBOOK] Tradebook retrieved successfully');
    return responseData;
  } catch (error: any) {
    console.error('[FYERS-TRADEBOOK] Get tradebook error:', error.message);
    throw error;
  }
}

/**
 * Modify an order on Fyers
 */
export async function modifyFyersOrder(
  accessToken: string,
  orderId: string,
  orderData: {
    symbol?: string;
    qty?: number;
    type?: 'MARKET' | 'LIMIT';
    side?: 'BUY' | 'SELL';
    productType?: 'INTRADAY' | 'CNC' | 'MARGIN';
    price?: number;
    stopPrice?: number;
  },
  appId?: string
): Promise<any> {
  try {
    console.log('[FYERS-MODIFYORDER] Modifying order:', orderId, orderData);

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-MODIFYORDER] Authorization header format: {appId}:{token}');

    const response = await fetch(`${FYERS_API_URL}/orders/sync`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        id: orderId,
        symbol: orderData.symbol,
        qty: orderData.qty,
        type: orderData.type,
        side: orderData.side,
        productType: orderData.productType,
        price: orderData.price || 0,
        stopPrice: orderData.stopPrice || 0,
      }),
    });

    const result = await response.json();

    console.log('[FYERS-MODIFYORDER] Response status:', response.status);
    console.log('[FYERS-MODIFYORDER] Response data:', {
      s: result.s,
      message: result.message,
      code: result.code,
    });

    if (!response.ok) {
      console.error('[FYERS-MODIFYORDER] Error response:', result);
      throw new Error(`Failed to modify order: ${result.message || response.statusText}`);
    }

    console.log('[FYERS-MODIFYORDER] Order modified successfully:', result);
    return result;
  } catch (error: any) {
    console.error('[FYERS-MODIFYORDER] Modify order error:', error.message);
    throw error;
  }
}

/**
 * Cancel all pending orders on Fyers
 */
export async function cancelAllFyersOrders(accessToken: string, appId?: string): Promise<any> {
  try {
    console.log('[FYERS-CANCELALLORDERS] Canceling all orders...');

    // First, get all orders
    const orderBook = await getFyersOrderbook(accessToken, appId);

    // Check if we got valid order data
    if (!orderBook.s || orderBook.s !== 'ok' || !orderBook.orderBook) {
      console.warn('[FYERS-CANCELALLORDERS] Could not retrieve orderbook:', orderBook.message);
      return {
        s: 'ok',
        cancelled: [],
        failed: [],
        message: 'No orders found or error retrieving orderbook',
      };
    }

    const allOrders = orderBook.orderBook || [];
    console.log('[FYERS-CANCELALLORDERS] Total orders found:', allOrders.length);

    // Filter for pending orders only
    const pendingOrders = allOrders.filter(
      (order: any) => order.orderStatus === 'PENDING' || order.status === 'PENDING'
    );
    console.log('[FYERS-CANCELALLORDERS] Pending orders to cancel:', pendingOrders.length);

    if (pendingOrders.length === 0) {
      console.log('[FYERS-CANCELALLORDERS] No pending orders to cancel');
      return {
        s: 'ok',
        cancelled: [],
        failed: [],
        message: 'No pending orders found',
      };
    }

    // Cancel all pending orders in parallel
    const cancellationPromises = pendingOrders.map((order: any) =>
      cancelFyersOrder(accessToken, order.id, appId)
        .then((result) => ({
          orderId: order.id,
          success: true,
          result,
        }))
        .catch((error) => ({
          orderId: order.id,
          success: false,
          error: error.message,
        }))
    );

    const results = await Promise.allSettled(cancellationPromises);

    // Process results
    const cancelled = results
      .filter((r) => r.status === 'fulfilled' && r.value.success)
      .map((r) => (r.status === 'fulfilled' ? r.value.orderId : null))
      .filter((id) => id !== null);

    const failed = results
      .filter((r) => r.status === 'fulfilled' && !r.value.success)
      .map((r) => (r.status === 'fulfilled' ? r.value.orderId : null))
      .filter((id) => id !== null);

    console.log('[FYERS-CANCELALLORDERS] Cancellation summary:', {
      total: pendingOrders.length,
      cancelled: cancelled.length,
      failed: failed.length,
    });

    return {
      s: 'ok',
      cancelled,
      failed,
      message: `Cancelled ${cancelled.length} orders, ${failed.length} failed`,
    };
  } catch (error: any) {
    console.error('[FYERS-CANCELALLORDERS] Cancel all orders error:', error.message);
    throw error;
  }
}

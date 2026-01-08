/**
 * Fyers APIv3 Client
 * Handles authentication and token generation for Fyers broker
 */

import crypto from 'crypto';

const FYERS_API_URL = 'https://api-t1.fyers.in/api/v3';

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

    // CRITICAL: Fyers API requires Authorization header in format: appId:accessToken
    const authHeader = appId ? `${appId}:${accessToken}` : accessToken;
    console.log('[FYERS-PLACEORDER] Authorization header format: {appId}:{token}');

    const response = await fetch(`${FYERS_API_URL}/orders/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        symbol: orderData.symbol,
        qty: orderData.qty,
        type: orderData.type,
        side: orderData.side,
        productType: orderData.productType,
        price: orderData.price || 0,
        stopPrice: orderData.stopPrice || 0,
        timeInForce: 'DAY',
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to place order: ${result.message || response.statusText}`);
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

    console.log('[FYERS-ORDERBOOK] Response data:', {
      s: responseData.s,
      message: responseData.message,
      code: responseData.code,
    });

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

    console.log('[FYERS-POSITIONS] Response data:', {
      s: responseData.s,
      message: responseData.message,
      code: responseData.code,
    });

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

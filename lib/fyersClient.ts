/**
 * Fyers APIv3 Client
 * Handles authentication and token generation for Fyers broker
 */

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
  clientSecret: string,
  redirectUri: string = 'https://algo.tradeidea.co.in/callback'
): Promise<FyersAuthResponse> {
  try {
    console.log('[FYERS] Authenticating with auth code...');
    console.log('[FYERS] Client ID:', clientId.substring(0, 5) + '...');
    console.log('[FYERS] Redirect URI:', redirectUri);

    // Step 1: Exchange auth code for access token
    // Fyers APIv3 token endpoint requires: grant_type, code, appIdHash, redirect_uri
    const tokenResponse = await fetch(`${FYERS_API_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash: clientSecret,
        code: authCode,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('[FYERS] Token response error:', tokenResponse.status, error);
      throw new Error(`Failed to get access token: ${error}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('[FYERS] Token response:', { accessToken: tokenData.access_token ? '***' : 'missing' });

    if (!tokenData.access_token) {
      throw new Error('No access token in response');
    }

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
export async function getFyersUserProfile(accessToken: string): Promise<any> {
  try {
    const response = await fetch(`${FYERS_API_URL}/user/profile`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user profile: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[FYERS] Get profile error:', error.message);
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
  }
): Promise<any> {
  try {
    console.log('[FYERS] Placing order:', orderData);

    const response = await fetch(`${FYERS_API_URL}/orders/place`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
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

    console.log('[FYERS] Order placed successfully:', result);
    return result;
  } catch (error: any) {
    console.error('[FYERS] Place order error:', error.message);
    throw error;
  }
}

/**
 * Cancel an order on Fyers
 */
export async function cancelFyersOrder(
  accessToken: string,
  orderId: string
): Promise<any> {
  try {
    console.log('[FYERS] Canceling order:', orderId);

    const response = await fetch(`${FYERS_API_URL}/orders/cancel`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        id: orderId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to cancel order: ${result.message || response.statusText}`);
    }

    console.log('[FYERS] Order canceled successfully:', result);
    return result;
  } catch (error: any) {
    console.error('[FYERS] Cancel order error:', error.message);
    throw error;
  }
}

/**
 * Get orderbook
 */
export async function getFyersOrderbook(accessToken: string): Promise<any> {
  try {
    const response = await fetch(`${FYERS_API_URL}/orders/list`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get orderbook: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[FYERS] Get orderbook error:', error.message);
    throw error;
  }
}

/**
 * Get positions
 */
export async function getFyersPositions(accessToken: string): Promise<any> {
  try {
    const response = await fetch(`${FYERS_API_URL}/positions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get positions: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[FYERS] Get positions error:', error.message);
    throw error;
  }
}

/**
 * Get holdings
 */
export async function getFyersHoldings(accessToken: string): Promise<any> {
  try {
    const response = await fetch(`${FYERS_API_URL}/holdings`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get holdings: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[FYERS] Get holdings error:', error.message);
    throw error;
  }
}

/**
 * Get funds
 */
export async function getFyersFunds(accessToken: string): Promise<any> {
  try {
    const response = await fetch(`${FYERS_API_URL}/funds`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get funds: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[FYERS] Get funds error:', error.message);
    throw error;
  }
}

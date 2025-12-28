/**
 * Internal Routing Helper
 * Used by external API (v1) routers to call internal broker-specific endpoints
 */

/**
 * Get the internal API base URL
 * Works in both dev and production environments
 */
export function getInternalApiUrl(): string {
  // Use empty string for relative URLs (works on both localhost and Vercel)
  // This allows same-origin requests to work correctly
  return '';
}

/**
 * Call broker-specific endpoint
 * @param broker - Broker name (e.g., 'zerodha', 'angel')
 * @param action - Action name (e.g., 'place-order', 'cancel-order')
 * @param body - Request body
 */
export async function callInternalBrokerEndpoint(
  broker: string,
  action: string,
  body: any
): Promise<any> {
  const baseUrl = getInternalApiUrl();
  const url = `${baseUrl}/api/broker/${broker}/${action}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { data, status: response.status };
}

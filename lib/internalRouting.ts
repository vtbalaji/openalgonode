/**
 * Internal Routing Helper
 * Used by external API (v1) routers to call internal broker-specific endpoints
 */

/**
 * Get the internal API base URL
 * Works in both dev and production environments
 */
export function getInternalApiUrl(): string {
  // In production, use environment variable or standard endpoint
  const baseUrl = process.env.INTERNAL_API_BASE_URL || 'http://localhost:3000';
  return baseUrl;
}

/**
 * Call internal broker endpoint
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
  const url = `${baseUrl}/api/internal/broker/${broker}/${action}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { data, status: response.status };
}

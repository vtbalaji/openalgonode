/**
 * Internal Routing Helper
 * Used by external API (v1) routers to call internal broker-specific endpoints
 */

/**
 * Get the internal API base URL
 * Works in both dev and production environments
 */
export function getInternalApiUrl(): string {
  // On Vercel: Use VERCEL_URL which contains the deployment domain
  // On localhost: Use http://localhost:3000
  // On other environments: Use NEXT_PUBLIC_API_URL if set, otherwise localhost

  if (process.env.VERCEL_URL) {
    // Vercel deployment - use HTTPS
    return `https://${process.env.VERCEL_URL}`;
  }

  // Fall back to environment variable or localhost
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
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

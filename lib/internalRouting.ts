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

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type');
    const text = await response.text();

    // Check if response looks like HTML (starts with < or <!doctype)
    if (text.trim().startsWith('<')) {
      console.error(`HTML response from ${url}:`, {
        status: response.status,
        contentType,
        text: text.substring(0, 500),
      });
      throw new Error(`HTML response from broker endpoint (status ${response.status}): ${text.substring(0, 100)}`);
    }

    // Try to parse as JSON
    try {
      const data = JSON.parse(text);
      return { data, status: response.status };
    } catch (parseError) {
      console.error(`Failed to parse JSON from ${url}:`, {
        status: response.status,
        contentType,
        text: text.substring(0, 500),
      });
      throw new Error(`Invalid JSON from broker endpoint: ${text.substring(0, 100)}`);
    }
  } catch (error: any) {
    console.error(`Error calling broker endpoint ${url}:`, error.message);
    throw error;
  }
}

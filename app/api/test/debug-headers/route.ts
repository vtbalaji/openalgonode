import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/test/debug-headers
 * Show all request headers to debug ngrok setup
 */
export async function GET(request: NextRequest) {
  const headers: Record<string, string | null> = {};

  // Get all important headers
  const importantHeaders = [
    'host',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-forwarded-for',
    'x-original-host',
    'x-original-proto',
    'origin',
    'referer',
    'user-agent',
  ];

  importantHeaders.forEach(header => {
    headers[header] = request.headers.get(header);
  });

  // Calculate what the redirect_uri would be
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost';
  const origin = `${proto}://${host}`;
  const redirectUri = `${origin}/callback`;

  console.log('[DEBUG-HEADERS]', {
    proto,
    host,
    origin,
    redirectUri,
    headers,
  });

  return NextResponse.json(
    {
      headers,
      calculatedRedirectUri: redirectUri,
      expectedForNgrok: 'https://7b46229097f9.ngrok-free.app/callback',
      matches: redirectUri === 'https://7b46229097f9.ngrok-free.app/callback',
    },
    { status: 200 }
  );
}

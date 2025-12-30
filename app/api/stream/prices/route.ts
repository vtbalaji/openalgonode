/**
 * Server-Sent Events (SSE) endpoint for real-time price streaming
 * GET /api/stream/prices?symbols=RELIANCE,TCS,INFY&userId=UID&broker=zerodha
 *
 * Streams real-time price updates from Zerodha WebSocket connection
 * via Server-Sent Events (EventSource on client side)
 */

import { NextRequest } from 'next/server';
import { getTickerService } from '@/lib/websocket/tickerService';
import { getInstrumentToken } from '@/lib/websocket/instrumentMapping';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { getBrokerConfigFromEnv } from '@/lib/brokerConfigEnv';
import { decryptData } from '@/lib/encryptionUtils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get('symbols');
  const userId = searchParams.get('userId');
  const broker = searchParams.get('broker') || 'zerodha';

  // Validate required parameters
  if (!symbolsParam || !userId) {
    return new Response('Missing required parameters: symbols, userId', { status: 400 });
  }

  if (broker !== 'zerodha') {
    return new Response(
      'Only Zerodha broker is currently supported for real-time prices',
      { status: 400 }
    );
  }

  // Parse and normalize symbols
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);

  if (symbols.length === 0) {
    return new Response('Invalid symbols parameter', { status: 400 });
  }

  // Get broker configuration (env credentials priority, Firebase for full config)
  let configData;
  let fromEnv = false;

  // Check if API credentials are in environment
  const envApiConfig = getBrokerConfigFromEnv('zerodha');

  if (envApiConfig) {
    console.log('[STREAM-PRICES] Zerodha API credentials found in ENV');
    // API key/secret from env, but need to get access token from Firebase
    try {
      const fbConfig = await getCachedBrokerConfig(userId, 'zerodha');
      if (fbConfig?.accessToken) {
        configData = {
          ...envApiConfig,
          accessToken: fbConfig.accessToken, // Get access token from Firebase
          status: 'active'
        };
        fromEnv = true;
        console.log('[STREAM-PRICES] Using ENV API credentials + Firebase access token');
      } else {
        console.warn('[STREAM-PRICES] ENV has API credentials but no Firebase access token. User needs to authenticate.');
        return new Response(
          JSON.stringify({
            error: 'Zerodha not authenticated',
            message: 'API credentials found in environment, but access token missing. Please authenticate Zerodha in settings first.'
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error: any) {
      console.error('[STREAM-PRICES] Error fetching access token from Firebase:', error?.code);
      return new Response(
        JSON.stringify({
          error: 'Authentication error',
          message: 'Could not retrieve access token. Please re-authenticate Zerodha.'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    // No env credentials, use full Firebase config
    console.log('[STREAM-PRICES] Using complete config from Firebase');
    try {
      configData = await getCachedBrokerConfig(userId, 'zerodha');
      if (!configData) {
        return new Response(
          JSON.stringify({
            error: 'Zerodha not configured',
            message: 'Set ZERODHA_API_KEY + ZERODHA_API_SECRET in environment variables, or configure Zerodha in settings.'
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error: any) {
      console.error('[STREAM-PRICES] Firebase error:', error?.code);
      return new Response(
        JSON.stringify({
          error: 'Configuration error',
          message: 'Could not retrieve broker configuration.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  if (!configData?.accessToken || configData.status !== 'active') {
    return new Response('Zerodha not authenticated', { status: 401 });
  }

  // Get access token (always encrypted from Firebase, decrypt it)
  let accessToken: string;
  try {
    // Access token always comes from Firebase (encrypted), decrypt it
    accessToken = decryptData(configData.accessToken);
    console.log('[STREAM-PRICES] Access token decrypted from Firebase');
  } catch (error) {
    console.error('[STREAM-PRICES] Failed to decrypt access token:', error);
    return new Response('Failed to process credentials', { status: 401 });
  }

  // Convert symbols to instrument tokens (from in-memory cache)
  const tokens: number[] = [];
  const symbolToToken: Record<string, number> = {};
  const tokenToSymbol: Record<number, string> = {};

  for (const symbol of symbols) {
    const token = getInstrumentToken(symbol);
    if (token) {
      tokens.push(token);
      symbolToToken[symbol] = token;
      tokenToSymbol[token] = symbol;
    } else {
      console.warn(`[STREAM-PRICES] Symbol not found in cache: ${symbol}`);
    }
  }

  if (tokens.length === 0) {
    return new Response(
      'No valid symbols found. Please ensure symbol cache is initialized.',
      { status: 400 }
    );
  }

  console.log(`[STREAM-PRICES] Starting stream for ${symbols.length} symbols (${tokens.length} tokens)`);
  console.log(`[STREAM-PRICES] Symbols: ${symbols.join(', ')}`);
  console.log(`[STREAM-PRICES] Tokens: ${tokens.join(', ')}`);

  // Setup Server-Sent Events
  const encoder = new TextEncoder();
  let isStreamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const tickerService = getTickerService();

        // Get API key - default to Zerodha standard key
        const apiKey = configData.apiKey || 'kite3';

        // Initialize ticker if not already initialized
        if (!tickerService.getConnectionStatus()) {
          console.log('[STREAM-PRICES] Initializing WebSocket connection to Zerodha');
          tickerService.initialize(apiKey, accessToken);
          tickerService.connect();
          // Give it a moment to connect
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          console.log('[STREAM-PRICES] WebSocket already connected, reusing');
        }

        // Subscribe to tokens
        console.log(`[STREAM-PRICES] Subscribing to ${tokens.length} tokens`);
        tickerService.subscribe(tokens);

        // Send initial connection message
        const connectMessage = {
          type: 'connected',
          symbols: symbols,
          tokens: tokens,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(connectMessage)}\n\n`));
        console.log('[STREAM-PRICES] Sent connection message');

        // Handle tick updates - convert to expected format
        const tickHandler = (ticks: any[]) => {
          if (isStreamClosed) return;

          ticks.forEach((tick) => {
            const symbol = tokenToSymbol[tick.instrument_token];

            if (symbol) {
              const priceData = {
                symbol: symbol,
                last_price: tick.last_price || 0,
                change: tick.change || 0,
                volume: tick.volume_traded || 0,
                ohlc: {
                  open: tick.ohlc?.open || 0,
                  high: tick.ohlc?.high || 0,
                  low: tick.ohlc?.low || 0,
                  close: tick.ohlc?.close || 0,
                },
                timestamp: new Date().toISOString(),
              };

              const message = {
                type: 'tick',
                symbol: symbol,
                data: priceData,
              };

              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
              } catch (error) {
                console.error('[STREAM-PRICES] Error sending tick:', error);
              }
            }
          });
        };

        tickerService.on('ticks', tickHandler);

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
          if (!isStreamClosed) {
            try {
              const heartbeat = {
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(heartbeat)}\n\n`));
            } catch (error) {
              console.error('[STREAM-PRICES] Error sending heartbeat:', error);
            }
          }
        }, 30000);

        // Cleanup on disconnect
        request.signal.addEventListener('abort', () => {
          console.log('[STREAM-PRICES] Client disconnected');
          isStreamClosed = true;
          clearInterval(heartbeatInterval);
          try {
            tickerService.removeListener('ticks', tickHandler);
          } catch (e) {
            // May already be removed
          }
          try {
            tickerService.unsubscribe(tokens);
          } catch (e) {
            // Connection may already be closed
          }
          controller.close();
        });
      } catch (error) {
        console.error('[STREAM-PRICES] Error in stream start:', error);
        isStreamClosed = true;
        const errorMessage = {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable proxy buffering for real-time updates
    },
  });
}

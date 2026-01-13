/**
 * Server-Sent Events (SSE) endpoint for real-time price streaming
 * GET /api/stream/prices?symbols=RELIANCE,TCS,INFY
 */

import { NextRequest } from 'next/server';
import { getTickerService } from '@/lib/websocket/tickerService';
import { getInstrumentToken } from '@/lib/websocket/instrumentMapping';
import { getAuth } from 'firebase/auth';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { detectUserBroker } from '@/lib/brokerDetection';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbols = searchParams.get('symbols')?.split(',') || [];
  const userId = searchParams.get('userId');

  if (!userId) {
    return new Response('Missing userId parameter', { status: 400 });
  }

  if (symbols.length === 0) {
    return new Response('Missing symbols parameter', { status: 400 });
  }

  // Auto-detect which broker the user has configured
  const brokerDetection = await detectUserBroker(userId);

  if (!brokerDetection.isConfigured) {
    return new Response(brokerDetection.error || 'No broker configured', { status: 401 });
  }

  const broker = brokerDetection.broker;
  console.log('[STREAM-PRICES] Detected broker for user:', broker);

  // Get broker configuration from cache
  const configData = await getCachedBrokerConfig(userId, broker);

  if (!configData) {
    return new Response('Broker not configured', { status: 404 });
  }

  if (!configData?.accessToken || configData.status !== 'active') {
    return new Response('Broker not authenticated', { status: 401 });
  }

  // ZERODHA: Uses WebSocket KiteTicker
  if (broker === 'zerodha') {
    const encryptedAccessToken = decryptData(configData.accessToken);
    const apiKey = decryptData(configData.apiKey);

    // Extract access token from combined format (apiKey:accessToken)
    const accessToken = encryptedAccessToken.includes(':')
      ? encryptedAccessToken.split(':')[1]
      : encryptedAccessToken;

    // Convert symbols to instrument tokens (from in-memory cache)
    const tokens: number[] = [];
    const symbolToToken: Record<string, number> = {};

    for (const symbol of symbols) {
      const token = getInstrumentToken(symbol);
      if (token) {
        tokens.push(token);
        symbolToToken[symbol] = token;
      }
    }

    if (tokens.length === 0) {
      return new Response(`No valid symbols found. Make sure symbol cache is initialized via /api/admin/init-symbol-cache.`, { status: 400 });
    }

    // Setup Server-Sent Events for Zerodha
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        console.log(`[STREAM-PRICES] Zerodha client connected for symbols: ${symbols.join(', ')}`);
        console.log(`[STREAM-PRICES] Instrument tokens: ${tokens.join(', ')}`);

        const tickerService = getTickerService();

        // Initialize ticker if not already initialized
        if (!tickerService.getConnectionStatus()) {
          console.log('[STREAM-PRICES] Initializing WebSocket connection to Zerodha...');
          console.log(`[STREAM-PRICES] API Key (first 10 chars): ${apiKey.substring(0, 10)}...`);
          console.log(`[STREAM-PRICES] Access Token (first 10 chars): ${accessToken.substring(0, 10)}...`);

          tickerService.initialize(apiKey, accessToken);
          tickerService.connect();
        } else {
          console.log('[STREAM-PRICES] WebSocket already connected, reusing connection');
        }

        // Subscribe to tokens
        console.log(`[STREAM-PRICES] Subscribing to tokens: ${tokens.join(', ')}`);
        tickerService.subscribe(tokens);

        // Send initial connection message
        const connectMessage = `data: ${JSON.stringify({ type: 'connected', symbols, tokens })}\n\n`;
        controller.enqueue(encoder.encode(connectMessage));

        // Handle tick updates
        const tickHandler = (ticks: any[]) => {
          ticks.forEach((tick) => {
            const symbol = Object.keys(symbolToToken).find(
              (s) => symbolToToken[s] === tick.instrument_token
            );

            if (symbol) {
              const message = `data: ${JSON.stringify({
                type: 'tick',
                symbol,
                data: {
                  instrument_token: tick.instrument_token,
                  last_price: tick.last_price,
                  change: tick.change,
                  volume: tick.volume_traded,
                  ohlc: tick.ohlc,
                  timestamp: new Date().toISOString(),
                },
              })}\n\n`;

              controller.enqueue(encoder.encode(message));
            }
          });
        };

        tickerService.on('ticks', tickHandler);

        // Send heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
          const heartbeat = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`;
          controller.enqueue(encoder.encode(heartbeat));
        }, 30000);

        // Cleanup on disconnect
        request.signal.addEventListener('abort', () => {
          console.log('[STREAM-PRICES] Client disconnected, cleaning up...');
          tickerService.off('ticks', tickHandler);
          tickerService.unsubscribe(tokens);
          clearInterval(heartbeatInterval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // FYERS: Poll latest data every 10 seconds
  // Fyers doesn't have a public WebSocket API, so we poll the chart data endpoint
  if (broker === 'fyers') {
    console.log('[STREAM-PRICES] Fyers user detected - using polling for live data updates');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        console.log(`[STREAM-PRICES] Fyers SSE client connected for symbols: ${symbols.join(', ')}`);

        // Send connection message indicating Fyers uses polling
        const connectMessage = `data: ${JSON.stringify({
          type: 'connected',
          symbols,
          broker: 'fyers',
          note: 'Fyers using polling (updates every 10 seconds)',
        })}\n\n`;
        controller.enqueue(encoder.encode(connectMessage));

        // Store last close price for each symbol to detect changes
        const lastPrices: Record<string, number> = {};

        // Poll Fyers chart data every 10 seconds for latest candle
        const pollInterval = setInterval(async () => {
          try {
            // For each symbol, fetch the latest data
            for (const symbol of symbols) {
              const today = new Date();
              const fromDate = new Date(today);
              fromDate.setDate(fromDate.getDate() - 2); // Go back 2 days to account for Fyers range adjustment

              const fromStr = fromDate.toISOString().split('T')[0];
              const toStr = today.toISOString().split('T')[0];

              // Check if this is an option symbol (contains CE or PE)
              const isOption = symbol.includes('CE') || symbol.includes('PE');

              let url: string;
              if (isOption) {
                // For options, we need to extract base symbol, expiry, and strike from the symbol
                // Symbol formats:
                // - Weekly: NSE:NIFTY26011325700CE (YYMMdd + strike + CE/PE)
                // - Monthly: NSE:NIFTY26JAN25700CE (YYMM[M] + strike + CE/PE)
                console.log(`[STREAM-PRICES] Detected option symbol: ${symbol}`);

                // Try parsing weekly format first: NSE:BASE(5digits)(5digits)CE/PE
                let match = symbol.match(/NSE:([A-Z]+)(\d{6})(\d{5})(CE|PE)/);
                let textExpiry: string = '';
                let baseSymbol: string = '';
                let strike: string = '';

                if (match) {
                  // Weekly format: 260113 → 13JAN
                  baseSymbol = match[1];
                  const numericExpiry = match[2]; // 260113
                  strike = match[3];
                  const optionType = match[4];

                  // Parse YYMMdd: 260113 → YY=26, MM=01, dd=13
                  const yearPart = numericExpiry.substring(0, 2); // 26
                  const monthPart = numericExpiry.substring(2, 4); // 01
                  const dayPart = numericExpiry.substring(4, 6); // 13

                  const monthMap: { [key: string]: string } = {
                    '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR',
                    '05': 'MAY', '06': 'JUN', '07': 'JUL', '08': 'AUG',
                    '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC'
                  };

                  const monthName = monthMap[monthPart] || 'JAN';
                  textExpiry = `${parseInt(dayPart)}${monthName}`; // 13JAN

                  console.log(`[STREAM-PRICES] Parsed weekly option: base=${baseSymbol}, expiry=${textExpiry}, strike=${strike}`);
                } else {
                  // Try monthly format: NSE:NIFTY26JAN25700CE
                  match = symbol.match(/NSE:([A-Z]+)(26[A-Z]{3})(\d{5})(CE|PE)/);
                  if (match) {
                    baseSymbol = match[1];
                    const textExpiryPart = match[2]; // 26JAN
                    strike = match[3];
                    const optionType = match[4];

                    // Extract just the month name: 26JAN → JAN
                    textExpiry = textExpiryPart.substring(2); // JAN

                    console.log(`[STREAM-PRICES] Parsed monthly option: base=${baseSymbol}, expiry=${textExpiry}, strike=${strike}`);
                  } else {
                    console.warn(`[STREAM-PRICES] Could not parse option symbol: ${symbol}`);
                    continue;
                  }
                }

                url = `/api/options/historical?symbol=${baseSymbol}&expiry=${textExpiry}&strike=${strike}&userId=${encodeURIComponent(userId)}&from=${fromStr}&to=${toStr}&interval=1`;
                console.log(`[STREAM-PRICES] Option URL: ${url}`);
              } else {
                // Regular equity/futures symbol
                url = `/api/chart/historical?symbol=${encodeURIComponent(symbol)}&interval=1minute&userId=${encodeURIComponent(userId)}&from=${fromStr}&to=${toStr}&includeToday=true`;
              }

              const response = await fetch(`${request.nextUrl.origin}${url}`, {
                method: 'GET',
                cache: 'no-store',
              });

              if (response.ok) {
                const chartData = await response.json();
                const data = chartData.data || [];

                if (data.length > 0) {
                  // Get the latest candle
                  const latestCandle = data[data.length - 1];
                  const close = latestCandle.close;

                  console.log(`[STREAM-PRICES] ${symbol}: Got price ${close}`);

                  // Only send tick if price changed
                  if (!lastPrices[symbol] || lastPrices[symbol] !== close) {
                    lastPrices[symbol] = close;

                    const tickMessage = `data: ${JSON.stringify({
                      type: 'tick',
                      symbol,
                      data: {
                        last_price: close,
                        change: 0, // Fyers data doesn't include change in this format
                        volume: latestCandle.volume || 0,
                        ohlc: {
                          open: latestCandle.open,
                          high: latestCandle.high,
                          low: latestCandle.low,
                          close: latestCandle.close,
                        },
                        timestamp: new Date(latestCandle.time).toISOString(),
                      },
                    })}\n\n`;
                    controller.enqueue(encoder.encode(tickMessage));
                  }
                } else {
                  console.warn(`[STREAM-PRICES] No data returned for ${symbol}`);
                }
              } else {
                const errorText = await response.text();
                console.error(`[STREAM-PRICES] Failed to fetch ${symbol}: ${response.status}`, errorText);
              }
            }
          } catch (err) {
            console.error('[STREAM-PRICES] Fyers polling error:', err);
          }
        }, 10000); // Poll every 10 seconds

        // Send heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
          const heartbeat = `data: ${JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
          })}\n\n`;
          controller.enqueue(encoder.encode(heartbeat));
        }, 30000);

        // Cleanup on disconnect
        request.signal.addEventListener('abort', () => {
          console.log('[STREAM-PRICES] Fyers client disconnected');
          clearInterval(pollInterval);
          clearInterval(heartbeatInterval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  return new Response('Unsupported broker', { status: 400 });
}

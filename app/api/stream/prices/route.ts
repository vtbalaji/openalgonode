/**
 * Server-Sent Events (SSE) endpoint for real-time price streaming
 * GET /api/stream/prices?symbols=RELIANCE,TCS,INFY
 */

import { NextRequest } from 'next/server';
import { getTickerService } from '@/lib/websocket/tickerService';
import { getInstrumentToken } from '@/lib/websocket/instrumentMapping';
import { getAuth } from 'firebase/auth';
import { adminDb } from '@/lib/firebaseAdmin';
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
  const broker = searchParams.get('broker') || 'zerodha';

  if (!userId) {
    return new Response('Missing userId parameter', { status: 400 });
  }

  if (symbols.length === 0) {
    return new Response('Missing symbols parameter', { status: 400 });
  }

  // Get broker configuration
  const brokerConfigRef = adminDb
    .collection('users')
    .doc(userId)
    .collection('brokerConfig')
    .doc(broker);

  const docSnap = await brokerConfigRef.get();

  if (!docSnap.exists) {
    return new Response('Broker not configured', { status: 404 });
  }

  const configData = docSnap.data();

  if (!configData?.accessToken || configData.status !== 'active') {
    return new Response('Broker not authenticated', { status: 401 });
  }

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

  // Setup Server-Sent Events
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      console.log(`Client connected for symbols: ${symbols.join(', ')}`);
      console.log(`Instrument tokens: ${tokens.join(', ')}`);

      const tickerService = getTickerService();

      // Initialize ticker if not already initialized
      if (!tickerService.getConnectionStatus()) {
        console.log('Initializing WebSocket connection to Zerodha...');
        console.log(`API Key (first 10 chars): ${apiKey.substring(0, 10)}...`);
        console.log(`Access Token (first 10 chars): ${accessToken.substring(0, 10)}...`);

        tickerService.initialize(apiKey, accessToken);
        tickerService.connect();
      } else {
        console.log('WebSocket already connected, reusing connection');
      }

      // Subscribe to tokens
      console.log(`Subscribing to tokens: ${tokens.join(', ')}`);
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
        console.log('Client disconnected, cleaning up...');
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

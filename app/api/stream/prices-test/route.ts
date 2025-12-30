/**
 * HARDCODED TEST SSE ENDPOINT
 * Returns mock NIFTY 50 prices for testing
 * GET /api/stream/prices-test?symbols=NIFTY50
 */

import { NextRequest } from 'next/server';

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get('symbols') || 'NIFTY 50';

  console.log(`[TEST-PRICES] Starting test stream for symbols: ${symbolsParam}`);

  // Mock data for NIFTY 50
  let niftyPrice = 24000; // Starting price
  let niftyChange = 0;
  const basePrice = niftyPrice;

  // Setup Server-Sent Events
  const encoder = new TextEncoder();
  let isStreamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial connection message
        const connectMessage = {
          type: 'connection',
          status: 'connected',
          symbol: 'NIFTY 50',
          message: 'Connected to test price stream (HARDCODED)'
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(connectMessage)}\n\n`));

        // Simulate price updates every 2 seconds
        let updateCount = 0;
        const interval = setInterval(() => {
          if (isStreamClosed) {
            clearInterval(interval);
            return;
          }

          updateCount++;

          // Simulate random price movement (±5 points per update)
          const randomChange = (Math.random() - 0.5) * 10; // ±5
          niftyPrice += randomChange;
          niftyChange = niftyPrice - basePrice;

          const priceUpdate: PriceUpdate = {
            symbol: 'NIFTY 50',
            price: parseFloat(niftyPrice.toFixed(2)),
            change: parseFloat(niftyChange.toFixed(2)),
            changePercent: parseFloat(((niftyChange / basePrice) * 100).toFixed(2)),
            volume: Math.floor(Math.random() * 100000),
            timestamp: new Date().toISOString()
          };

          // Send as Server-Sent Event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(priceUpdate)}\n\n`));

          console.log(`[TEST-PRICES] Update #${updateCount}: ${priceUpdate.symbol} = ${priceUpdate.price}`);

          // Keep connection alive for 5 minutes then close
          if (updateCount >= 150) { // 150 updates × 2 sec = 5 min
            controller.close();
            clearInterval(interval);
            isStreamClosed = true;
          }
        }, 2000); // Update every 2 seconds

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          isStreamClosed = true;
          clearInterval(interval);
          controller.close();
        });
      } catch (error) {
        console.error('[TEST-PRICES] Stream error:', error);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * React hook for consuming real-time option price tick updates via SSE
 * Streams CE and PE prices separately for strangle strategies
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';

export interface OptionTick {
  cePrice: number;
  pePrice: number;
  timestamp: string;
  time: number; // Unix timestamp in seconds
}

export interface UseOptionTickStreamOptions {
  symbol: string;
  expiry: string;
  ceStrike: number;
  peStrike: number;
  enabled?: boolean;
}

export function useOptionTickStream({
  symbol,
  expiry,
  ceStrike,
  peStrike,
  enabled = true,
}: UseOptionTickStreamOptions) {
  const { user } = useAuth();
  const [ticks, setTicks] = useState<OptionTick[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const tickBufferRef = useRef<OptionTick[]>([]);

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      return;
    }

    if (!user || !enabled || !symbol || !expiry) {
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Build CE and PE symbol names (e.g., "NIFTY25900CE", "NIFTY25800PE")
    const ceSymbol = `${symbol}${expiry}${ceStrike}CE`;
    const peSymbol = `${symbol}${expiry}${peStrike}PE`;
    const symbolsParam = [ceSymbol, peSymbol].join(',');

    const url = `/api/stream/prices?symbols=${encodeURIComponent(symbolsParam)}&userId=${encodeURIComponent(user.uid)}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Track latest prices for both legs
    const latestPrices: Record<string, number> = {};

    eventSource.onopen = () => {
      console.log('[OPTION-STREAM] Real-time connection established for options');
      setIsConnected(true);
      setError(null);
      tickBufferRef.current = [];
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'connected') {
          console.log('[OPTION-STREAM] Connected to option symbols:', message.symbols);
          if (message.broker === 'fyers') {
            console.log('[OPTION-STREAM] Fyers user: Chart updates via polling (10 sec interval)');
          }
        } else if (message.type === 'tick') {
          const { symbol: tickSymbol, data } = message;
          const lastPrice = data.last_price;

          // Store the price by symbol
          latestPrices[tickSymbol] = lastPrice;

          // Only create a new tick when we have prices for BOTH CE and PE
          if (latestPrices[ceSymbol] !== undefined && latestPrices[peSymbol] !== undefined) {
            const newTick: OptionTick = {
              cePrice: latestPrices[ceSymbol],
              pePrice: latestPrices[peSymbol],
              timestamp: data.timestamp,
              time: Math.floor(new Date(data.timestamp).getTime() / 1000),
            };

            // Add to buffer
            tickBufferRef.current.push(newTick);

            // Update state with all ticks (last 1000 ticks max)
            setTicks((prev) => {
              const updated = [...prev, newTick];
              return updated.slice(-1000); // Keep only last 1000 ticks for memory
            });
          }
        } else if (message.type === 'heartbeat') {
          // Keep-alive heartbeat - no action needed
        }
      } catch (err) {
        console.error('[OPTION-STREAM] Error parsing message:', err);
      }
    };

    eventSource.onerror = (err) => {
      // Only log detailed error if not just a normal connection state change
      if (eventSource.readyState !== EventSource.OPEN) {
        console.warn('[OPTION-STREAM] EventSource error - attempting reconnect');
      }
      setIsConnected(false);

      // Try to get more detailed error info
      let errorMsg = 'Connection error. Retrying...';
      if (eventSource.readyState === EventSource.CLOSED) {
        errorMsg = 'Server unavailable. Please check your internet connection.';
      }

      setError(errorMsg);

      // Auto-reconnect after 5 seconds (only in browser)
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
            console.log('[OPTION-STREAM] Reconnecting to option price stream...');
            eventSourceRef.current = new EventSource(url);
          }
        }, 5000);
      }
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [user, symbol, expiry, ceStrike, peStrike, enabled]);

  return {
    ticks,
    isConnected,
    error,
  };
}

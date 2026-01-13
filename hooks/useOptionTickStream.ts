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

    // Convert expiry format: "JAN" -> "26113", "13JAN" -> "26113"
    const convertExpiryToNumeric = (exp: string): string => {
      const monthMap: Record<string, string> = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
      };

      // Try weekly format: "13JAN" (day + month)
      const weeklyMatch = exp.match(/^(\d{1,2})([A-Z]{3})$/);
      if (weeklyMatch) {
        const day = weeklyMatch[1].padStart(2, '0');
        const month = monthMap[weeklyMatch[2]] || '01';
        return `26${month}${day}`; // e.g., "26113" for 13 JAN 2026
      }

      // Try monthly format: "JAN" (month only) - use last day of month
      const monthlyMatch = exp.match(/^([A-Z]{3})$/);
      if (monthlyMatch) {
        const month = monthMap[monthlyMatch[1]] || '01';
        const year = 2026;
        const lastDay = new Date(year, parseInt(month), 0).getDate();
        const dayStr = lastDay.toString().padStart(2, '0');
        return `26${month}${dayStr}`; // e.g., "26131" for last day of JAN
      }

      return exp; // Fallback to original if not recognized
    };

    // Build CE and PE symbol names with Fyers-compatible format
    const numericExpiry = convertExpiryToNumeric(expiry);
    const ceSymbol = `${symbol}${numericExpiry}${ceStrike}CE`;
    const peSymbol = `${symbol}${numericExpiry}${peStrike}PE`;
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

/**
 * React hook for consuming real-time price updates via SSE
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';

export interface PriceData {
  symbol: string;
  last_price: number;
  change: number;
  volume: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  timestamp: string;
}

export interface UseRealtimePriceOptions {
  symbols: string[];
}

export function useRealtimePrice({ symbols }: UseRealtimePriceOptions) {
  const { user } = useAuth();
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      return;
    }

    if (!user || symbols.length === 0) {
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const symbolsParam = symbols.join(',');
    const url = `/api/stream/prices?symbols=${encodeURIComponent(symbolsParam)}&userId=${encodeURIComponent(user.uid)}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('Real-time connection established');
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'connected') {
          console.log('Connected to symbols:', message.symbols);
          if (message.broker === 'fyers') {
            console.log('[VIDYA] Fyers user: Real-time streaming not available. Chart updates via polling.');
          }
        } else if (message.type === 'tick') {
          // Only Zerodha sends tick data
          setPrices((prev) => ({
            ...prev,
            [message.symbol]: message.data,
          }));
        } else if (message.type === 'heartbeat') {
          // Keep-alive heartbeat - no action needed
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    eventSource.onerror = (err) => {
      // Only log detailed error if not just a normal connection state change
      if (eventSource.readyState !== EventSource.OPEN) {
        console.warn('EventSource error - attempting reconnect');
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
            console.log('Reconnecting to real-time prices...');
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
  }, [user, symbols.join(',')]);

  return {
    prices,
    isConnected,
    error,
  };
}

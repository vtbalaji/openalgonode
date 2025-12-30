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
  broker?: string;
}

export function useRealtimePrice({ symbols, broker = 'zerodha' }: UseRealtimePriceOptions) {
  const { user } = useAuth();
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!user || symbols.length === 0) {
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const symbolsParam = symbols.join(',');
    const url = `/api/stream/prices?symbols=${symbolsParam}&userId=${user.uid}&broker=${broker}`;

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
        } else if (message.type === 'tick') {
          setPrices((prev) => ({
            ...prev,
            [message.symbol]: message.data,
          }));
        } else if (message.type === 'heartbeat') {
          // Keep-alive heartbeat
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      setIsConnected(false);

      // Try to get more detailed error info
      let errorMsg = 'Connection error. Retrying...';
      if (eventSource.readyState === EventSource.CLOSED) {
        errorMsg = 'Server unavailable. Please check your internet connection.';
      }

      setError(errorMsg);

      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          console.log('Reconnecting...');
          eventSourceRef.current = new EventSource(url);
        }
      }, 5000);
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [user, symbols.join(','), broker]);

  return {
    prices,
    isConnected,
    error,
  };
}

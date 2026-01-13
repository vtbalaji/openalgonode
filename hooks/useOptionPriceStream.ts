/**
 * React hook for consuming real-time option (CE/PE) price updates via SSE
 * Streams individual CE and PE prices separately for straddle premium calculation
 *
 * Usage:
 * const { cePrice, pePrice, premium, isConnected, error } = useOptionPriceStream({
 *   symbol: 'NIFTY',
 *   expiry: 'JAN',
 *   ceStrike: 25700,
 *   peStrike: 25700,
 *   enabled: true
 * });
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';

export interface OptionPriceUpdate {
  cePrice: number;
  pePrice: number;
  premium: number; // cePrice + pePrice
  timestamp: string;
  isConnected: boolean;
}

export interface UseOptionPriceStreamOptions {
  symbol: string;
  expiry: string;
  ceStrike: number;
  peStrike: number;
  enabled?: boolean;
}

export function useOptionPriceStream({
  symbol,
  expiry,
  ceStrike,
  peStrike,
  enabled = true,
}: UseOptionPriceStreamOptions) {
  const { user } = useAuth();
  const [cePrice, setCePrice] = useState(0);
  const [pePrice, setPePrice] = useState(0);
  const [premium, setPremium] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastPricesRef = useRef<{ ce: number; pe: number }>({ ce: 0, pe: 0 });

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

    // Convert expiry format: "JAN" -> "26JAN", "13JAN" -> "26113"
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
        return `26${month}${day}`; // e.g., "260113" for 13 JAN 2026
      }

      // Try monthly format: "JAN" (month only)
      const monthlyMatch = exp.match(/^([A-Z]{3})$/);
      if (monthlyMatch) {
        const month = monthMap[monthlyMatch[1]] || '01';
        return `26${month}`; // e.g., "26JAN" for January 2026
      }

      return exp; // Fallback to original if not recognized
    };

    // Build CE and PE symbols with Fyers-compatible format
    const numericExpiry = convertExpiryToNumeric(expiry);
    const ceSymbol = `NSE:${symbol}${numericExpiry}${ceStrike}CE`;
    const peSymbol = `NSE:${symbol}${numericExpiry}${peStrike}PE`;
    const symbolsParam = [ceSymbol, peSymbol].join(',');

    console.log('[OPTION-PRICE-STREAM] Connecting to CE/PE prices:', { ceSymbol, peSymbol });

    const url = `/api/stream/prices?symbols=${encodeURIComponent(symbolsParam)}&userId=${encodeURIComponent(user.uid)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[OPTION-PRICE-STREAM] Connected to option price stream');
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'connected') {
          console.log('[OPTION-PRICE-STREAM] Connected to symbols:', message.symbols);
        } else if (message.type === 'tick') {
          const { symbol: tickSymbol, data } = message;
          const lastPrice = data.last_price;

          console.log(`[OPTION-PRICE-STREAM] Tick received for ${tickSymbol}: ${lastPrice}`);

          // Update CE or PE price based on symbol
          if (tickSymbol === ceSymbol) {
            lastPricesRef.current.ce = lastPrice;
            setCePrice(lastPrice);
          } else if (tickSymbol === peSymbol) {
            lastPricesRef.current.pe = lastPrice;
            setPePrice(lastPrice);
          }

          // Update premium whenever either price changes
          const newPremium = lastPricesRef.current.ce + lastPricesRef.current.pe;
          setPremium(newPremium);

          console.log(`[OPTION-PRICE-STREAM] Updated - CE: ${lastPricesRef.current.ce}, PE: ${lastPricesRef.current.pe}, Premium: ${newPremium}`);
        } else if (message.type === 'heartbeat') {
          // Keep-alive heartbeat - no action needed
        }
      } catch (err) {
        console.error('[OPTION-PRICE-STREAM] Error parsing message:', err);
      }
    };

    eventSource.onerror = (err) => {
      if (eventSource.readyState !== EventSource.OPEN) {
        console.warn('[OPTION-PRICE-STREAM] Connection error - attempting reconnect');
      }
      setIsConnected(false);

      let errorMsg = 'Connection error. Retrying...';
      if (eventSource.readyState === EventSource.CLOSED) {
        errorMsg = 'Server unavailable. Please check your internet connection.';
      }

      setError(errorMsg);

      // Auto-reconnect after 5 seconds
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
            console.log('[OPTION-PRICE-STREAM] Reconnecting to option price stream...');
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
    cePrice,
    pePrice,
    premium,
    isConnected,
    error,
  };
}

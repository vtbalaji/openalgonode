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

    // Convert expiry format for symbol building
    // "13JAN" -> numeric "260113" (YYMMdd), symbol: NSE:NIFTY260113...
    // "JAN" -> text "26JAN", symbol: NSE:NIFTY26JAN...
    const convertExpiryFormat = (exp: string): { numeric: string; text: string } => {
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
        return {
          numeric: `26${month}${day}`, // e.g., "260113" for 13 JAN 2026
          text: exp, // e.g., "13JAN"
        };
      }

      // Try monthly format: "JAN" (month only)
      const monthlyMatch = exp.match(/^([A-Z]{3})$/);
      if (monthlyMatch) {
        const monthName = monthlyMatch[1];
        return {
          numeric: `26${monthName}`, // e.g., "26JAN" for symbol building
          text: monthName, // e.g., "JAN" for API call
        };
      }

      return { numeric: exp, text: exp }; // Fallback
    };

    // Build CE and PE symbols with Fyers-compatible format
    const expiryFormats = convertExpiryFormat(expiry);
    const ceSymbol = `NSE:${symbol}${expiryFormats.numeric}${ceStrike}CE`;
    const peSymbol = `NSE:${symbol}${expiryFormats.numeric}${peStrike}PE`;
    const symbolsParam = [ceSymbol, peSymbol].join(',');

    console.log('[OPTION-PRICE-STREAM] Connecting to CE/PE prices:', { ceSymbol, peSymbol });

    // Use direct polling instead of streaming for more reliability
    // Poll /api/options/historical directly every 10 seconds for both CE and PE prices
    const pollInterval = setInterval(async () => {
      try {
        const today = new Date();
        const fromDate = new Date(today);
        fromDate.setDate(fromDate.getDate() - 2);

        const fromStr = fromDate.toISOString().split('T')[0];
        const toStr = today.toISOString().split('T')[0];

        console.log(`[OPTION-PRICE-STREAM] Polling for ${ceSymbol} and ${peSymbol}`);

        const url = `/api/options/historical?symbol=${symbol}&expiry=${expiryFormats.text}&strike=${ceStrike || 25700}&spotPrice=25700&userId=${encodeURIComponent(user.uid)}&from=${fromStr}&to=${toStr}&interval=1`;

        const response = await fetch(url);
        if (response.ok) {
          const result = await response.json();
          const data = result.data || [];

          if (data.length > 0) {
            const latestCandle = data[data.length - 1];
            const newCePrice = latestCandle.cePrice || 0;
            const newPePrice = latestCandle.pePrice || 0;

            if (lastPricesRef.current.ce !== newCePrice || lastPricesRef.current.pe !== newPePrice) {
              lastPricesRef.current.ce = newCePrice;
              lastPricesRef.current.pe = newPePrice;
              setCePrice(newCePrice);
              setPePrice(newPePrice);

              const newPremium = newCePrice + newPePrice;
              setPremium(newPremium);

              console.log(`[OPTION-PRICE-STREAM] Updated - CE: ${newCePrice}, PE: ${newPePrice}, Premium: ${newPremium}`);
            }
          }
          setIsConnected(true);
          setError(null);
        } else {
          console.warn('[OPTION-PRICE-STREAM] Failed to fetch option prices:', response.status);
          setIsConnected(false);
        }
      } catch (err: any) {
        console.error('[OPTION-PRICE-STREAM] Polling error:', err);
        setError(err.message);
      }
    }, 10000); // Poll every 10 seconds

    // Cleanup on unmount
    return () => {
      clearInterval(pollInterval);
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

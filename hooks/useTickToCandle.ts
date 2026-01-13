/**
 * React hook for aggregating real-time tick data into OHLC candles
 * Converts tick stream into time-based candles (1m, 5m, 15m, etc.)
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface UseTickToCandleOptions {
  intervalMinutes: number; // 1, 5, 15, 30, 60, etc.
  onCandleUpdate?: (candle: Candle) => void;
  onCandleComplete?: (candle: Candle) => void;
}

interface CurrentCandle {
  time: number; // Candle start time (rounded down to interval)
  open: number | null;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function useTickToCandle(
  ticks: Array<{ price: number; time?: number }>,
  options: UseTickToCandleOptions
) {
  const { intervalMinutes, onCandleUpdate, onCandleComplete } = options;
  const currentCandleRef = useRef<CurrentCandle | null>(null);
  const lastCompletedTimeRef = useRef<number | null>(null);

  const getCanbleStartTime = useCallback((time: number, minutes: number): number => {
    // Round down to the nearest interval boundary
    const secondsPerCandle = minutes * 60;
    return Math.floor(time / secondsPerCandle) * secondsPerCandle;
  }, []);

  // Process new tick
  useEffect(() => {
    if (!ticks || ticks.length === 0) return;

    const latestTick = ticks[ticks.length - 1];
    const tickPrice = latestTick.price;
    const tickTime = latestTick.time ? Math.floor(latestTick.time / 1000) : Math.floor(Date.now() / 1000);

    const candleStartTime = getCanbleStartTime(tickTime, intervalMinutes);

    // Initialize or update current candle
    if (!currentCandleRef.current || currentCandleRef.current.time !== candleStartTime) {
      // New candle started - save the previous one if it exists
      if (currentCandleRef.current && onCandleComplete) {
        const completedCandle: Candle = {
          time: currentCandleRef.current.time,
          open: currentCandleRef.current.open ?? tickPrice,
          high: currentCandleRef.current.high,
          low: currentCandleRef.current.low,
          close: currentCandleRef.current.close,
          volume: currentCandleRef.current.volume,
        };
        onCandleComplete(completedCandle);
        lastCompletedTimeRef.current = currentCandleRef.current.time;
      }

      // Start new candle
      currentCandleRef.current = {
        time: candleStartTime,
        open: tickPrice,
        high: tickPrice,
        low: tickPrice,
        close: tickPrice,
        volume: 1,
      };
    } else {
      // Update current candle
      currentCandleRef.current.close = tickPrice;
      currentCandleRef.current.high = Math.max(currentCandleRef.current.high, tickPrice);
      currentCandleRef.current.low = Math.min(currentCandleRef.current.low, tickPrice);
      currentCandleRef.current.volume += 1;
    }

    // Notify about current candle update (for real-time display)
    if (onCandleUpdate && currentCandleRef.current) {
      onCandleUpdate({
        time: currentCandleRef.current.time,
        open: currentCandleRef.current.open ?? tickPrice,
        high: currentCandleRef.current.high,
        low: currentCandleRef.current.low,
        close: currentCandleRef.current.close,
        volume: currentCandleRef.current.volume,
      });
    }
  }, [ticks, intervalMinutes, onCandleUpdate, onCandleComplete, getCanbleStartTime]);

  return {
    currentCandle: currentCandleRef.current,
    lastCompletedTime: lastCompletedTimeRef.current,
  };
}

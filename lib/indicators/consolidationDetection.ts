/**
 * Consolidation Box Detection & Breakout Signals
 * For range-bound trading strategies
 */

import { ChartData } from '@/components/AdvancedTradingChart';

export interface ConsolidationBox {
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  support: number;
  resistance: number;
  height: number;
  touchCount: number;
  isActive: boolean;
}

export interface BreakoutSignal {
  time: number;
  type: 'bullish' | 'bearish';
  breakoutPrice: number;
  boxHeight: number;
  targetPrice: number;
  volumeConfirmed: boolean;
  strength: number; // 1-10 rating
}

/**
 * Detect consolidation boxes in price data
 * PRIORITY: Most recent boxes first (right side of chart)
 * A box requires:
 * - At least 10 candles duration
 * - At least 2 touches on support and resistance
 * - Price range within tolerance (not trending strongly)
 */
export function detectConsolidationBoxes(
  data: ChartData[],
  minDuration: number = 10,
  maxDuration: number = 50,
  tolerancePercent: number = 0.5
): ConsolidationBox[] {
  const boxes: ConsolidationBox[] = [];

  if (data.length < minDuration) return boxes;

  // CHANGED: Search backwards from most recent data to prioritize current boxes
  // Start from the end of the data array
  for (let endIdx = data.length; endIdx >= minDuration; endIdx--) {
    for (let duration = minDuration; duration <= maxDuration && endIdx - duration >= 0; duration++) {
      const startIdx = endIdx - duration;
      const window = data.slice(startIdx, endIdx);

      // Find potential support and resistance
      const high = Math.max(...window.map(d => d.high));
      const low = Math.min(...window.map(d => d.low));
      const range = high - low;
      const midPrice = (high + low) / 2;
      const tolerance = midPrice * (tolerancePercent / 100);

      // Count touches on support and resistance
      let supportTouches = 0;
      let resistanceTouches = 0;

      for (const candle of window) {
        // Support touch: low within tolerance of box bottom
        if (Math.abs(candle.low - low) <= tolerance) {
          supportTouches++;
        }
        // Resistance touch: high within tolerance of box top
        if (Math.abs(candle.high - high) <= tolerance) {
          resistanceTouches++;
        }
      }

      // Valid box: at least 2 touches on each level (relaxed for recent boxes)
      const totalTouches = supportTouches + resistanceTouches;
      const isRecent = endIdx >= data.length - 10; // Last 10 candles

      // Relaxed criteria for recent boxes to catch forming consolidations
      const meetsMinTouches = isRecent
        ? (supportTouches >= 1 && resistanceTouches >= 1 && totalTouches >= 3)
        : (supportTouches >= 2 && resistanceTouches >= 2);

      if (meetsMinTouches) {
        // Check if this box overlaps with existing boxes
        const overlaps = boxes.some(box => {
          // Allow overlaps if this box is more recent
          if (endIdx > box.endIndex) return false;

          return (
            (startIdx >= box.startIndex && startIdx <= box.endIndex) ||
            (endIdx >= box.startIndex && endIdx <= box.endIndex)
          );
        });

        if (!overlaps) {
          boxes.push({
            startIndex: startIdx,
            endIndex: endIdx,
            startTime: window[0].time,
            endTime: window[window.length - 1].time,
            support: low,
            resistance: high,
            height: range,
            touchCount: totalTouches,
            isActive: endIdx >= data.length - 3, // Active if within last 3 candles
          });

          // Stop searching this endIdx once we found a valid box
          break;
        }
      }
    }

    // Stop after finding 5 boxes to avoid processing too much data
    if (boxes.length >= 5) break;
  }

  // Return boxes sorted by recency (most recent first)
  return boxes.sort((a, b) => b.endIndex - a.endIndex).slice(0, 3);
}

/**
 * Detect breakouts from consolidation boxes
 * Requires:
 * - Price closes above resistance (bullish) or below support (bearish)
 * - Volume confirmation (1.5x average)
 * - Strong candle (close near high for bullish, near low for bearish)
 */
export function detectBreakouts(
  data: ChartData[],
  boxes: ConsolidationBox[],
  volumeMultiplier: number = 1.5
): BreakoutSignal[] {
  const signals: BreakoutSignal[] = [];

  if (data.length < 20) return signals;

  // Calculate average volume (last 20 candles)
  const recentData = data.slice(-20);
  const avgVolume = recentData.reduce((sum, d) => sum + d.volume, 0) / recentData.length;

  // Check each box for breakouts
  for (const box of boxes) {
    // Look for breakout after box ends
    const breakoutStartIndex = Math.max(box.endIndex, data.length - 10);

    for (let i = breakoutStartIndex; i < data.length; i++) {
      const candle = data[i];
      const prevCandle = i > 0 ? data[i - 1] : candle;

      // Skip if already has a signal at this time
      if (signals.some(s => s.time === candle.time)) continue;

      // Check for bullish breakout (close above resistance)
      if (prevCandle.close <= box.resistance && candle.close > box.resistance) {
        const volumeConfirmed = candle.volume >= avgVolume * volumeMultiplier;
        const candleBody = Math.abs(candle.close - candle.open);
        const candleRange = candle.high - candle.low;
        const isStrongCandle = candleRange > 0 && candleBody / candleRange > 0.6;
        const closeNearHigh = candleRange > 0 && (candle.high - candle.close) / candleRange < 0.3;

        // Calculate strength (1-10)
        let strength = 5;
        if (volumeConfirmed) strength += 2;
        if (isStrongCandle) strength += 2;
        if (closeNearHigh) strength += 1;

        const targetPrice = candle.close + box.height;

        signals.push({
          time: candle.time,
          type: 'bullish',
          breakoutPrice: candle.close,
          boxHeight: box.height,
          targetPrice,
          volumeConfirmed,
          strength,
        });
      }

      // Check for bearish breakdown (close below support)
      if (prevCandle.close >= box.support && candle.close < box.support) {
        const volumeConfirmed = candle.volume >= avgVolume * volumeMultiplier;
        const candleBody = Math.abs(candle.close - candle.open);
        const candleRange = candle.high - candle.low;
        const isStrongCandle = candleRange > 0 && candleBody / candleRange > 0.6;
        const closeNearLow = candleRange > 0 && (candle.close - candle.low) / candleRange < 0.3;

        // Calculate strength (1-10)
        let strength = 5;
        if (volumeConfirmed) strength += 2;
        if (isStrongCandle) strength += 2;
        if (closeNearLow) strength += 1;

        const targetPrice = candle.close - box.height;

        signals.push({
          time: candle.time,
          type: 'bearish',
          breakoutPrice: candle.close,
          boxHeight: box.height,
          targetPrice,
          volumeConfirmed,
          strength,
        });
      }
    }
  }

  return signals;
}

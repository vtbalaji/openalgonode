/**
 * Smart Money Concepts (SMC) Indicator Calculations
 * For educational/manual trading analysis only
 */

import { ChartData } from '@/components/AdvancedTradingChart';

export interface FairValueGap {
  time: number;
  top: number;
  bottom: number;
  type: 'bullish' | 'bearish';
  filled: boolean;
}

export interface OrderBlock {
  time: number;
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
}

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number; // Number of times tested
}

export interface PremiumDiscountZone {
  high: number;
  low: number;
  equilibrium: number; // 50% level
  premiumStart: number; // 50-100%
  discountEnd: number; // 0-50%
}

/**
 * Detect Fair Value Gaps (FVG)
 * A gap where price moves so fast that there's inefficiency
 * 3-candle pattern: candle1.high < candle3.low (bullish) or candle1.low > candle3.high (bearish)
 */
export function calculateFairValueGaps(data: ChartData[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];

  for (let i = 0; i < data.length - 2; i++) {
    const candle1 = data[i];
    const candle2 = data[i + 1];
    const candle3 = data[i + 2];

    // Bullish FVG: Gap up - candle1 high < candle3 low
    if (candle1.high < candle3.low) {
      gaps.push({
        time: candle2.time,
        top: candle3.low,
        bottom: candle1.high,
        type: 'bullish',
        filled: false, // Check later if price came back
      });
    }

    // Bearish FVG: Gap down - candle1 low > candle3 high
    if (candle1.low > candle3.high) {
      gaps.push({
        time: candle2.time,
        top: candle1.low,
        bottom: candle3.high,
        type: 'bearish',
        filled: false,
      });
    }
  }

  // Mark gaps as filled if price returned to them
  for (const gap of gaps) {
    const gapIndex = data.findIndex(d => d.time === gap.time);
    for (let i = gapIndex + 3; i < data.length; i++) {
      const candle = data[i];
      // If price wicked into the gap, it's filled
      if (candle.low <= gap.top && candle.high >= gap.bottom) {
        gap.filled = true;
        break;
      }
    }
  }

  return gaps.filter(g => !g.filled); // Only show unfilled gaps
}

/**
 * Detect Order Blocks
 * Last opposing candle before a strong move
 * Bullish OB: Last red candle before green surge
 * Bearish OB: Last green candle before red dump
 */
export function calculateOrderBlocks(data: ChartData[], minMovePercent = 2): OrderBlock[] {
  const orderBlocks: OrderBlock[] = [];

  for (let i = 1; i < data.length - 5; i++) {
    const candle = data[i];
    const prevCandle = data[i - 1];

    // Look ahead to see if there's a strong move
    let strongMoveUp = false;
    let strongMoveDown = false;

    for (let j = i + 1; j < Math.min(i + 6, data.length); j++) {
      const futureCandle = data[j];
      const priceChange = ((futureCandle.close - candle.close) / candle.close) * 100;

      if (priceChange > minMovePercent) strongMoveUp = true;
      if (priceChange < -minMovePercent) strongMoveDown = true;
    }

    // Bullish Order Block: Red candle before strong up move
    if (candle.close < candle.open && strongMoveUp) {
      orderBlocks.push({
        time: candle.time,
        high: candle.high,
        low: candle.low,
        type: 'bullish',
      });
    }

    // Bearish Order Block: Green candle before strong down move
    if (candle.close > candle.open && strongMoveDown) {
      orderBlocks.push({
        time: candle.time,
        high: candle.high,
        low: candle.low,
        type: 'bearish',
      });
    }
  }

  // Remove duplicates and keep only the most recent ones
  return orderBlocks.slice(-10); // Last 10 order blocks
}

/**
 * Calculate Support and Resistance Levels
 * Based on swing highs and swing lows
 */
export function calculateSupportResistance(data: ChartData[], lookback = 20): SupportResistanceLevel[] {
  const levels: SupportResistanceLevel[] = [];
  const tolerance = 0.005; // 0.5% price tolerance for grouping levels

  // Find swing highs and lows
  for (let i = lookback; i < data.length - lookback; i++) {
    const candle = data[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    // Check if this is a swing high/low
    for (let j = i - lookback; j < i + lookback; j++) {
      if (j === i) continue;
      if (data[j].high > candle.high) isSwingHigh = false;
      if (data[j].low < candle.low) isSwingLow = false;
    }

    if (isSwingHigh) {
      // Check if we already have a similar resistance level
      const existing = levels.find(l =>
        l.type === 'resistance' &&
        Math.abs(l.price - candle.high) / candle.high < tolerance
      );

      if (existing) {
        existing.strength++;
      } else {
        levels.push({
          price: candle.high,
          type: 'resistance',
          strength: 1,
        });
      }
    }

    if (isSwingLow) {
      const existing = levels.find(l =>
        l.type === 'support' &&
        Math.abs(l.price - candle.low) / candle.low < tolerance
      );

      if (existing) {
        existing.strength++;
      } else {
        levels.push({
          price: candle.low,
          type: 'support',
          strength: 1,
        });
      }
    }
  }

  // Return only strong levels (tested 2+ times)
  return levels.filter(l => l.strength >= 2).slice(-8); // Top 8 levels
}

/**
 * Calculate Premium/Discount Zones
 * Based on recent high and low (Fibonacci 50%)
 */
export function calculatePremiumDiscount(data: ChartData[], lookback = 50): PremiumDiscountZone | null {
  if (data.length < lookback) return null;

  const recentData = data.slice(-lookback);
  const high = Math.max(...recentData.map(d => d.high));
  const low = Math.min(...recentData.map(d => d.low));
  const equilibrium = (high + low) / 2;

  return {
    high,
    low,
    equilibrium,
    premiumStart: equilibrium,
    discountEnd: equilibrium,
  };
}

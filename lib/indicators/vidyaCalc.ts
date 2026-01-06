/**
 * VIDYA (Variable Index Dynamic Average) Indicator
 * Momentum-based adaptive moving average with volume tracking
 * Based on Chande Momentum Oscillator for dynamic alpha calculation
 */

export interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ATRData {
  value: number;
  trueRange: number;
}

export interface LiquidityZone {
  type: 'support' | 'resistance';
  price: number;
  startTime: number;
  endTime: number;
  startIndex: number;
  endIndex: number;
  avgVolume: number;
  crossedAt?: number; // Time when price crossed this zone
}

export interface VIDYAPoint {
  time: number;
  close: number;
  cmo: number; // Chande Momentum Oscillator (-100 to +100)
  alpha: number; // Dynamic smoothing factor (0 to 1)
  vidya: number; // Variable Index Dynamic Average
  atr: number; // Average True Range
  upperBand: number; // VIDYA + ATR
  lowerBand: number; // VIDYA - ATR
  smoothedValue: number | null; // Plotted line: lowerBand in uptrend, upperBand in downtrend, null on trend change
  buyVolume: number; // Accumulated buy volume
  sellVolume: number; // Accumulated sell volume
  volumeDelta: number; // Net volume momentum
  volumeDeltaPercent: number; // Delta as percentage (0-100)
  trend: 'bullish' | 'bearish' | 'neutral';
  signal: 'buy' | 'sell' | null;
  earlySignal: 'early_buy' | 'early_sell' | null; // Early warning when band touched with volume confirmation
  liquidityZones: LiquidityZone[]; // Active liquidity zones at this point
}

/**
 * Calculate Chande Momentum Oscillator (CMO)
 * Measures momentum strength on a scale of -100 to +100
 */
function calculateCMO(data: ChartData[], period: number = 14): number {
  if (data.length < period + 1) return 0;

  const closeData = data.slice(-period - 1).map(d => d.close);
  let sumUp = 0;
  let sumDown = 0;

  for (let i = 1; i < closeData.length; i++) {
    const change = closeData[i] - closeData[i - 1];
    if (change > 0) {
      sumUp += change;
    } else {
      sumDown += Math.abs(change);
    }
  }

  const total = sumUp + sumDown;
  if (total === 0) return 0;

  return ((sumUp - sumDown) / total) * 100;
}

/**
 * Calculate Average True Range (ATR)
 * Measures volatility for band calculations
 */
function calculateATR(data: ChartData[], period: number = 14): ATRData {
  if (data.length < period + 1) {
    return { value: 0, trueRange: 0 };
  }

  const recentData = data.slice(-period - 1);
  let atrValues: number[] = [];

  for (let i = 1; i < recentData.length; i++) {
    const high = recentData[i].high;
    const low = recentData[i].low;
    const prevClose = recentData[i - 1].close;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);

    const trueRange = Math.max(tr1, tr2, tr3);
    atrValues.push(trueRange);
  }

  const atr = atrValues.reduce((a, b) => a + b, 0) / atrValues.length;
  const trueRange = atrValues[atrValues.length - 1];

  return { value: atr, trueRange };
}

/**
 * Calculate VIDYA (Variable Index Dynamic Average)
 * Uses dynamic alpha based on CMO momentum
 * Alpha = F × |CMO| / 100, where F = 2 / (period + 1)
 * This gives more weight when momentum is strong
 */
function calculateVIDYA(
  data: ChartData[],
  period: number = 14,
  previousVIDYA?: number
): { vidya: number; cmo: number; alpha: number } {
  if (data.length < period + 1) {
    const close = data[data.length - 1].close;
    return { vidya: close, cmo: 0, alpha: 0 };
  }

  const cmo = calculateCMO(data, period);

  // F = 2 / (period + 1) is the standard EMA smoothing factor
  const F = 2 / (period + 1);

  // Alpha = F × |CMO| / 100
  // CMO is -100 to +100, so |CMO|/100 is 0 to 1
  // Alpha ranges from 0 (no momentum) to F (maximum momentum)
  const alpha = F * (Math.abs(cmo) / 100);

  const currentClose = data[data.length - 1].close;

  if (previousVIDYA === undefined || previousVIDYA === 0) {
    // First VIDYA is just the close price
    return {
      vidya: currentClose,
      cmo,
      alpha,
    };
  }

  // VIDYA = previousVIDYA + alpha * (close - previousVIDYA)
  // This is equivalent to: VIDYA = close * alpha + previousVIDYA * (1 - alpha)
  const vidya = previousVIDYA + alpha * (currentClose - previousVIDYA);

  return { vidya, cmo, alpha };
}

/**
 * Detect swing highs and lows
 * Returns the price if a pivot is confirmed, null otherwise
 */
function detectPivotHigh(data: ChartData[], index: number, leftBars: number = 3, rightBars: number = 3): number | null {
  if (index < leftBars || index + rightBars >= data.length) {
    return null;
  }

  const pivotHigh = data[index].high;

  // Check left side - all highs must be lower
  for (let i = index - leftBars; i < index; i++) {
    if (data[i].high >= pivotHigh) {
      return null;
    }
  }

  // Check right side - all highs must be lower
  for (let i = index + 1; i <= index + rightBars; i++) {
    if (data[i].high >= pivotHigh) {
      return null;
    }
  }

  return pivotHigh;
}

function detectPivotLow(data: ChartData[], index: number, leftBars: number = 3, rightBars: number = 3): number | null {
  if (index < leftBars || index + rightBars >= data.length) {
    return null;
  }

  const pivotLow = data[index].low;

  // Check left side - all lows must be higher
  for (let i = index - leftBars; i < index; i++) {
    if (data[i].low <= pivotLow) {
      return null;
    }
  }

  // Check right side - all lows must be higher
  for (let i = index + 1; i <= index + rightBars; i++) {
    if (data[i].low <= pivotLow) {
      return null;
    }
  }

  return pivotLow;
}

/**
 * Calculate Volume Delta
 * Green candles = buy volume, Red candles = sell volume
 * Returns both buyVolume and sellVolume for separate tracking
 */
function calculateVolumeDelta(data: ChartData[], period: number = 14): {
  buyVolume: number;
  sellVolume: number;
  netDelta: number;
} {
  if (data.length < period) return { buyVolume: 0, sellVolume: 0, netDelta: 0 };

  const recentData = data.slice(-period);
  let buyVolume = 0;
  let sellVolume = 0;

  for (const candle of recentData) {
    // Green candle (close > open) = all volume is buying
    // Red candle (close < open) = all volume is selling
    if (candle.close > candle.open) {
      buyVolume += candle.volume;
    } else if (candle.close < candle.open) {
      sellVolume += candle.volume;
    } else {
      // Doji/neutral candle - split volume equally
      buyVolume += candle.volume / 2;
      sellVolume += candle.volume / 2;
    }
  }

  const netDelta = buyVolume - sellVolume;

  return { buyVolume, sellVolume, netDelta };
}

/**
 * Determine if price crosses above/below bands (for trend detection)
 */
function detectTrendCrossover(
  close: number,
  closePrevious: number,
  upperBand: number,
  lowerBand: number
): 'up_cross' | 'down_cross' | 'none' {
  // Crossover: price crosses ABOVE upper band
  if (closePrevious <= upperBand && close > upperBand) {
    return 'up_cross';
  }
  // Crossunder: price crosses BELOW lower band
  if (closePrevious >= lowerBand && close < lowerBand) {
    return 'down_cross';
  }
  return 'none';
}

/**
 * Determine trend direction - maintains state until crossover occurs
 */
function determineTrend(
  isTrendUp: boolean,
  crossover: 'up_cross' | 'down_cross' | 'none'
): 'bullish' | 'bearish' {
  // Update trend only on crossovers
  if (crossover === 'up_cross') {
    return 'bullish';
  } else if (crossover === 'down_cross') {
    return 'bearish';
  }
  // Maintain previous trend
  return isTrendUp ? 'bullish' : 'bearish';
}

/**
 * Generate trading signal based on VIDYA and volume
 */
function generateSignal(
  trend: 'bullish' | 'bearish' | 'neutral',
  previousTrend: 'bullish' | 'bearish' | 'neutral' | undefined,
  volumeDelta: number,
  cmo: number
): 'buy' | 'sell' | null {
  // Buy signal: trend changes from non-bullish to bullish with positive volume delta
  if (trend === 'bullish' && previousTrend !== 'bullish' && volumeDelta > 0 && cmo > 20) {
    return 'buy';
  }

  // Sell signal: trend changes from non-bearish to bearish with negative volume delta
  if (trend === 'bearish' && previousTrend !== 'bearish' && volumeDelta < 0 && cmo < -20) {
    return 'sell';
  }

  return null;
}

/**
 * Detect early reversal signals when price touches band with volume confirmation
 * Catches momentum changes before full crossover
 *
 * IMPORTANT: Uses SHORT-TERM volume delta (5 candles) NOT cumulative trend delta
 * This allows detection of momentum shifts even in long trends
 */
function detectEarlySignal(
  close: number,
  previousClose: number,
  upperBand: number,
  lowerBand: number,
  volume: number,
  avgVolume: number,
  currentVolumeDelta: number,        // Short-term delta (last 5 candles)
  previousVolumeDelta: number,       // Previous short-term delta (5 candles ago)
  trend: 'bullish' | 'bearish' | 'neutral'
): 'early_buy' | 'early_sell' | null {
  const bandThreshold = 0.005; // 0.5% threshold for "touching" band (relaxed from 0.2%)
  const volumeMultiplier = 1.2; // Volume must be 1.2x average (relaxed from 1.5x)

  // Calculate how close price is to bands (absolute distance)
  const distanceToLower = Math.abs(close - lowerBand);
  const distanceToUpper = Math.abs(close - upperBand);

  // Calculate percentage distance
  const lowerBandDistance = distanceToLower / lowerBand;
  const upperBandDistance = distanceToUpper / upperBand;

  // Check if volume is elevated
  const isVolumeSpike = volume > avgVolume * volumeMultiplier;

  // Determine which band is closer
  const closerToLower = distanceToLower < distanceToUpper;
  const closerToUpper = distanceToUpper < distanceToLower;

  // Early BUY signal: Price near lower band (and closer to lower than upper) + bullish volume
  if (lowerBandDistance <= bandThreshold && closerToLower && trend !== 'bullish' && close <= lowerBand * 1.005) {
    // Check for volume confirmation - either:
    // 1. Volume delta is positive (buyers dominant)
    // 2. Volume delta flipped from negative to positive (momentum shift)
    const volumeDeltaPositive = currentVolumeDelta > 0;
    const volumeDeltaFlip = previousVolumeDelta < 0 && currentVolumeDelta > 0;

    // Signal if we have volume spike AND positive volume delta (no flip required)
    if (isVolumeSpike && volumeDeltaPositive) {
      return 'early_buy';
    }

    // OR signal if volume delta flipped (even without volume spike)
    if (volumeDeltaFlip && volume > avgVolume * 0.8) {
      return 'early_buy';
    }
  }

  // Early SELL signal: Price near upper band (and closer to upper than lower) + bearish volume
  if (upperBandDistance <= bandThreshold && closerToUpper && trend !== 'bearish' && close >= upperBand * 0.995) {
    // Check for volume confirmation - either:
    // 1. Volume delta is negative (sellers dominant)
    // 2. Volume delta flipped from positive to negative (momentum shift)
    const volumeDeltaNegative = currentVolumeDelta < 0;
    const volumeDeltaFlip = previousVolumeDelta > 0 && currentVolumeDelta < 0;

    // Signal if we have volume spike AND negative volume delta (no flip required)
    if (isVolumeSpike && volumeDeltaNegative) {
      return 'early_sell';
    }

    // OR signal if volume delta flipped (even without volume spike)
    if (volumeDeltaFlip && volume > avgVolume * 0.8) {
      return 'early_sell';
    }
  }

  return null;
}

/**
 * Calculate VIDYA indicator for all data points
 * Volumes accumulate during trends and reset when trend changes
 * Trend changes when price crosses upper/lower bands
 * Liquidity zones detected at swing highs/lows
 */
export function calculateVIDYA_Series(
  data: ChartData[],
  cmoPeriod: number = 14,
  atrPeriod: number = 14,
  volumePeriod: number = 14,
  bandMultiplier: number = 1.0
): VIDYAPoint[] {
  const result: VIDYAPoint[] = [];
  let previousVIDYA: number | undefined;
  let previousTrend: 'bullish' | 'bearish' | 'neutral' | undefined;

  // Track volume accumulation per trend
  let trendBuyVolume = 0;
  let trendSellVolume = 0;
  let lastTrendDirection: 'bullish' | 'bearish' | null = null;

  // Track active liquidity zones (lines that haven't expired or been crossed)
  const activeLiquidityZones: LiquidityZone[] = [];
  const completedLiquidityZones: LiquidityZone[] = []; // Zones that expired or were crossed
  const PIVOT_LEFT_BARS = 3;
  const PIVOT_RIGHT_BARS = 3;
  const MAX_LINE_AGE = 50; // Maximum bars a line can extend

  for (let i = cmoPeriod; i < data.length; i++) {
    const currentData = data.slice(0, i + 1);
    const { vidya, cmo, alpha } = calculateVIDYA(currentData, cmoPeriod, previousVIDYA);
    const { value: atr } = calculateATR(currentData, atrPeriod);

    const upperBand = vidya + (atr * bandMultiplier);
    const lowerBand = vidya - (atr * bandMultiplier);

    const close = data[i].close;
    const closePrevious = i > 0 ? data[i - 1].close : close;
    const open = data[i].open;
    const volume = data[i].volume;

    // Detect crossovers (when price crosses band boundaries)
    const crossover = detectTrendCrossover(close, closePrevious, upperBand, lowerBand);

    // Determine trend based on crossovers (maintains state until next crossover)
    const isTrendUp = lastTrendDirection === 'bullish';
    const trend = determineTrend(isTrendUp, crossover);

    // Reset volumes when trend changes (matches Pine Script behavior)
    if (trend !== lastTrendDirection) {
      trendBuyVolume = 0;
      trendSellVolume = 0;
      lastTrendDirection = trend;
    }

    // Accumulate volumes: green candles = buy, red candles = sell
    if (close > open) {
      trendBuyVolume += volume;
    } else if (close < open) {
      trendSellVolume += volume;
    } else {
      // Doji candle - split equally
      trendBuyVolume += volume / 2;
      trendSellVolume += volume / 2;
    }

    const signal = generateSignal(trend, previousTrend, trendBuyVolume - trendSellVolume, cmo);

    // Calculate delta volume percentage
    const totalVolume = trendBuyVolume + trendSellVolume;
    const netDelta = trendBuyVolume - trendSellVolume;
    const volumeDeltaPercent = totalVolume > 0 ? (Math.abs(netDelta) / totalVolume) * 100 : 0;

    // Detect new pivot highs/lows (confirmed with right bars)
    // Check if index i-PIVOT_RIGHT_BARS forms a pivot
    const pivotCheckIndex = i - PIVOT_RIGHT_BARS;
    if (pivotCheckIndex >= PIVOT_LEFT_BARS) {
      const pivotHigh = detectPivotHigh(data, pivotCheckIndex, PIVOT_LEFT_BARS, PIVOT_RIGHT_BARS);
      const pivotLow = detectPivotLow(data, pivotCheckIndex, PIVOT_LEFT_BARS, PIVOT_RIGHT_BARS);

      // Get smoothed value at pivot point (need to look back in results)
      const pivotResultIndex = pivotCheckIndex - cmoPeriod;
      const smoothedAtPivot = pivotResultIndex >= 0 && pivotResultIndex < result.length
        ? result[pivotResultIndex].smoothedValue
        : null;

      // Create resistance line: pivot high BELOW smoothed value
      if (pivotHigh !== null && smoothedAtPivot !== null && pivotHigh < smoothedAtPivot) {
        // Calculate average volume around the pivot
        const volumeStart = Math.max(0, pivotCheckIndex - PIVOT_LEFT_BARS);
        const volumeEnd = Math.min(data.length - 1, pivotCheckIndex + PIVOT_RIGHT_BARS);
        const volumeSlice = data.slice(volumeStart, volumeEnd + 1);
        const avgVolume = volumeSlice.reduce((sum, d) => sum + d.volume, 0) / volumeSlice.length;

        activeLiquidityZones.push({
          type: 'resistance',
          price: pivotHigh,
          startTime: data[pivotCheckIndex].time,
          endTime: data[pivotCheckIndex].time, // Will be updated as line extends
          startIndex: pivotCheckIndex,
          endIndex: pivotCheckIndex, // Will be updated
          avgVolume,
        });
      }

      // Create support line: pivot low ABOVE smoothed value
      if (pivotLow !== null && smoothedAtPivot !== null && pivotLow > smoothedAtPivot) {
        // Calculate average volume around the pivot
        const volumeStart = Math.max(0, pivotCheckIndex - PIVOT_LEFT_BARS);
        const volumeEnd = Math.min(data.length - 1, pivotCheckIndex + PIVOT_RIGHT_BARS);
        const volumeSlice = data.slice(volumeStart, volumeEnd + 1);
        const avgVolume = volumeSlice.reduce((sum, d) => sum + d.volume, 0) / volumeSlice.length;

        activeLiquidityZones.push({
          type: 'support',
          price: pivotLow,
          startTime: data[pivotCheckIndex].time,
          endTime: data[pivotCheckIndex].time, // Will be updated
          startIndex: pivotCheckIndex,
          endIndex: pivotCheckIndex, // Will be updated
          avgVolume,
        });
      }
    }

    // Update and filter active liquidity zones
    const currentClose = data[i].close;
    const previousClose = i > 0 ? data[i - 1].close : currentClose;

    for (let j = activeLiquidityZones.length - 1; j >= 0; j--) {
      const zone = activeLiquidityZones[j];
      const lineAge = i - zone.startIndex;

      // Check if price crossed the zone
      const crossed = zone.type === 'support'
        ? (currentClose < zone.price && previousClose >= zone.price)
        : (currentClose > zone.price && previousClose <= zone.price);

      // Remove zone if crossed or too old (>50 bars)
      if (crossed && lineAge < MAX_LINE_AGE) {
        zone.crossedAt = data[i].time;
        zone.endTime = data[i].time;
        zone.endIndex = i;
        completedLiquidityZones.push(zone); // Store completed zone
        activeLiquidityZones.splice(j, 1);
      } else if (lineAge >= MAX_LINE_AGE) {
        // Expire the zone
        zone.endTime = data[i].time;
        zone.endIndex = i;
        completedLiquidityZones.push(zone); // Store expired zone
        activeLiquidityZones.splice(j, 1);
      } else {
        // Extend the zone
        zone.endTime = data[i].time;
        zone.endIndex = i;
      }
    }

    // Calculate smoothed_value (the actual plotted line)
    // In uptrend: use lower_band (trailing support)
    // In downtrend: use upper_band (trailing resistance)
    // Always continuous - no gaps
    let smoothedValue: number | null;
    if (trend === 'bullish') {
      smoothedValue = lowerBand;
    } else if (trend === 'bearish') {
      smoothedValue = upperBand;
    } else {
      smoothedValue = null;
    }

    // Detect early signals (band touch with volume confirmation)
    // Calculate average volume over recent period
    const volumeLookback = Math.min(volumePeriod, i);
    const recentVolumes = data.slice(i - volumeLookback + 1, i + 1).map(d => d.volume);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

    // Calculate SHORT-TERM volume delta for early signal detection (last 5 candles)
    // This prevents the issue where long trends accumulate huge delta making flips impossible
    const shortTermWindow = 5;
    const shortTermLookback = Math.min(shortTermWindow, i);
    const shortTermCandles = data.slice(i - shortTermLookback + 1, i + 1);

    let shortTermBuyVol = 0;
    let shortTermSellVol = 0;
    for (const candle of shortTermCandles) {
      if (candle.close > candle.open) {
        shortTermBuyVol += candle.volume;
      } else if (candle.close < candle.open) {
        shortTermSellVol += candle.volume;
      } else {
        shortTermBuyVol += candle.volume / 2;
        shortTermSellVol += candle.volume / 2;
      }
    }
    const currentShortTermDelta = shortTermBuyVol - shortTermSellVol;

    // Get previous short-term delta (from 1 candle ago)
    const prevShortTermLookback = Math.min(shortTermWindow, i - 1);
    const prevShortTermCandles = i > 0
      ? data.slice(i - prevShortTermLookback, i)
      : [];

    let prevShortTermBuyVol = 0;
    let prevShortTermSellVol = 0;
    for (const candle of prevShortTermCandles) {
      if (candle.close > candle.open) {
        prevShortTermBuyVol += candle.volume;
      } else if (candle.close < candle.open) {
        prevShortTermSellVol += candle.volume;
      } else {
        prevShortTermBuyVol += candle.volume / 2;
        prevShortTermSellVol += candle.volume / 2;
      }
    }
    const previousShortTermDelta = prevShortTermBuyVol - prevShortTermSellVol;

    const earlySignal = detectEarlySignal(
      close,
      closePrevious,
      upperBand,
      lowerBand,
      volume,
      avgVolume,
      currentShortTermDelta,
      previousShortTermDelta,
      trend
    );

    result.push({
      time: data[i].time,
      close,
      cmo,
      alpha,
      vidya,
      atr,
      upperBand,
      lowerBand,
      smoothedValue,
      buyVolume: trendBuyVolume,
      sellVolume: trendSellVolume,
      volumeDelta: netDelta,
      volumeDeltaPercent,
      trend,
      signal,
      earlySignal,
      liquidityZones: [...completedLiquidityZones, ...activeLiquidityZones], // All zones (completed + active)
    });

    previousVIDYA = vidya;
    previousTrend = trend;
  }

  return result;
}

/**
 * Get latest VIDYA point with all indicators
 */
export function getLatestVIDYA(data: ChartData[]): VIDYAPoint | null {
  const series = calculateVIDYA_Series(data);
  return series.length > 0 ? series[series.length - 1] : null;
}

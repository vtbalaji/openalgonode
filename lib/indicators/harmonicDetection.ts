/**
 * Early Harmonic Pattern Detection
 * Detects XABCD harmonic patterns in formation for early entry signals
 */

export interface Point {
  time: number;
  price: number;
  index: number;
}

export interface DProjection {
  ratio: number;  // 1.0, 1.27, 1.618, 2.0
  price: number;  // Calculated D price level
  label: string;  // "D 100%", "D 127%", "D 161.8%", "D 200%"
}

export interface HarmonicSetup {
  type: 'bullish' | 'bearish';
  points: {
    X: Point;
    A: Point;
    B: Point | null;
    C: Point | null;
  };
  fibLevels: {
    AB_retracement: number; // % of XA (38.2, 50, 61.8)
    BC_pullback: number | null; // % of AB (38.2-88.6)
  };
  status: 'forming' | 'valid' | 'broken';
  confidence: number; // 0-100
  entryPrice: number | null;
  stopLoss: number | null;
  target1: number | null; // B point
  target2: number | null; // 127.2% extension
  dProjections: DProjection[] | null; // D targets when C exists
}

export interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Calculate Fibonacci retracement level
 */
function calculateFibRetracement(
  start: number,
  end: number,
  ratio: number
): number {
  return start + (end - start) * ratio;
}

/**
 * Check if value is within range (with tolerance)
 */
function isInRange(
  value: number,
  min: number,
  max: number,
  tolerance: number = 0.001
): boolean {
  const range = max - min;
  return value >= min - range * tolerance && value <= max + range * tolerance;
}

/**
 * Calculate D projection levels based on AB=CD harmonic principle
 * When C point is confirmed, D projections show where the final leg may end
 * @param C_price - Price at point C
 * @param AB_range - Distance from A to B
 * @param type - 'bullish' or 'bearish' pattern
 * @returns Array of D projection targets with ratios and prices
 */
function calculateDProjections(
  C_price: number,
  AB_range: number,
  type: 'bullish' | 'bearish'
): DProjection[] {
  const projections: DProjection[] = [];

  // D projection ratios (standard harmonic ratios)
  const ratios = [
    { ratio: 1.0, label: 'D 100%' },       // AB=CD (most common)
    { ratio: 1.27, label: 'D 127%' },      // Fibonacci extension
    { ratio: 1.618, label: 'D 161.8%' },   // Golden ratio
    { ratio: 2.0, label: 'D 200%' },       // Extended target
  ];

  for (const { ratio, label } of ratios) {
    const projection_distance = AB_range * ratio;

    // For bullish: D is above C (C + projection)
    // For bearish: D is below C (C - projection)
    const price = type === 'bullish'
      ? C_price + projection_distance
      : C_price - projection_distance;

    projections.push({ ratio, price, label });
  }

  return projections;
}

/**
 * Detect harmonic patterns (XABCD) from candlestick data
 */
export function detectHarmonicPatterns(
  data: ChartData[],
  swingHigh: Point,
  swingLow: Point,
  config: {
    minABRetracement: number; // Default: 0.382
    maxABRetracement: number; // Default: 0.886 (expanded to catch deep retracements)
    minBCPullback: number; // Default: 0.382
    maxBCPullback: number; // Default: 0.886
    minXASize: number; // Minimum XA leg size as % of price (default: 0.005 = 0.5%)
  } = {
    minABRetracement: 0.382,
    maxABRetracement: 0.886, // Expanded to catch 78.6% and other deep retracements
    minBCPullback: 0.382,
    maxBCPullback: 0.886,
    minXASize: 0.005,
  }
): HarmonicSetup[] {
  const setups: HarmonicSetup[] = [];

  // Determine if we have bullish or bearish setup based on swing positions
  const isBullish = swingHigh.index < swingLow.index; // High came first, then low = bullish reversal expected
  const isBearish = swingLow.index < swingHigh.index; // Low came first, then high = bearish reversal expected

  if (isBullish) {
    // Bullish setup: X (high) → A (low) → B (retracement up) → C (pullback down)
    const X = swingHigh;
    const A = swingLow;
    const XA_range = X.price - A.price;

    // Check minimum XA size
    if (XA_range / A.price < config.minXASize) {
      return setups;
    }

    // Find point B (retracement up from A)
    // B should be between A and X, at 38.2%-61.8% retracement
    const minB = calculateFibRetracement(A.price, X.price, config.minABRetracement);
    const maxB = calculateFibRetracement(A.price, X.price, config.maxABRetracement);

    let B: Point | null = null;
    let B_high = -Infinity;

    // Scan candles after A for highest point in valid retracement range
    for (let i = A.index + 1; i < data.length; i++) {
      const candle = data[i];
      if (candle.high >= minB && candle.high <= maxB && candle.high > B_high) {
        B_high = candle.high;
        B = {
          time: candle.time,
          price: candle.high,
          index: i,
        };
      }
    }

    if (!B) {
      return setups; // No valid B point found
    }

    const AB_range = B.price - A.price;
    const AB_retracement = AB_range / XA_range;

    // Find point C (pullback down from B)
    // C should pullback 38.2%-88.6% of AB move
    const minC = B.price - AB_range * config.maxBCPullback;
    const maxC = B.price - AB_range * config.minBCPullback;

    let C: Point | null = null;
    let C_low = Infinity;

    // Scan candles after B for lowest point in valid pullback range
    for (let i = B.index + 1; i < data.length; i++) {
      const candle = data[i];
      if (candle.low >= minC && candle.low <= maxC && candle.low < C_low) {
        C_low = candle.low;
        C = {
          time: candle.time,
          price: candle.low,
          index: i,
        };
      }
    }

    const BC_pullback = C ? (B.price - C.price) / AB_range : null;

    // Calculate confidence (based on how well it fits ideal ratios)
    let confidence = 0;

    // AB Retracement scoring - recognize all key Fibonacci levels
    if (AB_retracement >= 0.76 && AB_retracement <= 0.80) confidence += 50; // 78.6% - Deep harmonic (strongest)
    else if (AB_retracement >= 0.6 && AB_retracement <= 0.65) confidence += 40; // 61.8% golden ratio
    else if (AB_retracement >= 0.5 && AB_retracement <= 0.52) confidence += 35; // 50% midpoint
    else if (AB_retracement >= 0.38 && AB_retracement <= 0.40) confidence += 30; // 38.2% shallow
    else if (AB_retracement >= 0.85 && AB_retracement <= 0.89) confidence += 35; // 88.6% extreme
    else confidence += 20; // Other levels

    // BC Pullback scoring
    if (BC_pullback && BC_pullback >= 0.38 && BC_pullback <= 0.5) confidence += 40; // Conservative pullback
    else if (BC_pullback && BC_pullback >= 0.5 && BC_pullback <= 0.618) confidence += 35; // Golden pullback
    else if (BC_pullback) confidence += 20;

    // Pattern completeness bonus
    if (C && C.index === data.length - 1) confidence += 10; // Current candle is at C (reduced from 20)

    // Determine status
    let status: 'forming' | 'valid' | 'broken' = 'forming';
    if (C && BC_pullback && BC_pullback >= config.minBCPullback && BC_pullback <= config.maxBCPullback) {
      status = 'valid';
    } else if (C && C.price < A.price) {
      status = 'broken'; // Broke below A
    }

    // Calculate entry and targets
    const entryPrice = C ? C.price + XA_range * 0.001 : null; // Entry slightly above C
    const stopLoss = C ? C.price - XA_range * 0.002 : null; // Stop below C
    const target1 = B.price; // First target at B
    const target2 = B.price + AB_range * 0.272; // 127.2% extension

    // Calculate D projections if C exists
    const dProjections = C ? calculateDProjections(C.price, AB_range, 'bullish') : null;

    setups.push({
      type: 'bullish',
      points: { X, A, B, C },
      fibLevels: {
        AB_retracement: AB_retracement,
        BC_pullback,
      },
      status,
      confidence,
      entryPrice,
      stopLoss,
      target1,
      target2,
      dProjections,
    });
  } else if (isBearish) {
    // Bearish setup: X (low) → A (high) → B (retracement down) → C (pullback up)
    const X = swingLow;
    const A = swingHigh;
    const XA_range = A.price - X.price;

    // Check minimum XA size
    if (XA_range / X.price < config.minXASize) {
      return setups;
    }

    // Find point B (retracement down from A)
    const minB = calculateFibRetracement(A.price, X.price, config.maxABRetracement);
    const maxB = calculateFibRetracement(A.price, X.price, config.minABRetracement);

    let B: Point | null = null;
    let B_low = Infinity;

    for (let i = A.index + 1; i < data.length; i++) {
      const candle = data[i];
      if (candle.low >= minB && candle.low <= maxB && candle.low < B_low) {
        B_low = candle.low;
        B = {
          time: candle.time,
          price: candle.low,
          index: i,
        };
      }
    }

    if (!B) {
      return setups;
    }

    const AB_range = A.price - B.price;
    const AB_retracement = AB_range / XA_range;

    // Find point C (pullback up from B)
    const minC = B.price + AB_range * config.minBCPullback;
    const maxC = B.price + AB_range * config.maxBCPullback;

    let C: Point | null = null;
    let C_high = -Infinity;

    for (let i = B.index + 1; i < data.length; i++) {
      const candle = data[i];
      if (candle.high >= minC && candle.high <= maxC && candle.high > C_high) {
        C_high = candle.high;
        C = {
          time: candle.time,
          price: candle.high,
          index: i,
        };
      }
    }

    const BC_pullback = C ? (C.price - B.price) / AB_range : null;

    // Calculate confidence (based on how well it fits ideal ratios)
    let confidence = 0;

    // AB Retracement scoring - recognize all key Fibonacci levels
    if (AB_retracement >= 0.76 && AB_retracement <= 0.80) confidence += 50; // 78.6% - Deep harmonic (strongest)
    else if (AB_retracement >= 0.6 && AB_retracement <= 0.65) confidence += 40; // 61.8% golden ratio
    else if (AB_retracement >= 0.5 && AB_retracement <= 0.52) confidence += 35; // 50% midpoint
    else if (AB_retracement >= 0.38 && AB_retracement <= 0.40) confidence += 30; // 38.2% shallow
    else if (AB_retracement >= 0.85 && AB_retracement <= 0.89) confidence += 35; // 88.6% extreme
    else confidence += 20; // Other levels

    // BC Pullback scoring
    if (BC_pullback && BC_pullback >= 0.38 && BC_pullback <= 0.5) confidence += 40; // Conservative pullback
    else if (BC_pullback && BC_pullback >= 0.5 && BC_pullback <= 0.618) confidence += 35; // Golden pullback
    else if (BC_pullback) confidence += 20;

    // Pattern completeness bonus
    if (C && C.index === data.length - 1) confidence += 10; // Current candle is at C (reduced from 20)

    // Determine status
    let status: 'forming' | 'valid' | 'broken' = 'forming';
    if (C && BC_pullback && BC_pullback >= config.minBCPullback && BC_pullback <= config.maxBCPullback) {
      status = 'valid';
    } else if (C && C.price > A.price) {
      status = 'broken';
    }

    // Calculate entry and targets
    const entryPrice = C ? C.price - XA_range * 0.001 : null;
    const stopLoss = C ? C.price + XA_range * 0.002 : null;
    const target1 = B.price;
    const target2 = B.price - AB_range * 0.272;

    // Calculate D projections if C exists
    const dProjections = C ? calculateDProjections(C.price, AB_range, 'bearish') : null;

    setups.push({
      type: 'bearish',
      points: { X, A, B, C },
      fibLevels: {
        AB_retracement: AB_retracement,
        BC_pullback,
      },
      status,
      confidence,
      entryPrice,
      stopLoss,
      target1,
      target2,
      dProjections,
    });
  }

  return setups;
}

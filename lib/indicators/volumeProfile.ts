/**
 * Volume Profile Indicator
 * Calculates volume distribution at different price levels
 */

export interface VolumeProfileRow {
  price: number;
  volume: number;
}

export interface VolumeProfileResult {
  profile: VolumeProfileRow[];
  poc: number; // Point of Control (price with highest volume)
  valueAreaHigh: number;
  valueAreaLow: number;
  totalVolume: number;
}

export interface CandleData {
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Calculate Volume Profile from OHLCV data
 * @param candles - Array of candle data
 * @param numBins - Number of price levels (bins) to divide the range into
 * @param valueAreaPercent - Percentage for value area calculation (default 70%)
 */
export function calculateVolumeProfile(
  candles: CandleData[],
  numBins: number = 50,
  valueAreaPercent: number = 0.70
): VolumeProfileResult {
  if (!candles || candles.length === 0) {
    return {
      profile: [],
      poc: 0,
      valueAreaHigh: 0,
      valueAreaLow: 0,
      totalVolume: 0,
    };
  }

  // Find price range
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVolume = 0;

  for (const candle of candles) {
    minPrice = Math.min(minPrice, candle.low);
    maxPrice = Math.max(maxPrice, candle.high);
    totalVolume += candle.volume;
  }

  const priceRange = maxPrice - minPrice;
  const binSize = priceRange / numBins;

  // Initialize bins
  const bins: Map<number, number> = new Map();
  for (let i = 0; i < numBins; i++) {
    const price = minPrice + (i * binSize) + (binSize / 2);
    bins.set(price, 0);
  }

  // Distribute volume across price levels
  for (const candle of candles) {
    // For each candle, distribute its volume across the price range it covers
    const candleRange = candle.high - candle.low;
    
    if (candleRange === 0) {
      // Single price point - assign all volume to that bin
      const binIndex = Math.floor((candle.close - minPrice) / binSize);
      const price = minPrice + (binIndex * binSize) + (binSize / 2);
      const currentVol = bins.get(price) || 0;
      bins.set(price, currentVol + candle.volume);
    } else {
      // Distribute volume proportionally across the candle's range
      const startBin = Math.floor((candle.low - minPrice) / binSize);
      const endBin = Math.floor((candle.high - minPrice) / binSize);
      
      for (let i = startBin; i <= endBin && i < numBins; i++) {
        const price = minPrice + (i * binSize) + (binSize / 2);
        const binLow = minPrice + (i * binSize);
        const binHigh = minPrice + ((i + 1) * binSize);
        
        // Calculate how much of this bin overlaps with the candle
        const overlapLow = Math.max(binLow, candle.low);
        const overlapHigh = Math.min(binHigh, candle.high);
        const overlapRatio = (overlapHigh - overlapLow) / candleRange;
        
        const volumeForBin = candle.volume * overlapRatio;
        const currentVol = bins.get(price) || 0;
        bins.set(price, currentVol + volumeForBin);
      }
    }
  }

  // Convert to array and sort by price
  const profile: VolumeProfileRow[] = Array.from(bins.entries())
    .map(([price, volume]) => ({ price, volume }))
    .sort((a, b) => a.price - b.price);

  // Find Point of Control (POC) - price with highest volume
  let poc = profile[0].price;
  let maxVolume = profile[0].volume;
  
  for (const row of profile) {
    if (row.volume > maxVolume) {
      maxVolume = row.volume;
      poc = row.price;
    }
  }

  // Calculate Value Area (70% of total volume around POC)
  const sortedByVolume = [...profile].sort((a, b) => b.volume - a.volume);
  const valueAreaTarget = totalVolume * valueAreaPercent;
  
  let valueAreaVolume = 0;
  const valueAreaPrices: number[] = [];
  
  for (const row of sortedByVolume) {
    valueAreaVolume += row.volume;
    valueAreaPrices.push(row.price);
    
    if (valueAreaVolume >= valueAreaTarget) {
      break;
    }
  }
  
  const valueAreaHigh = Math.max(...valueAreaPrices);
  const valueAreaLow = Math.min(...valueAreaPrices);

  return {
    profile,
    poc,
    valueAreaHigh,
    valueAreaLow,
    totalVolume,
  };
}

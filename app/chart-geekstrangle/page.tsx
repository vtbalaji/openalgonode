/**
 * Geek Strangle Chart Page (Different Strikes for CE + PE with Greeks)
 * Features:
 * - TradingView Lightweight Charts
 * - Strangle Greeks (Theta, Vega, Gamma, Delta)
 * - Multiple timeframes
 * - Technical indicators (SMA, EMA, RSI)
 * - Real-time WebSocket updates
 * - Volume bars (CE volume + PE volume summed)
 *
 * Data: Combines CE and PE prices at different strikes for Strangle + Greeks analysis
 * - Price = CE price (higher strike) + PE price (lower strike) (strangle premium)
 * - Volume = CE volume + PE volume (combined)
 * - Greeks = Combined Greeks for selling decisions
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { AdvancedTradingChart, ChartData, IndicatorConfig } from '@/components/AdvancedTradingChart';
import { useRealtimePrice } from '@/hooks/useRealtimePrice';
import { useOptionTickStream, type OptionTick } from '@/hooks/useOptionTickStream';
import { useTickToCandle, type Candle } from '@/hooks/useTickToCandle';
import { calculateStrangleGreeks, calculateOptionsGreeks, type OptionsGreeksInput } from '@/lib/indicators/optionsGreeks';

const TIMEFRAMES = [
  { label: '1m', value: 'minute' },
  { label: '3m', value: '3minute' },
  { label: '5m', value: '5minute' },
  { label: '15m', value: '15minute' },
  { label: '30m', value: '30minute' },
  { label: '1h', value: '60minute' },
  { label: '1D', value: 'day' },
];


interface GreeksData {
  theta: number;
  vega: number;
  gamma: number;
  delta: number;
  daysToExpiry: number;
  riskLevel: 'safe' | 'caution' | 'danger';
  ceIV: number | null;
  peIV: number | null;
}

export default function GeekStrangleChartPage() {
  const { user } = useAuth();
  const baseSymbol = 'NIFTY'; // Fixed to NIFTY only
  const [expiry, setExpiry] = useState('JAN');
  const [interval, setInterval] = useState('60minute');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(600);
  const [lookbackDays, setLookbackDays] = useState(25);
  const [spotPrice, setSpotPrice] = useState(25683);
  const [ceStrike, setCeStrike] = useState<number | null>(25800);
  const [peStrike, setPeStrike] = useState<number | null>(25800);
  const [greeks, setGreeks] = useState<GreeksData | null>(null);
  const [ceGreeks, setCeGreeks] = useState<GreeksData | null>(null);
  const [peGreeks, setPeGreeks] = useState<GreeksData | null>(null);
  const [greeksArray, setGreeksArray] = useState<Array<{ time: number; theta: number; vega: number; gamma: number; delta: number }>>([]);
  const [latestCePrice, setLatestCePrice] = useState(0);
  const [latestPePrice, setLatestPePrice] = useState(0);
  const [latestPriceTime, setLatestPriceTime] = useState<number | null>(null);

  const [indicators, setIndicators] = useState<IndicatorConfig>({
    sma: false,
    smaPeriod: 20,
    ema: false,
    emaPeriod: 12,
    rsi: true,
    rsiPeriod: 14,
    adx: false,
    adxPeriod: 14,
    adxThreshold: 25,
    volumeProfile: true,
    volumeProfileVisible: false,
    volumeProfileBins: 150,
    showSignals: true,
    fastEma: 9,
    slowEma: 32,
    useVolumeFilter: false,
    useTimeFilter: false,
    showConsolidation: false,
    consolidationMinDuration: 10,
    consolidationMaxDuration: 100,
  });

  const [showGreeks, setShowGreeks] = useState({
    theta: false,
    vega: false,
    gamma: false,
    delta: false,
  });

  const [spotPriceHistory, setSpotPriceHistory] = useState<number[]>([]);
  const [showCE, setShowCE] = useState(true);
  const [showPE, setShowPE] = useState(true);
  const [rawChartData, setRawChartData] = useState<ChartData[]>([]);
  const [ceOhlcMap, setCeOhlcMap] = useState<Map<number, ChartData>>(new Map());
  const [peOhlcMap, setPeOhlcMap] = useState<Map<number, ChartData>>(new Map());
  const [ceDataMap, setCeDataMap] = useState<Map<number, number>>(new Map());
  const [peDataMap, setPeDataMap] = useState<Map<number, number>>(new Map());

  // Real-time price updates - for spot price display
  const { prices, isConnected } = useRealtimePrice({
    symbols: [baseSymbol + '26JANFUT'], // Use futures to get spot price
  });

  // Stream option ticks for both CE and PE
  const { ticks: optionTicks, isConnected: tickStreamConnected } = useOptionTickStream({
    symbol: baseSymbol,
    expiry,
    ceStrike: ceStrike || Math.round(spotPrice / 100) * 100 + 100,
    peStrike: peStrike || Math.round(spotPrice / 100) * 100 - 100,
    enabled: true,
  });

  // Convert ticks to candles based on interval
  const intervalMinutes = parseInt(interval.replace('minute', '').replace('60', '60').replace('day', '1440') || '1');
  const { currentCandle: latestTickCandle, lastCompletedTime } = useTickToCandle(
    optionTicks.map((tick) => ({
      price: tick.cePrice + tick.pePrice, // Strangle premium = CE + PE
      time: tick.time,
    })),
    {
      intervalMinutes,
      onCandleComplete: (completedCandle) => {
        console.log('[GEEK-STRANGLE] Completed candle from ticks:', completedCandle);
        // Update the chart with the completed candle
        setRawChartData((prev) => {
          const updated = [...prev];
          const existingIndex = updated.findIndex((c) => c.time === completedCandle.time);
          if (existingIndex >= 0) {
            updated[existingIndex] = completedCandle as ChartData;
          } else {
            updated.push(completedCandle as ChartData);
          }
          return updated;
        });
      },
      onCandleUpdate: (updatingCandle) => {
        // Update the chart with the current incomplete candle
        setChartData((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].time === updatingCandle.time) {
            updated[lastIndex] = updatingCandle as ChartData;
          } else if (lastIndex >= 0) {
            // If time changed, add as new candle
            updated.push(updatingCandle as ChartData);
          }
          return updated;
        });
      },
    }
  );

  // Set responsive chart height
  useEffect(() => {
    const updateChartHeight = () => {
      if (typeof window !== 'undefined') {
        const width = window.innerWidth;
        if (width < 640) {
          setChartHeight(400);
        } else if (width < 768) {
          setChartHeight(500);
        } else {
          setChartHeight(600);
        }
      }
    };

    updateChartHeight();
    window.addEventListener('resize', updateChartHeight);
    return () => window.removeEventListener('resize', updateChartHeight);
  }, []);

  // Update spot price from real-time data
  useEffect(() => {
    const futuresSymbol = baseSymbol + '26JANFUT';
    if (prices[futuresSymbol]?.last_price) {
      setSpotPrice(prices[futuresSymbol].last_price);
    }
  }, [prices, baseSymbol]);

  // Filter chart data based on CE/PE visibility
  const filteredChartData = useMemo(() => {
    if (!rawChartData || rawChartData.length === 0) return [];
    if (!showCE && !showPE) return rawChartData; // Show strangle if both hidden
    if (showCE && showPE) return rawChartData; // Show strangle if both visible

    // If maps are empty, return raw data as fallback
    if (ceOhlcMap.size === 0 || peOhlcMap.size === 0) {
      return rawChartData;
    }

    // Show only CE or PE with full OHLC - keep all candles for continuous indicator calculations
    // Use last valid price for missing data to avoid gaps in indicator lines
    let lastCePrice = 0;
    let lastPePrice = 0;

    return rawChartData.map((candle) => {
      if (showCE && !showPE) {
        // Show only CE with proper OHLC
        const ceOhlc = ceOhlcMap.get(candle.time);
        if (ceOhlc && ceOhlc.close > 0) {
          lastCePrice = ceOhlc.close;
          return {
            time: candle.time,
            open: ceOhlc.open,
            high: ceOhlc.high,
            low: ceOhlc.low,
            close: ceOhlc.close,
            volume: ceOhlc.volume,
          };
        }
        // Use last valid price for missing data (hold previous price)
        return {
          time: candle.time,
          open: lastCePrice,
          high: lastCePrice,
          low: lastCePrice,
          close: lastCePrice,
          volume: 0,
        };
      } else if (showPE && !showCE) {
        // Show only PE with proper OHLC
        const peOhlc = peOhlcMap.get(candle.time);
        if (peOhlc && peOhlc.close > 0) {
          lastPePrice = peOhlc.close;
          return {
            time: candle.time,
            open: peOhlc.open,
            high: peOhlc.high,
            low: peOhlc.low,
            close: peOhlc.close,
            volume: peOhlc.volume,
          };
        }
        // Use last valid price for missing data (hold previous price)
        return {
          time: candle.time,
          open: lastPePrice,
          high: lastPePrice,
          low: lastPePrice,
          close: lastPePrice,
          volume: 0,
        };
      }
      return candle;
    });
  }, [rawChartData, showCE, showPE, ceOhlcMap, peOhlcMap]);

  /**
   * Get color based on Greek value signal (Buy/Hold/Sell)
   * Green = SELL (favorable), Orange = HOLD, Red = BUY (unfavorable)
   */
  const getGreekValueColor = (greekType: 'theta' | 'vega' | 'gamma' | 'delta', value: number): string => {
    switch (greekType) {
      case 'theta':
        // Theta: scaled 0-100 with divisor 40 (actual range 5-35+/day)
        // Green (excellent): >20/day → scale >50 on 0-100
        // Orange (good): >12/day → scale >30 on 0-100
        // Red (weak): <12/day → scale <30 on 0-100
        if (value > 50) return '#22C55E'; // Green (SELL - excellent decay >20/day)
        if (value > 30) return '#F97316'; // Orange (HOLD - good decay 12-20/day)
        return '#EF4444'; // Red (BUY - weak decay <12/day)

      case 'vega':
        // Vega: negative is good for sellers
        // Very negative (<-2.0) = Green, Medium (-2.0 to -0.5) = Orange, Positive (>-0.5) = Red
        if (value < -2.0) return '#22C55E'; // Green (SELL)
        if (value < -0.5) return '#F97316'; // Orange (HOLD)
        return '#EF4444'; // Red (BUY)

      case 'gamma':
        // Gamma: low is good for sellers
        // Low (<0.005) = Green, Medium (0.005-0.010) = Orange, High (>0.010) = Red
        if (value < 0.005) return '#22C55E'; // Green (SELL)
        if (value < 0.010) return '#F97316'; // Orange (HOLD)
        return '#EF4444'; // Red (BUY)

      case 'delta':
        // Delta: near zero is good for strangles (neutral)
        // Near zero (-0.2 to 0.2) = Green, Medium (0.2-0.5) = Orange, Far (>0.5 or <-0.5) = Red
        if (value >= -0.2 && value <= 0.2) return '#22C55E'; // Green (SELL/neutral)
        if (value >= -0.5 && value <= 0.5) return '#F97316'; // Orange (HOLD)
        return '#EF4444'; // Red (BUY/directional)

      default:
        return '#6B7280'; // Gray fallback
    }
  };

  /**
   * Calculate Greeks for individual option (CE or PE)
   * IMPORTANT: Pass EITHER cePremium OR pePremium, the other must be 0
   */
  const calculateGreeks = (
    cePremium: number,
    pePremium: number,
    daysToExp: number,
    spotPrice?: number,
    ceStrikeVal?: number,
    peStrikeVal?: number
  ): GreeksData => {
    // Validate inputs - should never use fallback values!
    if (!spotPrice || !ceStrikeVal || !peStrikeVal) {
      console.error('[GEEK-STRANGLE] ⚠️ WARNING: Using fallback values! spot=' + spotPrice + ', ceStrike=' + ceStrikeVal + ', peStrike=' + peStrikeVal);
    }

    // Determine which leg we're calculating
    const isCe = cePremium > 0;
    const isPe = pePremium > 0;

    if (isCe && isPe) {
      // Both provided - calculate combined strangle
      const ceInput: OptionsGreeksInput = {
        spotPrice: spotPrice || 25683,
        strikePrice: ceStrikeVal || 26200,
        marketPrice: cePremium,
        optionType: 'call',
        daysToExpiry: daysToExp,
        historicalSpotPrices: spotPriceHistory,
        riskFreeRate: 0.07,
      };

      const peInput: OptionsGreeksInput = {
        spotPrice: spotPrice || 25683,
        strikePrice: peStrikeVal || 26000,
        marketPrice: pePremium,
        optionType: 'put',
        daysToExpiry: daysToExp,
        historicalSpotPrices: spotPriceHistory,
        riskFreeRate: 0.07,
      };

      const { combined, ce, pe } = calculateStrangleGreeks(ceInput, peInput);

      return {
        theta: parseFloat(combined.theta.toFixed(2)),
        vega: parseFloat(combined.vega.toFixed(2)),
        gamma: parseFloat(combined.gamma.toFixed(4)),
        delta: parseFloat(combined.delta.toFixed(2)),
        daysToExpiry: daysToExp,
        riskLevel: combined.riskLevel,
        ceIV: ce.impliedVolatility ? ce.impliedVolatility * 100 : null,
        peIV: pe.impliedVolatility ? pe.impliedVolatility * 100 : null,
      };
    } else if (isCe) {
      // Only CE provided
      const ceInput: OptionsGreeksInput = {
        spotPrice: spotPrice || 25683,
        strikePrice: ceStrikeVal || 26200,
        marketPrice: cePremium,
        optionType: 'call',
        daysToExpiry: daysToExp,
        historicalSpotPrices: spotPriceHistory,
        riskFreeRate: 0.07,
      };

      const ceGreeks = calculateOptionsGreeks(ceInput);

      return {
        theta: parseFloat(ceGreeks.theta.toFixed(2)),
        vega: parseFloat(ceGreeks.vega.toFixed(2)),
        gamma: parseFloat(ceGreeks.gamma.toFixed(4)),
        delta: parseFloat(ceGreeks.delta.toFixed(2)),
        daysToExpiry: daysToExp,
        riskLevel: ceGreeks.riskLevel,
        ceIV: ceGreeks.impliedVolatility ? ceGreeks.impliedVolatility * 100 : null,
        peIV: null,
      };
    } else {
      // Only PE provided
      const peInput: OptionsGreeksInput = {
        spotPrice: spotPrice || 25683,
        strikePrice: peStrikeVal || 26000,
        marketPrice: pePremium,
        optionType: 'put',
        daysToExpiry: daysToExp,
        historicalSpotPrices: spotPriceHistory,
        riskFreeRate: 0.07,
      };

      const peGreeks = calculateOptionsGreeks(peInput);

      return {
        theta: parseFloat(peGreeks.theta.toFixed(2)),
        vega: parseFloat(peGreeks.vega.toFixed(2)),
        gamma: parseFloat(peGreeks.gamma.toFixed(4)),
        delta: parseFloat(peGreeks.delta.toFixed(2)),
        daysToExpiry: daysToExp,
        riskLevel: peGreeks.riskLevel,
        ceIV: null,
        peIV: peGreeks.impliedVolatility ? peGreeks.impliedVolatility * 100 : null,
      };
    }
  };

  // Helper function to parse expiry string and calculate date
  const parseExpiryDate = (expiryStr: string): Date => {
    const monthMap: { [key: string]: number } = {
      'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3,
      'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7,
      'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };

    // Try weekly format: "13JAN" (day + month)
    const weeklyMatch = expiryStr.match(/^(\d{1,2})([A-Z]{3})$/);
    if (weeklyMatch) {
      const day = parseInt(weeklyMatch[1]);
      const month = monthMap[weeklyMatch[2]];
      return new Date(2026, month, day);
    }

    // Try monthly format: "JAN" (month only) - use last day of month
    const monthlyMatch = expiryStr.match(/^([A-Z]{3})$/);
    if (monthlyMatch) {
      const month = monthMap[monthlyMatch[1]];
      // For monthly options, use the last day of the month
      const lastDay = new Date(2026, month + 1, 0).getDate();
      return new Date(2026, month, lastDay);
    }

    return new Date(); // Fallback
  };

  // Fetch historical data for strangle (CE + PE at different strikes)
  const fetchChartData = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Use UTC dates to avoid timezone issues
      const today = new Date();
      // Convert to UTC date string (YYYY-MM-DD)
      const todayUTC = today.toISOString().split('T')[0];

      const fromDate = new Date(today);
      fromDate.setDate(today.getDate() - lookbackDays);
      const fromUTC = fromDate.toISOString().split('T')[0];

      // Calculate days to expiry
      const expiryDate = parseExpiryDate(expiry);
      const daysToExp = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Determine strikes
      // For strangle, default to ATM (same as straddle) to ensure data exists
      const atmStrike = Math.round(spotPrice / 100) * 100;
      const ceStrikeValue = ceStrike || atmStrike;
      const peStrikeValue = peStrike || atmStrike;

      // For strangle, we need to fetch combined data at each strike
      // Then extract individual CE/PE prices
      // Fetch combined data for CE strike (contains both CE and PE at this strike)
      const ceStrikeParams = new URLSearchParams({
        symbol: baseSymbol,
        expiry,
        strike: ceStrikeValue.toString(),
        userId: user.uid,
        from: fromUTC,
        to: todayUTC,
        interval: interval.replace('minute', ''),
      });

      const ceStrikeFetchUrl = '/api/options/historical?' + ceStrikeParams.toString();
      console.log('[GEEK-STRANGLE] Fetching CE strike data:', ceStrikeFetchUrl);

      let ceStrikeResult, peStrikeResult;

      // Optimization: If CE and PE strikes are the same, reuse the same API response
      if (ceStrikeValue === peStrikeValue) {
        console.log('[GEEK-STRANGLE] CE and PE strikes are same (' + ceStrikeValue + '), reusing single API call');
        const response = await fetch(ceStrikeFetchUrl);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Strike Data: ${error?.error || 'OK'}`);
        }
        const result = await response.json();
        ceStrikeResult = result;
        peStrikeResult = result; // Reuse same data
      } else {
        // Fetch combined data for PE strike (contains both CE and PE at this strike)
        const peStrikeParams = new URLSearchParams({
          symbol: baseSymbol,
          expiry,
          strike: peStrikeValue.toString(),
          userId: user.uid,
          from: fromUTC,
          to: todayUTC,
          interval: interval.replace('minute', ''),
        });

        const peStrikeFetchUrl = '/api/options/historical?' + peStrikeParams.toString();
        console.log('[GEEK-STRANGLE] Fetching PE strike data:', peStrikeFetchUrl);

        const [ceStrikeResponse, peStrikeResponse] = await Promise.all([
          fetch(ceStrikeFetchUrl),
          fetch(peStrikeFetchUrl),
        ]);

        if (!ceStrikeResponse.ok || !peStrikeResponse.ok) {
          const ceError = ceStrikeResponse.ok ? null : await ceStrikeResponse.json();
          const peError = peStrikeResponse.ok ? null : await peStrikeResponse.json();
          throw new Error(`CE Strike Data: ${ceError?.error || 'OK'}, PE Strike Data: ${peError?.error || 'OK'}`);
        }

        ceStrikeResult = await ceStrikeResponse.json();
        peStrikeResult = await peStrikeResponse.json();
      }

      if (ceStrikeResult.success && peStrikeResult.success && ceStrikeResult.data && peStrikeResult.data) {
        // For strangle:
        // - Use CE prices from the higher strike (cePrice field from ceStrike data)
        // - Use PE prices from the lower strike (pePrice field from peStrike data)

        // Create a map for PE strike data by timestamp
        const peStrikeMap = new Map();
        peStrikeResult.data.forEach((candle: any) => {
          peStrikeMap.set(candle.time, candle);
        });

        // Combine strangle data: CE from higher strike + PE from lower strike
        const chartDataArray: ChartData[] = [];
        const ceOhlcMapTemp = new Map();
        const peOhlcMapTemp = new Map();

        ceStrikeResult.data.forEach((ceStrikeCandle: any) => {
          const peStrikeCandle = peStrikeMap.get(ceStrikeCandle.time);
          if (peStrikeCandle) {
            // For strangle, extract individual option prices
            // ceStrike candle contains: CE26000 + PE26000 combined OHLC + individual cePrice/pePrice
            // peStrike candle contains: CE25500 + PE25500 combined OHLC + individual cePrice/pePrice

            const ceClose = ceStrikeCandle.cePrice || 0;
            const peClose = peStrikeCandle.pePrice || 0;

            // Extract individual OHLC by using the ratio of close to combined close
            // For CE strike candle: ratio = cePrice / (cePrice + pePrice)
            const ceRatio = (ceStrikeCandle.cePrice || 0) / Math.max(ceStrikeCandle.close, 1);
            const peRatio = (peStrikeCandle.pePrice || 0) / Math.max(peStrikeCandle.close, 1);

            // Calculate individual OHLC for CE at higher strike
            const ceOpen = ceStrikeCandle.open * ceRatio;
            const ceHigh = ceStrikeCandle.high * ceRatio;
            const ceLow = ceStrikeCandle.low * ceRatio;

            // Calculate individual OHLC for PE at lower strike
            const peOpen = peStrikeCandle.open * peRatio;
            const peHigh = peStrikeCandle.high * peRatio;
            const peLow = peStrikeCandle.low * peRatio;

            // Store individual CE OHLC in map
            ceOhlcMapTemp.set(ceStrikeCandle.time, {
              time: ceStrikeCandle.time,
              open: ceOpen,
              high: ceHigh,
              low: ceLow,
              close: ceClose,
              volume: ceStrikeCandle.ceVolume || 0,
            });

            // Store individual PE OHLC in map
            peOhlcMapTemp.set(ceStrikeCandle.time, {
              time: ceStrikeCandle.time,
              open: peOpen,
              high: peHigh,
              low: peLow,
              close: peClose,
              volume: peStrikeCandle.peVolume || 0,
            });

            // Combine for strangle
            chartDataArray.push({
              time: ceStrikeCandle.time,
              open: ceOpen + peOpen,
              high: ceHigh + peHigh,
              low: ceLow + peLow,
              close: ceClose + peClose,
              volume: (ceStrikeCandle.ceVolume || 0) + (peStrikeCandle.peVolume || 0),
            });
          }
        });

        setRawChartData(chartDataArray);

        // Extract spot price and days to expiry from API responses
        const apiSpotPrice = ceStrikeResult.spotPrice || peStrikeResult.spotPrice || spotPrice;
        const apiDaysToExpiry = ceStrikeResult.daysToExpiry || peStrikeResult.daysToExpiry || daysToExp;

        // Update spot price if API provided it
        if (apiSpotPrice && apiSpotPrice !== spotPrice) {
          setSpotPrice(apiSpotPrice);
        }

        // Build spot price history
        const spotHistory = chartDataArray.map(() => apiSpotPrice);
        setSpotPriceHistory(spotHistory);

        // Store CE and PE prices for each candle for individual Greeks calculation
        const ceDataMap = new Map();
        const peDataMap = new Map();

        ceStrikeResult.data.forEach((ceStrikeCandle: any) => {
          ceDataMap.set(ceStrikeCandle.time, ceStrikeCandle.cePrice || 0);
        });

        peStrikeResult.data.forEach((peStrikeCandle: any) => {
          peDataMap.set(peStrikeCandle.time, peStrikeCandle.pePrice || 0);
        });

        // Store maps in state for filtering
        setCeOhlcMap(ceOhlcMapTemp);
        setPeOhlcMap(peOhlcMapTemp);
        setCeDataMap(ceDataMap);
        setPeDataMap(peDataMap);

        // Calculate Greeks for each candle
        // TODO: COMMENTED OUT - Testing if chart works without Greeks
        // const greeksDataArray = chartDataArray.map((candle, index) => {
        //   // Get ACTUAL CE and PE prices from maps (not split)
        //   const ccePrice = ceDataMap.get(candle.time) || 0;
        //   const ppePrice = peDataMap.get(candle.time) || 0;
        //   const previousCePrice = index > 0 ? ceDataMap.get(chartDataArray[index - 1].time) || ccePrice : ccePrice;
        //   const previousPePrice = index > 0 ? peDataMap.get(chartDataArray[index - 1].time) || ppePrice : ppePrice;
        //
        //   // Calculate daysToExp for THIS candle's timestamp (decreases over time)
        //   const candleDate = new Date(candle.time * 1000);
        //   const expiryDate = parseExpiryDate(expiry);
        //   const daysToExpCandle = Math.ceil((expiryDate.getTime() - candleDate.getTime()) / (1000 * 60 * 60 * 24));
        //
        //   // Pass ACTUAL CE and PE prices, not combined and split
        //   const greekData = calculateGreeks(ccePrice, ppePrice, daysToExpCandle, apiSpotPrice, ceStrikeValue, peStrikeValue);
        //
        //   // Normalize Greeks to 0-100 scale based on REAL Black-Scholes ranges
        //   // Ranges researched for short-dated NIFTY options (5-14 DTE)
        //
        //   // THETA: Actual range observed for NIFTY options (5-35+ per day)
        //   // Short-dated (5 DTE): 5-10/day
        //   // Medium (7-10 DTE): 8-15/day
        //   // Monthly (20-30 DTE): 15-35+/day
        //   // Divide by 40 to get 0-100 scale: 5 → 12, 10 → 25, 20 → 50, 35 → 87
        //   const thetaNormalized = Math.min(100, Math.max(0, (Math.abs(greekData.theta) / 40.0) * 100));
        //
        //   // VEGA: Range 0.5 to 15 per 1% IV change
        //   // At 14 DTE: 5-10, At 7 DTE: 2-4, At 5 DTE: 1-2, At 1 DTE: <0.5
        //   // Divide by 15 to get 0-100 scale: 1.0 → 7, 5.0 → 33, 10.0 → 67, 15.0 → 100
        //   const vegaNormalized = Math.min(100, Math.max(0, (greekData.vega / 15.0) * 100));
        //
        //   // GAMMA: Range 0.0005 to 0.015 per point move
        //   // At 14 DTE: 0.001, At 7 DTE: 0.002, At 5 DTE: 0.005, At 1 DTE: 0.015
        //   // Divide by 0.015 to get 0-100 scale: 0.005 → 33, 0.01 → 67, 0.015 → 100
        //   // Danger zone: >0.008 (>53 on scale), Safe: <0.004 (<27 on scale)
        //   const gammaNormalized = Math.min(100, Math.max(0, (greekData.gamma / 0.015) * 100));
        //
        //   // DELTA: Range -1 to +1 (ATM straddle/strangle should be ±0.5 = neutral)
        //   // -1.0 → 0, 0.0 → 50 (neutral), +1.0 → 100
        //   // For straddle: delta close to 50 is ideal (balanced long/short)
        //   const deltaNormalized = Math.min(100, Math.max(0, ((greekData.delta + 1) / 2) * 100));
        //
        //   return {
        //     time: candle.time,
        //     theta: thetaNormalized,
        //     vega: vegaNormalized,
        //     gamma: gammaNormalized,
        //     delta: deltaNormalized,
        //   };
        // });
        setGreeksArray([]);

        // Calculate Greeks based on latest prices (for panel display)
        const latestCandle = chartDataArray[chartDataArray.length - 1];
        const latestCePrice = ceDataMap.get(latestCandle.time) || 0;
        const latestPePrice = peDataMap.get(latestCandle.time) || 0;

        const previousCandle = chartDataArray.length > 1 ? chartDataArray[chartDataArray.length - 2] : latestCandle;
        const previousCePrice = ceDataMap.get(previousCandle.time) || latestCePrice;
        const previousPePrice = peDataMap.get(previousCandle.time) || latestPePrice;

        // Store CE and PE prices in state for display
        setLatestCePrice(latestCePrice);
        setLatestPePrice(latestPePrice);
        setLatestPriceTime(latestCandle.time);

        // Individual CE and PE Greeks (for detailed breakdown)
        console.log(`[GEEK-STRANGLE] Greeks inputs: CE=${latestCePrice}, PE=${latestPePrice}, DTE=${apiDaysToExpiry}, Spot=${apiSpotPrice}, CE_Strike=${ceStrikeValue}, PE_Strike=${peStrikeValue}`);
        const ceGreeksCalc = calculateGreeks(latestCePrice, 0, apiDaysToExpiry, apiSpotPrice, ceStrikeValue, ceStrikeValue);
        const peGreeksCalc = calculateGreeks(0, latestPePrice, apiDaysToExpiry, apiSpotPrice, peStrikeValue, peStrikeValue);
        console.log(`[GEEK-STRANGLE] CE Greeks: theta=${ceGreeksCalc.theta.toFixed(2)}, gamma=${ceGreeksCalc.gamma.toFixed(4)}, vega=${ceGreeksCalc.vega.toFixed(2)}, IV=${ceGreeksCalc.ceIV}%`);
        console.log(`[GEEK-STRANGLE] PE Greeks: theta=${peGreeksCalc.theta.toFixed(2)}, gamma=${peGreeksCalc.gamma.toFixed(4)}, vega=${peGreeksCalc.vega.toFixed(2)}, IV=${peGreeksCalc.peIV}%`);

        // Combined strangle Greeks = CE + PE (sum of individual Greeks)
        const combinedTheta = ceGreeksCalc.theta + peGreeksCalc.theta;
        const combinedGamma = ceGreeksCalc.gamma + peGreeksCalc.gamma;
        const combinedVega = ceGreeksCalc.vega + peGreeksCalc.vega;
        const combinedDelta = ceGreeksCalc.delta + peGreeksCalc.delta;
        const combinedCeIV = ceGreeksCalc.ceIV;
        const combinedPeIV = peGreeksCalc.peIV;
        const combinedRiskLevel = ceGreeksCalc.riskLevel === 'danger' || peGreeksCalc.riskLevel === 'danger'
          ? 'danger'
          : ceGreeksCalc.riskLevel === 'caution' || peGreeksCalc.riskLevel === 'caution'
            ? 'caution'
            : 'safe';

        // Negate theta because we're SELLING (short) the strangle
        // Black-Scholes gives negative theta for long positions
        // For short positions, negate to show positive theta (seller profit from decay)
        setGreeks({
          theta: -combinedTheta,
          vega: combinedVega,
          gamma: combinedGamma,
          delta: combinedDelta,
          daysToExpiry: apiDaysToExpiry,
          riskLevel: combinedRiskLevel,
          ceIV: combinedCeIV,
          peIV: combinedPeIV,
        });
        setCeGreeks({
          theta: -ceGreeksCalc.theta,
          vega: ceGreeksCalc.vega,
          gamma: ceGreeksCalc.gamma,
          delta: ceGreeksCalc.delta,
          daysToExpiry: apiDaysToExpiry,
          riskLevel: ceGreeksCalc.riskLevel,
          ceIV: ceGreeksCalc.ceIV,
          peIV: ceGreeksCalc.peIV,
        });
        setPeGreeks({
          theta: -peGreeksCalc.theta,
          vega: peGreeksCalc.vega,
          gamma: peGreeksCalc.gamma,
          delta: peGreeksCalc.delta,
          daysToExpiry: apiDaysToExpiry,
          riskLevel: peGreeksCalc.riskLevel,
          ceIV: peGreeksCalc.ceIV,
          peIV: peGreeksCalc.peIV,
        });
      } else {
        throw new Error('Failed to fetch option data');
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Geek strangle chart data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load data on symbol or interval change (NOT on spotPrice - avoid constant refreshes)
  useEffect(() => {
    if (!user || !expiry) return;

    console.log('[GEEK-STRANGLE] useEffect triggered - fetching chart data');
    fetchChartData();
  }, [user, expiry, interval, lookbackDays, ceStrike, peStrike]);

  // Real-time candle update effect: Update Greeks when ticks arrive
  useEffect(() => {
    if (!optionTicks || optionTicks.length === 0 || !greeks) return;

    // Get the latest tick data
    const latestTick = optionTicks[optionTicks.length - 1];
    const newCePrice = latestTick.cePrice;
    const newPePrice = latestTick.pePrice;

    // Update the latest prices
    setLatestCePrice(newCePrice);
    setLatestPePrice(newPePrice);
    setLatestPriceTime(latestTick.time);

    // Recalculate Greeks with new prices
    const atmStrike = Math.round(spotPrice / 100) * 100;
    const ceStrikeValue = ceStrike || atmStrike + 100;
    const peStrikeValue = peStrike || atmStrike - 100;

    const ceGreeksCalc = calculateGreeks(newCePrice, 0, greeks.daysToExpiry, spotPrice, ceStrikeValue, ceStrikeValue);
    const peGreeksCalc = calculateGreeks(0, newPePrice, greeks.daysToExpiry, spotPrice, peStrikeValue, peStrikeValue);

    const combinedTheta = ceGreeksCalc.theta + peGreeksCalc.theta;
    const combinedGamma = ceGreeksCalc.gamma + peGreeksCalc.gamma;
    const combinedVega = ceGreeksCalc.vega + peGreeksCalc.vega;
    const combinedDelta = ceGreeksCalc.delta + peGreeksCalc.delta;

    const combinedRiskLevel =
      ceGreeksCalc.riskLevel === 'danger' || peGreeksCalc.riskLevel === 'danger'
        ? 'danger'
        : ceGreeksCalc.riskLevel === 'caution' || peGreeksCalc.riskLevel === 'caution'
          ? 'caution'
          : 'safe';

    // Update Greeks with new calculations
    setGreeks({
      theta: -combinedTheta, // Negate because we're selling (short)
      vega: combinedVega,
      gamma: combinedGamma,
      delta: combinedDelta,
      daysToExpiry: greeks.daysToExpiry,
      riskLevel: combinedRiskLevel,
      ceIV: ceGreeksCalc.ceIV,
      peIV: peGreeksCalc.peIV,
    });

    setCeGreeks({
      theta: -ceGreeksCalc.theta,
      vega: ceGreeksCalc.vega,
      gamma: ceGreeksCalc.gamma,
      delta: ceGreeksCalc.delta,
      daysToExpiry: greeks.daysToExpiry,
      riskLevel: ceGreeksCalc.riskLevel,
      ceIV: ceGreeksCalc.ceIV,
      peIV: ceGreeksCalc.peIV,
    });

    setPeGreeks({
      theta: -peGreeksCalc.theta,
      vega: peGreeksCalc.vega,
      gamma: peGreeksCalc.gamma,
      delta: peGreeksCalc.delta,
      daysToExpiry: greeks.daysToExpiry,
      riskLevel: peGreeksCalc.riskLevel,
      ceIV: peGreeksCalc.ceIV,
      peIV: peGreeksCalc.peIV,
    });

    console.log('[GEEK-STRANGLE] Real-time Greeks updated from ticks:', { theta: -combinedTheta, gamma: combinedGamma, vega: combinedVega });
  }, [optionTicks]);

  const toggleIndicator = (indicator: keyof IndicatorConfig) => {
    setIndicators((prev) => ({
      ...prev,
      [indicator]: !prev[indicator],
    }));
  };

  const updateIndicatorPeriod = (indicator: 'smaPeriod' | 'emaPeriod' | 'rsiPeriod' | 'volumeProfileBins' | 'fastEma' | 'slowEma', value: number) => {
    setIndicators((prev) => ({
      ...prev,
      [indicator]: value,
    }));
  };

  const atmStrike = Math.round(spotPrice / 100) * 100;
  const ceStrikeValue = ceStrike || atmStrike + 100;
  const peStrikeValue = peStrike || atmStrike - 100;
  const displaySymbol = `${baseSymbol}${expiry}(${ceStrikeValue}CE/${peStrikeValue}PE)`;

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'safe':
        return 'bg-green-50 border-green-200';
      case 'caution':
        return 'bg-yellow-50 border-yellow-200';
      case 'danger':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'safe':
        return '✅ SAFE TO SELL';
      case 'caution':
        return '⚠️ CAUTION - Close Soon';
      case 'danger':
        return '🔴 DANGER - Close Position';
      default:
        return 'NEUTRAL';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Geek Strangle (CE + PE with Greeks)
          </h1>
          {/* Real-time Status - Show both spot and option tick streams */}
          <div className="flex items-center gap-3">
            {/* Spot Price Stream */}
            <div className={'flex items-center gap-2 px-3 py-1 rounded-lg ' +
              (isConnected ? 'bg-blue-50' : 'bg-gray-50')}>
              <div className={'w-2 h-2 rounded-full ' +
                (isConnected ? 'bg-blue-500 animate-pulse' : 'bg-gray-500')}></div>
              <span className={'text-xs font-medium ' +
                (isConnected ? 'text-blue-700' : 'text-gray-700')}>
                Spot {isConnected ? '●' : '○'}
              </span>
            </div>
            {/* Option Ticks Stream */}
            <div className={'flex items-center gap-2 px-3 py-1 rounded-lg ' +
              (tickStreamConnected ? 'bg-green-50' : 'bg-orange-50')}>
              <div className={'w-2 h-2 rounded-full ' +
                (tickStreamConnected ? 'bg-green-500 animate-pulse' : 'bg-orange-500')}></div>
              <span className={'text-xs font-medium ' +
                (tickStreamConnected ? 'text-green-700' : 'text-orange-700')}>
                Ticks {tickStreamConnected ? 'LIVE' : (optionTicks.length > 0 ? 'buffering' : 'waiting')}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-3 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Expiry Selector */}
            <div className="flex-shrink-0">
              <select
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value);
                  console.log('[GEEK-STRANGLE] Changed expiry to:', e.target.value);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm h-10"
              >
                <optgroup label="Weekly Expiries (Tuesdays)">
                  <option value="13JAN">13 JAN (Tuesday)</option>
                  <option value="20JAN">20 JAN (Tuesday)</option>
                </optgroup>
                <optgroup label="Monthly Expiries">
                  <option value="JAN">JAN (Monthly)</option>
                  <option value="FEB">FEB (Monthly)</option>
                  <option value="MAR">MAR (Monthly)</option>
                </optgroup>
              </select>
            </div>

            {/* Timeframe Selector */}
            <div className="flex-shrink-0">
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm h-10"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf.value} value={tf.value}>
                    {tf.label}
                  </option>
                ))}
              </select>
            </div>

            {/* CE Strike Selector */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 whitespace-nowrap font-semibold">CE:</label>
                <div className="flex items-center h-10 bg-white rounded-lg border border-gray-300 px-2">
                  <button
                    onClick={() => setCeStrike(prev => (prev ? prev - 100 : ceStrikeValue - 100))}
                    className="px-2 py-0 text-red-600 hover:bg-red-50 rounded text-lg font-bold"
                    title="Decrease CE strike by 100"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    value={ceStrike || ceStrikeValue}
                    onChange={(e) => setCeStrike(e.target.value ? parseInt(e.target.value) : null)}
                    step="100"
                    className="w-20 text-center border-0 text-gray-900 text-sm font-semibold focus:outline-none bg-transparent"
                  />

                  <button
                    onClick={() => setCeStrike(prev => (prev ? prev + 100 : ceStrikeValue + 100))}
                    className="px-2 py-0 text-green-600 hover:bg-green-50 rounded text-lg font-bold"
                    title="Increase CE strike by 100"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* PE Strike Selector */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 whitespace-nowrap font-semibold">PE:</label>
                <div className="flex items-center h-10 bg-white rounded-lg border border-gray-300 px-2">
                  <button
                    onClick={() => setPeStrike(prev => (prev ? prev - 100 : peStrikeValue - 100))}
                    className="px-2 py-0 text-red-600 hover:bg-red-50 rounded text-lg font-bold"
                    title="Decrease PE strike by 100"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    value={peStrike || peStrikeValue}
                    onChange={(e) => setPeStrike(e.target.value ? parseInt(e.target.value) : null)}
                    step="100"
                    className="w-20 text-center border-0 text-gray-900 text-sm font-semibold focus:outline-none bg-transparent"
                  />

                  <button
                    onClick={() => setPeStrike(prev => (prev ? prev + 100 : peStrikeValue + 100))}
                    className="px-2 py-0 text-green-600 hover:bg-green-50 rounded text-lg font-bold"
                    title="Increase PE strike by 100"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Lookback Days */}
            <div className="flex-shrink-0 flex items-center gap-2">
              <span className="text-xs text-gray-600 whitespace-nowrap">Lookback:</span>
              <input
                type="number"
                min="1"
                max="100"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Math.max(1, Math.min(100, parseInt(e.target.value) || 50)))}
                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm h-10"
              />
              <span className="text-xs text-gray-500">days</span>
            </div>

            {/* CE/PE Filter */}
            <div className="flex-shrink-0 flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCE}
                  onChange={(e) => setShowCE(e.target.checked)}
                  className="w-4 h-4 text-green-600 rounded focus:ring-2"
                />
                <span className="text-xs font-semibold text-gray-700">Show CE</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPE}
                  onChange={(e) => setShowPE(e.target.checked)}
                  className="w-4 h-4 text-red-600 rounded focus:ring-2"
                />
                <span className="text-xs font-semibold text-gray-700">Show PE</span>
              </label>
            </div>
          </div>

          {/* Indicators Section */}
          <div className="pt-4">
            <div className="p-3 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Show Buy/Sell Signals */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showSignals"
                    checked={indicators.showSignals}
                    onChange={() => toggleIndicator('showSignals')}
                    className="w-4 h-4 text-green-600 rounded focus:ring-2"
                  />
                  <label htmlFor="showSignals" className="text-sm font-bold text-gray-800">
                    Buy/Sell Signals
                  </label>
                </div>

                {/* Fast EMA */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Fast EMA</label>
                  <input
                    type="number"
                    value={indicators.fastEma}
                    onChange={(e) => updateIndicatorPeriod('fastEma', parseInt(e.target.value))}
                    disabled={!indicators.showSignals}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
                    min="1"
                    max="50"
                  />
                  <span className="text-xs text-gray-500">(9)</span>
                </div>

                {/* Slow EMA */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Slow EMA</label>
                  <input
                    type="number"
                    value={indicators.slowEma}
                    onChange={(e) => updateIndicatorPeriod('slowEma', parseInt(e.target.value))}
                    disabled={!indicators.showSignals}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
                    min="1"
                    max="200"
                  />
                  <span className="text-xs text-gray-500">(32)</span>
                </div>

                {/* RSI */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="rsi"
                    checked={indicators.rsi}
                    onChange={() => toggleIndicator('rsi')}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-2"
                  />
                  <label htmlFor="rsi" className="text-sm font-medium text-gray-700">
                    RSI
                  </label>
                  <input
                    type="number"
                    value={indicators.rsiPeriod}
                    onChange={(e) => updateIndicatorPeriod('rsiPeriod', parseInt(e.target.value))}
                    disabled={!indicators.rsi}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
                    min="1"
                    max="100"
                  />
                  <span className="text-xs text-gray-500">(14)</span>
                </div>
              </div>
            </div>
          </div>


        </div>

        {/* Greeks Panel */}
        {greeks && !loading && (
          <div className={`rounded-lg border p-4 mb-4 ${getRiskColor(greeks.riskLevel)}`}>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {/* Theta Box with Checkbox */}
              <div className="bg-white rounded p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="overlayTheta"
                    checked={showGreeks.theta}
                    onChange={() => setShowGreeks(prev => ({ ...prev, theta: !prev.theta }))}
                    className="w-4 h-4 text-green-600 rounded cursor-pointer"
                  />
                  <label htmlFor="overlayTheta" className="text-xs font-semibold cursor-pointer" style={{ color: '#4CAF50' }}>
                    θ Theta
                  </label>
                </div>
                <p className="text-lg font-bold" style={{ color: getGreekValueColor('theta', greeks.theta) }}>+{greeks.theta.toFixed(2)}/day</p>
                {ceGreeks && peGreeks && (
                  <p className="text-xs text-gray-500 mt-1">
                    (CE: {ceGreeks.theta.toFixed(2)}, PE: {peGreeks.theta.toFixed(2)})
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">Time Decay (seller profit)</p>
              </div>

              {/* Vega Box with Checkbox */}
              <div className="bg-white rounded p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="overlayVega"
                    checked={showGreeks.vega}
                    onChange={() => setShowGreeks(prev => ({ ...prev, vega: !prev.vega }))}
                    className="w-4 h-4 text-red-600 rounded cursor-pointer"
                  />
                  <label htmlFor="overlayVega" className="text-xs font-semibold cursor-pointer" style={{ color: '#F44336' }}>
                    ν Vega
                  </label>
                </div>
                <p className="text-lg font-bold" style={{ color: getGreekValueColor('vega', greeks.vega) }}>{greeks.vega.toFixed(2)}/point</p>
                {ceGreeks && peGreeks && (
                  <p className="text-xs text-gray-500 mt-1">
                    (CE: {ceGreeks.vega.toFixed(2)}, PE: {peGreeks.vega.toFixed(2)})
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">Volatility Risk (seller loss)</p>
              </div>

              {/* Gamma Box with Checkbox */}
              <div className="bg-white rounded p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="overlayGamma"
                    checked={showGreeks.gamma}
                    onChange={() => setShowGreeks(prev => ({ ...prev, gamma: !prev.gamma }))}
                    className="w-4 h-4 text-orange-600 rounded cursor-pointer"
                  />
                  <label htmlFor="overlayGamma" className="text-xs font-semibold cursor-pointer" style={{ color: '#FF9800' }}>
                    Γ Gamma
                  </label>
                </div>
                <p className="text-lg font-bold" style={{ color: getGreekValueColor('gamma', greeks.gamma) }}>+{greeks.gamma.toFixed(4)}</p>
                {ceGreeks && peGreeks && (
                  <p className="text-xs text-gray-500 mt-1">
                    (CE: {ceGreeks.gamma.toFixed(4)}, PE: {peGreeks.gamma.toFixed(4)})
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">Directional Risk</p>
              </div>

              {/* Delta Box with Checkbox */}
              <div className="bg-white rounded p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="overlayDelta"
                    checked={showGreeks.delta}
                    onChange={() => setShowGreeks(prev => ({ ...prev, delta: !prev.delta }))}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                  <label htmlFor="overlayDelta" className="text-xs font-semibold cursor-pointer" style={{ color: '#2196F3' }}>
                    Δ Delta
                  </label>
                </div>
                <p className="text-lg font-bold" style={{ color: getGreekValueColor('delta', greeks.delta) }}>{greeks.delta > 0 ? '+' : ''}{greeks.delta.toFixed(2)}</p>
                {ceGreeks && peGreeks && (
                  <p className="text-xs text-gray-500 mt-1">
                    (CE: {ceGreeks.delta > 0 ? '+' : ''}{ceGreeks.delta.toFixed(2)}, PE: {peGreeks.delta > 0 ? '+' : ''}{peGreeks.delta.toFixed(2)})
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">Neutral (~0)</p>
              </div>

            </div>

            {/* Strategy Hint - Professional Sell Signal Formula (Compact) */}
            {(() => {
              const avgIV = greeks.ceIV && greeks.peIV ? (greeks.ceIV + greeks.peIV) / 2 : 0;
              const premium = latestCePrice + latestPePrice;
              const thetaPremiumRatio = premium > 0 ? (greeks.theta / premium) * 100 : 0;
              const totalTheta = greeks.theta * greeks.daysToExpiry;
              const maxVegaLoss = greeks.vega * (18 - avgIV);
              const riskRewardRatio = maxVegaLoss > 0 ? totalTheta / maxVegaLoss : 0;

              const check1 = avgIV > 15;
              const check2 = thetaPremiumRatio > 2;
              const check3 = greeks.gamma < 0.005;
              const check4 = greeks.daysToExpiry >= 14 && greeks.daysToExpiry <= 30;
              const passedChecks = [check1, check2, check3, check4].filter(Boolean).length;

              return (
                <div className={`mt-4 p-4 rounded-lg border-2 ${
                  passedChecks >= 4 && riskRewardRatio > 1.5
                    ? 'bg-green-50 border-green-300'
                    : passedChecks >= 3
                    ? 'bg-yellow-50 border-yellow-300'
                    : 'bg-red-50 border-red-300'
                }`}>
                  <p className={`text-sm font-bold mb-2 ${
                    passedChecks >= 4 && riskRewardRatio > 1.5
                      ? 'text-green-800'
                      : passedChecks >= 3
                      ? 'text-yellow-900'
                      : 'text-red-800'
                  }`}>
                    {passedChecks >= 4 && riskRewardRatio > 1.5 ? '✅ STRONG SELL' : passedChecks >= 3 ? '⚠️ CAUTION' : '❌ DO NOT SELL'}
                  </p>

                  <div className="font-mono text-xs text-gray-700 space-y-1 mb-2">
                    <p>SELL = (IV&gt;15%) × (θ/P&gt;2%) × (γ&lt;0.005) × (DTE∈[14,30])</p>
                    <p>= ({avgIV.toFixed(0)} &gt; 15?) × ({thetaPremiumRatio.toFixed(0)}% &gt; 2%) × ({greeks.gamma.toFixed(4)} &lt; 0.005) × ({greeks.daysToExpiry}∈[14,30])</p>
                    <p>= <span className={check1 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{check1 ? 'Y' : 'N'}</span> × <span className={check2 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{check2 ? 'Y' : 'N'}</span> × <span className={check3 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{check3 ? 'Y' : 'N'}</span> × <span className={check4 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{check4 ? 'Y' : 'N'}</span> | R:R = {riskRewardRatio.toFixed(2)} {riskRewardRatio > 1.5 ? '✓' : '✗'} ({passedChecks}/4)</p>
                  </div>

                  <p className={`text-xs ${
                    passedChecks >= 4 && riskRewardRatio > 1.5
                      ? 'text-green-800'
                      : passedChecks >= 3
                      ? 'text-yellow-900'
                      : 'text-red-800'
                  }`}>
                    {passedChecks >= 4 && riskRewardRatio > 1.5
                      ? 'All checks ✓ • Good R:R • Ready to sell'
                      : passedChecks >= 3
                      ? `${!check1 ? 'IV low • ' : ''}${riskRewardRatio <= 1.5 ? 'R:R weak • ' : ''}Wait for improvement`
                      : `${!check1 ? 'IV low • ' : ''}${!check2 ? 'θ/P low • ' : ''}${!check3 ? 'γ high • ' : ''}${!check4 ? 'DTE bad • ' : ''}Poor conditions`}
                  </p>
                </div>
              );
            })()}

          </div>
        )}

        {/* Chart */}
        {loading && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Loading geek strangle chart data...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">❌ {error}</p>
          </div>
        )}

        {!loading && !error && rawChartData.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 md:p-6">
            {/* Consolidated Info Box: DTE + IV + Premium (Above Chart) */}
            {greeks && (
              <div className="bg-gray-50 rounded px-3 py-2 border border-gray-200 text-xs font-mono mb-3">
                <p className="text-gray-700">
                  <span className="font-bold">DTE:</span> <span className="text-purple-600 font-bold">{greeks.daysToExpiry}</span>
                  <span className="mx-3">|</span>
                  <span className="font-bold">IV:</span> <span className="text-green-600 font-bold">{greeks.ceIV && greeks.peIV ? ((greeks.ceIV + greeks.peIV) / 2).toFixed(1) : 'N/A'}%</span>
                  <span className="text-gray-500"> (C:{greeks.ceIV?.toFixed(1)}% P:{greeks.peIV?.toFixed(1)}%)</span>
                  <span className="mx-3">|</span>
                  <span className="font-bold">Premium:</span> <span className="text-blue-600 font-bold">{(latestCePrice + latestPePrice).toFixed(0)}</span>
                  <span className="text-gray-500"> (C:{latestCePrice.toFixed(0)} P:{latestPePrice.toFixed(0)})</span>
                  <span className="mx-3">|</span>
                  <span className="font-bold">Spot:</span> <span className="text-orange-600 font-bold">{spotPrice.toFixed(0)}</span>
                </p>
              </div>
            )}

            <div className="mb-3 md:mb-4">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">{displaySymbol} Strangle Premium</h2>
              <p className="text-xs sm:text-sm text-gray-600">
                <strong>Price:</strong> CE (Higher Strike) + PE (Lower Strike) | <strong>Volume:</strong> CE + PE (Combined)
                <span className="ml-2 sm:ml-4">Interval: <span className="font-semibold">{interval}</span></span>
                <span className="ml-2 sm:ml-4">{rawChartData.length} candles</span>
                <span className="ml-2 sm:ml-4 text-green-600 font-semibold">
                  {tickStreamConnected ? '✓ Real-time tick updates' : '○ Historical data'}
                </span>
              </p>
            </div>
            <AdvancedTradingChart
              data={filteredChartData}
              symbol={displaySymbol}
              interval={interval}
              indicators={indicators}
              height={chartHeight}
              greeksData={greeksArray}
              showGreeks={showGreeks}
            />
          </div>
        )}

        {/* Strategy Information */}
        {!loading && !error && rawChartData.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-3">
              <p className="text-xs text-gray-700 leading-relaxed">
                <span className="font-semibold">💡 Geek Strangle Strategy:</span>
                <br />
                <strong>Position:</strong> CE at {ceStrikeValue} | PE at {peStrikeValue} (Width: {ceStrikeValue - peStrikeValue} points)
                <br />
                <strong>When to SELL:</strong> Theta &gt; 12/day (good), Vega 5-20, Gamma &lt; 0.008, DTE 7-30
                <br />
                <strong>When to CLOSE:</strong> 50% profit reached, OR Gamma &gt; 0.008, OR DTE ≤ 7
                <br />
                <strong>Greeks Guide:</strong> Monitor theta decay vs vega risk. Close before gamma explodes near expiry.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && rawChartData.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-600">No chart data available. Try a different symbol or timeframe.</p>
          </div>
        )}
      </div>
    </div>
  );
}

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

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { AdvancedTradingChart, ChartData, IndicatorConfig } from '@/components/AdvancedTradingChart';
import { useRealtimePrice } from '@/hooks/useRealtimePrice';

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
}

export default function GeekStrangleChartPage() {
  const { user } = useAuth();
  const baseSymbol = 'NIFTY'; // Fixed to NIFTY only
  const [expiry, setExpiry] = useState('13JAN');
  const [interval, setInterval] = useState('60minute');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(600);
  const [lookbackDays, setLookbackDays] = useState(25);
  const [spotPrice, setSpotPrice] = useState(25683);
  const [ceStrike, setCeStrike] = useState<number | null>(null);
  const [peStrike, setPeStrike] = useState<number | null>(null);
  const [greeks, setGreeks] = useState<GreeksData | null>(null);
  const [ceGreeks, setCeGreeks] = useState<GreeksData | null>(null);
  const [peGreeks, setPeGreeks] = useState<GreeksData | null>(null);
  const [greeksArray, setGreeksArray] = useState<Array<{ time: number; theta: number; vega: number; gamma: number; delta: number }>>([]);

  const [indicators, setIndicators] = useState<IndicatorConfig>({
    sma: false,
    smaPeriod: 20,
    ema: false,
    emaPeriod: 12,
    rsi: false,
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
    theta: true,
    vega: true,
    gamma: true,
    delta: false,
  });

  // Real-time price updates - for spot price display
  const { prices, isConnected } = useRealtimePrice({
    symbols: [baseSymbol + '26JANFUT'], // Use futures to get spot price
  });

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

  /**
   * Get color based on Greek value signal (Buy/Hold/Sell)
   * Green = SELL (favorable), Orange = HOLD, Red = BUY (unfavorable)
   */
  const getGreekValueColor = (greekType: 'theta' | 'vega' | 'gamma' | 'delta', value: number): string => {
    switch (greekType) {
      case 'theta':
        // Theta: positive is good for sellers
        // High theta (>1.5) = Green, Medium (0.5-1.5) = Orange, Low (<0.5) = Red
        if (value > 1.5) return '#22C55E'; // Green (SELL)
        if (value > 0.5) return '#F97316'; // Orange (HOLD)
        return '#EF4444'; // Red (BUY)

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
   * Calculate Greeks for strangle using simplified approach
   * Based on current premium, historical volatility, and days to expiry
   */
  const calculateGreeks = (
    premium: number,
    previousPremium: number,
    daysToExp: number,
    spotPrice?: number,
    strikePrice?: number
  ): GreeksData => {
    // Theta: Daily premium decay (positive for sellers)
    // Removed Math.max clamping to allow true Greeks summation property
    // Individual Greeks should sum to combined Greeks without artificial inflation
    const dailyDecay = premium * 0.002;
    const theta = dailyDecay;

    // Vega: Volatility sensitivity (negative for sellers - higher vol = higher cost)
    // Also responds to premium changes (higher premium = implied vol increase)
    const basVega = -(1.5 + (15 - Math.min(daysToExp, 15)) * 0.3);
    const premiumChangeInfluence = (premium - previousPremium) * 0.01; // Premium changes affect vega
    const vega = basVega + premiumChangeInfluence;

    // Gamma: Directional risk (positive ATM, increases near expiry)
    // Also responds to premium volatility (larger swings = higher gamma)
    const baseGamma = 0.001 + (0.015 - daysToExp * 0.0006);
    const volatilityInfluence = Math.abs(premium - previousPremium) * 0.00001;
    const gamma = baseGamma + volatilityInfluence;

    // Delta: Rate of change of premium (how much premium changes per small price move)
    // Positive delta = premium increasing (up move), Negative = premium decreasing (down move)
    const premiumChange = premium - previousPremium;
    const premiumChangePercent = premiumChange / Math.max(previousPremium, 1);
    const delta = Math.max(-1, Math.min(1, premiumChangePercent * 20)); // Scale to -1 to 1

    // Risk level assessment
    let riskLevel: 'safe' | 'caution' | 'danger' = 'safe';
    if (daysToExp <= 7) {
      riskLevel = 'danger';
    } else if (daysToExp <= 14) {
      riskLevel = 'caution';
    } else {
      riskLevel = 'safe';
    }

    return {
      theta: parseFloat(theta.toFixed(2)),
      vega: parseFloat(vega.toFixed(2)),
      gamma: parseFloat(gamma.toFixed(4)),
      delta: parseFloat(delta.toFixed(2)),
      daysToExpiry: daysToExp,
      riskLevel,
    };
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
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - lookbackDays);

      // Calculate days to expiry
      const expiryDate = parseExpiryDate(expiry);
      const daysToExp = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Determine strikes
      const atmStrike = Math.round(spotPrice / 100) * 100;
      const ceStrikeValue = ceStrike || atmStrike + 100;
      const peStrikeValue = peStrike || atmStrike - 100;

      // For strangle, we need to fetch combined data at each strike
      // Then extract individual CE/PE prices
      // Fetch combined data for CE strike (contains both CE and PE at this strike)
      const ceStrikeParams = new URLSearchParams({
        symbol: baseSymbol,
        expiry,
        strike: ceStrikeValue.toString(),
        userId: user.uid,
        from: from.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
        interval: interval.replace('minute', ''),
      });

      const ceStrikeFetchUrl = '/api/options/historical?' + ceStrikeParams.toString();
      console.log('[GEEK-STRANGLE] Fetching CE strike data:', ceStrikeFetchUrl);

      // Fetch combined data for PE strike (contains both CE and PE at this strike)
      const peStrikeParams = new URLSearchParams({
        symbol: baseSymbol,
        expiry,
        strike: peStrikeValue.toString(),
        userId: user.uid,
        from: from.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
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

      const ceStrikeResult = await ceStrikeResponse.json();
      const peStrikeResult = await peStrikeResponse.json();

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

        setChartData(chartDataArray);

        // Store CE and PE prices for each candle for individual Greeks calculation
        const ceDataMap = new Map();
        const peDataMap = new Map();

        ceStrikeResult.data.forEach((ceStrikeCandle: any) => {
          ceDataMap.set(ceStrikeCandle.time, ceStrikeCandle.cePrice || 0);
        });

        peStrikeResult.data.forEach((peStrikeCandle: any) => {
          peDataMap.set(peStrikeCandle.time, peStrikeCandle.pePrice || 0);
        });

        // Calculate Greeks for each candle
        const greeksDataArray = chartDataArray.map((candle, index) => {
          const previousPrice = index > 0 ? chartDataArray[index - 1].close : candle.close;

          // Calculate daysToExp for THIS candle's timestamp (decreases over time)
          const candleDate = new Date(candle.time * 1000);
          const expiryDate = parseExpiryDate(expiry);
          const daysToExpCandle = Math.ceil((expiryDate.getTime() - candleDate.getTime()) / (1000 * 60 * 60 * 24));

          const greekData = calculateGreeks(candle.close, previousPrice, daysToExpCandle, spotPrice);

          // Normalize Greeks to 0-100 scale for better visibility
          // Theta: 0-10 → 0-100
          const thetaNormalized = Math.min(100, Math.max(0, (greekData.theta / 10) * 100));

          // Vega: -4 to 0 → 0-100 (wider range for better visibility)
          const vegaNormalized = Math.min(100, Math.max(0, ((greekData.vega + 4) / 4) * 100));

          // Gamma: 0-0.025 → 0-100 (wider range)
          const gammaNormalized = Math.min(100, Math.max(0, (greekData.gamma / 0.025) * 100));

          // Delta: -1 to 1 → 0-100 (center at 50)
          const deltaNormalized = Math.min(100, Math.max(0, ((greekData.delta + 1) / 2) * 100));

          return {
            time: candle.time,
            theta: thetaNormalized,
            vega: vegaNormalized,
            gamma: gammaNormalized,
            delta: deltaNormalized,
          };
        });
        setGreeksArray(greeksDataArray);

        // Calculate Greeks based on latest premium (for panel display)
        const latestPremium = chartDataArray[chartDataArray.length - 1].close;
        const previousPremium = chartDataArray.length > 1 ? chartDataArray[chartDataArray.length - 2].close : latestPremium;
        const greeksCalc = calculateGreeks(latestPremium, previousPremium, daysToExp, spotPrice);
        setGreeks(greeksCalc);

        // Calculate individual Greeks for CE and PE
        const latestCandle = chartDataArray[chartDataArray.length - 1];
        const latestCePrice = ceDataMap.get(latestCandle.time) || 0;
        const latestPePrice = peDataMap.get(latestCandle.time) || 0;

        const previousCandle = chartDataArray.length > 1 ? chartDataArray[chartDataArray.length - 2] : latestCandle;
        const previousCePrice = ceDataMap.get(previousCandle.time) || latestCePrice;
        const previousPePrice = peDataMap.get(previousCandle.time) || latestPePrice;

        const ceGreeksCalc = calculateGreeks(latestCePrice, previousCePrice, daysToExp, spotPrice);
        const peGreeksCalc = calculateGreeks(latestPePrice, previousPePrice, daysToExp, spotPrice);

        setCeGreeks(ceGreeksCalc);
        setPeGreeks(peGreeksCalc);
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

  // Load data on symbol or interval change
  useEffect(() => {
    if (user && expiry) {
      console.log('[GEEK-STRANGLE] useEffect triggered - fetching chart data');
      fetchChartData();
    }
  }, [user, expiry, interval, lookbackDays, spotPrice, ceStrike, peStrike]);

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
          {/* Real-time Status */}
          <div className={'flex items-center gap-2 px-3 py-1 rounded-lg ' +
            (isConnected ? 'bg-green-50' : 'bg-red-50')}>
            <div className={'w-2 h-2 rounded-full ' +
              (isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500')}></div>
            <span className={'text-sm font-medium ' +
              (isConnected ? 'text-green-700' : 'text-red-700')}>
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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

              {/* Days to Expiry (no checkbox) */}
              <div className="bg-white rounded p-3 border border-gray-200">
                <p className="text-xs text-gray-600 font-semibold">Days to Expiry</p>
                <p className="text-lg font-bold text-purple-600">{greeks.daysToExpiry}</p>
                <p className="text-xs text-gray-500 mt-1">Gamma Risk</p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-white rounded border border-gray-200 text-xs text-gray-700">
              <strong>Strategy Hint:</strong>
              {greeks.riskLevel === 'safe' ? ' ✅ Good to sell - Theta strong, manageable risk. Target 50% profit.' : ''}
              {greeks.riskLevel === 'caution' ? ' ⚠️ Caution - Gamma rising. Close position in next 2-3 days.' : ''}
              {greeks.riskLevel === 'danger' ? ' 🔴 Danger - Close immediately! Gamma explosion risk near expiry.' : ''}
            </div>
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

        {!loading && !error && chartData.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 md:p-6">
            <div className="mb-3 md:mb-4">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">{displaySymbol} Strangle Premium</h2>
              <p className="text-xs sm:text-sm text-gray-600">
                <strong>Price:</strong> CE (Higher Strike) + PE (Lower Strike) | <strong>Volume:</strong> CE + PE (Combined)
                <span className="ml-2 sm:ml-4">Interval: <span className="font-semibold">{interval}</span></span>
                <span className="ml-2 sm:ml-4">{chartData.length} candles</span>
              </p>
            </div>
            <AdvancedTradingChart
              data={chartData}
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
        {!loading && !error && chartData.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-3">
              <p className="text-xs text-gray-700 leading-relaxed">
                <span className="font-semibold">💡 Geek Strangle Strategy:</span>
                <br />
                <strong>Position:</strong> CE at {ceStrikeValue} | PE at {peStrikeValue} (Width: {ceStrikeValue - peStrikeValue} points)
                <br />
                <strong>When to SELL:</strong> Theta &gt; 1.5/day, Vega &lt; -2.5, Gamma &lt; 0.005, DTE &gt; 20
                <br />
                <strong>When to CLOSE:</strong> 50% profit reached, OR Gamma &gt; 0.008, OR DTE ≤ 7
                <br />
                <strong>Greeks Guide:</strong> Monitor theta decay vs vega risk. Close before gamma explodes near expiry.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-600">No chart data available. Try a different symbol or timeframe.</p>
          </div>
        )}
      </div>
    </div>
  );
}

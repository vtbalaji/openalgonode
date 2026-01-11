/**
 * Geek Straddle Chart Page (ATM Options with Greeks)
 * Features:
 * - TradingView Lightweight Charts
 * - Straddle Greeks (Theta, Vega, Gamma, Delta)
 * - Multiple timeframes
 * - Technical indicators (SMA, EMA, RSI)
 * - Real-time WebSocket updates
 * - Volume bars (CE volume + PE volume summed)
 *
 * Data: Combines CE and PE prices for ATM strike + Greeks analysis
 * - Price = CE price + PE price (straddle premium)
 * - Volume = CE volume + PE volume (combined)
 * - Greeks = Combined Greeks for selling decisions
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { AdvancedTradingChart, ChartData, IndicatorConfig } from '@/components/AdvancedTradingChart';
import { useRealtimePrice } from '@/hooks/useRealtimePrice';
import { calculateStraddleGreeks, type OptionsGreeksInput } from '@/lib/indicators/optionsGreeks';

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

export default function GeekStraddleChartPage() {
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
  const [manualStrike, setManualStrike] = useState<number | null>(null);
  const [greeks, setGreeks] = useState<GreeksData | null>(null);
  const [greeksArray, setGreeksArray] = useState<Array<{ time: number; theta: number; vega: number; gamma: number; delta: number }>>([]);

  const [indicators, setIndicators] = useState<IndicatorConfig>({
    sma: false,
    smaPeriod: 20,
    ema: false,
    emaPeriod: 12,
    rsi: false,
    rsiPeriod: 14,
    volumeProfile: true,
    volumeProfileVisible: false,
    volumeProfileBins: 150,
    showSignals: true,
    fastEma: 9,
    slowEma: 32,
    adx: false,
    adxPeriod: 14,
    adxThreshold: 25,
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

  const [spotPriceHistory, setSpotPriceHistory] = useState<number[]>([]);

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
        // Theta: positive is good for sellers (daily decay in rupees)
        // Black-Scholes gives actual daily decay values (much larger than heuristic)
        // High theta (>5) = Green, Medium (2-5) = Orange, Low (<2) = Red
        if (value > 5) return '#22C55E'; // Green (SELL - strong decay)
        if (value > 2) return '#F97316'; // Orange (HOLD - moderate decay)
        return '#EF4444'; // Red (BUY - weak decay)

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
        // Delta: near zero is good for straddles (neutral)
        // Near zero (-0.2 to 0.2) = Green, Medium (0.2-0.5) = Orange, Far (>0.5 or <-0.5) = Red
        if (value >= -0.2 && value <= 0.2) return '#22C55E'; // Green (SELL/neutral)
        if (value >= -0.5 && value <= 0.5) return '#F97316'; // Orange (HOLD)
        return '#EF4444'; // Red (BUY/directional)

      default:
        return '#6B7280'; // Gray fallback
    }
  };

  /**
   * Calculate Greeks for straddle using Black-Scholes model
   * Uses Newton-Raphson to solve for Implied Volatility from market prices
   */
  const calculateGreeks = (
    premium: number,
    previousPremium: number,
    daysToExp: number,
    spotPrice?: number,
    strikePrice?: number
  ): GreeksData => {
    // Use Black-Scholes calculation via optionsGreeks
    // Straddle at ATM: CE and PE at same strike
    // Premium = CE price + PE price, split evenly for simplicity
    const cePrice = premium / 2;
    const pePrice = premium / 2;

    const ceInput: OptionsGreeksInput = {
      spotPrice: spotPrice || 25683,
      strikePrice: strikePrice || 26100,
      marketPrice: cePrice,
      optionType: 'call',
      daysToExpiry: daysToExp,
      historicalSpotPrices: spotPriceHistory,
      riskFreeRate: 0.07,
    };

    const peInput: OptionsGreeksInput = {
      spotPrice: spotPrice || 25683,
      strikePrice: strikePrice || 26100,
      marketPrice: pePrice,
      optionType: 'put',
      daysToExpiry: daysToExp,
      historicalSpotPrices: spotPriceHistory,
      riskFreeRate: 0.07,
    };

    // Calculate combined straddle Greeks
    const { combined } = calculateStraddleGreeks(ceInput, peInput);

    return {
      theta: Math.abs(parseFloat(combined.theta.toFixed(2))), // Absolute value for display
      vega: parseFloat(combined.vega.toFixed(2)),
      gamma: parseFloat(combined.gamma.toFixed(4)),
      delta: parseFloat(combined.delta.toFixed(2)),
      daysToExpiry: daysToExp,
      riskLevel: combined.riskLevel,
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

  // Fetch historical data for straddle (CE + PE combined)
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

      const params = new URLSearchParams({
        symbol: baseSymbol,
        expiry,
        userId: user.uid,
        from: from.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
        interval: interval.replace('minute', ''),
      });

      // Add strike if manually specified, otherwise use spotPrice for auto-detection
      if (manualStrike) {
        params.append('strike', manualStrike.toString());
        console.log('[GEEK-STRADDLE] Fetching with manual strike:', manualStrike);
      } else {
        params.append('spotPrice', spotPrice.toString());
        console.log('[GEEK-STRADDLE] Fetching with auto-detect, spot price:', spotPrice);
      }

      const url = '/api/options/historical?' + params.toString();
      console.log('[GEEK-STRADDLE] Fetch URL:', url);

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch data: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data && result.data.length > 0) {
        // Extract spot price and days to expiry from API response
        const apiSpotPrice = result.spotPrice || spotPrice;
        const apiDaysToExpiry = result.daysToExpiry || daysToExp;

        // Update spot price if API provided it
        if (result.spotPrice) {
          setSpotPrice(result.spotPrice);
        }

        const chartDataArray: ChartData[] = result.data.map((candle: any) => ({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }));
        setChartData(chartDataArray);

        // Build spot price history (replicate spotPrice for each candle or use API data if available)
        const spotHistory = chartDataArray.map(() => apiSpotPrice);
        setSpotPriceHistory(spotHistory);

        // Calculate Greeks for each candle
        const greeksDataArray = chartDataArray.map((candle, index) => {
          const previousPrice = index > 0 ? chartDataArray[index - 1].close : candle.close;

          // Calculate daysToExp for THIS candle's timestamp (decreases over time)
          const candleDate = new Date(candle.time * 1000);
          const expiryDate = parseExpiryDate(expiry);
          const daysToExpCandle = Math.ceil((expiryDate.getTime() - candleDate.getTime()) / (1000 * 60 * 60 * 24));

          const greekData = calculateGreeks(candle.close, previousPrice, daysToExpCandle, apiSpotPrice, atmStrike);

          // Normalize Greeks to 0-100 scale for better visibility
          // Black-Scholes Greeks are actual values, scale them appropriately

          // Theta: typical range 0-15 (daily decay in rupees) → normalize to 0-100
          // Capped at 100 so it fits in chart
          const thetaNormalized = Math.min(100, Math.max(0, (Math.abs(greekData.theta) / 15) * 100));

          // Vega: typical range 0-3 (positive for buyers/sellers sensitivity) → normalize to 0-100
          // Higher vega = more volatility sensitivity = higher value
          const vegaNormalized = Math.min(100, Math.max(0, (greekData.vega / 3) * 100));

          // Gamma: typical range 0-0.05 (delta acceleration) → normalize to 0-100
          // Clipped at 50 for visibility if exceeds
          const gammaNormalized = Math.min(100, Math.max(0, (greekData.gamma / 0.05) * 100));

          // Delta: range -1 to 1 → 0-100 (center at 50, neutrality = 50)
          // Near-zero delta (±0.2) = around 40-60 on scale
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
        const greeksCalc = calculateGreeks(latestPremium, previousPremium, apiDaysToExpiry, apiSpotPrice, atmStrike);
        setGreeks(greeksCalc);
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Geek straddle chart data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load data on symbol or interval change
  useEffect(() => {
    if (user && expiry) {
      console.log('[GEEK-STRADDLE] useEffect triggered - fetching chart data');
      fetchChartData();
    }
  }, [user, expiry, interval, lookbackDays, spotPrice, manualStrike]);

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

  const atmStrike = manualStrike || Math.round(spotPrice / 100) * 100;
  const displaySymbol = `${baseSymbol}${expiry}${atmStrike}`;

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
            Geek Straddle (CE + PE with Greeks)
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
                  console.log('[GEEK-STRADDLE] Changed expiry to:', e.target.value);
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

            {/* Strike Selector - Manual or Auto-Detect */}
            <div className="flex-shrink-0 flex items-center gap-1 h-10">
              <label className="text-xs text-gray-600 whitespace-nowrap font-semibold">Strike:</label>

              {/* Down 100 Button */}
              <button
                onClick={() => setManualStrike(prev => (prev ? prev - 100 : atmStrike - 100))}
                className="px-2 bg-red-100 text-red-700 hover:bg-red-200 rounded text-sm font-semibold whitespace-nowrap h-10"
                title="Decrease strike by 100"
              >
                -100
              </button>

              {/* Strike Input */}
              <input
                type="number"
                value={manualStrike || ''}
                onChange={(e) => setManualStrike(e.target.value ? parseInt(e.target.value) : null)}
                placeholder={atmStrike.toString()}
                className="w-20 px-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm font-semibold h-10"
              />

              {/* Up 100 Button */}
              <button
                onClick={() => setManualStrike(prev => (prev ? prev + 100 : atmStrike + 100))}
                className="px-2 bg-green-100 text-green-700 hover:bg-green-200 rounded text-sm font-semibold whitespace-nowrap h-10"
                title="Increase strike by 100"
              >
                +100
              </button>

              <span className="text-xs text-gray-500 whitespace-nowrap">
                {manualStrike ? `Manual: ${manualStrike}` : `Auto: ${atmStrike}`}
              </span>
            </div>

            {/* Lookback Days */}
            <div className="flex-shrink-0 flex items-center gap-2 h-10">
              <span className="text-xs text-gray-600 whitespace-nowrap">Lookback:</span>
              <input
                type="number"
                min="1"
                max="100"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Math.max(1, Math.min(100, parseInt(e.target.value) || 50)))}
                className="w-16 px-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm h-10"
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

                {/* ADX Trend Filter */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="adx"
                    checked={indicators.adx}
                    onChange={() => toggleIndicator('adx')}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-2"
                  />
                  <label htmlFor="adx" className="text-sm font-medium text-gray-700">
                    ADX Filter
                  </label>
                  <span className="text-xs text-gray-500">(Optional)</span>
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
                <p className="text-xs text-gray-600 mt-1">(expected &gt; 1.5)</p>
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
                <p className="text-xs text-gray-600 mt-1">(expected &lt; -2.0)</p>
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
                <p className="text-xs text-gray-600 mt-1">(expected &lt; 0.005)</p>
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
                <p className="text-xs text-gray-600 mt-1">(expected ±0.2)</p>
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
            <p className="mt-4 text-gray-600">Loading geek straddle chart data...</p>
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
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">{displaySymbol} Straddle Premium</h2>
              <p className="text-xs sm:text-sm text-gray-600">
                <strong>Price:</strong> CE + PE (Combined) | <strong>Volume:</strong> CE + PE (Combined)
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
                <span className="font-semibold">💡 Geek Straddle Strategy:</span>
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

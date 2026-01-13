/**
 * Straddle Chart Page (ATM Options - CE + PE Combined)
 * Features (copied from /chart):
 * - TradingView Lightweight Charts
 * - Multiple timeframes
 * - Technical indicators (SMA, EMA, RSI)
 * - Real-time WebSocket updates
 * - Volume bars (CE volume + PE volume summed)
 *
 * Data: Combines CE and PE prices for ATM strike
 * - Price = CE price + PE price (straddle premium)
 * - Volume = CE volume + PE volume (combined)
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { AdvancedTradingChart, ChartData, IndicatorConfig } from '@/components/AdvancedTradingChart';
import { useRealtimePrice } from '@/hooks/useRealtimePrice';
import { useOptionTickStream } from '@/hooks/useOptionTickStream';
import { useTickToCandle } from '@/hooks/useTickToCandle';

const TIMEFRAMES = [
  { label: '1m', value: 'minute' },
  { label: '3m', value: '3minute' },
  { label: '5m', value: '5minute' },
  { label: '15m', value: '15minute' },
  { label: '30m', value: '30minute' },
  { label: '1h', value: '60minute' },
  { label: '1D', value: 'day' },
];

export default function StraddleChartPage() {
  const { user } = useAuth();
  const [baseSymbol, setBaseSymbol] = useState('NIFTY');
  const [expiry, setExpiry] = useState('JAN'); // Monthly expiry
  const [customSymbol, setCustomSymbol] = useState('');
  const [interval, setInterval] = useState('60minute');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(600);
  const [lookbackDays, setLookbackDays] = useState(25);
  const [spotPrice, setSpotPrice] = useState(25683);
  const [ceStrike, setCeStrike] = useState<number | null>(null);
  const [peStrike, setPeStrike] = useState<number | null>(null);
  const [latestCePrice, setLatestCePrice] = useState(0);
  const [latestPePrice, setLatestPePrice] = useState(0);
  const [latestPriceTime, setLatestPriceTime] = useState<number | null>(null);

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

  // Real-time price updates - for spot price display
  const { prices, isConnected } = useRealtimePrice({
    symbols: [baseSymbol + '26JANFUT'], // Use futures to get spot price
  });

  // Helper function to calculate ATM strike
  const calculateAtmStrike = () => Math.round(spotPrice / 100) * 100;

  // Stream option ticks for CE and PE
  const { ticks: optionTicks, isConnected: tickStreamConnected } = useOptionTickStream({
    symbol: baseSymbol,
    expiry,
    ceStrike: ceStrike || calculateAtmStrike(),
    peStrike: peStrike || calculateAtmStrike(),
    enabled: true,
  });

  // Convert ticks to candles based on interval
  let intervalMinutes = 60;
  if (interval === 'minute') {
    intervalMinutes = 1;
  } else if (interval === 'day') {
    intervalMinutes = 1440;
  } else {
    const match = interval.match(/^(\d+)minute$/);
    if (match) {
      intervalMinutes = parseInt(match[1]);
    }
  }

  // Memoize the transformed ticks to avoid unnecessary re-renders
  const transformedTicks = useMemo(
    () =>
      optionTicks.map((tick) => ({
        price: tick.cePrice + tick.pePrice, // Straddle premium = CE + PE
        time: tick.time,
      })),
    [optionTicks]
  );

  const { currentCandle: latestTickCandle } = useTickToCandle(transformedTicks, {
    intervalMinutes,
    onCandleUpdate: (updatingCandle) => {
      // Update the chart with the current incomplete candle
      setChartData((prev) => {
        if (prev.length === 0) return [updatingCandle as ChartData];

        const updated = [...prev];
        const lastIndex = updated.length - 1;

        // Check if we should update the last candle or add a new one
        if (updated[lastIndex].time === updatingCandle.time) {
          // Same time period - update the last candle
          updated[lastIndex] = updatingCandle as ChartData;
        } else {
          // New time period - add new candle
          updated.push(updatingCandle as ChartData);
        }

        return updated;
      });
    },
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

  // Update latest CE/PE prices from option ticks
  useEffect(() => {
    if (!optionTicks || optionTicks.length === 0) return;

    const latestTick = optionTicks[optionTicks.length - 1];
    setLatestCePrice(latestTick.cePrice);
    setLatestPePrice(latestTick.pePrice);
    setLatestPriceTime(latestTick.time);
  }, [optionTicks]);

  // Fetch historical data for straddle (CE + PE combined)
  const fetchChartData = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - lookbackDays);

      const params = new URLSearchParams({
        symbol: baseSymbol,
        expiry,
        spotPrice: spotPrice.toString(),
        userId: user.uid,
        from: from.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
        interval: interval.replace('minute', ''),
      });

      const response = await fetch('/api/options/historical?' + params.toString());

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch data: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data && result.data.length > 0) {
        const chartDataArray: ChartData[] = result.data.map((candle: any) => ({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }));
        setChartData(chartDataArray);

        // Extract latest CE and PE prices from the last candle
        const latestCandle = result.data[result.data.length - 1];
        if (latestCandle.cePrice !== undefined && latestCandle.pePrice !== undefined) {
          setLatestCePrice(latestCandle.cePrice);
          setLatestPePrice(latestCandle.pePrice);
          setLatestPriceTime(latestCandle.time);
        }

        // Update spot price from API if provided
        if (result.spotPrice) {
          setSpotPrice(result.spotPrice);
        }
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Straddle chart data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load data on symbol or interval change
  useEffect(() => {
    if (user && baseSymbol && expiry) {
      fetchChartData();
    }
  }, [user, baseSymbol, expiry, interval, lookbackDays]);

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customSymbol.trim()) {
      setBaseSymbol(customSymbol.toUpperCase().trim());
      setCustomSymbol('');
    }
  };

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

  // Helper function to parse expiry and calculate days
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
      const lastDay = new Date(2026, month + 1, 0).getDate();
      return new Date(2026, month, lastDay);
    }

    return new Date(); // Fallback
  };

  const calculateDaysToExpiry = (): number => {
    const today = new Date();
    const expiryDate = parseExpiryDate(expiry);
    return Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const displayCeStrike = ceStrike || calculateAtmStrike();
  const displayPeStrike = peStrike || calculateAtmStrike();
  const displaySymbol = `${baseSymbol}${expiry}(${displayCeStrike}CE/${displayPeStrike}PE)`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Straddle Chart (CE + PE)
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

        {/* Controls - Compact Single Row */}
        <div className="bg-white rounded-lg shadow-md p-3 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Expiry Selector */}
            <div className="flex-shrink-0">
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
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
                    onClick={() => setCeStrike(prev => (prev ? prev - 100 : Math.round(spotPrice / 100) * 100 - 100))}
                    className="px-2 py-0 text-red-600 hover:bg-red-50 rounded text-lg font-bold"
                    title="Decrease CE strike by 100"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    value={ceStrike || Math.round(spotPrice / 100) * 100}
                    onChange={(e) => setCeStrike(e.target.value ? parseInt(e.target.value) : null)}
                    step="100"
                    className="w-20 text-center border-0 text-gray-900 text-sm font-semibold focus:outline-none bg-transparent"
                  />

                  <button
                    onClick={() => setCeStrike(prev => (prev ? prev + 100 : Math.round(spotPrice / 100) * 100 + 100))}
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
                    onClick={() => setPeStrike(prev => (prev ? prev - 100 : Math.round(spotPrice / 100) * 100 - 100))}
                    className="px-2 py-0 text-red-600 hover:bg-red-50 rounded text-lg font-bold"
                    title="Decrease PE strike by 100"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    value={peStrike || Math.round(spotPrice / 100) * 100}
                    onChange={(e) => setPeStrike(e.target.value ? parseInt(e.target.value) : null)}
                    step="100"
                    className="w-20 text-center border-0 text-gray-900 text-sm font-semibold focus:outline-none bg-transparent"
                  />

                  <button
                    onClick={() => setPeStrike(prev => (prev ? prev + 100 : Math.round(spotPrice / 100) * 100 + 100))}
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

          {/* Day Trading Strategy Section */}
          <div className="pt-4">
            <div className="p-3 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <span className="text-lg">📊</span> Day Trading Strategy (POC Breakout + EMA)
              </h3>
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

                {/* Volume Profile - Overall */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="volumeProfile"
                    checked={indicators.volumeProfile}
                    onChange={() => toggleIndicator('volumeProfile')}
                    className="w-4 h-4 text-red-600 rounded focus:ring-2"
                  />
                  <label htmlFor="volumeProfile" className="text-sm font-medium text-gray-700">
                    VP: Overall
                  </label>
                </div>

                {/* Volume Profile - Visible Range */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="volumeProfileVisible"
                    checked={indicators.volumeProfileVisible}
                    onChange={() => toggleIndicator('volumeProfileVisible')}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2"
                  />
                  <label htmlFor="volumeProfileVisible" className="text-sm font-medium text-gray-700">
                    VP: Visible
                  </label>
                </div>

                {/* VP Bins */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">VP Bins</label>
                  <input
                    type="number"
                    value={indicators.volumeProfileBins}
                    onChange={(e) => updateIndicatorPeriod('volumeProfileBins', parseInt(e.target.value))}
                    disabled={!indicators.volumeProfile && !indicators.volumeProfileVisible}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
                    min="10"
                    max="200"
                  />
                  <span className="text-xs text-gray-500">(150)</span>
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

        {/* Chart */}
        {loading && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Loading straddle chart data...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">❌ {error}</p>
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 md:p-6">
            {/* Info Line: DTE + Premium + Spot */}
            <div className="bg-gray-50 rounded px-3 py-2 border border-gray-200 text-xs font-mono mb-3">
              <p className="text-gray-700">
                <span className="font-bold">DTE:</span> <span className="text-purple-600 font-bold">{calculateDaysToExpiry()}</span>
                <span className="mx-3">|</span>
                <span className="font-bold">Premium:</span> <span className="text-blue-600 font-bold">{(latestCePrice + latestPePrice).toFixed(0)}</span>
                <span className="text-gray-500"> (C:{latestCePrice.toFixed(0)} P:{latestPePrice.toFixed(0)})</span>
                <span className="mx-3">|</span>
                <span className="font-bold">Spot:</span> <span className="text-orange-600 font-bold">{spotPrice.toFixed(0)}</span>
              </p>
            </div>

            <div className="mb-3 md:mb-4">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">{displaySymbol} Straddle</h2>
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
            />
          </div>
        )}

        {/* Strategy Information */}
        {!loading && !error && chartData.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200 p-3">
              <p className="text-xs text-gray-700 leading-relaxed">
                <span className="font-semibold">💡 Straddle Strategy Info:</span>
                <br />
                <strong>Premium (Price):</strong> Sum of CE price + PE price at ATM strike
                <br />
                <strong>Volume (Histogram):</strong> Sum of CE volume + PE volume
                <br />
                <strong>ATM Strike:</strong> Auto-detected from spot price (rounded to nearest 100)
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

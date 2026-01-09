/**
 * Advanced Trading Chart Page
 * Features:
 * - TradingView Lightweight Charts
 * - Multiple timeframes
 * - Technical indicators (SMA, EMA, RSI)
 * - Real-time WebSocket updates
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

export default function ChartPage() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState('NIFTY26JANFUT');
  const [customSymbol, setCustomSymbol] = useState('');
  const [interval, setInterval] = useState('3minute');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(600);
  const [lookbackDays, setLookbackDays] = useState(50);

  const [indicators, setIndicators] = useState<IndicatorConfig>({
    sma: false,
    smaPeriod: 20,
    ema: false,
    emaPeriod: 12,
    rsi: false, // Disable RSI by default - keep chart clean
    rsiPeriod: 14,
    volumeProfile: true, // Overall Volume Profile (all data) - enabled by default
    volumeProfileVisible: true, // Visible Range Volume Profile (current view only) - enabled by default
    volumeProfileBins: 150,
    showSignals: true, // ✅ Main feature: Buy/Sell signals
    fastEma: 9, // ✅ Fast EMA (9) for day trading
    slowEma: 32, // ✅ Slow EMA (32) for day trading
    // Filters for automated trading
    adx: false, // Optional: ADX trend filter to avoid ranging markets
    adxPeriod: 14,
    adxThreshold: 25, // Only trade when ADX > 25 (strong trend)
    useVolumeFilter: false, // Removed - volume covered by POC
    useTimeFilter: false, // Removed - user preference
    // Consolidation breakout trading - DISABLED (not working correctly)
    showConsolidation: false,
    consolidationMinDuration: 10,
    consolidationMaxDuration: 100,
  });

  // Real-time price updates
  const { prices, isConnected } = useRealtimePrice({
    symbols: [symbol],
  });

  // Set responsive chart height
  useEffect(() => {
    const updateChartHeight = () => {
      if (typeof window !== 'undefined') {
        const width = window.innerWidth;
        if (width < 640) {
          setChartHeight(400); // Mobile
        } else if (width < 768) {
          setChartHeight(500); // Tablet
        } else {
          setChartHeight(600); // Desktop
        }
      }
    };

    updateChartHeight();
    window.addEventListener('resize', updateChartHeight);
    return () => window.removeEventListener('resize', updateChartHeight);
  }, []);

  // Fetch historical data
  const fetchChartData = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - lookbackDays);

      const params = new URLSearchParams({
        symbol,
        interval,
        userId: user.uid,
        from: from.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
      });

      const response = await fetch('/api/chart/historical?' + params.toString());
      
      if (!response.ok) {
        throw new Error('Failed to fetch chart data: ' + response.status);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setChartData(result.data);
      } else {
        throw new Error(result.error || 'Failed to load data');
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Chart data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load data on symbol or interval change
  useEffect(() => {
    if (user && symbol) {
      fetchChartData();
    }
  }, [user, symbol, interval, lookbackDays]);

  // Update chart with real-time data
  useEffect(() => {
    if (!prices[symbol] || chartData.length === 0) return;

    const latestPrice = prices[symbol];
    const currentTime = Math.floor(new Date().getTime() / 1000);

    // Update last candle or add new one
    setChartData((prevData) => {
      const newData = [...prevData];
      const lastCandle = newData[newData.length - 1];

      // Update existing candle or create new one based on timeframe
      if (lastCandle) {
        lastCandle.close = latestPrice.last_price;
        lastCandle.high = Math.max(lastCandle.high, latestPrice.last_price);
        lastCandle.low = Math.min(lastCandle.low, latestPrice.last_price);
        // Note: Don't update volume - realtime feed has cumulative daily volume, not per-candle volume
      }

      return newData;
    });
  }, [prices, symbol]);

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customSymbol.trim()) {
      setSymbol(customSymbol.toUpperCase().trim());
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Trading Chart
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
          <div className="flex flex-wrap items-end gap-3">
            {/* Symbol Input */}
            <div className="flex-shrink-0">
              <form onSubmit={handleSymbolSubmit} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  className="w-56 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                  placeholder="e.g., RELIANCE, NIFTY25DEC25900CE"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap"
                >
                  Load
                </button>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  Current: <span className="font-semibold">{symbol}</span>
                </span>
              </form>
            </div>

            {/* Timeframe Selector */}
            <div className="flex-shrink-0">
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf.value} value={tf.value}>
                    {tf.label}
                  </option>
                ))}
              </select>
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
                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
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

                {/* ADX Trend Filter (Optional) */}
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
            <p className="mt-4 text-gray-600">Loading chart data...</p>
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
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">{symbol}</h2>
              <p className="text-xs sm:text-sm text-gray-600">
                Interval: <span className="font-semibold">{interval}</span>
                <span className="ml-2 sm:ml-4">{chartData.length} candles</span>
              </p>
            </div>
            <AdvancedTradingChart
              data={chartData}
              symbol={symbol}
              interval={interval}
              indicators={indicators}
              height={chartHeight}
            />
          </div>
        )}

        {/* Strategy Information - Bottom */}
        {!loading && !error && chartData.length > 0 && (
          <div className="mt-4 space-y-3">
            {/* Day Trading Strategy Explanation */}
            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200 p-3">
              <p className="text-xs text-gray-700 leading-relaxed">
                <span className="font-semibold">💡 Day Trading Strategy (POC Breakout + EMA):</span>
                <br />
                <strong>BUY:</strong> Signal triggers when <strong>all 3 conditions become true</strong>: (1) Price above POC (overall - red line), (2) Price above both EMAs, (3) Fast EMA above Slow EMA. Signal shows on the candle where the last condition completes.
                <br />
                <strong>SELL:</strong> Fast EMA crosses below Slow EMA. ADX filter requires strong trend (ADX &gt; 25).
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

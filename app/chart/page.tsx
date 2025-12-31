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
  const [interval, setInterval] = useState('5minute');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(600);

  const [indicators, setIndicators] = useState<IndicatorConfig>({
    sma: false,
    smaPeriod: 20,
    ema: false,
    emaPeriod: 12,
    rsi: false, // Disable RSI by default - keep chart clean
    rsiPeriod: 14,
    volumeProfile: false, // Disable Volume Profile - too cluttered
    volumeProfileBins: 150,
    atr: true, // ATR calculated in background for stop-loss
    atrPeriod: 14,
    showSignals: true, // ✅ Main feature: Buy/Sell signals
    fastEma: 9, // ✅ Fast EMA (9) for day trading
    slowEma: 21, // ✅ Slow EMA (21) for day trading
    // Filters for automated trading
    adx: true, // ✅ ADX trend filter - avoid ranging markets
    adxPeriod: 14,
    adxThreshold: 25, // Only trade when ADX > 25 (strong trend)
    useVolumeFilter: true, // ✅ Require above-average volume
    useTimeFilter: true, // ✅ Only trade 9:30 AM - 3:00 PM IST
    // SMC indicators (for manual learning - disabled by default)
    showFVG: false,
    showOrderBlocks: false,
    showSupportResistance: false,
    showPremiumDiscount: false,
    // Consolidation breakout trading
    showConsolidation: false,
    consolidationMinDuration: 10,
    consolidationMaxDuration: 50,
  });

  // Real-time price updates
  const { prices, isConnected } = useRealtimePrice({
    symbols: [symbol],
    broker: 'zerodha',
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
      from.setDate(today.getDate() - 50); // Last 50 days

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
  }, [user, symbol, interval]);

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
        lastCandle.volume = latestPrice.volume;
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

  const updateIndicatorPeriod = (indicator: 'smaPeriod' | 'emaPeriod' | 'rsiPeriod' | 'volumeProfileBins' | 'atrPeriod' | 'fastEma' | 'slowEma', value: number) => {
    setIndicators((prev) => ({
      ...prev,
      [indicator]: value,
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Trading Chart
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            Advanced charting with technical indicators
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 mb-4 md:mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {/* Symbol Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Symbol
              </label>
              <form onSubmit={handleSymbolSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="e.g., RELIANCE, NIFTY25DEC25900CE"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Load
                </button>
              </form>
              <p className="mt-1 text-xs text-gray-500">
                Current: <span className="font-semibold">{symbol}</span>
              </p>
            </div>

            {/* Timeframe Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timeframe
              </label>
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setInterval(tf.value)}
                    className={'px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors min-w-[44px] ' +
                      (interval === tf.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      )}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Real-time Status */}
            <div className="flex items-center justify-end">
              <div className={'flex items-center gap-2 px-4 py-2 rounded-lg ' + 
                (isConnected ? 'bg-green-50' : 'bg-red-50')}>
                <div className={'w-2 h-2 rounded-full ' + 
                  (isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500')}></div>
                <span className={'text-sm font-medium ' + 
                  (isConnected ? 'text-green-700' : 'text-red-700')}>
                  {isConnected ? 'Live' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          {/* Indicators */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Indicators</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* SMA */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="sma"
                  checked={indicators.sma}
                  onChange={() => toggleIndicator('sma')}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2"
                />
                <label htmlFor="sma" className="text-sm font-medium text-gray-700">
                  SMA
                </label>
                <input
                  type="number"
                  value={indicators.smaPeriod}
                  onChange={(e) => updateIndicatorPeriod('smaPeriod', parseInt(e.target.value))}
                  disabled={!indicators.sma}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
                  min="1"
                  max="200"
                />
              </div>

              {/* EMA */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ema"
                  checked={indicators.ema}
                  onChange={() => toggleIndicator('ema')}
                  className="w-4 h-4 text-orange-600 rounded focus:ring-2"
                />
                <label htmlFor="ema" className="text-sm font-medium text-gray-700">
                  EMA
                </label>
                <input
                  type="number"
                  value={indicators.emaPeriod}
                  onChange={(e) => updateIndicatorPeriod('emaPeriod', parseInt(e.target.value))}
                  disabled={!indicators.ema}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
                  min="1"
                  max="200"
                />
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
              </div>

              {/* Volume Profile */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="volumeProfile"
                  checked={indicators.volumeProfile}
                  onChange={() => toggleIndicator('volumeProfile')}
                  className="w-4 h-4 text-red-600 rounded focus:ring-2"
                />
                <label htmlFor="volumeProfile" className="text-sm font-medium text-gray-700">
                  Vol Profile
                </label>
                <input
                  type="number"
                  value={indicators.volumeProfileBins}
                  onChange={(e) => updateIndicatorPeriod('volumeProfileBins', parseInt(e.target.value))}
                  disabled={!indicators.volumeProfile}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
                  min="10"
                  max="200"
                />
              </div>
            </div>

            {/* Day Trading Strategy Section */}
            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-lg">📊</span> Day Trading Strategy (EMA Crossover + ATR)
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
                  <span className="text-xs text-gray-500">(Day: 9)</span>
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
                  <span className="text-xs text-gray-500">(Day: 21)</span>
                </div>

                {/* ATR */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="atr"
                    checked={indicators.atr}
                    onChange={() => toggleIndicator('atr')}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-2"
                  />
                  <label htmlFor="atr" className="text-sm font-medium text-gray-700">
                    ATR
                  </label>
                  <input
                    type="number"
                    value={indicators.atrPeriod}
                    onChange={(e) => updateIndicatorPeriod('atrPeriod', parseInt(e.target.value))}
                    disabled={!indicators.atr}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
                    min="1"
                    max="50"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-600">
                💡 <strong>Strategy:</strong> Buy when Fast EMA crosses <strong>above</strong> Slow EMA. Sell when Fast EMA crosses <strong>below</strong> Slow EMA. ATR helps calculate dynamic stop-loss levels.
              </p>
            </div>

            {/* SMC Indicators Section - For Manual Learning */}
            <div className="mt-4 p-4 bg-gradient-to-r from-orange-50 to-purple-50 rounded-lg border border-orange-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-lg">🎓</span> Smart Money Concepts (Manual Learning Only)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Fair Value Gaps */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showFVG"
                    checked={indicators.showFVG}
                    onChange={() => toggleIndicator('showFVG')}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2"
                  />
                  <label htmlFor="showFVG" className="text-sm font-medium text-gray-700">
                    Fair Value Gaps
                  </label>
                </div>

                {/* Order Blocks */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showOrderBlocks"
                    checked={indicators.showOrderBlocks}
                    onChange={() => toggleIndicator('showOrderBlocks')}
                    className="w-4 h-4 text-orange-600 rounded focus:ring-2"
                  />
                  <label htmlFor="showOrderBlocks" className="text-sm font-medium text-gray-700">
                    Order Blocks
                  </label>
                </div>

                {/* Support/Resistance */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showSupportResistance"
                    checked={indicators.showSupportResistance}
                    onChange={() => toggleIndicator('showSupportResistance')}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-2"
                  />
                  <label htmlFor="showSupportResistance" className="text-sm font-medium text-gray-700">
                    Support/Resistance
                  </label>
                </div>

                {/* Premium/Discount */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showPremiumDiscount"
                    checked={indicators.showPremiumDiscount}
                    onChange={() => toggleIndicator('showPremiumDiscount')}
                    className="w-4 h-4 text-teal-600 rounded focus:ring-2"
                  />
                  <label htmlFor="showPremiumDiscount" className="text-sm font-medium text-gray-700">
                    Premium/Discount
                  </label>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-600">
                ⚠️ <strong>Note:</strong> SMC indicators are for manual analysis only. The automated bot uses EMA + filters above. Study these patterns to understand institutional behavior.
              </p>
            </div>

            {/* Consolidation Breakout Section */}
            <div className="mt-4 p-4 bg-gradient-to-r from-red-50 to-green-50 rounded-lg border border-red-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-lg">📊</span> Consolidation Box Breakout Trading
              </h3>

              <div className="flex items-center gap-3 mb-4">
                <input
                  type="checkbox"
                  id="showConsolidation"
                  checked={indicators.showConsolidation}
                  onChange={() => toggleIndicator('showConsolidation')}
                  className="w-4 h-4 text-red-600 rounded focus:ring-2"
                />
                <label htmlFor="showConsolidation" className="text-sm font-medium text-gray-700">
                  Enable Consolidation Detection & Breakout Signals
                </label>
              </div>

              {indicators.showConsolidation && (
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Min Duration (candles)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="30"
                      value={indicators.consolidationMinDuration}
                      onChange={(e) => setIndicators({
                        ...indicators,
                        consolidationMinDuration: parseInt(e.target.value) || 10
                      })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Max Duration (candles)
                    </label>
                    <input
                      type="number"
                      min="20"
                      max="100"
                      value={indicators.consolidationMaxDuration}
                      onChange={(e) => setIndicators({
                        ...indicators,
                        consolidationMaxDuration: parseInt(e.target.value) || 50
                      })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 text-xs text-gray-700 bg-white p-3 rounded border border-gray-200">
                <p><strong>How it works:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>🟥 <strong>Red line</strong> = Resistance (upper box boundary)</li>
                  <li>🟩 <strong>Green line</strong> = Support (lower box boundary)</li>
                  <li>⬆️ <strong>Green arrow</strong> = Bullish breakout (buy signal)</li>
                  <li>⬇️ <strong>Red arrow</strong> = Bearish breakdown (sell signal)</li>
                  <li>🎯 <strong>Target</strong> = Box height projected from breakout price</li>
                  <li>✓ = Volume confirmed (1.5x average volume)</li>
                </ul>
                <p className="mt-2 text-gray-600">
                  <strong>Strategy:</strong> Wait for price to break above resistance or below support with strong volume.
                  Target is calculated by projecting the box height from the breakout point.
                </p>
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

        {!loading && !error && chartData.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-600">No chart data available. Try a different symbol or timeframe.</p>
          </div>
        )}
      </div>
    </div>
  );
}

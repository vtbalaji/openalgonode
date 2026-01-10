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

export default function StraddleChartPage() {
  const { user } = useAuth();
  const [baseSymbol, setBaseSymbol] = useState('NIFTY');
  const [expiry, setExpiry] = useState('13JAN');
  const [customSymbol, setCustomSymbol] = useState('');
  const [interval, setInterval] = useState('3minute');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(600);
  const [lookbackDays, setLookbackDays] = useState(50);
  const [spotPrice, setSpotPrice] = useState(25683);

  const [indicators, setIndicators] = useState<IndicatorConfig>({
    sma: false,
    smaPeriod: 20,
    ema: false,
    emaPeriod: 12,
    rsi: false,
    rsiPeriod: 14,
    volumeProfile: true,
    volumeProfileVisible: true,
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

  // Fetch historical data for straddle (CE + PE combined)
  const fetchChartData = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - lookbackDays);

      // Calculate ATM strike from spot price
      const atmStrike = Math.round(spotPrice / 100) * 100;

      // Fetch CE and PE data separately
      const ceSymbol = `${baseSymbol}${expiry}${atmStrike}CE`;
      const peSymbol = `${baseSymbol}${expiry}${atmStrike}PE`;

      const params = new URLSearchParams({
        symbol: ceSymbol,
        interval,
        userId: user.uid,
        from: from.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
      });

      const ceResponse = await fetch('/api/chart/historical?' + params.toString());

      if (!ceResponse.ok) {
        throw new Error('Failed to fetch CE data: ' + ceResponse.status);
      }

      const ceResult = await ceResponse.json();

      // Now fetch PE with same params
      const peParams = new URLSearchParams({
        symbol: peSymbol,
        interval,
        userId: user.uid,
        from: from.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
      });

      const peResponse = await fetch('/api/chart/historical?' + peParams.toString());

      if (!peResponse.ok) {
        throw new Error('Failed to fetch PE data: ' + peResponse.status);
      }

      const peResult = await peResponse.json();

      // Combine CE and PE data
      if (ceResult.success && ceResult.data && peResult.success && peResult.data) {
        const ceData = ceResult.data;
        const peData = peResult.data;

        // Create combined straddle data
        const combinedData: ChartData[] = [];

        for (let i = 0; i < Math.min(ceData.length, peData.length); i++) {
          const ceCandle = ceData[i];
          const peCandle = peData[i];

          // Combine prices and volumes
          combinedData.push({
            time: Math.max(ceCandle.time, peCandle.time),
            open: (ceCandle.open || 0) + (peCandle.open || 0),
            high: (ceCandle.high || 0) + (peCandle.high || 0),
            low: (ceCandle.low || 0) + (peCandle.low || 0),
            close: (ceCandle.close || 0) + (peCandle.close || 0),
            volume: (ceCandle.volume || 0) + (peCandle.volume || 0), // Sum volumes
          });
        }

        setChartData(combinedData);
      } else {
        throw new Error(ceResult.error || peResult.error || 'Failed to load data');
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
  }, [user, baseSymbol, expiry, interval, lookbackDays, spotPrice]);

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

  const atmStrike = Math.round(spotPrice / 100) * 100;
  const displaySymbol = `${baseSymbol}${expiry}${atmStrike}`;

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

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-3 mb-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Base Symbol Input */}
            <div className="flex-shrink-0">
              <form onSubmit={handleSymbolSubmit} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                  placeholder="e.g., NIFTY, BANKNIFTY"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap"
                >
                  Load
                </button>
              </form>
            </div>

            {/* Expiry Selector */}
            <div className="flex-shrink-0">
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
              >
                <option value="13JAN">13 JAN</option>
                <option value="16JAN">16 JAN</option>
                <option value="23JAN">23 JAN</option>
                <option value="30JAN">30 JAN</option>
              </select>
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

            {/* ATM Strike Display */}
            <div className="flex-shrink-0 flex items-center gap-2">
              <span className="text-xs text-gray-600 whitespace-nowrap font-semibold">ATM Strike:</span>
              <span className="text-sm font-bold text-blue-600">{atmStrike}</span>
              <span className="text-xs text-gray-500">(Spot: ₹{spotPrice.toFixed(0)})</span>
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

'use client';

import { useState, useEffect } from 'react';
import VidyaTradingChart from '@/components/VidyaTradingChart';
import { useRealtimePrice } from '@/hooks/useRealtimePrice';
import { useMarketConfig } from '@/hooks/useMarketConfig';

export default function VidyaChartPage() {
  const { config: marketConfig } = useMarketConfig();
  const [symbol, setSymbol] = useState('NIFTY' + marketConfig.currentFuture);
  const [interval, setInterval] = useState('60minute');
  const [chartHeight, setChartHeight] = useState(600);
  const [lookbackDays, setLookbackDays] = useState(50);
  const userId = 'ZnT1kjZKElV6NJte2wgoDU5dF8j2';

  const [indicators, setIndicators] = useState({
    showVIDYA: true,
    showATRBands: true,
    showLiquidityZones: false,
    showVolumeProfile: true,
    showSignals: true,
    showTrendArrows: true,
    cmoPeriod: 10,
    atrPeriod: 20,
    bandMultiplier: 2.0,
  });

  // Real-time price updates
  const { prices, isConnected } = useRealtimePrice({
    symbols: [symbol],
  });

  // Debug: Log when prices change
  useEffect(() => {
    if (prices[symbol]) {
      console.log('[VIDYA Page] Price update received:', {
        symbol,
        last_price: prices[symbol]?.last_price,
        ohlc_close: prices[symbol]?.ohlc?.close,
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }, [prices, symbol]);

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

  // Auto-refresh trigger - DISABLED (chart updates via real-time candle updates only)
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // useEffect(() => {
  //   const interval = window.setInterval(() => {
  //     setRefreshTrigger((prev) => prev + 1);
  //   }, 3 * 60 * 1000); // 3 minutes in milliseconds
  //
  //   return () => window.clearInterval(interval);
  // }, []);

  const toggleIndicator = (indicator: keyof typeof indicators) => {
    if (typeof indicators[indicator] === 'boolean') {
      setIndicators((prev) => ({
        ...prev,
        [indicator]: !prev[indicator],
      }));
    }
  };

  const updateIndicatorPeriod = (indicator: 'cmoPeriod' | 'atrPeriod', value: number) => {
    setIndicators((prev) => ({
      ...prev,
      [indicator]: Math.max(5, Math.min(indicator === 'atrPeriod' ? 500 : 50, value)),
    }));
  };

  const updateBandMultiplier = (value: number) => {
    setIndicators((prev) => ({
      ...prev,
      bandMultiplier: Math.max(0.5, Math.min(5, value)),
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">VIDYA Trading Chart</h1>
          <p className="text-gray-600">
            Variable Index Dynamic Average with Volume Analysis, Liquidity Zones & Trend Detection
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Symbol Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
              >
                <optgroup label="NIFTY Futures (Current + Next 3 Months)">
                  {marketConfig.monthlyExpiries.map((exp) => (
                    <option key={`NIFTY-${exp.value}`} value={`NIFTY26${exp.value}FUT`}>
                      NIFTY 26 {exp.value} Futures
                    </option>
                  ))}
                </optgroup>
                <optgroup label="BANKNIFTY Futures (Current + Next 3 Months)">
                  {marketConfig.monthlyExpiries.map((exp) => (
                    <option key={`BANKNIFTY-${exp.value}`} value={`BANKNIFTY26${exp.value}FUT`}>
                      BANKNIFTY 26 {exp.value} Futures
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Stocks">
                  <option value="RELIANCE">RELIANCE</option>
                  <option value="TCS">TCS</option>
                  <option value="INFY">INFY</option>
                </optgroup>
              </select>
            </div>

            {/* Interval Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Interval</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
              >
                <option value="minute">1 Minute</option>
                <option value="3minute">3 Minute</option>
                <option value="5minute">5 Minute</option>
                <option value="15minute">15 Minute</option>
                <option value="60minute">1 Hour</option>
                <option value="day">1 Day</option>
              </select>
            </div>

            {/* Lookback Days */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Lookback Days</label>
              <input
                type="number"
                min="1"
                max="100"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
              />
            </div>

            {/* Connection Status */}
            <div className="flex flex-col items-end gap-2">
              <div
                className={`px-4 py-2 rounded-lg ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} font-medium`}
              >
                {isConnected ? '🟢 Live Data' : '🔴 Disconnected'}
              </div>
              <div className="px-3 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium">
                📊 Updates on candle change
              </div>
            </div>
          </div>

          {/* VIDYA Indicators Section */}
          <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="text-lg">📊</span> VIDYA Indicators & Parameters
            </h3>

            {/* Toggle Indicators */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              {/* Show VIDYA */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showVIDYA"
                  checked={indicators.showVIDYA}
                  onChange={() => toggleIndicator('showVIDYA')}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-2"
                />
                <label htmlFor="showVIDYA" className="text-sm font-medium text-gray-700">
                  VIDYA Line
                </label>
              </div>

              {/* Show ATR Bands */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showATRBands"
                  checked={indicators.showATRBands}
                  onChange={() => toggleIndicator('showATRBands')}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2"
                />
                <label htmlFor="showATRBands" className="text-sm font-medium text-gray-700">
                  ATR Bands
                </label>
              </div>

              {/* Show Liquidity Zones */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showLiquidityZones"
                  checked={indicators.showLiquidityZones}
                  onChange={() => toggleIndicator('showLiquidityZones')}
                  className="w-4 h-4 text-orange-600 rounded focus:ring-2"
                />
                <label htmlFor="showLiquidityZones" className="text-sm font-medium text-gray-700">
                  Liquidity Zones
                </label>
              </div>

              {/* Show Volume Profile */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showVolumeProfile"
                  checked={indicators.showVolumeProfile}
                  onChange={() => toggleIndicator('showVolumeProfile')}
                  className="w-4 h-4 text-cyan-600 rounded focus:ring-2"
                />
                <label htmlFor="showVolumeProfile" className="text-sm font-medium text-gray-700">
                  Volume Delta
                </label>
              </div>

              {/* Show Signals */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showSignals"
                  checked={indicators.showSignals}
                  onChange={() => toggleIndicator('showSignals')}
                  className="w-4 h-4 text-green-600 rounded focus:ring-2"
                />
                <label htmlFor="showSignals" className="text-sm font-medium text-gray-700">
                  Buy/Sell Signals
                </label>
              </div>

              {/* Show Trend Arrows */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showTrendArrows"
                  checked={indicators.showTrendArrows}
                  onChange={() => toggleIndicator('showTrendArrows')}
                  className="w-4 h-4 text-red-600 rounded focus:ring-2"
                />
                <label htmlFor="showTrendArrows" className="text-sm font-medium text-gray-700">
                  Trend Arrows
                </label>
              </div>
            </div>

            {/* Period Settings */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">CMO Period</label>
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={indicators.cmoPeriod}
                  onChange={(e) => updateIndicatorPeriod('cmoPeriod', parseInt(e.target.value) || 14)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">ATR Period</label>
                <input
                  type="number"
                  min="5"
                  max="500"
                  value={indicators.atrPeriod}
                  onChange={(e) => updateIndicatorPeriod('atrPeriod', parseInt(e.target.value) || 20)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Band Multiplier</label>
                <input
                  type="number"
                  min="0.5"
                  max="5"
                  step="0.1"
                  value={indicators.bandMultiplier}
                  onChange={(e) => updateBandMultiplier(parseFloat(e.target.value) || 2.0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
                />
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-600">
              💡 <strong>VIDYA (Volume-Weighted):</strong> Adaptive MA combining CMO (price momentum 70%) + Volume Delta (volume confirmation 30%).
              <strong> Formula:</strong> Alpha = F × (0.7 × |CMO|/100 + 0.3 × VolumeFactor). Reacts faster when BOTH price AND volume confirm the move.
              <strong> ATR Bands:</strong> Volatility zones for trend detection.
              <strong> Signals:</strong> Buy when price crosses above upper band with strong volume confirmation.
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <VidyaTradingChart
            symbol={symbol}
            interval={interval}
            userId={userId}
            height={chartHeight}
            lookbackDays={lookbackDays}
            indicators={indicators}
            realtimePrice={prices[symbol]?.last_price}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>
    </div>
  );
}

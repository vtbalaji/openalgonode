'use client';

import { useState, useEffect } from 'react';
import FibonacciTradingChart from '@/components/FibonacciTradingChart';
import { useRealtimePrice } from '@/hooks/useRealtimePrice';

export default function FibonacciChartPage() {
  const [symbol, setSymbol] = useState('NIFTY 50');
  const [interval, setInterval] = useState('60minute');
  const [chartHeight, setChartHeight] = useState(600);
  const [lookbackDays, setLookbackDays] = useState(50);
  const userId = 'ZnT1kjZKElV6NJte2wgoDU5dF8j2';

  const [indicators, setIndicators] = useState({
    // Fibonacci Tools
    showFibRetracement: true, // Auto-detect swing high/low and show retracement levels
    showFibExtension: false, // Show extension levels (127.2%, 161.8%, 261.8%)
    showHarmonicPattern: false, // Early harmonic pattern detection (XABCD)
    showSignals: true, // Fibonacci-based buy/sell signals

    // Volume Profile - removed from UI but keep for internal use
    volumeProfile: false,
    volumeProfileVisible: false,
    volumeProfileBins: 150,
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

  const toggleIndicator = (indicator: keyof typeof indicators) => {
    setIndicators((prev) => ({
      ...prev,
      [indicator]: !prev[indicator],
    }));
  };

  const updateIndicatorPeriod = (indicator: 'fastEma' | 'slowEma' | 'volumeProfileBins', value: number) => {
    setIndicators((prev) => ({
      ...prev,
      [indicator]: value,
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Fibonacci Trading Chart</h1>
          <p className="text-gray-600">Advanced Fibonacci retracement & extension analysis with real-time data</p>
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                <option value="NIFTY 50">NIFTY 50</option>
                <option value="NIFTY BANK">NIFTY BANK</option>
                <option value="RELIANCE">RELIANCE</option>
                <option value="TCS">TCS</option>
                <option value="INFY">INFY</option>
              </select>
            </div>

            {/* Interval Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Interval</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                <option value="minute">1 Minute</option>
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>

            {/* Connection Status */}
            <div className="flex items-end">
              <div className={`px-4 py-2 rounded-lg ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} font-medium`}>
                {isConnected ? '🟢 Live Data' : '🔴 Disconnected'}
              </div>
            </div>
          </div>

          {/* Fibonacci Tools Section */}
          <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="text-lg">📐</span> Fibonacci Tools
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Fibonacci Retracement */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showFibRetracement"
                  checked={indicators.showFibRetracement}
                  onChange={() => toggleIndicator('showFibRetracement')}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-2"
                />
                <label htmlFor="showFibRetracement" className="text-sm font-medium text-gray-700">
                  Retracement
                </label>
              </div>

              {/* Fibonacci Extension */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showFibExtension"
                  checked={indicators.showFibExtension}
                  onChange={() => toggleIndicator('showFibExtension')}
                  className="w-4 h-4 text-pink-600 rounded focus:ring-2"
                />
                <label htmlFor="showFibExtension" className="text-sm font-medium text-gray-700">
                  Extension
                </label>
              </div>

              {/* Harmonic Pattern */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="showHarmonicPattern"
                  checked={indicators.showHarmonicPattern}
                  onChange={() => toggleIndicator('showHarmonicPattern')}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2"
                />
                <label htmlFor="showHarmonicPattern" className="text-sm font-medium text-gray-700">
                  Harmonic (XABCD)
                </label>
              </div>

              {/* Buy/Sell Signals */}
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
            </div>
            <p className="mt-2 text-xs text-gray-600">
              💡 <strong>Strategy:</strong> Buy at Fibonacci support levels (38.2%, 50%, 61.8%) with trend confirmation.
              <strong> Harmonic:</strong> Early entry when price retraces to B (38.2%-61.8%), pulls back to C (38.2%-88.6%), then resumes trend.
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <FibonacciTradingChart
            symbol={symbol}
            interval={interval}
            userId={userId}
            height={chartHeight}
            lookbackDays={lookbackDays}
            indicators={indicators}
            realtimePrice={prices[symbol]}
          />
        </div>
      </div>
    </div>
  );
}

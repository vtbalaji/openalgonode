'use client';

import { useState, useEffect } from 'react';
import StraddleChart from '@/components/StraddleChart';
import { useRealtimePrice } from '@/hooks/useRealtimePrice';

export default function StraddleChartPage() {
  const [symbol, setSymbol] = useState('NIFTY26JANFUT');
  const [expiry, setExpiry] = useState('13JAN');
  const [chartHeight, setChartHeight] = useState(600);
  const [spotPrice, setSpotPrice] = useState(25683);
  const userId = 'ZnT1kjZKElV6NJte2wgoDU5dF8j2';

  // Get real-time price for ATM calculation
  const { prices, isConnected } = useRealtimePrice({
    symbols: [symbol],
  });

  // Update spot price from real-time data
  useEffect(() => {
    if (prices[symbol]?.last_price) {
      setSpotPrice(prices[symbol].last_price);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-white mb-2">Straddle Chart</h1>
          <p className="text-gray-400">
            ATM Options Premium (CE + PE) with Combined Volume
          </p>
        </div>

        {/* Controls */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg shadow-lg p-6 mb-6 border border-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Underlying Symbol */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Underlying
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="NIFTY26JANFUT">NIFTY 26 Jan</option>
                <option value="NIFTY29JANFUT">NIFTY 29 Jan</option>
                <option value="BANKNIFTY26JANFUT">BANK NIFTY 26 Jan</option>
              </select>
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Option Expiry
              </label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="13JAN">13 JAN</option>
                <option value="16JAN">16 JAN</option>
                <option value="23JAN">23 JAN</option>
                <option value="30JAN">30 JAN</option>
              </select>
            </div>

            {/* ATM Strike Info */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ATM Strike
              </label>
              <div className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-semibold">
                {(Math.round(spotPrice / 100) * 100).toLocaleString('en-IN')}
              </div>
            </div>

            {/* Status */}
            <div className="flex flex-col items-end gap-2">
              <div
                className={`px-4 py-2 rounded-lg font-medium ${
                  isConnected
                    ? 'bg-green-900 text-green-400'
                    : 'bg-red-900 text-red-400'
                }`}
              >
                {isConnected ? '🟢 Live' : '🔴 Offline'}
              </div>
              <div className="text-sm text-gray-400">
                Spot: ₹{spotPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="mt-4 p-4 bg-slate-900 rounded border border-slate-700">
            <p className="text-sm text-gray-400">
              <strong>📊 Real-time Straddle Premium:</strong> Real-time sum of Call (CE) and Put (PE) option prices at ATM strike.
              <strong> Volume:</strong> Combined CE and PE volumes.
              <strong> Data:</strong> Last 1-3 days of real-time quotes, updated every 60 seconds. Strike is auto-detected based on current spot price (rounded to nearest 100).
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-slate-950 rounded-lg shadow-lg p-4 border border-slate-700">
          <StraddleChart
            baseSymbol={symbol.replace(/\d.*/, '')} // NIFTY26JANFUT → NIFTY
            expiry={expiry}
            userId={userId}
            height={chartHeight}
            spotPrice={spotPrice}
            autoRefresh={true}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Real-time Price Ticker Component
 * Displays live price updates via WebSocket
 */

'use client';

import { useRealtimePrice, PriceData } from '@/hooks/useRealtimePrice';
import { useEffect, useState } from 'react';

interface RealtimePriceTickerProps {
  symbol: string;
  broker?: string;
}

export function RealtimePriceTicker({ symbol, broker = 'zerodha' }: RealtimePriceTickerProps) {
  const { prices, isConnected, error } = useRealtimePrice({
    symbols: [symbol],
    broker,
  });

  const priceData = prices[symbol];
  const [priceAnimation, setPriceAnimation] = useState<'up' | 'down' | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);

  // Animate price changes
  useEffect(() => {
    if (priceData && prevPrice !== null) {
      if (priceData.last_price > prevPrice) {
        setPriceAnimation('up');
      } else if (priceData.last_price < prevPrice) {
        setPriceAnimation('down');
      }

      const timer = setTimeout(() => setPriceAnimation(null), 500);
      return () => clearTimeout(timer);
    }

    if (priceData) {
      setPrevPrice(priceData.last_price);
    }
  }, [priceData?.last_price]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="text-red-600 font-semibold">Connection Error</div>
        <div className="text-red-500 text-sm mt-1">{error}</div>
      </div>
    );
  }

  if (!priceData) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          <span className="text-gray-600">Connecting to live feed...</span>
        </div>
      </div>
    );
  }

  const isPositive = priceData.change >= 0;
  const changePercent = ((priceData.change / priceData.ohlc.close) * 100).toFixed(2);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
      {/* Header with connection status */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">{symbol}</h2>
          <p className="text-blue-100 text-sm">NSE</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-white text-xs">{isConnected ? 'LIVE' : 'Offline'}</span>
        </div>
      </div>

      {/* Price Display */}
      <div className="p-6">
        <div className="mb-6">
          <div
            className={`text-5xl font-bold transition-all duration-300 ${
              priceAnimation === 'up'
                ? 'text-green-600 scale-105'
                : priceAnimation === 'down'
                ? 'text-red-600 scale-105'
                : 'text-gray-900'
            }`}
          >
            ₹{priceData.last_price.toFixed(2)}
          </div>
          <div className={`text-xl font-semibold mt-2 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '↑' : '↓'} {Math.abs(priceData.change).toFixed(2)} ({changePercent}%)
          </div>
        </div>

        {/* OHLC Data */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase mb-1">Open</div>
            <div className="text-lg font-semibold text-gray-900">₹{priceData.ohlc.open.toFixed(2)}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase mb-1">High</div>
            <div className="text-lg font-semibold text-green-600">₹{priceData.ohlc.high.toFixed(2)}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase mb-1">Low</div>
            <div className="text-lg font-semibold text-red-600">₹{priceData.ohlc.low.toFixed(2)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase mb-1">Close</div>
            <div className="text-lg font-semibold text-gray-900">₹{priceData.ohlc.close.toFixed(2)}</div>
          </div>
        </div>

        {/* Volume */}
        {priceData.volume ? (
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Volume Traded</span>
              <span className="text-lg font-bold text-blue-600">{priceData.volume.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 rounded-lg p-4 text-gray-500 text-sm">
            Volume data not available for indices
          </div>
        )}

        {/* Timestamp */}
        <div className="mt-4 text-xs text-gray-400 text-center">
          Last updated: {new Date(priceData.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

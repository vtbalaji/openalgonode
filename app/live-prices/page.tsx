/**
 * Live Prices Page
 * Real-time price monitoring with WebSocket
 */

'use client';

import { useState, useEffect } from 'react';
import { RealtimePriceTicker } from '@/components/RealtimePriceTicker';

export default function LivePricesPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NIFTY 50');
  const [customSymbol, setCustomSymbol] = useState<string>('');
  const [watchlist, setWatchlist] = useState<string[]>(['NIFTY 50']);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);

  useEffect(() => {
    // Load available symbols from API
    fetch('/api/symbols/list?broker=zerodha')
      .then((res) => res.json())
      .then((data) => setAvailableSymbols(data.symbols || []))
      .catch(console.error);
  }, []);

  const handleAddSymbol = () => {
    const symbol = customSymbol.toUpperCase().trim();
    if (symbol && !watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
      setCustomSymbol('');
      setSelectedSymbol(symbol);
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    setWatchlist(watchlist.filter((s) => s !== symbol));
    if (selectedSymbol === symbol && watchlist.length > 0) {
      setSelectedSymbol(watchlist[0]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Live Market Prices
          </h1>
          <p className="text-gray-600">
            Real-time price updates via WebSocket
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Watchlist Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Watchlist</h2>

              {/* Add Symbol Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add Symbol
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customSymbol}
                    onChange={(e) => setCustomSymbol(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddSymbol()}
                    placeholder="e.g., RELIANCE"
                    className="flex-1 px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                    list="symbols-list"
                  />
                  <button
                    onClick={handleAddSymbol}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
                <datalist id="symbols-list">
                  {availableSymbols.map((symbol) => (
                    <option key={symbol} value={symbol} />
                  ))}
                </datalist>
              </div>

              {/* Watchlist Items */}
              <div className="space-y-2">
                {watchlist.map((symbol) => (
                  <div
                    key={symbol}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedSymbol === symbol
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                    onClick={() => setSelectedSymbol(symbol)}
                  >
                    <span className="font-semibold text-gray-900">{symbol}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSymbol(symbol);
                      }}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Popular Indices */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Popular Indices
                </h3>
                <div className="flex flex-wrap gap-2">
                  {['NIFTY 50', 'NIFTY BANK', 'INDIA VIX'].map((symbol) => (
                    <button
                      key={symbol}
                      onClick={() => {
                        if (!watchlist.includes(symbol)) {
                          setWatchlist([...watchlist, symbol]);
                        }
                        setSelectedSymbol(symbol);
                      }}
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Info Card */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg
                  className="w-5 h-5 text-blue-600 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">
                    Real-time Updates
                  </h4>
                  <p className="text-xs text-blue-700">
                    Prices are streamed live via WebSocket. Green indicator means connected.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Price Display */}
          <div className="lg:col-span-2">
            {selectedSymbol ? (
              <RealtimePriceTicker symbol={selectedSymbol} broker="zerodha" />
            ) : (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <svg
                  className="mx-auto h-16 w-16 text-gray-400 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No Symbol Selected
                </h3>
                <p className="text-gray-600">
                  Select a symbol from your watchlist or add a new one
                </p>
              </div>
            )}

            {/* Multi-Symbol Grid View */}
            {watchlist.length > 1 && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {watchlist
                  .filter((symbol) => symbol !== selectedSymbol)
                  .slice(0, 4)
                  .map((symbol) => (
                    <div
                      key={symbol}
                      onClick={() => setSelectedSymbol(symbol)}
                      className="cursor-pointer transform transition-all hover:scale-105"
                    >
                      <RealtimePriceTicker symbol={symbol} broker="zerodha" />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

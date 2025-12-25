/**
 * WebSocket Diagnostic Page
 * Test real-time connection with detailed logging
 */

'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function TestWebSocketPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [symbol, setSymbol] = useState('RELIANCE');

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
    console.log(message);
  };

  const connect = () => {
    if (!user) {
      addLog('❌ Error: No user logged in');
      return;
    }

    addLog(`🔌 Connecting to stream for symbol: ${symbol}`);
    addLog(`👤 User ID: ${user.uid}`);

    const url = `/api/stream/prices?symbols=${symbol}&userId=${user.uid}&broker=zerodha`;
    addLog(`📍 URL: ${url}`);

    const es = new EventSource(url);

    es.onopen = () => {
      addLog('✅ EventSource connection opened');
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          addLog(`🟢 Connected to symbols: ${data.symbols.join(', ')}`);
          addLog(`📊 Instrument tokens: ${data.tokens.join(', ')}`);
        } else if (data.type === 'tick') {
          addLog(`📈 TICK: ${data.symbol} = ₹${data.data.last_price} (${data.data.change > 0 ? '+' : ''}${data.data.change})`);
        } else if (data.type === 'heartbeat') {
          addLog(`💓 Heartbeat: ${data.timestamp}`);
        } else {
          addLog(`📦 Unknown message type: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        addLog(`❌ Error parsing message: ${err}`);
      }
    };

    es.onerror = (err) => {
      addLog(`❌ EventSource error: ${JSON.stringify(err)}`);
      addLog(`   ReadyState: ${es.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
      setIsConnected(false);

      // Don't auto-reconnect for debugging
      if (es.readyState === 2) {
        addLog('⛔ Connection closed. Click Connect to retry.');
      }
    };

    setEventSource(es);
  };

  const disconnect = () => {
    if (eventSource) {
      addLog('🔌 Disconnecting...');
      eventSource.close();
      setEventSource(null);
      setIsConnected(false);
      addLog('✅ Disconnected');
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            WebSocket Diagnostic Tool
          </h1>
          <p className="text-gray-600 mb-6">
            Test real-time price streaming with detailed logging
          </p>

          {/* Connection Status */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="font-semibold">
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </span>
            </div>
            {user && (
              <div className="mt-2 text-sm text-gray-600">
                User: {user.email} (ID: {user.uid.substring(0, 10)}...)
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Symbol to Test
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., RELIANCE"
                disabled={isConnected}
              />
            </div>
            <div className="flex items-end space-x-2">
              <button
                onClick={connect}
                disabled={isConnected || !user}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isConnected ? 'Connected' : 'Connect'}
              </button>
              <button
                onClick={disconnect}
                disabled={!isConnected}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={clearLogs}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Clear Logs
              </button>
            </div>
          </div>

          {!user && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800">
                ⚠️ You must be logged in to test WebSocket connection.
              </p>
            </div>
          )}
        </div>

        {/* Log Console */}
        <div className="bg-gray-900 rounded-lg shadow-md overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
            <span className="text-gray-300 font-semibold">Console Output</span>
            <span className="text-gray-400 text-sm">{logs.length} messages</span>
          </div>
          <div className="p-4 h-96 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center mt-8">
                No logs yet. Click Connect to start.
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`mb-1 ${
                    log.includes('❌') || log.includes('Error')
                      ? 'text-red-400'
                      : log.includes('✅') || log.includes('Connected')
                      ? 'text-green-400'
                      : log.includes('📈')
                      ? 'text-blue-400'
                      : 'text-gray-300'
                  }`}
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Troubleshooting Tips */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            Troubleshooting Tips
          </h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li>✓ Ensure you're logged in</li>
            <li>✓ Go to Broker Configuration and authenticate with Zerodha</li>
            <li>✓ Check that symbol is supported (RELIANCE, TCS, INFY, etc.)</li>
            <li>✓ Market should be open (9:15 AM - 3:30 PM IST) for live data</li>
            <li>✓ Check browser console (F12) for additional errors</li>
            <li>✓ Check server console for WebSocket connection logs</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

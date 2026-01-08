'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function FyersDebugPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const runTest = async (testName: string, endpoint: string) => {
    if (!user) {
      addLog('ERROR: Not logged in');
      return;
    }

    setLoading(testName);
    addLog(`Starting: ${testName}`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
        }),
      });

      addLog(`Response status: ${response.status}`);

      let data: any;
      try {
        data = await response.json();
      } catch (parseError: any) {
        addLog(`ERROR: Failed to parse response as JSON: ${parseError.message}`);
        const text = await response.text();
        addLog(`Response text: ${text.substring(0, 200)}`);
        setResults((prev: any) => ({
          ...prev,
          [testName]: {
            status: response.status,
            error: `JSON parse error: ${parseError.message}`,
            responseText: text.substring(0, 500),
            success: false,
          },
        }));
        setLoading(null);
        return;
      }

      if (response.ok) {
        addLog(`✓ ${testName} completed successfully`);
        setResults((prev: any) => ({
          ...prev,
          [testName]: {
            status: response.status,
            data,
            success: true,
          },
        }));
      } else {
        addLog(`✗ ${testName} failed: ${data.error || 'Unknown error'}`);
        setResults((prev: any) => ({
          ...prev,
          [testName]: {
            status: response.status,
            error: data.error,
            data,
            success: false,
          },
        }));
      }
    } catch (error: any) {
      addLog(`✗ ${testName} network error: ${error.message}`);
      setResults((prev: any) => ({
        ...prev,
        [testName]: {
          error: error.message,
          success: false,
        },
      }));
    } finally {
      setLoading(null);
    }
  };

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">Fyers Debug Tool</h1>
        <p className="text-red-600 mt-4">Please log in first</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Fyers API Debug Tool</h1>
      <p className="text-gray-600 mb-6">User ID: {user.uid}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Tests */}
        <div>
          <h2 className="text-xl font-bold mb-4">Test Endpoints</h2>
          <div className="space-y-3">
            <button
              onClick={() => runTest('Orderbook', '/api/broker/fyers/orderbook')}
              disabled={loading === 'Orderbook'}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
            >
              {loading === 'Orderbook' ? 'Testing...' : 'Test Orderbook'}
            </button>

            <button
              onClick={() => runTest('Positions', '/api/broker/fyers/positions')}
              disabled={loading === 'Positions'}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
            >
              {loading === 'Positions' ? 'Testing...' : 'Test Positions'}
            </button>

            <button
              onClick={() => runTest('Holdings', '/api/broker/fyers/holdings')}
              disabled={loading === 'Holdings'}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
            >
              {loading === 'Holdings' ? 'Testing...' : 'Test Holdings'}
            </button>

            <button
              onClick={() => runTest('Funds', '/api/broker/fyers/funds')}
              disabled={loading === 'Funds'}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
            >
              {loading === 'Funds' ? 'Testing...' : 'Test Funds'}
            </button>

            <hr className="my-4" />

            <button
              onClick={() => runTest('Token Validation', '/api/test/validate-fyers-token')}
              disabled={loading === 'Token Validation'}
              className="w-full px-4 py-2 bg-orange-600 text-white rounded disabled:bg-gray-400"
            >
              {loading === 'Token Validation' ? 'Testing...' : 'Validate Token'}
            </button>

            <button
              onClick={() => runTest('AppId Debug', '/api/test/fyers-appid-debug')}
              disabled={loading === 'AppId Debug'}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded disabled:bg-gray-400"
            >
              {loading === 'AppId Debug' ? 'Testing...' : 'Test AppId Formats'}
            </button>

            <button
              onClick={() => {
                setLogs([]);
                setResults(null);
              }}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded mt-4"
            >
              Clear Results
            </button>
          </div>
        </div>

        {/* Right Column - Logs */}
        <div>
          <h2 className="text-xl font-bold mb-4">Execution Logs</h2>
          <div className="bg-black text-green-400 p-4 rounded font-mono text-sm max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500">Logs will appear here...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap break-words">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Results Section */}
      {results && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">Results</h2>
          <div className="grid grid-cols-1 gap-4">
            {Object.entries(results).map(([testName, result]: [string, any]) => (
              <div
                key={testName}
                className={`p-4 rounded border-2 ${
                  result.success ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                }`}
              >
                <h3 className="font-bold text-lg mb-2">{testName}</h3>
                <p className={`mb-2 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                  Status: {result.status || 'N/A'}
                  {result.success ? ' ✓' : ' ✗'}
                </p>
                {result.error && <p className="text-red-700 mb-2">Error: {result.error}</p>}
                {result.responseText && (
                  <div className="mb-2">
                    <p className="text-sm font-semibold">Response Text:</p>
                    <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                      {result.responseText}
                    </pre>
                  </div>
                )}
                {result.data && (
                  <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded p-4">
        <h3 className="font-bold mb-2">How to Use:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li><strong>First:</strong> Click "Validate Token" to check if your access token is valid and not expired</li>
          <li>Check the results - it shows token expiry date and JWT payload details</li>
          <li>Then click "Test AppId Formats" to test 4 different ways of sending app_id to Fyers</li>
          <li>Then test individual endpoints (Orderbook, Positions, Holdings, Funds)</li>
          <li>Check the browser console (F12) for detailed logs from fyersClient.ts</li>
          <li>Look for logs starting with [FYERS-*], [*-ROUTE], or [VALIDATE]</li>
        </ol>
      </div>

      {/* Important Notes */}
      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded p-4">
        <h3 className="font-bold mb-2">Important:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Open your dev server terminal (where you ran `npm run dev`) to see server logs</li>
          <li>The most important logs are the ones showing the app_id value being sent</li>
          <li>If app_id is undefined/null, that's the root cause</li>
          <li>The "AppId Debug" endpoint tests 4 methods to send app_id, check which works</li>
        </ul>
      </div>
    </div>
  );
}

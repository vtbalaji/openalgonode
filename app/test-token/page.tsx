'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function TestTokenPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testStoredToken = async () => {
    if (!user) {
      setError('Please log in first');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const idToken = await user.getIdToken();
      console.log('[TEST-PAGE] Testing with idToken:', idToken.substring(0, 50) + '...');

      const response = await fetch('/api/test/fyers-stored-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json();
      console.log('[TEST-PAGE] Response:', data);
      setResult(data);

      if (!response.ok) {
        setError(data.error || 'Test failed');
      }
    } catch (err: any) {
      console.error('[TEST-PAGE] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testOrderbook = async () => {
    if (!user) {
      setError('Please log in first');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const idToken = await user.getIdToken();
      console.log('[TEST-PAGE] Testing orderbook endpoint');

      const response = await fetch('/api/broker/fyers/orderbook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      const data = await response.json();
      console.log('[TEST-PAGE] Orderbook response:', data);
      setResult(data);

      if (!response.ok) {
        setError(data.error || `HTTP ${response.status}`);
      }
    } catch (err: any) {
      console.error('[TEST-PAGE] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Test Token</h1>
          <p className="text-red-600">Please log in first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Fyers Token Test</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Logged in as</h2>
          <p className="text-gray-700">{user.email}</p>
          <p className="text-gray-700">UID: {user.uid}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Tests</h2>
          <div className="space-y-4">
            <button
              onClick={testStoredToken}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Testing...' : 'Test 1: Check Stored Token'}
            </button>
            <p className="text-sm text-gray-600">
              Shows what token is stored in Firestore (should be access_token, NOT JWT)
            </p>

            <button
              onClick={testOrderbook}
              disabled={loading}
              className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Testing...' : 'Test 2: Get Orderbook'}
            </button>
            <p className="text-sm text-gray-600">
              Tests if we can fetch orderbook with the stored token
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <h3 className="font-semibold text-red-900 mb-2">Error</h3>
            <p className="text-red-700 font-mono text-sm break-all">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Result</h3>
            <pre className="text-xs overflow-auto bg-white p-4 rounded border border-gray-200">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

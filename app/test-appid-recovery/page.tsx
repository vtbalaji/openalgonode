'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

export default function AppIdRecoveryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [testLoading, setTestLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const tryExtractAppId = async () => {
    if (!user) {
      setError('Please log in first');
      return;
    }

    setTestLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('[TEST] Getting ID token...');
      const idToken = await user.getIdToken();
      console.log('[TEST] Got token, making request to /api/test/extract-and-save-appid');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('/api/test/extract-and-save-appid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[TEST] Got response status:', response.status);

      const data = await response.json();
      console.log('[TEST] Response data:', data);
      setResult(data);

      if (!response.ok) {
        setError(data.error || `HTTP ${response.status}`);
      } else {
        setError(null);
      }
    } catch (err: any) {
      console.error('[TEST] Error:', err);
      if (err.name === 'AbortError') {
        setError('Request timed out after 10 seconds');
      } else {
        setError(err.message || 'Unknown error');
      }
    } finally {
      setTestLoading(false);
    }
  };

  const tryTestOrderbook = async () => {
    if (!user) {
      setError('Please log in first');
      return;
    }

    setTestLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('[TEST] Getting ID token for orderbook test...');
      const idToken = await user.getIdToken();
      console.log('[TEST] Got token, testing orderbook endpoint');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('/api/broker/fyers/orderbook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userId: user.uid }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[TEST] Orderbook response status:', response.status);

      const data = await response.json();
      console.log('[TEST] Orderbook response data:', data);
      setResult(data);

      if (!response.ok) {
        setError(data.error || `HTTP ${response.status}`);
      } else {
        setError(null);
      }
    } catch (err: any) {
      console.error('[TEST] Error:', err);
      if (err.name === 'AbortError') {
        setError('Request timed out after 10 seconds');
      } else {
        setError(err.message || 'Unknown error');
      }
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Fix Missing app_id</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Your Account</h2>
          <p className="text-gray-700">Email: {user.email}</p>
          <p className="text-gray-700">UID: {user.uid}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Option 1: Try Auto-Extract</h2>
          <p className="text-gray-600 mb-4">
            If your stored token is still the original JWT from OAuth, this can extract the app_id without re-authenticating.
          </p>
          <button
            onClick={tryExtractAppId}
            disabled={testLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {testLoading ? '⏳ Extracting... (check console)' : 'Try to Extract app_id'}
          </button>
          {testLoading && (
            <p className="mt-3 text-sm text-gray-600">
              ⏳ Request in progress... Check browser console (F12) for detailed logs
            </p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Option 2: Test Orderbook</h2>
          <p className="text-gray-600 mb-4">
            If app_id extraction worked, the orderbook endpoint should now work.
          </p>
          <button
            onClick={tryTestOrderbook}
            disabled={testLoading}
            className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {testLoading ? 'Testing...' : 'Test Orderbook Endpoint'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Option 3: Re-authenticate</h2>
          <p className="text-gray-600 mb-4">
            If extraction fails, go back and re-authenticate with Fyers. This will extract and save the app_id properly.
          </p>
          <button
            onClick={() => router.push('/broker/config')}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 font-medium"
          >
            Go to Broker Config
          </button>
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
            <pre className="text-xs overflow-auto bg-white p-4 rounded border border-gray-200 max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

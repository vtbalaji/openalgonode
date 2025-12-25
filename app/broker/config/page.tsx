'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllBrokers, getBrokerConfig } from '@/lib/brokerConfig';

export default function BrokerConfigPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [selectedBroker, setSelectedBroker] = useState('zerodha');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [requestToken, setRequestToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<'active' | 'inactive' | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  const brokerConfig = getBrokerConfig(selectedBroker);
  const allBrokers = getAllBrokers();

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchBrokerConfig();
    }
  }, [user, selectedBroker]);

  const fetchBrokerConfig = async () => {
    try {
      const idToken = await user?.getIdToken();
      const response = await fetch(`/api/broker/config?broker=${selectedBroker}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAuthStatus(data.status);
      } else {
        setAuthStatus(null);
      }
    } catch (err) {
      console.error('Error fetching config:', err);
      setAuthStatus(null);
    } finally {
      setIsFetching(false);
    }
  };

  const handleGetLoginUrl = async () => {
    try {
      const idToken = await user?.getIdToken();
      const response = await fetch(`/api/broker/login-url?broker=${selectedBroker}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Redirect to broker login page
        window.location.href = data.loginUrl;
      } else {
        const data = await response.json();
        setError(data.error || 'Please save your broker configuration first.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!apiKey || !apiSecret) {
      setError('API Key and API Secret are required');
      setIsLoading(false);
      return;
    }

    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/broker/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          broker: selectedBroker,
          apiKey,
          apiSecret,
        }),
      });

      if (response.ok) {
        setSuccess('Broker configuration saved successfully!');
        setApiKey('');
        setApiSecret('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!requestToken) {
      setError('Request Token is required');
      setIsLoading(false);
      return;
    }

    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/broker/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          broker: selectedBroker,
          requestToken,
        }),
      });

      if (response.ok) {
        setSuccess('Authentication successful! You can now place orders.');
        setRequestToken('');
        setAuthStatus('active');
      } else {
        const data = await response.json();
        setError(data.error || 'Authentication failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || isFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                ← Back to Dashboard
              </Link>
              <h1 className="mt-2 text-3xl font-bold text-gray-900">Broker Configuration</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Status Card */}
        <div className={`mb-8 rounded-lg p-6 ${authStatus === 'active' ? 'bg-green-50' : 'bg-yellow-50'}`}>
          <h2 className={`text-lg font-semibold ${authStatus === 'active' ? 'text-green-900' : 'text-yellow-900'}`}>
            Status: <span className="capitalize">{authStatus || 'Not configured'}</span>
          </h2>
          <p className={`mt-2 ${authStatus === 'active' ? 'text-green-700' : 'text-yellow-700'}`}>
            {authStatus === 'active'
              ? 'Your broker is authenticated and ready to use.'
              : 'Please configure your broker credentials and authenticate.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-lg bg-green-50 p-4 text-green-700">
            {success}
          </div>
        )}

        {/* Configuration Form */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-6 text-2xl font-semibold text-gray-900">Step 1: Save API Credentials</h2>
          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* Broker Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Select Broker</label>
              <select
                value={selectedBroker}
                onChange={(e) => setSelectedBroker(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
              >
                {allBrokers.map((broker) => (
                  <option key={broker.id} value={broker.id}>
                    {broker.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                placeholder={`Your ${brokerConfig?.displayName} API Key`}
                required
              />
            </div>

            {brokerConfig?.requiresApiSecret && (
              <div>
                <label className="block text-sm font-medium text-gray-700">API Secret</label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                  placeholder={`Your ${brokerConfig?.displayName} API Secret`}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save Credentials'}
            </button>
          </form>
        </div>

        {/* Authentication Form - Only show if broker requires request token */}
        {brokerConfig?.requiresRequestToken && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-6 text-2xl font-semibold text-gray-900">Step 2: Authenticate</h2>
            <p className="mb-6 text-gray-600">
              Click the button below to open {brokerConfig.displayName} login page, then paste the request token here.
            </p>

            {/* Automatic Authentication Button */}
            <button
              type="button"
              onClick={handleGetLoginUrl}
              className="mb-4 w-full rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition hover:bg-green-700"
            >
              Authenticate with {brokerConfig.displayName}
            </button>

            <div className="mb-4 rounded-lg bg-blue-50 p-4">
              <h3 className="font-semibold text-blue-900">Automatic Authentication</h3>
              <p className="mt-2 text-sm text-blue-800">
                Click the button above to be redirected to {brokerConfig.displayName} login. After you log in,
                you'll be automatically authenticated and redirected back to place orders. No manual steps required!
              </p>
            </div>

            {/* Manual authentication fallback */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                Manual Authentication (Advanced)
              </summary>
              <form onSubmit={handleAuthenticate} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Request Token</label>
                  <input
                    type="text"
                    value={requestToken}
                    onChange={(e) => setRequestToken(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                    placeholder={`Your ${brokerConfig.displayName} request token`}
                    required
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    If automatic authentication fails, paste the request_token here manually
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-lg bg-green-600 px-6 py-2 font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? 'Authenticating...' : 'Authenticate Manually'}
                </button>
              </form>
            </details>
          </div>
        )}
      </main>
    </div>
  );
}

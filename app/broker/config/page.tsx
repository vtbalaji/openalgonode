'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllBrokers, getBrokerConfig } from '@/lib/brokerConfig';
import { BrokerAuthStatus } from '@/components/BrokerAuthStatus';

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
  const [lastAuthenticatedAt, setLastAuthenticatedAt] = useState<Date | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [credentialsExist, setCredentialsExist] = useState(false);
  const [editMode, setEditMode] = useState(false);

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
        setValidationError(data.validationError || null);
        setCredentialsExist(data.credentialsExist || false);
        setEditMode(false);  // Start in view mode if credentials exist

        if (data.lastAuthenticated) {
          const dateObj = new Date(data.lastAuthenticated);
          // Validate the date is valid
          if (!isNaN(dateObj.getTime())) {
            setLastAuthenticatedAt(dateObj);
          } else {
            setLastAuthenticatedAt(null);
          }
        } else {
          setLastAuthenticatedAt(null);
        }
      } else {
        setAuthStatus(null);
        setLastAuthenticatedAt(null);
        setValidationError(null);
        setCredentialsExist(false);
        setEditMode(true);  // Show edit mode if credentials don't exist
      }
    } catch (err) {
      console.error('Error fetching config:', err);
      setAuthStatus(null);
      setLastAuthenticatedAt(null);
      setValidationError(null);
      setCredentialsExist(false);
      setEditMode(true);
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
        setLastAuthenticatedAt(new Date());
        // Refresh config after a short delay
        setTimeout(() => {
          fetchBrokerConfig();
        }, 1000);
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
        <div className="mb-8">
          <BrokerAuthStatus
            lastAuthenticatedAt={lastAuthenticatedAt}
            broker={selectedBroker}
            onReAuth={handleGetLoginUrl}
            showDetails={true}
            compact={false}
          />
        </div>

        {validationError && (
          <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-yellow-800">
            <p className="font-medium mb-2">⚠️ Authentication Issue</p>
            <p>{validationError}</p>
            <button
              onClick={handleGetLoginUrl}
              className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded font-medium transition"
            >
              Re-authenticate Now
            </button>
          </div>
        )}

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
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-gray-900">Step 1: Save API Credentials</h2>
            {credentialsExist && (
              <button
                type="button"
                onClick={() => setEditMode(!editMode)}
                className={`px-4 py-2 rounded font-medium transition ${
                  editMode
                    ? 'bg-gray-300 hover:bg-gray-400 text-gray-900'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {editMode ? 'Cancel' : 'Edit Credentials'}
              </button>
            )}
          </div>

          {credentialsExist && !editMode && (
            <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
              <p className="text-blue-900">✅ API credentials are already configured</p>
            </div>
          )}

          <form onSubmit={handleSaveConfig} className="space-y-4" style={{ display: credentialsExist && !editMode ? 'none' : 'block' }}>
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
              {credentialsExist && !editMode ? (
                <input
                  type="text"
                  value="••••••••••••••••"
                  disabled
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-600 bg-gray-100 cursor-not-allowed"
                />
              ) : (
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                  placeholder={`Your ${brokerConfig?.displayName} API Key`}
                  required
                />
              )}
            </div>

            {brokerConfig?.requiresApiSecret && (
              <div>
                <label className="block text-sm font-medium text-gray-700">API Secret</label>
                {credentialsExist && !editMode ? (
                  <input
                    type="password"
                    value="••••••••••••••••"
                    disabled
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-600 bg-gray-100 cursor-not-allowed"
                  />
                ) : (
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                    placeholder={`Your ${brokerConfig?.displayName} API Secret`}
                    required
                  />
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : editMode && credentialsExist ? 'Update Credentials' : 'Save Credentials'}
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

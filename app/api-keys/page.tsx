'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllBrokers } from '@/lib/brokerConfig';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  broker: string;
  status: 'active' | 'revoked';
  createdAt: any;
  lastUsedAt?: any;
  usageCount: number;
}

export default function ApiKeysPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create new key form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyBroker, setNewKeyBroker] = useState('zerodha');
  const [createdKey, setCreatedKey] = useState<{ key: string; secret: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const allBrokers = getAllBrokers();

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchApiKeys();
    }
  }, [user]);

  const fetchApiKeys = async () => {
    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/apikeys/list', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.keys);
      } else {
        setError('Failed to fetch API keys');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsCreating(true);

    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/apikeys/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newKeyName,
          broker: newKeyBroker,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCreatedKey({ key: data.key, secret: data.secret });
        setSuccess('API key created successfully!');
        setNewKeyName('');
        setShowCreateForm(false);
        fetchApiKeys();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create API key');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/apikeys/revoke', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyId }),
      });

      if (response.ok) {
        setSuccess('API key revoked successfully');
        fetchApiKeys();
      } else {
        setError('Failed to revoke API key');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  if (loading || isLoading) {
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
              <h1 className="mt-2 text-3xl font-bold text-gray-900">API Keys</h1>
              <p className="mt-2 text-sm text-gray-600">
                Manage your API keys for external access (TradingView, Python scripts, etc.)
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition hover:bg-blue-700"
            >
              {showCreateForm ? 'Cancel' : 'Create New Key'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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

        {/* Display created key (one-time) */}
        {createdKey && (
          <div className="mb-6 rounded-lg bg-yellow-50 border-2 border-yellow-400 p-6">
            <h2 className="text-lg font-semibold text-yellow-900 mb-4">
              ⚠️ Save Your API Key - You Won't See This Again!
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-yellow-900">API Key:</label>
                <div className="mt-1 flex gap-2">
                  <code className="flex-1 rounded bg-white px-3 py-2 text-sm font-mono">
                    {createdKey.key}
                  </code>
                  <button
                    onClick={() => copyToClipboard(createdKey.key)}
                    className="rounded bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-yellow-900">API Secret:</label>
                <div className="mt-1 flex gap-2">
                  <code className="flex-1 rounded bg-white px-3 py-2 text-sm font-mono">
                    {createdKey.secret}
                  </code>
                  <button
                    onClick={() => copyToClipboard(createdKey.secret)}
                    className="rounded bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="mt-4 text-sm text-yellow-900 underline"
            >
              I've saved my keys
            </button>
          </div>
        )}

        {/* Create Key Form */}
        {showCreateForm && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Create New API Key</h2>
            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                  placeholder="e.g., TradingView, Python Script"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Broker</label>
                <select
                  value={newKeyBroker}
                  onChange={(e) => setNewKeyBroker(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                >
                  {allBrokers.map((broker) => (
                    <option key={broker.id} value={broker.id}>
                      {broker.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create API Key'}
              </button>
            </form>
          </div>
        )}

        {/* API Keys List */}
        <div className="rounded-lg bg-white shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Your API Keys</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {apiKeys.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                No API keys yet. Create one to get started!
              </div>
            ) : (
              apiKeys.map((key) => (
                <div key={key.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">{key.name}</h3>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                          key.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {key.status}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        <span className="font-medium">Broker:</span> {key.broker}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        <span className="font-medium">Key:</span> {key.key.substring(0, 20)}...
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        Created: {new Date(key.createdAt._seconds * 1000).toLocaleDateString()} •
                        Used: {key.usageCount} times
                        {key.lastUsedAt && ` • Last used: ${new Date(key.lastUsedAt._seconds * 1000).toLocaleDateString()}`}
                      </div>
                    </div>
                    {key.status === 'active' && (
                      <button
                        onClick={() => handleRevokeKey(key.id)}
                        className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* API Documentation */}
        <div className="mt-8 rounded-lg bg-blue-50 p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Using Your API Key</h3>
          <p className="text-blue-800 mb-4">
            Use your API key to access OpenAlgo-compatible endpoints:
          </p>
          <div className="rounded bg-white p-4 font-mono text-sm">
            <div className="mb-2 text-gray-600">POST /api/v1/placeorder</div>
            <pre className="text-gray-800">{`{
  "apikey": "your_api_key_here",
  "strategy": "my_strategy",
  "exchange": "NSE",
  "symbol": "RELIANCE",
  "action": "BUY",
  "quantity": 1,
  "pricetype": "MARKET",
  "product": "MIS"
}`}</pre>
          </div>
          <p className="mt-4 text-sm text-blue-700">
            <a href="https://docs.openalgo.in" target="_blank" rel="noopener noreferrer" className="underline">
              View full API documentation →
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

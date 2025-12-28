'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PlaceOrderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Form state
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState('NSE');
  const [action, setAction] = useState('BUY');
  const [quantity, setQuantity] = useState('1');
  const [product, setProduct] = useState('MIS');
  const [pricetype, setPricetype] = useState('MARKET');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [symboltoken, setSymboltoken] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [brokerNotAuthenticated, setBrokerNotAuthenticated] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Don't auto-detect anything - let user manually select exchange and product
  // This prevents confusion when typing RELIANCE and it auto-changes to NFO

  // Check broker authentication status
  useEffect(() => {
    const checkBrokerAuth = async () => {
      if (!user) return;

      try {
        const idToken = await user.getIdToken();

        // First, get the active broker
        const activeBrokerResponse = await fetch('/api/broker/active', {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });

        if (activeBrokerResponse.ok) {
          const activeData = await activeBrokerResponse.json();
          const broker = activeData.primaryBroker || (activeData.configuredBrokers && activeData.configuredBrokers[0]);

          if (!broker) {
            // No broker configured at all, redirect to broker config
            router.push('/broker/config');
            return;
          }

          setSelectedBroker(broker);

          // Now check the auth status of this broker
          const configResponse = await fetch(`/api/broker/config?broker=${broker}`, {
            headers: {
              'Authorization': `Bearer ${idToken}`,
            },
          });

          if (configResponse.ok) {
            const data = await configResponse.json();
            if (data.status !== 'active') {
              // Broker not authenticated, show warning instead of redirecting
              setBrokerNotAuthenticated(true);
              setCheckingAuth(false);
            } else {
              setBrokerNotAuthenticated(false);
              setCheckingAuth(false);
            }
          } else {
            // No broker config found, redirect to broker config page
            router.push('/broker/config');
          }
        } else {
          // Error getting active broker, redirect to config
          router.push('/broker/config');
        }
      } catch (err) {
        console.error('Error checking broker auth:', err);
        setCheckingAuth(false);
      }
    };

    checkBrokerAuth();
  }, [user, router]);

  // Redirect to broker login
  const redirectToBrokerLogin = async () => {
    if (!selectedBroker) {
      router.push('/broker/config');
      return;
    }

    try {
      const idToken = await user?.getIdToken();
      const response = await fetch(`/api/broker/login-url?broker=${selectedBroker}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        window.location.href = data.loginUrl;
      } else {
        // If can't get login URL, redirect to broker config
        router.push('/broker/config');
      }
    } catch (err) {
      console.error('Error getting login URL:', err);
      router.push('/broker/config');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setOrderId('');
    setIsLoading(true);

    // Validation
    if (!symbol) {
      setError('Symbol is required');
      setIsLoading(false);
      return;
    }

    if (isNaN(Number(quantity)) || Number(quantity) <= 0) {
      setError('Quantity must be a positive number');
      setIsLoading(false);
      return;
    }

    if (pricetype !== 'MARKET' && !price) {
      setError('Price is required for non-market orders');
      setIsLoading(false);
      return;
    }

    if (!selectedBroker) {
      setError('No broker selected. Please configure a broker first.');
      setIsLoading(false);
      return;
    }

    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/ui/dashboard/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          broker: selectedBroker,
          symbol: symbol.toUpperCase(),
          exchange,
          action,
          quantity: Number(quantity),
          product,
          pricetype,
          price: price ? Number(price) : undefined,
          trigger_price: triggerPrice ? Number(triggerPrice) : undefined,
          symboltoken: symboltoken || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuccess(`Order placed successfully! Order ID: ${data.orderId}`);
        setOrderId(data.orderId);

        // Reset form
        setSymbol('');
        setQuantity('1');
        setPrice('');
        setTriggerPrice('');
      } else {
        const data = await response.json();
        const errorMsg = data.error || 'Failed to place order';

        // If broker not authenticated, show warning banner
        if (errorMsg.includes('not authenticated')) {
          setBrokerNotAuthenticated(true);
        }

        setError(errorMsg);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          {loading ? 'Loading...' : 'Checking broker authentication...'}
        </div>
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
              <h1 className="mt-2 text-3xl font-bold text-gray-900">Place Order</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Broker Not Authenticated Warning */}
        {brokerNotAuthenticated && (
          <div className="mb-6 rounded-lg bg-yellow-50 border-2 border-yellow-400 p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-semibold text-yellow-900">
                  Broker Not Authenticated
                </h3>
                <p className="mt-2 text-sm text-yellow-700">
                  Your {selectedBroker ? selectedBroker.charAt(0).toUpperCase() + selectedBroker.slice(1) : 'broker'} account is configured but not authenticated. You need to complete authentication before placing orders.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => router.push('/broker/config')}
                    className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700"
                  >
                    Complete Authentication
                  </button>
                  <button
                    onClick={redirectToBrokerLogin}
                    className="rounded-lg border-2 border-yellow-600 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-50"
                  >
                    Quick Login
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-lg bg-green-50 p-4 text-green-700">
            <div>{success}</div>
            {orderId && (
              <div className="mt-2 text-sm">
                Order ID: <span className="font-mono font-semibold">{orderId}</span>
              </div>
            )}
          </div>
        )}

        {/* Order Form */}
        <div className="rounded-lg bg-white p-6 shadow">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Symbol */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Symbol *</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                placeholder="e.g., RELIANCE, INFY, TCS"
                required
              />
            </div>

            {/* Symbol Token (Advanced/Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Symbol Token (Optional - for Angel Broker)</label>
              <input
                type="text"
                value={symboltoken}
                onChange={(e) => setSymboltoken(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                placeholder="Leave empty for auto-lookup, or enter manually if known"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty to auto-lookup on Angel, or manually enter the symboltoken if you know it. Contact your broker if unsure.
              </p>
            </div>

            {/* Exchange and Action */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Exchange</label>
                <select
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                  <option value="NFO">NFO</option>
                  <option value="MCX">MCX</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Action</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
            </div>

            {/* Quantity and Product */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Quantity *</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                  placeholder="1"
                  min="1"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Product</label>
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="MIS">MIS (Intraday)</option>
                  <option value="CNC">CNC (Delivery)</option>
                  <option value="NRML">NRML (Futures)</option>
                </select>
              </div>
            </div>

            {/* Price Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Price Type</label>
              <select
                value={pricetype}
                onChange={(e) => setPricetype(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
                <option value="SL">SL (Stop Loss)</option>
                <option value="SL-M">SL-M (Stop Loss Market)</option>
              </select>
            </div>

            {/* Price (shown only for non-market orders) */}
            {pricetype !== 'MARKET' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Price *</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                  placeholder="0.00"
                  step="0.05"
                  required={pricetype !== 'MARKET'}
                />
              </div>
            )}

            {/* Trigger Price (for SL orders) */}
            {(pricetype === 'SL' || pricetype === 'SL-M') && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Trigger Price</label>
                <input
                  type="number"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                  placeholder="0.00"
                  step="0.05"
                />
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              {isLoading ? 'Placing Order...' : 'Place Order'}
            </button>
          </form>
        </div>

        {/* Info Box */}
        <div className="mt-8 rounded-lg bg-blue-50 p-6">
          <h3 className="mb-3 font-semibold text-blue-900">Order Details</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• <strong>MIS:</strong> Intraday position, auto-square off at market close</li>
            <li>• <strong>CNC:</strong> Delivery position, can hold overnight</li>
            <li>• <strong>NRML:</strong> For futures and options trading</li>
            <li>• <strong>MARKET:</strong> Instant execution at current market price</li>
            <li>• <strong>LIMIT:</strong> Execute only at specified price</li>
            <li>• <strong>SL:</strong> Stop loss order at trigger price with limit price</li>
            <li>• <strong>SL-M:</strong> Stop loss order at trigger price (market execution)</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

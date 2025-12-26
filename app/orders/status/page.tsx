'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Order {
  order_id: string;
  tradingsymbol: string;
  exchange: string;
  transaction_type: string;
  order_type: string;
  quantity: number;
  status: string;
  price: number;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  created_at: string;
  [key: string]: any;
}

interface Position {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  multiplier: number;
  average_price: number;
  last_price: number;
  pnl: number;
  pnl_percent: number;
  [key: string]: any;
}

export default function OrderStatusPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'positions'>('orders');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setError('');
    setIsLoading(true);

    try {
      const idToken = await user?.getIdToken();

      if (activeTab === 'orders') {
        const response = await fetch('/api/orders/status?broker=zerodha', {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setOrders(data.orders || []);
        } else {
          const data = await response.json();
          setError(data.error || 'Failed to fetch orders');
        }
      } else {
        const response = await fetch('/api/orders/positions?broker=zerodha', {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPositions(data.positions || []);
        } else {
          const data = await response.json();
          setError(data.error || 'Failed to fetch positions');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  };

  const handleTabChange = async (tab: 'orders' | 'positions') => {
    setActiveTab(tab);
    setError('');
    setIsLoading(true);
    setIsFetching(true);

    try {
      const idToken = await user?.getIdToken();

      if (tab === 'orders') {
        const response = await fetch('/api/orders/status?broker=zerodha', {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setOrders(data.orders || []);
        } else {
          const data = await response.json();
          setError(data.error || 'Failed to fetch orders');
        }
      } else {
        const response = await fetch('/api/orders/positions?broker=zerodha', {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPositions(data.positions || []);
        } else {
          const data = await response.json();
          setError(data.error || 'Failed to fetch positions');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
      setIsFetching(false);
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                ← Back to Dashboard
              </Link>
              <h1 className="mt-2 text-3xl font-bold text-gray-900">Orders & Positions</h1>
            </div>
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => handleTabChange('orders')}
              className={`px-4 py-2 font-medium transition border-b-2 ${
                activeTab === 'orders'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Orders ({orders.length})
            </button>
            <button
              onClick={() => handleTabChange('positions')}
              className={`px-4 py-2 font-medium transition border-b-2 ${
                activeTab === 'positions'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Positions ({positions.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            {orders.length === 0 ? (
              <div className="p-6 text-center text-gray-600">
                {isLoading ? 'Loading orders...' : 'No open orders found'}
              </div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Order ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Symbol</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Filled</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Price</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Avg Price</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.order_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">{order.order_id}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        {order.tradingsymbol} <span className="text-xs text-gray-500">{order.exchange}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                          order.transaction_type === 'BUY'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {order.transaction_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{order.quantity}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{order.filled_quantity || 0}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {order.price ? `₹${order.price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {order.average_price ? `₹${order.average_price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                          order.status === 'COMPLETE'
                            ? 'bg-green-100 text-green-800'
                            : order.status === 'REJECTED'
                            ? 'bg-red-100 text-red-800'
                            : order.status === 'CANCELLED'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(order.order_timestamp || order.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Positions Tab */}
        {activeTab === 'positions' && (
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            {positions.length === 0 ? (
              <div className="p-6 text-center text-gray-600">
                {isLoading ? 'Loading positions...' : 'No open positions found'}
              </div>
            ) : (
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Symbol</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Exchange</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Avg Price</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Last Price</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">P&L</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">P&L %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {positions.map((position) => (
                    <tr key={`${position.tradingsymbol}-${position.exchange}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">{position.tradingsymbol}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{position.exchange}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">{position.quantity}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        ₹{(position.average_price || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        ₹{(position.last_price || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">
                        <span className={`${
                          (position.pnl || 0) >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}>
                          ₹{(position.pnl || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs ${
                          (position.pnl_percent || 0) >= 0
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {(position.pnl_percent || 0).toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 rounded-lg bg-blue-50 p-6">
          <h3 className="mb-3 font-semibold text-blue-900">Order Status Legend</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="inline-block rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                OPEN
              </span>
              <p className="mt-2 text-sm text-blue-800">Order is placed but not yet executed</p>
            </div>
            <div>
              <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                TRIGGER PENDING
              </span>
              <p className="mt-2 text-sm text-blue-800">Waiting for trigger price to be hit</p>
            </div>
            <div>
              <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                COMPLETE
              </span>
              <p className="mt-2 text-sm text-blue-800">Order fully executed</p>
            </div>
            <div>
              <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800">
                CANCELLED
              </span>
              <p className="mt-2 text-sm text-blue-800">Order has been cancelled</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

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
  product?: string;
  trigger_price?: number;
  disclosed_quantity?: number;
  validity?: string;
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
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [nextRefreshAvailableAt, setNextRefreshAvailableAt] = useState<number>(0);
  const [refreshCooldown, setRefreshCooldown] = useState(0);

  // Modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    quantity: 0,
    price: 0,
    trigger_price: 0,
  });

  useEffect(() => {
    if (!user && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchData(true); // Bypass cooldown on initial load
    }
  }, [user]);

  // Handle cooldown countdown display
  useEffect(() => {
    if (refreshCooldown <= 0) return;

    const timer = setTimeout(() => {
      setRefreshCooldown(refreshCooldown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [refreshCooldown]);

  // Update cooldown state based on nextRefreshAvailableAt
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((nextRefreshAvailableAt - now) / 1000));
      setRefreshCooldown(remaining);
    }, 100);

    return () => clearInterval(interval);
  }, [nextRefreshAvailableAt]);

  const fetchData = async (bypassCooldown: boolean = false) => {
    // Rate limiting: Prevent rapid consecutive refreshes (Zerodha limit: 10 orders/sec)
    // Enforce minimum 2 seconds between refreshes
    const now = Date.now();
    if (!bypassCooldown && nextRefreshAvailableAt > now) {
      setError(`Please wait ${Math.ceil((nextRefreshAvailableAt - now) / 1000)}s before refreshing again`);
      return;
    }

    setError('');
    setIsLoading(true);
    setLastRefreshTime(new Date());

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

      // Set next available refresh time (2 second cooldown)
      setNextRefreshAvailableAt(Date.now() + 2000);
    }
  };

  const handleTabChange = async (tab: 'orders' | 'positions') => {
    setActiveTab(tab);
    setError('');
    setIsLoading(true);
    setIsFetching(true);
    setLastRefreshTime(new Date());

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

      // Set cooldown after tab change
      setNextRefreshAvailableAt(Date.now() + 2000);
    }
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;

    setIsActionLoading(true);
    setActionError('');

    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderid: selectedOrder.order_id,
          broker: 'zerodha',
        }),
      });

      if (response.ok) {
        setShowCancelModal(false);
        setSelectedOrder(null);
        // Refresh orders
        await fetchData();
      } else {
        const data = await response.json();
        setActionError(data.error || 'Failed to cancel order');
      }
    } catch (err: any) {
      setActionError(err.message || 'An error occurred');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleModifyOrder = async () => {
    if (!selectedOrder) return;

    setIsActionLoading(true);
    setActionError('');

    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/orders/modify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderid: selectedOrder.order_id,
          broker: 'zerodha',
          quantity: editFormData.quantity,
          price: editFormData.price,
          trigger_price: editFormData.trigger_price,
          order_type: selectedOrder.order_type,
          product: selectedOrder.product || 'MIS',
          validity: selectedOrder.validity || 'DAY',
          tradingsymbol: selectedOrder.tradingsymbol,
          exchange: selectedOrder.exchange,
          transaction_type: selectedOrder.transaction_type,
          disclosed_quantity: selectedOrder.disclosed_quantity || 0,
        }),
      });

      if (response.ok) {
        setShowEditModal(false);
        setSelectedOrder(null);
        // Refresh orders
        await fetchData();
      } else {
        const data = await response.json();
        setActionError(data.error || 'Failed to modify order');
      }
    } catch (err: any) {
      setActionError(err.message || 'An error occurred');
    } finally {
      setIsActionLoading(false);
    }
  };

  const openCancelModal = (order: Order) => {
    setSelectedOrder(order);
    setActionError('');
    setShowCancelModal(true);
  };

  const openEditModal = (order: Order) => {
    setSelectedOrder(order);
    setEditFormData({
      quantity: order.quantity - (order.filled_quantity || 0),
      price: order.price || 0,
      trigger_price: order.trigger_price || 0,
    });
    setActionError('');
    setShowEditModal(true);
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
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => fetchData()}
                disabled={isLoading || refreshCooldown > 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Refreshing...' : refreshCooldown > 0 ? `Refresh (${refreshCooldown}s)` : 'Refresh'}
              </button>
              {lastRefreshTime && (
                <span className="text-xs text-gray-500">
                  Last refreshed: {lastRefreshTime.toLocaleTimeString()}
                </span>
              )}
            </div>
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
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
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
                      <td className="px-6 py-4 text-sm space-x-2">
                        {order.status === 'OPEN' || order.status === 'TRIGGER PENDING' ? (
                          <>
                            <button
                              onClick={() => openEditModal(order)}
                              className="inline-block rounded bg-blue-600 px-3 py-1 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                              disabled={isActionLoading}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => openCancelModal(order)}
                              className="inline-block rounded bg-red-600 px-3 py-1 text-white text-xs hover:bg-red-700 disabled:opacity-50"
                              disabled={isActionLoading}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-400 text-xs">No actions</span>
                        )}
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
                  {positions.map((position, index) => (
                    <tr key={`${position.tradingsymbol}-${position.exchange}-${index}`} className="hover:bg-gray-50">
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

        {/* Cancel Order Modal */}
        {showCancelModal && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="rounded-lg bg-white p-6 max-w-sm w-full mx-4 shadow-lg">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Cancel Order</h2>

              {actionError && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700 text-sm">
                  {actionError}
                </div>
              )}

              <div className="mb-6 space-y-3 text-sm">
                <p className="text-gray-700">
                  <span className="font-semibold">Order ID:</span> {selectedOrder.order_id}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Symbol:</span> {selectedOrder.tradingsymbol}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Quantity:</span> {selectedOrder.quantity}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Price:</span> ₹{selectedOrder.price?.toFixed(2)}
                </p>
              </div>

              <p className="mb-6 text-gray-600 text-sm">
                Are you sure you want to cancel this order? This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={isActionLoading}
                  className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={isActionLoading}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isActionLoading ? 'Cancelling...' : 'Cancel Order'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Order Modal */}
        {showEditModal && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="rounded-lg bg-white p-6 max-w-md w-full mx-4 shadow-lg max-h-96 overflow-y-auto">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Order</h2>

              {actionError && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700 text-sm">
                  {actionError}
                </div>
              )}

              <div className="mb-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Order ID
                  </label>
                  <input
                    type="text"
                    value={selectedOrder.order_id}
                    disabled
                    className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 text-sm cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Symbol
                    </label>
                    <input
                      type="text"
                      value={selectedOrder.tradingsymbol}
                      disabled
                      className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 text-sm cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <input
                      type="text"
                      value={selectedOrder.transaction_type}
                      disabled
                      className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 text-sm cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity (Pending: {selectedOrder.quantity - (selectedOrder.filled_quantity || 0)})
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedOrder.quantity - (selectedOrder.filled_quantity || 0)}
                    value={editFormData.quantity}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, quantity: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Can only modify {selectedOrder.quantity - (selectedOrder.filled_quantity || 0)} unfilled quantity
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={editFormData.price}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trigger Price
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={editFormData.trigger_price}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, trigger_price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowEditModal(false)}
                  disabled={isActionLoading}
                  className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModifyOrder}
                  disabled={isActionLoading}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isActionLoading ? 'Modifying...' : 'Modify Order'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

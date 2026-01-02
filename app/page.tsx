'use client';

import { useAuth } from '@/lib/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { BrokerAuthStatus } from '@/components/BrokerAuthStatus';

export default function Home() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [lastAuthenticatedAt, setLastAuthenticatedAt] = useState<Date | null>(null);
  const [brokerStatus, setBrokerStatus] = useState<'active' | 'inactive' | null>(null);
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchActiveBroker();
    }
  }, [user]);

  const fetchActiveBroker = async () => {
    try {
      const idToken = await user?.getIdToken();
      const response = await fetch('/api/broker/active', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Use primary broker, or first configured broker if no primary
        const broker = data.primaryBroker || (data.configuredBrokers && data.configuredBrokers[0]);
        if (broker) {
          setSelectedBroker(broker);
          await fetchBrokerConfig(broker);
        }
      }
    } catch (err) {
      console.error('Error fetching active broker:', err);
    }
  };

  const fetchBrokerConfig = async (broker: string) => {
    try {
      const idToken = await user?.getIdToken();
      const response = await fetch(`/api/broker/config?broker=${broker}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBrokerStatus(data.status);
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
      }
    } catch (err) {
      console.error('Error fetching broker config:', err);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Welcome to Algo Trading Platform
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto px-4">
              A modern, full-stack algorithmic trading platform. Connect your broker, place orders, and track your portfolio in real-time.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 sm:space-x-4 px-4">
              <Link
                href="/login?signup=true"
                className="px-6 sm:px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors shadow-lg text-base sm:text-lg"
              >
                Get Started
              </Link>
              <Link
                href="/login"
                className="px-6 sm:px-8 py-3 bg-white hover:bg-gray-50 text-gray-900 font-medium rounded-lg transition-colors shadow-lg text-base sm:text-lg border border-gray-300"
              >
                Sign In
              </Link>
            </div>

            {/* Features Grid */}
            <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 px-4">
              <div className="bg-white rounded-lg p-6 shadow-md">
                <div className="text-4xl mb-4">📈</div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">Real-time Trading</h3>
                <p className="text-sm sm:text-base text-gray-600">Live market data with WebSocket streaming</p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-md">
                <div className="text-4xl mb-4">🔐</div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">Secure & Reliable</h3>
                <p className="text-sm sm:text-base text-gray-600">Bank-level encryption for your credentials</p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-md">
                <div className="text-4xl mb-4">🚀</div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">API Access</h3>
                <p className="text-sm sm:text-base text-gray-600">OpenAlgo-compatible REST API</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-2xl font-semibold text-gray-900">Welcome, {user.displayName || user.email}</h2>
          <p className="text-gray-600">Choose an action below to get started.</p>
        </div>

        {/* Broker Authentication Status */}
        {selectedBroker && (
          <div className="mb-8">
            <BrokerAuthStatus
              lastAuthenticatedAt={lastAuthenticatedAt}
              broker={selectedBroker}
              onReAuth={() => router.push('/broker/config')}
              showDetails={false}
              compact={true}
            />
          </div>
        )}

        {/* Action Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Broker Configuration */}
          <Link
            href="/broker/config"
            className="block rounded-lg bg-white p-6 shadow transition hover:shadow-lg"
          >
            <div className="mb-4 inline-block rounded-lg bg-blue-100 p-3">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Broker Configuration</h3>
            <p className="text-gray-600">Set up your broker API credentials{selectedBroker ? ` (${selectedBroker.charAt(0).toUpperCase() + selectedBroker.slice(1)})` : ''}</p>
          </Link>

          {/* Place Order */}
          <Link
            href="/orders/place"
            className="block rounded-lg bg-white p-6 shadow transition hover:shadow-lg"
          >
            <div className="mb-4 inline-block rounded-lg bg-green-100 p-3">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Place Order</h3>
            <p className="text-gray-600">Place a new order on your broker</p>
          </Link>

          {/* Order Status */}
          <Link
            href="/orders/status"
            className="block rounded-lg bg-white p-6 shadow transition hover:shadow-lg"
          >
            <div className="mb-4 inline-block rounded-lg bg-purple-100 p-3">
              <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Order Status</h3>
            <p className="text-gray-600">Check your open orders and status</p>
          </Link>

          {/* API Keys */}
          <Link
            href="/api-keys"
            className="block rounded-lg bg-white p-6 shadow transition hover:shadow-lg"
          >
            <div className="mb-4 inline-block rounded-lg bg-yellow-100 p-3">
              <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">API Keys</h3>
            <p className="text-gray-600">Generate keys for TradingView, Python, etc.</p>
          </Link>

          {/* Advanced Chart */}
          <Link
            href="/chart"
            className="block rounded-lg bg-white p-6 shadow transition hover:shadow-lg border-2 border-purple-200"
          >
            <div className="mb-4 inline-block rounded-lg bg-purple-100 p-3">
              <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Advanced Chart</h3>
            <p className="text-gray-600">Technical analysis with Volume Profile</p>
          </Link>

          {/* Fibonacci Trading Chart */}
          <Link
            href="/chart-fib"
            className="block rounded-lg bg-white p-6 shadow transition hover:shadow-lg border-2 border-pink-200"
          >
            <div className="mb-4 inline-block rounded-lg bg-pink-100 p-3">
              <svg className="h-6 w-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Fibonacci Trading Chart</h3>
            <p className="text-gray-600">Harmonic pattern detection & Fibonacci analysis</p>
          </Link>

          {/* API Documentation */}
          <Link
            href="/api-docs"
            className="block rounded-lg bg-white p-6 shadow transition hover:shadow-lg border-2 border-indigo-200"
          >
            <div className="mb-4 inline-block rounded-lg bg-indigo-100 p-3">
              <svg className="h-6 w-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C6.5 6.253 2 10.998 2 17s4.5 10.747 10 10.747c5.5 0 10-4.998 10-10.747S17.5 6.253 12 6.253z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">API Documentation</h3>
            <p className="text-gray-600">REST API endpoints and examples</p>
          </Link>
        </div>
      </main>
    </div>
  );
}

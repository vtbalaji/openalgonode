'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMarketConfig } from '@/hooks/useMarketConfig';

export default function PlaceOrderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { config: marketConfig, loading: configLoading } = useMarketConfig();

  // Form state
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState('NSE');
  const [action, setAction] = useState('BUY');
  const [quantity, setQuantity] = useState('1');
  const [product, setProduct] = useState('CNC');
  const [pricetype, setPricetype] = useState('MARKET');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [symboltoken, setSymboltoken] = useState('');

  // Option builder state
  const [useOptionBuilder, setUseOptionBuilder] = useState(false);
  const [baseSymbol, setBaseSymbol] = useState<'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCPNIFTY'>('NIFTY');
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  const [strike, setStrike] = useState<number>(
    Math.round(marketConfig.defaultSpotPrice / marketConfig.strikeStep) * marketConfig.strikeStep
  );
  const [expiry, setExpiry] = useState(marketConfig.defaultExpiry);
  const [lots, setLots] = useState<number>(1);
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [spotPrice, setSpotPrice] = useState<number>(marketConfig.defaultSpotPrice);
  const [fetchingSpot, setFetchingSpot] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [brokerNotAuthenticated, setBrokerNotAuthenticated] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);

  // Build option symbol from components
  const buildOptionSymbol = () => {
    // Format for Fyers: NSE:NIFTY26FEB23500CE or NSE:NIFTY2611323500CE
    // Year is always prefixed (26 = 2026)
    // Weekly: NIFTY26113 (YYMDD where M is 1-9,O,N,D) + strike + CE/PE
    // Monthly: NIFTY26FEB + strike + CE/PE

    // The convertToBrokerSymbol in symbolMapping.ts will add NSE: prefix
    // We just need to build: NIFTY + numericExpiry + strike + type

    const year = '26'; // 2026
    const monthMap: { [key: string]: string } = {
      'JAN': '1', 'FEB': '2', 'MAR': '3', 'APR': '4',
      'MAY': '5', 'JUN': '6', 'JUL': '7', 'AUG': '8',
      'SEP': '9', 'OCT': 'O', 'NOV': 'N', 'DEC': 'D'
    };

    // Check if expiry has a date (weekly) or just month (monthly)
    const weeklyMatch = expiry.match(/^(\d{1,2})([A-Z]{3})$/); // e.g., "13JAN"
    const monthlyMatch = expiry.match(/^([A-Z]{3})$/); // e.g., "FEB"

    let numericExpiry = '';

    if (weeklyMatch) {
      // Weekly: 13JAN → 26113 (YYMDD)
      const day = weeklyMatch[1].padStart(2, '0');
      const month = monthMap[weeklyMatch[2]];
      numericExpiry = `${year}${month}${day}`;
    } else if (monthlyMatch) {
      // Monthly: FEB → 26FEB (YYMMM)
      numericExpiry = `${year}${monthlyMatch[1]}`;
    } else {
      // Fallback: use as-is
      numericExpiry = `${year}${expiry}`;
    }

    return `${baseSymbol}${numericExpiry}${strike}${optionType}`;
  };

  // Fetch real-time spot price for ATM calculation
  const fetchSpotPrice = async () => {
    if (!user || !useOptionBuilder) return;

    setFetchingSpot(true);

    try {
      const idToken = await user.getIdToken();
      // Fetch spot price for the base symbol (e.g., NIFTY50 or BANKNIFTY)
      const spotSymbol = baseSymbol === 'NIFTY' ? 'NIFTY50' :
                         baseSymbol === 'BANKNIFTY' ? 'NIFTYBANK' :
                         baseSymbol === 'FINNIFTY' ? 'FINNIFTY' : 'MIDCPNIFTY';

      const response = await fetch(`/api/options/spot?symbol=${encodeURIComponent(spotSymbol)}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.price) {
          setSpotPrice(data.price);
          console.log(`[PLACE-ORDER] Updated spot price for ${spotSymbol}: ${data.price}`);
        }
      } else {
        console.error('[PLACE-ORDER] Failed to fetch spot price:', response.statusText);
      }
    } catch (error: any) {
      console.error('[PLACE-ORDER] Error fetching spot price:', error.message);
    } finally {
      setFetchingSpot(false);
    }
  };

  // Fetch market price for the selected option
  const fetchMarketPrice = async () => {
    if (!user || !useOptionBuilder) return;

    setFetchingPrice(true);
    setMarketPrice(null);

    try {
      const idToken = await user.getIdToken();
      const optionSymbol = buildOptionSymbol();

      // Call backend API to get market price
      const response = await fetch(`/api/options/quote?symbol=${encodeURIComponent(optionSymbol)}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.price) {
          setMarketPrice(data.price);
        }
      } else {
        console.error('[PLACE-ORDER] Failed to fetch market price:', response.statusText);
      }
    } catch (error: any) {
      console.error('[PLACE-ORDER] Error fetching market price:', error.message);
    } finally {
      setFetchingPrice(false);
    }
  };

  // Fetch spot price when option builder is enabled or base symbol changes
  useEffect(() => {
    if (useOptionBuilder && user) {
      fetchSpotPrice();
    }
  }, [useOptionBuilder, baseSymbol, user]);

  // Update strike to ATM when spot price changes
  useEffect(() => {
    if (spotPrice && spotPrice !== marketConfig.defaultSpotPrice) {
      const atmStrike = Math.round(spotPrice / marketConfig.strikeStep) * marketConfig.strikeStep;
      setStrike(atmStrike);
      console.log(`[PLACE-ORDER] Updated strike to ATM: ${atmStrike} (spot: ${spotPrice})`);
    }
  }, [spotPrice, marketConfig.strikeStep]);

  // Update symbol and quantity when option builder values change
  useEffect(() => {
    if (useOptionBuilder && marketConfig.lotSizes) {
      setSymbol(buildOptionSymbol());
      setExchange('NFO'); // Options are always NFO
      // Auto-calculate quantity from lots
      const lotSize = marketConfig.lotSizes[baseSymbol] || 25;
      setQuantity((lots * lotSize).toString());

      // Fetch market price for the selected option
      fetchMarketPrice();
    }
  }, [useOptionBuilder, baseSymbol, expiry, strike, optionType, lots, marketConfig.lotSizes]);

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

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <Link
              href="/orders/place"
              className="border-b-2 border-blue-500 py-4 px-1 text-sm font-medium text-blue-600"
            >
              Single Order
            </Link>
            <Link
              href="/orders/strategies"
              className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Option Strategies
            </Link>
          </nav>
        </div>
      </div>

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
            {/* Option Builder Toggle */}
            <div className="flex items-center gap-3 pb-4 border-b">
              <input
                type="checkbox"
                id="useOptionBuilder"
                checked={useOptionBuilder}
                onChange={(e) => setUseOptionBuilder(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2"
              />
              <label htmlFor="useOptionBuilder" className="text-sm font-semibold text-gray-700 cursor-pointer">
                📊 Use Option Builder (NFO)
              </label>
            </div>

            {/* Option Builder Section */}
            {useOptionBuilder && (
              <div className="bg-blue-50 rounded-lg p-4 space-y-4 border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">Build Option Symbol</h3>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Base Symbol */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Base Symbol</label>
                    <select
                      value={baseSymbol}
                      onChange={(e) => setBaseSymbol(e.target.value as 'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCPNIFTY')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 text-sm"
                    >
                      <option value="NIFTY">NIFTY (Lot: {marketConfig.lotSizes?.NIFTY || 65})</option>
                      <option value="BANKNIFTY">BANKNIFTY (Lot: {marketConfig.lotSizes?.BANKNIFTY || 15})</option>
                      <option value="FINNIFTY">FINNIFTY (Lot: {marketConfig.lotSizes?.FINNIFTY || 25})</option>
                      <option value="MIDCPNIFTY">MIDCPNIFTY (Lot: {marketConfig.lotSizes?.MIDCPNIFTY || 50})</option>
                    </select>
                  </div>

                  {/* Option Type */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={optionType}
                      onChange={(e) => setOptionType(e.target.value as 'CE' | 'PE')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 text-sm"
                    >
                      <option value="CE">CE (Call)</option>
                      <option value="PE">PE (Put)</option>
                    </select>
                  </div>

                  {/* Lots */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Lots</label>
                    <input
                      type="number"
                      value={lots}
                      onChange={(e) => setLots(parseInt(e.target.value) || 1)}
                      min="1"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      = {lots * (marketConfig.lotSizes?.[baseSymbol] || 25)} qty
                    </p>
                  </div>

                  {/* Expiry */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Expiry</label>
                    <select
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 text-sm"
                    >
                      <optgroup label="Weekly">
                        {marketConfig.weeklyExpiries.map((exp) => (
                          <option key={exp.value} value={exp.value}>{exp.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Monthly">
                        {marketConfig.monthlyExpiries.map((exp) => (
                          <option key={exp.value} value={exp.value}>{exp.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Strike */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Strike {fetchingSpot && <span className="text-blue-600 text-xs">(updating...)</span>}
                    </label>
                    <select
                      value={strike}
                      onChange={(e) => setStrike(parseInt(e.target.value))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 text-sm"
                    >
                      {Array.from({ length: marketConfig.strikeRange }, (_, i) => {
                        const atmStrike = Math.round(spotPrice / marketConfig.strikeStep) * marketConfig.strikeStep;
                        const offset = (i - Math.floor(marketConfig.strikeRange / 2)) * marketConfig.strikeStep;
                        const strikeValue = atmStrike + offset;
                        return (
                          <option key={strikeValue} value={strikeValue}>
                            {strikeValue} {strikeValue === atmStrike ? '(ATM)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Spot: ₹{spotPrice.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Generated Symbol Preview */}
                <div className="bg-white rounded-lg p-3 border border-blue-300">
                  <p className="text-xs text-gray-600 mb-1">Generated Symbol:</p>
                  <p className="text-lg font-mono font-bold text-blue-900">{buildOptionSymbol()}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Format: {baseSymbol}{expiry}26{strike}{optionType}
                  </p>

                  {/* Market Price Display */}
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-700">Market Price (LTP):</span>
                      <div className="flex items-center gap-2">
                        {fetchingPrice ? (
                          <span className="text-sm text-blue-600 animate-pulse">Loading...</span>
                        ) : marketPrice !== null ? (
                          <span className="text-lg font-bold text-green-600">₹{marketPrice.toFixed(2)}</span>
                        ) : (
                          <span className="text-sm text-gray-400">Not available</span>
                        )}
                        <button
                          onClick={fetchMarketPrice}
                          disabled={fetchingPrice}
                          className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Refresh price"
                        >
                          🔄
                        </button>
                      </div>
                    </div>
                    {marketPrice !== null && lots > 0 && (
                      <p className="text-xs text-gray-500">
                        Premium for {lots} lot{lots > 1 ? 's' : ''}: ₹{(marketPrice * lots * (marketConfig.lotSizes?.[baseSymbol] || 25)).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-xs text-blue-800 bg-blue-100 rounded p-2">
                  💡 Tip: Exchange will be automatically set to NFO for options
                </div>
              </div>
            )}

            {/* Symbol (Manual Entry or from Option Builder) */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Symbol * {useOptionBuilder && <span className="text-blue-600">(auto-generated)</span>}
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={useOptionBuilder}
                className={`mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none ${
                  useOptionBuilder ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                placeholder={useOptionBuilder ? 'Symbol generated from option builder' : 'e.g., RELIANCE, INFY, TCS'}
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
                <label className="block text-sm font-medium text-gray-700">
                  Quantity * {useOptionBuilder && <span className="text-blue-600">(auto-calculated from lots)</span>}
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={useOptionBuilder}
                  className={`mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none ${
                    useOptionBuilder ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  placeholder="1"
                  min="1"
                  required
                />
                {useOptionBuilder && (
                  <p className="text-xs text-blue-600 mt-1">
                    {lots} lot(s) × {marketConfig.lotSizes?.[baseSymbol] || 25} = {quantity} qty
                  </p>
                )}
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

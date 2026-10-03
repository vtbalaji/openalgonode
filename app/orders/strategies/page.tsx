'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMarketConfig } from '@/hooks/useMarketConfig';

type StrategyType = 'call-spread' | 'put-spread' | 'straddle' | 'strangle' | 'iron-condor';

interface StrategyLeg {
  id: string;
  action: 'BUY' | 'SELL';
  optionType: 'CE' | 'PE';
  strike: number;
  lots: number;
}

interface Strategy {
  name: string;
  description: string;
  legs: StrategyLeg[];
  recommendation: string;
}

const STRATEGIES: Record<StrategyType, Strategy> = {
  'call-spread': {
    name: 'Bull Call Spread',
    description: 'Buy lower strike call, sell higher strike call. Limited profit, limited risk.',
    recommendation: 'Use when moderately bullish. Max profit = difference between strikes - net debit.',
    legs: [
      { id: '1', action: 'BUY', optionType: 'CE', strike: 25300, lots: 1 },
      { id: '2', action: 'SELL', optionType: 'CE', strike: 25400, lots: 1 },
    ],
  },
  'put-spread': {
    name: 'Bear Put Spread',
    description: 'Buy higher strike put, sell lower strike put. Limited profit, limited risk.',
    recommendation: 'Use when moderately bearish. Max profit = difference between strikes - net debit.',
    legs: [
      { id: '1', action: 'BUY', optionType: 'PE', strike: 25300, lots: 1 },
      { id: '2', action: 'SELL', optionType: 'PE', strike: 25200, lots: 1 },
    ],
  },
  'straddle': {
    name: 'Long Straddle',
    description: 'Buy ATM call and put. Profit from large moves in either direction.',
    recommendation: 'Use when expecting high volatility. Profit when price moves beyond breakeven.',
    legs: [
      { id: '1', action: 'BUY', optionType: 'CE', strike: 25300, lots: 1 },
      { id: '2', action: 'BUY', optionType: 'PE', strike: 25300, lots: 1 },
    ],
  },
  'strangle': {
    name: 'Long Strangle',
    description: 'Buy OTM call and put. Lower cost than straddle, needs bigger move.',
    recommendation: 'Use when expecting large move but unsure of direction. Cheaper than straddle.',
    legs: [
      { id: '1', action: 'BUY', optionType: 'CE', strike: 25400, lots: 1 },
      { id: '2', action: 'BUY', optionType: 'PE', strike: 25200, lots: 1 },
    ],
  },
  'iron-condor': {
    name: 'Iron Condor',
    description: 'Sell OTM call spread and put spread. Profit from range-bound market.',
    recommendation: 'Use when expecting low volatility. Max profit = net credit received.',
    legs: [
      { id: '1', action: 'SELL', optionType: 'CE', strike: 25400, lots: 1 },
      { id: '2', action: 'BUY', optionType: 'CE', strike: 25500, lots: 1 },
      { id: '3', action: 'SELL', optionType: 'PE', strike: 25200, lots: 1 },
      { id: '4', action: 'BUY', optionType: 'PE', strike: 25100, lots: 1 },
    ],
  },
};

export default function OptionStrategiesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { config: marketConfig, loading: configLoading } = useMarketConfig();

  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('call-spread');
  const [baseSymbol, setBaseSymbol] = useState<'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCPNIFTY'>('NIFTY');
  const [expiry, setExpiry] = useState(marketConfig.defaultExpiry);
  const [legs, setLegs] = useState<StrategyLeg[]>(STRATEGIES['call-spread'].legs);
  const [product, setProduct] = useState('NRML');

  const [spotPrice, setSpotPrice] = useState<number>(marketConfig.defaultSpotPrice);
  const [fetchingSpot, setFetchingSpot] = useState(false);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [fetchingPrices, setFetchingPrices] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [brokerNotAuthenticated, setBrokerNotAuthenticated] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<'zerodha' | 'fyers' | null>(null);

  // Build option symbol
  const buildOptionSymbol = (optionType: 'CE' | 'PE', strike: number) => {
    const year = '26';
    const monthMap: { [key: string]: string } = {
      'JAN': '1', 'FEB': '2', 'MAR': '3', 'APR': '4',
      'MAY': '5', 'JUN': '6', 'JUL': '7', 'AUG': '8',
      'SEP': '9', 'OCT': 'O', 'NOV': 'N', 'DEC': 'D'
    };

    const weeklyMatch = expiry.match(/^(\d{1,2})([A-Z]{3})$/);
    const monthlyMatch = expiry.match(/^([A-Z]{3})$/);

    let numericExpiry = '';
    if (weeklyMatch) {
      const day = weeklyMatch[1].padStart(2, '0');
      const month = monthMap[weeklyMatch[2]];
      numericExpiry = `${year}${month}${day}`;
    } else if (monthlyMatch) {
      numericExpiry = `${year}${monthlyMatch[1]}`;
    } else {
      numericExpiry = `${year}${expiry}`;
    }

    return `${baseSymbol}${numericExpiry}${strike}${optionType}`;
  };

  // Check broker auth
  useEffect(() => {
    const checkBrokerAuth = async () => {
      if (!user) return;

      try {
        const idToken = await user.getIdToken();
        const activeBrokerResponse = await fetch('/api/broker/active', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        });

        if (activeBrokerResponse.ok) {
          const activeData = await activeBrokerResponse.json();
          const broker = activeData.primaryBroker || (activeData.configuredBrokers && activeData.configuredBrokers[0]);

          if (!broker) {
            router.push('/broker/config');
            return;
          }

          setSelectedBroker(broker);

          const configResponse = await fetch(`/api/broker/config?broker=${broker}`, {
            headers: { 'Authorization': `Bearer ${idToken}` },
          });

          if (configResponse.ok) {
            const data = await configResponse.json();
            if (data.status !== 'active') {
              setBrokerNotAuthenticated(true);
              setCheckingAuth(false);
            } else {
              setBrokerNotAuthenticated(false);
              setCheckingAuth(false);
            }
          } else {
            router.push('/broker/config');
          }
        } else {
          router.push('/broker/config');
        }
      } catch (err) {
        console.error('Error checking broker auth:', err);
        setCheckingAuth(false);
      }
    };

    checkBrokerAuth();
  }, [user, router]);

  // Load strategy when selected
  useEffect(() => {
    const strategy = STRATEGIES[selectedStrategy];
    const atmStrike = Math.round(spotPrice / marketConfig.strikeStep) * marketConfig.strikeStep;

    // Adjust strikes based on current ATM
    const adjustedLegs = strategy.legs.map(leg => ({
      ...leg,
      strike: atmStrike + (leg.strike - 25300), // Offset from default 25300
    }));

    setLegs(adjustedLegs);
  }, [selectedStrategy, spotPrice, marketConfig.strikeStep]);

  // Fetch spot price
  const fetchSpotPrice = async () => {
    if (!user) return;

    setFetchingSpot(true);

    try {
      const idToken = await user.getIdToken();
      const spotSymbol = baseSymbol === 'NIFTY' ? 'NIFTY50' :
                         baseSymbol === 'BANKNIFTY' ? 'NIFTYBANK' :
                         baseSymbol === 'FINNIFTY' ? 'FINNIFTY' : 'MIDCPNIFTY';

      const response = await fetch(`/api/options/spot?symbol=${encodeURIComponent(spotSymbol)}`, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.price) {
          setSpotPrice(data.price);
        }
      }
    } catch (error: any) {
      console.error('[STRATEGIES] Error fetching spot price:', error.message);
    } finally {
      setFetchingSpot(false);
    }
  };

  // Fetch market prices for all legs
  const fetchMarketPrices = async () => {
    if (!user) return;

    setFetchingPrices(true);
    const prices: Record<string, number> = {};

    try {
      const idToken = await user.getIdToken();

      for (const leg of legs) {
        const symbol = buildOptionSymbol(leg.optionType, leg.strike);
        const response = await fetch(`/api/options/quote?symbol=${encodeURIComponent(symbol)}`, {
          headers: { 'Authorization': `Bearer ${idToken}` },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.price) {
            prices[leg.id] = data.price;
          }
        }
      }

      setMarketPrices(prices);
    } catch (error: any) {
      console.error('[STRATEGIES] Error fetching prices:', error.message);
    } finally {
      setFetchingPrices(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSpotPrice();
    }
  }, [user, baseSymbol]);

  useEffect(() => {
    if (user && legs.length > 0) {
      fetchMarketPrices();
    }
  }, [user, legs, expiry]);

  // Update leg
  const updateLeg = (id: string, field: keyof StrategyLeg, value: any) => {
    setLegs(legs.map(leg => leg.id === id ? { ...leg, [field]: value } : leg));
  };

  // Calculate total premium
  const calculateTotalPremium = () => {
    let total = 0;
    legs.forEach(leg => {
      const price = marketPrices[leg.id] || 0;
      const lotSize = marketConfig.lotSizes?.[baseSymbol] || 25;
      const premium = price * leg.lots * lotSize;
      total += leg.action === 'BUY' ? -premium : premium;
    });
    return total;
  };

  // Execute strategy
  const handleExecuteStrategy = async () => {
    if (!user) return;

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const idToken = await user.getIdToken();
      const lotSize = marketConfig.lotSizes?.[baseSymbol] || 25;

      const orderPromises = legs.map(async (leg) => {
        const symbol = buildOptionSymbol(leg.optionType, leg.strike);
        const quantity = leg.lots * lotSize;

        const response = await fetch('/api/ui/dashboard/place', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            broker: selectedBroker || 'fyers',
            symbol,
            exchange: 'NFO',
            action: leg.action,
            quantity: quantity.toString(),
            product,
            pricetype: 'MARKET',
            price: '0',
            trigger_price: '0',
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          const errorMsg = error.error || error.message || response.statusText;
          console.error(`[STRATEGIES] Order failed for ${symbol}:`, errorMsg);
          throw new Error(`${symbol}: ${errorMsg}`);
        }

        const result = await response.json();
        console.log(`[STRATEGIES] Order placed for ${symbol}:`, result);
        return result;
      });

      const results = await Promise.all(orderPromises);
      setSuccess(`✅ Strategy executed! ${results.length} orders placed successfully.`);

      setTimeout(() => {
        router.push('/orders/status');
      }, 2000);
    } catch (err: any) {
      setError(`❌ ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || configLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Checking broker authentication...</p>
        </div>
      </div>
    );
  }

  if (brokerNotAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Broker Not Authenticated</h2>
          <p className="text-gray-600 mb-6">
            Your {selectedBroker} broker is not authenticated. Please authenticate to execute strategies.
          </p>
          <Link
            href="/broker/config"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Broker Config
          </Link>
        </div>
      </div>
    );
  }

  const strategy = STRATEGIES[selectedStrategy];
  const totalPremium = calculateTotalPremium();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <Link
              href="/orders/place"
              className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Single Order
            </Link>
            <Link
              href="/orders/strategies"
              className="border-b-2 border-blue-500 py-4 px-1 text-sm font-medium text-blue-600"
            >
              Option Strategies
            </Link>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 pt-8">
        <div className="mb-6">
          <p className="text-gray-600">Execute pre-built option strategies with one click</p>
        </div>

        {/* Strategy Selection */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Select Strategy</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(Object.keys(STRATEGIES) as StrategyType[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedStrategy(key)}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  selectedStrategy === key
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300'
                }`}
              >
                {STRATEGIES[key].name.split(' ')[1] || STRATEGIES[key].name}
              </button>
            ))}
          </div>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-1">{strategy.name}</h4>
            <p className="text-sm text-blue-800 mb-2">{strategy.description}</p>
            <p className="text-xs text-blue-700">💡 {strategy.recommendation}</p>
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Configuration</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Base Symbol</label>
              <select
                value={baseSymbol}
                onChange={(e) => setBaseSymbol(e.target.value as any)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              >
                <option value="NIFTY">NIFTY</option>
                <option value="BANKNIFTY">BANKNIFTY</option>
                <option value="FINNIFTY">FINNIFTY</option>
                <option value="MIDCPNIFTY">MIDCPNIFTY</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expiry</label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              >
                <option value="CNC">CNC</option>
                <option value="MIS">MIS</option>
                <option value="NRML">NRML</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Spot Price</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={spotPrice.toFixed(0)}
                  readOnly
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 bg-gray-50"
                />
                <button
                  onClick={fetchSpotPrice}
                  disabled={fetchingSpot}
                  className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  🔄
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Strategy Legs */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Strategy Legs</h3>
            <button
              onClick={fetchMarketPrices}
              disabled={fetchingPrices}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {fetchingPrices ? 'Fetching...' : '🔄 Refresh Prices'}
            </button>
          </div>

          <div className="space-y-3">
            {legs.map((leg, index) => {
              const symbol = buildOptionSymbol(leg.optionType, leg.strike);
              const price = marketPrices[leg.id];
              const lotSize = marketConfig.lotSizes?.[baseSymbol] || 25;
              const premium = price ? price * leg.lots * lotSize : 0;

              return (
                <div key={leg.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Leg {index + 1}</label>
                      <select
                        value={leg.action}
                        onChange={(e) => updateLeg(leg.id, 'action', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900 text-sm"
                      >
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Type</label>
                      <select
                        value={leg.optionType}
                        onChange={(e) => updateLeg(leg.id, 'optionType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900 text-sm"
                      >
                        <option value="CE">CE</option>
                        <option value="PE">PE</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Strike</label>
                      <input
                        type="number"
                        value={leg.strike}
                        onChange={(e) => updateLeg(leg.id, 'strike', parseInt(e.target.value))}
                        step={marketConfig.strikeStep}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Lots</label>
                      <input
                        type="number"
                        value={leg.lots}
                        onChange={(e) => updateLeg(leg.id, 'lots', parseInt(e.target.value))}
                        min={1}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">LTP</label>
                      <div className="text-sm font-semibold text-gray-900">
                        {price ? `₹${price.toFixed(2)}` : '-'}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Premium</label>
                      <div className={`text-sm font-semibold ${leg.action === 'BUY' ? 'text-red-600' : 'text-green-600'}`}>
                        {premium ? `${leg.action === 'BUY' ? '-' : '+'}₹${premium.toFixed(0)}` : '-'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-gray-500 font-mono">
                    Symbol: {symbol} | Qty: {leg.lots * lotSize}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total Premium */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-gray-800">Net Premium:</span>
              <span className={`text-2xl font-bold ${totalPremium >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalPremium >= 0 ? '+' : ''}₹{totalPremium.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {totalPremium >= 0 ? '✅ Net Credit (you receive money)' : '❌ Net Debit (you pay money)'}
            </p>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        {/* Execute Button */}
        <div className="flex gap-4">
          <button
            onClick={handleExecuteStrategy}
            disabled={isLoading || Object.keys(marketPrices).length === 0}
            className="flex-1 bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg transition-colors"
          >
            {isLoading ? 'Executing Strategy...' : `Execute ${strategy.name}`}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500 text-center">
          All orders will be placed as MARKET orders. Make sure you have sufficient margin.
        </p>
      </div>
    </div>
  );
}

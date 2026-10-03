'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface MarketConfig {
  currentFuture: string;
  defaultExpiry: string;
  weeklyExpiries: Array<{ value: string; label: string }>;
  monthlyExpiries: Array<{ value: string; label: string }>;
  defaultSpotPrice: number;
  defaultCeOffset: number;
  defaultPeOffset: number;
  strikeRange: number;
  strikeStep: number;
  validStrikeMin: number;
  validStrikeMax: number;
  lotSizes: {
    NIFTY: number;
    BANKNIFTY: number;
    FINNIFTY: number;
    MIDCPNIFTY: number;
  };
  lastUpdated: number;
}

const DEFAULT_CONFIG: MarketConfig = {
  currentFuture: '26FEBFUT',
  defaultExpiry: 'FEB',
  weeklyExpiries: [
    { value: '6FEB', label: '6 FEB (Thursday)' },
    { value: '13FEB', label: '13 FEB (Thursday)' },
    { value: '20FEB', label: '20 FEB (Thursday)' },
  ],
  monthlyExpiries: [
    { value: 'FEB', label: 'FEB (Monthly - 27th)' },
    { value: 'MAR', label: 'MAR (Monthly)' },
    { value: 'APR', label: 'APR (Monthly)' },
  ],
  defaultSpotPrice: 25300,
  defaultCeOffset: 100,
  defaultPeOffset: -100,
  strikeRange: 21,
  strikeStep: 100,
  validStrikeMin: 18000,
  validStrikeMax: 30000,
  lotSizes: {
    NIFTY: 65,
    BANKNIFTY: 15,
    FINNIFTY: 25,
    MIDCPNIFTY: 50,
  },
  lastUpdated: Date.now(),
};

export function MarketConfigSection() {
  const { user } = useAuth();
  const [config, setConfig] = useState<MarketConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [liveSpotPrice, setLiveSpotPrice] = useState<number | null>(null);
  const [fetchingSpot, setFetchingSpot] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadConfig();
  }, [user]);

  const loadConfig = async () => {
    try {
      const docRef = doc(db, 'config', 'market');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as MarketConfig;

        // Migration: Add lotSizes if missing (for existing configs)
        if (!data.lotSizes) {
          data.lotSizes = DEFAULT_CONFIG.lotSizes;
          console.log('[MARKET-CONFIG] Migrated config to add lotSizes');
        }

        setConfig(data);
        localStorage.setItem('marketConfig', JSON.stringify(data));
      } else {
        await saveConfigToFirebase(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('[MARKET-CONFIG] Error loading config:', error);
      setMessage({ type: 'error', text: 'Failed to load config' });
    } finally {
      setLoading(false);
    }
  };

  const saveConfigToFirebase = async (configToSave: MarketConfig) => {
    if (!user) return;

    try {
      const docRef = doc(db, 'config', 'market');
      const updatedConfig = {
        ...configToSave,
        lastUpdated: Date.now(),
      };

      await setDoc(docRef, updatedConfig);
      localStorage.setItem('marketConfig', JSON.stringify(updatedConfig));

      return updatedConfig;
    } catch (error) {
      console.error('[MARKET-CONFIG] Error saving config:', error);
      throw error;
    }
  };

  const fetchLiveSpotPrice = async () => {
    if (!user) return;

    setFetchingSpot(true);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/options/spot?symbol=NIFTY50`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.price) {
          setLiveSpotPrice(data.price);
          console.log(`[MARKET-CONFIG] Fetched live NIFTY spot: ${data.price}`);
        }
      } else {
        console.error('[MARKET-CONFIG] Failed to fetch live spot price:', response.statusText);
      }
    } catch (error: any) {
      console.error('[MARKET-CONFIG] Error fetching live spot price:', error.message);
    } finally {
      setFetchingSpot(false);
    }
  };

  const updateSpotFromLive = () => {
    if (liveSpotPrice) {
      setConfig({ ...config, defaultSpotPrice: Math.round(liveSpotPrice) });
      setMessage({ type: 'success', text: `✅ Updated spot price to ₹${Math.round(liveSpotPrice)}` });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const updatedConfig = await saveConfigToFirebase(config);
      setConfig(updatedConfig!);
      setMessage({ type: 'success', text: '✅ Configuration saved! All chart pages will use these settings.' });

      // Auto-clear success message after 5 seconds
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddExpiry = (type: 'weekly' | 'monthly') => {
    if (type === 'weekly') {
      setConfig(prev => ({
        ...prev,
        weeklyExpiries: [...prev.weeklyExpiries, { value: '', label: '' }],
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        monthlyExpiries: [...prev.monthlyExpiries, { value: '', label: '' }],
      }));
    }
  };

  const handleRemoveExpiry = (type: 'weekly' | 'monthly', index: number) => {
    if (type === 'weekly') {
      setConfig(prev => ({
        ...prev,
        weeklyExpiries: prev.weeklyExpiries.filter((_, i) => i !== index),
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        monthlyExpiries: prev.monthlyExpiries.filter((_, i) => i !== index),
      }));
    }
  };

  const handleUpdateExpiry = (type: 'weekly' | 'monthly', index: number, field: 'value' | 'label', value: string) => {
    if (type === 'weekly') {
      setConfig(prev => ({
        ...prev,
        weeklyExpiries: prev.weeklyExpiries.map((exp, i) =>
          i === index ? { ...exp, [field]: value } : exp
        ),
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        monthlyExpiries: prev.monthlyExpiries.map((exp, i) =>
          i === index ? { ...exp, [field]: value } : exp
        ),
      }));
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
        <p className="mt-4 text-gray-600">Loading market configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-1">📊 Market Configuration</h3>
        <p className="text-xs text-blue-800">
          Configure default settings for futures, options, and expiries. These settings apply to all chart pages
          (Geek Strangle, Straddle, Vidya, etc.). Last updated: {new Date(config.lastUpdated).toLocaleString()}
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white rounded-lg border shadow-sm p-6 space-y-6">

        {/* Futures & Default Expiry */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Current Futures Symbol
            </label>
            <input
              type="text"
              value={config.currentFuture}
              onChange={(e) => setConfig({ ...config, currentFuture: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              placeholder="e.g., 26FEBFUT"
            />
            <p className="text-xs text-gray-500 mt-1">Format: YYMMMFUT (e.g., 26FEBFUT = Feb 2026, 27MARFUT = Mar 2027)</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Default Expiry
            </label>
            <input
              type="text"
              value={config.defaultExpiry}
              onChange={(e) => setConfig({ ...config, defaultExpiry: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              placeholder="e.g., FEB"
            />
            <p className="text-xs text-gray-500 mt-1">Selected by default on charts</p>
          </div>
        </div>

        {/* Weekly Expiries */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-gray-700">Weekly Expiries</label>
            <button
              onClick={() => handleAddExpiry('weekly')}
              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {config.weeklyExpiries.map((expiry, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={expiry.value}
                  onChange={(e) => handleUpdateExpiry('weekly', index, 'value', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                  placeholder="6FEB"
                />
                <input
                  type="text"
                  value={expiry.label}
                  onChange={(e) => handleUpdateExpiry('weekly', index, 'label', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                  placeholder="6 FEB (Thursday)"
                />
                <button
                  onClick={() => handleRemoveExpiry('weekly', index)}
                  className="px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Expiries */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-gray-700">Monthly Expiries</label>
            <button
              onClick={() => handleAddExpiry('monthly')}
              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {config.monthlyExpiries.map((expiry, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={expiry.value}
                  onChange={(e) => handleUpdateExpiry('monthly', index, 'value', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                  placeholder="FEB"
                />
                <input
                  type="text"
                  value={expiry.label}
                  onChange={(e) => handleUpdateExpiry('monthly', index, 'label', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                  placeholder="FEB (Monthly - 27th)"
                />
                <button
                  onClick={() => handleRemoveExpiry('monthly', index)}
                  className="px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Strike Configuration */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Strike Settings</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Default Spot Price (NIFTY)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.defaultSpotPrice}
                  onChange={(e) => setConfig({ ...config, defaultSpotPrice: parseInt(e.target.value) })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
                />
                <button
                  onClick={fetchLiveSpotPrice}
                  disabled={fetchingSpot}
                  className="px-3 py-2 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  title="Fetch live spot price"
                >
                  {fetchingSpot ? '...' : '🔄 Live'}
                </button>
              </div>
              {liveSpotPrice !== null && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-xs text-green-800">
                    Live: ₹{liveSpotPrice.toFixed(2)}
                  </p>
                  <button
                    onClick={updateSpotFromLive}
                    className="mt-1 text-xs text-green-700 underline hover:text-green-900"
                  >
                    Use this value
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">CE Offset</label>
              <input
                type="number"
                value={config.defaultCeOffset}
                onChange={(e) => setConfig({ ...config, defaultCeOffset: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">PE Offset</label>
              <input
                type="number"
                value={config.defaultPeOffset}
                onChange={(e) => setConfig({ ...config, defaultPeOffset: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Strike Range</label>
              <input
                type="number"
                value={config.strikeRange}
                onChange={(e) => setConfig({ ...config, strikeRange: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Strike Step</label>
              <input
                type="number"
                value={config.strikeStep}
                onChange={(e) => setConfig({ ...config, strikeStep: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Valid Range</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={config.validStrikeMin}
                  onChange={(e) => setConfig({ ...config, validStrikeMin: parseInt(e.target.value) })}
                  className="w-1/2 px-2 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
                  placeholder="Min"
                />
                <input
                  type="number"
                  value={config.validStrikeMax}
                  onChange={(e) => setConfig({ ...config, validStrikeMax: parseInt(e.target.value) })}
                  className="w-1/2 px-2 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
                  placeholder="Max"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Lot Sizes */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Lot Sizes (for Options)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">NIFTY</label>
              <input
                type="number"
                value={config.lotSizes?.NIFTY || 65}
                onChange={(e) => setConfig({ ...config, lotSizes: { ...config.lotSizes, NIFTY: parseInt(e.target.value) } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">BANKNIFTY</label>
              <input
                type="number"
                value={config.lotSizes?.BANKNIFTY || 15}
                onChange={(e) => setConfig({ ...config, lotSizes: { ...config.lotSizes, BANKNIFTY: parseInt(e.target.value) } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">FINNIFTY</label>
              <input
                type="number"
                value={config.lotSizes?.FINNIFTY || 25}
                onChange={(e) => setConfig({ ...config, lotSizes: { ...config.lotSizes, FINNIFTY: parseInt(e.target.value) } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">MIDCPNIFTY</label>
              <input
                type="number"
                value={config.lotSizes?.MIDCPNIFTY || 50}
                onChange={(e) => setConfig({ ...config, lotSizes: { ...config.lotSizes, MIDCPNIFTY: parseInt(e.target.value) } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={() => setConfig(DEFAULT_CONFIG)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}

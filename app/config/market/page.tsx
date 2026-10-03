'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface MarketConfig {
  currentFuture: string; // e.g., "27FEBFUT"
  defaultExpiry: string; // e.g., "FEB"
  weeklyExpiries: Array<{ value: string; label: string }>; // e.g., [{ value: "6FEB", label: "6 FEB (Thursday)" }]
  monthlyExpiries: Array<{ value: string; label: string }>;
  defaultSpotPrice: number; // Fallback spot price
  defaultCeOffset: number; // Offset from ATM for CE (e.g., +100)
  defaultPeOffset: number; // Offset from ATM for PE (e.g., -100)
  strikeRange: number; // How many strikes to show in dropdown (e.g., 21 = ±1000 from ATM)
  strikeStep: number; // Strike increment (e.g., 100)
  validStrikeMin: number; // Min valid strike (e.g., 18000)
  validStrikeMax: number; // Max valid strike (e.g., 30000)
  lastUpdated: number; // Timestamp
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
  lastUpdated: Date.now(),
};

export default function MarketConfigPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<MarketConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load config from Firebase on mount
  useEffect(() => {
    if (!user) return;

    const loadConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'market');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as MarketConfig;
          setConfig(data);
          console.log('[MARKET-CONFIG] Loaded from Firebase:', data);

          // Cache in localStorage for quick access
          localStorage.setItem('marketConfig', JSON.stringify(data));
        } else {
          console.log('[MARKET-CONFIG] No config found, using defaults');
          // Save default config
          await saveConfigToFirebase(DEFAULT_CONFIG);
        }
      } catch (error) {
        console.error('[MARKET-CONFIG] Error loading config:', error);
        setMessage({ type: 'error', text: 'Failed to load config' });
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [user]);

  const saveConfigToFirebase = async (configToSave: MarketConfig) => {
    if (!user) return;

    try {
      const docRef = doc(db, 'config', 'market');
      const updatedConfig = {
        ...configToSave,
        lastUpdated: Date.now(),
      };

      await setDoc(docRef, updatedConfig);

      // Update localStorage cache
      localStorage.setItem('marketConfig', JSON.stringify(updatedConfig));

      return updatedConfig;
    } catch (error) {
      console.error('[MARKET-CONFIG] Error saving config:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const updatedConfig = await saveConfigToFirebase(config);
      setConfig(updatedConfig!);
      setMessage({ type: 'success', text: 'Configuration saved successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddWeeklyExpiry = () => {
    setConfig(prev => ({
      ...prev,
      weeklyExpiries: [...prev.weeklyExpiries, { value: '', label: '' }],
    }));
  };

  const handleRemoveWeeklyExpiry = (index: number) => {
    setConfig(prev => ({
      ...prev,
      weeklyExpiries: prev.weeklyExpiries.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateWeeklyExpiry = (index: number, field: 'value' | 'label', value: string) => {
    setConfig(prev => ({
      ...prev,
      weeklyExpiries: prev.weeklyExpiries.map((exp, i) =>
        i === index ? { ...exp, [field]: value } : exp
      ),
    }));
  };

  const handleAddMonthlyExpiry = () => {
    setConfig(prev => ({
      ...prev,
      monthlyExpiries: [...prev.monthlyExpiries, { value: '', label: '' }],
    }));
  };

  const handleRemoveMonthlyExpiry = (index: number) => {
    setConfig(prev => ({
      ...prev,
      monthlyExpiries: prev.monthlyExpiries.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateMonthlyExpiry = (index: number, field: 'value' | 'label', value: string) => {
    setConfig(prev => ({
      ...prev,
      monthlyExpiries: prev.monthlyExpiries.map((exp, i) =>
        i === index ? { ...exp, [field]: value } : exp
      ),
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Loading market configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Market Configuration</h1>
          <p className="text-sm text-gray-600 mt-2">
            Manage default settings for futures, options, and expiries. Changes apply to all chart pages.
          </p>
          {config.lastUpdated && (
            <p className="text-xs text-gray-500 mt-1">
              Last updated: {new Date(config.lastUpdated).toLocaleString()}
            </p>
          )}
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Configuration Form */}
        <div className="bg-white rounded-lg shadow-md p-6 space-y-6">

          {/* Futures Symbol */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Current Futures Symbol
            </label>
            <input
              type="text"
              value={config.currentFuture}
              onChange={(e) => setConfig({ ...config, currentFuture: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              placeholder="e.g., 26FEBFUT"
            />
            <p className="text-xs text-gray-500 mt-1">
              Format: YYMMMFUT (e.g., 26FEBFUT = Feb 2026, 26MARFUT = Mar 2026)
            </p>
          </div>

          {/* Default Expiry */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Default Expiry
            </label>
            <input
              type="text"
              value={config.defaultExpiry}
              onChange={(e) => setConfig({ ...config, defaultExpiry: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              placeholder="e.g., FEB"
            />
            <p className="text-xs text-gray-500 mt-1">
              This expiry will be selected by default on chart pages
            </p>
          </div>

          {/* Weekly Expiries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                Weekly Expiries
              </label>
              <button
                onClick={handleAddWeeklyExpiry}
                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
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
                    onChange={(e) => handleUpdateWeeklyExpiry(index, 'value', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                    placeholder="Value (e.g., 6FEB)"
                  />
                  <input
                    type="text"
                    value={expiry.label}
                    onChange={(e) => handleUpdateWeeklyExpiry(index, 'label', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                    placeholder="Label (e.g., 6 FEB (Thursday))"
                  />
                  <button
                    onClick={() => handleRemoveWeeklyExpiry(index)}
                    className="px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Expiries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                Monthly Expiries
              </label>
              <button
                onClick={handleAddMonthlyExpiry}
                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
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
                    onChange={(e) => handleUpdateMonthlyExpiry(index, 'value', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                    placeholder="Value (e.g., FEB)"
                  />
                  <input
                    type="text"
                    value={expiry.label}
                    onChange={(e) => handleUpdateMonthlyExpiry(index, 'label', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                    placeholder="Label (e.g., FEB (Monthly - 27th))"
                  />
                  <button
                    onClick={() => handleRemoveMonthlyExpiry(index)}
                    className="px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Strike Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Default Spot Price (Fallback)
              </label>
              <input
                type="number"
                value={config.defaultSpotPrice}
                onChange={(e) => setConfig({ ...config, defaultSpotPrice: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Strike Step
              </label>
              <input
                type="number"
                value={config.strikeStep}
                onChange={(e) => setConfig({ ...config, strikeStep: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                CE Offset from ATM
              </label>
              <input
                type="number"
                value={config.defaultCeOffset}
                onChange={(e) => setConfig({ ...config, defaultCeOffset: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                PE Offset from ATM
              </label>
              <input
                type="number"
                value={config.defaultPeOffset}
                onChange={(e) => setConfig({ ...config, defaultPeOffset: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Strike Range (Count)
              </label>
              <input
                type="number"
                value={config.strikeRange}
                onChange={(e) => setConfig({ ...config, strikeRange: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of strikes to show in dropdown (e.g., 21 = ±1000 from ATM)
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Valid Strike Range
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.validStrikeMin}
                  onChange={(e) => setConfig({ ...config, validStrikeMin: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="Min"
                />
                <input
                  type="number"
                  value={config.validStrikeMax}
                  onChange={(e) => setConfig({ ...config, validStrikeMax: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="Max"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => setConfig(DEFAULT_CONFIG)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Reset to Defaults
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6 bg-blue-50 rounded-lg border border-blue-200 p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Configuration Preview</h3>
          <pre className="text-xs text-blue-800 overflow-auto">
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

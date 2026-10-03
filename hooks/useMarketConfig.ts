import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface MarketConfig {
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

/**
 * Generate dynamic monthly expiries for current month + next 3 months
 * Format: Current month is used as defaultExpiry and currentFuture
 */
function generateMonthlyExpiries() {
  const now = new Date();
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthlyExpiries: Array<{ value: string; label: string }> = [];

  // Generate current month + next 3 months (total 4 months)
  for (let i = 0; i < 4; i++) {
    const targetDate = new Date(now);
    targetDate.setMonth(now.getMonth() + i);

    const monthName = monthNames[targetDate.getMonth()];
    const isCurrent = i === 0;

    monthlyExpiries.push({
      value: monthName,
      label: `${monthName} (${isCurrent ? 'Current' : 'Monthly'})`,
    });
  }

  return monthlyExpiries;
}

/**
 * Get current month's futures contract name
 * Format: 26JUNFUT (always uses 26th day, month name from current date)
 */
function getCurrentFuturesContract(): string {
  const now = new Date();
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthName = monthNames[now.getMonth()];
  return `26${monthName}FUT`;
}

/**
 * Get current month's 3-letter code
 */
function getCurrentMonth(): string {
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return monthNames[new Date().getMonth()];
}

const DEFAULT_CONFIG: MarketConfig = {
  currentFuture: getCurrentFuturesContract(), // Dynamic: 26JUNFUT, 26JULFUT, etc.
  defaultExpiry: getCurrentMonth(), // Dynamic: JUN, JUL, etc.
  weeklyExpiries: [
    { value: '6FEB', label: '6 FEB (Thursday)' },
    { value: '13FEB', label: '13 FEB (Thursday)' },
    { value: '20FEB', label: '20 FEB (Thursday)' },
  ],
  monthlyExpiries: generateMonthlyExpiries(), // Dynamic: generates current + next 3 months
  defaultSpotPrice: 25300,
  defaultCeOffset: 100,
  defaultPeOffset: -100,
  strikeRange: 21,
  strikeStep: 100,
  validStrikeMin: 20000, // Wider range to accommodate market movements
  validStrikeMax: 35000, // Wider range to accommodate market movements
  lotSizes: {
    NIFTY: 65,
    BANKNIFTY: 15,
    FINNIFTY: 25,
    MIDCPNIFTY: 50,
  },
  lastUpdated: Date.now(),
};

const CACHE_KEY = 'marketConfig';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useMarketConfig() {
  const [config, setConfig] = useState<MarketConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      // 1. Try localStorage cache first (instant load)
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        const cacheAge = Date.now() - parsedCache.lastUpdated;

        if (cacheAge < CACHE_DURATION) {
          console.log('[MARKET-CONFIG] Using cached config (age:', Math.round(cacheAge / 1000), 'seconds)');
          setConfig(parsedCache);
          setLoading(false);
          return;
        }
      }

      // 2. Fetch from Firebase if cache is stale or missing
      console.log('[MARKET-CONFIG] Fetching from Firebase...');
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
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        console.log('[MARKET-CONFIG] Loaded from Firebase and cached');
      } else {
        console.log('[MARKET-CONFIG] No Firebase config found, using defaults');
        setConfig(DEFAULT_CONFIG);
        localStorage.setItem(CACHE_KEY, JSON.stringify(DEFAULT_CONFIG));
      }
    } catch (error) {
      console.error('[MARKET-CONFIG] Error loading config:', error);
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  const refreshConfig = () => {
    localStorage.removeItem(CACHE_KEY);
    setLoading(true);
    loadConfig();
  };

  return { config, loading, refreshConfig };
}

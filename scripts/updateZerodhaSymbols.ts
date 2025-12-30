/**
 * Update Zerodha Symbols from Zerodha Instruments API
 *
 * This script fetches the latest symbols from Zerodha and updates the local JSON file.
 * It requires Zerodha API credentials and access token.
 *
 * Usage:
 * npx ts-node scripts/updateZerodhaSymbols.ts
 *
 * Requirements:
 * - Set ZERODHA_API_KEY and ZERODHA_ACCESS_TOKEN in environment
 * - Or configure in script below
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

interface ZerodhaInstrument {
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name: string;
  last_price: number;
  expiry: string;
  strike: number;
  lot_size: number;
  instrument_type: string;
  segment: string;
  exchange: string;
}

interface SymbolMapping {
  symbol: string;
  token: number;
  exchange: string;
  segment: string;
  lotsize: number;
  isIndex?: boolean;
}

async function updateZerodhaSymbols() {
  console.log('[UPDATE] Starting Zerodha symbol update...');

  const apiKey = process.env.ZERODHA_API_KEY;
  const accessToken = process.env.ZERODHA_ACCESS_TOKEN;

  if (!apiKey || !accessToken) {
    console.error('[ERROR] Missing ZERODHA_API_KEY or ZERODHA_ACCESS_TOKEN environment variables');
    console.error('[INFO] Set these in .env.local or pass as environment variables');
    console.error('[FALLBACK] You can also manually add symbols to lib/data/zerodhasymbol.json');
    process.exit(1);
  }

  try {
    console.log('[FETCH] Downloading symbols from Zerodha Instruments API...');

    // Fetch instruments from Zerodha API
    const response = await axios.get('https://api.kite.trade/instruments', {
      headers: {
        Authorization: `token ${apiKey}:${accessToken}`,
        'X-Kite-Version': '3',
      },
    });

    if (!response.data) {
      throw new Error('No data returned from Zerodha API');
    }

    const instruments: ZerodhaInstrument[] = response.data.data || response.data;
    console.log(`[FETCH] Downloaded ${instruments.length} instruments`);

    // Filter and map to our format
    console.log('[PROCESS] Processing instruments...');
    const mappings: Record<string, SymbolMapping> = {};
    const stats = {
      total: 0,
      nse: 0,
      bse: 0,
      nfo: 0,
      cds: 0,
      indices: 0,
    };

    for (const inst of instruments) {
      // Skip expired contracts and invalid entries
      if (!inst.tradingsymbol || !inst.instrument_token) {
        continue;
      }

      // Determine if it's an index
      const isIndex =
        inst.name &&
        (inst.name.includes('INDEX') ||
          inst.name.includes('NIFTY') ||
          inst.name.includes('SENSEX') ||
          inst.name.includes('VIX'));

      const mapping: SymbolMapping = {
        symbol: inst.tradingsymbol.split('-')[0], // Remove expiry suffix
        token: inst.instrument_token,
        exchange: inst.exchange || 'NSE',
        segment: inst.segment || 'EQ',
        lotsize: inst.lot_size || 1,
        ...(isIndex && { isIndex: true }),
      };

      // Create doc ID: EXCHANGE_SYMBOL
      const docId = `${inst.exchange}_${mapping.symbol}`;

      // Skip duplicates (use last occurrence)
      mappings[docId] = mapping;

      // Count stats
      stats.total++;
      if (inst.exchange === 'NSE') stats.nse++;
      if (inst.exchange === 'BSE') stats.bse++;
      if (inst.exchange === 'NFO') stats.nfo++;
      if (inst.exchange === 'CDS') stats.cds++;
      if (isIndex) stats.indices++;
    }

    console.log(`[PROCESS] Created ${Object.keys(mappings).length} unique mappings`);

    // Add metadata
    const output: any = {
      _comment: 'Zerodha Symbol Mappings - Auto-generated from Zerodha Instruments API',
      _lastUpdated: new Date().toISOString().split('T')[0],
      _source: 'Zerodha Instruments API',
      _stats: stats,
      ...mappings,
    };

    // Write to file
    const filePath = path.join(__dirname, '../lib/data/zerodhasymbol.json');

    console.log(`[SAVE] Writing to ${filePath}...`);
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');

    console.log(`\n[SUCCESS] ✅ Zerodha symbols updated!`);
    console.log(`\nStatistics:`);
    console.log(`  Total symbols: ${stats.total}`);
    console.log(`  NSE equities: ${stats.nse}`);
    console.log(`  BSE equities: ${stats.bse}`);
    console.log(`  NFO futures/options: ${stats.nfo}`);
    console.log(`  CDS currency: ${stats.cds}`);
    console.log(`  Indices: ${stats.indices}`);
    console.log(`\nFile: ${filePath}`);
    console.log(`\nNext steps:`);
    console.log('  1. Review changes in lib/data/zerodhasymbol.json');
    console.log('  2. Commit to git');
    console.log('  3. Test with: npm run build');
  } catch (error: any) {
    console.error('[ERROR] Failed to update symbols:', error.message);
    if (error.response?.status === 401) {
      console.error('[INFO] Authentication failed. Check ZERODHA_API_KEY and ZERODHA_ACCESS_TOKEN');
    }
    process.exit(1);
  }
}

// Run
updateZerodhaSymbols();

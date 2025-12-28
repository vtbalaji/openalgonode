/**
 * Initialize Angel Broker Symbol Mappings
 * Fetches Angel's master token file and stores all symbols in Firestore
 *
 * Usage: npx ts-node scripts/initializeAngelSymbols.ts
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, '../firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('Firebase service account file not found at:', serviceAccountPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const adminDb = admin.firestore();

interface AngelMasterSymbol {
  token?: string;
  exch_token?: string;
  symboltoken?: string;
  symbol?: string;
  symbol_token?: string;
  scripname?: string;
  trading_symbol?: string;
  exchange?: string;
  exch?: string;
  lotsize?: string | number;
  ticksize?: string | number;
  instrumenttype?: string;
  expiry?: string;
  [key: string]: any;
}

async function initializeAngelSymbols() {
  console.log('[INIT] Starting Angel Broker symbol initialization...');

  try {
    // Fetch Angel's master token file
    console.log('[FETCH] Downloading Angel master token file...');
    const response = await fetch(
      'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json'
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch master file: HTTP ${response.status}`);
    }

    const masterData = (await response.json()) as AngelMasterSymbol[];
    console.log(`[FETCH] Downloaded ${masterData.length} symbols from Angel master file`);

    // Process and prepare mappings
    console.log('[PROCESS] Converting to symbol mappings...');
    const mappings = [];

    for (const scrip of masterData) {
      // Extract fields with multiple fallbacks
      const symbol = (scrip.scripname || scrip.trading_symbol || scrip.symbol || '').toUpperCase();
      const exchange = (scrip.exchange || scrip.exch || 'NSE').toUpperCase();
      const token = String(
        scrip.token || scrip.exch_token || scrip.symboltoken || scrip.symbol_token || ''
      );

      // Skip invalid entries
      if (!symbol || !token) {
        continue;
      }

      const mapping = {
        // Standard OpenAlgo fields
        symbol: symbol,
        exchange: exchange,

        // Broker-specific fields
        broker: 'angel',
        brsymbol: symbol, // Angel uses the full symbol with suffixes
        token: token,

        // Metadata
        lotsize: parseInt(String(scrip.lotsize || 1), 10),
        ticksize: parseFloat(String(scrip.ticksize || 0.01)),
        instrumenttype: scrip.instrumenttype || 'EQUITY',
        expirydate: scrip.expiry || undefined,

        // Tracking
        lastUpdated: new Date(),
        source: 'masterfile' as const,
      };

      mappings.push(mapping);
    }

    console.log(`[PROCESS] Prepared ${mappings.length} valid symbol mappings`);

    // Save to Firestore in batches
    console.log('[SAVE] Storing mappings in Firestore...');
    let batch = adminDb.batch();
    let count = 0;
    const batchSize = 500;

    for (const mapping of mappings) {
      const docId = `angel_${mapping.exchange}_${mapping.symbol}`;
      const docRef = adminDb.collection('symbolMappings').doc(docId);

      batch.set(docRef, mapping, { merge: true });

      count++;

      if (count % batchSize === 0) {
        await batch.commit();
        console.log(`[SAVE] Committed ${count} mappings...`);
        batch = adminDb.batch();
      }
    }

    // Commit remaining
    if (count % batchSize !== 0) {
      await batch.commit();
    }

    console.log(`[SAVE] ✅ Successfully saved ${count} symbol mappings to Firestore`);

    // Print some statistics
    const nseMappings = mappings.filter((m) => m.exchange === 'NSE');
    const nfoMappings = mappings.filter((m) => m.exchange === 'NFO');
    const bseMappings = mappings.filter((m) => m.exchange === 'BSE');

    console.log('\n[STATS] Symbol distribution:');
    console.log(`  NSE: ${nseMappings.length} symbols`);
    console.log(`  NFO: ${nfoMappings.length} symbols`);
    console.log(`  BSE: ${bseMappings.length} symbols`);

    // Show some sample symbols
    console.log('\n[SAMPLES] First 10 NSE symbols:');
    nseMappings.slice(0, 10).forEach((m) => {
      console.log(`  ${m.symbol} (Token: ${m.token})`);
    });

    console.log('\n[SUCCESS] ✅ Angel symbol initialization complete!');
  } catch (error) {
    console.error('[ERROR] Failed to initialize Angel symbols:', error);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

// Run the initialization
initializeAngelSymbols();

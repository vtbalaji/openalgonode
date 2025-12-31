/**
 * Debug endpoint to check price stream setup
 * GET /api/debug/price-stream-status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBrokerConfigFromEnv } from '@/lib/brokerConfigEnv';
import { getInstrumentToken, getAvailableSymbols } from '@/lib/websocket/instrumentMapping';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const testSymbol = searchParams.get('symbol') || 'NIFTY 50';

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    symbol: testSymbol,
    checks: {},
  };

  // Check 1: Environment configuration
  diagnostics.checks.envConfig = {
    hasBrokerConfigInEnv: getBrokerConfigFromEnv('zerodha') !== null,
    envDetails: {
      hasZerodhaApiKey: !!process.env.ZERODHA_API_KEY,
      hasZerodhaApiSecret: !!process.env.ZERODHA_API_SECRET,
    },
  };

  // Check 2: Symbol mapping
  const token = getInstrumentToken(testSymbol);
  const availableSymbols = getAvailableSymbols();
  diagnostics.checks.symbolMapping = {
    symbol: testSymbol,
    token: token,
    foundInCache: token !== null,
    totalAvailableSymbols: availableSymbols.length,
    sampleSymbols: availableSymbols.slice(0, 5), // First 5 for brevity
  };

  // Check 3: WebSocket service status
  try {
    const { getTickerService } = await import('@/lib/websocket/tickerService');
    const ticker = getTickerService();
    diagnostics.checks.tickerService = {
      isConnected: ticker.getConnectionStatus(),
      subscribedTokens: ticker.getSubscribedTokens(),
    };
  } catch (error) {
    diagnostics.checks.tickerService = {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check 4: Encryption
  const hasEncryptionKey = !!process.env.NEXT_PUBLIC_ENCRYPTION_KEY;
  diagnostics.checks.encryption = {
    hasEncryptionKey,
    encryptionKeyLength: hasEncryptionKey ? process.env.NEXT_PUBLIC_ENCRYPTION_KEY!.length : 0,
  };

  // Recommendation
  if (!diagnostics.checks.envConfig.hasBrokerConfigInEnv) {
    diagnostics.recommendation = 'ZERODHA_API_KEY and ZERODHA_API_SECRET must be set in environment variables. Access token will be fetched from Firebase after user authentication.';
  } else if (!token) {
    diagnostics.recommendation = `Symbol ${testSymbol} not found in token mapping. Check if symbol name is correct (e.g., "NIFTY 50" vs "NIFTY50").`;
  } else if (!hasEncryptionKey) {
    diagnostics.recommendation = 'NEXT_PUBLIC_ENCRYPTION_KEY must be set to decrypt stored credentials.';
  } else {
    diagnostics.recommendation = 'All checks passed. If prices still not streaming, check: 1) User authenticated with Zerodha, 2) Access token stored in Firebase, 3) Market hours.';
  }

  return NextResponse.json(diagnostics, { status: 200 });
}

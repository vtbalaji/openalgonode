/**
 * Symbol Mapping for Multi-Broker Support
 * Simple JSON-based mapping for Zerodha and Fyers
 */

interface SymbolMap {
  [standardSymbol: string]: {
    zerodha: string;
    fyers: string;
  };
}

// Master symbol mapping - only essential symbols
const SYMBOL_MAPPINGS: SymbolMap = {
  // Stocks
  RELIANCE: {
    zerodha: 'RELIANCE',
    fyers: 'RELIANCE-EQ',
  },
  TCS: {
    zerodha: 'TCS',
    fyers: 'TCS-EQ',
  },

  // Indices
  NIFTY50: {
    zerodha: 'NIFTY 50',
    fyers: 'NIFTY50-IX',
  },
  BANKNIFTY: {
    zerodha: 'BANKNIFTY',
    fyers: 'BANKNIFTY-IX',
  },

  // Futures
  NIFTYJANFUT: {
    zerodha: 'NIFTY25JANFUT',
    fyers: 'NIFTY50JAN25-FUT',
  },
};

/**
 * Convert standard symbol to broker-specific format
 */
export function convertToBrokerSymbol(standardSymbol: string, broker: 'zerodha' | 'fyers'): string {
  const mapping = SYMBOL_MAPPINGS[standardSymbol];

  if (!mapping) {
    // Fallback: for Fyers, add -EQ suffix if not already present
    if (broker === 'fyers' && !standardSymbol.includes('-')) {
      return standardSymbol + '-EQ';
    }
    return standardSymbol;
  }

  return mapping[broker];
}

/**
 * Convert broker-specific symbol to standard format
 */
export function convertFromBrokerSymbol(brokerSymbol: string, broker: 'zerodha' | 'fyers'): string {
  // Search through mappings to find matching symbol
  for (const [standardSymbol, brokerMappings] of Object.entries(SYMBOL_MAPPINGS)) {
    if (brokerMappings[broker] === brokerSymbol) {
      return standardSymbol;
    }
  }

  // Remove Fyers -EQ suffix if present
  if (broker === 'fyers' && brokerSymbol.endsWith('-EQ')) {
    const withoutSuffix = brokerSymbol.slice(0, -3);
    return withoutSuffix;
  }

  return brokerSymbol;
}

/**
 * Get all supported symbols
 */
export function getSupportedSymbols(): string[] {
  return Object.keys(SYMBOL_MAPPINGS);
}

/**
 * Check if a symbol is supported
 */
export function isSymbolSupported(standardSymbol: string): boolean {
  return standardSymbol in SYMBOL_MAPPINGS;
}

/**
 * Get mapping for a specific symbol
 */
export function getSymbolMapping(standardSymbol: string) {
  return SYMBOL_MAPPINGS[standardSymbol];
}

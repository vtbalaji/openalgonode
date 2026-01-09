/**
 * Symbol Mapping for Multi-Broker Support
 * Simple JSON-based mapping for Zerodha and Fyers
 */

interface SymbolMap {
  [standardSymbol: string]: {
    zerodha: string;
    fyers: string;
    type: 'stock' | 'index' | 'future'; // For proper symbol formatting
  };
}

// Master symbol mapping - only essential symbols
const SYMBOL_MAPPINGS: SymbolMap = {
  // Stocks
  RELIANCE: {
    zerodha: 'RELIANCE',
    fyers: 'NSE:RELIANCE-EQ',
    type: 'stock',
  },
  TCS: {
    zerodha: 'TCS',
    fyers: 'NSE:TCS-EQ',
    type: 'stock',
  },
  INFY: {
    zerodha: 'INFOSY',
    fyers: 'NSE:INFY-EQ',
    type: 'stock',
  },

  // Indices
  NIFTY50: {
    zerodha: 'NIFTY 50',
    fyers: 'NSE:NIFTY50-IX',
    type: 'index',
  },
  'NIFTY 50': {
    zerodha: 'NIFTY 50',
    fyers: 'NSE:NIFTY50-IX',
    type: 'index',
  },
  BANKNIFTY: {
    zerodha: 'BANKNIFTY',
    fyers: 'NSE:BANKNIFTY-IX',
    type: 'index',
  },
  'NIFTY BANK': {
    zerodha: 'BANKNIFTY',
    fyers: 'NSE:BANKNIFTY-IX',
    type: 'index',
  },

  // Futures - Monthly NIFTY contracts (update as expiry approaches)
  // Current active contract: Jan 26, 2026 expiry (current as of Jan 9, 2026)
  NIFTY26JANFUT: {
    zerodha: 'NIFTY25JANFUT',
    fyers: 'NSE:NIFTY26JANFUT',
    type: 'future',
  },

  // Next month: Jan 29, 2026 expiry (if available)
  NIFTY29JANFUT: {
    zerodha: 'NIFTY29JANFUT',
    fyers: 'NSE:NIFTY29JANFUT',
    type: 'future',
  },

  // Further ahead: Feb 26, 2026 expiry
  NIFTY26FEBJFUT: {
    zerodha: 'NIFTY26FEBJFUT',
    fyers: 'NSE:NIFTY26FEBJFUT',
    type: 'future',
  },
};

/**
 * Detect symbol type and format appropriately
 */
function detectSymbolType(symbol: string): 'stock' | 'index' | 'future' {
  // Futures have FUT in the name
  if (symbol.includes('FUT')) return 'future';
  // Indices typically have NIFTY, BANKNIFTY, SENSEX, etc. but we check the mapping
  return 'stock';
}

/**
 * Convert standard symbol to broker-specific format
 */
export function convertToBrokerSymbol(standardSymbol: string, broker: 'zerodha' | 'fyers'): string {
  const mapping = SYMBOL_MAPPINGS[standardSymbol];

  if (!mapping) {
    // Fallback: detect symbol type and format appropriately for Fyers
    if (broker === 'fyers') {
      const symbolType = detectSymbolType(standardSymbol);
      if (!standardSymbol.includes('-')) {
        if (symbolType === 'future') {
          return `NSE:${standardSymbol}-FUT`;
        } else if (symbolType === 'index') {
          return `NSE:${standardSymbol}-IX`;
        } else {
          return `NSE:${standardSymbol}-EQ`;
        }
      }
      // If symbol already has a suffix but no exchange prefix, add it
      if (!standardSymbol.includes(':')) {
        return `NSE:${standardSymbol}`;
      }
      return standardSymbol;
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

  // Fallback: remove Fyers exchange prefix and suffixes
  if (broker === 'fyers') {
    let cleaned = brokerSymbol;
    // Remove NSE: prefix if present
    if (cleaned.startsWith('NSE:')) {
      cleaned = cleaned.slice(4);
    }
    // Remove -EQ, -IX, -FUT suffixes
    cleaned = cleaned.replace(/-EQ$/, '').replace(/-IX$/, '').replace(/-FUT$/, '');
    return cleaned;
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
export function getSymbolMapping(standardSymbol: string): SymbolMap[string] | undefined {
  return SYMBOL_MAPPINGS[standardSymbol];
}

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

  // Indices - Note: Fyers API may not support indices via history endpoint
  // If these return 422 errors, use futures contracts instead (NIFTY26JANFUT, etc)
  NIFTY50: {
    zerodha: 'NIFTY 50',
    fyers: 'NSE:NIFTY50',
    type: 'index',
  },
  'NIFTY 50': {
    zerodha: 'NIFTY 50',
    fyers: 'NSE:NIFTY50',
    type: 'index',
  },
  BANKNIFTY: {
    zerodha: 'BANKNIFTY',
    fyers: 'NSE:BANKNIFTY',
    type: 'index',
  },
  'NIFTY BANK': {
    zerodha: 'BANKNIFTY',
    fyers: 'NSE:BANKNIFTY',
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

  // Feb 26, 2026 expiry
  NIFTY26FEBFUT: {
    zerodha: 'NIFTY26FEBFUT',
    fyers: 'NSE:NIFTY26FEBFUT',
    type: 'future',
  },

  // Mar 26, 2026 expiry
  NIFTY26MARFUT: {
    zerodha: 'NIFTY26MARFUT',
    fyers: 'NSE:NIFTY26MARFUT',
    type: 'future',
  },

  // Apr 26, 2026 expiry
  NIFTY26APRFUT: {
    zerodha: 'NIFTY26APRFUT',
    fyers: 'NSE:NIFTY26APRFUT',
    type: 'future',
  },

  // May 26, 2026 expiry
  NIFTY26MAYFUT: {
    zerodha: 'NIFTY26MAYFUT',
    fyers: 'NSE:NIFTY26MAYFUT',
    type: 'future',
  },

  // Jun 26, 2026 expiry
  NIFTY26JUNFUT: {
    zerodha: 'NIFTY26JUNFUT',
    fyers: 'NSE:NIFTY26JUNFUT',
    type: 'future',
  },

  // Jul 26, 2026 expiry
  NIFTY26JULFUT: {
    zerodha: 'NIFTY26JULFUT',
    fyers: 'NSE:NIFTY26JULFUT',
    type: 'future',
  },

  // Aug 26, 2026 expiry
  NIFTY26AUGFUT: {
    zerodha: 'NIFTY26AUGFUT',
    fyers: 'NSE:NIFTY26AUGFUT',
    type: 'future',
  },

  // Bank NIFTY - Feb 26, 2026 expiry
  BANKNIFTY26FEBFUT: {
    zerodha: 'BANKNIFTY26FEBFUT',
    fyers: 'NSE:BANKNIFTY26FEBFUT',
    type: 'future',
  },

  // Bank NIFTY - Mar 26, 2026 expiry
  BANKNIFTY26MARFUT: {
    zerodha: 'BANKNIFTY26MARFUT',
    fyers: 'NSE:BANKNIFTY26MARFUT',
    type: 'future',
  },

  // Bank NIFTY - Apr 26, 2026 expiry
  BANKNIFTY26APRFUT: {
    zerodha: 'BANKNIFTY26APRFUT',
    fyers: 'NSE:BANKNIFTY26APRFUT',
    type: 'future',
  },

  // Bank NIFTY - May 26, 2026 expiry
  BANKNIFTY26MAYFUT: {
    zerodha: 'BANKNIFTY26MAYFUT',
    fyers: 'NSE:BANKNIFTY26MAYFUT',
    type: 'future',
  },

  // Bank NIFTY - Jun 26, 2026 expiry
  BANKNIFTY26JUNFUT: {
    zerodha: 'BANKNIFTY26JUNFUT',
    fyers: 'NSE:BANKNIFTY26JUNFUT',
    type: 'future',
  },

  // Bank NIFTY - Jul 26, 2026 expiry
  BANKNIFTY26JULFUT: {
    zerodha: 'BANKNIFTY26JULFUT',
    fyers: 'NSE:BANKNIFTY26JULFUT',
    type: 'future',
  },

  // Bank NIFTY - Aug 26, 2026 expiry
  BANKNIFTY26AUGFUT: {
    zerodha: 'BANKNIFTY26AUGFUT',
    fyers: 'NSE:BANKNIFTY26AUGFUT',
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
      // Check if this is an option contract (ends with CE or PE)
      const isOption = standardSymbol.endsWith('CE') || standardSymbol.endsWith('PE');

      if (isOption) {
        // Option contracts: NSE:NIFTY13JAN25700CE (no -CE suffix, it's part of the symbol)
        if (!standardSymbol.includes(':')) {
          return `NSE:${standardSymbol}`;
        }
        return standardSymbol;
      }

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

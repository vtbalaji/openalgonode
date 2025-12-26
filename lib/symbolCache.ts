/**
 * In-Memory Symbol Cache
 * Loads Zerodha symbols once and caches in memory
 * No Firebase writes needed - solves quota issues
 */

interface CachedSymbol {
  token: number;
  symbol: string;
  exchange: string;
  expiry?: string;
  strikePrice?: number;
  optionType?: string;
}

class SymbolCache {
  private symbols: Map<string, CachedSymbol> = new Map();
  private isLoaded: boolean = false;
  private isLoading: boolean = false;
  private lastLoadTime: Date | null = null;
  private loadError: string | null = null;

  /**
   * Load symbols from Zerodha API
   */
  async load(apiKey: string, accessToken: string): Promise<boolean> {
    if (this.isLoaded) {
      console.log('Symbol cache already loaded');
      return true;
    }

    if (this.isLoading) {
      console.log('Symbol cache loading in progress...');
      return false;
    }

    this.isLoading = true;
    this.loadError = null;

    try {
      console.log('Loading symbols from Zerodha API...');
      const response = await fetch('https://api.kite.trade/instruments', {
        headers: {
          'Authorization': `${apiKey}:${accessToken}`,
          'X-Kite-Version': '3',
        },
      });

      if (!response.ok) {
        throw new Error(`Zerodha API error: ${response.status}`);
      }

      const text = await response.text();
      const lines = text.trim().split('\n');

      if (lines.length < 2) {
        throw new Error('No instruments returned from Zerodha');
      }

      // Parse CSV header
      const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
      const tokenIndex = headers.indexOf('instrument_token');
      const symbolIndex = headers.indexOf('tradingsymbol');
      const exchangeIndex = headers.indexOf('exchange');
      const expiryIndex = headers.indexOf('expiry');
      const strikePriceIndex = headers.indexOf('strike');
      const optionTypeIndex = headers.indexOf('option_type');

      if (tokenIndex === -1 || symbolIndex === -1 || exchangeIndex === -1) {
        throw new Error('Zerodha CSV format unexpected');
      }

      // Parse CSV data
      let count = 0;
      let optionsCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Handle quoted CSV fields
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char: string = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        const token = values[tokenIndex];
        const symbol = values[symbolIndex]?.toUpperCase() || '';
        const exchange = values[exchangeIndex] || '';
        const expiry = expiryIndex !== -1 ? values[expiryIndex] : '';
        const strikePrice = strikePriceIndex !== -1 ? values[strikePriceIndex] : '';
        const optionType = optionTypeIndex !== -1 ? values[optionTypeIndex] : '';

        if (!token || !symbol) continue;

        const symbolData: CachedSymbol = {
          token: parseInt(token),
          symbol,
          exchange,
        };

        if (expiry) symbolData.expiry = expiry;
        if (strikePrice) symbolData.strikePrice = parseFloat(strikePrice);
        if (optionType) symbolData.optionType = optionType;

        this.symbols.set(symbol, symbolData);
        count++;

        if (optionType) optionsCount++;
      }

      this.isLoaded = true;
      this.lastLoadTime = new Date();
      console.log(`Symbol cache loaded: ${count} symbols (${optionsCount} options)`);
      return true;
    } catch (error: any) {
      this.isLoading = false;
      this.loadError = error.message;
      console.error('Failed to load symbol cache:', error.message);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get symbol by name
   */
  getSymbol(symbol: string): CachedSymbol | null {
    return this.symbols.get(symbol.toUpperCase()) || null;
  }

  /**
   * Get token for symbol
   */
  getToken(symbol: string): number | null {
    const data = this.getSymbol(symbol);
    return data?.token || null;
  }

  /**
   * Get all symbols
   */
  getAllSymbols(): CachedSymbol[] {
    return Array.from(this.symbols.values());
  }

  /**
   * Get symbol names list
   */
  getSymbolNames(): string[] {
    return Array.from(this.symbols.keys());
  }

  /**
   * Check if cache is loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Get cache status
   */
  getStatus() {
    return {
      isLoaded: this.isLoaded,
      isLoading: this.isLoading,
      lastLoadTime: this.lastLoadTime,
      loadError: this.loadError,
      symbolCount: this.symbols.size,
    };
  }

  /**
   * Clear cache
   */
  clear() {
    this.symbols.clear();
    this.isLoaded = false;
    this.lastLoadTime = null;
    console.log('Symbol cache cleared');
  }
}

// Singleton instance
let cacheInstance: SymbolCache | null = null;

export function getSymbolCache(): SymbolCache {
  if (!cacheInstance) {
    cacheInstance = new SymbolCache();
  }
  return cacheInstance;
}

export default SymbolCache;

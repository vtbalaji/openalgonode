/**
 * Zerodha KiteTicker WebSocket Service
 * Manages real-time market data streaming
 */

import { KiteTicker } from 'kiteconnect';
import { EventEmitter } from 'events';

export interface TickData {
  instrument_token: number;
  timestamp: Date;
  last_price: number;
  last_traded_quantity: number;
  average_traded_price: number;
  volume_traded: number;
  total_buy_quantity: number;
  total_sell_quantity: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  change: number;
  last_trade_time: Date;
}

export interface OrderUpdate {
  order_id: string;
  exchange: string;
  trading_symbol: string;
  status: string;
  status_message?: string;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  quantity: number;
  price: number;
  order_type: string;
  transaction_type: string;
  product: string;
  exchange_timestamp: Date;
}

class TickerService extends EventEmitter {
  private ticker: any;
  private subscribedTokens: Set<number>;
  private isConnected: boolean;
  private apiKey: string;
  private accessToken: string;

  constructor() {
    super();
    this.subscribedTokens = new Set();
    this.isConnected = false;
    this.apiKey = '';
    this.accessToken = '';
  }

  /**
   * Initialize ticker with API credentials
   */
  initialize(apiKey: string, accessToken: string) {
    this.apiKey = apiKey;
    this.accessToken = accessToken;

    this.ticker = new KiteTicker({
      api_key: this.apiKey,
      access_token: this.accessToken,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers() {
    // Connection opened
    this.ticker.on('connect', () => {
      console.log('✅ WebSocket connected to Zerodha');
      this.isConnected = true;
      this.emit('connected');

      // Resubscribe to previously subscribed tokens
      if (this.subscribedTokens.size > 0) {
        const tokens = Array.from(this.subscribedTokens);
        this.ticker.subscribe(tokens);
        this.ticker.setMode(this.ticker.modeFull, tokens);
      }
    });

    // Ticks received
    this.ticker.on('ticks', (ticks: TickData[]) => {
      this.emit('ticks', ticks);

      // Emit individual tick events for each instrument
      ticks.forEach((tick) => {
        this.emit(`tick:${tick.instrument_token}`, tick);
      });
    });

    // Order updates
    this.ticker.on('order_update', (order: OrderUpdate) => {
      console.log('📊 Order update received:', order);
      this.emit('order_update', order);
    });

    // Connection closed
    this.ticker.on('disconnect', (error: any) => {
      console.log('❌ WebSocket disconnected:', error);
      this.isConnected = false;
      this.emit('disconnected', error);
    });

    // Error occurred
    this.ticker.on('error', (error: any) => {
      console.error('⚠️ WebSocket error:', error);
      this.emit('error', error);
    });

    // Connection closed
    this.ticker.on('close', (code: number, reason: string) => {
      console.log('🔒 WebSocket closed:', code, reason);
      this.isConnected = false;
      this.emit('closed', { code, reason });
    });

    // Reconnecting
    this.ticker.on('reconnect', (reconnect_count: number, reconnect_interval: number) => {
      console.log(`🔄 Reconnecting... (attempt ${reconnect_count}, interval ${reconnect_interval}ms)`);
      this.emit('reconnecting', { reconnect_count, reconnect_interval });
    });

    // No reconnect
    this.ticker.on('noreconnect', () => {
      console.log('⛔ No more reconnection attempts');
      this.emit('no_reconnect');
    });
  }

  /**
   * Connect to WebSocket
   */
  connect() {
    if (!this.ticker) {
      throw new Error('Ticker not initialized. Call initialize() first.');
    }

    if (this.isConnected) {
      console.log('Already connected');
      return;
    }

    this.ticker.connect();
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ticker && this.isConnected) {
      this.ticker.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Subscribe to instrument tokens
   */
  subscribe(tokens: number[]) {
    if (!this.ticker) {
      throw new Error('Ticker not initialized');
    }

    tokens.forEach((token) => this.subscribedTokens.add(token));

    if (this.isConnected) {
      this.ticker.subscribe(tokens);
      // Set mode to full for detailed data
      this.ticker.setMode(this.ticker.modeFull, tokens);
    }
  }

  /**
   * Unsubscribe from instrument tokens
   */
  unsubscribe(tokens: number[]) {
    if (!this.ticker) {
      throw new Error('Ticker not initialized');
    }

    tokens.forEach((token) => this.subscribedTokens.delete(token));

    if (this.isConnected) {
      this.ticker.unsubscribe(tokens);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get subscribed tokens
   */
  getSubscribedTokens(): number[] {
    return Array.from(this.subscribedTokens);
  }
}

// Singleton instance
let tickerServiceInstance: TickerService | null = null;

export function getTickerService(): TickerService {
  if (!tickerServiceInstance) {
    tickerServiceInstance = new TickerService();
  }
  return tickerServiceInstance;
}

export default TickerService;

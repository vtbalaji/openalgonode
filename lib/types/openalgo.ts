/**
 * OpenAlgo API Types and Schemas
 * These match the OpenAlgo API specification exactly
 */

// ============================================
// Common Types
// ============================================

export type Exchange = 'NSE' | 'BSE' | 'NFO' | 'BFO' | 'MCX' | 'CDS' | 'BCD';
export type Action = 'BUY' | 'SELL';
export type PriceType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type ProductType = 'MIS' | 'CNC' | 'NRML';

// ============================================
// Request Schemas
// ============================================

export interface PlaceOrderRequest {
  apikey: string;
  strategy: string;
  exchange: Exchange;
  symbol: string;
  action: Action;
  quantity: number;
  pricetype: PriceType;
  product: ProductType;
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
  token?: string; // Optional broker-specific token (Angel: symboltoken, Zerodha: N/A)
}

export interface ModifyOrderRequest {
  apikey: string;
  strategy: string;
  exchange: Exchange;
  symbol: string;
  orderid: string;
  action: Action;
  product: ProductType;
  pricetype: PriceType;
  price: number;
  quantity: number;
  disclosed_quantity: number;
  trigger_price: number;
  token?: string; // Optional broker-specific token (Angel: symboltoken, Zerodha: N/A)
}

export interface CancelOrderRequest {
  apikey: string;
  strategy: string;
  orderid: string;
}

export interface ClosePositionRequest {
  apikey: string;
  strategy: string;
  exchange?: Exchange;
  symbol?: string;
  product?: ProductType;
}

export interface CancelAllOrdersRequest {
  apikey: string;
  strategy: string;
}

export interface OrderBookRequest {
  apikey: string;
}

export interface TradeBookRequest {
  apikey: string;
}

export interface PositionBookRequest {
  apikey: string;
}

export interface HoldingsRequest {
  apikey: string;
}

export interface FundsRequest {
  apikey: string;
}

export interface BasketOrderItem {
  exchange: Exchange;
  symbol: string;
  action: Action;
  quantity: number;
  pricetype: PriceType;
  product: ProductType;
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
}

export interface BasketOrderRequest {
  apikey: string;
  strategy: string;
  orders: BasketOrderItem[];
}

export interface SplitOrderRequest {
  apikey: string;
  strategy: string;
  exchange: Exchange;
  symbol: string;
  action: Action;
  quantity: number;
  splitsize: number;
  pricetype: PriceType;
  product: ProductType;
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
}

// ============================================
// Response Schemas
// ============================================

export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
}

export interface OrderResponse {
  status: 'success' | 'error';
  orderid?: string;
  message?: string;
}

export interface OrderBookItem {
  symbol: string;
  exchange: Exchange;
  action: Action;
  quantity: number;
  price: number;
  trigger_price: number;
  pricetype: PriceType;
  product: ProductType;
  orderid: string;
  order_status: string;
  timestamp: string;
}

export interface TradeBookItem {
  symbol: string;
  exchange: Exchange;
  product: ProductType;
  action: Action;
  quantity: number;
  average_price: number;
  trade_value: number;
  orderid: string;
  timestamp: string;
}

export interface PositionBookItem {
  symbol: string;
  exchange: Exchange;
  product: ProductType;
  quantity: number;
  average_price: number;
  ltp: number;
  pnl: number;
}

export interface HoldingItem {
  symbol: string;
  exchange: Exchange;
  quantity: number;
  product: ProductType;
  pnl: number;
  pnlpercent: number;
}

export interface FundsData {
  availablecash: number;
  collateral: number;
  m2munrealized: number;
  m2mrealized: number;
  utiliseddebits: number;
  utilisedspan: number;
  utilisedoptionpremium: number;
  utilisedholdingsales: number;
  utilisedexposure: number;
  utilisedturnover: number;
  utilisedpayout: number;
}

export interface BasketOrderResponse {
  status: 'success' | 'error';
  message?: string;
  orders?: OrderResponse[];
}

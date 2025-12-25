# Multi-Broker Architecture for OpenAlgoNode

## Overview
This document outlines the architecture for supporting multiple brokers with a unified API compatible with OpenAlgo.

## Directory Structure

```
openalgonode/
├── app/
│   └── api/
│       └── v1/                          # OpenAlgo-compatible API
│           ├── placeorder/
│           │   └── route.ts             # Unified place order endpoint
│           ├── cancelorder/
│           │   └── route.ts             # Unified cancel order endpoint
│           ├── orderbook/
│           │   └── route.ts             # Unified orderbook endpoint
│           ├── positions/
│           │   └── route.ts             # Unified positions endpoint
│           └── holdings/
│               └── route.ts             # Unified holdings endpoint
├── lib/
│   ├── brokers/
│   │   ├── types.ts                     # Common interfaces for all brokers
│   │   ├── factory.ts                   # Broker factory (router)
│   │   ├── zerodha/
│   │   │   ├── client.ts                # Zerodha API implementation
│   │   │   ├── mapping.ts               # Data transformation
│   │   │   └── types.ts                 # Zerodha-specific types
│   │   ├── angel/
│   │   │   ├── client.ts
│   │   │   ├── mapping.ts
│   │   │   └── types.ts
│   │   ├── dhan/
│   │   │   ├── client.ts
│   │   │   ├── mapping.ts
│   │   │   └── types.ts
│   │   └── upstox/
│   │       ├── client.ts
│   │       ├── mapping.ts
│   │       └── types.ts
│   └── brokerConfig.ts                  # Centralized broker metadata
└── schemas/
    └── openalgo.ts                      # OpenAlgo API schemas (validation)
```

## Common Interfaces

### lib/brokers/types.ts
```typescript
// Standard order format (OpenAlgo compatible)
export interface StandardOrder {
  apikey: string;
  strategy: string;
  exchange: 'NSE' | 'BSE' | 'NFO' | 'MCX' | 'CDS' | 'BCD';
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  pricetype: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  product: 'MIS' | 'CNC' | 'NRML';
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
}

// Standard response format
export interface OrderResponse {
  status: 'success' | 'error';
  orderid?: string;
  message?: string;
}

// Broker client interface (all brokers must implement)
export interface BrokerClient {
  // Authentication
  authenticate(apiKey: string, requestToken: string, apiSecret: string): Promise<string>;

  // Order operations
  placeOrder(authToken: string, order: StandardOrder): Promise<OrderResponse>;
  cancelOrder(authToken: string, orderId: string): Promise<OrderResponse>;
  modifyOrder(authToken: string, orderId: string, order: StandardOrder): Promise<OrderResponse>;

  // Data fetching
  getOrderBook(authToken: string): Promise<any[]>;
  getTradeBook(authToken: string): Promise<any[]>;
  getPositions(authToken: string): Promise<any[]>;
  getHoldings(authToken: string): Promise<any[]>;
}
```

## Broker Factory Pattern

### lib/brokers/factory.ts
```typescript
import { BrokerClient } from './types';
import { ZerodhaBrokerClient } from './zerodha/client';
import { AngelBrokerClient } from './angel/client';
import { DhanBrokerClient } from './dhan/client';

const BROKER_CLIENTS: Record<string, BrokerClient> = {
  zerodha: new ZerodhaBrokerClient(),
  angel: new AngelBrokerClient(),
  dhan: new DhanBrokerClient(),
  // Add more brokers here
};

export function getBrokerClient(brokerId: string): BrokerClient {
  const client = BROKER_CLIENTS[brokerId];
  if (!client) {
    throw new Error(`Broker ${brokerId} not supported`);
  }
  return client;
}
```

## Unified API Implementation

### app/api/v1/placeorder/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getBrokerClient } from '@/lib/brokers/factory';
import { getUserBroker, getAuthToken } from '@/lib/userService';
import { StandardOrder } from '@/lib/brokers/types';

export async function POST(request: NextRequest) {
  try {
    const orderData: StandardOrder = await request.json();

    // Get user's configured broker from API key
    const { broker, userId } = await getUserBroker(orderData.apikey);

    // Get auth token for this user/broker
    const authToken = await getAuthToken(userId, broker);

    // Get the broker-specific client
    const brokerClient = getBrokerClient(broker);

    // Place order (broker client handles transformation internally)
    const response = await brokerClient.placeOrder(authToken, orderData);

    return NextResponse.json(response, {
      status: response.status === 'success' ? 200 : 400
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      message: error.message || 'Failed to place order'
    }, { status: 500 });
  }
}
```

## Example Broker Implementation

### lib/brokers/zerodha/client.ts
```typescript
import { BrokerClient, StandardOrder, OrderResponse } from '../types';
import { transformToZerodhaFormat, transformFromZerodhaFormat } from './mapping';

export class ZerodhaBrokerClient implements BrokerClient {
  private readonly BASE_URL = 'https://api.kite.trade';

  async authenticate(apiKey: string, requestToken: string, apiSecret: string): Promise<string> {
    // Zerodha authentication logic
    // Returns: api_key:access_token format
  }

  async placeOrder(authToken: string, order: StandardOrder): Promise<OrderResponse> {
    // Transform OpenAlgo format to Zerodha format
    const zerodhaOrder = transformToZerodhaFormat(order);

    // Make API call
    const response = await fetch(`${this.BASE_URL}/orders/regular`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${authToken}`,
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(zerodhaOrder).toString(),
    });

    // Transform response back to standard format
    return transformFromZerodhaFormat(await response.json());
  }

  // ... other methods
}
```

### lib/brokers/zerodha/mapping.ts
```typescript
export function transformToZerodhaFormat(order: StandardOrder) {
  return {
    tradingsymbol: order.symbol,
    exchange: order.exchange,
    transaction_type: order.action,
    order_type: order.pricetype,
    quantity: order.quantity.toString(),
    product: order.product,
    price: (order.price || 0).toString(),
    trigger_price: (order.trigger_price || 0).toString(),
    disclosed_quantity: (order.disclosed_quantity || 0).toString(),
    validity: 'DAY',
    tag: order.strategy,
  };
}

export function transformFromZerodhaFormat(response: any): OrderResponse {
  if (response.status === 'success') {
    return {
      status: 'success',
      orderid: response.data.order_id,
    };
  }
  return {
    status: 'error',
    message: response.message || 'Order failed',
  };
}
```

## OpenAlgo API Compatibility

Our API endpoints will match OpenAlgo exactly:

| OpenAlgo Endpoint | Our Endpoint | Status |
|------------------|--------------|--------|
| POST /api/v1/placeorder | POST /api/v1/placeorder | ✅ Same |
| POST /api/v1/cancelorder | POST /api/v1/cancelorder | ✅ Same |
| POST /api/v1/modifyorder | POST /api/v1/modifyorder | ✅ Same |
| POST /api/v1/closeposition | POST /api/v1/closeposition | ✅ Same |
| POST /api/v1/orderbook | POST /api/v1/orderbook | ✅ Same |
| POST /api/v1/tradebook | POST /api/v1/tradebook | ✅ Same |
| POST /api/v1/positionbook | POST /api/v1/positionbook | ✅ Same |
| POST /api/v1/holdings | POST /api/v1/holdings | ✅ Same |
| POST /api/v1/funds | POST /api/v1/funds | ✅ Same |

## Benefits

1. **Drop-in Replacement**: Any tool using OpenAlgo API can use our system
2. **Easy Broker Addition**: Add new broker = implement interface + mapping (~4-8 hours)
3. **Centralized Logic**: All broker-specific code isolated in adapters
4. **Type Safety**: TypeScript ensures all brokers implement required methods
5. **Testability**: Can mock broker clients for testing
6. **Scalability**: Add 100 brokers without changing core API

## Migration Path

### Phase 1: Create Architecture (2-3 hours)
- Create common interfaces
- Create broker factory
- Refactor Zerodha into adapter pattern

### Phase 2: Create Unified API (2-3 hours)
- Create `/api/v1/placeorder` with OpenAlgo schema
- Wire up broker factory
- Test with Zerodha

### Phase 3: Add New Brokers (4-8 hours each)
- Implement BrokerClient interface
- Create mapping functions
- Add configuration
- Test

### Phase 4: Web UI Updates (1-2 hours)
- Update forms to use new unified API
- Add broker selection if needed

## Effort Summary

| Task | Time | Complexity |
|------|------|-----------|
| Initial Architecture Setup | 4-6 hours | Medium |
| First Broker (Zerodha refactor) | 6-8 hours | Medium |
| Second Broker (Angel/Dhan) | 4-6 hours | Low |
| Each Additional Broker | 3-5 hours | Low |

**Note**: After first 2 brokers, adding new brokers becomes a copy-paste-modify operation.

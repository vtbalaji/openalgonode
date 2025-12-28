/**
 * Broker Response Mapper
 * Normalizes responses from different brokers to a consistent format
 */

/**
 * Standard OpenAlgo response format (all brokers should return this)
 */
export interface StandardizedResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  [key: string]: any; // Allow broker-specific fields
}

/**
 * Normalize broker responses to standard format
 *
 * Angel format: { status: 'success', data: {...}, message: '' }
 * Zerodha format: { status: true, data: {...}, message: '' }
 * Raw data: just the data object
 */
export function normalizeResponse<T = any>(
  brokerResponse: any,
  expectedField?: string
): StandardizedResponse<T> {
  // Already in standard format
  if (
    brokerResponse &&
    (brokerResponse.status === 'success' ||
      brokerResponse.status === 'error' ||
      brokerResponse.status === true ||
      brokerResponse.status === false)
  ) {
    return {
      status:
        brokerResponse.status === true
          ? 'success'
          : brokerResponse.status === false
            ? 'error'
            : brokerResponse.status,
      data: brokerResponse.data,
      message: brokerResponse.message,
    };
  }

  // Zerodha-style boolean status
  if (typeof brokerResponse.status === 'boolean') {
    return {
      status: brokerResponse.status ? 'success' : 'error',
      data: brokerResponse.data,
      message: brokerResponse.message,
    };
  }

  // Raw data response - wrap it
  return {
    status: 'success',
    data: brokerResponse,
  };
}

/**
 * Extract data from broker response with fallbacks
 */
export function extractResponseData<T = any>(
  brokerResponse: any,
  fieldNames: string[] = ['data', 'orders', 'positions', 'holdings']
): T | undefined {
  const normalized = normalizeResponse(brokerResponse);

  // Try normalized data field first
  if (normalized.data) {
    return normalized.data;
  }

  // Try alternate field names
  for (const field of fieldNames) {
    if (brokerResponse[field]) {
      return brokerResponse[field];
    }
  }

  return undefined;
}

/**
 * Map broker-specific field names to standard names
 */
export function mapOrderFields(brokerOrder: any, broker: 'angel' | 'zerodha'): any {
  const mapped: any = {};

  // Map common fields
  const fieldMap: Record<string, Record<string, string>> = {
    angel: {
      orderid: 'orderid',
      order_id: 'orderid', // Fallback
      status: 'status',
      order_status: 'status', // Fallback
      symbol: 'symbol',
      tradingsymbol: 'symbol', // Fallback
      exchange: 'exchange',
      action: 'action',
      transactiontype: 'action', // Fallback
      quantity: 'quantity',
      price: 'price',
      trigger_price: 'trigger_price',
      triggerprice: 'trigger_price', // Fallback
      product: 'product',
      producttype: 'product', // Fallback
      pricetype: 'pricetype',
      ordertype: 'pricetype', // Fallback
      executed_quantity: 'executed_quantity',
      execqty: 'executed_quantity', // Fallback
      average_price: 'average_price',
      avgprice: 'average_price', // Fallback
      pending_quantity: 'pending_quantity',
      pqty: 'pending_quantity', // Fallback
    },
    zerodha: {
      order_id: 'orderid',
      orderid: 'orderid', // Fallback
      status: 'status',
      order_status: 'status', // Fallback
      tradingsymbol: 'symbol',
      symbol: 'symbol', // Fallback
      exchange: 'exchange',
      transaction_type: 'action',
      action: 'action', // Fallback
      quantity: 'quantity',
      price: 'price',
      trigger_price: 'trigger_price',
      product: 'product',
      order_type: 'pricetype',
      pricetype: 'pricetype', // Fallback
      filled_quantity: 'executed_quantity',
      executed_quantity: 'executed_quantity', // Fallback
      average_price: 'average_price',
      pending_quantity: 'pending_quantity',
    },
  };

  const map = fieldMap[broker] || {};

  // Map all fields
  for (const [brokerField, standardField] of Object.entries(map)) {
    if (brokerOrder[brokerField] !== undefined) {
      mapped[standardField] = brokerOrder[brokerField];
    }
  }

  // Keep original fields as fallback
  return { ...brokerOrder, ...mapped };
}

/**
 * Compare two orders and report field mismatches
 * Useful for debugging integration issues
 */
export function compareOrderFields(
  angelOrder: any,
  zerodhaOrder: any
): {
  angelFields: string[];
  zerodhaFields: string[];
  commonFields: string[];
  mismatchFields: string[];
} {
  const angelFields = Object.keys(angelOrder).sort();
  const zerodhaFields = Object.keys(zerodhaOrder).sort();

  const commonFields = angelFields.filter((f) => zerodhaFields.includes(f));
  const mismatchFields = angelFields.filter((f) => !zerodhaFields.includes(f));

  return {
    angelFields,
    zerodhaFields,
    commonFields,
    mismatchFields,
  };
}

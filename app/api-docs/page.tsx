'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ApiDocsPage() {
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const endpoints = [
    {
      id: 'placeorder',
      method: 'POST',
      path: '/api/v1/placeorder',
      description: 'Place a new order',
      headers: 'Authorization: Bearer <token>',
      body: {
        apikey: 'your-api-key',
        exchange: 'NSE',
        symbol: 'RELIANCE',
        action: 'BUY',
        quantity: 1,
        product: 'MIS',
        pricetype: 'MARKET',
        price: 0,
      },
      example: `curl -X POST https://algo.tradeidea.co.in/api/v1/placeorder \\
  -H "Content-Type: application/json" \\
  -d '{
    "apikey": "your-api-key",
    "exchange": "NSE",
    "symbol": "RELIANCE",
    "action": "BUY",
    "quantity": 1,
    "product": "MIS",
    "pricetype": "MARKET",
    "price": 0
  }'`,
    },
    {
      id: 'orderbook',
      method: 'GET',
      path: '/api/v1/orderbook',
      description: 'Get all orders',
      headers: 'Authorization: Bearer <token>',
      example: `curl -X GET "https://algo.tradeidea.co.in/api/v1/orderbook" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
    },
    {
      id: 'cancelorder',
      method: 'POST',
      path: '/api/v1/cancelorder',
      description: 'Cancel a specific order',
      headers: 'Authorization: Bearer <token>',
      body: {
        apikey: 'your-api-key',
        orderid: 'order-id-from-orderbook',
      },
      example: `curl -X POST https://algo.tradeidea.co.in/api/v1/cancelorder \\
  -H "Content-Type: application/json" \\
  -d '{
    "apikey": "your-api-key",
    "orderid": "123456789"
  }'`,
    },
    {
      id: 'modifyorder',
      method: 'POST',
      path: '/api/v1/modifyorder',
      description: 'Modify an open order',
      headers: 'Authorization: Bearer <token>',
      body: {
        apikey: 'your-api-key',
        orderid: 'order-id',
        quantity: 2,
        price: 2500,
      },
      example: `curl -X POST https://algo.tradeidea.co.in/api/v1/modifyorder \\
  -H "Content-Type: application/json" \\
  -d '{
    "apikey": "your-api-key",
    "orderid": "123456789",
    "quantity": 2,
    "price": 2500
  }'`,
    },
    {
      id: 'positionbook',
      method: 'GET',
      path: '/api/v1/positionbook',
      description: 'Get all positions',
      headers: 'Authorization: Bearer <token>',
      example: `curl -X GET "https://algo.tradeidea.co.in/api/v1/positionbook" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
    },
    {
      id: 'closeposition',
      method: 'POST',
      path: '/api/v1/closeposition',
      description: 'Close a position',
      headers: 'Authorization: Bearer <token>',
      body: {
        apikey: 'your-api-key',
        symbol: 'RELIANCE',
        exchange: 'NSE',
      },
      example: `curl -X POST https://algo.tradeidea.co.in/api/v1/closeposition \\
  -H "Content-Type: application/json" \\
  -d '{
    "apikey": "your-api-key",
    "symbol": "RELIANCE",
    "exchange": "NSE"
  }'`,
    },
    {
      id: 'holdings',
      method: 'GET',
      path: '/api/v1/holdings',
      description: 'Get your holdings',
      headers: 'Authorization: Bearer <token>',
      example: `curl -X GET "https://algo.tradeidea.co.in/api/v1/holdings" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
    },
    {
      id: 'funds',
      method: 'GET',
      path: '/api/v1/funds',
      description: 'Get available funds',
      headers: 'Authorization: Bearer <token>',
      example: `curl -X GET "https://algo.tradeidea.co.in/api/v1/funds" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
    },
    {
      id: 'tradebook',
      method: 'GET',
      path: '/api/v1/tradebook',
      description: 'Get executed trades',
      headers: 'Authorization: Bearer <token>',
      example: `curl -X GET "https://algo.tradeidea.co.in/api/v1/tradebook" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
    },
    {
      id: 'getsymboltoken',
      method: 'GET',
      path: '/api/admin/get-symbol-token',
      description: 'Get instrument token for a symbol',
      headers: 'None (Public)',
      params: '?symbol=NIFTY25DEC26000PE&broker=zerodha',
      example: `curl -s "https://algo.tradeidea.co.in/api/admin/get-symbol-token?symbol=NIFTY25DEC26000PE&broker=zerodha"`,
    },
    {
      id: 'symbolslist',
      method: 'GET',
      path: '/api/symbols/list',
      description: 'Get all available symbols',
      headers: 'None (Public)',
      params: '?broker=zerodha',
      example: `curl -s "https://algo.tradeidea.co.in/api/symbols/list?broker=zerodha"`,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold text-gray-900">API Documentation</h1>
          <p className="text-gray-600 mt-2">OpenAlgo-compatible REST API endpoints</p>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        {/* Introduction */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Getting Started</h2>
          <p className="text-gray-700 mb-4">
            All API endpoints require authentication via API Key. Generate your API key from the{' '}
            <Link href="/api-keys" className="text-blue-600 hover:underline">
              API Keys
            </Link>{' '}
            page.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Base URL</h3>
            <code className="text-blue-800">https://algo.tradeidea.co.in</code>
          </div>
        </div>

        {/* Endpoints */}
        <div className="space-y-4">
          {endpoints.map((endpoint) => (
            <div key={endpoint.id} className="bg-white rounded-lg shadow overflow-hidden">
              <button
                onClick={() =>
                  setExpandedEndpoint(expandedEndpoint === endpoint.id ? null : endpoint.id)
                }
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded font-mono text-sm font-bold text-white ${
                    endpoint.method === 'GET'
                      ? 'bg-green-600'
                      : endpoint.method === 'POST'
                        ? 'bg-blue-600'
                        : 'bg-orange-600'
                  }`}>
                    {endpoint.method}
                  </span>
                  <div className="text-left">
                    <div className="font-mono text-sm text-gray-600">{endpoint.path}</div>
                    <div className="text-gray-900 font-medium">{endpoint.description}</div>
                  </div>
                </div>
                <span className="text-gray-400">
                  {expandedEndpoint === endpoint.id ? '▼' : '▶'}
                </span>
              </button>

              {expandedEndpoint === endpoint.id && (
                <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 space-y-4">
                  {endpoint.params && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Parameters</h4>
                      <code className="block bg-white p-3 rounded border border-gray-200 text-sm text-gray-800">
                        {endpoint.params}
                      </code>
                    </div>
                  )}

                  {endpoint.body && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Request Body</h4>
                      <pre className="bg-white p-3 rounded border border-gray-200 text-sm overflow-x-auto">
                        {JSON.stringify(endpoint.body, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Headers</h4>
                    <code className="block bg-white p-3 rounded border border-gray-200 text-sm text-gray-800">
                      {endpoint.headers}
                    </code>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Example Request</h4>
                    <pre className="bg-gray-900 p-3 rounded text-sm text-gray-100 overflow-x-auto">
                      {endpoint.example}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Authentication Section */}
        <div className="mt-12 bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Authentication</h2>
          <p className="text-gray-700 mb-4">
            Include your API key in the request header or request body:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Header Method</h3>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded text-sm overflow-x-auto">
                {`Authorization: Bearer YOUR_API_KEY`}
              </pre>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Body Method</h3>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded text-sm overflow-x-auto">
                {`{
  "apikey": "YOUR_API_KEY",
  ...
}`}
              </pre>
            </div>
          </div>
        </div>

        {/* Symbol Detection */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Symbol Detection</h2>
          <p className="text-gray-700 mb-4">
            The system automatically detects the correct exchange and product based on symbol naming:
          </p>
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <p className="font-mono text-sm">
                <span className="font-bold">PE/CE options:</span> NIFTY25DEC26000PE → Exchange: NFO, Product: MIS
              </p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <p className="font-mono text-sm">
                <span className="font-bold">Stocks:</span> RELIANCE → Exchange: NSE, Product: MIS
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded p-4">
              <p className="font-mono text-sm">
                <span className="font-bold">Futures:</span> NIFTYFUT → Exchange: NFO, Product: NRML
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

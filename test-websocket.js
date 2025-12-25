/**
 * Test WebSocket Real-time Prices
 * Run with: node test-websocket.js
 */

const EventSource = require('eventsource');

// CONFIGURE THESE:
const USER_ID = 'YOUR_USER_ID';  // Get from Firebase Auth
const SYMBOL = 'RELIANCE';
const BASE_URL = 'http://localhost:3001';

console.log('🧪 Testing WebSocket Real-time Prices\n');
console.log(`📍 Server: ${BASE_URL}`);
console.log(`👤 User ID: ${USER_ID}`);
console.log(`📊 Symbol: ${SYMBOL}\n`);

const url = `${BASE_URL}/api/stream/prices?symbols=${SYMBOL}&userId=${USER_ID}&broker=zerodha`;

console.log(`🔌 Connecting to: ${url}\n`);

const eventSource = new EventSource(url);

eventSource.onopen = () => {
  console.log('✅ Connection opened!');
};

eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    if (data.type === 'connected') {
      console.log('🟢 Connected to symbols:', data.symbols);
      console.log('📊 Instrument tokens:', data.tokens);
    } else if (data.type === 'tick') {
      console.log('\n📈 Price Update:');
      console.log(`   Symbol: ${data.symbol}`);
      console.log(`   Last Price: ₹${data.data.last_price}`);
      console.log(`   Change: ${data.data.change > 0 ? '+' : ''}${data.data.change}`);
      console.log(`   Volume: ${data.data.volume?.toLocaleString()}`);
      console.log(`   OHLC: O=${data.data.ohlc.open} H=${data.data.ohlc.high} L=${data.data.ohlc.low} C=${data.data.ohlc.close}`);
      console.log(`   Time: ${new Date(data.data.timestamp).toLocaleTimeString()}`);
    } else if (data.type === 'heartbeat') {
      console.log('💓 Heartbeat:', new Date(data.timestamp).toLocaleTimeString());
    }
  } catch (err) {
    console.error('Error parsing message:', err);
  }
};

eventSource.onerror = (err) => {
  console.error('❌ Connection error:', err);
  console.log('\n📋 Troubleshooting:');
  console.log('   1. Make sure dev server is running: npm run dev');
  console.log('   2. Check if you\'re logged in and broker is configured');
  console.log('   3. Update USER_ID in this script');
  console.log('   4. Verify symbol is supported');

  eventSource.close();
  process.exit(1);
};

// Keep script running
console.log('⏳ Waiting for price updates... (Press Ctrl+C to stop)\n');

// Auto-close after 60 seconds for testing
setTimeout(() => {
  console.log('\n⏰ Test complete (60 seconds elapsed)');
  eventSource.close();
  process.exit(0);
}, 60000);

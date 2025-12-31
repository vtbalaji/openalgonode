/**
 * Test script to search for NIFTY options in symbol cache
 */

const http = require('http');

// Test if a symbol exists
async function testSymbol(symbol) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ userId: 'ZnT1kjZKElV6NJte2wgoDU5dF8j2' });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/get-symbol-token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          resolve({ error: 'Parse error' });
        }
      });
    });
    
    req.on('error', (e) => resolve({ error: e.message }));
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Testing NIFTY option symbol formats...\n');
  
  const testSymbols = [
    'NIFTY25DEC25900CE',
    'NIFTY2512525900CE',
    'NIFTY25D2525900CE',
    'NIFTY 25 DEC 25900 CE',
    'NIFTY25125CE',
  ];
  
  for (const symbol of testSymbols) {
    const result = await testSymbol(symbol);
    console.log(`Symbol: "${symbol}"`);
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('---');
  }
}

main();

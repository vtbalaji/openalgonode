/**
 * Test utility for Volume Profile calculation
 * Verifies the algorithm with sample data
 */

import { calculateVolumeProfile, CandleData } from './volumeProfile';

export function testVolumeProfile() {
  console.log('=== VOLUME PROFILE TEST ===\n');

  // Simple test data: 5 candles
  const testCandles: CandleData[] = [
    { high: 110, low: 100, close: 105, volume: 1000 }, // Candle 1: Range 100-110, volume 1000
    { high: 115, low: 105, close: 110, volume: 2000 }, // Candle 2: Range 105-115, volume 2000
    { high: 112, low: 108, close: 110, volume: 3000 }, // Candle 3: Range 108-112, volume 3000 (concentrated)
    { high: 120, low: 110, close: 115, volume: 1500 }, // Candle 4: Range 110-120, volume 1500
    { high: 118, low: 112, close: 115, volume: 2500 }, // Candle 5: Range 112-118, volume 2500
  ];

  console.log('Test Data (5 candles):');
  testCandles.forEach((c, i) => {
    console.log(`  Candle ${i + 1}: High=${c.high}, Low=${c.low}, Volume=${c.volume}`);
  });
  console.log('');

  // Calculate with 10 bins
  const result = calculateVolumeProfile(testCandles, 10, 0.70);

  console.log('Results:');
  console.log(`  Total Volume: ${result.totalVolume}`);
  console.log(`  POC (Point of Control): ${result.poc.toFixed(2)}`);
  console.log(`  Value Area High: ${result.valueAreaHigh.toFixed(2)}`);
  console.log(`  Value Area Low: ${result.valueAreaLow.toFixed(2)}`);
  console.log('');

  console.log('Volume Distribution (Top 10 by volume):');
  const sorted = [...result.profile].sort((a, b) => b.volume - a.volume).slice(0, 10);
  sorted.forEach((row, i) => {
    const isPOC = Math.abs(row.price - result.poc) < 0.01;
    const isVA = row.price >= result.valueAreaLow && row.price <= result.valueAreaHigh;
    const marker = isPOC ? ' <- POC' : isVA ? ' <- VA' : '';
    console.log(`  ${i + 1}. Price ${row.price.toFixed(2)}: Volume ${row.volume.toFixed(0)}${marker}`);
  });
  console.log('');

  // Verification
  const expectedTotalVolume = testCandles.reduce((sum, c) => sum + c.volume, 0);
  const actualTotalVolume = result.totalVolume;
  const volumeMatch = Math.abs(expectedTotalVolume - actualTotalVolume) < 0.01;

  console.log('Verification:');
  console.log(`  Expected Total Volume: ${expectedTotalVolume}`);
  console.log(`  Actual Total Volume: ${actualTotalVolume}`);
  console.log(`  Volume Conservation: ${volumeMatch ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  // Check POC is in valid range
  const minPrice = Math.min(...testCandles.map(c => c.low));
  const maxPrice = Math.max(...testCandles.map(c => c.high));
  const pocInRange = result.poc >= minPrice && result.poc <= maxPrice;
  console.log(`  POC in valid range (${minPrice}-${maxPrice}): ${pocInRange ? '✅ PASS' : '❌ FAIL'}`);

  // Check POC has max volume
  const pocRow = result.profile.find(r => Math.abs(r.price - result.poc) < 0.01);
  const maxVolumeRow = result.profile.reduce((max, r) => r.volume > max.volume ? r : max);
  const pocIsMaxVolume = pocRow && Math.abs(pocRow.volume - maxVolumeRow.volume) < 0.01;
  console.log(`  POC has maximum volume: ${pocIsMaxVolume ? '✅ PASS' : '❌ FAIL'}`);
  if (!pocIsMaxVolume) {
    console.log(`    POC volume: ${pocRow?.volume.toFixed(0)}, Max volume: ${maxVolumeRow.volume.toFixed(0)} at price ${maxVolumeRow.price.toFixed(2)}`);
  }

  console.log('\n=== TEST COMPLETE ===\n');

  return {
    passed: volumeMatch && pocInRange && pocIsMaxVolume,
    result,
    testCandles,
  };
}

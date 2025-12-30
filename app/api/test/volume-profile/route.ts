/**
 * GET /api/test/volume-profile
 * Test volume profile calculation with sample data
 */

import { NextResponse } from 'next/server';
import { testVolumeProfile } from '@/lib/indicators/testVolumeProfile';

export async function GET() {
  try {
    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };

    // Run test
    const testResult = testVolumeProfile();

    // Restore console
    console.log = originalLog;

    return NextResponse.json({
      success: true,
      testPassed: testResult.passed,
      logs: logs,
      result: {
        totalVolume: testResult.result.totalVolume,
        poc: testResult.result.poc,
        valueAreaHigh: testResult.result.valueAreaHigh,
        valueAreaLow: testResult.result.valueAreaLow,
        topBars: testResult.result.profile
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 10)
          .map(row => ({
            price: row.price.toFixed(2),
            volume: row.volume.toFixed(0),
            isPOC: Math.abs(row.price - testResult.result.poc) < 0.01,
            isValueArea: row.price >= testResult.result.valueAreaLow &&
                        row.price <= testResult.result.valueAreaHigh
          }))
      },
      testData: testResult.testCandles
    });
  } catch (error: any) {
    console.error('[TEST-VP] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historySession, historyPoints, niftyCandles, levelSegments } from '../lib/marketData/gammaHistoryView';

test('session boundaries use IST and reject impossible dates', () => {
  const session = historySession('2026-10-05');
  assert.equal(new Date(session.open * 1000).toISOString(), '2026-10-05T03:45:00.000Z');
  assert.equal(new Date(session.close * 1000).toISOString(), '2026-10-05T10:00:00.000Z');
  assert.throws(() => historySession('2026-02-30'));
  assert.throws(() => historySession('bad-date'));
});

test('FYERS candles are deduplicated, sorted, and restricted to the selected session', () => {
  const { open, close } = historySession('2026-10-05');
  const candle = [open, 22500, 22520, 22490, 22510];
  const output = niftyCandles([
    [open + 60, 22510, 22530, 22500, 22520], candle, candle,
    [close, 22500, 22520, 22490, 22510],
    [open - 60, 22500, 22520, 22490, 22510],
    [open + 120, 22500, 22400, 22490, 22510],
  ], '2026-10-05');
  assert.equal(output.length, 2);
  assert.deepEqual(output.map(c => c.time), [open, open + 60]);
});

test('saved levels preserve unavailable values and do not cross a formula change', () => {
  const base = { spot: 22500, callWall: 22600, putWall: 22400, gammaFlip: 22450, calculationVersion: 1 };
  const points = historyPoints([
    { ...base, minute: '2026-10-05T04:00:00.000Z' },
    { ...base, minute: '2026-10-05T04:01:00.000Z', gammaFlip: null },
    { ...base, minute: '2026-10-05T04:02:00.000Z' },
    { ...base, minute: '2026-10-05T04:03:00.000Z', calculationVersion: 2 },
    { ...base, minute: '2026-10-04T04:04:00.000Z' },
  ], '2026-10-05');
  assert.equal(points.length, 4);
  assert.equal(points[1].gammaFlip, null);
  assert.deepEqual(levelSegments(points, 'gammaFlip').map(s => s.length), [1, 1, 1]);
  assert.deepEqual(levelSegments(points, 'callWall').map(s => s.length), [3, 1]);
});

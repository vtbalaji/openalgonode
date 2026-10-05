import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GammaSnapshot } from '../lib/gammaExposure';
import { gammaHistoryRecord } from '../lib/marketData/gammaHistory';

const fetchedAt = '2026-10-05T04:30:20.000Z'; // 10:00:20 IST
const snapshot = {
  fetchedAt, valuationTime: '2026-10-05T04:30:00.000Z',
  expiry: '1791281400', spot: 22421.95,
  callWall: 22700, putWall: 22000,
  flips: [22000, 22400, 23000], net: -120000,
  gammaSource: { model: 160, broker: 0 }, excluded: 20, contracts: 160,
} as GammaSnapshot;

test('a current session snapshot has a stable expiry-minute key and nearest flip', () => {
  const record = gammaHistoryRecord(snapshot);
  assert.equal(record?.id, '20261005T0430');
  assert.equal(record.data.minute, '2026-10-05T04:30:00.000Z');
  assert.equal(record.data.gammaFlip, 22400);
  assert.deepEqual(record.data.modelCoverage, { modeled: 160, broker: 0, unavailable: 20, total: 180 });
});

test('history excludes manual historical times, holidays, and closed market', () => {
  assert.equal(gammaHistoryRecord({ ...snapshot, valuationTime: '2026-10-01T10:00:00.000Z' }), null);
  assert.equal(gammaHistoryRecord({ ...snapshot, valuationTime: null }), null);
  assert.equal(gammaHistoryRecord({ ...snapshot, fetchedAt: '2026-10-02T04:30:20.000Z', valuationTime: '2026-10-02T04:30:00.000Z' }), null);
  assert.equal(gammaHistoryRecord({ ...snapshot, fetchedAt: '2026-10-05T10:00:00.000Z', valuationTime: '2026-10-05T09:59:40.000Z' }), null);
  assert.equal(gammaHistoryRecord({ ...snapshot, fetchedAt: '2026-10-05T03:30:00.000Z', valuationTime: '2026-10-05T03:29:40.000Z' }), null);
});

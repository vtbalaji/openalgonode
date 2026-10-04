import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultNseValuationTime, toIstInput } from '../lib/marketData/nseValuationTime';

test('holiday weekend defaults to October 1 at 15:30 IST', () => {
  for (const date of ['2026-10-02', '2026-10-03', '2026-10-04']) {
    assert.equal(defaultNseValuationTime(Date.parse(`${date}T11:00:00+05:30`)), '2026-10-01T10:00:00.000Z');
  }
});

test('pre-open, active session, close and after-hours use correct IST time', () => {
  for (const [time, expected] of [
    ['09:14:59', '2026-10-01T10:00:00.000Z'],
    ['09:15:00', '2026-10-05T03:45:00.000Z'],
    ['11:23:45', '2026-10-05T05:53:45.000Z'],
    ['15:30:00', '2026-10-05T10:00:00.000Z'],
    ['20:00:00', '2026-10-05T10:00:00.000Z'],
  ]) assert.equal(defaultNseValuationTime(Date.parse(`2026-10-05T${time}+05:30`)), expected);
});

test('manual fallback for unsupported calendar and unverified special session', () => {
  assert.equal(defaultNseValuationTime(Date.parse('2027-01-04T11:00:00+05:30')), null);
  assert.equal(defaultNseValuationTime(Date.parse('2026-11-08T18:00:00+05:30')), null);
  assert.equal(defaultNseValuationTime(Date.parse('2026-11-09T08:00:00+05:30')), null);
  assert.equal(toIstInput('2026-10-01T10:00:00.000Z'), '2026-10-01T15:30:00');
});

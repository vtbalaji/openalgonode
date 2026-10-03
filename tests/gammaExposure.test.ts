import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGammaExposure, type GammaLeg } from '../lib/gammaExposure';

const now = Date.UTC(2026, 9, 3);
const expiry = now + 4 * 86400000;
const leg: GammaLeg = { symbol: 'test', strike: 22500, type: 'call', oiQuantity: 65000, iv: 0.15, brokerGamma: 0.0012 };

test('strike details retain raw quantities and distinguish unavailable volume from zero', () => {
  const result = calculateGammaExposure([leg, { ...leg, type: 'put', volume: 0, oiQuantity: 130000 }], 22500, expiry, now);
  const row = result.rows[0];
  assert.equal(row.callOi, 65000);
  assert.equal(row.putOi, 130000);
  assert.equal(row.callVolume, null);
  assert.equal(row.putVolume, 0);
  assert.equal(row.modeledGex, result.modeledNet);
});

test('equal calls and puts cancel at every hypothetical price', () => {
  const result = calculateGammaExposure([leg, { ...leg, type: 'put' }], 22500, expiry, now);
  assert.equal(result.net, 0);
  assert.ok(result.profile.every(p => p.gex === 0));
  assert.deepEqual(result.flips, []);
});

test('quantity scales exposure once; call-only chain has no flip', () => {
  const a = calculateGammaExposure([leg], 22500, expiry, now);
  const b = calculateGammaExposure([{ ...leg, oiQuantity: 130000 }], 22500, expiry, now);
  assert.equal(b.net, a.net * 2);
  assert.ok(a.net > 0);
  assert.equal(a.putWall, null);
  assert.deepEqual(a.flips, []);
  assert.ok(Math.abs(a.rows[0].net - a.net) < 1e-8);
});

test('invalid IV affects only the model; broker bars do not require IV', () => {
  const result = calculateGammaExposure([leg, { ...leg, iv: NaN }], 22500, expiry, now);
  assert.equal(result.excluded, 0);
  assert.equal(result.contracts, 2);
  assert.equal(result.modelExcluded, 1);
  assert.equal(result.modelContracts, 1);
  assert.throws(() => calculateGammaExposure([leg], 22500, now, now));
});

test('flip is a zero of repriced aggregate gamma, independent of strike accumulation', () => {
  const legs: GammaLeg[] = [{ ...leg, strike: 22000, type: 'put' }, { ...leg, strike: 23000 }];
  const result = calculateGammaExposure(legs, 22500, expiry, now);
  assert.equal(result.flips.length, 1);
  const atFlip = calculateGammaExposure(legs, result.flips[0], expiry, now);
  assert.ok(Math.abs(atFlip.modeledNet!) < 0.1);
  assert.equal(result.callWall, 23000);
  assert.equal(result.putWall, 22000);
});

test('snapshot uses broker gamma exactly, regardless of local model assumptions', () => {
  const a = calculateGammaExposure([leg], 22500, expiry, now);
  const b = calculateGammaExposure([{ ...leg, iv: 0.8 }], 22500, expiry, now + 86400000);
  assert.equal(a.net, 0.0012 * 65000 * 22500 * 22500 * 0.01);
  assert.equal(a.net, b.net);
  assert.notEqual(a.modeledNet, b.modeledNet);
});

test('zero gamma remains reported zero; absent gamma is not replaced by model gamma', () => {
  const result = calculateGammaExposure([
    { ...leg, brokerGamma: 0, iv: 0 },
    { ...leg, strike: 24000, brokerGamma: undefined, iv: 0 },
  ], 22500, expiry, now);
  assert.equal(result.net, 0);
  assert.equal(result.reportedZero, 1);
  assert.equal(result.excluded, 1);
  assert.equal(result.rows[1].missing, 1);
  assert.equal(result.modeledNet, null);
  assert.deepEqual(result.profile, []);
  assert.deepEqual(result.flips, []);
  assert.equal(result.callWall, null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalCDF } from '../lib/indicators/normalDistribution';
import { callPrice, putPrice } from '../lib/indicators/blackScholes';

test('normal CDF matches reference probabilities and is continuous at zero', () => {
  for (const [x, expected] of [[0, 0.5], [1, 0.841344746068543], [-1, 0.158655253931457], [2, 0.977249868051821], [-3, 0.00134989803163]]) {
    assert.ok(Math.abs(normalCDF(x) - expected) < 1e-7);
  }
  assert.ok(Math.abs(normalCDF(1e-10) - normalCDF(-1e-10)) < 1e-7);
  assert.equal(normalCDF(Infinity), 1);
  assert.equal(normalCDF(-Infinity), 0);
});

test('Black-Scholes prices agree with an independent reference case', () => {
  const inputs = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, optionType: 'call' as const };
  assert.ok(Math.abs(callPrice(inputs) - 10.45058357) < 0.0001);
  assert.ok(Math.abs(putPrice(inputs) - 5.57352602) < 0.0001);
});

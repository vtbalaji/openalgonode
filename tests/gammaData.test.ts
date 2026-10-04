import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFyersGammaChain } from '../lib/marketData/fyersGammaChain';
import { fetchParticipantPositioning } from '../lib/marketData/nseParticipantOi';

test('FYERS adapter preserves underlying OI without another lot multiplier', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ s: 'ok', data: {
    expiryData: [{ expiry: '1791281400', date: '06-10-2026' }],
    optionsChain: [
      { symbol: 'NSE:NIFTY50-INDEX', ltp: 22421.95 },
      { symbol: 'NIFTY25000CE', option_type: 'CE', strike_price: 25000, oi: 2144610, greeks: { iv: 13.42, gamma: 0.0005 } },
    ],
  } }));
  const result = await fetchFyersGammaChain('test-only', '1791281400');
  assert.equal(result.legs[0].oiQuantity, 2144610);
  assert.equal(result.legs[0].oiQuantity / 65, 32994);
  assert.ok(Math.abs(result.legs[0].iv - 0.1342) < 1e-12);
});

test('participant lookup shares one deadline across dates and stops after abort', async t => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    assert.equal(ms, 2000);
    return controller.signal;
  });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    assert.equal(init.signal, controller.signal);
    calls++;
    if (calls === 2) { controller.abort(); throw new Error('timeout'); }
    return new Response('', { status: 404 });
  });
  const result = await fetchParticipantPositioning(Date.parse('2026-10-04T12:00:00+05:30'));
  assert.equal(calls, 2);
  assert.equal(result.source, 'assumed');
});

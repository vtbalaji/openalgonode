import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGammaExposure, bsmGamma, impliedCarry, impliedVol, fillMissingIv, type GammaLeg } from '../lib/gammaExposure';
import { gamma } from '../lib/indicators/blackScholes';
import { parseParticipantOi } from '../lib/marketData/nseParticipantOi';
import { nseTradingYears } from '../lib/marketData/nseValuationTime';

const now = Date.UTC(2026, 9, 3);
const expiry = now + 4 * 86400000;
const leg: GammaLeg = { symbol: 'test', strike: 22500, type: 'call', oiQuantity: 65000, iv: 0.15, brokerGamma: 0.0012 };

test('walls select largest gamma only on the requested side of spot', () => {
  const legs: GammaLeg[] = [
    { ...leg, strike: 22000, brokerGamma: 0.01 },
    { ...leg, strike: 22000, type: 'put', brokerGamma: 0.002 },
    { ...leg, strike: 22400, type: 'put', brokerGamma: 0.001 },
    { ...leg, strike: 22500, brokerGamma: 0.02 },
    { ...leg, strike: 22500, type: 'put', brokerGamma: 0.02 },
    { ...leg, strike: 23000, brokerGamma: 0.002 },
    { ...leg, strike: 23000, type: 'put', brokerGamma: 0.01 },
    { ...leg, strike: 23500, brokerGamma: 0.001 },
  ];
  const r = calculateGammaExposure(legs, 22500, expiry);
  assert.equal(r.callWall, 23000);
  assert.equal(r.putWall, 22000);
});

test('walls never fall back to ATM, wrong-side or zero exposure', () => {
  for (const legs of [
    [leg, { ...leg, type: 'put' as const }],
    [{ ...leg, strike: 22000 }, { ...leg, strike: 23000, type: 'put' as const }],
    [{ ...leg, strike: 23000, brokerGamma: 0 }, { ...leg, strike: 22000, type: 'put' as const, brokerGamma: 0 }],
  ]) {
    const r = calculateGammaExposure(legs, 22500, expiry);
    assert.equal(r.callWall, null);
    assert.equal(r.putWall, null);
  }
});

test('model is absent unless a valuation time is explicitly supplied', () => {
  const r = calculateGammaExposure([leg], 22500, expiry);
  assert.equal(r.valuationTime, null);
  assert.equal(r.modeledNet, null);
  assert.equal(r.rows[0].modeledGex, null);
  assert.deepEqual(r.profile, []);
  assert.deepEqual(r.flips, []);
  assert.ok(r.net > 0);
  const valued = calculateGammaExposure([leg], 22500, expiry, now);
  assert.equal(valued.valuationTime, new Date(now).toISOString());
  assert.ok(valued.profile.length > 0);
  assert.deepEqual(r.gammaSource, { model: 0, broker: 1 });
  assert.deepEqual(valued.gammaSource, { model: 1, broker: 0 });
  assert.equal(valued.brokerNet, r.net);
  assert.throws(() => calculateGammaExposure([leg], 22500, expiry, NaN));
});

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

test('invalid IV is excluded consistently from modeled bars and curve', () => {
  const result = calculateGammaExposure([leg, { ...leg, strike: 22600, type: 'put', iv: NaN }], 22500, expiry, now);
  assert.equal(result.excluded, 3);
  assert.equal(result.contracts, 1);
  assert.deepEqual(result.gammaSource, { model: 1, broker: 0 });
  assert.equal(result.rows[1].putAvailable, false);
  assert.equal(result.net, result.modeledNet);
  assert.equal(result.modelExcluded, 3);
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

test('bars use Black-Scholes gamma with calendar time including weekends', () => {
  const a = calculateGammaExposure([leg], 22500, expiry, now);
  const T = 4 / 365;
  const expected = bsmGamma(22500, 22500, T, 0.06, 0.012, 0.15) * 65000 * 22500 * 22500 * 0.01;
  assert.equal(a.carry.source, 'default');
  assert.ok(Math.abs(a.net - expected) < 1e-6);
  assert.equal(a.net, a.modeledNet);
  assert.equal(a.brokerNet, 0.0012 * 65000 * 22500 * 22500 * 0.01);
  assert.equal(a.timeToExpiryYears, T);
});

test('BSM gamma with zero dividend matches Black-Scholes; dividend scales by e^(-qT)', () => {
  const g = gamma({ S: 22500, K: 22600, T: 0.02, r: 0.06, sigma: 0.15, optionType: 'call' });
  assert.ok(Math.abs(bsmGamma(22500, 22600, 0.02, 0.06, 0, 0.15) - g) < 1e-15);
  assert.ok(bsmGamma(22500, 22600, 0.02, 0.06, 0.012, 0.15) !== g);
});

test('carry is implied from put-call parity at strikes nearest spot', () => {
  const T = 2 / 252, S = 22500, r = 0.065, q = 0.012;
  const F = S * Math.exp((r - q) * T);
  const legs: GammaLeg[] = [22400, 22500, 22600].flatMap(K => {
    const put = 100, call = put + (F - K) * Math.exp(-0.06 * T);
    return [{ ...leg, strike: K, ltp: call }, { ...leg, strike: K, type: 'put' as const, ltp: put }];
  });
  const c = impliedCarry(legs, S, T);
  assert.equal(c.source, 'put-call-parity');
  assert.ok(Math.abs(c.forward! - F) < 1e-6);
  assert.ok(Math.abs(c.rate - r) < 1e-9);
  assert.equal(impliedCarry([leg], S, T).source, 'default');
  assert.equal(impliedCarry([{ ...leg, ltp: 5000 }, { ...leg, type: 'put', ltp: 1 }], S, T).source, 'default');
});

test('trading time skips nights, weekends and NSE holidays', () => {
  const ist = (s: string) => Date.parse(`${s}+05:30`);
  // Friday close to Monday close is one session, not three calendar days.
  assert.equal(nseTradingYears(ist('2026-10-09T15:30:00'), ist('2026-10-12T15:30:00')) * 252, 1);
  // Oct 2 2026 is a holiday: Thursday close to Monday close is one session.
  assert.equal(nseTradingYears(ist('2026-10-01T15:30:00'), ist('2026-10-05T15:30:00')) * 252, 1);
  assert.ok(Math.abs(nseTradingYears(ist('2026-10-05T12:22:30'), ist('2026-10-05T15:30:00')) * 252 - 0.5) < 1e-9);
  assert.equal(nseTradingYears(ist('2026-10-05T15:30:00'), ist('2026-10-05T15:30:00')), 0);
});

const participantCsv = `""Participant wise Open Interest (no. of contracts) in Equity Derivatives as on Oct 01, 2026"",,,,,,,,,,,,,,
Client Type,Future Index Long,Future Index Short,Future Stock Long,Future Stock Short       ,Option Index Call Long,Option Index Put Long,Option Index Call Short,Option Index Put Short,Option Stock Call Long,Option Stock Put Long,Option Stock Call Short,Option Stock Put Short,Total Long Contracts      ,Total Short Contracts
Client,306566,56754,3422680,155072,3743798,2363022,3448314,3206170,1566739,571650,883971,875714,11974455,8625995
DII,48119,14862,264333,4574585,8533,40402,3557,876,9411,43501,204308,22745,414299,4820933
FII,29605,339779,3393649,2858568,670483,1114773,1101948,448195,112470,227850,206962,90579,5548830,5046031
Pro,51101,23996,817937,310374,1337674,958371,1206669,821327,669169,831768,1062548,685731,4666020,4110645
TOTAL,435391,435391,7898599,7898599,5760488,4476568,5760488,4476568,2357789,1674769,2357789,1674769,22603604,22603604
`;

test('participant OI gives Pro + FII net long share of index option OI per side', () => {
  const p = parseParticipantOi(participantCsv, '2026-10-01');
  assert.equal(p.source, 'nse-participant-oi');
  assert.ok(Math.abs(p.callWeight - (1337674 + 670483 - 1206669 - 1101948) / 5760488) < 1e-12);
  assert.ok(Math.abs(p.putWeight - (958371 + 1114773 - 821327 - 448195) / 4476568) < 1e-12);
  assert.throws(() => parseParticipantOi('garbage', '2026-10-01'));
});

test('participant positioning is reported but does not change exposure', () => {
  const positioning = { source: 'nse-participant-oi' as const, asOf: '2026-10-01', hedgers: ['Pro', 'FII'], callWeight: -0.25, putWeight: 0.5 };
  const base = calculateGammaExposure([leg, { ...leg, type: 'put' }], 22500, expiry, now);
  const weighted = calculateGammaExposure([leg, { ...leg, type: 'put' }], 22500, expiry, now, positioning);
  assert.equal(weighted.net, base.net);
  assert.deepEqual(weighted.flips, base.flips);
  assert.ok(weighted.rows[0].call > 0 && weighted.rows[0].put < 0);
  assert.equal(weighted.positioning.asOf, '2026-10-01');
});

test('zero gamma remains reported zero; absent gamma is not replaced by model gamma', () => {
  const result = calculateGammaExposure([
    { ...leg, brokerGamma: 0, iv: 0 },
    { ...leg, strike: 24000, brokerGamma: undefined, iv: 0 },
  ], 22500, expiry, now);
  assert.equal(result.net, 0);
  assert.equal(result.reportedZero, 1);
  assert.equal(result.excluded, 3);
  assert.equal(result.rows[1].missing, 2);
  assert.equal(result.modeledNet, null);
  assert.deepEqual(result.profile, []);
  assert.deepEqual(result.flips, []);
  assert.equal(result.callWall, null);
});

test('absent put is unavailable, not a verified zero', () => {
  const r = calculateGammaExposure([leg], 22500, expiry, now);
  assert.equal(r.excluded, 1);
  assert.equal(r.modelExcluded, 1);
  assert.equal(r.rows[0].missing, 1);
  assert.equal(r.rows[0].putAvailable, false);
  assert.equal(r.rows[0].callAvailable, true);
  assert.throws(() => calculateGammaExposure([leg, leg], 22500, expiry, now), /Duplicate/);
});

test('missing IV is filled from the same strike, else solved from price', () => {
  const T = 1 / 365;
  const { legs, source } = fillMissingIv([
    { ...leg, strike: 22400, iv: 0.12 }, { ...leg, strike: 22400, type: 'put', iv: NaN },
    { ...leg, strike: 22600, type: 'put', iv: 0, ltp: 160 },
  ], 22450, T, 0.06, 0.012);
  assert.equal(legs[1].iv, 0.12);
  assert.ok(legs[2].iv > 0);
  assert.deepEqual(source, { broker: 1, sameStrike: 1, fromPrice: 1 });
  const sigma = impliedVol(160, 22450, 22600, T, 0.06, 0.012, 'put')!;
  assert.equal(legs[2].iv, sigma);
  assert.equal(impliedVol(100, 22450, 22600, T, 0.06, 0.012, 'put'), null); // below intrinsic
});

test('in-the-money legs without IV still count toward the flip', () => {
  // ITM put above spot carries heavy OI but FYERS gives no IV; it must pull the curve negative near spot.
  const legs: GammaLeg[] = [
    { ...leg, strike: 22400, type: 'put', oiQuantity: 3e6, iv: 0.12 },
    { ...leg, strike: 22500, type: 'call', oiQuantity: 3e6, iv: 0.12 },
    { ...leg, strike: 22500, type: 'put', oiQuantity: 4e6, iv: NaN },
  ];
  const r = calculateGammaExposure(legs, 22450, expiry, now);
  assert.equal(r.modelContracts, 3);
  assert.ok(r.rows.find(x => x.strike === 22500)!.put < 0);
});

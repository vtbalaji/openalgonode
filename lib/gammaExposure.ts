import { normalPDF } from './indicators/normalDistribution';
import { nseTradingYears } from './marketData/nseValuationTime';
import { ASSUMED_POSITIONING, type ParticipantPositioning } from './marketData/nseParticipantOi';

export interface GammaLeg {
  symbol: string;
  strike: number;
  type: 'call' | 'put';
  oiQuantity: number;
  iv: number;
  ltp?: number;
  brokerGamma?: number;
  volume?: number;
}
export interface GammaSnapshot {
  spot: number;
  expiry: string;
  expiries: { value: string; label: string }[];
  fetchedAt: string;
  rows: { strike: number; call: number; put: number; net: number; missing: number; reportedZero: number;
    callAvailable: boolean; putAvailable: boolean;
    callOi: number | null; putOi: number | null; callVolume: number | null; putVolume: number | null; modeledGex: number | null }[];
  profile: { price: number; gex: number }[];
  flips: number[];
  callWall: number | null;
  putWall: number | null;
  net: number;
  brokerNet: number | null;
  gammaSource: { model: number; broker: number };
  positioning: ParticipantPositioning;
  timeToExpiryYears: number | null;
  carry: { rate: number; dividendYield: number; forward: number | null; source: 'put-call-parity' | 'default' };
  excluded: number;
  contracts: number;
  reportedZero: number;
  modelContracts: number;
  modelExcluded: number;
  modeledNet: number | null;
  valuationTime: string | null;
}

// Fallbacks when the chain cannot imply a forward. Approximate; review against current T-bill yield and NIFTY dividend yield.
export const DEFAULT_RISK_FREE_RATE = 0.06;
export const NIFTY_DIVIDEND_YIELD = 0.012;

// Black-Scholes-Merton gamma with continuous dividend yield q: e^(-qT) * phi(d1) / (S * sigma * sqrt(T)).
export function bsmGamma(S: number, K: number, T: number, r: number, q: number, sigma: number) {
  if (!(T > 0) || !(sigma > 0) || !(S > 0) || !(K > 0)) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  return Math.exp(-q * T) * normalPDF(d1) / (S * sigma * sqrtT);
}

// Forward implied by put-call parity, F = K + (C - P) * e^(rT), median of the three strikes nearest spot.
// The implied carry r - q = ln(F/S)/T replaces the fixed rate; q stays at the NIFTY dividend yield.
export function impliedCarry(legs: GammaLeg[], spot: number, T: number) {
  const fallback = { rate: DEFAULT_RISK_FREE_RATE, dividendYield: NIFTY_DIVIDEND_YIELD, forward: null, source: 'default' as const };
  if (!(T > 0)) return fallback;
  const price = new Map<string, number>();
  for (const l of legs) if (Number.isFinite(l.ltp) && l.ltp! > 0) price.set(`${l.strike}:${l.type}`, l.ltp!);
  const forwards = [...new Set(legs.map(l => l.strike))]
    .filter(K => price.has(`${K}:call`) && price.has(`${K}:put`))
    .sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot)).slice(0, 3)
    .map(K => K + (price.get(`${K}:call`)! - price.get(`${K}:put`)!) * Math.exp(DEFAULT_RISK_FREE_RATE * T))
    .sort((a, b) => a - b);
  if (!forwards.length) return fallback;
  const forward = forwards[Math.floor(forwards.length / 2)];
  const carry = Math.log(forward / spot) / T;
  // Reject implausible carries (stale or one-sided quotes).
  if (!Number.isFinite(carry) || Math.abs(carry) > 0.5) return fallback;
  return { rate: carry + NIFTY_DIVIDEND_YIELD, dividendYield: NIFTY_DIVIDEND_YIELD, forward, source: 'put-call-parity' as const };
}

export function calculateGammaExposure(legs: GammaLeg[], spot: number, expiryMs: number, now: number | null = null,
  positioning: ParticipantPositioning = ASSUMED_POSITIONING) {
  // Trading-time convention: only regular NSE session minutes count, annualized over 252 sessions.
  const T = now === null ? 0 : nseTradingYears(now, expiryMs);
  if (!Number.isFinite(spot) || !(spot > 0) || !Number.isFinite(expiryMs) || (now !== null && (!Number.isFinite(now) || !(T > 0)))) throw new Error('A valid spot and valuation time before expiry are required.');
  const validOi = (l: GammaLeg) => Number.isFinite(l.oiQuantity) && l.oiQuantity >= 0 && Number.isFinite(l.strike) && l.strike > 0;
  const hasBroker = (l: GammaLeg) => Number.isFinite(l.brokerGamma) && l.brokerGamma! >= 0;
  const hasIv = (l: GammaLeg) => Number.isFinite(l.iv) && l.iv > 0;
  const modeled = legs.filter(l => validOi(l) && hasIv(l));
  const modelEnabled = now !== null && modeled.length > 0;
  const useModel = (l: GammaLeg) => modelEnabled && hasIv(l);
  const usable = legs.filter(l => validOi(l) && (useModel(l) || hasBroker(l)));
  if (!usable.length) throw new Error('No usable gamma and open interest returned for this expiry.');
  // OI is underlying quantity (the adapter multiplies contracts by lot size).
  // Standard dealer convention: long calls (+), short puts (-). Participant positioning is reported alongside, not applied,
  // because NSE's figure is one net across all index options, strikes and expiries.
  const weight = (l: GammaLeg) => l.type === 'call' ? 1 : -1;
  const carry = impliedCarry(legs, spot, T);
  const modelGamma = (l: GammaLeg, S: number) => bsmGamma(S, l.strike, T, carry.rate, carry.dividendYield, l.iv);
  const exposure = (l: GammaLeg, S: number) => modelGamma(l, S) * l.oiQuantity * S * S * 0.01 * weight(l);
  const brokerExposure = (l: GammaLeg) => l.brokerGamma! * l.oiQuantity * spot * spot * 0.01 * weight(l);
  const grouped = new Map<number, GammaSnapshot['rows'][number]>();
  const seen = new Set<string>();
  const gammaSource = { model: 0, broker: 0 };
  let reportedZero = 0;
  for (const l of legs) {
    if (!Number.isFinite(l.strike) || l.strike <= 0) continue;
    const key = `${l.strike}:${l.type}`;
    if (seen.has(key)) throw new Error('Duplicate option leg in broker chain.');
    seen.add(key);
    const row = grouped.get(l.strike) ?? { strike: l.strike, call: 0, put: 0, net: 0, missing: 2, reportedZero: 0,
      callAvailable: false, putAvailable: false,
      callOi: null, putOi: null, callVolume: null, putVolume: null, modeledGex: null };
    row[l.type === 'call' ? 'callOi' : 'putOi'] = Number.isFinite(l.oiQuantity) && l.oiQuantity >= 0 ? l.oiQuantity : null;
    row[l.type === 'call' ? 'callVolume' : 'putVolume'] = Number.isFinite(l.volume) && l.volume! >= 0 ? l.volume! : null;
    if (validOi(l) && (useModel(l) || hasBroker(l))) {
      // Black-Scholes gamma from FYERS IV; broker gamma only when IV or valuation time is unavailable.
      if (useModel(l)) { row[l.type] += exposure(l, spot); gammaSource.model++; }
      else {
        row[l.type] += brokerExposure(l); gammaSource.broker++;
        if (l.brokerGamma === 0) { row.reportedZero++; reportedZero++; }
      }
      row[l.type === 'call' ? 'callAvailable' : 'putAvailable'] = true;
      row.missing--;
    }
    row.net = row.call + row.put;
    grouped.set(l.strike, row);
  }
  const brokerLegs = legs.filter(l => validOi(l) && hasBroker(l));
  const rows = [...grouped.values()].sort((a, b) => a.strike - b.strike);
  const lo = Math.min(rows[0].strike, spot * 0.98), hi = Math.max(rows[rows.length - 1].strike, spot * 1.02);
  const total = (price: number) => modeled.reduce((n, l) => n + exposure(l, price), 0);
  for (const row of rows) row.modeledGex = modelEnabled ? total(row.strike) : null;
  const profile = modelEnabled ? Array.from({ length: 241 }, (_, i) => { const price = lo + (hi - lo) * i / 240; return { price, gex: total(price) }; }) : [];
  const flips: number[] = [];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (a.gex * b.gex < 0) {
      let left = a.price, right = b.price;
      for (let j = 0; j < 30; j++) { const mid = (left + right) / 2; if (total(left) * total(mid) <= 0) right = mid; else left = mid; }
      flips.push((left + right) / 2);
    }
  }
  // Walls are the largest gamma magnitude on each side of spot.
  const call = rows.filter(r => r.strike > spot && r.callAvailable && r.call !== 0)
    .reduce<GammaSnapshot['rows'][number] | null>((best, row) => !best || Math.abs(row.call) > Math.abs(best.call) ? row : best, null);
  const put = rows.filter(r => r.strike < spot && r.putAvailable && r.put !== 0)
    .reduce<GammaSnapshot['rows'][number] | null>((best, row) => !best || Math.abs(row.put) > Math.abs(best.put) ? row : best, null);
  return { rows, profile, flips, callWall: call?.strike ?? null, putWall: put?.strike ?? null,
    net: rows.reduce((n, r) => n + r.net, 0),
    brokerNet: brokerLegs.length ? brokerLegs.reduce((n, l) => n + brokerExposure(l), 0) : null,
    gammaSource, positioning, timeToExpiryYears: now === null ? null : T, carry,
    excluded: rows.reduce((n, r) => n + r.missing, 0), contracts: usable.length,
    reportedZero,
    modelContracts: modeled.length, modelExcluded: rows.length * 2 - modeled.length,
    modeledNet: modelEnabled ? total(spot) : null,
    valuationTime: now === null ? null : new Date(now).toISOString(),
  };
}

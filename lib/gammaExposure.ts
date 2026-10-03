import { gamma } from './indicators/blackScholes';

export interface GammaLeg {
  symbol: string;
  strike: number;
  type: 'call' | 'put';
  oiQuantity: number;
  iv: number;
  brokerGamma?: number;
  volume?: number;
}
export interface GammaSnapshot {
  spot: number;
  expiry: string;
  expiries: { value: string; label: string }[];
  fetchedAt: string;
  rows: { strike: number; call: number; put: number; net: number; missing: number; reportedZero: number;
    callOi: number | null; putOi: number | null; callVolume: number | null; putVolume: number | null; modeledGex: number | null }[];
  profile: { price: number; gex: number }[];
  flips: number[];
  callWall: number | null;
  putWall: number | null;
  net: number;
  excluded: number;
  contracts: number;
  reportedZero: number;
  modelContracts: number;
  modelExcluded: number;
  modeledNet: number | null;
}

export function calculateGammaExposure(legs: GammaLeg[], spot: number, expiryMs: number, now = Date.now()) {
  const T = (expiryMs - now) / (365 * 86400000);
  if (!Number.isFinite(spot) || !(spot > 0) || !Number.isFinite(T) || T <= 0) throw new Error('A valid spot and unexpired contract are required.');
  const validOi = (l: GammaLeg) => Number.isFinite(l.oiQuantity) && l.oiQuantity >= 0 && Number.isFinite(l.strike) && l.strike > 0;
  const usable = legs.filter(l => validOi(l) && Number.isFinite(l.brokerGamma) && l.brokerGamma! >= 0);
  const modeled = legs.filter(l => validOi(l) && Number.isFinite(l.iv) && l.iv > 0);
  if (!usable.length) throw new Error('No usable FYERS gamma and open interest returned for this expiry.');
  // OI is normalized to underlying quantity by the adapter. Do not multiply it by lot size again.
  const exposure = (l: GammaLeg, S: number) => gamma({ S, K: l.strike, T, r: 0.07, sigma: l.iv, optionType: l.type }) * l.oiQuantity * S * S * 0.01 * (l.type === 'call' ? 1 : -1);
  const grouped = new Map<number, GammaSnapshot['rows'][number]>();
  for (const l of legs) {
    if (!Number.isFinite(l.strike) || l.strike <= 0) continue;
    const row = grouped.get(l.strike) ?? { strike: l.strike, call: 0, put: 0, net: 0, missing: 0, reportedZero: 0,
      callOi: null, putOi: null, callVolume: null, putVolume: null, modeledGex: null };
    row[l.type === 'call' ? 'callOi' : 'putOi'] = Number.isFinite(l.oiQuantity) && l.oiQuantity >= 0 ? l.oiQuantity : null;
    row[l.type === 'call' ? 'callVolume' : 'putVolume'] = Number.isFinite(l.volume) && l.volume! >= 0 ? l.volume! : null;
    if (validOi(l) && Number.isFinite(l.brokerGamma) && l.brokerGamma! >= 0) {
      row[l.type] += l.brokerGamma! * l.oiQuantity * spot * spot * 0.01 * (l.type === 'call' ? 1 : -1);
      if (l.brokerGamma === 0) row.reportedZero++;
    } else row.missing++;
    row.net = row.call + row.put;
    grouped.set(l.strike, row);
  }
  const rows = [...grouped.values()].sort((a, b) => a.strike - b.strike);
  const lo = Math.min(rows[0].strike, spot * 0.98), hi = Math.max(rows[rows.length - 1].strike, spot * 1.02);
  const total = (price: number) => modeled.reduce((n, l) => n + exposure(l, price), 0);
  for (const row of rows) row.modeledGex = modeled.length ? total(row.strike) : null;
  const profile = modeled.length ? Array.from({ length: 241 }, (_, i) => { const price = lo + (hi - lo) * i / 240; return { price, gex: total(price) }; }) : [];
  const flips: number[] = [];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (a.gex * b.gex < 0) {
      let left = a.price, right = b.price;
      for (let j = 0; j < 30; j++) { const mid = (left + right) / 2; if (total(left) * total(mid) <= 0) right = mid; else left = mid; }
      flips.push((left + right) / 2);
    }
  }
  const call = rows.reduce((a, b) => b.call > a.call ? b : a);
  const put = rows.reduce((a, b) => b.put < a.put ? b : a);
  return { rows, profile, flips, callWall: call.call > 0 ? call.strike : null, putWall: put.put < 0 ? put.strike : null,
    net: rows.reduce((n, r) => n + r.net, 0), excluded: legs.length - usable.length, contracts: usable.length,
    reportedZero: usable.filter(l => l.brokerGamma === 0).length,
    modelContracts: modeled.length, modelExcluded: legs.length - modeled.length,
    modeledNet: modeled.length ? total(spot) : null,
  };
}

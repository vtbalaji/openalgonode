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
    callAvailable: boolean; putAvailable: boolean;
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
  valuationTime: string | null;
}

export function calculateGammaExposure(legs: GammaLeg[], spot: number, expiryMs: number, now: number | null = null) {
  const T = now === null ? 0 : (expiryMs - now) / (365 * 86400000);
  if (!Number.isFinite(spot) || !(spot > 0) || !Number.isFinite(expiryMs) || (now !== null && (!Number.isFinite(T) || T <= 0))) throw new Error('A valid spot and valuation time before expiry are required.');
  const validOi = (l: GammaLeg) => Number.isFinite(l.oiQuantity) && l.oiQuantity >= 0 && Number.isFinite(l.strike) && l.strike > 0;
  const usable = legs.filter(l => validOi(l) && Number.isFinite(l.brokerGamma) && l.brokerGamma! >= 0);
  const modeled = legs.filter(l => validOi(l) && Number.isFinite(l.iv) && l.iv > 0);
  const modelEnabled = now !== null && modeled.length > 0;
  if (!usable.length) throw new Error('No usable FYERS gamma and open interest returned for this expiry.');
  // OI is normalized to underlying quantity by the adapter. Do not multiply it by lot size again.
  const exposure = (l: GammaLeg, S: number) => gamma({ S, K: l.strike, T, r: 0.07, sigma: l.iv, optionType: l.type }) * l.oiQuantity * S * S * 0.01 * (l.type === 'call' ? 1 : -1);
  const grouped = new Map<number, GammaSnapshot['rows'][number]>();
  const seen = new Set<string>();
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
    if (validOi(l) && Number.isFinite(l.brokerGamma) && l.brokerGamma! >= 0) {
      row[l.type] += l.brokerGamma! * l.oiQuantity * spot * spot * 0.01 * (l.type === 'call' ? 1 : -1);
      row[l.type === 'call' ? 'callAvailable' : 'putAvailable'] = true;
      row.missing--;
      if (l.brokerGamma === 0) row.reportedZero++;
    }
    row.net = row.call + row.put;
    grouped.set(l.strike, row);
  }
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
  const call = rows.filter(r => r.strike > spot && r.callAvailable && r.call > 0)
    .reduce<GammaSnapshot['rows'][number] | null>((best, row) => !best || row.call > best.call ? row : best, null);
  const put = rows.filter(r => r.strike < spot && r.putAvailable && r.put < 0)
    .reduce<GammaSnapshot['rows'][number] | null>((best, row) => !best || row.put < best.put ? row : best, null);
  return { rows, profile, flips, callWall: call?.strike ?? null, putWall: put?.strike ?? null,
    net: rows.reduce((n, r) => n + r.net, 0), excluded: rows.reduce((n, r) => n + r.missing, 0), contracts: usable.length,
    reportedZero: usable.filter(l => l.brokerGamma === 0).length,
    modelContracts: modeled.length, modelExcluded: rows.length * 2 - modeled.length,
    modeledNet: modelEnabled ? total(spot) : null,
    valuationTime: now === null ? null : new Date(now).toISOString(),
  };
}

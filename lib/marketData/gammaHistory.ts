import type { GammaSnapshot } from '../gammaExposure';
import { isNseRegularTradingTime } from './nseValuationTime';

export const GAMMA_HISTORY_VERSION = 2; // 2: missing IV filled (same strike, else from price)

export function gammaHistoryRecord(snapshot: GammaSnapshot) {
  const fetchedMs = Date.parse(snapshot.fetchedAt);
  const valuationMs = snapshot.valuationTime ? Date.parse(snapshot.valuationTime) : NaN;
  // A manual historical valuation must never be recorded as a live market observation.
  if (!isNseRegularTradingTime(fetchedMs) || !Number.isFinite(valuationMs)
      || valuationMs > fetchedMs || fetchedMs - valuationMs > 120000) return null;

  const minute = new Date(Math.floor(fetchedMs / 60000) * 60000).toISOString();
  const gammaFlip = snapshot.flips.reduce<number | null>((nearest, flip) =>
    nearest === null || Math.abs(flip - snapshot.spot) < Math.abs(nearest - snapshot.spot) ? flip : nearest, null);
  return {
    id: minute.slice(0, 16).replace(/[-:]/g, ''),
    data: {
      source: 'FYERS', calculationVersion: GAMMA_HISTORY_VERSION,
      minute, fetchedAt: snapshot.fetchedAt, valuationTime: snapshot.valuationTime,
      expiry: snapshot.expiry, spot: snapshot.spot,
      callWall: snapshot.callWall, putWall: snapshot.putWall, gammaFlip,
      flips: snapshot.flips, netGex: snapshot.net,
      modelCoverage: { modeled: snapshot.gammaSource.model, broker: snapshot.gammaSource.broker,
        unavailable: snapshot.excluded, total: snapshot.contracts + snapshot.excluded },
    },
  };
}

export async function storeGammaHistory(snapshot: GammaSnapshot): Promise<void> {
  const record = gammaHistoryRecord(snapshot);
  if (!record) return;
  const { adminDb } = await import('../firebaseAdmin');
  const ref = adminDb.collection('marketData').doc('NIFTY')
    .collection('expiries').doc(snapshot.expiry)
    .collection('snapshots').doc(record.id);
  try {
    await ref.create(record.data);
  } catch (error) {
    // A concurrent page load may have already written this expiry and minute.
    if ((error as { code?: number | string }).code !== 6
        && (error as { code?: number | string }).code !== 'already-exists') throw error;
  }
}

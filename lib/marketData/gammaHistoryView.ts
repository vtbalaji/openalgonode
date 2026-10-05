export interface GammaHistoryPoint {
  time: number;
  fetchedAt: string;
  spot: number;
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  netGex: number | null;
  excluded: number;
  total: number;
  calculationVersion: number;
}

export interface NiftyCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface GammaHistoryResponse {
  date: string;
  expiry: string;
  expiries: { value: string; label: string }[];
  snapshots: GammaHistoryPoint[];
  candles: NiftyCandle[];
  candleMessage: string | null;
}

export const istDate = (now = Date.now()) => new Date(now + 330 * 60000).toISOString().slice(0, 10);

export function historySession(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Invalid session date.');
  return {
    open: Date.parse(`${date}T09:15:00+05:30`) / 1000,
    close: Date.parse(`${date}T15:30:00+05:30`) / 1000,
  };
}

const price = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

export function historyPoints(records: Record<string, unknown>[], date: string): GammaHistoryPoint[] {
  const { open, close } = historySession(date);
  const points = new Map<number, GammaHistoryPoint>();
  for (const record of records) {
    const time = Date.parse(String(record.minute)) / 1000;
    const spot = price(record.spot);
    if (!Number.isInteger(time) || time < open || time >= close || spot === null) continue;
    const coverage = record.modelCoverage as { unavailable?: number; total?: number } | undefined;
    points.set(time, {
      time, fetchedAt: String(record.fetchedAt), spot,
      callWall: price(record.callWall), putWall: price(record.putWall), gammaFlip: price(record.gammaFlip),
      netGex: typeof record.netGex === 'number' && Number.isFinite(record.netGex) ? record.netGex : null,
      excluded: coverage?.unavailable ?? 0, total: coverage?.total ?? 0,
      calculationVersion: typeof record.calculationVersion === 'number' ? record.calculationVersion : 0,
    });
  }
  return [...points.values()].sort((a, b) => a.time - b.time);
}

export function niftyCandles(raw: unknown, date: string): NiftyCandle[] {
  const { open, close } = historySession(date);
  const candles = new Map<number, NiftyCandle>();
  if (!Array.isArray(raw)) return [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [time, o, h, l, c] = row;
    if (!Number.isInteger(time) || time < open || time >= close || [o, h, l, c].some(v => price(v) === null)
      || h < Math.max(o, c) || l > Math.min(o, c)) continue;
    // FYERS can return identical duplicate candles for the same minute.
    candles.set(time, { time, open: o, high: h, low: l, close: c });
  }
  return [...candles.values()].sort((a, b) => a.time - b.time);
}

// Split on unavailable levels or formula changes; never bridge those with a plausible-looking line.
export function levelSegments(points: GammaHistoryPoint[], field: 'callWall' | 'putWall' | 'gammaFlip' | 'spot') {
  const segments: { time: number; value: number }[][] = [];
  let current: { time: number; value: number }[] = [];
  let version: number | null = null;
  for (const point of points) {
    const value = point[field];
    if (value === null || (version !== null && point.calculationVersion !== version)) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (value !== null) current.push({ time: point.time, value });
    version = point.calculationVersion;
  }
  if (current.length) segments.push(current);
  return segments;
}

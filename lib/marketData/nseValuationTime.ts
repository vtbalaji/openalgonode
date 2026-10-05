// NSE F&O circular FAOP71777: https://nsearchives.nseindia.com/content/circulars/FAOP71777.pdf
// Review exchange amendments and special sessions before extending calendar coverage.
const holidays2026 = new Set([
  '2026-01-26', '2026-03-03', '2026-03-26', '2026-03-31',
  '2026-04-03', '2026-04-14', '2026-05-01', '2026-05-28',
  '2026-06-26', '2026-09-14', '2026-10-02', '2026-10-20',
  '2026-11-10', '2026-11-24', '2026-12-25',
]);
const IST_OFFSET = 330 * 60000;

export function isNseRegularTradingTime(now: number): boolean {
  if (!Number.isFinite(now)) return false;
  const local = new Date(now + IST_OFFSET);
  const date = local.toISOString().slice(0, 10);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return local.getUTCFullYear() === 2026 && date !== '2026-11-08'
    && isNseTradingDay(date) && minutes >= 555 && minutes < 930;
}

export function toIstInput(timestamp: string): string {
  return new Date(Date.parse(timestamp) + IST_OFFSET).toISOString().slice(0, 19);
}

export function defaultNseValuationTime(now = Date.now()): string | null {
  if (!Number.isFinite(now)) return null;
  const local = new Date(now + IST_OFFSET);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  for (let back = 0; back < 14; back++) {
    const date = local.toISOString().slice(0, 10);
    // No guessed year calendars or Muhurat hours. Manual valuation remains available.
    if (local.getUTCFullYear() !== 2026 || date === '2026-11-08') return null;
    const weekday = local.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays2026.has(date)) {
      if (back === 0 && minutes >= 555 && minutes < 930) return new Date(now).toISOString();
      if (back > 0 || minutes >= 930) return new Date(`${date}T15:30:00+05:30`).toISOString();
    }
    local.setUTCDate(local.getUTCDate() - 1);
  }
  return null;
}

const SESSION_OPEN = 555, SESSION_CLOSE = 930; // 09:15-15:30 IST, in minutes
export const TRADING_MINUTES_PER_YEAR = 252 * (SESSION_CLOSE - SESSION_OPEN);

// Outside the 2026 calendar, weekdays are assumed to be trading days.
export function isNseTradingDay(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays2026.has(date);
}

// Time to expiry in trading years: regular-session minutes only, so nights, weekends and holidays carry no time.
export function nseTradingYears(fromMs: number, toMs: number): number {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return 0;
  const day = new Date(fromMs + IST_OFFSET);
  day.setUTCHours(0, 0, 0, 0);
  let minutes = 0;
  for (let guard = 0; guard < 4000 && day.getTime() - IST_OFFSET < toMs; guard++) {
    const date = day.toISOString().slice(0, 10);
    if (isNseTradingDay(date)) {
      const open = day.getTime() - IST_OFFSET + SESSION_OPEN * 60000, close = day.getTime() - IST_OFFSET + SESSION_CLOSE * 60000;
      minutes += Math.max(0, Math.min(close, toMs) - Math.max(open, fromMs)) / 60000;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return minutes / TRADING_MINUTES_PER_YEAR;
}

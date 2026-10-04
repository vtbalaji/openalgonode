import { isNseTradingDay } from './nseValuationTime';

// Participants summarized as the hedging side for the positioning badge. Client is retail; DII index option OI is negligible.
export const HEDGER_PARTICIPANTS = ['Pro', 'FII'] as const;

export interface ParticipantPositioning {
  source: 'nse-participant-oi' | 'assumed';
  asOf: string | null;
  hedgers: string[];
  // Hedgers' net long contracts as a share of total index option OI; +1 = hedgers own all of it long.
  callWeight: number;
  putWeight: number;
}

export const ASSUMED_POSITIONING: ParticipantPositioning = { source: 'assumed', asOf: null, hedgers: [], callWeight: 1, putWeight: -1 };

const IST_OFFSET = 330 * 60000;
let cached: { until: number; value: ParticipantPositioning } | null = null;

export function parseParticipantOi(csv: string, asOf: string): ParticipantPositioning {
  const lines = csv.trim().split(/\r?\n/).map(l => l.split(',').map(c => c.trim().replace(/^"+|"+$/g, '')));
  const header = lines.find(l => l[0] === 'Client Type');
  if (!header) throw new Error('Unexpected NSE participant OI format.');
  const col = (name: string) => { const i = header.indexOf(name); if (i < 0) throw new Error(`Missing ${name} column.`); return i; };
  const [cl, pl, cs, ps] = ['Option Index Call Long', 'Option Index Put Long', 'Option Index Call Short', 'Option Index Put Short'].map(col);
  const row = (name: string) => { const r = lines.find(l => l[0] === name); if (!r) throw new Error(`Missing ${name} row.`); return r.map(Number); };
  const total = row('TOTAL');
  let callNet = 0, putNet = 0;
  for (const p of HEDGER_PARTICIPANTS) { const r = row(p); callNet += r[cl] - r[cs]; putNet += r[pl] - r[ps]; }
  const callWeight = callNet / total[cl], putWeight = putNet / total[pl];
  if (!Number.isFinite(callWeight) || !Number.isFinite(putWeight)) throw new Error('Invalid NSE participant OI values.');
  return { source: 'nse-participant-oi', asOf, hedgers: [...HEDGER_PARTICIPANTS], callWeight, putWeight };
}

// Latest published NSE participant-wise OI (previous sessions; published after market close).
export async function fetchParticipantPositioning(now = Date.now()): Promise<ParticipantPositioning> {
  if (cached && cached.until > now) return cached.value;
  // Optional context gets one shared budget, including response bodies and all earlier dates.
  const signal = AbortSignal.timeout(2000);
  const day = new Date(now + IST_OFFSET);
  for (let back = 0; back < 10; back++, day.setUTCDate(day.getUTCDate() - 1)) {
    if (signal.aborted) break;
    const date = day.toISOString().slice(0, 10);
    if (!isNseTradingDay(date)) continue;
    const [y, m, d] = date.split('-');
    try {
      const response = await fetch(`https://archives.nseindia.com/content/nsccl/fao_participant_oi_${d}${m}${y}.csv`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv' }, cache: 'no-store', signal,
      });
      const text = await response.text();
      if (!response.ok || !text.includes('Client Type')) continue;
      const value = parseParticipantOi(text, date);
      cached = { until: now + 30 * 60000, value };
      return value;
    } catch { continue; }
  }
  cached = { until: now + 5 * 60000, value: ASSUMED_POSITIONING };
  return ASSUMED_POSITIONING;
}

import type { GammaLeg } from '../gammaExposure';

interface FyersLeg { symbol: string; option_type: string; strike_price: number; ltp: number; oi: number; volume?: number; greeks?: { iv?: number; gamma?: number } }
// Verified FYERS OI is underlying quantity; divide by 65 only when displaying lots.
// Checked 2026-10-04 against NSE's 2026-10-06 expiry, strike 22400:
// CE: 54,828 lots * 65 = FYERS 3,563,820; PE: 65,164 * 65 = FYERS 4,235,660.
// Do not multiply raw oi by lot size again. Divisibility alone is not a unit check:
// at strike 22500, FYERS differed from screenshot lots * 65 by 5 units per side.
export const NIFTY_LOT_SIZE = 65;

interface FyersExpiry { expiry: string; date: string; expiry_flag?: string }

export async function fetchFyersGammaChain(authorization: string, expiry: string) {
  const params = new URLSearchParams({ symbol: 'NSE:NIFTY50-INDEX', strikecount: '50', greeks: '1' });
  if (expiry) params.set('timestamp', expiry);
  const response = await fetch(`https://api-t1.fyers.in/data/options-chain-v3?${params}`, {
    headers: { Authorization: authorization }, cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok || body.s !== 'ok') throw new Error('FYERS could not return the option chain. Check your broker authentication and try again.');
  const chain: FyersLeg[] = body.data?.optionsChain ?? [];
  const dates: FyersExpiry[] = body.data?.expiryData ?? [];
  const selected = dates.find(d => String(d.expiry) === expiry) ?? (!expiry ? dates[0] : undefined);
  const spot = chain.find(l => l.symbol === 'NSE:NIFTY50-INDEX')?.ltp;
  if (!selected || !spot) throw new Error('NIFTY spot or selected expiry is unavailable.');
  // Use the exchange closing time, since FYERS expiry tokens are selection IDs, not settlement times.
  const [day, month, year] = selected.date.split('-');
  const expiryMs = Date.parse(`${year}-${month}-${day}T15:30:00+05:30`);
  if (!Number.isFinite(expiryMs)) throw new Error('Invalid expiry returned by FYERS.');
  const legs: GammaLeg[] = chain.filter(l => l.option_type === 'CE' || l.option_type === 'PE').map(l => ({
    symbol: l.symbol, strike: l.strike_price, type: l.option_type === 'CE' ? 'call' : 'put',
    oiQuantity: l.oi, iv: (l.greeks?.iv ?? NaN) / 100, ltp: l.ltp,
    brokerGamma: l.greeks?.gamma,
    volume: l.volume,
  }));
  return { spot, legs, expiryMs, expiry: String(selected.expiry), expiries: dates.map(d => ({ value: String(d.expiry), label: `${d.date} (${d.expiry_flag ?? ''})` })) };
}

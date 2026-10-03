'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import type { GammaSnapshot } from '@/lib/gammaExposure';
import styles from './page.module.css';

const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const compact = (n: number) => `${n < 0 ? '-' : ''}${(Math.abs(n) / 1e7).toFixed(2)} Cr`;
const colors = { Call: '#0ca678', Put: '#e34566', Net: '#8b9991', 'Aggregate GEX': '#507ee7', 'Gamma Flip': '#ee8b34', 'Last Price': '#65758a' };

export default function GammaExposurePage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<GammaSnapshot | null>(null);
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const [pinnedStrike, setPinnedStrike] = useState<number | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({ Call: true, Put: true, Net: false, 'Aggregate GEX': true, 'Gamma Flip': true, 'Last Price': true });
  const controller = useRef<AbortController | null>(null);
  const container = useRef<HTMLElement>(null);
  const [chartWidth, setChartWidth] = useState(1000);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.min(1400, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const load = useCallback(async () => {
    if (!user) return;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError(''); setData(null); setHover(null); setPinnedStrike(null);
    try {
      const response = await fetch(`/api/options/gamma-exposure?expiry=${expiry}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, signal: current.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Unable to load NIFTY data.');
      if (!current.signal.aborted) setData(result);
    } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load data.'); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }, [user, expiry]);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);

  const mobile = chartWidth < 600;
  const W = chartWidth, H = mobile ? 380 : 470, L = mobile ? 55 : 105, R = W - (mobile ? 55 : 110), top = 65, bottom = H - 65, zero = (top + bottom) / 2;
  const axisLabel = (n: number) => mobile ? (n / 1e7).toFixed(1) : compact(n);
  const profile = data?.profile ?? [];
  const fullLo = profile[0]?.price ?? Math.min(data?.rows[0]?.strike ?? 0, (data?.spot ?? 1) * 0.98);
  const fullHi = profile[profile.length - 1]?.price ?? Math.max(data?.rows[data.rows.length - 1]?.strike ?? 1, (data?.spot ?? 1) * 1.02);
  const mid = (fullLo + fullHi) / 2, half = (fullHi - fullLo) / (2 * zoom);
  const lo = mid - half, hi = mid + half;
  const x = (price: number) => L + (price - lo) / (hi - lo) * (R - L);
  const rows = (data?.rows ?? []).filter(r => r.strike >= lo && r.strike <= hi);
  const barMax = Math.max(1, ...rows.flatMap(r => [r.call, -r.put, Math.abs(r.net)])) * 1.2;
  const lineMax = Math.max(1, ...profile.map(p => Math.abs(p.gex))) * 1.12;
  const y = (v: number, max = barMax) => zero - v / max * (bottom - top) / 2;
  const line = profile.map((p, i) => `${i ? 'L' : 'M'}${x(p.price)},${y(p.gex, lineMax)}`).join(' ');
  const width = Math.max(0.5, Math.min(8, (R - L) / Math.max(rows.length, 1) / 4));
  const flip = data?.flips.reduce<number | null>((a, b) => a === null || Math.abs(b - data.spot) < Math.abs(a - data.spot) ? b : a, null) ?? null;
  const hovered = hover === null ? null : rows[hover];
  const selected = data?.expiries.find(e => e.value === data.expiry);
  const detail = data?.rows.find(r => r.strike === pinnedStrike);
  const dismissDetail = () => setPinnedStrike(null);
  const quantity = (value: number | null) => value === null ? 'Unavailable' : number(value);

  return <main ref={container} className={styles.page}>
    <header className={styles.heading}><div><p>NIFTY 50 / NSE</p><h1>Gamma Exposure</h1></div><span className={styles.source}>FYERS · Snapshot</span></header>
    <div className={styles.toolbar}>
      <label>Expiry Date <select aria-label="Expiry date" value={expiry || data?.expiry || ''} onChange={e => { setExpiry(e.target.value); setZoom(1); }} disabled={busy || !data}>
        {!data && <option value={expiry}>{busy ? 'Loading expiries...' : 'Select expiry'}</option>}
        {data?.expiries.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
      </select></label>
      <div className={styles.tools}>
        <button onClick={() => void load()} disabled={busy || !user}>{busy ? 'Loading...' : 'Refresh'}</button>
        <button title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - 0.5))} disabled={zoom === 1}>-</button>
        <button title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z + 0.5))} disabled={zoom === 4}>+</button>
        <button onClick={() => setZoom(1)} disabled={zoom === 1}>Reset</button>
      </div>
    </div>
    {loading || busy ? <div className={styles.state} role="status">Loading NIFTY option chain...</div> : !user ? <div className={styles.state}><Link href="/login">Sign in to load your FYERS data</Link></div> : error ? <div className={styles.state} role="alert"><p>{error}</p><Link href="/broker/config">Broker Settings</Link></div> : data && <>
      <div className={styles.metrics}>
        {[["Last Price", number(data.spot)], ["FYERS Net GEX / 1%", compact(data.net)], ["Modeled Gamma Flip", !data.modelContracts ? 'Unavailable' : flip === null ? 'No crossing' : number(flip)], ["FYERS Call Wall", data.callWall ? number(data.callWall) : 'Unavailable'], ["FYERS Put Wall", data.putWall ? number(data.putWall) : 'Unavailable']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <div className={styles.coverage} role="status">
        <span>FYERS gamma: {data.contracts} legs / {data.excluded} unavailable / {data.reportedZero} reported zero</span>
        <span>Model IV: {data.modelContracts} legs / {data.modelExcluded} excluded</span>
        <span>Modeled net at spot: {data.modeledNet === null ? 'Unavailable' : `${compact(data.modeledNet)} / 1%`}</span>
      </div>
      <div className={styles.chart} onKeyDown={e => { if (e.key === 'Escape') dismissDetail(); }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`NIFTY gamma exposure for ${selected?.label}. Last price ${number(data.spot)}. Call wall ${data.callWall}, put wall ${data.putWall}.`}>
          <defs><clipPath id="gex-area"><rect x={L} y={top} width={R - L} height={bottom - top} /></clipPath></defs>
          <text x={mobile ? 0 : L} y={18} fill="#667085" fontSize="12">{mobile ? 'FYERS GEX' : 'FYERS Strike GEX (INR Cr / 1%)'}</text><text x={mobile ? W : R} y={18} textAnchor="end" fill="#667085" fontSize="12">{mobile ? 'Modeled GEX' : 'Modeled Aggregate GEX (INR Cr / 1%)'}</text>
          {mobile && <text x={W / 2} y={35} textAnchor="middle" fill="#667085" fontSize="11">INR Cr / 1%</text>}
          <g clipPath="url(#gex-area)">
            {profile.slice(0, -1).map((p, i) => <rect key={i} x={x(p.price)} y={top} width={x(profile[i + 1].price) - x(p.price) + 0.5} height={bottom - top} fill={p.gex >= 0 ? '#f1faf7' : '#fdf4f6'} />)}
          </g>
          {[-1, -0.5, 0, 0.5, 1].map(t => <g key={t}><line x1={L} x2={R} y1={y(t * barMax)} y2={y(t * barMax)} stroke={t === 0 ? '#9ca3af' : '#e7e9eb'} /><text x={L - 7} y={y(t * barMax) + 5} textAnchor="end" fontSize="11" fill="#697079">{axisLabel(t * barMax)}</text><text x={R + 7} y={y(t * barMax) + 5} fontSize="11" fill="#697079">{axisLabel(t * lineMax)}</text></g>)}
          <g clipPath="url(#gex-area)">
            {rows.map(r => <g key={r.strike}>{(['Call', 'Put', 'Net'] as const).map((name, i) => { const val = r[name.toLowerCase() as 'call' | 'put' | 'net']; return visible[name] && <rect key={name} x={x(r.strike) + (i - 1) * width} y={Math.min(zero, y(val))} width={width * 0.8} height={Math.abs(y(val) - zero)} fill={colors[name]} />; })}</g>)}
            {visible['Aggregate GEX'] && <path d={line} fill="none" stroke={colors['Aggregate GEX']} strokeWidth="2" />}
            {visible['Gamma Flip'] && data.flips.map(f => <line key={f} x1={x(f)} x2={x(f)} y1={top} y2={bottom} stroke={colors['Gamma Flip']} strokeWidth="1.5" />)}
            {visible['Last Price'] && <line x1={x(data.spot)} x2={x(data.spot)} y1={top} y2={bottom} stroke={colors['Last Price']} strokeDasharray="6 5" />}
            {detail && <g pointerEvents="none"><line x1={x(detail.strike)} x2={x(detail.strike)} y1={top} y2={bottom} stroke="#364152" strokeDasharray="3 4" />{visible['Aggregate GEX'] && detail.modeledGex !== null && <circle cx={x(detail.strike)} cy={y(detail.modeledGex, lineMax)} r="5" fill={colors['Aggregate GEX']} stroke="white" strokeWidth="2" />}</g>}
          </g>
          {visible['Last Price'] && data.spot >= lo && data.spot <= hi && <text x={x(data.spot)} y={top - 10} textAnchor="middle" fill={colors['Last Price']} fontSize="14">{number(data.spot)}</text>}
          {!mobile && [[data.callWall, 'Call Wall', colors.Call], [data.putWall, 'Put Wall', colors.Put]].map(([strike, label, color]) => {
            const r = rows.find(row => row.strike === strike); if (!r) return null;
            const call = label === 'Call Wall';
            return <text key={label} x={Math.max(L + 75, Math.min(R - 75, x(Number(strike))))} y={y(call ? r.call : r.put) + (call ? -12 : 24)} textAnchor="middle" fontSize="14" fill={String(color)}>{label} {number(Number(strike))}</text>;
          })}
          {Array.from({ length: mobile ? 3 : 7 }, (_, i) => lo + (hi - lo) * i / (mobile ? 2 : 6)).map(p => <text key={p} x={x(p)} y={bottom + 27} textAnchor="middle" fontSize="12" fill="#697079">{Math.round(p).toLocaleString('en-IN')}</text>)}
          <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="#697079">Strike / Hypothetical NIFTY Price</text>
          <rect x={L} y={top} width={R - L} height={bottom - top} fill="transparent" style={{ touchAction: 'pan-y' }} onPointerMove={e => {
            const bounds = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const price = lo + ((e.clientX - bounds.left) * W / bounds.width - L) / (R - L) * (hi - lo);
            if (rows.length) setHover(rows.reduce((best, row, i) => Math.abs(row.strike - price) < Math.abs(rows[best].strike - price) ? i : best, 0));
          }} onClick={e => {
            const bounds = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const price = lo + ((e.clientX - bounds.left) * W / bounds.width - L) / (R - L) * (hi - lo);
            if (rows.length) {
              const index = rows.reduce((best, row, i) => Math.abs(row.strike - price) < Math.abs(rows[best].strike - price) ? i : best, 0);
              setHover(index); setPinnedStrike(rows[index].strike);
            }
          }} onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }} />
        </svg>
        {detail && <section className={styles.strikePanel} style={mobile ? undefined : { left: detail.strike < mid ? 'auto' : 16, right: detail.strike < mid ? 16 : 'auto' }} aria-label={`Strike ${number(detail.strike)} details`}>
          <header><strong>Strike: {number(detail.strike)}</strong><button type="button" aria-label="Close strike details" title="Close strike details" onClick={dismissDetail}>×</button></header>
          <p>{selected?.label}</p>
          <dl>
            <div><dt>FYERS net GEX</dt><dd>{compact(detail.net)} / 1%</dd></div>
            <div><dt>Modeled aggregate GEX</dt><dd>{detail.modeledGex === null ? 'Unavailable' : `${compact(detail.modeledGex)} / 1%`}</dd></div>
            <div><dt>Call OI (units)</dt><dd>{quantity(detail.callOi)}</dd></div>
            <div><dt>Put OI (units)</dt><dd>{quantity(detail.putOi)}</dd></div>
            <div><dt>Call volume (units)</dt><dd>{quantity(detail.callVolume)}</dd></div>
            <div><dt>Put volume (units)</dt><dd>{quantity(detail.putVolume)}</dd></div>
          </dl>
          {(detail.missing > 0 || detail.reportedZero > 0) && <p>{detail.missing} unavailable legs · {detail.reportedZero} reported-zero gamma</p>}
          <p>Model at NIFTY {number(detail.strike)} · {data.modelExcluded} legs excluded</p>
        </section>}
      </div>
      <label className={styles.strikeSelect}>Strike details <select aria-label="Strike details" value={pinnedStrike ?? ''} onChange={e => setPinnedStrike(e.target.value ? Number(e.target.value) : null)}><option value="">Select strike</option>{data.rows.map(r => <option key={r.strike} value={r.strike}>{number(r.strike)}</option>)}</select></label>
      <div className={styles.readout} aria-live="polite">{hovered ? `${number(hovered.strike)} | Call ${compact(hovered.call)} | Put ${compact(hovered.put)} | Net ${compact(hovered.net)} | ${hovered.missing} unavailable / ${hovered.reportedZero} reported zero` : `${selected?.label} | Snapshot bars: FYERS gamma | Curve: modeled gamma`}</div>
      <div className={styles.legend}>{Object.entries(colors).map(([name, color]) => <label key={name}><input type="checkbox" checked={visible[name]} onChange={e => setVisible(v => ({ ...v, [name]: e.target.checked }))} style={{ accentColor: color }} /><span style={{ color }}>{name === 'Aggregate GEX' || name === 'Gamma Flip' ? `Modeled ${name}` : name}</span></label>)}</div>
      <section className={styles.gammaNotes} aria-label="Gamma interpretation">
        <div><span className={styles.positiveSwatch} aria-hidden="true" /><p><strong>Positive Gamma:</strong> Green shading marks prices where modeled aggregate GEX is positive. If hedgers are net long gamma and rebalance to stay delta-neutral, they tend to buy as prices fall and sell as prices rise, which can dampen price swings.</p></div>
        <div><span className={styles.negativeSwatch} aria-hidden="true" /><p><strong>Negative Gamma:</strong> Red shading marks prices where modeled aggregate GEX is negative. If hedgers are net short gamma and rebalance to stay delta-neutral, they tend to sell as prices fall and buy as prices rise, which can amplify moves in either direction.</p></div>
        <p className={styles.gammaCaveat}>Gamma flips are zero crossings of the modeled curve. Positive gamma is not necessarily above a flip, and multiple flips can occur. This OI-based estimate does not identify actual dealer positions or guarantee support, resistance, or price direction.</p>
      </section>
      <footer className={styles.footer}><span>Fetched {new Date(data.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span><span>Exchange quote time unavailable</span></footer>
      <details className={styles.details}><summary>Model &amp; Data Coverage</summary><p>Estimated exposure per 1% NIFTY move, in INR crores. Calls positive, puts negative; actual dealer positioning is unknown. Bars, snapshot net and walls use FYERS-reported gamma directly. Unavailable gamma or OI is omitted, with no model fallback. Reported zero gamma is preserved but may represent rounding or unavailable broker calculations; it does not establish an absence of exposure.</p><p>The curve and flip use a separate Black-Scholes model with positive FYERS IV, a 7% rate, zero dividend yield, and current time to expiry at 15:30 IST. IV and OI stay fixed across hypothetical prices. Invalid IV is excluded from this model only. The modeled net at spot may differ from the broker-gamma net. Missing IV can materially change the curve and flip.</p><p>FYERS OI is underlying quantity, without an additional lot multiplier. Maximum coverage is 50 strikes either side of ATM for the selected expiry. Walls are the largest reported call and put gamma exposures in this range, not guaranteed price barriers. All detected model zero crossings are marked; the summary shows the nearest. Broker prices and Greeks may be from a previous session; exchange quote time is unavailable.</p></details>
      <details className={styles.details}><summary>Strike Data</summary><div className={styles.tableWrap}><table><thead><tr><th>Strike</th><th>Call GEX (Cr)</th><th>Put GEX (Cr)</th><th>Net GEX (Cr)</th><th>Coverage</th></tr></thead><tbody>{data.rows.map(r => <tr key={r.strike}><td>{number(r.strike)}</td><td>{compact(r.call)}</td><td>{compact(r.put)}</td><td>{compact(r.net)}</td><td>{r.missing ? `${r.missing} unavailable; partial` : r.reportedZero ? `${r.reportedZero} reported zero` : 'Available'}</td></tr>)}</tbody></table></div></details>
    </>}
  </main>;
}

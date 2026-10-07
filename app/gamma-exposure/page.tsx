'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import type { GammaSnapshot } from '@/lib/gammaExposure';
import { defaultNseValuationTime, toIstInput } from '@/lib/marketData/nseValuationTime';
import styles from './page.module.css';

const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const roundedPrice = (n: number) => Math.round(n).toLocaleString('en-IN');
const compact = (n: number) => `${n < 0 ? '-' : ''}${(Math.abs(n) / 1e7).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
const rowExposure = (row: GammaSnapshot['rows'][number], side: 'call' | 'put' | 'net') =>
  (side === 'net' ? row.missing > 0 : !row[side === 'call' ? 'callAvailable' : 'putAvailable']) ? 'Unavailable' : compact(row[side]);
const colors = { Call: '#0ca678', Put: '#e34566', Net: '#8b9991', 'Aggregate GEX': '#507ee7', 'Gamma Flip': '#ee8b34', 'Last Price': '#65758a' };

function ExpiryPicker({ options, value, disabled, placeholder, onChange }: { options: GammaSnapshot['expiries']; value: string; disabled: boolean; placeholder: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = options.find(o => o.value === value);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const show = () => { setActive(Math.max(0, options.findIndex(o => o.value === value))); setOpen(true); };
  const choose = (i: number) => { onChange(options[i].value); setOpen(false); button.current?.focus(); };
  return <div ref={root} className={styles.picker} onKeyDown={e => {
    if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); button.current?.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) show(); else setActive(a => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); }
    else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); choose(active); }
    else if (e.key === 'Tab') setOpen(false);
  }}>
    <button ref={button} type="button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby="expiry-label expiry-value" disabled={disabled} onClick={() => open ? setOpen(false) : show()}>
      <span id="expiry-value">{current?.label ?? placeholder}</span><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <ul role="listbox" aria-labelledby="expiry-label" aria-activedescendant={`expiry-${active}`}>
      {options.map((o, i) => <li key={o.value} id={`expiry-${i}`} role="option" aria-selected={o.value === value} data-active={i === active || undefined} onPointerEnter={() => setActive(i)} onClick={() => choose(i)}>{o.label}</li>)}
    </ul>}
  </div>;
}

export default function GammaExposurePage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<GammaSnapshot | null>(null);
  const [expiry, setExpiry] = useState('');
  const [valuationDraft, setValuationDraft] = useState('');
  const [valuation, setValuation] = useState('');
  const [automaticValuation, setAutomaticValuation] = useState(true);
  const [expiries, setExpiries] = useState<GammaSnapshot['expiries']>([]);
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
      const params = new URLSearchParams({ expiry });
      const effectiveValuation = automaticValuation ? defaultNseValuationTime() : valuation;
      if (effectiveValuation) params.set('valuation', effectiveValuation);
      const response = await fetch(`/api/options/gamma-exposure?${params}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, signal: current.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Unable to load NIFTY data.');
      if (!current.signal.aborted) {
        setData(result); setExpiries(result.expiries);
        if (automaticValuation) setValuationDraft(result.valuationTime ? toIstInput(result.valuationTime) : '');
      }
    } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load data.'); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }, [user, expiry, valuation, automaticValuation]);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);

  const mobile = chartWidth < 600;
  const W = chartWidth, H = mobile ? 380 : 470, L = mobile ? 55 : 105, R = W - (mobile ? 55 : 110), top = 65, bottom = H - 65, zero = (top + bottom) / 2;
  const axisLabel = (n: number) => `${Math.round(n / 1e7).toLocaleString('en-IN')}${mobile ? '' : ' Cr'}`;
  const profile = data?.profile ?? [];
  const strikesPerSide = mobile ? 10 : 15;
  const allRows = data?.rows ?? [];
  const spot = data?.spot ?? 0;
  // Limit only rendering; the server's full-chain totals, walls and profile remain intact.
  const nearbyRows = [
    ...allRows.filter(r => r.strike < spot).slice(-strikesPerSide),
    ...allRows.filter(r => r.strike >= spot).slice(0, strikesPerSide),
  ];
  const padding = nearbyRows.length > 1 ? (nearbyRows[1].strike - nearbyRows[0].strike) / 2 : 25;
  const firstStrike = Math.min(nearbyRows[0]?.strike ?? spot, data?.putWall ?? spot);
  const lastStrike = Math.max(nearbyRows[nearbyRows.length - 1]?.strike ?? spot, data?.callWall ?? spot);
  const displayRows = allRows.filter(r => r.strike >= firstStrike && r.strike <= lastStrike);
  const fullLo = firstStrike - padding;
  const fullHi = lastStrike + padding;
  const mid = (fullLo + fullHi) / 2, half = (fullHi - fullLo) / (2 * zoom);
  const lo = Math.min(mid - half, (data?.putWall ?? spot) - padding);
  const hi = Math.max(mid + half, (data?.callWall ?? spot) + padding);
  const x = (price: number) => L + (price - lo) / (hi - lo) * (R - L);
  const rows = displayRows.filter(r => r.strike >= lo && r.strike <= hi);
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
  const spotGex = profile.length ? profile.reduce((a, b) => Math.abs(b.price - spot) < Math.abs(a.price - spot) ? b : a).gex : null;
  const quantity = (value: number | null) => value === null ? 'Unavailable' : number(value);

  const valuationForm = (
    <form className={styles.valuation} onSubmit={e => {
      e.preventDefault();
      const timestamp = Date.parse(`${valuationDraft}+05:30`);
      if (Number.isFinite(timestamp)) { setValuation(new Date(timestamp).toISOString()); setAutomaticValuation(false); }
    }}>
      <label><span>Valuation mode</span><select aria-label="Valuation mode" value={automaticValuation ? 'automatic' : 'manual'} onChange={e => {
        if (e.target.value === 'automatic') setAutomaticValuation(true);
        else { setValuation(data?.valuationTime ?? ''); setAutomaticValuation(false); }
      }}><option value="automatic">Automatic (NSE session)</option><option value="manual">Manual</option></select></label>
      <label>Model valuation (IST)<input aria-label="Model valuation (IST)" type="datetime-local" step="1" required value={valuationDraft} onChange={e => setValuationDraft(e.target.value)} /></label>
      <button disabled={busy || !valuationDraft}>Apply</button>
      <button type="button" disabled={busy || (!valuation && !automaticValuation)} onClick={() => { setAutomaticValuation(false); setValuation(''); setValuationDraft(''); }}>Clear</button>
    </form>
  );
  return <main ref={container} className={styles.page}>
    <header className={styles.heading}><h1>Gamma Exposure</h1><span className={styles.source}>NIFTY 50 · NSE · FYERS snapshot</span></header>
    <nav className={styles.viewTabs} aria-label="Gamma view"><Link href="/gamma-exposure" aria-current="page">Snapshot</Link><Link href="/gamma-exposure/history">History</Link></nav>
    <div className={styles.toolbar}>
      <div className={styles.expiryField}><span id="expiry-label">Expiry Date</span><ExpiryPicker
        options={expiries} value={expiry || data?.expiry || ''} disabled={busy || !expiries.length}
        placeholder={busy ? 'Loading expiries...' : 'Select expiry'}
        onChange={v => { setExpiry(v); setZoom(1); }} /></div>
      <div className={styles.tools}>
        <button className={styles.primary} onClick={() => void load()} disabled={busy || !user}>{busy ? 'Loading...' : 'Refresh'}</button>
        <div className={styles.zoom} role="group" aria-label="Chart zoom">
          <button title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - 0.5))} disabled={!data || zoom === 1}>&minus;</button>
          <output aria-label="Zoom level">{zoom.toFixed(1)}×</output>
          <button title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z + 0.5))} disabled={!data || zoom === 4}>+</button>
        </div>
        <button onClick={() => setZoom(1)} disabled={!data || zoom === 1}>Reset</button>
      </div>
    </div>
    {loading || busy ? <div className={styles.state} role="status">Loading NIFTY option chain...</div> : !user ? <div className={styles.state}><Link href="/login">Sign in to load your FYERS data</Link></div> : error ? <div className={styles.state} role="alert"><p>{error}</p><Link href="/broker/config">Broker Settings</Link></div> : data && <>
      <div className={styles.metrics}>
        {[["Last Price", roundedPrice(data.spot)], [data.excluded ? "Partial Net GEX / 1%" : "Net GEX / 1%", compact(data.net)], ["Gamma Flip", !data.valuationTime ? 'Time required' : data.modeledNet === null ? 'Unavailable' : flip === null ? 'No crossing in range' : roundedPrice(flip)], ["Put Wall", data.putWall ? number(data.putWall) : 'Unavailable'], ["Call Wall", data.callWall ? number(data.callWall) : 'Unavailable']].map(([label, value]) => <div key={label} className={label === 'Last Price' && spotGex !== null ? (spotGex >= 0 ? styles.positiveZone : styles.negativeZone) : undefined}><span>{label}</span><strong>{value}</strong>{label === 'Last Price' && spotGex !== null && <em>{spotGex >= 0 ? 'Positive' : 'Negative'} modeled gamma</em>}</div>)}
      </div>
      
      <div className={styles.legend}>{Object.entries(colors).map(([name, color]) => <label key={name}><input type="checkbox" checked={visible[name]} onChange={e => setVisible(v => ({ ...v, [name]: e.target.checked }))} style={{ accentColor: color }} /><span style={{ color }}>{name === 'Aggregate GEX' || name === 'Gamma Flip' ? `Modeled ${name}` : name}</span></label>)}</div>
      <div className={styles.chart} onKeyDown={e => { if (e.key === 'Escape') dismissDetail(); }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`NIFTY gamma exposure for ${selected?.label}. Last price ${roundedPrice(data.spot)}. Call wall ${data.callWall}, put wall ${data.putWall}.`}>
          <defs><clipPath id="gex-area"><rect x={L} y={top} width={R - L} height={bottom - top} /></clipPath></defs>
          <text x={mobile ? 0 : L} y={18} fill="#667085" fontSize="12">{mobile ? 'Strike GEX' : 'Strike GEX (INR Cr / 1%)'}</text><text x={mobile ? W : R} y={18} textAnchor="end" fill="#667085" fontSize="12">{mobile ? 'Modeled GEX' : 'Modeled Aggregate GEX (INR Cr / 1%)'}</text>
          {mobile && <text x={W / 2} y={35} textAnchor="middle" fill="#667085" fontSize="11">INR Cr / 1%</text>}
          <g clipPath="url(#gex-area)">
            {profile.slice(0, -1).map((p, i) => <rect key={i} x={x(p.price)} y={top} width={x(profile[i + 1].price) - x(p.price) + 0.5} height={bottom - top} fill={p.gex >= 0 ? '#f1faf7' : '#fdf4f6'} />)}
          </g>
          {[-1, -0.5, 0, 0.5, 1].map(t => <g key={t}><line x1={L} x2={R} y1={y(t * barMax)} y2={y(t * barMax)} stroke={t === 0 ? '#9ca3af' : '#e7e9eb'} /><text x={L - 7} y={y(t * barMax) + 5} textAnchor="end" fontSize="11" fill="#697079">{axisLabel(t * barMax)}</text><text x={R + 7} y={y(t * barMax) + 5} fontSize="11" fill="#697079">{axisLabel(t * lineMax)}</text></g>)}
          <g clipPath="url(#gex-area)">
            {rows.map(r => <g key={r.strike}>{(['Call', 'Put', 'Net'] as const).map((name, i) => { const side = name.toLowerCase() as 'call' | 'put' | 'net'; const val = r[side]; return visible[name] && rowExposure(r, side) !== 'Unavailable' && <rect key={name} x={x(r.strike) + (i - 1) * width} y={Math.min(zero, y(val))} width={width * 0.8} height={Math.abs(y(val) - zero)} fill={colors[name]} />; })}</g>)}
            {visible['Aggregate GEX'] && <path d={line} fill="none" stroke={colors['Aggregate GEX']} strokeWidth="2" />}
            {visible['Gamma Flip'] && data.flips.map(f => <line key={f} x1={x(f)} x2={x(f)} y1={top} y2={bottom} stroke={colors['Gamma Flip']} strokeWidth="1.5" />)}
            {visible['Last Price'] && <line x1={x(data.spot)} x2={x(data.spot)} y1={top} y2={bottom} stroke={colors['Last Price']} strokeDasharray="6 5" />}
            {(['Call', 'Put'] as const).map(name => {
              const side = name === 'Call' ? 'call' : 'put';
              const wall = name === 'Call' ? data.callWall : data.putWall;
              const row = rows.find(r => r.strike === wall);
              if (!visible[name] || !row || rowExposure(row, side) === 'Unavailable') return null;
              return <circle key={`${side}-wall`} cx={x(row.strike) + (name === 'Call' ? -0.6 : 0.4) * width}
                cy={y(row[side])} r={Math.max(2.5, width * 0.4 + 1.5)} fill={colors[name]}
                stroke="white" strokeWidth="1.5" pointerEvents="none" aria-hidden="true" />;
            })}
            {detail && <g pointerEvents="none"><line x1={x(detail.strike)} x2={x(detail.strike)} y1={top} y2={bottom} stroke="#364152" strokeDasharray="3 4" />{visible['Aggregate GEX'] && detail.modeledGex !== null && <circle cx={x(detail.strike)} cy={y(detail.modeledGex, lineMax)} r="5" fill={colors['Aggregate GEX']} stroke="white" strokeWidth="2" />}</g>}
          </g>
          {visible['Last Price'] && data.spot >= lo && data.spot <= hi && <text x={x(data.spot)} y={top - 10} textAnchor="middle" fill={colors['Last Price']} fontSize="14">{roundedPrice(data.spot)}</text>}
          {[[data.putWall, 'Put Wall', colors.Put], [data.callWall, 'Call Wall', colors.Call]].map(([strike, label, color]) => {
            const r = rows.find(row => row.strike === strike); if (!r) return null;
            const call = label === 'Call Wall';
            return <text key={label} x={mobile ? (call ? R : L) : Math.max(L + 75, Math.min(R - 75, x(Number(strike))))} y={y(call ? r.call : r.put) + (call ? -12 : 24)} textAnchor={mobile ? (call ? 'end' : 'start') : 'middle'} fontSize={mobile ? '11' : '14'} fill={String(color)}>{label} {number(Number(strike))}</text>;
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
            <div><dt>Net GEX / 1%</dt><dd>{rowExposure(detail, 'net')}</dd></div>
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
      <div className={styles.inspect}>
      <label className={styles.strikeSelect}>Strike details <select aria-label="Strike details" value={pinnedStrike ?? ''} onChange={e => setPinnedStrike(e.target.value ? Number(e.target.value) : null)}><option value="">Select strike</option>{data.rows.map(r => <option key={r.strike} value={r.strike}>{number(r.strike)}</option>)}</select></label>
      <div className={styles.readout} aria-live="polite">{hovered ? `${number(hovered.strike)} | Call ${rowExposure(hovered, 'call')} | Put ${rowExposure(hovered, 'put')} | Net ${rowExposure(hovered, 'net')} | ${hovered.missing} unavailable / ${hovered.reportedZero} reported zero` : `${selected?.label} | ${data.gammaSource.model ? 'Bars and curve: Black-Scholes gamma' : 'Bars: FYERS gamma; curve unavailable'}`}</div>
      </div>
      {valuationForm}
      <details className={styles.coverage}><summary>Data &amp; model details</summary>
        <span>Gamma: {data.gammaSource.model} Black-Scholes / {data.gammaSource.broker} FYERS fallback / {data.excluded} unavailable{data.reportedZero ? ` / ${data.reportedZero} reported zero` : ''}</span>
        <span>Model IV: {data.modelContracts} legs / {data.modelExcluded} excluded</span>
        {data.ivSource && <span>IV source: {data.ivSource.broker} FYERS / {data.ivSource.sameStrike} same-strike / {data.ivSource.fromPrice} solved from price</span>}
        <span>Carry: {data.carry.source === 'put-call-parity' ? `forward ${number(data.carry.forward!)} from put-call parity, rate ${(data.carry.rate * 100).toFixed(2)}% with ${(data.carry.dividendYield * 100).toFixed(1)}% dividend yield` : `default rate ${(data.carry.rate * 100).toFixed(1)}%, dividend yield ${(data.carry.dividendYield * 100).toFixed(1)}% (forward unavailable)`}</span>
        <span>FYERS-gamma cross-check: {data.brokerNet === null ? 'Unavailable' : `${compact(data.brokerNet)} / 1%`}</span>
        <span>{data.positioning.source === 'nse-participant-oi' ? `${data.positioning.hedgers.join(' + ')} (NSE ${data.positioning.asOf}): net ${data.positioning.callWeight >= 0 ? 'long' : 'short'} calls ${(Math.abs(data.positioning.callWeight) * 100).toFixed(1)}%, net ${data.positioning.putWeight >= 0 ? 'long' : 'short'} puts ${(Math.abs(data.positioning.putWeight) * 100).toFixed(1)}% of index option OI` : 'NSE participant OI unavailable'}</span>
        <span>Modeled net at spot: {data.modeledNet === null ? 'Unavailable' : `${compact(data.modeledNet)} / 1%`}</span>
        <span>Valuation: {data.valuationTime ? `${new Date(data.valuationTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST (${automaticValuation ? 'NSE session default' : 'manual'})` : automaticValuation ? 'Calendar unavailable; set a manual time' : 'Not set'}</span>
        <span>Time to expiry: {data.timeToExpiryYears === null ? 'Unavailable' : `${(data.timeToExpiryYears * 365).toFixed(2)} calendar days`}. Selected time changes only time to expiry; OI and IV remain the fetched snapshot.</span>
      </details>
      <section className={styles.gammaNotes} aria-label="Gamma interpretation">
        <div><span className={styles.positiveSwatch} aria-hidden="true" /><p><strong>Positive Gamma:</strong> Green shading marks prices where modeled aggregate GEX is positive. If hedgers are net long gamma and rebalance to stay delta-neutral, they tend to buy as prices fall and sell as prices rise, which can dampen price swings.</p></div>
        <div><span className={styles.negativeSwatch} aria-hidden="true" /><p><strong>Negative Gamma:</strong> Red shading marks prices where modeled aggregate GEX is negative. If hedgers are net short gamma and rebalance to stay delta-neutral, they tend to sell as prices fall and buy as prices rise, which can amplify moves in either direction.</p></div>
        <p className={styles.gammaCaveat}>Gamma flips are zero crossings of the modeled curve. Positive gamma is not necessarily above a flip, and multiple flips can occur. This OI-based estimate does not identify actual dealer positions or guarantee support, resistance, or price direction.</p>
      </section>
      <footer className={styles.footer}><span>Fetched {new Date(data.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span><span>Exchange quote time unavailable</span></footer>
      <details className={styles.details}><summary>Model &amp; Data Coverage</summary><p>Estimated hedger gamma exposure per 1% NIFTY move, in INR crores: gamma x OI x spot&sup2; x 1%. Calls positive, puts negative (dealers assumed long calls, short puts); actual dealer positioning is unknown. The Pro + FII line shows their net long or short share of NSE index option OI from the latest participant-wise OI report (previous session, all index options and expiries combined) for context only; it is not applied to the chart.</p><p>Gamma for bars, walls, the curve and the flip uses Black-Scholes-Merton with per-strike FYERS IV and a 1.2% NIFTY dividend yield. The rate is set so the model forward matches the forward implied by put-call parity (median of the three strikes nearest spot); if quotes are missing or implausible, a 6% rate is used instead. When the model is active, legs without valid IV are excluded from both bars and curve. A broker-only snapshot is used if no valuation time or no usable IV is available; it has no curve or flip. The separate FYERS cross-check includes all usable broker-gamma legs, so its coverage may differ. Time to expiry uses elapsed calendar time to 15:30 IST on expiry, over 365 days a year. Automatic mode uses current IST during regular trading hours, otherwise the latest scheduled regular-session close. Selecting an earlier time does not fetch historical OI or IV. IV and OI stay fixed across hypothetical prices. Missing IV can materially change the curve and flip.</p><p>FYERS OI is already underlying quantity and is not multiplied by 65. One NIFTY lot is 65 units. Maximum coverage is 50 strikes either side of ATM for the selected expiry. The call wall is the largest call gamma exposure magnitude strictly above spot; the put wall is the largest put gamma exposure magnitude strictly below spot, within the fetched range. These are not guaranteed price barriers. All detected model zero crossings are marked; the summary shows the nearest. Broker prices and Greeks may be from a previous session; exchange quote time is unavailable.</p></details>
      <details className={styles.details}><summary>Strike Data</summary><div className={styles.tableWrap}><table><thead><tr><th>Strike</th><th>Call GEX (Cr)</th><th>Put GEX (Cr)</th><th>Net GEX (Cr)</th><th>Coverage</th></tr></thead><tbody>{data.rows.map(r => <tr key={r.strike}><td>{number(r.strike)}</td><td>{rowExposure(r, 'call')}</td><td>{rowExposure(r, 'put')}</td><td>{rowExposure(r, 'net')}</td><td>{r.missing ? `${r.missing} unavailable; partial` : r.reportedZero ? `${r.reportedZero} reported zero` : 'Available'}</td></tr>)}</tbody></table></div></details>
    </>}
    {!data && !loading && !busy && valuationForm}
  </main>;
}

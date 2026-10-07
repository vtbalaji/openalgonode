'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ColorType, CrosshairMode, LineStyle, LineType, createChart, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts';
import { useAuth } from '@/lib/AuthContext';
import { istDate, levelSegments, type GammaHistoryResponse } from '@/lib/marketData/gammaHistoryView';
import { isNseRegularTradingTime } from '@/lib/marketData/nseValuationTime';
import pageStyles from '../page.module.css';
import styles from './page.module.css';

const colors = { price: '#b4c0ce', callWall: '#40ca84', putWall: '#ff6378', gammaFlip: '#e6cd56' };
type Layer = keyof typeof colors;
const labels: Record<Layer, string> = { price: 'NIFTY price', callWall: 'Call Wall', putWall: 'Put Wall', gammaFlip: 'Gamma Flip' };
const formatPrice = (n: number | null | undefined) => n == null ? '\u2014' : Math.round(n).toLocaleString('en-IN');
const formatTime = (time: number) => new Date(time * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const timeLabel = (time: Time) => typeof time === 'number' ? formatTime(time) : '';

function HistoryChart({ data, visible, onTime }: {
  data: GammaHistoryResponse; visible: Record<Layer, boolean>; onTime: (time: number | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const layers = useRef<{ key: Layer; series: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'> }[]>([]);
  const visibility = useRef(visible);
  useEffect(() => { visibility.current = visible; }, [visible]);
  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    const chart = createChart(host, {
      width: host.clientWidth, height: host.clientHeight,
      layout: { background: { type: ColorType.Solid, color: '#111518' }, textColor: '#aab4bd', fontSize: 12 },
      grid: { vertLines: { color: '#252c31' }, horzLines: { color: '#252c31' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#343d45', scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: '#343d45', timeVisible: true, secondsVisible: false, minBarSpacing: 0.5, tickMarkFormatter: timeLabel },
      localization: { timeFormatter: timeLabel, priceFormatter: formatPrice },
      handleScroll: { vertTouchDrag: false },
    });
    chartRef.current = chart;
    layers.current = [];
    const priceFormat = { type: 'price' as const, precision: 0, minMove: 1 };
    if (data.candles.length) {
      const series = chart.addCandlestickSeries({
        upColor: '#c3cbd1', downColor: '#ef9364', borderVisible: false,
        wickUpColor: '#c3cbd1', wickDownColor: '#ef9364', priceFormat,
        priceLineVisible: false, visible: visibility.current.price,
      });
      series.setData(data.candles.map(c => ({ ...c, time: c.time as UTCTimestamp })));
      layers.current.push({ key: 'price', series });
    }
    const keys: Layer[] = data.candles.length ? ['callWall', 'putWall', 'gammaFlip'] : ['price', 'callWall', 'putWall', 'gammaFlip'];
    for (const key of keys) {
      const segments = levelSegments(data.snapshots, key === 'price' ? 'spot' : key);
      for (const [index, segment] of segments.entries()) {
        const series = chart.addLineSeries({
          color: colors[key], lineWidth: 2, lineStyle: LineStyle.Dashed,
          lineType: key === 'callWall' || key === 'putWall' ? LineType.WithSteps : LineType.Simple,
          priceFormat, priceLineVisible: false, lastValueVisible: index === segments.length - 1,
          visible: visibility.current[key], crosshairMarkerRadius: 4,
        });
        series.setData(segment.map(p => ({ ...p, time: p.time as UTCTimestamp })));
        series.setMarkers(segment.map(p => ({ time: p.time as UTCTimestamp, position: 'inBar', shape: 'circle', color: colors[key], size: 0.5 })));
        layers.current.push({ key, series });
      }
    }
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove(event => onTime(typeof event.time === 'number' ? event.time : null));
    const resize = new ResizeObserver(() => chart.resize(host.clientWidth, host.clientHeight));
    resize.observe(host);
    return () => { resize.disconnect(); chart.remove(); chartRef.current = null; layers.current = []; };
  }, [data, onTime]);
  useEffect(() => {
    for (const { key, series } of layers.current) series.applyOptions({ visible: visible[key] });
  }, [visible]);
  const zoom = (factor: number) => {
    const scale = chartRef.current?.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (!range || !scale) return;
    const mid = (range.from + range.to) / 2, half = Math.max(5, (range.to - range.from) * factor / 2);
    scale.setVisibleLogicalRange({ from: mid - half, to: mid + half });
  };
  return <>
    <div className={styles.chartTools} role="group" aria-label="History chart zoom">
      <span>{data.candles.length ? '1 minute candles' : 'Saved spot observations'} · IST</span>
      <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoom(1.5)}>&minus;</button>
      <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoom(0.67)}>+</button>
      <button type="button" title="Fit session" aria-label="Fit session" onClick={() => chartRef.current?.timeScale().fitContent()}>&#8634;</button>
    </div>
    <div ref={container} className={styles.canvas} role="img" aria-label={`NIFTY intraday price with call wall, put wall and gamma flip for ${data.date}. ${data.snapshots.length} saved observations. Detailed values are in the saved observations table.`} />
  </>;
}

export default function GammaHistoryPage() {
  const { user, loading } = useAuth();
  const [date, setDate] = useState(() => istDate());
  const [expiry, setExpiry] = useState('');
  const [data, setData] = useState<GammaHistoryResponse | null>(null);
  const [options, setOptions] = useState<GammaHistoryResponse['expiries']>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [visible, setVisible] = useState<Record<Layer, boolean>>({ price: true, callWall: true, putWall: true, gammaFlip: true });
  const onTime = useCallback((time: number | null) => setHoverTime(time), []);
  useEffect(() => {
    if (!user || !autoRefresh || busy) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (date === istDate(now) && isNseRegularTradingTime(now)
        && (!expiry || istDate(Number(expiry) * 1000) >= date)) setRefresh(n => n + 1);
    }, 5 * 60000);
    return () => clearInterval(timer);
  }, [user, autoRefresh, busy, date, expiry]);
  useEffect(() => {
    if (!user || !date) return;
    const controller = new AbortController();
    setBusy(true); setError(''); setSaveError(''); setHoverTime(null);
    setData(previous => previous?.date === date && (!expiry || previous.expiry === expiry) ? previous : null);
    (async () => {
      try {
        const params = new URLSearchParams({ date });
        if (expiry) params.set('expiry', expiry);
        const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
        const now = Date.now();
        if (date === istDate(now) && isNseRegularTradingTime(now)
          && (!expiry || istDate(Number(expiry) * 1000) >= date)) {
          try {
            const liveParams = new URLSearchParams({ expiry, valuation: new Date(now).toISOString() });
            const saved = await fetch(`/api/options/gamma-exposure?${liveParams}`, { headers, signal: controller.signal });
            const snapshot = await saved.json();
            if (!saved.ok) throw new Error(snapshot.error ?? 'Unable to save a fresh gamma snapshot.');
            // Use the same default expiry that was just collected.
            params.set('expiry', snapshot.expiry);
          } catch (e) {
            if (controller.signal.aborted) return;
            setSaveError(e instanceof Error ? e.message : 'Unable to save a fresh gamma snapshot.');
          }
        }
        const response = await fetch(`/api/options/gamma-history?${params}`, {
          headers, signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Unable to load saved gamma history.');
        if (!controller.signal.aborted) { setData(result); setOptions(result.expiries); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load saved history.'); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [user, date, expiry, refresh]);

  const last = data?.snapshots.at(-1);
  const readoutTime = hoverTime ?? last?.time ?? data?.candles.at(-1)?.time;
  const point = data?.snapshots.find(p => p.time === readoutTime);
  const candle = data?.candles.find(c => c.time === readoutTime);
  const hasChart = !!data && (data.candles.length > 0 || data.snapshots.length > 0);
  return <main className={pageStyles.page}>
    <header className={pageStyles.heading}><h1>Gamma Exposure</h1><span className={pageStyles.source}>NIFTY 50 · NSE · History</span></header>
    <nav className={pageStyles.viewTabs} aria-label="Gamma view"><Link href="/gamma-exposure">Snapshot</Link><Link href="/gamma-exposure/history" aria-current="page">History</Link></nav>
    <div className={styles.toolbar}>
      <label>Session date <input type="date" value={date} max={istDate()} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></label>
      <label>Expiry <select value={expiry || data?.expiry || ''} onChange={e => setExpiry(e.target.value)} disabled={!options.length}>
        {!options.length && <option value="">No saved expiries</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select></label>
      <button type="button" disabled={busy || !user} onClick={() => setRefresh(n => n + 1)}>{busy ? 'Loading...' : 'Refresh'}</button>
    </div>
    <label className={styles.autoRefresh}><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />Auto-refresh every 5 minutes · NSE trading hours</label>
    {saveError && <p className={styles.notice} role="alert">Snapshot not saved: {saveError}</p>}
    {loading || (busy && !data) ? <div className={pageStyles.state} role="status">Loading saved gamma history...</div>
      : !user ? <div className={pageStyles.state}><Link href="/login">Sign in to view shared history</Link></div>
      : error ? <div className={pageStyles.state} role="alert">{error}</div>
      : data && <>
        <div className={styles.status} role="status">
          <span><strong>{data.snapshots.length}</strong> saved snapshots{data.snapshots.length > 0 ? ` · ${formatTime(data.snapshots[0].time)}–${formatTime(last!.time)} IST` : ''}</span>
          <span>{data.candles.length} minute candles</span>
        </div>
        {!data.snapshots.length && <p className={styles.notice}>No gamma snapshots saved for this expiry on {date}. Levels are recorded on refresh during trading hours.</p>}
        {data.candleMessage && <p className={styles.notice}>{data.candleMessage}</p>}
        {hasChart && <>
          <div className={styles.plot}>
            <div className={styles.legend}>{(Object.keys(colors) as Layer[]).map(key => <label key={key} style={{ color: colors[key] }}>
              <input type="checkbox" checked={visible[key]} onChange={e => setVisible(v => ({ ...v, [key]: e.target.checked }))} style={{ accentColor: colors[key] }} />{labels[key]}
            </label>)}</div>
            <div className={styles.readout} aria-live="polite">
              <div><span>Time (IST)</span><strong>{readoutTime === undefined ? '\u2014' : formatTime(readoutTime)}</strong></div>
              <div><span>NIFTY</span><strong>{formatPrice(candle?.close ?? point?.spot)}</strong></div>
              <div><span>Put Wall</span><strong style={{ color: colors.putWall }}>{formatPrice(point?.putWall)}</strong></div>
              <div><span>Gamma Flip</span><strong style={{ color: colors.gammaFlip }}>{formatPrice(point?.gammaFlip)}</strong></div>
              <div><span>Call Wall</span><strong style={{ color: colors.callWall }}>{formatPrice(point?.callWall)}</strong></div>
            </div>
            <HistoryChart data={data} visible={visible} onTime={onTime} />
          </div>
          <p className={styles.caption}>Dots are saved observations. Dashed lines connect samples; intervening gamma levels were not recorded. No levels are extended beyond the last observation.</p>
          {hoverTime !== null && !point && <p className={styles.notice}>No gamma snapshot at {formatTime(hoverTime)} IST.</p>}
          {point && point.excluded > 0 && <p className={styles.notice}>Selected snapshot: partial model coverage, {point.excluded} of {point.total} option legs unavailable.</p>}
          <footer className={styles.footer}><span>FYERS · {date} · 09:15–15:30 IST</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts by TradingView</a></footer>
        </>}
        {data.snapshots.length > 0 && <details className={pageStyles.details}><summary>Saved observations ({data.snapshots.length})</summary>
          <div className={pageStyles.tableWrap}><table><thead><tr><th>Time (IST)</th><th>NIFTY spot</th><th>Put Wall</th><th>Gamma Flip</th><th>Call Wall</th><th>Model coverage</th></tr></thead>
            <tbody>{data.snapshots.map(p => <tr key={p.time}><td>{formatTime(p.time)}</td><td>{formatPrice(p.spot)}</td><td>{formatPrice(p.putWall)}</td><td>{formatPrice(p.gammaFlip)}</td><td>{formatPrice(p.callWall)}</td><td>{p.total - p.excluded}/{p.total}</td></tr>)}</tbody>
          </table></div>
        </details>}
      </>}
  </main>;
}

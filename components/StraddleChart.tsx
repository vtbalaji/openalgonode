'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
} from 'lightweight-charts';

export interface StraddleChartProps {
  baseSymbol: string;
  expiry: string;
  interval: string;
  userId: string;
  height: number;
  lookbackDays: number;
  spotPrice: number;
  autoRefresh?: boolean;
}

export default function StraddleChart({
  baseSymbol,
  expiry,
  interval,
  userId,
  height,
  lookbackDays,
  spotPrice,
  autoRefresh = true,
}: StraddleChartProps) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const mainChartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ceLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const peLineRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [chartData, setChartData] = useState<any[]>([]);
  const [strike, setStrike] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestPrice, setLatestPrice] = useState<any>(null);

  // Initialize chart
  useEffect(() => {
    if (!mainChartRef.current) return;

    const chart = createChart(mainChartRef.current, {
      layout: {
        background: { color: '#1e1e1e' },
        textColor: '#d1d5db',
      },
      width: mainChartRef.current.clientWidth,
      height: height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    mainChartInstanceRef.current = chart;

    // Create candlestick series for straddle premium
    const candleStickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candleStickSeries;

    // Create volume histogram
    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(76, 175, 80, 0.5)',
      priceFormat: {
        type: 'volume',
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Create CE line (light green)
    const ceLine = chart.addLineSeries({
      color: '#81c784',
      lineWidth: 1,
      priceScaleId: 'right',
    });
    ceLineRef.current = ceLine;

    // Create PE line (light red)
    const peLine = chart.addLineSeries({
      color: '#e57373',
      lineWidth: 1,
      priceScaleId: 'right',
    });
    peLineRef.current = peLine;

    // Price scales
    chart.priceScale('left').applyOptions({ scaleMargins: { top: 0.3, bottom: 0.25 } });
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.3, bottom: 0.25 } });

    // Handle resize
    const handleResize = () => {
      if (mainChartRef.current) {
        chart.applyOptions({
          width: mainChartRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]);

  // Update chart height
  useEffect(() => {
    if (mainChartInstanceRef.current) {
      mainChartInstanceRef.current.applyOptions({
        height: height,
      });
    }
  }, [height]);

  // Fetch straddle data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const today = new Date();
        const from = new Date(today);
        from.setDate(today.getDate() - lookbackDays);

        const fromStr = from.toISOString().split('T')[0];
        const toStr = today.toISOString().split('T')[0];

        const params = new URLSearchParams({
          symbol: baseSymbol,
          expiry,
          interval,
          userId,
          from: fromStr,
          to: toStr,
          spotPrice: spotPrice.toString(),
        });

        const response = await fetch(`/api/options/straddle?${params.toString()}`);

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || `HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !result.data) {
          throw new Error(result.error || 'No data returned');
        }

        setStrike(result.strike);

        // Transform data for charting
        const candleData: CandlestickData[] = [];
        const volumeData: HistogramData[] = [];
        const ceData: any[] = [];
        const peData: any[] = [];

        result.data.forEach((candle: any) => {
          // Straddle premium candlestick
          const premium = candle.straddlePremium;
          candleData.push({
            time: candle.time,
            open: premium,
            high: premium,
            low: premium,
            close: premium,
          });

          // Volume histogram
          volumeData.push({
            time: candle.time,
            value: candle.totalVolume,
            color: candle.totalVolume > 0 ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)',
          });

          // CE and PE lines
          ceData.push({
            time: candle.time,
            value: candle.cePrice,
          });

          peData.push({
            time: candle.time,
            value: candle.pePrice,
          });
        });

        if (candlestickSeriesRef.current && candleData.length > 0) {
          candlestickSeriesRef.current.setData(candleData);
          volumeSeriesRef.current?.setData(volumeData);
          ceLineRef.current?.setData(ceData);
          peLineRef.current?.setData(peData);

          setChartData(result.data);
          setLatestPrice(result.data[result.data.length - 1]);

          mainChartInstanceRef.current?.timeScale().fitContent();
        }
      } catch (err: any) {
        console.error('Error fetching straddle data:', err);
        setError(err.message || 'Failed to fetch straddle data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const intervalId = autoRefresh ? setInterval(fetchData, 5 * 60 * 1000) : undefined;

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [baseSymbol, expiry, interval, userId, lookbackDays, spotPrice, autoRefresh]);

  return (
    <div className="w-full">
      {/* Info Panel */}
      <div className="bg-slate-900 p-4 rounded-lg mb-4 border border-slate-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Symbol</p>
            <p className="text-lg font-bold text-white">
              {baseSymbol} {expiry}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">Strike</p>
            <p className="text-lg font-bold text-white">{strike || '—'}</p>
          </div>

          <div>
            <p className="text-xs text-gray-500">Straddle Premium</p>
            <p className="text-lg font-bold text-green-400">
              {latestPrice?.straddlePremium?.toFixed(2) || '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">Total Volume</p>
            <p className="text-lg font-bold text-blue-400">
              {latestPrice?.totalVolume?.toLocaleString() || '—'}
            </p>
          </div>
        </div>

        {/* CE/PE Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-700">
          <div>
            <p className="text-xs text-gray-500">CE Price</p>
            <p className="text-base font-semibold text-green-400">
              {latestPrice?.cePrice?.toFixed(2) || '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">CE Volume</p>
            <p className="text-base font-semibold text-green-400">
              {latestPrice?.ceVolume?.toLocaleString() || '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">PE Price</p>
            <p className="text-base font-semibold text-red-400">
              {latestPrice?.pePrice?.toFixed(2) || '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">PE Volume</p>
            <p className="text-base font-semibold text-red-400">
              {latestPrice?.peVolume?.toLocaleString() || '—'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-900 text-red-200 rounded text-sm">
            ⚠️ {error}
          </div>
        )}

        {loading && (
          <div className="mt-4 p-3 bg-blue-900 text-blue-200 rounded text-sm">
            ⏳ Loading straddle data...
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        ref={mainChartRef}
        className="w-full rounded-lg border border-slate-800 bg-slate-950"
        style={{ height: `${height}px` }}
      />

      {/* Legend */}
      <div className="mt-4 flex gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded-full" />
          <span className="text-gray-400">CE Price</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded-full" />
          <span className="text-gray-400">PE Price</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-600 rounded-full" />
          <span className="text-gray-400">Volume</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-green-400 rounded" />
          <span className="text-gray-400">Straddle Premium</span>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  SeriesMarker,
} from 'lightweight-charts';
import { calculateVIDYA_Series, VIDYAPoint, ChartData as VIDYAChartData, LiquidityZone } from '@/lib/indicators/vidyaCalc';

interface VidyaTradingChartProps {
  symbol: string;
  interval: string;
  userId: string;
  height: number;
  lookbackDays: number;
  indicators: any;
  realtimePrice?: number;
}

export default function VidyaTradingChart({
  symbol,
  interval,
  userId,
  height,
  lookbackDays,
  indicators,
  realtimePrice,
}: VidyaTradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<VIDYAPoint[]>([]);
  const [rawOHLCData, setRawOHLCData] = useState<VIDYAChartData[]>([]);

  // Fetch and calculate data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - lookbackDays);

        const params = new URLSearchParams({
          symbol,
          interval,
          userId,
          from: from.toISOString().split('T')[0],
          to: to.toISOString().split('T')[0],
        });

        const response = await fetch(`/api/chart/historical?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch');

        const { data } = await response.json();
        setRawOHLCData(data); // Store real OHLC data

        const series = calculateVIDYA_Series(
          data,
          indicators.cmoPeriod,
          indicators.atrPeriod,
          indicators.cmoPeriod, // Use CMO period for volume delta as well
          indicators.bandMultiplier || 1.0 // Default to 1.0 if not specified
        );
        setChartData(series);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol, interval, userId, lookbackDays, indicators.cmoPeriod, indicators.atrPeriod, indicators.bandMultiplier]);

  // Render chart
  useEffect(() => {
    if (!containerRef.current || chartData.length === 0 || rawOHLCData.length === 0) return;

    try {
      // Destroy old chart if exists
      if (chartRef.current) {
        chartRef.current.remove();
      }

      const chart = createChart(containerRef.current, {
        layout: {
          background: { color: '#fff', type: ColorType.Solid },
          textColor: '#333',
          fontSize: 12,
        },
        width: containerRef.current.clientWidth,
        height: height,
        timeScale: { timeVisible: true, secondsVisible: false },
        rightPriceScale: { autoScale: true },
      });

      // Candlesticks - use REAL OHLC data
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      // Set candlestick data from raw OHLC
      const ohlcData = rawOHLCData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      candleSeries.setData(ohlcData as any);

      // Create line series segments - one for each trend to color-code
      // Plot smoothedValue (lower_band in uptrend, upper_band in downtrend)
      // Create smooth transitions at trend changes
      const trendSegments: Array<{
        trend: 'bullish' | 'bearish' | 'neutral';
        data: Array<{ time: number; value: number }>;
      }> = [];

      let currentSegment: {
        trend: 'bullish' | 'bearish' | 'neutral';
        data: Array<{ time: number; value: number }>;
      } | null = null;

      for (const point of chartData) {
        // Skip null smoothedValue
        if (point.smoothedValue === null) {
          if (currentSegment) {
            trendSegments.push(currentSegment);
            currentSegment = null;
          }
          continue;
        }

        // Trend changed - end current segment and start new one
        if (!currentSegment || currentSegment.trend !== point.trend) {
          if (currentSegment) {
            // Add current point to end the previous segment (creates smooth transition)
            currentSegment.data.push({ time: point.time, value: point.smoothedValue });
            trendSegments.push(currentSegment);
          }
          // Start new segment at the same point
          currentSegment = {
            trend: point.trend,
            data: [{ time: point.time, value: point.smoothedValue }],
          };
        } else {
          currentSegment.data.push({ time: point.time, value: point.smoothedValue });
        }
      }
      if (currentSegment) {
        trendSegments.push(currentSegment);
      }

      // Add background shading first (renders behind the main line)
      // Create area series from smoothed_value with subtle fill
      // Note: TradingView Lightweight Charts doesn't support fill-between like Pine Script
      // This creates an approximation by filling from the smoothed_value line downward
      for (const segment of trendSegments) {
        const fillColor =
          segment.trend === 'bullish'
            ? 'rgba(6, 182, 212, 0.1)' // Cyan with 10% opacity
            : segment.trend === 'bearish'
              ? 'rgba(236, 72, 153, 0.1)' // Pink with 10% opacity
              : 'rgba(148, 163, 184, 0.1)'; // Gray

        const areaSeries = chart.addAreaSeries({
          lineColor: 'transparent',
          topColor: fillColor,
          bottomColor: 'rgba(255, 255, 255, 0.0)', // Transparent bottom
        });

        areaSeries.setData(segment.data as any);
      }

      // Render each trend segment line with appropriate color (will also use for markers)
      let mainLineSeries: any = null;
      for (const segment of trendSegments) {
        const color =
          segment.trend === 'bullish'
            ? '#06B6D4' // Cyan for bullish
            : segment.trend === 'bearish'
              ? '#ec4899' // Pink for bearish
              : '#94a3b8'; // Gray for neutral

        const vidyaSeries = chart.addLineSeries({
          color: color,
          lineWidth: 3,
        });
        vidyaSeries.setData(segment.data as any);

        // Keep reference to first series for markers
        if (!mainLineSeries) {
          mainLineSeries = vidyaSeries;
        }
      }

      // Add trend change markers (arrows)
      // Find all points where trend changed
      const trendChangeMarkers: SeriesMarker<any>[] = [];
      for (let i = 1; i < chartData.length; i++) {
        const current = chartData[i];
        const previous = chartData[i - 1];

        // Trend changed from non-bullish to bullish: triangle up
        if (current.trend === 'bullish' && previous.trend !== 'bullish') {
          trendChangeMarkers.push({
            time: current.time,
            position: 'belowBar',
            color: '#06B6D4', // Cyan
            shape: 'arrowUp',
            text: '▲',
            size: 1,
          });
        }
        // Trend changed from non-bearish to bearish: triangle down
        else if (current.trend === 'bearish' && previous.trend !== 'bearish') {
          trendChangeMarkers.push({
            time: current.time,
            position: 'aboveBar',
            color: '#ec4899', // Pink
            shape: 'arrowDown',
            text: '▼',
            size: 1,
          });
        }
      }

      // Apply markers to the candlestick series (shows on price chart)
      if (trendChangeMarkers.length > 0) {
        candleSeries.setMarkers(trendChangeMarkers);
      }

      // Render liquidity zones - finite horizontal lines (if enabled)
      if (indicators.showLiquidityZones && chartData.length > 0) {
        // Get all zones from the last data point (contains all completed + active zones)
        const lastPoint = chartData[chartData.length - 1];
        const allZones = lastPoint.liquidityZones;

        // Filter: Only show zones that haven't been crossed yet
        // Keep expired zones (aged out) but hide crossed zones
        const uncrossedZones = allZones.filter(zone => !zone.crossedAt);

        // Draw each uncrossed liquidity zone as a horizontal line segment
        for (const zone of uncrossedZones) {
          const lineColor = zone.type === 'support'
            ? 'rgba(6, 182, 212, 0.6)' // Cyan for support
            : 'rgba(236, 72, 153, 0.6)'; // Pink for resistance

          const lineSeries = chart.addLineSeries({
            color: lineColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
          });

          // Create line data from startTime to endTime
          lineSeries.setData([
            { time: zone.startTime, value: zone.price },
            { time: zone.endTime, value: zone.price },
          ] as any);
        }
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;
    } catch (err) {
      console.error('Chart error:', err);
      setError('Chart rendering failed');
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [chartData, rawOHLCData, height, indicators.showLiquidityZones]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
        <div className="text-gray-500">Loading VIDYA chart data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={containerRef} style={{ height: `${height}px` }} className="w-full border border-gray-200 rounded" />

      {/* Volume info overlay - positioned on chart */}
      {chartData.length > 0 && (
        <div className="absolute top-4 left-4 p-3 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-300 shadow-lg z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-yellow-500 text-lg">✪</span>
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Volume Profile</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-medium">Buy:</span>
              <span className="font-semibold text-gray-900">
                {(chartData[chartData.length - 1].buyVolume / 1000000).toFixed(2)}M
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-600 font-medium">Sell:</span>
              <span className="font-semibold text-gray-900">
                {(chartData[chartData.length - 1].sellVolume / 1000000).toFixed(2)}M
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-purple-600 font-medium">Delta:</span>
              <span className="font-semibold text-gray-900">
                {chartData[chartData.length - 1].volumeDeltaPercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  refreshTrigger?: number;
}

export default function VidyaTradingChart({
  symbol,
  interval,
  userId,
  height,
  lookbackDays,
  indicators,
  realtimePrice,
  refreshTrigger = 0,
}: VidyaTradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<VIDYAPoint[]>([]);
  const [rawOHLCData, setRawOHLCData] = useState<VIDYAChartData[]>([]);
  const [tooltipData, setTooltipData] = useState<{
    time: number;
    price: number;
    volumeDelta: number;
    buyVolume: number;
    sellVolume: number;
    trend: string;
    cmo: number;
    visible: boolean;
    x: number;
    y: number;
  } | null>(null);

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
        if (!response.ok) throw new Error('Failed to fetch data from server');

        const { data } = await response.json();

        // Check if data is empty
        if (!data || data.length === 0) {
          throw new Error('No historical data available. Please check: (1) Zerodha authentication, (2) Symbol is correct, (3) Market hours/trading days.');
        }

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
  }, [symbol, interval, userId, lookbackDays, indicators.cmoPeriod, indicators.atrPeriod, indicators.bandMultiplier, refreshTrigger]);

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
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time: any) => {
            // Format horizontal axis labels in IST
            const date = new Date(time * 1000);
            const timeStr = date.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
            const dateStr = date.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
              month: 'short'
            });
            return `${timeStr}\n${dateStr}`;
          },
        },
        rightPriceScale: { autoScale: true },
        localization: {
          timeFormatter: (time: any) => {
            // Convert Unix timestamp to IST for crosshair tooltip
            const date = new Date(time * 1000);
            return date.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          },
        },
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

      // Store in ref for crosshair callback
      candleSeriesRef.current = candleSeries;

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

      // Calculate average ATR to determine narrow vs wide bands
      const atrValues = chartData.map(d => d.upperBand - d.lowerBand);
      const avgATR = atrValues.reduce((a, b) => a + b, 0) / atrValues.length;
      const narrowThreshold = avgATR * 0.6; // Bands narrower than 60% of average = choppy

      // Add ATR bands (upper and lower) with color coding
      // Narrow bands (low volatility) = Orange warning
      // Wide bands (trending) = Blue-gray subtle
      const bandSegments: Array<{
        isNarrow: boolean;
        upperData: Array<{ time: number; value: number }>;
        lowerData: Array<{ time: number; value: number }>;
      }> = [];

      let currentBandSegment: typeof bandSegments[0] | null = null;

      for (const point of chartData) {
        const bandWidth = point.upperBand - point.lowerBand;
        const isNarrow = bandWidth < narrowThreshold;

        if (!currentBandSegment || currentBandSegment.isNarrow !== isNarrow) {
          if (currentBandSegment) {
            // Close current segment with current point for smooth transition
            currentBandSegment.upperData.push({ time: point.time, value: point.upperBand });
            currentBandSegment.lowerData.push({ time: point.time, value: point.lowerBand });
            bandSegments.push(currentBandSegment);
          }
          // Start new segment
          currentBandSegment = {
            isNarrow,
            upperData: [{ time: point.time, value: point.upperBand }],
            lowerData: [{ time: point.time, value: point.lowerBand }],
          };
        } else {
          currentBandSegment.upperData.push({ time: point.time, value: point.upperBand });
          currentBandSegment.lowerData.push({ time: point.time, value: point.lowerBand });
        }
      }
      if (currentBandSegment) {
        bandSegments.push(currentBandSegment);
      }

      // ATR bands calculated but not displayed as lines (reduces clutter)
      // The bands are still used for signal calculation and stop loss logic
      // Users can see band info in the tooltip and overlays

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

      // Add all markers (early signals + trend change signals)
      const allMarkers: SeriesMarker<any>[] = [];

      for (let i = 1; i < chartData.length; i++) {
        const current = chartData[i];
        const previous = chartData[i - 1];

        // EARLY SIGNALS: Band touch with volume confirmation (yellow arrows)
        if (current.earlySignal === 'early_buy') {
          allMarkers.push({
            time: current.time,
            position: 'belowBar',
            color: '#fbbf24', // Yellow/Amber
            shape: 'arrowUp',
            text: 'EARLY BUY',
            size: 1.5,
          });
        } else if (current.earlySignal === 'early_sell') {
          allMarkers.push({
            time: current.time,
            position: 'aboveBar',
            color: '#fbbf24', // Yellow/Amber
            shape: 'arrowDown',
            text: 'EARLY SELL',
            size: 1.5,
          });
        }

        // FULL SIGNALS: Trend changed with full crossover (cyan/pink arrows)
        if (current.trend === 'bullish' && previous.trend !== 'bullish') {
          // Find nearest support zone (liquidity zone below entry price)
          const supportZones = current.liquidityZones
            .filter(z => z.type === 'support' && z.price < current.close && !z.crossedAt)
            .sort((a, b) => b.price - a.price); // Closest to current price first

          const stopLoss = supportZones.length > 0
            ? supportZones[0].price  // Use nearest support pivot
            : current.lowerBand;      // Fallback to ATR band

          allMarkers.push({
            time: current.time,
            position: 'belowBar',
            color: '#06B6D4', // Cyan
            shape: 'arrowUp',
            text: `BUY\n${current.close.toFixed(2)}\nSL: ${stopLoss.toFixed(2)}`,
            size: 2,
          });
        }
        // Trend changed from non-bearish to bearish: triangle down
        else if (current.trend === 'bearish' && previous.trend !== 'bearish') {
          // Find nearest resistance zone (liquidity zone above entry price)
          const resistanceZones = current.liquidityZones
            .filter(z => z.type === 'resistance' && z.price > current.close && !z.crossedAt)
            .sort((a, b) => a.price - b.price); // Closest to current price first

          const stopLoss = resistanceZones.length > 0
            ? resistanceZones[0].price  // Use nearest resistance pivot
            : current.upperBand;         // Fallback to ATR band

          allMarkers.push({
            time: current.time,
            position: 'aboveBar',
            color: '#ec4899', // Pink
            shape: 'arrowDown',
            text: `SELL\n${current.close.toFixed(2)}\nSL: ${stopLoss.toFixed(2)}`,
            size: 2,
          });
        }
      }

      // Apply all markers to the candlestick series
      if (allMarkers.length > 0) {
        candleSeries.setMarkers(allMarkers);
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

      // Add crosshair move event listener for tooltip
      chart.subscribeCrosshairMove((param: any) => {
        // Hide tooltip if no time or point
        if (!param.time || !param.point) {
          setTooltipData(null);
          return;
        }

        // Find the data point at the crosshair time
        const dataPoint = chartData.find(d => d.time === param.time);
        if (!dataPoint) {
          setTooltipData(null);
          return;
        }

        // Try to get price from candlestick series if available
        let displayPrice = dataPoint.close;
        if (param.seriesData && candleSeriesRef.current) {
          const price = param.seriesData.get(candleSeriesRef.current);
          if (price) {
            displayPrice = price.close || dataPoint.close;
          }
        }

        // Always show tooltip with dataPoint information
        setTooltipData({
          time: dataPoint.time,
          price: displayPrice,
          volumeDelta: dataPoint.volumeDelta,
          buyVolume: dataPoint.buyVolume,
          sellVolume: dataPoint.sellVolume,
          trend: dataPoint.trend,
          cmo: dataPoint.cmo,
          visible: true,
          x: param.point.x,
          y: param.point.y,
        });
      });

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
      candleSeriesRef.current = null;
      setTooltipData(null);
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
      {chartData.length > 0 && (() => {
        const latestPoint = chartData[chartData.length - 1];
        const bandWidth = latestPoint.upperBand - latestPoint.lowerBand;
        const atrValues = chartData.map(d => d.upperBand - d.lowerBand);
        const avgATR = atrValues.reduce((a, b) => a + b, 0) / atrValues.length;
        const isNarrow = bandWidth < avgATR * 0.6;

        return (
          <div className="absolute top-4 left-4 p-3 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-300 shadow-lg z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-yellow-500 text-lg">✪</span>
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Volume Profile</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium">Buy:</span>
                <span className="font-semibold text-gray-900">
                  {(latestPoint.buyVolume / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-600 font-medium">Sell:</span>
                <span className="font-semibold text-gray-900">
                  {(latestPoint.sellVolume / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-purple-600 font-medium">Delta:</span>
                <span className="font-semibold text-gray-900">
                  {latestPoint.volumeDeltaPercent.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1 mt-1 border-t border-gray-200">
                <span className={isNarrow ? "text-orange-600 font-medium" : "text-blue-600 font-medium"}>
                  {isNarrow ? "⚠️ Narrow" : "✓ Wide"}:
                </span>
                <span className="font-semibold text-gray-900">
                  {bandWidth.toFixed(1)} pts
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Volume Delta Dynamics - positioned top-right */}
      {chartData.length > 1 && (() => {
        const latestPoint = chartData[chartData.length - 1];
        const previousPoint = chartData[chartData.length - 2];

        // Calculate average volume
        const recentVolumes = chartData.slice(-14).map(d => rawOHLCData.find(r => r.time === d.time)?.volume || 0);
        const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
        const currentVolume = rawOHLCData.find(r => r.time === latestPoint.time)?.volume || 0;

        // Volume spike detection
        const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;
        const isVolumeSpike = volumeRatio >= 1.5;

        // Delta flip detection
        const currentDelta = latestPoint.volumeDelta;
        const previousDelta = previousPoint.volumeDelta;
        const bullishFlip = previousDelta <= 0 && currentDelta > 0;
        const bearishFlip = previousDelta >= 0 && currentDelta < 0;
        const deltaFlipped = bullishFlip || bearishFlip;

        // Distance to bands
        const lowerBandDistance = ((latestPoint.close - latestPoint.lowerBand) / latestPoint.lowerBand * 100);
        const upperBandDistance = ((latestPoint.upperBand - latestPoint.close) / latestPoint.close * 100);
        const nearLowerBand = Math.abs(lowerBandDistance) <= 0.2;
        const nearUpperBand = Math.abs(upperBandDistance) <= 0.2;

        return (
          <div className="absolute top-4 right-4 p-3 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-300 shadow-lg z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-500 text-lg">⚡</span>
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Entry Dynamics</span>
            </div>
            <div className="space-y-1 text-xs">
              {/* Volume Delta */}
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">Curr Δ:</span>
                <span className={`font-semibold ${currentDelta > 0 ? 'text-green-600' : currentDelta < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {currentDelta > 0 ? '+' : ''}{(currentDelta / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">Prev Δ:</span>
                <span className={`font-semibold ${previousDelta > 0 ? 'text-green-600' : previousDelta < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {previousDelta > 0 ? '+' : ''}{(previousDelta / 1000000).toFixed(2)}M
                </span>
              </div>

              {/* Delta Flip Status */}
              <div className="flex items-center gap-2 pt-1 mt-1 border-t border-gray-200">
                <span className="text-gray-600 font-medium">Flip:</span>
                <span className={`font-semibold ${deltaFlipped ? (bullishFlip ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                  {deltaFlipped ? (bullishFlip ? '↗ Bullish' : '↘ Bearish') : '─ None'}
                </span>
              </div>

              {/* Volume Spike */}
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">Vol:</span>
                <span className={`font-semibold ${isVolumeSpike ? 'text-amber-600' : 'text-gray-900'}`}>
                  {volumeRatio.toFixed(2)}x {isVolumeSpike ? '🔥' : ''}
                </span>
              </div>

              {/* Band Distance */}
              <div className="flex items-center gap-2 pt-1 mt-1 border-t border-gray-200">
                <span className="text-gray-600 font-medium">Lower:</span>
                <span className={`font-semibold ${nearLowerBand ? 'text-cyan-600' : 'text-gray-900'}`}>
                  {lowerBandDistance > 0 ? '+' : ''}{lowerBandDistance.toFixed(2)}% {nearLowerBand ? '👆' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">Upper:</span>
                <span className={`font-semibold ${nearUpperBand ? 'text-pink-600' : 'text-gray-900'}`}>
                  {upperBandDistance > 0 ? '+' : ''}{upperBandDistance.toFixed(2)}% {nearUpperBand ? '👇' : ''}
                </span>
              </div>

              {/* Early Signal Indicator */}
              {latestPoint.earlySignal && (
                <div className="flex items-center gap-2 pt-1 mt-1 border-t border-gray-200">
                  <span className={`text-xs font-bold ${latestPoint.earlySignal === 'early_buy' ? 'text-cyan-600' : 'text-pink-600'}`}>
                    🎯 EARLY {latestPoint.earlySignal === 'early_buy' ? 'BUY' : 'SELL'} ACTIVE
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Band Legend - positioned bottom-left */}
      <div className="absolute bottom-4 left-4 p-2 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-300 shadow-lg z-10">
        <div className="text-xs font-bold text-gray-700 mb-1">ATR Bands:</div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-orange-500"></div>
            <span className="text-gray-600">Narrow (Choppy)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-slate-400"></div>
            <span className="text-gray-600">Wide (Trending)</span>
          </div>
        </div>
      </div>

      {/* Crosshair Tooltip - follows mouse */}
      {tooltipData && tooltipData.visible && (
        <div
          className="absolute p-3 bg-white/95 backdrop-blur-sm rounded-lg border-2 border-gray-400 shadow-xl z-50 pointer-events-none"
          style={{
            left: `${tooltipData.x + 15}px`,
            top: `${tooltipData.y + 15}px`,
          }}
        >
          <div className="space-y-1 text-xs min-w-[200px]">
            {/* Time and Price */}
            <div className="flex items-center justify-between gap-4 pb-1 mb-1 border-b-2 border-gray-300">
              <span className="text-gray-600 font-medium">Price:</span>
              <span className="font-bold text-gray-900">{tooltipData.price.toFixed(2)}</span>
            </div>

            {/* Trend */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-600 font-medium">Trend:</span>
              <span className={`font-bold uppercase ${tooltipData.trend === 'bullish' ? 'text-cyan-600' : 'text-pink-600'}`}>
                {tooltipData.trend === 'bullish' ? '↗ BULLISH' : '↘ BEARISH'}
              </span>
            </div>

            {/* Volume Delta - HIGHLIGHTED */}
            <div className="flex items-center justify-between gap-4 p-2 mt-1 rounded bg-gradient-to-r from-gray-100 to-gray-50">
              <span className="text-gray-700 font-bold">Vol Δ:</span>
              <span className={`font-bold text-base ${tooltipData.volumeDelta > 0 ? 'text-green-600' : tooltipData.volumeDelta < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {tooltipData.volumeDelta > 0 ? '+' : ''}{(tooltipData.volumeDelta / 1000000).toFixed(2)}M
              </span>
            </div>

            {/* Buy Volume */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-green-600 font-medium">Buy Vol:</span>
              <span className="font-semibold text-gray-900">
                {(tooltipData.buyVolume / 1000000).toFixed(2)}M
              </span>
            </div>

            {/* Sell Volume */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-red-600 font-medium">Sell Vol:</span>
              <span className="font-semibold text-gray-900">
                {(tooltipData.sellVolume / 1000000).toFixed(2)}M
              </span>
            </div>

            {/* CMO */}
            <div className="flex items-center justify-between gap-4 pt-1 mt-1 border-t border-gray-200">
              <span className="text-gray-600 font-medium">CMO:</span>
              <span className={`font-semibold ${tooltipData.cmo > 20 ? 'text-green-600' : tooltipData.cmo < -20 ? 'text-red-600' : 'text-gray-900'}`}>
                {tooltipData.cmo.toFixed(1)}
              </span>
            </div>

            {/* Time */}
            <div className="flex items-center justify-between gap-4 text-[10px] text-gray-500 pt-1 mt-1 border-t border-gray-200">
              <span>Time:</span>
              <span>{new Date(tooltipData.time * 1000).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

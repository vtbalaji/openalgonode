/**
 * Advanced Trading Chart with Multiple Indicators
 * - Candlestick Chart
 * - Volume
 * - SMA (Simple Moving Average)
 * - EMA (Exponential Moving Average)
 * - RSI (Relative Strength Index)
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  HistogramData
} from 'lightweight-charts';
import { SMA, EMA, RSI } from 'technicalindicators';
import { calculateVolumeProfile } from '@/lib/indicators/volumeProfile';

export interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorConfig {
  sma: boolean;
  smaPeriod: number;
  ema: boolean;
  emaPeriod: number;
  rsi: boolean;
  rsiPeriod: number;
  volumeProfile: boolean;
  volumeProfileBins: number;
}

export interface AdvancedTradingChartProps {
  data: ChartData[];
  symbol: string;
  interval: string;
  indicators: IndicatorConfig;
  onIndicatorChange?: (indicators: IndicatorConfig) => void;
  height?: number;
}

export function AdvancedTradingChart({
  data,
  symbol,
  interval,
  indicators,
  onIndicatorChange,
  height = 600,
}: AdvancedTradingChartProps) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);
  const volumeProfileOverlayRef = useRef<HTMLDivElement>(null);

  const mainChartInstanceRef = useRef<IChartApi | null>(null);
  const rsiChartInstanceRef = useRef<IChartApi | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const smaSeriesRef = useRef<any>(null);
  const emaSeriesRef = useRef<any>(null);
  const rsiSeriesRef = useRef<any>(null);
  const volumeProfileSeriesRef = useRef<any>(null);
  const pocLineRef = useRef<any>(null);
  const valueAreaHighLineRef = useRef<any>(null);
  const valueAreaLowLineRef = useRef<any>(null);

  const [volumeProfileData, setVolumeProfileData] = useState<any>(null);
  const [visibleRange, setVisibleRange] = useState<any>(null);
  const visibleRangeRef = useRef<any>(null);

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize charts
  useEffect(() => {
    if (!mainChartRef.current) return;

    const rsiHeight = isMobile ? 100 : 120;
    const mainChart = createChart(mainChartRef.current, {
      width: mainChartRef.current.clientWidth,
      height: indicators.rsi ? height - rsiHeight - 30 : height,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
        fontSize: isMobile ? 10 : 12,
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: isMobile ? 1 : 1,
          labelBackgroundColor: isMobile ? '#9B7DFF' : '#2196F3',
        },
        horzLine: {
          width: isMobile ? 1 : 1,
          labelBackgroundColor: isMobile ? '#9B7DFF' : '#2196F3',
        },
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: '#d1d4dc',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: isMobile ? 6 : 8,
        minBarSpacing: isMobile ? 3 : 4,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false, // Disable vertical drag to keep price/volume in sync
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    mainChartInstanceRef.current = mainChart;

    // Candlestick
    const candlestickSeries = mainChart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Volume
    const volumeSeries = mainChart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeriesRef.current = volumeSeries;

    mainChart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // RSI Chart
    if (indicators.rsi && rsiChartRef.current) {
      const rsiChart = createChart(rsiChartRef.current, {
        width: rsiChartRef.current.clientWidth,
        height: rsiHeight,
        layout: {
          background: { color: '#ffffff' },
          textColor: '#333',
          fontSize: isMobile ? 10 : 12,
        },
        grid: {
          vertLines: { color: '#f0f0f0' },
          horzLines: { color: '#f0f0f0' },
        },
        rightPriceScale: {
          borderColor: '#d1d4dc',
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: '#d1d4dc',
          visible: false,
          barSpacing: isMobile ? 6 : 8,
          minBarSpacing: isMobile ? 3 : 4,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false, // Disable vertical drag to keep in sync with main chart
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      rsiChartInstanceRef.current = rsiChart;

      const rsiSeries = rsiChart.addLineSeries({
        color: '#9C27B0',
        lineWidth: 2,
        title: 'RSI',
      });
      rsiSeriesRef.current = rsiSeries;

      // Add RSI reference lines
      const upperBand = rsiChart.addLineSeries({
        color: '#ef5350',
        lineWidth: 1,
        lineStyle: 2,
      });
      upperBand.setData(data.map(d => ({ time: d.time as any, value: 70 })));

      const lowerBand = rsiChart.addLineSeries({
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: 2,
      });
      lowerBand.setData(data.map(d => ({ time: d.time as any, value: 30 })));

      // Sync time scales
      mainChart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
        rsiChart.timeScale().setVisibleRange(timeRange as any);
      });

      rsiChart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
        mainChart.timeScale().setVisibleRange(timeRange as any);
      });
    }

    // Track visible time range for volume profile
    mainChart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
      if (timeRange) {
        // Only update if range actually changed to prevent infinite loop
        const prevRange = visibleRangeRef.current;
        if (!prevRange || prevRange.from !== timeRange.from || prevRange.to !== timeRange.to) {
          visibleRangeRef.current = timeRange;
          setVisibleRange(timeRange);
        }
      }
    });

    // Resize handler
    const handleResize = () => {
      if (mainChartRef.current && mainChartInstanceRef.current) {
        mainChartInstanceRef.current.applyOptions({
          width: mainChartRef.current.clientWidth,
        });
      }
      if (rsiChartRef.current && rsiChartInstanceRef.current) {
        rsiChartInstanceRef.current.applyOptions({
          width: rsiChartRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.remove();
          mainChartInstanceRef.current = null;
        } catch (e) {
          console.warn('Error removing main chart:', e);
        }
      }
      if (rsiChartInstanceRef.current) {
        try {
          rsiChartInstanceRef.current.remove();
          rsiChartInstanceRef.current = null;
        } catch (e) {
          console.warn('Error removing RSI chart:', e);
        }
      }
    };
  }, [indicators.rsi, height]);

  // Update data
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current || !data || data.length === 0) {
      return;
    }

    // Candlestick data
    candlestickSeriesRef.current.setData(data);

    // Volume data
    const volumeData = data.map((d) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? '#26a69a80' : '#ef535080',
    }));
    volumeSeriesRef.current.setData(volumeData);

    const closePrices = data.map((d) => d.close);

    // SMA
    if (indicators.sma && data.length >= indicators.smaPeriod && mainChartInstanceRef.current) {
      if (smaSeriesRef.current && mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(smaSeriesRef.current);
          smaSeriesRef.current = null;
        } catch (e) {
          console.warn('Error removing SMA series:', e);
        }
      }

      const smaValues = SMA.calculate({ period: indicators.smaPeriod, values: closePrices });
      const smaSeries = mainChartInstanceRef.current.addLineSeries({
        color: '#2196F3',
        lineWidth: 2,
        title: 'SMA(' + indicators.smaPeriod + ')',
      });

      const smaData = smaValues.map((value, index) => ({
        time: data[index + indicators.smaPeriod - 1].time as any,
        value: value,
      }));

      smaSeries.setData(smaData);
      smaSeriesRef.current = smaSeries;
    } else if (!indicators.sma && smaSeriesRef.current && mainChartInstanceRef.current) {
      // Remove SMA when disabled
      try {
        mainChartInstanceRef.current.removeSeries(smaSeriesRef.current);
        smaSeriesRef.current = null;
      } catch (e) {
        console.warn('Error removing SMA series:', e);
      }
    }

    // EMA
    if (indicators.ema && data.length >= indicators.emaPeriod && mainChartInstanceRef.current) {
      if (emaSeriesRef.current && mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(emaSeriesRef.current);
          emaSeriesRef.current = null;
        } catch (e) {
          console.warn('Error removing EMA series:', e);
        }
      }

      const emaValues = EMA.calculate({ period: indicators.emaPeriod, values: closePrices });
      const emaSeries = mainChartInstanceRef.current.addLineSeries({
        color: '#FF9800',
        lineWidth: 2,
        title: 'EMA(' + indicators.emaPeriod + ')',
      });

      const emaData = emaValues.map((value, index) => ({
        time: data[index + indicators.emaPeriod - 1].time as any,
        value: value,
      }));

      emaSeries.setData(emaData);
      emaSeriesRef.current = emaSeries;
    } else if (!indicators.ema && emaSeriesRef.current && mainChartInstanceRef.current) {
      // Remove EMA when disabled
      try {
        mainChartInstanceRef.current.removeSeries(emaSeriesRef.current);
        emaSeriesRef.current = null;
      } catch (e) {
        console.warn('Error removing EMA series:', e);
      }
    }

    // RSI
    if (indicators.rsi && data.length >= indicators.rsiPeriod && rsiSeriesRef.current) {
      const rsiValues = RSI.calculate({ period: indicators.rsiPeriod, values: closePrices });
      const rsiData = rsiValues.map((value, index) => ({
        time: data[index + indicators.rsiPeriod].time as any,
        value: value,
      }));

      rsiSeriesRef.current.setData(rsiData);
    }

    // Volume Profile
    if (indicators.volumeProfile && data.length > 0 && mainChartInstanceRef.current) {
      // Use ALL data instead of visible range
      const minTime = Math.min(...data.map(d => d.time));
      const maxTime = Math.max(...data.map(d => d.time));

      console.log('[VP] Using all data:', {
        totalCandles: data.length,
        dateRange: {
          from: new Date(minTime * 1000).toISOString(),
          to: new Date(maxTime * 1000).toISOString(),
        },
        priceRange: {
          min: Math.min(...data.map(d => d.low)).toFixed(2),
          max: Math.max(...data.map(d => d.high)).toFixed(2),
        }
      });

      // Calculate volume profile for ALL data
      const volumeProfileResult = calculateVolumeProfile(
        data,
        indicators.volumeProfileBins || 50,
        0.70
      );

      // Store for histogram rendering
      setVolumeProfileData(volumeProfileResult);

      // Find max volume for verification
      const maxVol = Math.max(...volumeProfileResult.profile.map(p => p.volume));
      const pocBar = volumeProfileResult.profile.find(p => Math.abs(p.price - volumeProfileResult.poc) < 0.01);
      const maxVolBar = volumeProfileResult.profile.find(p => p.volume === maxVol);

      // Get top 5 bars by volume
      const top5Bars = [...volumeProfileResult.profile]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5)
        .map((bar, i) => `${i + 1}. Price ${bar.price.toFixed(2)}: Volume ${bar.volume.toFixed(0)}`);

      console.log('[VOLUME PROFILE] Calculated:', {
        binCount: volumeProfileResult.profile.length,
        poc: volumeProfileResult.poc.toFixed(2),
        pocVolume: pocBar?.volume.toFixed(0),
        maxVolBar: `Price ${maxVolBar?.price.toFixed(2)}: Volume ${maxVolBar?.volume.toFixed(0)}`,
        pocMatchesMax: Math.abs((pocBar?.volume || 0) - maxVol) < 0.01,
        valueAreaHigh: volumeProfileResult.valueAreaHigh.toFixed(2),
        valueAreaLow: volumeProfileResult.valueAreaLow.toFixed(2),
        totalVolume: volumeProfileResult.totalVolume.toFixed(0),
      });

      console.log('[VOLUME PROFILE] Top 5 bars by volume:', top5Bars);

      // Remove old series if they exist
      if (pocLineRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(pocLineRef.current);
          pocLineRef.current = null;
        } catch (e) {
          console.warn('Error removing POC line:', e);
        }
      }
      if (valueAreaHighLineRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(valueAreaHighLineRef.current);
          valueAreaHighLineRef.current = null;
        } catch (e) {
          console.warn('Error removing Value Area High line:', e);
        }
      }
      if (valueAreaLowLineRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(valueAreaLowLineRef.current);
          valueAreaLowLineRef.current = null;
        } catch (e) {
          console.warn('Error removing Value Area Low line:', e);
        }
      }

      // Add POC (Point of Control) line - highest volume price
      const pocLine = mainChartInstanceRef.current.addLineSeries({
        color: '#FF6B6B',
        lineWidth: 2,
        lineStyle: 0, // Solid line
        title: 'POC',
      });
      pocLine.setData(data.map(d => ({ time: d.time as any, value: volumeProfileResult.poc })));
      pocLineRef.current = pocLine;

      // Add Value Area High line
      const vaHighLine = mainChartInstanceRef.current.addLineSeries({
        color: '#4ECDC4',
        lineWidth: 1,
        lineStyle: 2, // Dashed line
        title: 'VA High',
      });
      vaHighLine.setData(data.map(d => ({ time: d.time as any, value: volumeProfileResult.valueAreaHigh })));
      valueAreaHighLineRef.current = vaHighLine;

      // Add Value Area Low line
      const vaLowLine = mainChartInstanceRef.current.addLineSeries({
        color: '#4ECDC4',
        lineWidth: 1,
        lineStyle: 2, // Dashed line
        title: 'VA Low',
      });
      vaLowLine.setData(data.map(d => ({ time: d.time as any, value: volumeProfileResult.valueAreaLow })));
      valueAreaLowLineRef.current = vaLowLine;

    } else if (!indicators.volumeProfile) {
      // Remove all volume profile lines when disabled
      setVolumeProfileData(null);

      if (pocLineRef.current && mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(pocLineRef.current);
          pocLineRef.current = null;
        } catch (e) {
          console.warn('Error removing POC line:', e);
        }
      }
      if (valueAreaHighLineRef.current && mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(valueAreaHighLineRef.current);
          valueAreaHighLineRef.current = null;
        } catch (e) {
          console.warn('Error removing Value Area High line:', e);
        }
      }
      if (valueAreaLowLineRef.current && mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(valueAreaLowLineRef.current);
          valueAreaLowLineRef.current = null;
        } catch (e) {
          console.warn('Error removing Value Area Low line:', e);
        }
      }
    }

    // Fit content
    if (mainChartInstanceRef.current) {
      mainChartInstanceRef.current.timeScale().fitContent();
    }
  }, [data, indicators, visibleRange]);

  return (
    <div className="w-full">
      <div className="relative">
        <div ref={mainChartRef} className="border border-gray-200 rounded-t-lg" />

        {/* Volume Profile Histogram - Sideways Mountain */}
        {indicators.volumeProfile && volumeProfileData && mainChartInstanceRef.current && (
          <div
            className="absolute top-0 right-0 pointer-events-none z-50"
            style={{
              width: isMobile ? '100px' : '200px',
              height: indicators.rsi ? height - (isMobile ? 100 : 120) - 30 : height,
            }}
          >
            {(() => {
              // Get price range from profile
              const prices = volumeProfileData.profile.map((r: any) => r.price);
              const minPrice = Math.min(...prices);
              const maxPrice = Math.max(...prices);
              const priceRange = maxPrice - minPrice;
              const chartHeight = indicators.rsi ? height - (isMobile ? 100 : 120) - 30 : height;
              const maxVolume = Math.max(...volumeProfileData.profile.map((r: any) => r.volume));

              // Find top 5 bars by volume for debugging
              const top5 = [...volumeProfileData.profile]
                .sort((a, b) => b.volume - a.volume)
                .slice(0, 5)
                .map(r => ({ price: r.price.toFixed(2), volume: r.volume.toFixed(0) }));

              console.log('[VP] Rendering with manual positioning:', {
                minPrice: minPrice.toFixed(2),
                maxPrice: maxPrice.toFixed(2),
                priceRange: priceRange.toFixed(2),
                chartHeight,
                barCount: volumeProfileData.profile.length,
                poc: volumeProfileData.poc.toFixed(2),
                top5VolumeBar: top5,
              });

              return volumeProfileData.profile.map((row: any, index: number) => {
                try {
                  // Calculate Y position manually (inverted because chart grows downward)
                  const pricePercent = (maxPrice - row.price) / priceRange;
                  const yCoord = pricePercent * chartHeight;

                  // Calculate bar width (responsive for mobile)
                  const maxBarWidth = isMobile ? 60 : 120;
                  const barWidth = Math.max(2, (row.volume / maxVolume) * maxBarWidth);

                  // Check if this is in the value area
                  const isInValueArea = row.price >= volumeProfileData.valueAreaLow &&
                                        row.price <= volumeProfileData.valueAreaHigh;

                  // Check if this is POC
                  const isPOC = Math.abs(row.price - volumeProfileData.poc) < (volumeProfileData.poc * 0.001);

                  return (
                    <div
                      key={index}
                      className="absolute"
                      style={{
                        top: yCoord + 'px',
                        right: isMobile ? '35px' : '70px',
                        width: barWidth + 'px',
                        height: isMobile ? '1.5px' : '2px',
                        backgroundColor: isPOC
                          ? '#FF0000'
                          : isInValueArea
                            ? 'rgba(33, 150, 243, 0.9)'
                            : 'rgba(156, 163, 175, 0.7)',
                        boxShadow: isPOC ? '0 0 4px rgba(255,0,0,1)' : 'none',
                      }}
                    />
                  );
                } catch (e) {
                  console.error('[VP] Error rendering bar:', e);
                  return null;
                }
              });
            })()}
          </div>
        )}
      </div>

      {indicators.rsi && (
        <div ref={rsiChartRef} className="border border-t-0 border-gray-200 rounded-b-lg" />
      )}
    </div>
  );
}

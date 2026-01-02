'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
} from 'lightweight-charts';
import { calculateVolumeProfile } from '@/lib/indicators/volumeProfile';
import { detectHarmonicPatterns, HarmonicSetup } from '@/lib/indicators/harmonicDetection';

export interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FibonacciLevel {
  price: number;
  ratio: number;
  label: string;
  color: string;
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'high' | 'low';
}

export interface FibonacciTradingChartProps {
  symbol: string;
  interval: string;
  userId: string;
  height: number;
  lookbackDays: number;
  indicators: any;
  realtimePrice?: any;
}

export default function FibonacciTradingChart({
  symbol,
  interval,
  userId,
  height,
  lookbackDays,
  indicators,
  realtimePrice,
}: FibonacciTradingChartProps) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const mainChartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [volumeProfileData, setVolumeProfileData] = useState<any>(null);
  const [volumeProfileVisibleData, setVolumeProfileVisibleData] = useState<any>(null);
  const [visibleRange, setVisibleRange] = useState<any>(null);
  const visibleRangeRef = useRef<any>(null);

  const [fibLevels, setFibLevels] = useState<FibonacciLevel[]>([]);
  const [swingHigh, setSwingHigh] = useState<SwingPoint | null>(null);
  const [swingLow, setSwingLow] = useState<SwingPoint | null>(null);
  const [harmonicSetups, setHarmonicSetups] = useState<HarmonicSetup[]>([]);

  const pocLineRef = useRef<any>(null);
  const valueAreaHighLineRef = useRef<any>(null);
  const valueAreaLowLineRef = useRef<any>(null);
  const pocLineVisibleRef = useRef<any>(null);
  const valueAreaHighLineVisibleRef = useRef<any>(null);
  const valueAreaLowLineVisibleRef = useRef<any>(null);
  const fibLinesRef = useRef<any[]>([]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Initialize chart
  useEffect(() => {
    if (!mainChartRef.current) return;

    const chart = createChart(mainChartRef.current, {
      width: mainChartRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: '#FFFFFF' },
        textColor: '#191919',
      },
      grid: {
        vertLines: { color: '#F0F0F0' },
        horzLines: { color: '#F0F0F0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#D1D4DC',
      },
      rightPriceScale: {
        borderColor: '#D1D4DC',
      },
      localization: {
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short',
          });
        },
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: true,
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    mainChartInstanceRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    // Handle visible range changes
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      if (logicalRange) {
        const barsInfo = candlestickSeries.barsInLogicalRange(logicalRange);
        if (barsInfo) {
          const newRange = {
            from: barsInfo.barsBefore >= 0 ? barsInfo.barsBefore : 0,
            to: barsInfo.barsAfter >= 0 ? barsInfo.barsAfter : 0,
          };
          setVisibleRange(newRange);
          visibleRangeRef.current = newRange;
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
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update chart height when it changes
  useEffect(() => {
    if (mainChartInstanceRef.current) {
      mainChartInstanceRef.current.applyOptions({
        height: height,
      });
    }
  }, [height]);

  // Fetch and update data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = new Date();
        const from = new Date(today);
        from.setDate(today.getDate() - lookbackDays);

        const fromStr = from.toISOString().split('T')[0];
        const toStr = today.toISOString().split('T')[0];

        const response = await fetch(
          `/api/chart/historical?symbol=${encodeURIComponent(symbol)}&interval=${interval}&userId=${userId}&from=${fromStr}&to=${toStr}`
        );

        const result = await response.json();

        if (!result.success || !result.data) {
          console.error('Failed to fetch data:', result);
          return;
        }

        const data: ChartData[] = result.data.map((d: any) => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
        }));

        if (candlestickSeriesRef.current && data.length > 0) {
          candlestickSeriesRef.current.setData(data as unknown as CandlestickData[]);
          setChartData(data);
          processIndicators(data);
        }
      } catch (error) {
        console.error('Error fetching chart data:', error);
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 60000); // Refresh every minute

    return () => clearInterval(intervalId);
  }, [symbol, interval, userId, lookbackDays]);

  // Reprocess indicators when they change
  useEffect(() => {
    if (chartData.length > 0 && candlestickSeriesRef.current && mainChartInstanceRef.current) {
      console.log('[FIB] Reprocessing indicators...', {
        dataLength: chartData.length,
        showFibRetracement: indicators.showFibRetracement,
        showFibExtension: indicators.showFibExtension,
        firstCandle: chartData[0],
        lastCandle: chartData[chartData.length - 1]
      });

      // Handle Fibonacci Retracement
      if (indicators.showFibRetracement) {
        // Use a timeout to ensure the chart is fully initialized
        setTimeout(() => {
          if (!candlestickSeriesRef.current) {
            console.log('[FIB] Candlestick series not ready');
            return;
          }

          const { swingHigh: high, swingLow: low } = detectSwingPoints(chartData);

          console.log('[FIB] Swing points detected:', { high, low });

          if (high && low) {
            setSwingHigh(high);
            setSwingLow(low);

            const levels = calculateFibonacciLevels(high.price, low.price, high.index > low.index);
            console.log('[FIB] Drawing', levels.length, 'Fibonacci levels:', levels);
            setFibLevels(levels);

            // Draw Fibonacci lines
            drawFibonacciLines(levels);

            // Detect harmonic patterns (if enabled)
            if (indicators.showHarmonicPattern) {
              const harmonics = detectHarmonicPatterns(chartData, high, low);
              console.log('[HARMONIC] Detected', harmonics.length, 'patterns:', harmonics);
              setHarmonicSetups(harmonics);
            } else {
              setHarmonicSetups([]);
            }
          } else {
            console.log('[FIB] No swing points detected - cannot draw Fibonacci levels');
          }
        }, 100);
      } else {
        // Clear Fibonacci lines when disabled
        clearFibonacciLines();
        setFibLevels([]);
        setSwingHigh(null);
        setSwingLow(null);
        setHarmonicSetups([]);
      }
    }
  }, [chartData.length, indicators.showFibRetracement, indicators.showFibExtension, indicators.showHarmonicPattern]);

  // Process indicators and Fibonacci levels
  const processIndicators = (data: ChartData[]) => {
    if (!data || data.length === 0 || !mainChartInstanceRef.current) return;

    // Detect Swing Points and Calculate Fibonacci Levels
    if (indicators.showFibRetracement) {
      const { swingHigh: high, swingLow: low } = detectSwingPoints(data);

      if (high && low) {
        setSwingHigh(high);
        setSwingLow(low);

        const levels = calculateFibonacciLevels(high.price, low.price, high.index > low.index);
        setFibLevels(levels);

        // Draw Fibonacci lines
        drawFibonacciLines(levels);
      }
    }

    // Volume Profile - Overall
    if (indicators.volumeProfile && data.length > 0) {
      const volumeProfileResult = calculateVolumeProfile(
        data,
        indicators.volumeProfileBins || 50,
        0.70
      );

      setVolumeProfileData(volumeProfileResult);

      // Add POC lines
      if (candlestickSeriesRef.current) {
        // Remove old lines
        if (pocLineRef.current) {
          try {
            candlestickSeriesRef.current.removePriceLine(pocLineRef.current);
            pocLineRef.current = null;
          } catch (e) {}
        }
        if (valueAreaHighLineRef.current) {
          try {
            candlestickSeriesRef.current.removePriceLine(valueAreaHighLineRef.current);
            valueAreaHighLineRef.current = null;
          } catch (e) {}
        }
        if (valueAreaLowLineRef.current) {
          try {
            candlestickSeriesRef.current.removePriceLine(valueAreaLowLineRef.current);
            valueAreaLowLineRef.current = null;
          } catch (e) {}
        }

        pocLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: volumeProfileResult.poc,
          color: '#FF6B6B',
          lineWidth: 2,
          lineStyle: 0,
          lineVisible: true,
          axisLabelVisible: true,
          title: 'POC',
        });

        valueAreaHighLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: volumeProfileResult.valueAreaHigh,
          color: '#00BCD4',
          lineWidth: 2,
          lineStyle: 2,
          lineVisible: true,
          axisLabelVisible: true,
          title: 'VA High',
        });

        valueAreaLowLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: volumeProfileResult.valueAreaLow,
          color: '#00BCD4',
          lineWidth: 2,
          lineStyle: 2,
          lineVisible: true,
          axisLabelVisible: true,
          title: 'VA Low',
        });
      }
    }

    // Volume Profile - Visible Range
    if (indicators.volumeProfileVisible && visibleRangeRef.current && data.length > 0) {
      const { from, to } = visibleRangeRef.current;
      const visibleData = data.filter(d => d.time >= from && d.time <= to);

      if (visibleData.length > 10) {
        const volumeProfileVisibleResult = calculateVolumeProfile(
          visibleData,
          indicators.volumeProfileBins || 50,
          0.70
        );

        setVolumeProfileVisibleData(volumeProfileVisibleResult);
      }
    }

    // Fit content
    if (mainChartInstanceRef.current) {
      mainChartInstanceRef.current.timeScale().fitContent();
    }
  };

  // Detect swing high and swing low points - finds absolute highest/lowest in recent data
  const detectSwingPoints = (data: ChartData[]): { swingHigh: SwingPoint | null, swingLow: SwingPoint | null } => {
    if (data.length < 10) {
      console.log('[FIB] Not enough data for swing detection:', data.length);
      return { swingHigh: null, swingLow: null };
    }

    // Exclude only last 5 candles to avoid using immediate current price as X point
    // This allows recent patterns to form while excluding just the latest candle
    const historyLength = Math.max(10, data.length - 5); // Use all but last 5 candles, min 10 candles
    const recentData = data.slice(0, historyLength);

    console.log('[FIB] Finding absolute high/low in', recentData.length, 'candles (excluding last', data.length - historyLength, ')');

    let swingHigh: SwingPoint | null = null;
    let swingLow: SwingPoint | null = null;
    let maxHigh = -Infinity;
    let minLow = Infinity;

    // Find absolute highest high and lowest low in historical data
    for (let i = 0; i < recentData.length; i++) {
      const candle = recentData[i];

      if (candle.high > maxHigh) {
        maxHigh = candle.high;
        swingHigh = {
          index: i,
          time: candle.time,
          price: candle.high,
          type: 'high',
        };
      }

      if (candle.low < minLow) {
        minLow = candle.low;
        swingLow = {
          index: i,
          time: candle.time,
          price: candle.low,
          type: 'low',
        };
      }
    }

    console.log('[FIB] Detected Swing Points:', {
      swingHigh: swingHigh ? { price: swingHigh.price.toFixed(2), index: swingHigh.index, time: new Date(swingHigh.time * 1000).toLocaleString() } : null,
      swingLow: swingLow ? { price: swingLow.price.toFixed(2), index: swingLow.index, time: new Date(swingLow.time * 1000).toLocaleString() } : null,
      range: swingHigh && swingLow ? (swingHigh.price - swingLow.price).toFixed(2) : 'N/A'
    });

    return { swingHigh, swingLow };
  };

  // Calculate Fibonacci retracement levels
  const calculateFibonacciLevels = (high: number, low: number, isUptrend: boolean): FibonacciLevel[] => {
    const diff = high - low;

    const retracementLevels = [
      { ratio: 0, label: isUptrend ? 'Fib 0% (High)' : 'Fib 0% (Low)', color: '#9C27B0' },
      { ratio: 0.236, label: 'Fib 23.6%', color: '#E91E63' },
      { ratio: 0.382, label: 'Fib 38.2%', color: '#FF5722' },
      { ratio: 0.5, label: 'Fib 50%', color: '#FF9800' },
      { ratio: 0.618, label: 'Fib 61.8%', color: '#FFC107' },
      { ratio: 0.786, label: 'Fib 78.6%', color: '#8BC34A' },
      { ratio: 1, label: isUptrend ? 'Fib 100% (Low)' : 'Fib 100% (High)', color: '#4CAF50' },
    ];

    const extensionLevels = [
      { ratio: 1.272, label: 'Fib Ext 127.2%', color: '#00BCD4' },
      { ratio: 1.618, label: 'Fib Ext 161.8%', color: '#2196F3' },
      { ratio: 2.618, label: 'Fib Ext 261.8%', color: '#3F51B5' },
    ];

    const levels: FibonacciLevel[] = [];

    // Add retracement levels
    retracementLevels.forEach(level => {
      const price = isUptrend
        ? high - (diff * level.ratio)
        : low + (diff * level.ratio);

      levels.push({
        price,
        ratio: level.ratio,
        label: level.label,
        color: level.color,
      });
    });

    // Add extension levels if enabled
    if (indicators.showFibExtension) {
      extensionLevels.forEach(level => {
        const price = isUptrend
          ? high + (diff * (level.ratio - 1))
          : low - (diff * (level.ratio - 1));

        levels.push({
          price,
          ratio: level.ratio,
          label: level.label,
          color: level.color,
        });
      });
    }

    console.log('[FIB] Calculated levels:', levels);
    return levels;
  };

  // Clear Fibonacci lines from chart
  const clearFibonacciLines = () => {
    if (!candlestickSeriesRef.current) return;

    fibLinesRef.current.forEach(line => {
      try {
        candlestickSeriesRef.current?.removePriceLine(line);
      } catch (e) {}
    });
    fibLinesRef.current = [];
  };

  // Draw Fibonacci lines on chart
  const drawFibonacciLines = (levels: FibonacciLevel[]) => {
    if (!candlestickSeriesRef.current) {
      console.log('[FIB] Cannot draw lines - candlestick series not available');
      return;
    }

    // Remove old Fibonacci lines
    clearFibonacciLines();

    console.log('[FIB] Drawing', levels.length, 'price lines...');

    // Draw new lines
    levels.forEach((level, index) => {
      try {
        const line = candlestickSeriesRef.current?.createPriceLine({
          price: level.price,
          color: level.color,
          lineWidth: 2,
          lineStyle: level.ratio === 0.618 || level.ratio === 0.5 || level.ratio === 0.382 ? 0 : 2, // Solid for key levels
          lineVisible: true,
          axisLabelVisible: true,
          title: level.label,
        });
        if (line) {
          fibLinesRef.current.push(line);
          console.log(`[FIB] ✓ Line ${index + 1}: ${level.label} at ${level.price.toFixed(2)}`);
        } else {
          console.log(`[FIB] ✗ Failed to create line for ${level.label}`);
        }
      } catch (e) {
        console.error('[FIB] Error drawing line for', level.label, ':', e);
      }
    });

    console.log('[FIB] Total lines created:', fibLinesRef.current.length);
  };

  return (
    <div className="w-full">
      <div className="relative">
        <div ref={mainChartRef} className="border border-gray-200 rounded-lg" />

        {/* Volume Profile - Overall (Left side) */}
        {indicators.volumeProfile && volumeProfileData && mainChartInstanceRef.current && (
          <div
            className="absolute top-0 left-0 pointer-events-none z-50"
            style={{
              width: isMobile ? '100px' : '200px',
              height: height,
            }}
          >
            {volumeProfileData.profile.map((row: any, index: number) => {
              try {
                const yCoord = candlestickSeriesRef.current?.priceToCoordinate(row.price);
                if (yCoord === null || yCoord === undefined) return null;

                const maxVolume = Math.max(...volumeProfileData.profile.map((r: any) => r.volume));
                const maxBarWidth = isMobile ? 60 : 120;
                const barWidth = Math.max(2, (row.volume / maxVolume) * maxBarWidth);

                const isInValueArea = row.price >= volumeProfileData.valueAreaLow &&
                                      row.price <= volumeProfileData.valueAreaHigh;
                const isPOC = Math.abs(row.price - volumeProfileData.poc) < (volumeProfileData.poc * 0.001);

                return (
                  <div
                    key={index}
                    className="absolute"
                    style={{
                      top: yCoord + 'px',
                      left: isMobile ? '35px' : '70px',
                      width: barWidth + 'px',
                      height: isMobile ? '1.5px' : '2px',
                      backgroundColor: isPOC ? '#FF0000' : isInValueArea ? 'rgba(33, 150, 243, 0.9)' : 'rgba(156, 163, 175, 0.7)',
                      boxShadow: isPOC ? '0 0 4px rgba(255,0,0,1)' : 'none',
                    }}
                  />
                );
              } catch (e) {
                return null;
              }
            })}
          </div>
        )}

        {/* Volume Profile - Visible Range (Right side) */}
        {indicators.volumeProfileVisible && volumeProfileVisibleData && mainChartInstanceRef.current && (
          <div
            className="absolute top-0 pointer-events-none z-50"
            style={{
              right: isMobile ? '35px' : '70px',
              width: isMobile ? '100px' : '200px',
              height: height,
            }}
          >
            {volumeProfileVisibleData.profile.map((row: any, index: number) => {
              try {
                const yCoord = candlestickSeriesRef.current?.priceToCoordinate(row.price);
                if (yCoord === null || yCoord === undefined) return null;

                const maxVolume = Math.max(...volumeProfileVisibleData.profile.map((r: any) => r.volume));
                const maxBarWidth = isMobile ? 60 : 120;
                const barWidth = Math.max(2, (row.volume / maxVolume) * maxBarWidth);

                const isInValueArea = row.price >= volumeProfileVisibleData.valueAreaLow &&
                                      row.price <= volumeProfileVisibleData.valueAreaHigh;
                const isPOC = Math.abs(row.price - volumeProfileVisibleData.poc) < (volumeProfileVisibleData.poc * 0.001);

                return (
                  <div
                    key={index}
                    className="absolute"
                    style={{
                      top: yCoord + 'px',
                      left: '0px',
                      width: barWidth + 'px',
                      height: isMobile ? '1.5px' : '2px',
                      backgroundColor: isPOC ? '#2196F3' : isInValueArea ? 'rgba(76, 175, 80, 0.9)' : 'rgba(156, 163, 175, 0.7)',
                      boxShadow: isPOC ? '0 0 4px rgba(33,150,243,1)' : 'none',
                    }}
                  />
                );
              } catch (e) {
                return null;
              }
            })}
          </div>
        )}

        {/* Fibonacci Zones and Labels */}
        {indicators.showFibRetracement && swingHigh && swingLow && fibLevels.length > 0 && mainChartInstanceRef.current && candlestickSeriesRef.current && (
          <div className="absolute top-0 left-0 w-full pointer-events-none z-40" style={{ height: height }}>
            {/* Background zones between levels */}
            {fibLevels.slice(0, -1).map((level, index) => {
              try {
                const nextLevel = fibLevels[index + 1];
                const y1 = candlestickSeriesRef.current?.priceToCoordinate(level.price);
                const y2 = candlestickSeriesRef.current?.priceToCoordinate(nextLevel.price);

                if (y1 === null || y1 === undefined || y2 === null || y2 === undefined) return null;

                const top = Math.min(y1, y2);
                const height = Math.abs(y2 - y1);

                // Get color with opacity
                const getZoneColor = (ratio: number) => {
                  switch (ratio) {
                    case 0: return 'rgba(156, 39, 176, 0.1)'; // Purple
                    case 0.236: return 'rgba(233, 30, 99, 0.1)'; // Pink
                    case 0.382: return 'rgba(255, 87, 34, 0.15)'; // Orange-red
                    case 0.5: return 'rgba(255, 152, 0, 0.15)'; // Orange
                    case 0.618: return 'rgba(255, 193, 7, 0.15)'; // Yellow
                    case 0.786: return 'rgba(139, 195, 74, 0.1)'; // Light green
                    default: return 'rgba(76, 175, 80, 0.1)'; // Green
                  }
                };

                return (
                  <div
                    key={`zone-${index}`}
                    className="absolute left-0 right-0"
                    style={{
                      top: top + 'px',
                      height: height + 'px',
                      backgroundColor: getZoneColor(level.ratio),
                      borderTop: `1px solid ${level.color}`,
                    }}
                  />
                );
              } catch (e) {
                return null;
              }
            })}

            {/* Left side labels */}
            {fibLevels.map((level, index) => {
              try {
                const yCoord = candlestickSeriesRef.current?.priceToCoordinate(level.price);
                if (yCoord === null || yCoord === undefined) return null;

                const ratioPercent = (level.ratio * 100).toFixed(1);
                const priceStr = level.price.toFixed(2);

                return (
                  <div
                    key={`label-${index}`}
                    className="absolute text-xs font-semibold"
                    style={{
                      left: '10px',
                      top: (yCoord - 10) + 'px',
                      color: level.color,
                      textShadow: '0 0 3px white, 0 0 3px white',
                    }}
                  >
                    {ratioPercent}% ({priceStr})
                  </div>
                );
              } catch (e) {
                return null;
              }
            })}

            {/* Diagonal trend line from swing high to swing low */}
            {(() => {
              try {
                const highY = candlestickSeriesRef.current?.priceToCoordinate(swingHigh.price);
                const lowY = candlestickSeriesRef.current?.priceToCoordinate(swingLow.price);

                // Get time coordinates
                const highX = mainChartInstanceRef.current?.timeScale().timeToCoordinate(swingHigh.time as any);
                const lowX = mainChartInstanceRef.current?.timeScale().timeToCoordinate(swingLow.time as any);

                if (highY === null || highY === undefined || lowY === null || lowY === undefined ||
                    highX === null || highX === undefined || lowX === null || lowX === undefined) {
                  console.log('[FIB] Cannot draw diagonal line - coordinates not available');
                  return null;
                }

                const angle = Math.atan2(lowY - highY, lowX - highX) * (180 / Math.PI);
                const length = Math.sqrt(Math.pow(lowX - highX, 2) + Math.pow(lowY - highY, 2));

                console.log('[FIB] Drawing diagonal line:', {
                  highX, highY, lowX, lowY, angle: angle.toFixed(2), length: length.toFixed(2)
                });

                return (
                  <>
                    {/* Diagonal line */}
                    <div
                      className="absolute origin-left"
                      style={{
                        left: highX + 'px',
                        top: highY + 'px',
                        width: length + 'px',
                        height: '3px',
                        backgroundColor: '#9E9E9E',
                        transform: `rotate(${angle}deg)`,
                        opacity: 0.6,
                      }}
                    />
                    {/* Circle at swing high */}
                    <div
                      className="absolute rounded-full border-4"
                      style={{
                        left: (highX - 8) + 'px',
                        top: (highY - 8) + 'px',
                        width: '16px',
                        height: '16px',
                        borderColor: '#2196F3',
                        backgroundColor: 'white',
                      }}
                    />
                    {/* Circle at swing low */}
                    <div
                      className="absolute rounded-full border-4"
                      style={{
                        left: (lowX - 8) + 'px',
                        top: (lowY - 8) + 'px',
                        width: '16px',
                        height: '16px',
                        borderColor: '#2196F3',
                        backgroundColor: 'white',
                      }}
                    />
                  </>
                );
              } catch (e) {
                console.error('[FIB] Error drawing diagonal line:', e);
                return null;
              }
            })()}
          </div>
        )}

        {/* Fibonacci Info Badge */}
        {indicators.showFibRetracement && swingHigh && swingLow && fibLevels.length > 0 && (
          <div className="absolute top-2 left-2 px-2 py-1.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg shadow-lg z-50 pointer-events-none">
            <div className="font-bold text-[10px]">Fibonacci Retracement</div>
            <div className="text-[9px] mt-0.5">High: {swingHigh.price.toFixed(2)}</div>
            <div className="text-[9px]">Low: {swingLow.price.toFixed(2)}</div>
            <div className="text-[9px] opacity-90 mt-0.5">Range: {(swingHigh.price - swingLow.price).toFixed(2)} pts</div>
          </div>
        )}

        {/* Harmonic Pattern Markers (XABCD) */}
        {indicators.showHarmonicPattern && harmonicSetups.length > 0 && harmonicSetups.map((setup, setupIndex) => (
          <div key={`harmonic-${setupIndex}`} className="absolute top-0 left-0 w-full pointer-events-none z-45" style={{ height: height }}>
            {/* Draw connecting lines X→A→B→C */}
            {(() => {
              try {
                const { X, A, B, C } = setup.points;
                if (!B) return null;

                const xY = candlestickSeriesRef.current?.priceToCoordinate(X.price);
                const aY = candlestickSeriesRef.current?.priceToCoordinate(A.price);
                const bY = candlestickSeriesRef.current?.priceToCoordinate(B.price);
                const cY = C ? candlestickSeriesRef.current?.priceToCoordinate(C.price) : null;

                const xX = mainChartInstanceRef.current?.timeScale().timeToCoordinate(X.time as any);
                const aX = mainChartInstanceRef.current?.timeScale().timeToCoordinate(A.time as any);
                const bX = mainChartInstanceRef.current?.timeScale().timeToCoordinate(B.time as any);
                const cX = C ? mainChartInstanceRef.current?.timeScale().timeToCoordinate(C.time as any) : null;

                if (xY === null || xY === undefined || aY === null || aY === undefined ||
                    bY === null || bY === undefined || xX === null || xX === undefined ||
                    aX === null || aX === undefined || bX === null || bX === undefined) {
                  return null;
                }

                const lineColor = setup.type === 'bullish' ? '#10B981' : '#EF4444';

                // Calculate line lengths and angles
                const calcLine = (x1: number, y1: number, x2: number, y2: number) => ({
                  length: Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)),
                  angle: Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI),
                });

                const lineXA = calcLine(xX, xY, aX, aY);
                const lineAB = calcLine(aX, aY, bX, bY);
                const lineBC = C && cX !== null && cX !== undefined && cY !== null && cY !== undefined
                  ? calcLine(bX, bY, cX, cY)
                  : null;

                return (
                  <>
                    {/* Line X→A */}
                    <div
                      className="absolute origin-left"
                      style={{
                        left: xX + 'px',
                        top: xY + 'px',
                        width: lineXA.length + 'px',
                        height: '2px',
                        backgroundColor: lineColor,
                        transform: `rotate(${lineXA.angle}deg)`,
                        opacity: 0.6,
                      }}
                    />
                    {/* Line A→B */}
                    <div
                      className="absolute origin-left"
                      style={{
                        left: aX + 'px',
                        top: aY + 'px',
                        width: lineAB.length + 'px',
                        height: '2px',
                        backgroundColor: lineColor,
                        transform: `rotate(${lineAB.angle}deg)`,
                        opacity: 0.6,
                      }}
                    />
                    {/* Line B→C */}
                    {lineBC && cX !== null && cX !== undefined && cY !== null && cY !== undefined && (
                      <div
                        className="absolute origin-left"
                        style={{
                          left: bX + 'px',
                          top: bY + 'px',
                          width: lineBC.length + 'px',
                          height: '2px',
                          backgroundColor: lineColor,
                          transform: `rotate(${lineBC.angle}deg)`,
                          opacity: 0.6,
                        }}
                      />
                    )}

                    {/* Point X (Gray) */}
                    <div
                      className="absolute rounded-full border-3"
                      style={{
                        left: (xX - 6) + 'px',
                        top: (xY - 6) + 'px',
                        width: '12px',
                        height: '12px',
                        borderWidth: '3px',
                        borderColor: '#6B7280',
                        backgroundColor: 'white',
                      }}
                    />
                    <div
                      className="absolute text-xs font-bold"
                      style={{
                        left: (xX - 8) + 'px',
                        top: (xY - 24) + 'px',
                        color: '#6B7280',
                        textShadow: '0 0 3px white, 0 0 3px white',
                      }}
                    >
                      X
                    </div>

                    {/* Point A (Red/Green) */}
                    <div
                      className="absolute rounded-full border-3"
                      style={{
                        left: (aX - 6) + 'px',
                        top: (aY - 6) + 'px',
                        width: '12px',
                        height: '12px',
                        borderWidth: '3px',
                        borderColor: lineColor,
                        backgroundColor: 'white',
                      }}
                    />
                    <div
                      className="absolute text-xs font-bold"
                      style={{
                        left: (aX - 8) + 'px',
                        top: (aY - 24) + 'px',
                        color: lineColor,
                        textShadow: '0 0 3px white, 0 0 3px white',
                      }}
                    >
                      A
                    </div>

                    {/* Point B (Blue) */}
                    <div
                      className="absolute rounded-full border-3"
                      style={{
                        left: (bX - 6) + 'px',
                        top: (bY - 6) + 'px',
                        width: '12px',
                        height: '12px',
                        borderWidth: '3px',
                        borderColor: '#3B82F6',
                        backgroundColor: 'white',
                      }}
                    />
                    <div
                      className="absolute text-xs font-bold"
                      style={{
                        left: (bX - 8) + 'px',
                        top: (bY - 24) + 'px',
                        color: '#3B82F6',
                        textShadow: '0 0 3px white, 0 0 3px white',
                      }}
                    >
                      B
                    </div>

                    {/* Projected C Zone - Show where C could form if it doesn't exist yet */}
                    {!C && B && (() => {
                      try {
                        // Calculate expected C zone (38.2%-88.6% pullback from B)
                        const AB_range = setup.type === 'bullish' ? B.price - A.price : A.price - B.price;
                        const minC_price = setup.type === 'bullish'
                          ? B.price - AB_range * 0.886  // Max pullback down
                          : B.price + AB_range * 0.382; // Min pullback up
                        const maxC_price = setup.type === 'bullish'
                          ? B.price - AB_range * 0.382  // Min pullback down
                          : B.price + AB_range * 0.886; // Max pullback up

                        const minC_y = candlestickSeriesRef.current?.priceToCoordinate(minC_price);
                        const maxC_y = candlestickSeriesRef.current?.priceToCoordinate(maxC_price);

                        if (minC_y === null || minC_y === undefined || maxC_y === null || maxC_y === undefined) {
                          return null;
                        }

                        const zoneTop = Math.min(minC_y, maxC_y);
                        const zoneHeight = Math.abs(maxC_y - minC_y);

                        return (
                          <>
                            {/* Projected C Zone Rectangle */}
                            <div
                              className="absolute"
                              style={{
                                left: (bX + 20) + 'px',
                                top: zoneTop + 'px',
                                width: '100px',
                                height: zoneHeight + 'px',
                                backgroundColor: setup.type === 'bullish' ? '#10B98120' : '#EF444420',
                                border: `2px dashed ${setup.type === 'bullish' ? '#10B981' : '#EF4444'}`,
                                borderRadius: '4px',
                              }}
                            />
                            {/* C Zone Label */}
                            <div
                              className="absolute text-xs font-bold px-2 py-1 rounded"
                              style={{
                                left: (bX + 25) + 'px',
                                top: (zoneTop + zoneHeight / 2 - 10) + 'px',
                                color: setup.type === 'bullish' ? '#10B981' : '#EF4444',
                                backgroundColor: 'rgba(255,255,255,0.9)',
                                border: `1px solid ${setup.type === 'bullish' ? '#10B981' : '#EF4444'}`,
                              }}
                            >
                              C Zone
                            </div>
                          </>
                        );
                      } catch (e) {
                        console.error('[HARMONIC] Error drawing C zone:', e);
                        return null;
                      }
                    })()}

                    {/* Point C (Yellow) if exists */}
                    {C && cX !== null && cX !== undefined && cY !== null && cY !== undefined && (
                      <>
                        <div
                          className="absolute rounded-full border-3"
                          style={{
                            left: (cX - 6) + 'px',
                            top: (cY - 6) + 'px',
                            width: '12px',
                            height: '12px',
                            borderWidth: '3px',
                            borderColor: '#F59E0B',
                            backgroundColor: 'white',
                          }}
                        />
                        <div
                          className="absolute text-xs font-bold"
                          style={{
                            left: (cX - 8) + 'px',
                            top: (cY - 24) + 'px',
                            color: '#F59E0B',
                            textShadow: '0 0 3px white, 0 0 3px white',
                          }}
                        >
                          C
                        </div>

                        {/* Entry signal arrow if status is valid */}
                        {setup.status === 'valid' && setup.entryPrice && (
                          <div
                            className="absolute text-2xl"
                            style={{
                              left: (cX + 15) + 'px',
                              top: (cY - 12) + 'px',
                            }}
                          >
                            {setup.type === 'bullish' ? '↗' : '↘'}
                          </div>
                        )}
                      </>
                    )}

                    {/* Projected D Zone - Show when C exists to indicate potential D targets */}
                    {C && setup.dProjections && setup.dProjections.length > 0 && cX !== null && cX !== undefined && (() => {
                      try {
                        // Get D projection prices
                        const d_100 = setup.dProjections.find(d => d.ratio === 1.0);    // AB=CD
                        const d_1618 = setup.dProjections.find(d => d.ratio === 1.618); // Golden ratio

                        if (!d_100 || !d_1618) return null;

                        // Convert prices to Y coordinates
                        const d100_y = candlestickSeriesRef.current?.priceToCoordinate(d_100.price);
                        const d1618_y = candlestickSeriesRef.current?.priceToCoordinate(d_1618.price);

                        if (d100_y === null || d100_y === undefined || d1618_y === null || d1618_y === undefined) {
                          return null;
                        }

                        // Calculate zone dimensions (from AB=CD to 161.8%)
                        const zoneTop = Math.min(d100_y, d1618_y);
                        const zoneHeight = Math.abs(d1618_y - d100_y);

                        // Position zone to the right of C
                        const zoneLeftOffset = cX + 20;
                        const zoneWidth = 120;

                        return (
                          <>
                            {/* Shaded D Zone Rectangle */}
                            <div
                              className="absolute"
                              style={{
                                left: zoneLeftOffset + 'px',
                                top: zoneTop + 'px',
                                width: zoneWidth + 'px',
                                height: zoneHeight + 'px',
                                backgroundColor: '#8B5CF620', // Purple with 20% opacity
                                border: '2px dashed #8B5CF6',
                                borderRadius: '4px',
                              }}
                            />

                            {/* D Zone Main Label */}
                            <div
                              className="absolute text-xs font-bold px-2 py-1 rounded"
                              style={{
                                left: (zoneLeftOffset + 5) + 'px',
                                top: (zoneTop + zoneHeight / 2 - 10) + 'px',
                                color: '#8B5CF6',
                                backgroundColor: 'rgba(255,255,255,0.95)',
                                border: '1px solid #8B5CF6',
                              }}
                            >
                              D Zone
                            </div>

                            {/* Individual D Target Lines and Labels */}
                            {setup.dProjections.map((dProj, idx) => {
                              const dY = candlestickSeriesRef.current?.priceToCoordinate(dProj.price);

                              if (dY === null || dY === undefined) return null;

                              // Line weight based on importance
                              const getLineStyle = (ratio: number) => {
                                if (ratio === 1.0) return { opacity: 0.8, width: '2px' }; // AB=CD - primary
                                if (ratio === 1.618) return { opacity: 0.9, width: '3px' }; // Golden - strongest
                                return { opacity: 0.6, width: '1.5px' }; // Others
                              };

                              const lineStyle = getLineStyle(dProj.ratio);

                              return (
                                <div key={`d-target-${idx}`}>
                                  {/* Horizontal target line */}
                                  <div
                                    className="absolute"
                                    style={{
                                      left: zoneLeftOffset + 'px',
                                      top: dY + 'px',
                                      width: zoneWidth + 'px',
                                      height: lineStyle.width,
                                      backgroundColor: '#8B5CF6',
                                      opacity: lineStyle.opacity,
                                    }}
                                  />

                                  {/* Target label */}
                                  <div
                                    className="absolute text-xs font-semibold px-1.5 py-0.5 rounded"
                                    style={{
                                      left: (zoneLeftOffset + zoneWidth + 5) + 'px',
                                      top: (dY - 10) + 'px',
                                      color: '#8B5CF6',
                                      backgroundColor: 'rgba(255,255,255,0.9)',
                                      border: '1px solid #8B5CF6',
                                      fontSize: '10px',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {dProj.label}
                                  </div>
                                </div>
                              );
                            })}

                            {/* AB=CD Ratio Notation */}
                            <div
                              className="absolute text-xs font-bold px-2 py-1 rounded"
                              style={{
                                left: (zoneLeftOffset + 5) + 'px',
                                top: (zoneTop - 25) + 'px',
                                color: '#8B5CF6',
                                backgroundColor: 'rgba(255,255,255,0.95)',
                                border: '1px solid #8B5CF6',
                              }}
                            >
                              AB=CD
                            </div>
                          </>
                        );
                      } catch (e) {
                        console.error('[HARMONIC] Error drawing D zone:', e);
                        return null;
                      }
                    })()}
                  </>
                );
              } catch (e) {
                console.error('[HARMONIC] Error drawing pattern:', e);
                return null;
              }
            })()}
          </div>
        ))}

        {/* Harmonic Pattern Info Badge */}
        {indicators.showHarmonicPattern && harmonicSetups.length > 0 && (
          <div className="absolute bottom-2 right-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg shadow-lg z-50 pointer-events-none">
            <div className="font-bold text-xs flex items-center gap-2">
              <span>{harmonicSetups[0].type === 'bullish' ? '📈' : '📉'}</span>
              {harmonicSetups[0].type === 'bullish' ? 'Bullish' : 'Bearish'} Harmonic
              <span className="text-xs font-normal opacity-75">({harmonicSetups[0].status})</span>
            </div>
            <div className="text-xs mt-1">
              AB: {(harmonicSetups[0].fibLevels.AB_retracement * 100).toFixed(1)}%
              {harmonicSetups[0].fibLevels.AB_retracement >= 0.786 && ' (Deep!)'}
            </div>
            {harmonicSetups[0].fibLevels.BC_pullback ? (
              <div className="text-xs">
                BC: {(harmonicSetups[0].fibLevels.BC_pullback * 100).toFixed(1)}%
              </div>
            ) : (
              <div className="text-xs opacity-75">
                ⏳ Waiting for C pullback (38-89%)
              </div>
            )}
            <div className="text-xs mt-1 opacity-90">
              Confidence: {harmonicSetups[0].confidence}%
            </div>
            {harmonicSetups[0].entryPrice && (
              <div className="text-xs font-bold mt-1 bg-white bg-opacity-20 px-2 py-1 rounded">
                Entry: {harmonicSetups[0].entryPrice.toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

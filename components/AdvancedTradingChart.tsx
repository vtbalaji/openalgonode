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
import { SMA, EMA, RSI, ATR, ADX } from 'technicalindicators';
import { calculateVolumeProfile } from '@/lib/indicators/volumeProfile';
import {
  calculateFairValueGaps,
  calculateOrderBlocks,
  calculateSupportResistance,
  calculatePremiumDiscount,
  type FairValueGap,
  type OrderBlock,
  type SupportResistanceLevel,
  type PremiumDiscountZone,
} from '@/lib/indicators/smcIndicators';
import {
  detectConsolidationBoxes,
  detectBreakouts,
  type ConsolidationBox,
  type BreakoutSignal,
} from '@/lib/indicators/consolidationDetection';

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
  atr: boolean;
  atrPeriod: number;
  showSignals: boolean;
  fastEma: number;
  slowEma: number;
  // Filters for automated trading
  adx: boolean;
  adxPeriod: number;
  adxThreshold: number;
  useVolumeFilter: boolean;
  useTimeFilter: boolean;
  // SMC indicators (for manual learning)
  showFVG: boolean; // Fair Value Gaps
  showOrderBlocks: boolean;
  showSupportResistance: boolean;
  showPremiumDiscount: boolean;
  // Consolidation breakout trading
  showConsolidation: boolean;
  consolidationMinDuration: number;
  consolidationMaxDuration: number;
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
  const fastEmaSeriesRef = useRef<any>(null);
  const slowEmaSeriesRef = useRef<any>(null);
  const atrSeriesRef = useRef<any>(null);
  const buySignalSeriesRef = useRef<any>(null);
  const sellSignalSeriesRef = useRef<any>(null);
  const stopLossLineRef = useRef<any>(null);

  const [volumeProfileData, setVolumeProfileData] = useState<any>(null);
  const [visibleRange, setVisibleRange] = useState<any>(null);
  const visibleRangeRef = useRef<any>(null);
  const [currentATR, setCurrentATR] = useState<number | null>(null);

  // SMC data states
  const [smcFVG, setSMCFVG] = useState<FairValueGap[]>([]);
  const [smcOrderBlocks, setSMCOrderBlocks] = useState<OrderBlock[]>([]);
  const [smcSR, setSMCSR] = useState<SupportResistanceLevel[]>([]);
  const [smcPD, setSMCPD] = useState<PremiumDiscountZone | null>(null);

  // Consolidation box & breakout signals
  const [consolidationBoxes, setConsolidationBoxes] = useState<ConsolidationBox[]>([]);
  const [breakoutSignals, setBreakoutSignals] = useState<BreakoutSignal[]>([]);

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
      localization: {
        timeFormatter: (timestamp: number) => {
          // Convert Unix timestamp to IST (UTC+5:30)
          const date = new Date(timestamp * 1000);
          // Format in IST timezone
          return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short',
          });
        },
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
        visible: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      leftPriceScale: {
        borderColor: '#d1d4dc',
        visible: true,
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
      priceScaleId: 'left', // Use left price scale for POC/VA labels
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
        localization: {
          timeFormatter: (timestamp: number) => {
            // Convert Unix timestamp to IST (UTC+5:30)
            const date = new Date(timestamp * 1000);
            // Format in IST timezone
            return date.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: 'short',
            });
          },
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

    // Fast and Slow EMA for signal generation
    let fastEmaValues: number[] = [];
    let slowEmaValues: number[] = [];

    if (indicators.showSignals && mainChartInstanceRef.current) {
      // Calculate Fast EMA
      if (data.length >= indicators.fastEma) {
        // Remove old fast EMA series
        if (fastEmaSeriesRef.current) {
          try {
            mainChartInstanceRef.current.removeSeries(fastEmaSeriesRef.current);
            fastEmaSeriesRef.current = null;
          } catch (e) {
            console.warn('Error removing fast EMA series:', e);
          }
        }

        fastEmaValues = EMA.calculate({ period: indicators.fastEma, values: closePrices });
        const fastEmaSeries = mainChartInstanceRef.current.addLineSeries({
          color: '#00BCD4',
          lineWidth: 1,
          title: `Fast EMA(${indicators.fastEma})`,
          priceScaleId: 'left', // Use left price scale for label
        });

        const fastEmaData = fastEmaValues.map((value, index) => ({
          time: data[index + indicators.fastEma - 1].time as any,
          value: value,
        }));

        fastEmaSeries.setData(fastEmaData);
        fastEmaSeriesRef.current = fastEmaSeries;
      }

      // Calculate Slow EMA
      if (data.length >= indicators.slowEma) {
        // Remove old slow EMA series
        if (slowEmaSeriesRef.current) {
          try {
            mainChartInstanceRef.current.removeSeries(slowEmaSeriesRef.current);
            slowEmaSeriesRef.current = null;
          } catch (e) {
            console.warn('Error removing slow EMA series:', e);
          }
        }

        slowEmaValues = EMA.calculate({ period: indicators.slowEma, values: closePrices });
        const slowEmaSeries = mainChartInstanceRef.current.addLineSeries({
          color: '#E91E63',
          lineWidth: 1,
          title: `Slow EMA(${indicators.slowEma})`,
          priceScaleId: 'left', // Use left price scale for label
        });

        const slowEmaData = slowEmaValues.map((value, index) => ({
          time: data[index + indicators.slowEma - 1].time as any,
          value: value,
        }));

        slowEmaSeries.setData(slowEmaData);
        slowEmaSeriesRef.current = slowEmaSeries;
      }

      // Detect Buy/Sell signals based on EMA crossover with filters
      if (fastEmaValues.length > 0 && slowEmaValues.length > 0) {
        const buySignals: any[] = [];
        const sellSignals: any[] = [];

        // Calculate ADX for trend filter
        let adxValues: number[] = [];
        if (indicators.adx && data.length >= indicators.adxPeriod) {
          const highPrices = data.map(d => d.high);
          const lowPrices = data.map(d => d.low);
          const adxResults = ADX.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: indicators.adxPeriod,
          });
          // Extract just the ADX value from each result
          adxValues = adxResults.map(result => result.adx);
          console.log(`[ADX] Calculated ${adxValues.length} values, last ADX: ${adxValues[adxValues.length - 1]?.toFixed(2)}`);
        }

        // Calculate average volume for volume filter
        let avgVolume = 0;
        if (indicators.useVolumeFilter) {
          const totalVolume = data.reduce((sum, d) => sum + d.volume, 0);
          avgVolume = totalVolume / data.length;
          console.log(`[VOLUME FILTER] Average volume: ${avgVolume.toFixed(0)}`);
        }

        // Calculate offset between fast and slow EMA arrays
        const fastOffset = indicators.fastEma - 1;
        const slowOffset = indicators.slowEma - 1;
        const arrayOffset = slowOffset - fastOffset; // How many indices ahead fastEma is
        const adxOffset = indicators.adx ? indicators.adxPeriod : 0; // ADX calculation offset

        // Iterate through slowEmaValues (shorter array) starting from index 1
        for (let i = 1; i < slowEmaValues.length; i++) {
          // Get corresponding indices in fastEmaValues
          const fastIndex = i + arrayOffset;

          // Make sure we have valid indices
          if (fastIndex < 1 || fastIndex >= fastEmaValues.length) continue;

          const prevSlow = slowEmaValues[i - 1];
          const currSlow = slowEmaValues[i];
          const prevFast = fastEmaValues[fastIndex - 1];
          const currFast = fastEmaValues[fastIndex];

          // Calculate the actual data index for this signal
          const dataIndex = i + slowOffset;
          if (dataIndex >= data.length) continue;

          const candle = data[dataIndex];

          // === FILTER CHECKS ===

          // 1. ADX Filter: Only trade in strong trends (ADX > threshold)
          if (indicators.adx && adxValues.length > 0) {
            const adxIndex = dataIndex - adxOffset;
            if (adxIndex < 0 || adxIndex >= adxValues.length) continue;
            const currentADX = adxValues[adxIndex];
            if (currentADX < indicators.adxThreshold) {
              continue; // Skip signal - weak trend
            }
          }

          // 2. Volume Filter: Only trade with above-average volume
          if (indicators.useVolumeFilter) {
            if (candle.volume < avgVolume) {
              continue; // Skip signal - low volume
            }
          }

          // 3. Time Filter: Only trade during market hours (9:30 AM - 3:00 PM IST)
          if (indicators.useTimeFilter) {
            const candleTime = new Date(candle.time * 1000);
            const istTime = new Date(candleTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const hour = istTime.getHours();
            const minute = istTime.getMinutes();
            const timeInMinutes = hour * 60 + minute;
            const marketStart = 9 * 60 + 30; // 9:30 AM
            const marketEnd = 15 * 60; // 3:00 PM

            if (timeInMinutes < marketStart || timeInMinutes > marketEnd) {
              continue; // Skip signal - outside trading hours
            }
          }

          // === ALL FILTERS PASSED - ADD SIGNAL ===

          // Buy signal: Fast crosses above Slow (bullish)
          if (prevFast < prevSlow && currFast > currSlow) {
            buySignals.push({
              time: candle.time as any,
              position: 'belowBar',
              color: '#00C853', // Bright green
              shape: 'arrowUp', // Triangle pointing up
              text: 'BUY',
              size: 2, // Make it bigger
            });
          }

          // Sell signal: Fast crosses below Slow (bearish)
          if (prevFast > prevSlow && currFast < currSlow) {
            sellSignals.push({
              time: candle.time as any,
              position: 'aboveBar',
              color: '#D32F2F', // Bright red
              shape: 'arrowDown', // Triangle pointing down
              text: 'SELL',
              size: 2, // Make it bigger
            });
          }
        }

        // Combine buy and sell signals and add to candlestick series
        const allSignals = [...buySignals, ...sellSignals].sort((a, b) => a.time - b.time);

        if (allSignals.length > 0 && candlestickSeriesRef.current) {
          candlestickSeriesRef.current.setMarkers(allSignals);
        }

        const filtersActive = indicators.adx || indicators.useVolumeFilter || indicators.useTimeFilter;
        const filterNames = [
          indicators.adx ? `ADX>${indicators.adxThreshold}` : '',
          indicators.useVolumeFilter ? 'Volume' : '',
          indicators.useTimeFilter ? 'Time(9:30-15:00)' : '',
        ].filter(f => f).join(' + ');

        console.log(`[SIGNALS] ${filtersActive ? 'FILTERED' : 'UNFILTERED'} - Detected ${buySignals.length} BUY and ${sellSignals.length} SELL signals`);
        if (filtersActive) {
          console.log(`[FILTERS ACTIVE] ${filterNames}`);
        }
        if (buySignals.length > 0) {
          console.log('[BUY SIGNALS]', buySignals.map(s => new Date(s.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })));
        }
        if (sellSignals.length > 0) {
          console.log('[SELL SIGNALS]', sellSignals.map(s => new Date(s.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })));
        }
      }
    } else {
      // Remove signal-related series and clear markers when disabled
      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setMarkers([]);
      }

      if (fastEmaSeriesRef.current && mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(fastEmaSeriesRef.current);
          fastEmaSeriesRef.current = null;
        } catch (e) {
          console.warn('Error removing fast EMA series:', e);
        }
      }
      if (slowEmaSeriesRef.current && mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(slowEmaSeriesRef.current);
          slowEmaSeriesRef.current = null;
        } catch (e) {
          console.warn('Error removing slow EMA series:', e);
        }
      }
    }

    // ATR (Average True Range) for volatility and stop-loss calculation
    if (indicators.atr && data.length >= indicators.atrPeriod && mainChartInstanceRef.current) {
      // Remove old ATR line
      if (atrSeriesRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(atrSeriesRef.current);
          atrSeriesRef.current = null;
        } catch (e) {
          console.warn('Error removing ATR series:', e);
        }
      }

      const highPrices = data.map(d => d.high);
      const lowPrices = data.map(d => d.low);

      const atrValues = ATR.calculate({
        high: highPrices,
        low: lowPrices,
        close: closePrices,
        period: indicators.atrPeriod,
      });

      const lastATR = atrValues[atrValues.length - 1];
      setCurrentATR(lastATR || null);

      console.log(`[ATR] Calculated ${atrValues.length} ATR values, last ATR: ${lastATR?.toFixed(2)}`);
    } else {
      setCurrentATR(null);

      if (atrSeriesRef.current && mainChartInstanceRef.current) {
        try {
          mainChartInstanceRef.current.removeSeries(atrSeriesRef.current);
          atrSeriesRef.current = null;
        } catch (e) {
          console.warn('Error removing ATR series:', e);
        }
      }
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

      // Add POC, VA High, VA Low as price lines on the candlestick series
      if (candlestickSeriesRef.current) {
        // Remove old price lines if they exist
        if (pocLineRef.current) {
          try {
            candlestickSeriesRef.current.removePriceLine(pocLineRef.current);
            pocLineRef.current = null;
          } catch (e) {
            console.warn('Error removing POC price line:', e);
          }
        }
        if (valueAreaHighLineRef.current) {
          try {
            candlestickSeriesRef.current.removePriceLine(valueAreaHighLineRef.current);
            valueAreaHighLineRef.current = null;
          } catch (e) {
            console.warn('Error removing VA High price line:', e);
          }
        }
        if (valueAreaLowLineRef.current) {
          try {
            candlestickSeriesRef.current.removePriceLine(valueAreaLowLineRef.current);
            valueAreaLowLineRef.current = null;
          } catch (e) {
            console.warn('Error removing VA Low price line:', e);
          }
        }

        // Add POC (Point of Control) line - highest volume price
        pocLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: volumeProfileResult.poc,
          color: '#FF6B6B',
          lineWidth: 2,
          lineStyle: 0, // Solid
          axisLabelVisible: true, // Show on price scale
          title: 'POC',
        });

        // Add Value Area High line
        valueAreaHighLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: volumeProfileResult.valueAreaHigh,
          color: '#00BCD4', // Brighter cyan
          lineWidth: 2, // Thicker line
          lineStyle: 2, // Dashed
          axisLabelVisible: true, // Show on price scale
          title: 'VA High',
        });

        // Add Value Area Low line
        valueAreaLowLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: volumeProfileResult.valueAreaLow,
          color: '#00BCD4', // Brighter cyan
          lineWidth: 2, // Thicker line
          lineStyle: 2, // Dashed
          axisLabelVisible: true, // Show on price scale
          title: 'VA Low',
        });
      }

    } else if (!indicators.volumeProfile) {
      // Remove all volume profile lines when disabled
      setVolumeProfileData(null);

      if (pocLineRef.current && candlestickSeriesRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(pocLineRef.current);
          pocLineRef.current = null;
        } catch (e) {
          console.warn('Error removing POC price line:', e);
        }
      }
      if (valueAreaHighLineRef.current && candlestickSeriesRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(valueAreaHighLineRef.current);
          valueAreaHighLineRef.current = null;
        } catch (e) {
          console.warn('Error removing Value Area High price line:', e);
        }
      }
      if (valueAreaLowLineRef.current && candlestickSeriesRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(valueAreaLowLineRef.current);
          valueAreaLowLineRef.current = null;
        } catch (e) {
          console.warn('Error removing Value Area Low price line:', e);
        }
      }
    }

    // Calculate SMC indicators if enabled
    if (indicators.showFVG) {
      const fvg = calculateFairValueGaps(data);
      setSMCFVG(fvg);
      console.log(`[SMC] Fair Value Gaps: ${fvg.length} unfilled gaps`);
    } else {
      setSMCFVG([]);
    }

    if (indicators.showOrderBlocks) {
      const ob = calculateOrderBlocks(data);
      setSMCOrderBlocks(ob);
      console.log(`[SMC] Order Blocks: ${ob.length} blocks (${ob.filter(o => o.type === 'bullish').length} bullish, ${ob.filter(o => o.type === 'bearish').length} bearish)`);
    } else {
      setSMCOrderBlocks([]);
    }

    if (indicators.showSupportResistance) {
      const sr = calculateSupportResistance(data);
      setSMCSR(sr);
      console.log(`[SMC] Support/Resistance: ${sr.length} levels`);
    } else {
      setSMCSR([]);
    }

    if (indicators.showPremiumDiscount) {
      const pd = calculatePremiumDiscount(data);
      setSMCPD(pd);
      if (pd) {
        console.log(`[SMC] Premium/Discount: High=${pd.high.toFixed(2)}, Low=${pd.low.toFixed(2)}, Eq=${pd.equilibrium.toFixed(2)}`);
      }
    } else {
      setSMCPD(null);
    }

    // Calculate consolidation boxes and breakouts
    if (indicators.showConsolidation) {
      const boxes = detectConsolidationBoxes(
        data,
        indicators.consolidationMinDuration,
        indicators.consolidationMaxDuration
      );
      setConsolidationBoxes(boxes);

      const breakouts = detectBreakouts(data, boxes);
      setBreakoutSignals(breakouts);

      console.log(`[CONSOLIDATION] Detected ${boxes.length} boxes (${boxes.filter(b => b.isActive).length} active)`);
      console.log(`[BREAKOUT] Detected ${breakouts.length} breakout signals (${breakouts.filter(s => s.volumeConfirmed).length} volume-confirmed)`);

      // Add breakout markers to chart with ENTRY PRICE
      if (breakouts.length > 0 && candlestickSeriesRef.current) {
        const breakoutMarkers = breakouts.map(signal => ({
          time: signal.time as any,
          position: signal.type === 'bullish' ? 'belowBar' : 'aboveBar',
          color: signal.type === 'bullish' ? '#00C853' : '#FF3D00',
          shape: signal.type === 'bullish' ? 'arrowUp' : 'arrowDown',
          text: `${signal.type === 'bullish' ? 'BUY' : 'SELL'}@${signal.breakoutPrice.toFixed(2)}${signal.volumeConfirmed ? '✓' : ''}`,
          size: 3, // Larger size for visibility
        }));

        candlestickSeriesRef.current.setMarkers(breakoutMarkers);
      }
    } else {
      setConsolidationBoxes([]);
      setBreakoutSignals([]);
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
            className="absolute top-0 left-0 pointer-events-none z-50"
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
                        left: isMobile ? '35px' : '70px',
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

        {/* ATR Overlay Badge */}
        {indicators.atr && currentATR !== null && (
          <div
            className="absolute top-2 right-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg shadow-lg z-50 pointer-events-none"
            style={{ fontSize: isMobile ? '11px' : '13px' }}
          >
            <div className="font-bold">ATR({indicators.atrPeriod})</div>
            <div className="text-lg font-mono">{currentATR.toFixed(2)}</div>
            <div className="text-xs opacity-90">Stop: {(currentATR * 1.5).toFixed(2)}</div>
          </div>
        )}

        {/* SMC Visual Overlays */}
        {(() => {
          if (!mainChartInstanceRef.current || data.length === 0) return null;

          // Get chart dimensions and price range
          const chartHeight = indicators.rsi ? height - (isMobile ? 100 : 120) - 30 : height;
          const priceHigh = Math.max(...data.map(d => d.high));
          const priceLow = Math.min(...data.map(d => d.low));
          const priceRange = priceHigh - priceLow;

          // Helper: Convert price to Y coordinate
          const priceToY = (price: number) => {
            const percent = (priceHigh - price) / priceRange;
            return percent * chartHeight * 0.8; // 0.8 to account for margins
          };

          return (
            <>
              {/* Premium/Discount Zones */}
              {indicators.showPremiumDiscount && smcPD && (
                <>
                  {/* Premium Zone (above 50%) */}
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{
                      left: '70px',
                      right: '70px',
                      top: priceToY(smcPD.high) + 'px',
                      height: (priceToY(smcPD.equilibrium) - priceToY(smcPD.high)) + 'px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)', // Red tint for premium
                      borderTop: '1px dashed rgba(239, 68, 68, 0.5)',
                    }}
                  >
                    <span className="text-xs text-red-600 font-bold ml-2">PREMIUM</span>
                  </div>

                  {/* Equilibrium Line (50%) */}
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{
                      left: '70px',
                      right: '70px',
                      top: priceToY(smcPD.equilibrium) + 'px',
                      height: '2px',
                      backgroundColor: 'rgba(16, 185, 129, 0.8)', // Green for equilibrium
                    }}
                  >
                    <span className="text-xs text-green-600 font-bold ml-2 bg-white px-1">EQ: {smcPD.equilibrium.toFixed(2)}</span>
                  </div>

                  {/* Discount Zone (below 50%) */}
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{
                      left: '70px',
                      right: '70px',
                      top: priceToY(smcPD.equilibrium) + 'px',
                      height: (priceToY(smcPD.low) - priceToY(smcPD.equilibrium)) + 'px',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)', // Green tint for discount
                      borderBottom: '1px dashed rgba(34, 197, 94, 0.5)',
                    }}
                  >
                    <span className="text-xs text-green-600 font-bold ml-2">DISCOUNT</span>
                  </div>
                </>
              )}

              {/* Support/Resistance Levels */}
              {indicators.showSupportResistance && smcSR.map((level, idx) => (
                <div
                  key={`sr-${idx}`}
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: '70px',
                    right: '70px',
                    top: priceToY(level.price) + 'px',
                    height: '2px',
                    backgroundColor: level.type === 'support'
                      ? 'rgba(139, 92, 246, 0.7)' // Purple for support
                      : 'rgba(249, 115, 22, 0.7)', // Orange for resistance
                  }}
                >
                  <span className={`text-xs font-bold ml-2 px-1 ${
                    level.type === 'support' ? 'text-purple-600 bg-purple-50' : 'text-orange-600 bg-orange-50'
                  }`}>
                    {level.type === 'support' ? 'S' : 'R'}: {level.price.toFixed(2)} ({level.strength}x)
                  </span>
                </div>
              ))}

              {/* Order Blocks */}
              {indicators.showOrderBlocks && smcOrderBlocks.map((ob, idx) => {
                const obTop = priceToY(ob.high);
                const obBottom = priceToY(ob.low);
                const obHeight = obBottom - obTop;

                return (
                  <div
                    key={`ob-${idx}`}
                    className="absolute pointer-events-none z-15"
                    style={{
                      left: '70px',
                      width: '60px', // Fixed width for order block
                      top: obTop + 'px',
                      height: obHeight + 'px',
                      backgroundColor: ob.type === 'bullish'
                        ? 'rgba(34, 197, 94, 0.2)' // Green for bullish OB
                        : 'rgba(239, 68, 68, 0.2)', // Red for bearish OB
                      border: `2px solid ${ob.type === 'bullish' ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'}`,
                    }}
                  >
                    <span className={`text-xs font-bold ${ob.type === 'bullish' ? 'text-green-700' : 'text-red-700'}`}>
                      OB
                    </span>
                  </div>
                );
              })}

              {/* Fair Value Gaps */}
              {indicators.showFVG && smcFVG.map((fvg, idx) => {
                const fvgTop = priceToY(fvg.top);
                const fvgBottom = priceToY(fvg.bottom);
                const fvgHeight = fvgBottom - fvgTop;

                return (
                  <div
                    key={`fvg-${idx}`}
                    className="absolute pointer-events-none z-15"
                    style={{
                      left: '70px',
                      right: '70px',
                      top: fvgTop + 'px',
                      height: fvgHeight + 'px',
                      backgroundColor: fvg.type === 'bullish'
                        ? 'rgba(59, 130, 246, 0.15)' // Blue for bullish FVG
                        : 'rgba(249, 115, 22, 0.15)', // Orange for bearish FVG
                      border: `1px dashed ${fvg.type === 'bullish' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(249, 115, 22, 0.5)'}`,
                    }}
                  >
                    <span className={`text-xs font-bold ml-2 ${fvg.type === 'bullish' ? 'text-blue-600' : 'text-orange-600'}`}>
                      FVG
                    </span>
                  </div>
                );
              })}

              {/* Consolidation Box Lines */}
              {indicators.showConsolidation && consolidationBoxes.map((box, idx) => {
                const resistanceLine = priceToY(box.resistance);
                const supportLine = priceToY(box.support);

                return (
                  <div key={`consolidation-${idx}`}>
                    {/* Resistance Line (Upper) */}
                    <div
                      className="absolute pointer-events-none z-25"
                      style={{
                        left: isMobile ? '35px' : '70px',
                        right: isMobile ? '35px' : '70px',
                        top: resistanceLine + 'px',
                        height: '2px',
                        backgroundColor: box.isActive ? 'rgba(220, 38, 38, 0.8)' : 'rgba(220, 38, 38, 0.4)',
                        borderTop: `2px ${box.isActive ? 'solid' : 'dashed'} rgba(220, 38, 38, 0.8)`,
                      }}
                    >
                      <span
                        className="text-xs font-bold ml-2"
                        style={{
                          color: 'rgb(220, 38, 38)',
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          marginTop: '-12px',
                        }}
                      >
                        R: {box.resistance.toFixed(2)}
                      </span>
                    </div>

                    {/* Support Line (Lower) */}
                    <div
                      className="absolute pointer-events-none z-25"
                      style={{
                        left: isMobile ? '35px' : '70px',
                        right: isMobile ? '35px' : '70px',
                        top: supportLine + 'px',
                        height: '2px',
                        backgroundColor: box.isActive ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.4)',
                        borderTop: `2px ${box.isActive ? 'solid' : 'dashed'} rgba(34, 197, 94, 0.8)`,
                      }}
                    >
                      <span
                        className="text-xs font-bold ml-2"
                        style={{
                          color: 'rgb(34, 197, 94)',
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          marginTop: '-12px',
                        }}
                      >
                        S: {box.support.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Breakout Target Price Labels */}
              {indicators.showConsolidation && breakoutSignals.map((signal, idx) => {
                const targetY = priceToY(signal.targetPrice);

                return (
                  <div
                    key={`target-${idx}`}
                    className="absolute pointer-events-none z-30"
                    style={{
                      left: isMobile ? '35px' : '70px',
                      top: targetY + 'px',
                      marginTop: '-12px',
                    }}
                  >
                    <div
                      className="text-xs font-bold px-3 py-1 rounded shadow-lg"
                      style={{
                        backgroundColor: signal.type === 'bullish' ? 'rgba(0, 200, 83, 0.95)' : 'rgba(255, 61, 0, 0.95)',
                        color: 'white',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>🎯 Target: {signal.targetPrice.toFixed(2)}</span>
                      {signal.volumeConfirmed && <span>✓</span>}
                      <span className="text-[10px] opacity-80">({signal.strength}/10)</span>
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* Consolidation Info Badge */}
        {indicators.showConsolidation && (consolidationBoxes.length > 0 || breakoutSignals.length > 0) && (
          <div
            className="absolute top-2 right-2 px-3 py-2 bg-gradient-to-r from-red-500 to-green-600 text-white rounded-lg shadow-lg z-50 pointer-events-none"
            style={{ fontSize: isMobile ? '10px' : '12px' }}
          >
            <div className="font-bold mb-1">📊 Consolidation</div>
            {consolidationBoxes.length > 0 && (
              <div className="text-xs">
                Boxes: {consolidationBoxes.length} ({consolidationBoxes.filter(b => b.isActive).length} active)
              </div>
            )}
            {breakoutSignals.length > 0 && (
              <div className="text-xs">
                Breakouts: {breakoutSignals.length} ({breakoutSignals.filter(s => s.volumeConfirmed).length} vol✓)
              </div>
            )}
          </div>
        )}

        {/* SMC Info Badge */}
        {(indicators.showFVG || indicators.showOrderBlocks || indicators.showSupportResistance || indicators.showPremiumDiscount) && (
          <div
            className="absolute bottom-2 left-2 px-3 py-2 bg-gradient-to-r from-orange-500 to-purple-600 text-white rounded-lg shadow-lg z-50 pointer-events-none"
            style={{ fontSize: isMobile ? '10px' : '12px' }}
          >
            <div className="font-bold mb-1">🎓 SMC Active</div>
            {indicators.showFVG && smcFVG.length > 0 && (
              <div className="text-xs">FVG: {smcFVG.length} gaps</div>
            )}
            {indicators.showOrderBlocks && smcOrderBlocks.length > 0 && (
              <div className="text-xs">OB: {smcOrderBlocks.length} blocks</div>
            )}
            {indicators.showSupportResistance && smcSR.length > 0 && (
              <div className="text-xs">S/R: {smcSR.length} levels</div>
            )}
            {indicators.showPremiumDiscount && smcPD && (
              <div className="text-xs">P/D: {smcPD.equilibrium.toFixed(2)}</div>
            )}
          </div>
        )}
      </div>

      {indicators.rsi && (
        <div ref={rsiChartRef} className="border border-t-0 border-gray-200 rounded-b-lg" />
      )}
    </div>
  );
}

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
import { SMA, EMA, RSI, ADX } from 'technicalindicators';
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
  volumeProfileVisible: boolean;
  volumeProfileBins: number;
  showSignals: boolean;
  fastEma: number;
  slowEma: number;
  // Filters for automated trading
  adx: boolean;
  adxPeriod: number;
  adxThreshold: number;
  useVolumeFilter: boolean;
  useTimeFilter: boolean;
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
  // Visible range VP refs
  const pocLineVisibleRef = useRef<any>(null);
  const valueAreaHighLineVisibleRef = useRef<any>(null);
  const valueAreaLowLineVisibleRef = useRef<any>(null);
  const fastEmaSeriesRef = useRef<any>(null);
  const slowEmaSeriesRef = useRef<any>(null);
  const buySignalSeriesRef = useRef<any>(null);
  const sellSignalSeriesRef = useRef<any>(null);
  const stopLossLineRef = useRef<any>(null);

  const [volumeProfileData, setVolumeProfileData] = useState<any>(null);
  const [volumeProfileVisibleData, setVolumeProfileVisibleData] = useState<any>(null);
  const [visibleRange, setVisibleRange] = useState<any>(null);
  const visibleRangeRef = useRef<any>(null);
  const emaSignalsRef = useRef<any[]>([]);

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

          // Format: "21 Jan at 04:31 PM" in IST timezone
          const day = date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
          });

          const month = date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            month: 'short',
          });

          const time = date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });

          return `${day} ${month} at ${time}`;
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

            // Format: "21 Jan at 04:31 PM" in IST timezone
            const day = date.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
            });

            const month = date.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              month: 'short',
            });

            const time = date.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });

            return `${day} ${month} at ${time}`;
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

      // Detect Buy/Sell signals based on POC breakout (BUY) and EMA crossover (SELL)
      if (fastEmaValues.length > 0 && slowEmaValues.length > 0) {
        const buySignals: any[] = [];
        const sellSignals: any[] = [];

        // Calculate ADX for optional trend filter
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

        // Use OVERALL POC (doesn't change when zooming) instead of visible POC
        // This prevents signals from appearing in wrong places when user zooms/pans
        const overallPOC = volumeProfileData?.poc || null;

        if (overallPOC) {
          console.log(`[SIGNALS] Using overall POC: ${overallPOC.toFixed(2)} for buy signals (stable, doesn't change with zoom)`);
        } else {
          console.warn(`[SIGNALS] No overall POC available! Enable "VP: Overall" to get buy signals based on POC breakout.`);
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
          if (dataIndex >= data.length || dataIndex < 1) continue;

          const candle = data[dataIndex];
          const prevCandle = data[dataIndex - 1];

          // === ADX FILTER (Optional) ===
          let passedADX = true;
          if (indicators.adx && adxValues.length > 0) {
            const adxIndex = dataIndex - adxOffset;
            if (adxIndex >= 0 && adxIndex < adxValues.length) {
              const currentADX = adxValues[adxIndex];
              if (currentADX < indicators.adxThreshold) {
                passedADX = false; // Weak trend
              }
            }
          }

          // === BUY SIGNAL: All conditions met (any condition can trigger when others already true) ===
          if (overallPOC && passedADX) {
            const prevClose = prevCandle.close;
            const currClose = candle.close;

            // Current state of all conditions
            const priceAbovePOC = currClose > overallPOC;
            const priceAboveBothEMAs = currClose > currFast && currClose > currSlow;
            const fastAboveSlow = currFast > currSlow;

            // Previous state of all conditions
            const prevPriceAbovePOC = prevClose > overallPOC;
            const prevPriceAboveBothEMAs = prevClose > prevFast && prevClose > prevSlow;
            const prevFastAboveSlow = prevFast > prevSlow;

            // All conditions are TRUE now
            const allConditionsMet = priceAbovePOC && priceAboveBothEMAs && fastAboveSlow;

            // At least one condition JUST became true (wasn't true before)
            const anyConditionJustBecameTrue =
              (priceAbovePOC && !prevPriceAbovePOC) ||           // Price just crossed above POC
              (priceAboveBothEMAs && !prevPriceAboveBothEMAs) || // Price just crossed above EMAs
              (fastAboveSlow && !prevFastAboveSlow);             // Fast EMA just crossed above Slow

            // Signal: All conditions met AND at least one just became true
            if (allConditionsMet && anyConditionJustBecameTrue) {
              const triggerReason =
                (priceAbovePOC && !prevPriceAbovePOC) ? 'POC breakout' :
                (priceAboveBothEMAs && !prevPriceAboveBothEMAs) ? 'Price above EMAs' :
                'EMA crossover';

              console.log(`[BUY SIGNAL] Triggered by: ${triggerReason} at ${new Date(candle.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} | Price: ${currClose.toFixed(2)} | POC: ${overallPOC.toFixed(2)} | Fast: ${currFast.toFixed(2)} | Slow: ${currSlow.toFixed(2)}`);

              buySignals.push({
                time: candle.time as any,
                position: 'belowBar',
                color: '#00C853', // Bright green
                shape: 'arrowUp', // Triangle pointing up
                text: 'BUY',
                size: 2,
              });
            }
          }

          // === SELL SIGNAL: Fast EMA crosses BELOW Slow EMA ===
          if (passedADX) {
            if (prevFast > prevSlow && currFast < currSlow) {
              sellSignals.push({
                time: candle.time as any,
                position: 'aboveBar',
                color: '#D32F2F', // Bright red
                shape: 'arrowDown', // Triangle pointing down
                text: 'SELL',
                size: 2,
              });
            }
          }
        }

        // Combine buy and sell signals - will be merged with consolidation markers later
        const allEmaSignals = [...buySignals, ...sellSignals].sort((a, b) => a.time - b.time);

        // Store in ref for later merging with consolidation signals
        emaSignalsRef.current = allEmaSignals;

        console.log(`[SIGNALS] BUY: ${buySignals.length} (POC breakout + above EMAs) | SELL: ${sellSignals.length} (EMA crossover)`);
        if (indicators.adx) {
          console.log(`[FILTER] ADX > ${indicators.adxThreshold} - Strong trend filter enabled`);
        }
        if (buySignals.length > 0) {
          console.log('[BUY SIGNALS]', buySignals.map(s => new Date(s.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })));
        }
        if (sellSignals.length > 0) {
          console.log('[SELL SIGNALS]', sellSignals.map(s => new Date(s.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })));
        }
      }
    } else {
      // Remove signal-related series and clear EMA markers when disabled
      emaSignalsRef.current = [];

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

    // Volume Profile - Visible Range Only
    if (indicators.volumeProfileVisible && data.length > 0 && mainChartInstanceRef.current && visibleRangeRef.current) {
      // Get visible time range
      const { from, to } = visibleRangeRef.current;

      // Filter data to visible range only
      const visibleData = data.filter(d => d.time >= from && d.time <= to);

      if (visibleData.length > 10) {
        console.log('[VP-VISIBLE] Calculating for visible range:', {
          totalCandles: data.length,
          visibleCandles: visibleData.length,
          dateRange: {
            from: new Date(from * 1000).toISOString(),
            to: new Date(to * 1000).toISOString(),
          },
        });

        // Calculate volume profile for visible range only
        const volumeProfileVisibleResult = calculateVolumeProfile(
          visibleData,
          indicators.volumeProfileBins || 50,
          0.70
        );

        // Store for histogram rendering
        setVolumeProfileVisibleData(volumeProfileVisibleResult);

        // Get top 5 bars by volume
        const top5BarsVisible = [...volumeProfileVisibleResult.profile]
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 5)
          .map((bar, i) => `${i + 1}. Price ${bar.price.toFixed(2)}: Volume ${bar.volume.toFixed(0)}`);

        console.log('[VP-VISIBLE] Top 5 bars:', top5BarsVisible);
        console.log(`[VP-VISIBLE] POC: ${volumeProfileVisibleResult.poc.toFixed(2)}`);

        // Add POC, VA High, VA Low as price lines (in different color - blue)
        if (candlestickSeriesRef.current) {
          // Remove old visible VP price lines if they exist
          if (pocLineVisibleRef.current) {
            try {
              candlestickSeriesRef.current.removePriceLine(pocLineVisibleRef.current);
              pocLineVisibleRef.current = null;
            } catch (e) {
              console.warn('Error removing visible POC price line:', e);
            }
          }
          if (valueAreaHighLineVisibleRef.current) {
            try {
              candlestickSeriesRef.current.removePriceLine(valueAreaHighLineVisibleRef.current);
              valueAreaHighLineVisibleRef.current = null;
            } catch (e) {
              console.warn('Error removing visible VA High price line:', e);
            }
          }
          if (valueAreaLowLineVisibleRef.current) {
            try {
              candlestickSeriesRef.current.removePriceLine(valueAreaLowLineVisibleRef.current);
              valueAreaLowLineVisibleRef.current = null;
            } catch (e) {
              console.warn('Error removing visible VA Low price line:', e);
            }
          }

          // Add POC (Point of Control) line - blue for visible range
          pocLineVisibleRef.current = candlestickSeriesRef.current.createPriceLine({
            price: volumeProfileVisibleResult.poc,
            color: '#2196F3', // Blue
            lineWidth: 2,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: 'POC-V',
          });

          // Add Value Area High line - blue dashed
          valueAreaHighLineVisibleRef.current = candlestickSeriesRef.current.createPriceLine({
            price: volumeProfileVisibleResult.valueAreaHigh,
            color: '#64B5F6', // Light blue
            lineWidth: 2,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: 'VA-V High',
          });

          // Add Value Area Low line - blue dashed
          valueAreaLowLineVisibleRef.current = candlestickSeriesRef.current.createPriceLine({
            price: volumeProfileVisibleResult.valueAreaLow,
            color: '#64B5F6', // Light blue
            lineWidth: 2,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: 'VA-V Low',
          });
        }
      }
    } else if (!indicators.volumeProfileVisible) {
      // Remove visible range volume profile when disabled
      setVolumeProfileVisibleData(null);

      if (pocLineVisibleRef.current && candlestickSeriesRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(pocLineVisibleRef.current);
          pocLineVisibleRef.current = null;
        } catch (e) {
          console.warn('Error removing visible POC price line:', e);
        }
      }
      if (valueAreaHighLineVisibleRef.current && candlestickSeriesRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(valueAreaHighLineVisibleRef.current);
          valueAreaHighLineVisibleRef.current = null;
        } catch (e) {
          console.warn('Error removing visible VA High price line:', e);
        }
      }
      if (valueAreaLowLineVisibleRef.current && candlestickSeriesRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(valueAreaLowLineVisibleRef.current);
          valueAreaLowLineVisibleRef.current = null;
        } catch (e) {
          console.warn('Error removing visible VA Low price line:', e);
        }
      }
    }

    // Calculate consolidation boxes and breakouts - DISABLED
    if (false && indicators.showConsolidation) {
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
      // IMPORTANT: Merge with existing EMA markers instead of overwriting
      if (candlestickSeriesRef.current) {
        const breakoutMarkers = breakouts.map(signal => ({
          time: signal.time as any,
          position: signal.type === 'bullish' ? 'belowBar' : 'aboveBar',
          color: signal.type === 'bullish' ? '#00C853' : '#FF3D00',
          shape: signal.type === 'bullish' ? 'arrowUp' : 'arrowDown',
          text: `${signal.type === 'bullish' ? 'BUY' : 'SELL'}@${signal.breakoutPrice.toFixed(2)}${signal.volumeConfirmed ? '✓' : ''}`,
          size: 3, // Larger size for visibility
        }));

        // Get EMA markers from ref (set earlier in this useEffect)
        const emaMarkers = emaSignalsRef.current || [];

        // Combine EMA markers + Consolidation markers
        const allMarkers = [...emaMarkers, ...breakoutMarkers];

        console.log(`[MARKERS] Setting ${allMarkers.length} total markers (${emaMarkers.length} EMA + ${breakoutMarkers.length} consolidation)`);

        candlestickSeriesRef.current.setMarkers(allMarkers);
      }
    } else {
      setConsolidationBoxes([]);
      setBreakoutSignals([]);

      // If consolidation disabled but EMA signals exist, set them
      if (candlestickSeriesRef.current && emaSignalsRef.current.length > 0) {
        candlestickSeriesRef.current.setMarkers(emaSignalsRef.current);
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
                  // Use TradingView's price-to-coordinate API for accurate positioning
                  const yCoord = candlestickSeriesRef.current?.priceToCoordinate(row.price);

                  // Skip if price is outside visible range
                  if (yCoord === null || yCoord === undefined) {
                    return null;
                  }

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

        {/* Volume Profile Histogram - Visible Range (on right side in green) */}
        {indicators.volumeProfileVisible && volumeProfileVisibleData && mainChartInstanceRef.current && (
          <div
            className="absolute top-0 pointer-events-none z-50"
            style={{
              right: isMobile ? '35px' : '70px', // Start from right price axis line
              width: isMobile ? '100px' : '200px',
              height: indicators.rsi ? height - (isMobile ? 100 : 120) - 30 : height,
            }}
          >
            {(() => {
              // Get price range from profile
              const prices = volumeProfileVisibleData.profile.map((r: any) => r.price);
              const minPrice = Math.min(...prices);
              const maxPrice = Math.max(...prices);
              const priceRange = maxPrice - minPrice;
              const chartHeight = indicators.rsi ? height - (isMobile ? 100 : 120) - 30 : height;
              const maxVolume = Math.max(...volumeProfileVisibleData.profile.map((r: any) => r.volume));

              console.log('[VP-VISIBLE] Rendering:', {
                minPrice: minPrice.toFixed(2),
                maxPrice: maxPrice.toFixed(2),
                priceRange: priceRange.toFixed(2),
                chartHeight,
                barCount: volumeProfileVisibleData.profile.length,
                poc: volumeProfileVisibleData.poc.toFixed(2),
              });

              return volumeProfileVisibleData.profile.map((row: any, index: number) => {
                try {
                  // Use TradingView's price-to-coordinate API for accurate positioning
                  const yCoord = candlestickSeriesRef.current?.priceToCoordinate(row.price);

                  // Skip if price is outside visible range
                  if (yCoord === null || yCoord === undefined) {
                    return null;
                  }

                  // Calculate bar width (responsive for mobile) - extend outward to the right
                  const maxBarWidth = isMobile ? 60 : 120;
                  const barWidth = Math.max(2, (row.volume / maxVolume) * maxBarWidth);

                  // Check if this is in the value area
                  const isInValueArea = row.price >= volumeProfileVisibleData.valueAreaLow &&
                                        row.price <= volumeProfileVisibleData.valueAreaHigh;

                  // Check if this is POC
                  const isPOC = Math.abs(row.price - volumeProfileVisibleData.poc) < (volumeProfileVisibleData.poc * 0.001);

                  return (
                    <div
                      key={index}
                      className="absolute"
                      style={{
                        top: yCoord + 'px',
                        left: '0px', // Start from price axis line and extend outward to the right
                        width: barWidth + 'px',
                        height: isMobile ? '1.5px' : '2px',
                        backgroundColor: isPOC
                          ? '#2196F3' // Blue for visible POC
                          : isInValueArea
                            ? 'rgba(76, 175, 80, 0.9)' // Green for visible VA
                            : 'rgba(156, 163, 175, 0.7)', // Gray for rest
                        boxShadow: isPOC ? '0 0 4px rgba(33,150,243,1)' : 'none',
                      }}
                    />
                  );
                } catch (e) {
                  console.error('[VP-VISIBLE] Error rendering bar:', e);
                  return null;
                }
              });
            })()}
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
              {false && smcPD && (
                <>
                  {/* Premium Zone (above 50%) */}
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{
                      left: '70px',
                      right: '70px',
                      top: priceToY(smcPD!.high) + 'px',
                      height: (priceToY(smcPD!.equilibrium) - priceToY(smcPD!.high)) + 'px',
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
                      top: priceToY(smcPD!.equilibrium) + 'px',
                      height: '2px',
                      backgroundColor: 'rgba(16, 185, 129, 0.8)', // Green for equilibrium
                    }}
                  >
                    <span className="text-xs text-green-600 font-bold ml-2 bg-white px-1">EQ: {smcPD!.equilibrium.toFixed(2)}</span>
                  </div>

                  {/* Discount Zone (below 50%) */}
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{
                      left: '70px',
                      right: '70px',
                      top: priceToY(smcPD!.equilibrium) + 'px',
                      height: (priceToY(smcPD!.low) - priceToY(smcPD!.equilibrium)) + 'px',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)', // Green tint for discount
                      borderBottom: '1px dashed rgba(34, 197, 94, 0.5)',
                    }}
                  >
                    <span className="text-xs text-green-600 font-bold ml-2">DISCOUNT</span>
                  </div>
                </>
              )}

              {/* Support/Resistance Levels */}
              {false && smcSR.map((level, idx) => (
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
              {false && smcOrderBlocks.map((ob, idx) => {
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
              {false && smcFVG.map((fvg, idx) => {
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

              {/* Consolidation Box Lines - HIDDEN (feature disabled) */}
              {false && indicators.showConsolidation && consolidationBoxes.map((box, idx) => {
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

              {/* Breakout Target Price Labels - HIDDEN (feature disabled) */}
              {false && indicators.showConsolidation && breakoutSignals.map((signal, idx) => {
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

        {/* Consolidation Info Badge - HIDDEN (feature disabled) */}
        {false && indicators.showConsolidation && (consolidationBoxes.length > 0 || breakoutSignals.length > 0) && (
          <div
            className="absolute top-2 left-2 px-3 py-2 bg-gradient-to-r from-red-500 to-green-600 text-white rounded-lg shadow-lg z-50 pointer-events-none"
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

        {/* SMC Info Badge - DISABLED */}
        {false && (
          <div
            className="absolute bottom-2 left-2 px-3 py-2 bg-gradient-to-r from-orange-500 to-purple-600 text-white rounded-lg shadow-lg z-50 pointer-events-none"
            style={{ fontSize: isMobile ? '10px' : '12px' }}
          >
            <div className="font-bold mb-1">🎓 SMC Active</div>
            {smcFVG.length > 0 && (
              <div className="text-xs">FVG: {smcFVG.length} gaps</div>
            )}
            {smcOrderBlocks.length > 0 && (
              <div className="text-xs">OB: {smcOrderBlocks.length} blocks</div>
            )}
            {smcSR.length > 0 && (
              <div className="text-xs">S/R: {smcSR.length} levels</div>
            )}
            {smcPD && (
              <div className="text-xs">P/D: {smcPD!.equilibrium.toFixed(2)}</div>
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

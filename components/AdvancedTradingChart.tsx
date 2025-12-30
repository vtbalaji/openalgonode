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
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { SMA, EMA, RSI } from 'technicalindicators';

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
  
  const mainChartInstanceRef = useRef<IChartApi | null>(null);
  const rsiChartInstanceRef = useRef<IChartApi | null>(null);
  
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Initialize charts
  useEffect(() => {
    if (!mainChartRef.current) return;

    const mainChart = createChart(mainChartRef.current, {
      width: mainChartRef.current.clientWidth,
      height: indicators.rsi ? height - 150 : height,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#d1d4dc' },
      timeScale: {
        borderColor: '#d1d4dc',
        timeVisible: true,
        secondsVisible: false,
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
        height: 120,
        layout: {
          background: { color: '#ffffff' },
          textColor: '#333',
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
      upperBand.setData(data.map(d => ({ time: d.time, value: 70 })));

      const lowerBand = rsiChart.addLineSeries({
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: 2,
      });
      lowerBand.setData(data.map(d => ({ time: d.time, value: 30 })));

      // Sync time scales
      mainChart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
        rsiChart.timeScale().setVisibleRange(timeRange as any);
      });

      rsiChart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
        mainChart.timeScale().setVisibleRange(timeRange as any);
      });
    }

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
      if (mainChartInstanceRef.current) mainChartInstanceRef.current.remove();
      if (rsiChartInstanceRef.current) rsiChartInstanceRef.current.remove();
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
      if (smaSeriesRef.current) {
        mainChartInstanceRef.current.removeSeries(smaSeriesRef.current);
      }

      const smaValues = SMA.calculate({ period: indicators.smaPeriod, values: closePrices });
      const smaSeries = mainChartInstanceRef.current.addLineSeries({
        color: '#2196F3',
        lineWidth: 2,
        title: 'SMA(' + indicators.smaPeriod + ')',
      });

      const smaData = smaValues.map((value, index) => ({
        time: data[index + indicators.smaPeriod - 1].time,
        value: value,
      }));

      smaSeries.setData(smaData);
      smaSeriesRef.current = smaSeries;
    }

    // EMA
    if (indicators.ema && data.length >= indicators.emaPeriod && mainChartInstanceRef.current) {
      if (emaSeriesRef.current) {
        mainChartInstanceRef.current.removeSeries(emaSeriesRef.current);
      }

      const emaValues = EMA.calculate({ period: indicators.emaPeriod, values: closePrices });
      const emaSeries = mainChartInstanceRef.current.addLineSeries({
        color: '#FF9800',
        lineWidth: 2,
        title: 'EMA(' + indicators.emaPeriod + ')',
      });

      const emaData = emaValues.map((value, index) => ({
        time: data[index + indicators.emaPeriod - 1].time,
        value: value,
      }));

      emaSeries.setData(emaData);
      emaSeriesRef.current = emaSeries;
    }

    // RSI
    if (indicators.rsi && data.length >= indicators.rsiPeriod && rsiSeriesRef.current) {
      const rsiValues = RSI.calculate({ period: indicators.rsiPeriod, values: closePrices });
      const rsiData = rsiValues.map((value, index) => ({
        time: data[index + indicators.rsiPeriod].time,
        value: value,
      }));

      rsiSeriesRef.current.setData(rsiData);
    }

    // Fit content
    if (mainChartInstanceRef.current) {
      mainChartInstanceRef.current.timeScale().fitContent();
    }
  }, [data, indicators]);

  return (
    <div className="w-full">
      <div ref={mainChartRef} className="border border-gray-200 rounded-t-lg" />
      {indicators.rsi && (
        <div ref={rsiChartRef} className="border border-t-0 border-gray-200 rounded-b-lg" />
      )}
    </div>
  );
}

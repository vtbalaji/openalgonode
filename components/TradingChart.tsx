/**
 * TradingView Lightweight Charts Component
 * Displays candlestick chart with indicators
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickSeriesPartialOptions } from 'lightweight-charts';
import { SMA } from 'technicalindicators';

export interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingChartProps {
  data: ChartData[];
  symbol: string;
  interval: string;
  showSMA?: boolean;
  smaPeriod?: number;
  height?: number;
}

export function TradingChart({
  data,
  symbol,
  interval,
  showSMA = true,
  smaPeriod = 20,
  height = 500,
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
      },
      timeScale: {
        borderColor: '#d1d4dc',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    volumeSeriesRef.current = volumeSeries;

    // Configure volume scale
    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [height]);

  // Update data when it changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current || !data || data.length === 0) {
      return;
    }

    // Set candlestick data
    candlestickSeriesRef.current.setData(data);

    // Set volume data
    const volumeData = data.map((d) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? '#26a69a80' : '#ef535080',
    }));
    volumeSeriesRef.current.setData(volumeData);

    // Calculate and add SMA if enabled
    if (showSMA && data.length >= smaPeriod) {
      const closePrices = data.map((d) => d.close);
      const smaValues = SMA.calculate({ period: smaPeriod, values: closePrices });

      // Remove old SMA series if exists
      if (smaSeriesRef.current && chartRef.current) {
        chartRef.current.removeSeries(smaSeriesRef.current);
      }

      // Add new SMA series
      if (chartRef.current) {
        const smaSeries = chartRef.current.addLineSeries({
          color: '#2196F3',
          lineWidth: 2,
          title: 'SMA ' + smaPeriod,
        });

        const smaData = smaValues.map((value, index) => ({
          time: data[index + smaPeriod - 1].time,
          value: value,
        }));

        smaSeries.setData(smaData);
        smaSeriesRef.current = smaSeries;
      }
    }

    // Fit content
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data, showSMA, smaPeriod]);

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{symbol}</h2>
          <p className="text-sm text-gray-600">
            Interval: <span className="font-semibold">{interval}</span>
            {showSMA && (
              <span className="ml-4">
                SMA: <span className="font-semibold text-blue-600">{smaPeriod}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-xs text-green-700">Bullish</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-red-50 rounded">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span className="text-xs text-red-700">Bearish</span>
          </div>
        </div>
      </div>
      <div ref={chartContainerRef} className="border border-gray-200 rounded-lg shadow-sm" />
    </div>
  );
}

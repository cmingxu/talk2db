import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface Props {
  option: EChartsOption;
  height?: number;
}

/** Lightweight ECharts wrapper with a configurable height (no extra chrome).
 * Re-measures on container resize (e.g. opening inside a modal) via
 * ResizeObserver + a first-paint rAF. */
export default function EChart({ option, height = 280 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el);
    chart.setOption(option);
    chartRef.current = chart;

    // The container may not have its final size yet (e.g. modal just opened),
    // so re-measure right after the first paint.
    const raf = requestAnimationFrame(() => chart.resize());

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [option]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}

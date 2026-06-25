import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { BarChart3 } from 'lucide-react';

interface Props {
  config: Record<string, unknown>;
}

export default function EChartsBlock({ config }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current);
    chart.setOption(config as echarts.EChartsOption);
    chartRef.current = chart;

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [config]);

  return (
    <div className="border border-purple-200 bg-purple-50/30 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border-b border-purple-100">
        <BarChart3 className="h-3.5 w-3.5 text-purple-600" />
        <span className="text-xs font-medium text-purple-700">图表</span>
      </div>
      <div className="p-2 bg-white">
        <div ref={containerRef} style={{ width: '100%', height: 360 }} />
      </div>
    </div>
  );
}

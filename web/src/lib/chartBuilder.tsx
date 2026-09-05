import type { EChartsOption } from 'echarts';
import type { ChartType } from '../api/panels';

export interface ChartTheme {
  label: string;
  colors: string[];
}

/** Color palettes for dashboard charts. */
export const CHART_THEMES: Record<string, ChartTheme> = {
  default: { label: '默认', colors: ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'] },
  ocean: { label: '海洋', colors: ['#0ea5e9', '#22d3ee', '#6366f1', '#14b8a6', '#38bdf8', '#818cf8'] },
  forest: { label: '森林', colors: ['#22c55e', '#84cc16', '#0d9488', '#65a30d', '#16a34a', '#4ade80'] },
  sunset: { label: '日落', colors: ['#f97316', '#f43f5e', '#f59e0b', '#e11d48', '#fb7185', '#fbbf24'] },
  mono: { label: '黑白', colors: ['#64748b', '#94a3b8', '#475569', '#cbd5e1', '#334155', '#e2e8f0'] },
};

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: '柱状图',
  pie: '饼图',
  line: '折线图',
  text: '文本',
  scatter: '散点图',
  'bar-stack': '堆叠柱状图',
};

function themeColors(theme: string): string[] {
  return (CHART_THEMES[theme] || CHART_THEMES.default).colors;
}

/**
 * Builds an ECharts option from a SQL result (columns + rows) for
 * bar/pie/line panels. Returns null for the "text" type.
 */
export function sqlToChartOption(
  columns: string[],
  rows: string[][],
  chartType: Exclude<ChartType, 'text'>,
  theme: string,
): EChartsOption | null {
  if (!columns || columns.length === 0 || !rows || rows.length === 0) return null;
  const colors = themeColors(theme);

  if (chartType === 'pie') {
    const data = rows
      .map(r => ({ name: r[0], value: Number(r[1]) }))
      .filter(d => Number.isFinite(d.value));
    if (data.length === 0) return null;
    return {
      color: colors,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { type: 'scroll', bottom: 0, left: 'center' },
      series: [
        {
          type: 'pie',
          radius: ['32%', '62%'],
          center: ['50%', '46%'],
          data,
          label: { formatter: '{b}: {d}%' },
          emphasis: { label: { show: true, fontWeight: 'bold' } },
        },
      ],
    };
  }

  // bar / line / bar-stack: first column = categories, remaining columns = series
  const labels = rows.map(r => r[0]);
  const seriesCols = columns.slice(1);
  const stacked = chartType === 'bar-stack';
  const effectiveType = stacked ? 'bar' : chartType;
  const series =
    seriesCols.length > 0
      ? seriesCols.map((col, ci) => {
          const idx = ci + 1;
          return {
            name: col,
            type: effectiveType,
            stack: stacked ? 'total' : undefined,
            emphasis: stacked ? { focus: 'series' as const } : undefined,
            data: rows.map(r => {
              const v = Number(r[idx]);
              return Number.isFinite(v) ? v : 0;
            }),
          };
        })
      : [
          {
            name: columns[0],
            type: effectiveType,
            stack: stacked ? 'total' : undefined,
            data: rows.map(r => {
              const v = Number(r[0]);
              return Number.isFinite(v) ? v : 0;
            }),
          },
        ];

  return {
    color: colors,
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', bottom: 0, left: 'center' },
    grid: { left: 8, right: 16, top: 28, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, rotate: labels.length > 8 ? 30 : 0 } },
    yAxis: { type: 'value' },
    series: series as EChartsOption['series'],
  };
}

/** Builds a scatter option: col0 = X, remaining columns = Y series. */
export function sqlToScatterOption(columns: string[], rows: string[][], theme: string): EChartsOption | null {
  if (!columns || columns.length === 0 || !rows || rows.length === 0) return null;
  const colors = themeColors(theme);
  const seriesCols = columns.slice(1);
  const mkSeries = (col: string, idx: number) => ({
    name: col,
    type: 'scatter' as const,
    data: rows
      .map(r => [Number(r[0]), Number(r[idx])])
      .filter(p => p.every(v => Number.isFinite(v))),
  });
  const series = seriesCols.length > 0
    ? seriesCols.map((col, ci) => mkSeries(col, ci + 1))
    : [{ name: columns[0], type: 'scatter' as const, data: rows.map((r, i) => [i, Number(r[0])]).filter(p => Number.isFinite(p[1])) }];
  if (series.every(s => s.data.length === 0)) return null;
  return {
    color: colors,
    tooltip: { trigger: 'item', formatter: '{b}: ({c})' },
    legend: { type: 'scroll', bottom: 0, left: 'center' },
    grid: { left: 8, right: 16, top: 28, bottom: 40, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: series as EChartsOption['series'],
  };
}

/** Renders a text panel: single-row becomes a big KPI, otherwise a compact table. */
export function renderTextPanel(columns: string[], rows: string[][]) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-muted-foreground">无数据</p>;
  }
  if (rows.length === 1) {
    // KPI: prefer the last numeric-looking column with its name as label
    let valueIdx = columns.length - 1;
    let value = rows[0][valueIdx];
    if (!Number.isFinite(Number(value)) && valueIdx > 0) {
      valueIdx = 0;
      value = rows[0][0];
    }
    const label = columns[valueIdx];
    return (
      <div className="flex h-full flex-col items-center justify-center py-4">
        <div className="text-3xl font-bold text-foreground">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{label}</div>
      </div>
    );
  }
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            {columns.map((col, i) => (
              <th key={i} className="text-left px-3 py-2 font-medium text-muted-foreground border-b whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 border-b border-gray-100 whitespace-nowrap max-w-64 overflow-hidden text-ellipsis">
                  {cell === 'NULL' ? <span className="text-muted-foreground italic">NULL</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

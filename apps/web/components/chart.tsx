'use client';
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, DatasetComponent, MarkLineComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Table2, BarChart3 } from 'lucide-react';
import { Empty } from './ui/card';

echarts.use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, DatasetComponent, MarkLineComponent, TitleComponent, CanvasRenderer]);

/**
 * Validated categorical palette (dataviz reference instance, light mode), assigned in FIXED order
 * and never cycled. Colour follows the entity (see SERIES_COLOR) – never its rank.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SERIES_COLOR: Record<string, string> = { GROSIR: SERIES[0], HORECA: SERIES[1], REGULER: SERIES[2], COMPANY: SERIES[0], COMPETITOR: SERIES[1] };
export const STATUS_COLOR = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
const INK = { primary: '#111827', secondary: '#4b5563', muted: '#6b7280', grid: '#eef1f5', axis: '#d6dbe4' };

export const baseOption = (): echarts.EChartsCoreOption => ({
  textStyle: { fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: INK.secondary, fontSize: 11 },
  grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
  tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: INK.axis } }, backgroundColor: '#fff', borderColor: '#e2e6ee', textStyle: { color: INK.primary, fontSize: 12 }, confine: true },
  legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: INK.secondary, fontSize: 11 } },
  xAxis: { axisLine: { lineStyle: { color: INK.axis } }, axisTick: { show: false }, axisLabel: { color: INK.muted }, splitLine: { show: false } },
  yAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK.muted }, splitLine: { lineStyle: { color: INK.grid } } },
});

function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  return out;
}

/**
 * ECharts wrapper: resize-aware, hover tooltip by default, and a table view toggle so the data is
 * never available through colour alone (accessibility pass).
 */
export function Chart({ option, height = 260, table, ariaLabel, empty }: { option: echarts.EChartsCoreOption; height?: number; table?: { columns: string[]; rows: (string | number | null)[][] }; ariaLabel: string; empty?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const [showTable, setShowTable] = useState(false);
  useEffect(() => {
    if (!ref.current || showTable || empty) return;
    inst.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); inst.current?.dispose(); inst.current = null; };
  }, [showTable, empty]);
  useEffect(() => { inst.current?.setOption(merge(baseOption() as Record<string, unknown>, option as Record<string, unknown>), true); }, [option, showTable, empty]);
  if (empty) return <div style={{ height }} className="flex items-center"><div className="w-full"><Empty title="No data for this filter" /></div></div>;
  return <div className="relative">
    {table && <button type="button" onClick={() => setShowTable((s) => !s)} className="no-print absolute right-0 top-0 z-10 rounded p-1 text-ink-muted hover:bg-surface hover:text-ink" aria-label={showTable ? 'Show chart' : 'Show data table'} title={showTable ? 'Show chart' : 'Show data table'}>
      {showTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}</button>}
    {showTable && table ? <div style={{ maxHeight: height }} className="overflow-auto pt-6"><table className="w-full text-xs"><thead><tr>{table.columns.map((c) => <th key={c} className="px-2 py-1 text-left font-semibold text-ink-muted">{c}</th>)}</tr></thead>
      <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((v, j) => <td key={j} className={j ? 'num px-2 py-1 text-right' : 'px-2 py-1'}>{v ?? '–'}</td>)}</tr>)}</tbody></table></div>
      : <div ref={ref} role="img" aria-label={ariaLabel} style={{ height }} className="w-full" />}
  </div>;
}

/** Bar spec: thin bars, 4px rounded data-end, 2px surface gap between fills. */
export const barSeries = (name: string, data: unknown[], color: string, extra: Record<string, unknown> = {}) => ({
  type: 'bar', name, data, barMaxWidth: 22, itemStyle: { color, borderRadius: [4, 4, 0, 0], borderColor: '#fff', borderWidth: 1 }, emphasis: { focus: 'series' }, ...extra,
});
export const lineSeries = (name: string, data: unknown[], color: string, extra: Record<string, unknown> = {}) => ({
  type: 'line', name, data, smooth: false, showSymbol: false, symbolSize: 8, lineStyle: { width: 2, color }, itemStyle: { color, borderColor: '#fff', borderWidth: 2 }, ...extra,
});

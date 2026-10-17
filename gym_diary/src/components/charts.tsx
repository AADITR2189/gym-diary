import type { ReactNode } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Cell, ComposedChart } from 'recharts';
import { fmtNum } from '../lib/stats';
import { usePalette, type Palette } from '../lib/theme';
import { Card } from './ui';
import { prefersReducedMotion, useInView } from '../lib/anim';

// Each chart is single-series in one hue (strength = green, cardio = blue, ...), so identity
// never depends on colour alone: the chart title names the series and the axis names categories.
export type Series = 'strength' | 'cardio' | 'gold' | 'rose' | 'ink' | 'water';
const color = (p: Palette, s: Series) => (s === 'ink' ? p.ink : p[s]);
/** Short axis labels so ticks never clip: 9000 -> 9k, 13500 -> 13.5k. */
const axisNum = (v: number) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${+v.toFixed(1)}`);

function useTooltip() {
  const p = usePalette();
  return {
    contentStyle: {
      background: p.surface,
      border: `1px solid ${p.line}`,
      borderRadius: 8,
      color: p.ink,
      fontSize: 13,
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    },
    labelStyle: { color: p.muted, marginBottom: 2 },
    itemStyle: { color: p.ink, padding: 0 },
    cursor: { fill: p.line, fillOpacity: 0.4, stroke: p.muted, strokeDasharray: '3 3' },
  };
}

export function ChartCard({
  title,
  sub,
  children,
  right,
  index,
}: {
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  index?: number;
}) {
  // Mount the chart only when it scrolls into view, so its grow-in animation is actually seen.
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <Card index={index}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="h-title text-xl">{title}</div>
          {sub && <div className="text-xs text-muted">{sub}</div>}
        </div>
        {right}
      </div>
      <div ref={ref} className="min-h-[120px]">
        {inView ? children : null}
      </div>
    </Card>
  );
}

/** Shared grow-in for bars and lines: quick, so the numbers are readable almost at once; off under reduced motion. */
const GROW = { isAnimationActive: !prefersReducedMotion(), animationDuration: 350, animationEasing: 'ease-out' as const };

export function TrendBars({
  data,
  dataKey,
  series,
  unit,
  height = 180,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  series: Series;
  unit: string;
  height?: number;
}) {
  const p = usePalette();
  const tip = useTooltip();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={p.line} />
        <XAxis dataKey="label" tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={axisNum} width={44} />
        <Tooltip {...tip} formatter={(v) => [`${fmtNum(Number(v), 1)} ${unit}`, '']} separator="" />
        <Bar dataKey={dataKey} fill={color(p, series)} radius={[4, 4, 0, 0]} maxBarSize={26} {...GROW} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({
  data,
  dataKey,
  series,
  unit,
  xKey = 'label',
  height = 200,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  series: Series;
  unit: string;
  xKey?: string;
  height?: number;
}) {
  const p = usePalette();
  const tip = useTooltip();
  const c = color(p, series);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={p.line} />
        <XAxis dataKey={xKey} tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={axisNum} width={44} domain={['auto', 'auto']} />
        <Tooltip {...tip} formatter={(v) => [`${fmtNum(Number(v), 1)} ${unit}`, '']} separator="" />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={c}
          strokeWidth={2}
          {...GROW}
          dot={{ r: 4, fill: c, stroke: p.surface, strokeWidth: 2 }}
          activeDot={{ r: 6, stroke: p.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bars with the category name on the axis — readable for 10+ categories on a phone. */
export function RankBars({ data, series, unit }: { data: { name: string; value: number }[]; series: Series; unit: string }) {
  const p = usePalette();
  const tip = useTooltip();
  const height = Math.max(120, data.length * 34);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 52, left: 0, bottom: 0 }} barCategoryGap={7}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={112} tick={{ fill: p.ink, fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip {...tip} formatter={(v) => [`${fmtNum(Number(v), 1)} ${unit}`, '']} separator="" />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} {...GROW} label={{ position: 'right', fill: p.muted, fontSize: 11, formatter: (v: unknown) => fmtNum(Number(v)) }}>
          {data.map((d) => (
            <Cell key={d.name} fill={color(p, series)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Daily water bars against that day's target (dashed line). Days that met the target are
 * full-strength; days below it are lighter, and the tooltip spells out both numbers.
 */
export function WaterBars({
  data,
  fmt,
  height = 200,
}: {
  data: { label: string; ml: number; target: number; met: boolean }[];
  fmt: (ml: number) => string;
  height?: number;
}) {
  const p = usePalette();
  const tip = useTooltip();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={p.line} />
        <XAxis dataKey="label" tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} />
        <YAxis tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${+(v / 1000).toFixed(1)}L`} width={44} />
        <Tooltip
          {...tip}
          formatter={(v, name) => [fmt(Number(v)), name === 'target' ? 'Target' : 'Drank']}
          separator=": "
        />
        <Bar dataKey="ml" name="ml" radius={[4, 4, 0, 0]} maxBarSize={26} {...GROW}>
          {data.map((d, i) => (
            <Cell key={i} fill={p.water} fillOpacity={d.met ? 1 : 0.45} />
          ))}
        </Bar>
        <Line type="stepAfter" dataKey="target" name="target" stroke={p.ink} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

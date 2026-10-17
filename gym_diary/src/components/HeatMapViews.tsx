import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Barbell, Fire, Plus } from '@phosphor-icons/react';
import BodyMap, { type BodyMapMode } from './BodyMap';
import { Card, Chip } from './ui';
import { useData } from '../hooks/useData';
import { EQUIPMENT_LABEL, exerciseMeta, regionInfo, type Region } from '../data/muscles';
import { MUSCLE_GROUPS, type Equipment, type MuscleGroup } from '../types';
import { groupName } from '../data/exercises';
import { exerciseUsage, fmtNum } from '../lib/stats';
import {
  HEAT_GRADIENT_CSS,
  HEAT_RANGES,
  bodyWeightFor,
  heatColor,
  intensities,
  regionStats,
  sessionsInRange,
  sessionsLoads,
  sessionsSetLoads,
  type HeatRange,
  type RegionStat,
} from '../lib/heatmap';
import { formatShort, todayKey } from '../lib/date';

/** Colour scale legend: grey = not trained, then the load gradient. */
export function HeatLegend({ mode = 'heat' }: { mode?: BodyMapMode }) {
  return (
    <div className="flex items-center gap-2 text-[0.6875rem] text-muted">
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-line" /> None
      </span>
      <span>Less</span>
      <span
        className="h-2 flex-1 rounded-full"
        style={{ background: mode === 'heat' ? HEAT_GRADIENT_CSS : 'linear-gradient(90deg, rgb(var(--str) / 0.18), rgb(var(--str)))' }}
      />
      <span>More</span>
    </div>
  );
}

/** Ranked muscle list: name · weight moved · share of total. */
export function MuscleList({
  stats,
  mode = 'heat',
  unit,
  selected,
  onSelect,
  limit,
  format,
}: {
  stats: RegionStat[];
  /** How to show a muscle's load (default: weight in the user's unit). */
  format?: (load: number) => string;
  mode?: BodyMapMode;
  unit: string;
  selected?: Region | null;
  onSelect?: (r: Region) => void;
  limit?: number;
}) {
  const trained = stats.filter((s) => s.load > 0);
  const shown = limit ? trained.slice(0, limit) : trained;
  return (
    <ol className="space-y-1">
      {shown.map((s, i) => (
        <li key={s.region}>
          <button
            onClick={onSelect ? () => onSelect(s.region) : undefined}
            className={`flex w-full items-center gap-2.5 rounded-btn px-2 py-1.5 text-left text-sm ${selected === s.region ? 'bg-raised' : ''} ${onSelect ? 'hover:bg-raised' : 'cursor-default'}`}
          >
            <span className="num w-4 text-right text-xs text-muted">{i + 1}</span>
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: mode === 'heat' ? heatColor(s.intensity) : `rgb(var(--str) / ${(0.18 + 0.82 * s.intensity).toFixed(3)})` }}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
            <span className="num shrink-0 text-muted">
              {format ? format(s.load) : `${fmtNum(Math.round(s.load))} ${unit}`}
            </span>
            <span className="num w-11 shrink-0 text-right font-medium">{s.pct.toFixed(s.pct < 10 ? 1 : 0)}%</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Info line for the tapped muscle. */
export function RegionInfo({ stat, unit, format }: { stat?: RegionStat; unit: string; format?: (load: number) => string }) {
  if (!stat) return <div className="text-sm text-muted">Tap a muscle to see its load.</div>;
  const info = regionInfo(stat.region);
  return (
    <div className="text-sm">
      <div className="font-medium">
        {info.name}
        {groupName(info.group) !== info.name && <span className="font-normal text-muted"> · {groupName(info.group)}</span>}
      </div>
      <div className="num text-muted">
        {stat.load > 0 ? (
          <>
            {format ? format(stat.load) : `${fmtNum(Math.round(stat.load))} ${unit}`} · {stat.pct.toFixed(1)}% of volume
          </>
        ) : (
          'Not trained in this period'
        )}
      </div>
    </div>
  );
}

/** Home-screen heat map with range filter, legend and ranked list. */
export function MuscleHeatCard({ index = 0 }: { index?: number }) {
  const { sessions, measurements, profile, settings } = useData();
  const [range, setRange] = useState<HeatRange>('7');
  const [selected, setSelected] = useState<Region | null>(null);
  const [all, setAll] = useState(false);
  const bw = bodyWeightFor(measurements, profile, settings);
  const list = useMemo(() => sessionsInRange(sessions, range), [sessions, range]);
  const weighted = useMemo(() => sessionsLoads(list, bw), [list, bw]);
  // Nothing has a weight yet (all 0 kg): count sets instead so the map still lights up.
  const bySets = !Object.values(weighted).some((v) => v > 0);
  const loads = useMemo(() => (bySets ? sessionsSetLoads(list) : weighted), [bySets, list, weighted]);
  const fmtSets = bySets ? (n: number) => `${fmtNum(n, 1)} sets` : undefined;
  const stats = useMemo(() => regionStats(loads), [loads]);
  const values = useMemo(() => intensities(loads), [loads]);
  const empty = !stats.some((s) => s.load > 0);
  const unit = settings.weightUnit;

  return (
    <Card index={index}>
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow inline-flex items-center gap-1.5">
          <Fire size={12} weight="fill" /> Muscle heat map
        </div>
        {range === 'last' && list[0] && (
          <Link to={`/session?id=${list[0].id}`} className="text-xs font-medium text-str">
            {formatShort(list[0].date)} · details
          </Link>
        )}
      </div>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5" role="group" aria-label="Heat map period">
        {HEAT_RANGES.map((r) => (
          <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>
            {r.label}
          </Chip>
        ))}
      </div>

      <div className="mt-4 grid items-start gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center">
          <BodyMap values={values} mode="heat" view="both" width={118} selected={selected} onSelect={(r) => setSelected((x) => (x === r ? null : r))} />
          <div className="mt-3 w-full max-w-[260px]">
            <HeatLegend />
          </div>
          {!selected && <p className="mt-2 text-center text-[0.6875rem] text-muted">Tap a muscle to see its load and exercises.</p>}
        </div>
        <div className="min-w-0">
          {empty ? (
            <div className="rounded-btn bg-raised p-4 text-sm text-muted">
              No strength workouts {range === 'all' ? 'yet' : 'in this period'}. Log one and your muscles light up here.
              {!selected && ' Tap any muscle to see exercises for it.'}
            </div>
          ) : (
            <div className="mb-3 rounded-btn bg-raised px-3 py-2">
              <RegionInfo stat={stats.find((s) => s.region === selected)} unit={unit} format={fmtSets} />
            </div>
          )}
          {selected && <MuscleExercises key={selected} region={selected} />}
          {!empty && (
            <>
              <MuscleList stats={stats} unit={unit} format={fmtSets} selected={selected} onSelect={(r) => setSelected((x) => (x === r ? null : r))} limit={all ? undefined : 6} />
              {stats.filter((s) => s.load > 0).length > 6 && (
                <button onClick={() => setAll(!all)} className="mt-1 px-2 text-sm font-medium text-str">
                  {all ? 'Show less' : 'Show all muscles'}
                </button>
              )}
              <p className="mt-2 px-2 text-[0.6875rem] leading-snug text-muted">
                Weight × reps. Main muscles get the full load, helpers half. Bodyweight moves count part of your body weight.
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

type EquipFilter = 'all' | Equipment;

/** Every exercise (built-in + custom) that trains a muscle: main movers first, then ones where it helps. */
export function MuscleExercises({ region }: { region: Region }) {
  const { library, sessions } = useData();
  const [tab, setTab] = useState<'main' | 'helper'>('main');
  const [equip, setEquip] = useState<EquipFilter>('all');
  const [more, setMore] = useState(false);
  const usage = useMemo(() => new Map(exerciseUsage(sessions).map((u) => [u.exercise, u.count])), [sessions]);
  const lists = useMemo(() => {
    const seen = new Set<string>();
    const main: { name: string; group: MuscleGroup; equipment: Equipment }[] = [];
    const helper: typeof main = [];
    for (const g of MUSCLE_GROUPS)
      for (const name of library[g]) {
        if (seen.has(name)) continue;
        seen.add(name);
        const m = exerciseMeta(name, g);
        if (m.primary.includes(region)) main.push({ name, group: g, equipment: m.equipment });
        else if (m.secondary.includes(region)) helper.push({ name, group: g, equipment: m.equipment });
      }
    // Exercises you already do come first.
    const byUse = (a: { name: string }, b: { name: string }) => (usage.get(b.name) ?? 0) - (usage.get(a.name) ?? 0);
    return { main: main.sort(byUse), helper: helper.sort(byUse) };
  }, [library, region, usage]);

  const list = lists[tab].filter((x) => equip === 'all' || x.equipment === equip);
  const shown = more ? list : list.slice(0, 8);
  const name = regionInfo(region).name;
  const today = todayKey();

  return (
    <div className="mb-4 rounded-btn border border-line p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Barbell size={14} weight="bold" className="text-str" /> Exercises for {name.toLowerCase()}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5" role="group" aria-label="Exercise role">
        <Chip active={tab === 'main'} onClick={() => setTab('main')} className="px-2 text-xs">
          Main mover · {lists.main.length}
        </Chip>
        <Chip active={tab === 'helper'} onClick={() => setTab('helper')} className="px-2 text-xs">
          Also works it · {lists.helper.length}
        </Chip>
      </div>
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto" role="group" aria-label="Equipment filter">
        {(['all', 'machine', 'free', 'bodyweight'] as EquipFilter[]).map((e) => (
          <button
            key={e}
            onClick={() => setEquip(e)}
            aria-pressed={equip === e}
            className={`h-7 shrink-0 rounded-full border px-2.5 text-xs ${equip === e ? 'border-str bg-str-soft font-medium text-str' : 'border-line text-muted'}`}
          >
            {e === 'all' ? 'All' : EQUIPMENT_LABEL[e]}
          </button>
        ))}
      </div>
      <ul className="mt-2 divide-y divide-line">
        {shown.map((x) => {
          const n = usage.get(x.name);
          return (
            <li key={x.name}>
              <Link
                to={`/log/edit?${new URLSearchParams({ kind: 'strength', date: today, exercise: x.name, group: x.group })}`}
                className="flex min-h-[44px] items-center gap-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{x.name}</span>
                  <span className="block text-[0.6875rem] text-muted">
                    {EQUIPMENT_LABEL[x.equipment]}
                    {n ? ` · done ${n}×` : ''}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-btn bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-ink">
                  <Plus size={12} weight="bold" /> Log
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="py-3 text-center text-xs text-muted">No {equip === 'all' ? '' : EQUIPMENT_LABEL[equip as Equipment].toLowerCase() + ' '}exercises here.</p>}
      {list.length > 8 && (
        <button onClick={() => setMore(!more)} className="mt-1 text-sm font-medium text-str">
          {more ? 'Show less' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}
